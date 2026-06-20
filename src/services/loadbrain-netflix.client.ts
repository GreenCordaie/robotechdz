/**
 * Thin client for LoadBrain's authoritative slot allocation surface
 * (`modules/netflix`). LoadBrain is the system-of-record for shared
 * streaming accounts: it claims/releases profile slots atomically.
 *
 * P0 NOTE: this client is NOT yet wired into the boutique's sale/refund
 * paths. It exists so P2 can flip `LB_NETFLIX_AUTHORITATIVE` on. Every
 * failure THROWS (never returns a fallback) so the eventual caller fails
 * CLOSED — we must never silently double-sell a slot when LoadBrain is
 * unreachable.
 *
 * Env contract:
 *   LOADBRAIN_URL            — base URL of the LoadBrain gateway (required)
 *   LOADBRAIN_API_KEY        — per-site API key (optional)
 *   LOADBRAIN_INTERNAL_TOKEN — service-to-service trust token (optional)
 *
 * 8s hard timeout via AbortController. `deps.fetchFn` is injectable for tests.
 */
import { logger } from "@/lib/logger";

export interface AllocateSlotInput {
    siteId: string;
    accountId: string;
    externalOrderRef: string;
    customerPhone: string;
    customerName?: string;
    customerEmail?: string;
    expiresInDays?: number;
    maxUses?: number;
}

export interface AllocateSlotResult {
    slotId: string;
    publicToken: string;
    magicLink: string;
    netflixProfileName?: string;
    expiresAt?: string;
    reused: boolean;
}

export interface ReleaseSlotInput {
    siteId: string;
    externalOrderRef: string;
    reason?: string;
}

export interface ReleaseSlotResult {
    released: boolean;
    slotId?: string;
}

export interface LbClientDeps {
    fetchFn?: typeof fetch;
    timeoutMs?: number;
}

export type LbNetflixErrorCode =
    | "LB_UNAVAILABLE"
    | "OUT_OF_STOCK"
    | "BAD_REQUEST"
    | "LB_ERROR";

export class LbNetflixError extends Error {
    constructor(
        public readonly code: LbNetflixErrorCode,
        message: string,
    ) {
        super(message);
        this.name = "LbNetflixError";
    }
}

function buildHeaders(): Record<string, string> {
    const apiKey = process.env.LOADBRAIN_API_KEY;
    const internalToken = process.env.LOADBRAIN_INTERNAL_TOKEN;
    return {
        "Content-Type": "application/json",
        ...(apiKey ? { "X-API-Key": apiKey } : {}),
        ...(internalToken ? { "X-Internal-Token": internalToken } : {}),
    };
}

async function call<T>(path: string, body: unknown, deps: LbClientDeps): Promise<T> {
    const base = process.env.LOADBRAIN_URL;
    if (!base) {
        throw new LbNetflixError("LB_UNAVAILABLE", "LOADBRAIN_URL unset");
    }

    const fetchFn = deps.fetchFn ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 8_000);

    try {
        const res = await fetchFn(`${base}${path}`, {
            method: "POST",
            headers: buildHeaders(),
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        if (res.status === 409) {
            throw new LbNetflixError("OUT_OF_STOCK", "no available slot");
        }
        if (res.status === 400) {
            throw new LbNetflixError("BAD_REQUEST", "validation");
        }
        if (!res.ok) {
            throw new LbNetflixError("LB_ERROR", `HTTP ${res.status}`);
        }
        return (await res.json()) as T;
    } catch (err: unknown) {
        if (err instanceof LbNetflixError) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn("[LbNetflix] call failed — caller fails closed", {
            action: "loadbrain.netflix.call_failed",
            metadata: { path, error: msg },
        });
        throw new LbNetflixError("LB_UNAVAILABLE", msg);
    } finally {
        clearTimeout(timer);
    }
}

/** Claim one AVAILABLE slot for `accountId`. Idempotent on (siteId, externalOrderRef) in LoadBrain. */
export async function allocateSlot(
    input: AllocateSlotInput,
    deps: LbClientDeps = {},
): Promise<AllocateSlotResult> {
    return call<AllocateSlotResult>("/internal/slot/allocate", input, deps);
}

/** Release the slot bound to (siteId, externalOrderRef) back to the pool. Idempotent. */
export async function releaseSlot(
    input: ReleaseSlotInput,
    deps: LbClientDeps = {},
): Promise<ReleaseSlotResult> {
    return call<ReleaseSlotResult>("/internal/slot/release", input, deps);
}

export interface GetSlotStatesInput {
    siteId: string;
    slotIds: string[];
}

export interface SlotStateRow {
    slotId: string;
    status: string;
    externalOrderRef: string | null;
    publicToken: string;
}

/**
 * Read the authoritative LoadBrain status of specific slots, by slot id (P2-5
 * reconcile). Tenant-scoped server-side: a slot id from another site is simply
 * absent from the result. Throws (fail-closed) on transport/HTTP failure.
 */
export async function getSlotStates(
    input: GetSlotStatesInput,
    deps: LbClientDeps = {},
): Promise<SlotStateRow[]> {
    const res = await call<{ states: SlotStateRow[] }>("/internal/slot/states", input, deps);
    return res.states ?? [];
}
