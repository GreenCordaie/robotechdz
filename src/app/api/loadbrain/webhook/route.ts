import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orders, digitalCodes, iptvProvisions } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { encrypt } from "@/lib/encryption";
import { eventBus, SystemEvent } from "@/lib/events";
import { sendTelegramNotification } from "@/lib/telegram";
import { DigitalCodeStatus, DeliveryMethod, OrderStatus } from "@/lib/constants";
import {
    isIbosolPayload,
    isPartialSuccess,
    formatIbosolCode,
    parseIbosolExpires,
    parseIbosolCustomData,
} from "@/lib/ibosol-credentials";

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
        const safeCompare = (a: string, b: string): boolean => {
            try {
                const bufA = Buffer.from(a);
                const bufB = Buffer.from(b);
                if (bufA.length !== bufB.length) return false;
                return crypto.timingSafeEqual(bufA, bufB);
            } catch { return false; }
        };

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

    if (!targetItem) {
        console.error(`[LoadBrain] No matching IPTV order_item for ${event.orderId}`);
        return;
    }

    // Defensive: variantId must exist before inserting digital_codes (FK constraint)
    if (!targetItem.variantId) {
        console.error(`[LoadBrain] order_item #${targetItem.id} has null variantId — cannot insert credentials`);
        await db.update(iptvProvisions).set({
            status: "failed",
            error: "order_item.variantId is null",
            errorCode: "INVALID_ORDER_ITEM",
        }).where(and(
            eq(iptvProvisions.orderId, order.id),
            eq(iptvProvisions.orderItemId, targetItem.id),
        ));
        sendTelegramNotification(
            `❌ *Webhook anomalie*\n📋 \`${order.orderNumber}\`\nOrder item #${targetItem.id} sans variantId — credentials non enregistrées.`,
            ["ADMIN"]
        ).catch(() => {});
        return;
    }

    const creds = event.credentials || {};
    const ibosolMode = isIbosolPayload(creds);
    const screens = creds.screens || [];

    // event.status === "completed" but no usable credentials → mark failed instead of silent drop
    if (!ibosolMode && screens.length === 0) {
        console.error(`[LoadBrain] completed event with empty credentials for ${event.orderId}`);
        await db.update(iptvProvisions).set({
            status: "failed",
            error: "Empty credentials in completed webhook",
            errorCode: "EMPTY_CREDENTIALS",
        }).where(and(
            eq(iptvProvisions.orderId, order.id),
            eq(iptvProvisions.orderItemId, targetItem.id),
            inArray(iptvProvisions.status, ["queued", "processing"]),
        ));
        sendTelegramNotification(
            `⚠️ *Webhook vide*\n📋 \`${order.orderNumber}\`\nLoadBrain a renvoyé completed sans credentials. Action SAV requise.`,
            ["ADMIN"]
        ).catch(() => {});
        return;
    }

    // Detect partial success for combo orders
    const targetCustomData = parseIbosolCustomData(targetItem.customData);
    const comboRequested = !!targetCustomData?.combo;
    const partial = ibosolMode && isPartialSuccess(creds, comboRequested);
    const finalStatus = partial ? "completed_partial" : "completed";

    await db.transaction(async (tx) => {
        const existing = await tx.query.digitalCodes.findFirst({
            where: eq(digitalCodes.orderItemId, targetItem.id),
        });
        if (existing) return;

        if (ibosolMode) {
            const codeValue = formatIbosolCode(creds);
            await tx.insert(digitalCodes).values({
                variantId: targetItem.variantId,
                orderItemId: targetItem.id,
                code: encrypt(codeValue),
                status: DigitalCodeStatus.VENDU,
                expiresAt: parseIbosolExpires(creds.expiresAt),
            });
        } else {
            for (const screen of screens) {
                const isCodeMode = screen.code && !screen.username;
                let m3uUrl = screen.m3uUrl || "";
                if (!isCodeMode && !m3uUrl && screen.epgUrl) {
                    const host = screen.epgUrl.split("/xmltv")[0];
                    m3uUrl = `${host}/get.php?username=${screen.username}&password=${screen.password}&type=m3u_plus`;
                }
                const codeValue = isCodeMode
                    ? screen.code
                    : [screen.username, screen.password, m3uUrl, screen.epgUrl || ""].join(" | ");

                await tx.insert(digitalCodes).values({
                    variantId: targetItem.variantId,
                    orderItemId: targetItem.id,
                    code: encrypt(codeValue),
                    status: DigitalCodeStatus.VENDU,
                    expiresAt: parseIbosolExpires(screen.expiresAt),
                });
            }
        }

        await tx.update(iptvProvisions).set({
            status: finalStatus,
            error: partial ? "IPTV combo not delivered" : null,
            errorCode: partial ? "PARTIAL_IPTV" : null,
            credentialsEncrypted: encrypt(JSON.stringify(event.credentials)),
            completedAt: new Date(),
        }).where(and(
            eq(iptvProvisions.orderId, order.id),
            eq(iptvProvisions.orderItemId, targetItem.id),
            inArray(iptvProvisions.status, ["queued", "processing", "failed"]),
        ));

        const isWhatsApp = (order as any).deliveryMethod === DeliveryMethod.WHATSAPP;
        await tx.update(orders).set({
            status: OrderStatus.TERMINE,
            isDelivered: true,
            printStatus: isWhatsApp ? "idle" : "print_pending",
        }).where(eq(orders.id, order.id));
    });

    eventBus.publish(SystemEvent.ORDER_DELIVERED, { orderId: order.id });

    const summary = ibosolMode
        ? (partial
            ? `⚠️ IBO activé, IPTV échouée (action SAV requise)`
            : (creds.iptvUsername
                ? `🔑 ${creds.mac} + IPTV ${creds.iptvUsername}`
                : `🔑 ${creds.mac} ${creds.activationCode ? "→ activé" : ""}`.trim()))
        : `🔑 ${screens[0]?.username || screens[0]?.code || "code"} / ${"•".repeat(8)}`;

    const emoji = partial ? "⚠️" : "✅";
    const title = partial ? "IBO partiel" : (ibosolMode ? "IBO livré" : "IPTV livré");

    sendTelegramNotification(
        `${emoji} *${title}*\n📋 \`${order.orderNumber}\`\n👤 ${(order as any).client?.nomComplet || "N/A"}\n${summary}`,
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

    // Special-case DEVICE_NOT_ACTIVATED: client must launch the IBO Player app
    // on their TV (free 7-day trial activates the device), then admin retries.
    if (event.errorCode === "DEVICE_NOT_ACTIVATED") {
        sendTelegramNotification(
            `⚠️ *IBO device non activé*\n📋 \`${event.orderId}\`\n` +
            `Le client doit ouvrir l'app IBO Player sur sa TV (essai gratuit 7j) puis cliquer "Relancer" depuis /admin/iptv.`,
            ["ADMIN"]
        ).catch(() => {});
        return;
    }

    sendTelegramNotification(
        `❌ *IPTV échoué*\n📋 \`${event.orderId}\`\n❌ ${event.error || "Inconnue"}`,
        ["ADMIN"]
    ).catch(() => {});
}
