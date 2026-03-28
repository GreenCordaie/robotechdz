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
import { orders, clientPayments, shopSettings } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";
import crypto from "crypto";
import { N8nService } from "@/services/n8n.service";

export const dynamic = "force-dynamic";

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
        // Fetch pending orders
        const pendingOrdersPromise = db.query.orders.findMany({
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

        // Fetch pending payments
        const pendingPaymentsPromise = db.query.clientPayments.findMany({
            where: eq(clientPayments.printStatus, "print_pending"),
            with: {
                client: true,
            },
            orderBy: (p, { asc }) => [asc(p.createdAt)],
            limit: 20,
        });

        const [pendingOrders, pendingPayments] = await Promise.all([
            pendingOrdersPromise,
            pendingPaymentsPromise
        ]);

        // Fetch shop settings (one row)
        const settings = await db.query.shopSettings.findFirst();

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:1556";

        // --- NEW: Filter out orders that don't have codes for ALL items yet ---
        // Exception: Kiosk orders in EN_ATTENTE (Wait tickets) are allowed.
        const ordersToPrint = pendingOrders.filter((order: any) => {
            const allItemsFulfilled = order.items.every((item: any) => {
                const hasCodes = (item.codes && item.codes.length > 0) || (item.slots && item.slots.length > 0);
                return hasCodes;
            });
            const isKioskWaitTicket = order.source === "KIOSK" && order.status === "EN_ATTENTE";
            return allItemsFulfilled || isKioskWaitTicket;
        });

        // Map each order to PrintData format (with decrypted credentials)
        const orderJobs = ordersToPrint.map((order: any) => {
            const createdAt = new Date(order.createdAt);

            const items = (order.items || []).map((item: any) => {
                const credentials: { label: string; value: string }[] = [];

                // Base identifiers from order items (Player ID and Nickname)
                if (item.customData) {
                    credentials.push({ label: "ID/Lien", value: item.customData });
                }
                if (item.playerNickname) {
                    credentials.push({ label: "Pseudo", value: item.playerNickname });
                }

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

                const quantity = item.quantity ?? 1;
                const unitPrice = Number(item.price ?? 0);
                const itemTotal = quantity * unitPrice;

                return {
                    productName: item.variant?.product?.name || item.name || "Article",
                    quantity: quantity,
                    price: unitPrice,
                    unitPrice: unitPrice, // Explicit alias
                    total: itemTotal, // Line total
                    itemTotal: itemTotal, // Explicit alias
                    totalStr: String(itemTotal),
                    credentials,
                };
            });

            const customerName = order.client?.nomComplet || order.reseller?.name || "Client";
            const customerPhone = order.client?.telephone || order.reseller?.telephone || order.customerPhone || "";

            const totalAmount = Number(order.totalAmount ?? 0);
            const remise = Number(order.remise ?? 0);
            const montantPaye = Number(order.montantPaye ?? 0);
            const resteAPayer = Number(order.resteAPayer ?? 0);
            const netTotal = Math.max(0, totalAmount - remise);

            return {
                _orderId: order.id, // used for ack
                orderNumber: order.orderNumber,
                date: createdAt.toLocaleDateString("fr-FR"),
                time: createdAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
                totalAmount: totalAmount,
                total: totalAmount,
                brutTotal: totalAmount,
                remise: remise,
                remiseGlobale: remise,
                discount: remise,
                montantPaye: montantPaye,
                verse: montantPaye,
                resteAPayer: resteAPayer,
                netTotal: netTotal,
                finalTotal: netTotal,
                totalNet: netTotal,
                totalStr: String(totalAmount),
                remiseStr: String(remise),
                discountStr: String(remise),
                montantPayeStr: String(montantPaye),
                verseStr: String(montantPaye),
                resteAPayerStr: String(resteAPayer),
                netTotalStr: String(netTotal),
                totalClientDebt: order.client?.totalDetteDzd || "0",
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

        // Map payments to jobs
        const paymentJobs = pendingPayments.map((pay: any) => {
            const createdAt = new Date(pay.createdAt);
            const amount = Number(pay.montantDzd || 0);

            return {
                _paymentId: pay.id, // for ack
                _type: 'PAYMENT',
                orderNumber: pay.receiptNumber || `PAY-${pay.id}`,
                date: createdAt.toLocaleDateString("fr-FR"),
                time: createdAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
                totalAmount: amount,
                amountPaid: amount,
                oldBalance: pay.oldBalanceDzd,
                newBalance: pay.newBalanceDzd,
                typeAction: pay.typeAction,
                customer: {
                    name: pay.client?.nomComplet || "Client",
                    phone: pay.client?.telephone || ""
                },
                shop: {
                    name: settings?.shopName || "MA BOUTIQUE",
                    address: settings?.shopAddress || undefined,
                    tel: settings?.shopTel || undefined,
                    footerMessage: settings?.footerMessage || undefined,
                    showDateTime: settings?.showDateTimeOnReceipt ?? true,
                    showCashier: settings?.showCashierOnReceipt ?? true,
                },
                items: [{
                    productName: `VERSEMENT DETTE (${pay.typeAction})`,
                    quantity: 1,
                    price: amount,
                    total: amount,
                    totalStr: String(amount),
                    credentials: []
                }]
            };
        });

        // Combine jobs
        const jobs = [...orderJobs, ...paymentJobs];

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
        const payload = await req.json() as { orderId?: number; paymentId?: number; status: "printed" | "failed" };
        const { orderId, paymentId, status } = payload;

        console.log(`[Print Queue PATCH] Received ACK: orderId=${orderId}, paymentId=${paymentId}, status=${status}`);

        if ((!orderId && !paymentId) || !["printed", "failed"].includes(status)) {
            console.error(`[Print Queue PATCH] Invalid payload:`, payload);
            return NextResponse.json({ error: "orderId ou paymentId et status requis" }, { status: 400 });
        }

        if (orderId) {
            console.log(`[Print Queue PATCH] Updating order ${orderId} to ${status}`);
            await db.update(orders)
                .set({ printStatus: status })
                .where(eq(orders.id, orderId));

            // Automated WhatsApp trigger on successful print (Delivery style)
            if (status === "printed") {
                try {
                    const order = await db.query.orders.findFirst({
                        where: eq(orders.id, orderId),
                        with: {
                            client: true,
                            reseller: true,
                            items: {
                                with: {
                                    codes: true,
                                    slots: { with: { digitalCode: true } },
                                    variant: { with: { product: true } },
                                }
                            }
                        }
                    });

                    if (order) {
                        // Prepare items with formatted credentials for n8n
                        const preparedItems = order.items.map((item: any) => {
                            const credentials: { label: string; value: string }[] = [];
                            if (item.customData) credentials.push({ label: "ID", value: item.customData });
                            (item.codes || []).forEach((c: any) => {
                                const decrypted = decrypt(c.code);
                                if (decrypted) credentials.push({ label: "Code", value: decrypted });
                            });
                            (item.slots || []).forEach((s: any) => {
                                const parentData = s.digitalCode?.code ? decrypt(s.digitalCode.code) : null;
                                if (parentData) credentials.push({ label: "Accès", value: parentData });
                                if (s.code) credentials.push({ label: "Pin", value: decrypt(s.code) || "" });
                            });

                            return {
                                name: item.variant?.product?.name || item.name,
                                quantity: item.quantity,
                                credentials
                            };
                        });

                        console.log(`[Print Queue PATCH] Triggering Auto-WhatsApp for order ${orderId}`);
                        await N8nService.notifyOrderPrinted(order, preparedItems);
                    }
                } catch (waErr: any) {
                    console.error(`[Print Queue PATCH] Order WhatsApp trigger failed:`, waErr.message);
                }
            }
        } else if (paymentId) {
            console.log(`[Print Queue PATCH] Updating payment ${paymentId} to ${status}`);
            await db.update(clientPayments)
                .set({ printStatus: status })
                .where(eq(clientPayments.id, paymentId));
        }

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error(`[Print Queue PATCH] Critical error:`, err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
