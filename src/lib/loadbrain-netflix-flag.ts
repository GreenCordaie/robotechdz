import "server-only";
import { SystemQueries } from "@/services/queries/system.queries";

/**
 * Reads the LB_NETFLIX_AUTHORITATIVE feature flag (shop_settings column,
 * migration 0035). When true, the sale path delegates shared-streaming slot
 * allocation to LoadBrain (system-of-record) instead of picking a local slot.
 *
 * Default OFF: a missing settings row or a NULL/false column → false, so the
 * boutique keeps its historical local-pick behavior until the flag is flipped.
 *
 * Wired into allocateOrderStock in P2-2 — this helper is the single read site
 * so the gate stays consistent across sale/refund paths.
 */
export async function isLbNetflixAuthoritative(): Promise<boolean> {
    const settings = await SystemQueries.getSettings();
    return settings?.lbNetflixAuthoritative ?? false;
}
