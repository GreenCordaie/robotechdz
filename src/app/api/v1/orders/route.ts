import { db } from "@/db";
import { orders, orderItems, productVariants, digitalCodes, digitalCodeSlots } from "@/db/schema";
import { eq, and, count } from "drizzle-orm";
import { authenticateApiKey, checkApiRateLimit, logApiCall } from "@/lib/api-auth";
import { allocateOrderStock } from "@/lib/orders";
import { cacheDel, CACHE_KEYS } from "@/lib/redis";
import { z } from "zod";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const orderBodySchema = z.object({
    variantId: z.number().int().positive(),
    quantity: z.number().int().min(1).max(10),
    partnerReference: z.string().max(100).optional(),
});

export async function POST(request: NextRequest) {
    const start = Date.now();
    const endpoint = "/api/v1/orders";

    const auth = await authenticateApiKey(request);
    if (!auth) {
        return Response.json(
            { error: "Unauthorized", details: "Invalid or revoked API key" },
            { status: 401 }
        );
    }

    const isBlocked = await checkApiRateLimit(auth.keyHash);
    if (isBlocked) {
        logApiCall(auth.apiKey.id, endpoint, "POST", 429, Date.now() - start);
        return Response.json(
            { error: "Too Many Requests" },
            { status: 429, headers: { "Retry-After": "60" } }
        );
    }

    if (auth.apiKey.permissions !== "READ_WRITE") {
        logApiCall(auth.apiKey.id, endpoint, "POST", 403, Date.now() - start);
        return Response.json(
            { error: "Forbidden", details: "This API key requires READ_WRITE permissions" },
            { status: 403 }
        );
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        logApiCall(auth.apiKey.id, endpoint, "POST", 400, Date.now() - start);
        return Response.json({ error: "Bad Request", details: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = orderBodySchema.safeParse(body);
    if (!parsed.success) {
        logApiCall(auth.apiKey.id, endpoint, "POST", 400, Date.now() - start);
        return Response.json(
            { error: "Bad Request", details: parsed.error.flatten().fieldErrors },
            { status: 400 }
        );
    }

    const { variantId, quantity, partnerReference } = parsed.data;

    // Check variant exists and is active (stockStatus = true)
    const variant = await db.query.productVariants.findFirst({
        where: and(eq(productVariants.id, variantId), eq(productVariants.stockStatus, true)),
        with: { product: true },
    });

    if (!variant) {
        logApiCall(auth.apiKey.id, endpoint, "POST", 404, Date.now() - start);
        return Response.json({ error: "Not Found", details: "Variant not found or inactive" }, { status: 404 });
    }

    // Check available stock
    let availableStock = 0;
    if (variant.isSharing) {
        const result = await db
            .select({ cnt: count() })
            .from(digitalCodeSlots)
            .innerJoin(
                digitalCodes,
                and(
                    eq(digitalCodes.id, digitalCodeSlots.digitalCodeId),
                    eq(digitalCodes.variantId, variantId),
                    eq(digitalCodes.status, "DISPONIBLE")
                )
            )
            .where(eq(digitalCodeSlots.status, "DISPONIBLE"));
        availableStock = result[0]?.cnt ?? 0;
    } else {
        const result = await db
            .select({ cnt: count() })
            .from(digitalCodes)
            .where(
                and(
                    eq(digitalCodes.variantId, variantId),
                    eq(digitalCodes.status, "DISPONIBLE")
                )
            );
        availableStock = result[0]?.cnt ?? 0;
    }

    if (availableStock < quantity) {
        logApiCall(auth.apiKey.id, endpoint, "POST", 422, Date.now() - start);
        return Response.json(
            { error: "Unprocessable Entity", details: "Stock insuffisant", availableStock },
            { status: 422 }
        );
    }

    // Generate order number
    const orderNumber = `API-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const totalAmount = (parseFloat(variant.salePriceDzd) * quantity).toFixed(2);
    const apiMeta = JSON.stringify({ apiKeyId: auth.apiKey.id, partnerReference: partnerReference ?? null });

    try {
        const result = await db.transaction(async (tx) => {
            // Insert order
            const [order] = await tx.insert(orders).values({
                orderNumber,
                status: "PAYE",
                totalAmount,
                montantPaye: totalAmount,
                resteAPayer: "0",
                source: "API",
                paymentMethod: apiMeta, // store apiKeyId + partnerReference for ownership check
                isDelivered: false,
                pointsEarned: 0,
            }).returning();

            // Insert order item
            await tx.insert(orderItems).values({
                orderId: order.id,
                variantId,
                name: `${variant.product?.name ?? "Produit"} - ${variant.name}`,
                price: variant.salePriceDzd,
                quantity,
            });

            // Allocate stock
            await allocateOrderStock(tx, order.id, {});

            // Return order with items and codes
            const fullOrder = await tx.query.orders.findFirst({
                where: eq(orders.id, order.id),
                with: {
                    items: {
                        with: {
                            codes: true,
                            slots: true,
                        },
                    },
                },
            });

            return fullOrder;
        });

        // Invalidate caches
        await cacheDel(...CACHE_KEYS.DASHBOARD_ALL, CACHE_KEYS.KIOSK_CATALOGUE);

        if (!result) {
            logApiCall(auth.apiKey.id, endpoint, "POST", 500, Date.now() - start);
            return Response.json({ error: "Internal Server Error" }, { status: 500 });
        }

        const responseDTO = {
            orderId: result.id,
            orderNumber: result.orderNumber,
            status: result.status,
            items: result.items.map((item) => ({
                id: item.id,
                name: item.name,
                quantity: item.quantity,
                price: item.price,
                codes: item.codes.map((c) => ({ id: c.id, code: c.code, status: c.status })),
                slots: item.slots.map((s) => ({
                    id: s.id,
                    slotNumber: s.slotNumber,
                    profileName: s.profileName,
                    code: s.code,
                    status: s.status,
                })),
            })),
        };

        logApiCall(auth.apiKey.id, endpoint, "POST", 201, Date.now() - start);
        return Response.json(responseDTO, { status: 201 });
    } catch (err) {
        console.error("API order creation error:", err);
        logApiCall(auth.apiKey.id, endpoint, "POST", 500, Date.now() - start);
        return Response.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
