import { BalanceFetcher, BalanceFetcherConfig, BalanceResult, BalanceFetchError } from "./types";

/**
 * Mudfish — pay-per-traffic proxy. Public API is undocumented; balance pages
 * require browser session. For now this fetcher is a STUB that returns the
 * manually-entered `balance` from the DB unchanged with a fresh `lastBalanceAt`,
 * so the row participates in the alerts / low-balance UI without API access.
 *
 * Upgrade path: if Mudfish exposes an API or scraping route, plug it in here.
 */
export const mudfishFetcher: BalanceFetcher = {
    kind: "mudfish",
    label: "Mudfish (proxy — manual top-up)",
    async fetchBalance(_config: BalanceFetcherConfig): Promise<BalanceResult> {
        throw new BalanceFetchError(
            "mudfish",
            "no automated balance API — log top-ups manually via the UI",
        );
    },
};
