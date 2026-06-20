import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

const { applyMock } = vi.hoisted(() => ({ applyMock: vi.fn() }));
vi.mock("@/lib/loadbrain-netflix-mirror", () => ({ applyNetflixWebhook: applyMock }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/streaming-event-bus", () => ({ streamingEventBus: { publish: vi.fn() } }));

import { POST } from "@/app/api/loadbrain/netflix/webhook/route";

const SECRET = "wh-secret";
beforeEach(() => {
    process.env.LOADBRAIN_WEBHOOK_SECRET = SECRET;
    applyMock.mockClear();
});

function signedRequest(
    body: string,
    {
        ts = Math.floor(Date.now() / 1000),
        secret = SECRET,
        deliveryId = "d1",
    }: { ts?: number; secret?: string; deliveryId?: string } = {},
) {
    const sig = "sha256=" + crypto.createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
    return new Request("https://b.test/api/loadbrain/netflix/webhook", {
        method: "POST",
        body,
        headers: {
            "x-loadbrain-signature": sig,
            "x-loadbrain-timestamp": String(ts),
            "x-loadbrain-delivery-id": deliveryId,
            "content-type": "application/json",
        },
    });
}

describe("netflix webhook receiver", () => {
    it("accepts a valid signed payload and calls applyNetflixWebhook once", async () => {
        const body = JSON.stringify({ event: "code.captured", payload: { publicToken: "abc", type: "OTP_CODE", value: "1234" } });
        const res = await POST(signedRequest(body, { deliveryId: "valid-1" }) as any);
        expect(res.status).toBe(200);
        expect(applyMock).toHaveBeenCalledTimes(1);
    });

    it("rejects a bad signature (400) without applying", async () => {
        const body = JSON.stringify({ event: "code.captured", payload: {} });
        const req = signedRequest(body, { secret: "wrong-secret", deliveryId: "bad-sig" });
        const res = await POST(req as any);
        expect(res.status).toBe(400);
        expect(applyMock).not.toHaveBeenCalled();
    });

    it("rejects an expired timestamp (400)", async () => {
        const body = JSON.stringify({ event: "code.captured", payload: {} });
        const old = Math.floor(Date.now() / 1000) - 1000;
        const res = await POST(signedRequest(body, { ts: old, deliveryId: "expired" }) as any);
        expect(res.status).toBe(400);
        expect(applyMock).not.toHaveBeenCalled();
    });

    it("rejects missing signature headers (400)", async () => {
        const req = new Request("https://b.test/api/loadbrain/netflix/webhook", {
            method: "POST",
            body: "{}",
            headers: { "content-type": "application/json" },
        });
        const res = await POST(req as any);
        expect(res.status).toBe(400);
        expect(applyMock).not.toHaveBeenCalled();
    });

    it("is idempotent: same delivery-id applied once", async () => {
        const body = JSON.stringify({ event: "code.captured", payload: { publicToken: "abc", type: "OTP_CODE", value: "1" } });
        await POST(signedRequest(body, { deliveryId: "dup-1" }) as any);
        await POST(signedRequest(body, { deliveryId: "dup-1" }) as any);
        expect(applyMock).toHaveBeenCalledTimes(1); // 2nd is deduped
    });

    it("LRU: a fresh delivery-id after many inserts is still processed (not wrongly deduped)", async () => {
        const body = JSON.stringify({ event: "code.captured", payload: { publicToken: "abc", type: "OTP_CODE", value: "1" } });
        // Flood the bounded cache with > SEEN_CAP (5000) distinct ids. The old
        // implementation wholesale-cleared at the cap; the LRU evicts one entry
        // at a time, so a brand-new id must always be processed exactly once.
        for (let i = 0; i < 5050; i++) {
            await POST(signedRequest(body, { deliveryId: `flood-${i}` }) as any);
        }
        applyMock.mockClear();
        await POST(signedRequest(body, { deliveryId: "fresh-after-flood" }) as any);
        expect(applyMock).toHaveBeenCalledTimes(1);
    });
});
