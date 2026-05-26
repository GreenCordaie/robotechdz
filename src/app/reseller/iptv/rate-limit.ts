/**
 * Per-reseller per-action rate limiter for IPTV line operations.
 *
 * Module-level Map keyed by `${resellerId}:${mirrorId}:${actionName}`. Each
 * action is throttled to one call every {@link ACTION_COOLDOWN_MS} ms so a
 * jittery client (double-clicks, retries) cannot flood the upstream gateway.
 *
 * Exported separately from `actions.ts` so it is importable from unit tests —
 * `"use server"` files cannot be imported directly by Vitest.
 */

export const ACTION_COOLDOWN_MS = 3_000;

const ACTION_GUARD = new Map<string, number>();

export function checkActionGuard(
    key: string,
): { ok: true } | { ok: false; error: string } {
    const now = Date.now();
    const last = ACTION_GUARD.get(key) ?? 0;
    if (now - last < ACTION_COOLDOWN_MS) {
        return {
            ok: false,
            error: "Action déjà en cours, réessayez dans quelques secondes",
        };
    }
    ACTION_GUARD.set(key, now);
    return { ok: true };
}

/** Test-only: reset internal state between cases. */
export function __resetActionGuardForTests(): void {
    ACTION_GUARD.clear();
}
