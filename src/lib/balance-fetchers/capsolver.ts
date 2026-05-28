import { BalanceFetcher, BalanceFetcherConfig, BalanceResult, BalanceFetchError } from "./types";

/**
 * CapSolver — https://docs.capsolver.com/guide/api-getbalance.html
 * POST https://api.capsolver.com/getBalance  body: { clientKey }
 */
export const capsolverFetcher: BalanceFetcher = {
    kind: "capsolver",
    label: "CapSolver (captcha)",
    async fetchBalance(config: BalanceFetcherConfig): Promise<BalanceResult> {
        const apiKey = readApiKey(config);
        const endpoint = config.endpoint || "https://api.capsolver.com/getBalance";

        const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientKey: apiKey }),
            signal: AbortSignal.timeout(15_000),
        });

        if (!res.ok) {
            throw new BalanceFetchError("capsolver", `HTTP ${res.status}`, res.status);
        }
        const json = (await res.json()) as { errorId: number; errorDescription?: string; balance?: number };
        if (json.errorId !== 0) {
            throw new BalanceFetchError("capsolver", json.errorDescription || `errorId=${json.errorId}`);
        }
        if (typeof json.balance !== "number") {
            throw new BalanceFetchError("capsolver", "balance missing in response");
        }
        return { value: json.balance, currency: "USD", fetchedAt: new Date(), raw: { errorId: 0 } };
    },
};

function readApiKey(config: BalanceFetcherConfig): string {
    const envName = config.apiKeyEnv || "CAPSOLVER_KEY";
    const key = process.env[envName];
    if (!key) throw new BalanceFetchError("capsolver", `env var ${envName} not set`);
    return key;
}
