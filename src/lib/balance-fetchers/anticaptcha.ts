import { BalanceFetcher, BalanceFetcherConfig, BalanceResult, BalanceFetchError } from "./types";

/**
 * AntiCaptcha — https://anti-captcha.com/apidoc/methods/getBalance
 * POST https://api.anti-captcha.com/getBalance  body: { clientKey }
 */
export const anticaptchaFetcher: BalanceFetcher = {
    kind: "anticaptcha",
    label: "AntiCaptcha (captcha — legacy)",
    async fetchBalance(config: BalanceFetcherConfig): Promise<BalanceResult> {
        const apiKey = readApiKey(config);
        const endpoint = config.endpoint || "https://api.anti-captcha.com/getBalance";

        const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientKey: apiKey }),
            signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) throw new BalanceFetchError("anticaptcha", `HTTP ${res.status}`, res.status);

        const json = (await res.json()) as { errorId: number; errorDescription?: string; balance?: number };
        if (json.errorId !== 0) {
            throw new BalanceFetchError("anticaptcha", json.errorDescription || `errorId=${json.errorId}`);
        }
        if (typeof json.balance !== "number") {
            throw new BalanceFetchError("anticaptcha", "balance missing in response");
        }
        return { value: json.balance, currency: "USD", fetchedAt: new Date(), raw: { errorId: 0 } };
    },
};

function readApiKey(config: BalanceFetcherConfig): string {
    const envName = config.apiKeyEnv || "ANTICAPTCHA_KEY";
    const key = process.env[envName];
    if (!key) throw new BalanceFetchError("anticaptcha", `env var ${envName} not set`);
    return key;
}
