import { BalanceFetcher, BalanceFetcherConfig, BalanceResult, BalanceFetchError } from "./types";

/**
 * 2Captcha — https://2captcha.com/2captcha-api#getbalance
 * GET https://2captcha.com/res.php?key={key}&action=getbalance&json=1
 */
export const twocaptchaFetcher: BalanceFetcher = {
    kind: "twocaptcha",
    label: "2Captcha (captcha)",
    async fetchBalance(config: BalanceFetcherConfig): Promise<BalanceResult> {
        const apiKey = readApiKey(config);
        const endpoint = config.endpoint || "https://2captcha.com/res.php";
        const url = `${endpoint}?key=${encodeURIComponent(apiKey)}&action=getbalance&json=1`;

        const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(15_000) });
        if (!res.ok) throw new BalanceFetchError("twocaptcha", `HTTP ${res.status}`, res.status);

        const json = (await res.json()) as { status: number; request: string };
        if (json.status !== 1) {
            throw new BalanceFetchError("twocaptcha", json.request || "non-OK status");
        }
        const value = Number(json.request);
        if (!Number.isFinite(value)) {
            throw new BalanceFetchError("twocaptcha", `invalid balance value: ${json.request}`);
        }
        return { value, currency: "USD", fetchedAt: new Date(), raw: { status: 1 } };
    },
};

function readApiKey(config: BalanceFetcherConfig): string {
    const envName = config.apiKeyEnv || "TWOCAPTCHA_KEY";
    const key = process.env[envName];
    if (!key) throw new BalanceFetchError("twocaptcha", `env var ${envName} not set`);
    return key;
}
