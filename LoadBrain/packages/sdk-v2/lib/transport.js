"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.request = request;
const errors_1 = require("./errors");
const DEFAULT_TIMEOUT_MS = 8000;
const EXPO_BACKOFF_MS = [100, 200, 400, 800, 1600];
function buildUrl(baseUrl, path, query) {
    const trimmedBase = baseUrl.replace(/\/+$/, "");
    const normPath = path.startsWith("/") ? path : `/${path}`;
    let qs = "";
    if (query) {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(query)) {
            if (v === undefined || v === null)
                continue;
            params.append(k, String(v));
        }
        const str = params.toString();
        if (str)
            qs = `?${str}`;
    }
    return `${trimmedBase}${normPath}${qs}`;
}
function backoffDelay(attempt, strategy) {
    if (strategy === "linear") {
        return 100 * (attempt + 1);
    }
    return EXPO_BACKOFF_MS[Math.min(attempt, EXPO_BACKOFF_MS.length - 1)] ?? 1600;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function shouldRetry(err, status) {
    if (err instanceof errors_1.ApiError) {
        return err.retryable || (err.code === errors_1.ApiErrorCode.RATE_LIMIT_EXCEEDED) ||
            (err.code === errors_1.ApiErrorCode.UPSTREAM_TIMEOUT);
    }
    if (status !== undefined && status >= 500 && status < 600) {
        return true;
    }
    return false;
}
async function doFetch(args) {
    const fetchImpl = args.fetchImpl ?? fetch;
    const url = buildUrl(args.baseUrl, args.path, args.query);
    const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    // Forward external abort signal
    if (args.signal) {
        if (args.signal.aborted) {
            controller.abort();
        }
        else {
            args.signal.addEventListener("abort", () => controller.abort(), { once: true });
        }
    }
    const headers = {
        Accept: "application/json",
    };
    if (args.bearerToken) {
        headers["Authorization"] = `Bearer ${args.bearerToken}`;
    }
    else if (args.apiKey) {
        headers["X-API-Key"] = args.apiKey;
    }
    if (args.body !== undefined) {
        headers["Content-Type"] = "application/json";
    }
    if (args.idempotencyKey) {
        headers["X-Idempotency-Key"] = args.idempotencyKey;
    }
    let response;
    try {
        response = await fetchImpl(url, {
            method: args.method,
            headers,
            body: args.body === undefined ? undefined : JSON.stringify(args.body),
            signal: controller.signal,
        });
    }
    catch (err) {
        clearTimeout(timeoutId);
        const aborted = err?.name === "AbortError";
        throw new errors_1.ApiError({
            code: aborted ? errors_1.ApiErrorCode.TIMEOUT : errors_1.ApiErrorCode.NETWORK_ERROR,
            message: aborted ? `Request timed out after ${timeoutMs}ms` : `Network error: ${err.message}`,
            retryable: true,
        });
    }
    finally {
        clearTimeout(timeoutId);
    }
    const status = response.status;
    let parsed;
    let rawText;
    try {
        rawText = await response.text();
        parsed = rawText ? JSON.parse(rawText) : undefined;
    }
    catch {
        // non-JSON response
    }
    if (parsed && typeof parsed === "object" && "success" in parsed) {
        if (parsed.success === true) {
            return parsed.data;
        }
        const errCode = parsed.error?.code ?? errors_1.ApiErrorCode.UNKNOWN;
        throw new errors_1.ApiError({
            code: errCode,
            message: parsed.error?.message ?? "Request failed",
            details: parsed.error?.details,
            retryable: parsed.error?.retryable ??
                (typeof errCode === "string" && (0, errors_1.isRetryableErrorCode)(errCode)),
            httpStatus: status,
            requestId: parsed.meta?.requestId,
        });
    }
    // No valid envelope — synthesize from HTTP status
    if (status >= 200 && status < 300) {
        // Empty body on success is allowed
        return undefined;
    }
    throw new errors_1.ApiError({
        code: status >= 500 ? errors_1.ApiErrorCode.UPSTREAM_UNAVAILABLE : errors_1.ApiErrorCode.UNKNOWN,
        message: `HTTP ${status}${rawText ? `: ${rawText.slice(0, 200)}` : ""}`,
        httpStatus: status,
        retryable: status >= 500,
    });
}
async function request(args) {
    const retry = args.retry;
    const maxAttempts = retry ? Math.max(1, retry.max) : 1;
    const strategy = retry?.backoff ?? "expo";
    let lastErr;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            return await doFetch(args);
        }
        catch (err) {
            lastErr = err;
            const status = err instanceof errors_1.ApiError ? err.httpStatus : undefined;
            const canRetry = shouldRetry(err, status);
            const hasMore = attempt < maxAttempts - 1;
            if (!canRetry || !hasMore) {
                throw err;
            }
            await sleep(backoffDelay(attempt, strategy));
        }
    }
    // Unreachable, but TS needs it
    throw lastErr;
}
//# sourceMappingURL=transport.js.map