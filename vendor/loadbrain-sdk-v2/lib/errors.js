"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiError = exports.ApiErrorCode = void 0;
exports.isRetryableErrorCode = isRetryableErrorCode;
/**
 * API error codes — mirrors apps/gateway/src/v2/error-codes.ts
 * Kept in sync manually until shared type package extracted.
 */
var ApiErrorCode;
(function (ApiErrorCode) {
    // Auth (4xx)
    ApiErrorCode["AUTH_MISSING_KEY"] = "AUTH_MISSING_KEY";
    ApiErrorCode["AUTH_INVALID_KEY"] = "AUTH_INVALID_KEY";
    ApiErrorCode["AUTH_KEY_REVOKED"] = "AUTH_KEY_REVOKED";
    ApiErrorCode["AUTH_KEY_EXPIRED"] = "AUTH_KEY_EXPIRED";
    ApiErrorCode["AUTH_INSUFFICIENT_SCOPE"] = "AUTH_INSUFFICIENT_SCOPE";
    // Rate limit
    ApiErrorCode["RATE_LIMIT_EXCEEDED"] = "RATE_LIMIT_EXCEEDED";
    // Validation
    ApiErrorCode["VALIDATION_FAILED"] = "VALIDATION_FAILED";
    ApiErrorCode["INVALID_IDEMPOTENCY_KEY"] = "INVALID_IDEMPOTENCY_KEY";
    // Resources
    ApiErrorCode["PRODUCT_NOT_FOUND"] = "PRODUCT_NOT_FOUND";
    ApiErrorCode["ORDER_NOT_FOUND"] = "ORDER_NOT_FOUND";
    ApiErrorCode["TASK_NOT_FOUND"] = "TASK_NOT_FOUND";
    ApiErrorCode["PROVIDER_NOT_FOUND"] = "PROVIDER_NOT_FOUND";
    // Conflict
    ApiErrorCode["ORDER_ALREADY_EXISTS"] = "ORDER_ALREADY_EXISTS";
    ApiErrorCode["IDEMPOTENCY_REPLAY"] = "IDEMPOTENCY_REPLAY";
    // Business
    ApiErrorCode["INSUFFICIENT_BALANCE"] = "INSUFFICIENT_BALANCE";
    ApiErrorCode["PROVIDER_DOWN"] = "PROVIDER_DOWN";
    ApiErrorCode["PROVIDER_STOCKOUT"] = "PROVIDER_STOCKOUT";
    ApiErrorCode["MARGIN_BELOW_THRESHOLD"] = "MARGIN_BELOW_THRESHOLD";
    ApiErrorCode["ORDER_NOT_CANCELABLE"] = "ORDER_NOT_CANCELABLE";
    // Webhook
    ApiErrorCode["WEBHOOK_SIGNATURE_INVALID"] = "WEBHOOK_SIGNATURE_INVALID";
    ApiErrorCode["WEBHOOK_TIMESTAMP_EXPIRED"] = "WEBHOOK_TIMESTAMP_EXPIRED";
    ApiErrorCode["WEBHOOK_REPLAY_DETECTED"] = "WEBHOOK_REPLAY_DETECTED";
    // Infra
    ApiErrorCode["INTERNAL_ERROR"] = "INTERNAL_ERROR";
    ApiErrorCode["UPSTREAM_TIMEOUT"] = "UPSTREAM_TIMEOUT";
    ApiErrorCode["UPSTREAM_UNAVAILABLE"] = "UPSTREAM_UNAVAILABLE";
    ApiErrorCode["SERVICE_DEGRADED"] = "SERVICE_DEGRADED";
    // Transport-level (SDK only)
    ApiErrorCode["NETWORK_ERROR"] = "NETWORK_ERROR";
    ApiErrorCode["TIMEOUT"] = "TIMEOUT";
    ApiErrorCode["UNKNOWN"] = "UNKNOWN";
})(ApiErrorCode || (exports.ApiErrorCode = ApiErrorCode = {}));
const DEFAULT_RETRYABLE = new Set([
    ApiErrorCode.RATE_LIMIT_EXCEEDED,
    ApiErrorCode.UPSTREAM_TIMEOUT,
    ApiErrorCode.UPSTREAM_UNAVAILABLE,
    ApiErrorCode.SERVICE_DEGRADED,
    ApiErrorCode.PROVIDER_DOWN,
    ApiErrorCode.NETWORK_ERROR,
    ApiErrorCode.TIMEOUT,
]);
function isRetryableErrorCode(code) {
    return DEFAULT_RETRYABLE.has(code);
}
class ApiError extends Error {
    code;
    details;
    retryable;
    httpStatus;
    requestId;
    constructor(opts) {
        super(opts.message);
        this.name = "ApiError";
        this.code = opts.code;
        this.details = opts.details;
        this.retryable =
            opts.retryable ??
                (typeof opts.code === "string" && isRetryableErrorCode(opts.code));
        this.httpStatus = opts.httpStatus;
        this.requestId = opts.requestId;
        Object.setPrototypeOf(this, ApiError.prototype);
    }
}
exports.ApiError = ApiError;
//# sourceMappingURL=errors.js.map