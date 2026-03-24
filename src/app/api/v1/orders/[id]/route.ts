import { db } from "@/db";
import { orders } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { authenticateApiKey, checkApiRateLimit, logApiCall } from "@/lib/api-auth";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const start = Date.now();
    const endpoint = `/api/v1/orders/${params.id}`;

    const auth = await authenticateApiKey(request);
    if (!auth) {
        return Response.json(
            { error: "Unauthorized", details: "Invalid or revoked API key" },
            { status: 401 }
        );
    }

    const isBlocked = await checkApiRateLimit(auth.keyHash);
    if (isBlocked) {
        logApiCall(auth.apiKey.id, endpoint, "GET", 429, Date.now() - start);
        return Response.json(
            { error: "Too Many Requests" },
            { status: 429, headers: { "Retry-After": "60" } }
        );
    }

    const orderId = parseInt(params.id, 10);
    if (isNaN(orderId)) {
        logApiCall(auth.apiKey.id, endpoint, "GET", 400, Date.now() - start);
        return Response.json({ error: "Bad Request", details: "Invalid order id" }, { status: 400 });
    }

    const order = await db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.source, "API")),
        with: {
            items: {
                with: {
                    codes: true,
                    slots: true,
                },
            },
        },
    });

    if (!order) {
        logApiCall(auth.apiKey.id, endpoint, "GET", 404, Date.now() - start);
        return Response.json({ error: "Not Found" }, { status: 404 });
    }

    // Verify the order belongs to this API key via paymentMethod field (stores JSON metadata)
    let ownerApiKeyId: number | null = null;
    try {
        const metaData = JSON.parse(order.paymentMethod ?? "{}");
        ownerApiKeyId = metaData.apiKeyId ?? null;
    } catch {
        // paymentMethod may not be JSON
    }

    if (ownerApiKeyId !== auth.apiKey.id) {
        logApiCall(auth.apiKey.id, endpoint, "GET", 404, Date.now() - start);
        return Response.json({ error: "Not Found" }, { status: 404 });
    }

    const responseDTO = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        totalAmount: order.totalAmount,
        createdAt: order.createdAt,
        items: order.items.map((item) => ({
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

    logApiCall(auth.apiKey.id, endpoint, "GET", 200, Date.now() - start);
    return Response.json(responseDTO);
}
