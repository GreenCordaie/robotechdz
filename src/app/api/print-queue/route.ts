/**
 * /api/print-queue
 *
 * GET  → retourne les commandes en attente d'impression (print_status = 'print_pending')
 * PATCH → marque une commande comme imprimée ou en erreur
 *
 * Sécurisé par x-print-secret (partagé avec le service print)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orders, shopSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";
import crypto from "crypto";

const PRINT_SECRET = process.env.PRINT_SECRET;

function checkSecret(req: NextRequest): boolean {
    if (!PRINT_SECRET) return false;
    const provided = req.headers.get("x-print-secret") || "";
    if (!provided) return false;
    try {
        const a = Buffer.from(PRINT_SECRET);
        const b = Buffer.from(provided);
        if (a.length !== b.length) return false;
        return crypto.timingSafeEqual(a, b);
    } catch {
        return false;
    }
}

// ─── GET : retourne les jobs en attente ───────────────────────────────────────
export async function GET(req: NextRequest) {
    if (!checkSecret(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // Fetch pending orders with all required relations
        const pendingOrders = await db.query.orders.findMany({
            where: eq(orders.printStatus, "print_pending"),
            with: {
                client: true,
                reseller: true,
                items: {
                    with: {
                        codes: true,
                        slots: { with: { digitalCode: true } },
                        variant: { with: { product: true } },
                    },
                },
            },
            orderBy: (o, { asc }) => [asc(o.createdAt)],
            limit: 20,
        });

        // Fetch shop settings (one row)
        const settings = await db.query.shopSettings.findFirst();

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:1556";

        // --- NEW: Filter out manual orders that don't have codes yet ---
        const ordersToPrint = pendingOrders.filter((order: any) => {
            const hasCredentials = order.items.some((item: any) =>
                (item.codes && item.codes.length > 0) || (item.slots && item.slots.length > 0)
            );
            const isFullyAuto = order.items.every((item: any) => item.variant?.isAutomatic);

            // Print if:
            // 1. It's fully automatic (codes assigned instantly)
            // 2. OR it's manual but already has credentials assigned
            // 3. OR it's already TERMINE (processed)
            return isFullyAuto || hasCredentials || order.status === "TERMINE";
        });

        // Map each order to PrintData format (with decrypted credentials)
        const jobs = ordersToPrint.map((order: any) => {
            const createdAt = new Date(order.createdAt);

            const items = (order.items || []).map((item: any) => {
                const credentials: { label: string; value: string }[] = [];

                // Standard codes (non-sharing products)
                const standardCodes = (item.codes || []).map((c: any) => decrypt(c.code)).filter(Boolean);
                if (standardCodes.length === 1) {
                    credentials.push({ label: "Code", value: standardCodes[0]! });
                } else {
                    standardCodes.forEach((val: string, idx: number) => {
                        credentials.push({ label: `Code ${idx + 1}`, value: val });
                    });
                }

                // Shared account slots
                (item.slots || []).forEach((s: any, idx: number) => {
                    const parentData = s.digitalCode?.code ? decrypt(s.digitalCode.code) : null;
                    const code = s.code ? decrypt(s.code) : null;
                    const suffix = (item.slots || []).length > 1 ? ` ${idx + 1}` : "";

                    if (parentData && parentData.includes(" | ")) {
                        const [email, pass] = parentData.split(" | ");
                        credentials.push({ label: `Email${suffix}`, value: email.trim() });
                        credentials.push({ label: `Pass${suffix}`, value: pass.trim() });
                    } else if (parentData) {
                        credentials.push({ label: `Accès${suffix}`, value: parentData });
                    }

                    if (s.slotNumber) credentials.push({ label: `Profil${suffix}`, value: String(s.slotNumber) });
                    if (code) credentials.push({ label: `Pin${suffix}`, value: code });
                });

                return {
                    productName: item.variant?.product?.name || item.name || "Article",
                    quantity: item.quantity ?? 1,
                    price: Number(item.price ?? 0),
                    credentials,
                };
            });

            const customerName = order.client?.nomComplet || order.reseller?.name || "Client";
            const customerPhone = order.client?.telephone || order.reseller?.telephone || order.customerPhone || "";

            return {
                _orderId: order.id, // used for ack
                orderNumber: order.orderNumber,
                date: createdAt.toLocaleDateString("fr-FR"),
                time: createdAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
                totalAmount: Number(order.totalAmount ?? 0),
                total: Number(order.totalAmount ?? 0), // Fallback alias 1
                total_amount: Number(order.totalAmount ?? 0), // Fallback alias 2 (snake_case)
                grandTotal: Number(order.totalAmount ?? 0), // Fallback alias 3
                montantTotal: Number(order.totalAmount ?? 0), // Fallback alias 4
                // String variants for safety
                totalStr: String(order.totalAmount ?? 0),
                paymentMethod: order.paymentMethod || undefined,
                customer: { name: customerName, phone: customerPhone },
                trackingUrl: `${appUrl}/suivi/${order.orderNumber}`,
                shop: {
                    name: settings?.shopName || "MA BOUTIQUE",
                    address: settings?.shopAddress || undefined,
                    tel: settings?.shopTel || undefined,
                    logoUrl: settings?.logoUrl || undefined,
                    footerMessage: settings?.footerMessage || undefined,
                    showLogo: settings?.showLogoOnReceipt ?? true,
                    showDateTime: settings?.showDateTimeOnReceipt ?? true,
                    showCashier: settings?.showCashierOnReceipt ?? true,
                    showTrackQr: settings?.showTrackQrOnReceipt ?? true,
                },
                items,
            };
        });

        return NextResponse.json({ jobs });
    } catch (err: any) {
        console.error("[print-queue GET]", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// ─── PATCH : ack (printed) ou fail ────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
    if (!checkSecret(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { orderId, status } = await req.json() as { orderId: number; status: "printed" | "failed" };

        if (!orderId || !["printed", "failed"].includes(status)) {
            return NextResponse.json({ error: "orderId et status requis" }, { status: 400 });
        }

        await db.update(orders)
            .set({ printStatus: status })
            .where(eq(orders.id, orderId));

        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
