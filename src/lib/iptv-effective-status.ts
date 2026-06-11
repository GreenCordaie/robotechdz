/**
 * Pure helper that derives the EFFECTIVE display status for an IPTV line.
 *
 * Lives outside the `.tsx` component module so unit tests can import it
 * without dragging React/JSX into the vitest transform pipeline.
 *
 * Priority (highest first):
 *   1. Terminal mirror states (CANCELLED, FAILED, REFUNDED) — final, expiry
 *      math never overrides them.
 *   2. PENDING_LOADBRAIN — still provisioning; expiry doesn't apply yet.
 *   3. `expiresAt` is set AND in the past → EXPIRED (regardless of whether
 *      the panel still reports `active=true`; the reseller's history view
 *      must never show "Actif" once the line has actually expired).
 *   4. Otherwise the raw status is preserved (ACTIVE / FROZEN / EXPIRED).
 *
 * Provider-agnostic by design — same rule for panelking365 / atlaspro /
 * ironmax / ibosol.
 */

export type IptvStatus =
    | "PENDING_LOADBRAIN"
    | "ACTIVE"
    | "FROZEN"
    | "EXPIRED"
    | "CANCELLED"
    | "FAILED"
    | "REFUNDED";

const KNOWN_STATUSES: ReadonlySet<IptvStatus> = new Set<IptvStatus>([
    "PENDING_LOADBRAIN",
    "ACTIVE",
    "FROZEN",
    "EXPIRED",
    "CANCELLED",
    "FAILED",
    "REFUNDED",
]);

export function deriveEffectiveStatus(
    status: IptvStatus | string,
    expiresAt: Date | string | null | undefined,
): IptvStatus {
    const key: IptvStatus = KNOWN_STATUSES.has(status as IptvStatus)
        ? (status as IptvStatus)
        : "PENDING_LOADBRAIN";

    if (
        key === "CANCELLED" ||
        key === "FAILED" ||
        key === "REFUNDED" ||
        key === "PENDING_LOADBRAIN"
    ) {
        return key;
    }
    if (expiresAt) {
        const d = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
        if (Number.isFinite(d.getTime()) && d.getTime() < Date.now()) {
            return "EXPIRED";
        }
    }
    return key;
}
