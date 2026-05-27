import { describe, it, expect, beforeEach, vi } from "vitest";
import { callLoadBrainAutoApprove } from "@/services/loadbrain-auto-approve.client";

const PAYLOAD = {
  accountId: "42",
  codeId: "abc",
  url: "https://www.netflix.com/account/update-household?token=xyz",
};

describe("callLoadBrainAutoApprove", () => {
  beforeEach(() => {
    process.env.LOADBRAIN_URL = "https://loadbrain.example";
    process.env.LOADBRAIN_API_KEY = "test-key";
  });

  it("returns false (no fallback called) when LOADBRAIN_URL is unset", async () => {
    delete process.env.LOADBRAIN_URL;
    const fetchFn = vi.fn();
    const ok = await callLoadBrainAutoApprove(PAYLOAD, { fetchFn });
    expect(ok).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("POSTs to /api/netflix/internal/auto-approve with X-API-Key + JSON body", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 202 }),
    );
    const ok = await callLoadBrainAutoApprove(PAYLOAD, { fetchFn });
    expect(ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe("https://loadbrain.example/api/netflix/internal/auto-approve");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toMatchObject({
      "Content-Type": "application/json",
      "X-API-Key": "test-key",
    });
    expect((init as RequestInit).body).toBe(JSON.stringify(PAYLOAD));
  });

  it("returns false on HTTP 4xx/5xx so caller can fall back to WhatsApp", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response("internal error", { status: 500 }),
    );
    const ok = await callLoadBrainAutoApprove(PAYLOAD, { fetchFn });
    expect(ok).toBe(false);
  });

  it("returns false on network failure", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const ok = await callLoadBrainAutoApprove(PAYLOAD, { fetchFn });
    expect(ok).toBe(false);
  });

  it("returns false on timeout (abort)", async () => {
    const fetchFn = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    vi.useFakeTimers();
    const promise = callLoadBrainAutoApprove(PAYLOAD, { fetchFn });
    vi.advanceTimersByTime(8_500);
    const ok = await promise;
    vi.useRealTimers();
    expect(ok).toBe(false);
  });
});
