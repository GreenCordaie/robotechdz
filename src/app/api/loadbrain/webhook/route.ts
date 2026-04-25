import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orders, digitalCodes, iptvProvisions } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { encrypt } from "@/lib/encryption";
import { eventBus, SystemEvent } from "@/lib/events";
import { sendTelegramNotification } from "@/lib/telegram";
import { DigitalCodeStatus, DeliveryMethod, OrderStatus } from "@/lib/constants";

export async function POST(request: NextRequest) {
    const webhookSecret = process.env.LOADBRAIN_WEBHOOK_SECRET;
    if (!webhookSecret) {
        return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
    }

    try {
        const rawBody = await request.text();
        const headers: Record<string, string> = {};
        request.headers.forEach((value, key) => { headers[key] = value; });

        // Verify signature manually (bypass SDK verification issues)
        const crypto = await import("crypto");
        const sig = headers["x-loadbrain-signature"] || "";
        const ts = headers["x-loadbrain-timestamp"] || "";

        if (!sig || !ts) {
            return NextResponse.json({ error: "Missing signature headers" }, { status: 400 });
        }

        // Replay protection (5 min)
        const now = Math.floor(Date.now() / 1000);
        if (Math.abs(now - Number(ts)) > 300) {
            return NextResponse.json({ error: "Timestamp expired" }, { status: 400 });
        }

        // HMAC verification (constant-time)
        function safeCompare(a: string, b: string): boolean {
            try {
                const bufA = Buffer.from(a);
                const bufB = Buffer.from(b);
                if (bufA.length !== bufB.length) return false;
                return crypto.timingSafeEqual(bufA, bufB);
            } catch { return false; }
        }

        const expected = "sha256=" + crypto.createHmac("sha256", webhookSecret).update(`${ts}.${rawBody}`).digest("hex");
        if (!safeCompare(sig, expected)) {
            const trimmed = rawBody.replace(/^\uFEFF/, "").trim();
            const expected2 = "sha256=" + crypto.createHmac("sha256", webhookSecret).update(`${ts}.${trimmed}`).digest("hex");
            if (!safeCompare(sig, expected2)) {
                console.error("[LoadBrain] Signature mismatch");
                return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
            }
        }

        let event: any;
        try { event = JSON.parse(rawBody); } catch {
            return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        }
        console.log(`[LoadBrain] Webhook OK — ${event.orderId} status=${event.status}`);

        if (event.status === "completed") {
            await handleComplete(event);
        } else if (event.status === "failed") {
            await handleFailed(event);
        }

        return NextResponse.json({ received: true });
    } catch (err: any) {
        console.error("[LoadBrain] Webhook error:", err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

async function handleComplete(event: any) {
    const baseOrderNumber = event.orderId?.replace(/-item-\d+$/, "") || event.orderId;

    const order = await db.query.orders.findFirst({
        where: eq(orders.orderNumber, baseOrderNumber),
        with: {
            client: true,
            items: {
                with: {
                    codes: true,
                    variant: { with: { product: true } },
                }
            }
        }
    });

    if (!order) {
        console.error(`[LoadBrain] No order: ${baseOrderNumber}`);
        return;
    }

    const iptvItems = (order as any).items.filter((item: any) => item.variant?.loadbrainSlug);
    const itemIdMatch = event.orderId?.match(/-item-(\d+)$/);
    const targetItem = itemIdMatch
        ? iptvItems.find((i: any) => i.id === parseInt(itemIdMatch[1]))
        : iptvItems[0];

    if (!targetItem) return;

    const screens = event.credentials?.screens || [];
    if (screens.length === 0) return;

    await db.transaction(async (tx) => {
        // Idempotency check INSIDE transaction to prevent TOCTOU race
        const existing = await tx.query.digitalCodes.findFirst({
            where: eq(digitalCodes.orderItemId, targetItem.id),
        });
        if (existing) return;
        for (const screen of screens) {
            let m3uUrl = screen.m3uUrl || "";
            if (!m3uUrl && screen.epgUrl) {
                const host = screen.epgUrl.split("/xmltv")[0];
                m3uUrl = `${host}/get.php?username=${screen.username}&password=${screen.password}&type=m3u_plus`;
            }

            // Parse expiresAt — LoadBrain sends "DD-MM-YYYY HH:mm" format
            let expiresAt: Date | null = null;
            if (screen.expiresAt && screen.expiresAt !== "pending") {
                const match = screen.expiresAt.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})$/);
                if (match) {
                    expiresAt = new Date(`${match[3]}-${match[2]}-${match[1]}T${match[4]}:${match[5]}:00Z`);
                } else {
                    const d = new Date(screen.expiresAt);
                    if (!isNaN(d.getTime())) expiresAt = d;
                }
            }

            await tx.insert(digitalCodes).values({
                variantId: targetItem.variantId,
                orderItemId: targetItem.id,
                code: encrypt([screen.username, screen.password, m3uUrl, screen.epgUrl || ""].join(" | ")),
                status: DigitalCodeStatus.VENDU,
                expiresAt,
            });
        }

        await tx.update(iptvProvisions).set({
            status: "completed",
            credentialsEncrypted: encrypt(JSON.stringify(event.credentials)),
            completedAt: new Date(),
        }).where(and(
            eq(iptvProvisions.orderId, order.id),
            eq(iptvProvisions.orderItemId, targetItem.id),
            inArray(iptvProvisions.status, ["queued", "processing"]),
        ));

        const isWhatsApp = (order as any).deliveryMethod === DeliveryMethod.WHATSAPP;
        await tx.update(orders).set({
            status: OrderStatus.TERMINE,
            isDelivered: true,
            printStatus: isWhatsApp ? "idle" : "print_pending",
        }).where(eq(orders.id, order.id));
    });

    eventBus.publish(SystemEvent.ORDER_DELIVERED, { orderId: order.id });

    const s = screens[0];
    sendTelegramNotification(
        `✅ *IPTV livré*\n📋 \`${order.orderNumber}\`\n👤 ${(order as any).client?.nomComplet || "N/A"}\n🔑 ${s.username} / ${"•".repeat(8)}`,
        ["ADMIN"]
    ).catch(() => {});
}

async function handleFailed(event: any) {
    const baseOrderNumber = event.orderId?.replace(/-item-\d+$/, "") || event.orderId;
    const order = await db.query.orders.findFirst({
        where: eq(orders.orderNumber, baseOrderNumber),
    });

    if (order) {
        await db.update(iptvProvisions).set({
            status: "failed",
            error: event.error || "Unknown",
            errorCode: event.errorCode || null,
        }).where(and(
            eq(iptvProvisions.orderId, order.id),
            inArray(iptvProvisions.status, ["queued", "processing"]),
        ));
    }

    sendTelegramNotification(
        `❌ *IPTV échoué*\n📋 \`${event.orderId}\`\n❌ ${event.error || "Inconnue"}`,
        ["ADMIN"]
    ).catch(() => {});
}
