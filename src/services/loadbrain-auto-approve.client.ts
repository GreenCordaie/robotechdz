/**
 * Thin client for the LoadBrain `lb-netflix` auto-approve microservice.
 *
 * 100-pc-IA's streaming mailbox watcher calls this when it captures a
 * Netflix HOUSEHOLD_LINK email — LoadBrain's Playwright worker clicks
 * the verification URL server-side so the customer's TV is silently
 * unblocked (no WhatsApp notification, no customer action).
 *
 * Env contract:
 *   LOADBRAIN_URL          — base URL of the LoadBrain gateway
 *   LOADBRAIN_API_KEY      — per-site API key for /api/netflix/* (optional)
 *
 * Returns `true` on HTTP 2xx so the caller can short-circuit the legacy
 * WhatsApp fan-out. Returns `false` on any error (network, timeout, 4xx,
 * 5xx, or LOADBRAIN_URL unset) so the caller falls back gracefully.
 *
 * Hard 8s timeout — the auto-approve job is queued asynchronously inside
 * LoadBrain, so a 202 means "accepted" not "completed".
 */
export interface AutoApprovePayload {
    accountId: string;
    codeId: string;
    url: string;
}

export interface AutoApproveDeps {
    fetchFn?: typeof fetch;
    timeoutMs?: number;
}

export async function callLoadBrainAutoApprove(
    payload: AutoApprovePayload,
    deps: AutoApproveDeps = {},
): Promise<boolean> {
    const base = process.env.LOADBRAIN_URL;
    const apiKey = process.env.LOADBRAIN_API_KEY;
    const internalToken = process.env.LOADBRAIN_INTERNAL_TOKEN;
    if (!base) return false;

    const fetchFn = deps.fetchFn ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 8_000);

    try {
        const res = await fetchFn(`${base}/api/netflix/internal/auto-approve`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // Gateway accepts EITHER X-API-Key (per-site) or X-Internal-Token
                // (internal service-to-service trust). Send both when available
                // so we don't break when one path tightens.
                ...(apiKey ? { "X-API-Key": apiKey } : {}),
                ...(internalToken ? { "X-Internal-Token": internalToken } : {}),
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
        if (!res.ok) {
            console.warn(
                `[LoadBrainAutoApprove] HTTP ${res.status} — caller will fall back`,
            );
            return false;
        }
        return true;
    } catch (err: any) {
        console.warn(
            "[LoadBrainAutoApprove] call failed:",
            err?.message ?? err,
        );
        return false;
    } finally {
        clearTimeout(timer);
    }
}
