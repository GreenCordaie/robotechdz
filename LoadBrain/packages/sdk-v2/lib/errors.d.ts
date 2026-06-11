/**
 * API error codes — mirrors apps/gateway/src/v2/error-codes.ts
 * Kept in sync manually until shared type package extracted.
 */
export declare enum ApiErrorCode {
    AUTH_MISSING_KEY = "AUTH_MISSING_KEY",
    AUTH_INVALID_KEY = "AUTH_INVALID_KEY",
    AUTH_KEY_REVOKED = "AUTH_KEY_REVOKED",
    AUTH_KEY_EXPIRED = "AUTH_KEY_EXPIRED",
    AUTH_INSUFFICIENT_SCOPE = "AUTH_INSUFFICIENT_SCOPE",
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
    VALIDATION_FAILED = "VALIDATION_FAILED",
    INVALID_IDEMPOTENCY_KEY = "INVALID_IDEMPOTENCY_KEY",
    PRODUCT_NOT_FOUND = "PRODUCT_NOT_FOUND",
    ORDER_NOT_FOUND = "ORDER_NOT_FOUND",
    TASK_NOT_FOUND = "TASK_NOT_FOUND",
    PROVIDER_NOT_FOUND = "PROVIDER_NOT_FOUND",
    ORDER_ALREADY_EXISTS = "ORDER_ALREADY_EXISTS",
    IDEMPOTENCY_REPLAY = "IDEMPOTENCY_REPLAY",
    INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE",
    PROVIDER_DOWN = "PROVIDER_DOWN",
    PROVIDER_STOCKOUT = "PROVIDER_STOCKOUT",
    MARGIN_BELOW_THRESHOLD = "MARGIN_BELOW_THRESHOLD",
    ORDER_NOT_CANCELABLE = "ORDER_NOT_CANCELABLE",
    WEBHOOK_SIGNATURE_INVALID = "WEBHOOK_SIGNATURE_INVALID",
    WEBHOOK_TIMESTAMP_EXPIRED = "WEBHOOK_TIMESTAMP_EXPIRED",
    WEBHOOK_REPLAY_DETECTED = "WEBHOOK_REPLAY_DETECTED",
    INTERNAL_ERROR = "INTERNAL_ERROR",
    UPSTREAM_TIMEOUT = "UPSTREAM_TIMEOUT",
    UPSTREAM_UNAVAILABLE = "UPSTREAM_UNAVAILABLE",
    SERVICE_DEGRADED = "SERVICE_DEGRADED",
    NETWORK_ERROR = "NETWORK_ERROR",
    TIMEOUT = "TIMEOUT",
    UNKNOWN = "UNKNOWN"
}
export declare function isRetryableErrorCode(code: ApiErrorCode): boolean;
export interface ApiErrorOptions {
    code: ApiErrorCode | string;
    message: string;
    details?: unknown;
    retryable?: boolean;
    httpStatus?: number;
    requestId?: string;
}
export declare class ApiError extends Error {
    readonly code: ApiErrorCode | string;
    readonly details: unknown;
    readonly retryable: boolean;
    readonly httpStatus?: number;
    readonly requestId?: string;
    constructor(opts: ApiErrorOptions);
}
//# sourceMappingURL=errors.d.ts.map