import { NextRequest, NextResponse } from "next/server";
import { parseAndVerifyWebhook } from "@loadbrain/site-integration";
import { db } from "@/db";
import { orders, orderItems, digitalCodes, iptvProvisions } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { encrypt } from "@/lib/encryption";
import { eventBus, SystemEvent } from "@/lib/events";
import { sendTelegramNotification } from "@/lib/telegram";
import { OrderStatus, DeliveryMethod, DigitalCodeStatus } from "@/lib/constants";

export async function POST(request: NextRequest) {
    const webhookSecret = process.env.LOADBRAIN_WEBHOOK_SECRET;
    if (!webhookSecret) {
        return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
    }

    try {
        const rawBody = await request.text();
        const headers: Record<string, string> = {};
        request.headers.forEach((value, key) => { headers[key] = value; });

        const crypto = await import("crypto");
        const fs = await import("fs");
        const sig = headers["x-loadbrain-signature"] || "";
        const ts = headers["x-loadbrain-timestamp"] || "";
        const bodyHash = crypto.createHash("sha256").update(rawBody).digest("hex");

        // Write raw body to file for debugging
        try { fs.writeFileSync("/tmp/lb_webhook_body.txt", rawBody); } catch {}
        try { fs.writeFileSync("C:\\Users\\PC\\Desktop\\lb_webhook_debug.txt",
            `sig=${sig}\nts=${ts}\nbodyLen=${rawBody.length}\nbodyHash=${bodyHash}\nbodyFirst100=${rawBody.slice(0,100)}\nbodyLast50=${rawBody.slice(-50)}\n\nFULL BODY:\n${rawBody}`
        ); } catch {}

        console.log(`[Webhook] len=${rawBody.length} hash=${bodyHash.slice(0,16)} sig=${sig.slice(0,30)}`);

        // Try SDK verification first
        let result = parseAndVerifyWebhook(webhookSecret, headers, rawBody);

        // Fallback: try with trimmed/normalized body
        if (!result.verified) {
            const normalized = rawBody.replace(/^\uFEFF/, "").trim();
            result = parseAndVerifyWebhook(webhookSecret, headers, normalized);

            // Last resort: manual HMAC with all body variants
            if (!result.verified) {
                const h1 = "sha256=" + crypto.createHmac("sha256", webhookSecret).update(`${ts}.${rawBody}`).digest("hex");
                const h2 = "sha256=" + crypto.createHmac("sha256", webhookSecret).update(`${ts}.${normalized}`).digest("hex");
                const h3 = "sha256=" + crypto.createHmac("sha256", webhookSecret).update(`${ts}.${JSON.stringify(JSON.parse(rawBody))}`).digest("hex");
                console.log(`[Webhook] HMAC raw=${sig===h1} trim=${sig===h2} restringify=${sig===h3}`);

                if (sig === h1 || sig === h2 || sig === h3) {
                    try { result = { verified: true, event: JSON.parse(rawBody) }; } catch {}
                }
            }
        }

        if (!result.verified || !result.event) {
            console.error("[LoadBrain Webhook] Rejected:", result.error);
            return NextResponse.json({ error: result.error || "Invalid webhook" }, { status: 400 });
        }

        const event = result.event;

        if (event.status === "completed") {
            await handleProvisionCompleted(event);
        } else if (event.status === "failed") {
            await handleProvisionFailed(event);
        }

        return NextResponse.json({ received: true });
    } catch (err: any) {
        console.error("[LoadBrain] Webhook error:", err.message);
        return NextResponse.json({ error: "Invalid webhook" }, { status: 400 });
    }
}

async function handleProvisionCompleted(event: any) {
    const eventOrderId = event.orderId; // = order.orderNumber or orderNumber-item-X
    console.log(`[LoadBrain] Provision complete — OrderRef: ${eventOrderId}`);

    // Parse orderNumber: could be "#C42-123" or "#C42-123-item-5"
    const baseOrderNumber = eventOrderId.replace(/-item-\d+$/, "");

    // Find the ROBOTECH order
    const order = await db.query.orders.findFirst({
        where: eq(orders.orderNumber, baseOrderNumber),
        with: {
            client: true,
            items: {
                with: {
                    codes: true,
                    slots: { with: { digitalCode: true } },
                    variant: { with: { product: true } },
                }
            }
        }
    });

    if (!order) {
        console.error(`[LoadBrain] No order found for: ${baseOrderNumber}`);
        return;
    }

    // Find the IPTV order item(s)
    const iptvItems = (order as any).items.filter((item: any) => item.variant?.loadbrainSlug);
    if (iptvItems.length === 0) {
        console.error(`[LoadBrain] No IPTV items in order ${baseOrderNumber}`);
        return;
    }

    // Determine which item this webhook is for
    const itemIdMatch = eventOrderId.match(/-item-(\d+)$/);
    const targetItem = itemIdMatch
        ? iptvItems.find((i: any) => i.id === parseInt(itemIdMatch[1]))
        : iptvItems[0];

    if (!targetItem) {
        console.error(`[LoadBrain] No matching item for ${eventOrderId}`);
        return;
    }

    const screens = event.credentials?.screens || [];
    if (screens.length === 0) {
        console.error(`[LoadBrain] No screens in webhook for ${eventOrderId}`);
        return;
    }

    // Validate screens have required fields
    const validScreens = screens.filter((s: any) => s.username && s.password);
    if (validScreens.length === 0) {
        console.error(`[LoadBrain] All screens missing credentials for ${eventOrderId}`);
        return;
    }

    // Idempotency: check if credentials already exist for this item
    const existingCodes = await db.query.digitalCodes.findFirst({
        where: eq(digitalCodes.orderItemId, targetItem.id),
    });
    if (existingCodes) {
        console.warn(`[LoadBrain] Credentials already exist for item ${targetItem.id} — skipping duplicate`);
        return;
    }

    await db.transaction(async (tx) => {
        // 1. Create digital_codes for each screen
        for (const screen of validScreens) {
            // Build M3U URL from EPG if missing
            let m3uUrl = screen.m3uUrl || "";
            if (!m3uUrl && screen.epgUrl) {
                const host = screen.epgUrl.split("/xmltv")[0];
                m3uUrl = `${host}/get.php?username=${screen.username}&password=${screen.password}&type=m3u_plus`;
            } else if (!m3uUrl && screen.username && screen.password) {
                m3uUrl = `http://azerty365.net:80/get.php?username=${screen.username}&password=${screen.password}&type=m3u_plus`;
            }

            const codeString = [
                screen.username,
                screen.password,
                m3uUrl,
                screen.epgUrl || "",
            ].join(" | ");

            await tx.insert(digitalCodes).values({
                variantId: targetItem.variantId,
                orderItemId: targetItem.id,
                code: encrypt(codeString),
                status: DigitalCodeStatus.VENDU,
                expiresAt: screen.expiresAt ? new Date(screen.expiresAt) : null,
            });
        }

        // 2. Update iptv_provisions record
        await tx.update(iptvProvisions).set({
            status: "completed",
            credentialsEncrypted: encrypt(JSON.stringify(event.credentials)),
            completedAt: new Date(),
        }).where(and(
            eq(iptvProvisions.orderId, order.id),
            eq(iptvProvisions.orderItemId, targetItem.id),
            inArray(iptvProvisions.status, ["queued", "processing"]),
        ));

        // 3. Check if ALL items in the order are fulfilled
        const allProvisions = await tx.query.iptvProvisions.findMany({
            where: eq(iptvProvisions.orderId, order.id),
        });
        const allIptvDone = allProvisions.every((p: any) => p.status === "completed");

        const nonIptvItems = (order as any).items.filter((i: any) => !i.variant?.loadbrainSlug);
        const nonIptvFulfilled = nonIptvItems.every((i: any) =>
            (i.codes && i.codes.length > 0) || (i.slots && i.slots.length > 0) ||
            i.variant?.product?.isManualDelivery
        );

        if (allIptvDone && nonIptvFulfilled && order.status === OrderStatus.PAYE) {
            // Pure IPTV = never print, mixed = depends on delivery method
            const hasNonIptv = nonIptvItems.length > 0;
            await tx.update(orders).set({
                status: OrderStatus.TERMINE,
                isDelivered: true,
                printStatus: hasNonIptv && (order as any).deliveryMethod !== DeliveryMethod.WHATSAPP ? "print_pending" : "idle",
            }).where(eq(orders.id, order.id));
        }
    });

    // 4. Publish IPTV event + trigger WhatsApp delivery
    eventBus.publish(SystemEvent.IPTV_PROVISION_COMPLETED, { orderId: order.id, taskId: event.taskId });
    eventBus.publish(SystemEvent.ORDER_DELIVERED, { orderId: order.id });

    // 5. Telegram notification
    const screensSummary = screens
        .map((s: any, i: number) => `Screen ${i + 1}: ${s.username} / ${s.password}`)
        .join("\n");

    sendTelegramNotification(
        `✅ *LoadBrain — Provisioning terminé*\n\n` +
        `📋 Commande: \`${order.orderNumber}\`\n` +
        `👤 Client: ${(order as any).client?.nomComplet || "N/A"}\n` +
        `📱 Tel: ${(order as any).customerPhone || "N/A"}\n\n` +
        `🔑 *Credentials:*\n${screensSummary}`,
        ["ADMIN"]
    ).catch(() => {});

    console.log(`[LoadBrain] Order ${order.orderNumber} — ${screens.length} screen(s) saved, delivery triggered`);
}

async function handleProvisionFailed(event: any) {
    const baseOrderNumber = event.orderId?.replace(/-item-\d+$/, "") || event.orderId;
    console.error(`[LoadBrain] Provision failed — OrderRef: ${event.orderId}, Error: ${event.error}`);

    const order = await db.query.orders.findFirst({
        where: eq(orders.orderNumber, baseOrderNumber),
    });

    if (order) {
        await db.update(iptvProvisions).set({
            status: "failed",
            error: event.error || "Unknown error",
            errorCode: event.errorCode || null,
        }).where(and(
            eq(iptvProvisions.orderId, order.id),
            inArray(iptvProvisions.status, ["queued", "processing"]),
        ));

        eventBus.publish(SystemEvent.IPTV_PROVISION_FAILED, { orderId: order.id, error: event.error });
    }

    sendTelegramNotification(
        `❌ *LoadBrain — Provisioning échoué*\n\n` +
        `📋 Commande: \`${event.orderId}\`\n` +
        `❌ Erreur: ${event.error || "Inconnue"}\n` +
        `🏷️ Code: ${event.errorCode || "N/A"}\n\n` +
        `⚡ Action requise: vérifier le panel fournisseur`,
        ["ADMIN"]
    ).catch(() => {});
}
