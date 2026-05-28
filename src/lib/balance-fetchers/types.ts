/**
 * Common interface for external balance fetchers.
 *
 * Each provider (CapSolver, 2Captcha, AntiCaptcha, Mudfish, LoadBrain modules,
 * etc.) implements this contract. The cron job + the "Refresh now" button on
 * /admin/fournisseurs call `fetchBalance(config)` and persist the result.
 *
 * Secrets (API keys) are never stored in the DB row — only the env var NAME
 * is stored in `externalConfig.apiKeyEnv`. The fetcher reads `process.env[name]`
 * at call time so rotating a key is just an env var swap + container restart.
 */
export interface BalanceFetcherConfig {
    endpoint?: string;
    apiKeyEnv?: string;
    notes?: string;
    [k: string]: unknown;
}

export interface BalanceResult {
    value: number;          // raw amount in `currency`
    currency: string;       // 'USD' | 'EUR' | 'DZD' | 'CREDITS' (provider-specific)
    fetchedAt: Date;
    raw?: unknown;          // provider response for debugging (redacted secrets)
}

export interface BalanceFetcher {
    /** Stable identifier matching `suppliers.provider_kind`. */
    kind: string;
    /** Human label for the UI. */
    label: string;
    fetchBalance(config: BalanceFetcherConfig): Promise<BalanceResult>;
}

export class BalanceFetchError extends Error {
    constructor(
        public providerKind: string,
        message: string,
        public httpStatus?: number,
    ) {
        super(`[balance-fetcher:${providerKind}] ${message}`);
        this.name = "BalanceFetchError";
    }
}
