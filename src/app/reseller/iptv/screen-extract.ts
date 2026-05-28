/**
 * Pure helpers for reading a LoadBrain provision-task payload into the fields
 * the reseller IPTV table needs. Kept out of the `"use server"` actions module
 * so they can be unit-tested directly (the live gateway is not reachable in CI).
 *
 * The v2 gateway has shipped credentials under several wrappers over time
 * (`task.credentials.screens`, `task.result.credentials.screens`,
 * `task.data.credentials.screens`); {@link extractScreen} walks a bounded set
 * of candidate containers rather than assuming one shape.
 */

export interface ExtractedScreen {
    username: string | null;
    password: string | null;
    code: string | null;
    m3uUrl: string | null;
    epgUrl: string | null;
    expiresAt: string | null;
}

export const EMPTY_SCREEN: ExtractedScreen = {
    username: null,
    password: null,
    code: null,
    m3uUrl: null,
    epgUrl: null,
    expiresAt: null,
};

/** Pick the first non-empty string/number from a candidate key list. */
export function pickStr(obj: unknown, keys: ReadonlyArray<string>): string | null {
    if (!obj || typeof obj !== "object") return null;
    const o = obj as Record<string, unknown>;
    for (const k of keys) {
        const v = o[k];
        if (typeof v === "string" && v.trim().length > 0) return v;
        if (typeof v === "number" && Number.isFinite(v)) return String(v);
    }
    return null;
}

/** Read each field of a credential object with the canonical key fallbacks. */
function readScreenFields(obj: Record<string, unknown>): ExtractedScreen {
    return {
        username: pickStr(obj, ["username", "user", "login"]),
        password: pickStr(obj, ["password", "pass"]),
        code: pickStr(obj, ["code", "activationCode"]),
        m3uUrl: pickStr(obj, ["m3uUrl", "m3u", "playlist"]),
        epgUrl: pickStr(obj, ["epgUrl", "epg"]),
        expiresAt: pickStr(obj, ["expiresAt", "expiry", "expire_date"]),
    };
}

/**
 * Locate the first `screens[0]` credentials object anywhere in the task
 * payload across the wrapper shapes the gateway emits. This is the root of the
 * "password vide / username = fallback" symptom when the wrapper doesn't match.
 */
function findScreensContainer(
    root: Record<string, unknown>,
): Record<string, unknown> | null {
    const candidates: Array<unknown> = [
        root,
        root.credentials,
        root.result,
        root.data,
        (root.result as Record<string, unknown> | undefined)?.credentials,
        (root.data as Record<string, unknown> | undefined)?.credentials,
    ];
    for (const c of candidates) {
        if (c && typeof c === "object") {
            const screens = (c as Record<string, unknown>).screens;
            if (Array.isArray(screens) && screens.length > 0) {
                const first = screens[0];
                if (first && typeof first === "object") {
                    return first as Record<string, unknown>;
                }
            }
        }
    }
    return null;
}

/**
 * Walk the upstream task payload and extract the first screen's credentials.
 * Defensive against missing credentials / screens and against the various
 * wrapper shapes the gateway emits. `expiresAt` falls back to the credentials
 * envelope when the screen itself omits it.
 */
export function extractScreen(upstream: unknown): ExtractedScreen {
    if (!upstream || typeof upstream !== "object") return EMPTY_SCREEN;
    const up = upstream as Record<string, unknown>;

    const screen = findScreensContainer(up);
    if (screen) {
        const fields = readScreenFields(screen);
        if (!fields.expiresAt) {
            const creds = (up.credentials ?? up.result ?? up.data ?? up) as
                | Record<string, unknown>
                | undefined;
            if (creds && typeof creds === "object") {
                fields.expiresAt = pickStr(creds, [
                    "expiresAt",
                    "expiry",
                    "expire_date",
                ]);
            }
        }
        return fields;
    }

    const creds = (up.credentials ?? up.result ?? up.data ?? null) as
        | Record<string, unknown>
        | null;
    if (creds && typeof creds === "object") {
        return readScreenFields(creds);
    }
    return readScreenFields(up);
}

/** Upstream task status strings that mean the line is provisioned/live. */
export function isUpstreamCompleted(status: string | null | undefined): boolean {
    if (!status) return false;
    const s = status.toLowerCase();
    return s === "completed" || s === "active" || s === "success";
}

/**
 * Parse a plan duration (in days) from the loadbrain slug or product name.
 * Used only to compute a trial line's expiry when the upstream payload returns
 * an empty `expiresAt` (LoadBrain leaves it blank for trials). Returns null
 * when no duration token is found — we never guess a date.
 *
 * Recognised tokens (case-insensitive): `2d`, `2j`, `2 jours`, `7 day`,
 * `1m`, `1 mois`, `3 month`, `1y`, `1 an`.
 */
export function parsePlanDurationDays(
    ...sources: ReadonlyArray<string | null | undefined>
): number | null {
    for (const raw of sources) {
        if (!raw) continue;
        const s = raw.toLowerCase();
        const m = s.match(
            /(\d+)\s*(d|j|jour|jours|day|days|m|mois|month|months|y|an|ans|year|years)\b/,
        );
        if (!m) continue;
        const n = parseInt(m[1], 10);
        if (!Number.isFinite(n) || n <= 0) continue;
        const unit = m[2];
        if (
            unit.startsWith("d") ||
            unit.startsWith("j") ||
            unit === "day" ||
            unit === "days"
        ) {
            return n;
        }
        if (unit === "m" || unit.startsWith("mois") || unit.startsWith("month")) {
            return n * 30;
        }
        if (unit === "y" || unit.startsWith("an") || unit.startsWith("year")) {
            return n * 365;
        }
    }
    return null;
}
