import type { RetryConfig } from "./types";
export interface RequestArgs {
    baseUrl: string;
    /** Tenant API key — emitted as `X-API-Key`. Mutually exclusive with `bearerToken`. */
    apiKey?: string;
    /** Bearer/admin JWT — emitted as `Authorization: Bearer <token>`. Mutually exclusive with `apiKey`. */
    bearerToken?: string;
    method: string;
    path: string;
    body?: unknown;
    idempotencyKey?: string;
    query?: Record<string, string | number | boolean | undefined | null>;
    retry?: RetryConfig;
    timeoutMs?: number;
    signal?: AbortSignal;
    fetchImpl?: typeof fetch;
}
export declare function request<T>(args: RequestArgs): Promise<T>;
//# sourceMappingURL=transport.d.ts.map