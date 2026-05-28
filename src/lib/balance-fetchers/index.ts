import "server-only";
import { BalanceFetcher, BalanceFetcherConfig, BalanceResult, BalanceFetchError } from "./types";
import { capsolverFetcher } from "./capsolver";
import { twocaptchaFetcher } from "./twocaptcha";
import { anticaptchaFetcher } from "./anticaptcha";
import { loadbrainModuleFetcher } from "./loadbrain-module";
import { mudfishFetcher } from "./mudfish";

export { BalanceFetchError } from "./types";
export type { BalanceFetcher, BalanceFetcherConfig, BalanceResult } from "./types";

/**
 * Registry of available fetchers keyed by `suppliers.provider_kind`.
 *
 * Adding a new provider:
 *   1. Create src/lib/balance-fetchers/<name>.ts with a BalanceFetcher impl.
 *   2. Register it here.
 *   3. Insert a `suppliers` row with type='EXTERNAL_API' and the matching
 *      provider_kind via the /admin/fournisseurs UI.
 *
 * For LoadBrain modules with credit endpoints, use kind='lb_module' and set
 * externalConfig.module = 'bsv' | 'g2bulk' | 'kinguin' | 'ironmax' | ...
 */
const REGISTRY: Record<string, BalanceFetcher> = {
    capsolver: capsolverFetcher,
    twocaptcha: twocaptchaFetcher,
    anticaptcha: anticaptchaFetcher,
    lb_module: loadbrainModuleFetcher,
    mudfish: mudfishFetcher,
};

export function getFetcher(providerKind: string): BalanceFetcher | undefined {
    return REGISTRY[providerKind];
}

export function listFetchers(): BalanceFetcher[] {
    return Object.values(REGISTRY);
}

/** Resolve and call. Throws `BalanceFetchError` if unknown kind or upstream fail. */
export async function fetchProviderBalance(
    providerKind: string,
    config: BalanceFetcherConfig | null,
): Promise<{ value: number; currency: string; fetchedAt: Date }> {
    const fetcher = getFetcher(providerKind);
    if (!fetcher) throw new BalanceFetchError(providerKind, `no fetcher registered for kind '${providerKind}'`);
    const result = await fetcher.fetchBalance(config ?? {});
    return { value: result.value, currency: result.currency, fetchedAt: result.fetchedAt };
}
