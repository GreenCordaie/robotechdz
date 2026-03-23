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

        // Map each order to PrintData format (with decrypted credentials)
        const jobs = pendingOrders.map((order: any) => {
            const createdAt = new Date(order.createdAt);

            const items = (order.items || []).map((item: any) => {
                const credentials: { label: string; value: string }[] = [];

                // Standard codes (non-sharing products)
                (item.codes || []).forEach((c: any) => {
                    const val = decrypt(c.code);
                    if (val) credentials.push({ label: "Code", value: val });
                });

                // Shared account slots (Email → Pass → Profil → Code)
                (item.slots || []).forEach((s: any) => {
                    const parent = s.digitalCode || {};
                    const email = parent.email ? decrypt(parent.email) : null;
                    const pass  = parent.password ? decrypt(parent.password) : null;
                    const code  = s.code ? decrypt(s.code) : null;

                    if (email)         credentials.push({ label: "Email",  value: email });
                    if (pass)          credentials.push({ label: "Pass",   value: pass });
                    if (s.slotNumber)  credentials.push({ label: "Profil", value: String(s.slotNumber) });
                    if (code)          credentials.push({ label: "Code",   value: code });
                });

                return {
                    productName: item.variant?.product?.name || item.name || "Article",
                    quantity:    item.quantity ?? 1,
                    price:       Number(item.price ?? 0),
                    credentials,
                };
            });

            const customerName  = order.client?.nomComplet  || order.reseller?.name  || "Client";
            const customerPhone = order.client?.telephone   || order.reseller?.telephone || order.customerPhone || "";

            return {
                _orderId:      order.id,  // used for ack
                orderNumber:   order.orderNumber,
                date:          createdAt.toLocaleDateString("fr-FR"),
                time:          createdAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
                paymentMethod: order.paymentMethod || undefined,
                customer:      { name: customerName, phone: customerPhone },
                trackingUrl:   `${appUrl}/suivi/${order.orderNumber}`,
                shop: {
                    name:          settings?.shopName         || "MA BOUTIQUE",
                    address:       settings?.shopAddress      || undefined,
                    tel:           settings?.shopTel          || undefined,
                    footerMessage: settings?.footerMessage    || undefined,
                    showDateTime:  settings?.showDateTimeOnReceipt ?? true,
                    showCashier:   settings?.showCashierOnReceipt  ?? true,
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
