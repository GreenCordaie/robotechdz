import { NextRequest, NextResponse } from "next/server";
import { processCompletedTask, processFailedTask } from "@/lib/iptv-webhook-processor";

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
            const trimmed = rawBody.replace(/^﻿/, "").trim();
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
            await processCompletedTask(event);
        } else if (event.status === "failed") {
            await processFailedTask(event);
        }

        return NextResponse.json({ received: true });
    } catch (err: any) {
        console.error("[LoadBrain] Webhook error:", err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
