import { BalanceFetcher, BalanceFetcherConfig, BalanceResult, BalanceFetchError } from "./types";

/**
 * Generic LoadBrain module credit fetcher. Hits the gateway with the boutique's
 * internal token and reads a standard credit endpoint exposed by each module:
 *   GET ${LOADBRAIN_URL}/api/v1/<module>/internal/credit
 *
 * Expected response shape (TBD per module, fallback heuristics applied):
 *   { balance: number, currency?: string }
 *
 * Used for: BSV, G2Bulk, Kinguin, IronMax (and any future LB module exposing
 * a credit/balance endpoint). The module name is taken from
 * `externalConfig.module` (e.g. "bsv", "g2bulk").
 */
export const loadbrainModuleFetcher: BalanceFetcher = {
    kind: "lb_module",
    label: "LoadBrain module (generic credit)",
    async fetchBalance(config: BalanceFetcherConfig): Promise<BalanceResult> {
        const moduleName = (config as { module?: string }).module;
        if (!moduleName) throw new BalanceFetchError("lb_module", "externalConfig.module missing");

        const base = process.env.LOADBRAIN_URL;
        const token = process.env.LOADBRAIN_INTERNAL_TOKEN;
        if (!base) throw new BalanceFetchError("lb_module", "LOADBRAIN_URL not set");
        if (!token) throw new BalanceFetchError("lb_module", "LOADBRAIN_INTERNAL_TOKEN not set");

        const url = config.endpoint || `${base.replace(/\/$/, "")}/api/v1/${moduleName}/internal/credit`;
        const res = await fetch(url, {
            method: "GET",
            headers: { "X-Internal-Token": token },
            signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) throw new BalanceFetchError("lb_module", `HTTP ${res.status} on ${moduleName}`, res.status);

        const json = (await res.json()) as { balance?: number; credit?: number; value?: number; currency?: string };
        const value = json.balance ?? json.credit ?? json.value;
        if (typeof value !== "number") {
            throw new BalanceFetchError("lb_module", `no numeric balance/credit/value field in ${moduleName} response`);
        }
        return {
            value,
            currency: json.currency ?? "USD",
            fetchedAt: new Date(),
            raw: { module: moduleName, schema: "balance|credit|value" },
        };
    },
};
