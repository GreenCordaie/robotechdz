/**
 * Sanitization for provider/vendor error messages exposed to non-admin
 * surfaces (reseller dashboard, client emails, etc.).
 *
 * Kept in its own module (no `server-only`, no db/encryption deps) so it can
 * be unit-tested without pulling the whole webhook processor.
 */

/**
 * Provider / vendor names that must NEVER be exposed in error strings sent to
 * the reseller (or downstream non-admin surfaces). Extend as new upstreams are
 * added. Matching is case-insensitive.
 */
export const PROVIDER_NAMES_TO_MASK = [
    "atlaspro",
    "ironmax",
    "panelking365",
    "ibosol",
    "bsv",
    "prepaidforge",
    "niveausat",
    "loadbrain",
];

/**
 * Sanitize a raw error string before exposing it to reseller-facing surfaces.
 * - Masks known provider/vendor names → "provider"
 * - Replaces any URL with "[url-masked]" (prevents internal hostname leakage)
 * - Truncates to 200 chars to avoid leaking long stack traces
 */
export function sanitizeProviderError(raw: string | null | undefined): string {
    if (!raw) return "Unknown error";
    let cleaned = raw;
    for (const name of PROVIDER_NAMES_TO_MASK) {
        cleaned = cleaned.replace(new RegExp(name, "gi"), "provider");
    }
    cleaned = cleaned.replace(/https?:\/\/[^\s]+/g, "[url-masked]");
    return cleaned.slice(0, 200);
}
