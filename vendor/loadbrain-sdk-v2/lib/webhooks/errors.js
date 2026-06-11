"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookReplayDetected = exports.WebhookTimestampExpired = exports.WebhookSignatureInvalid = void 0;
class WebhookSignatureInvalid extends Error {
    constructor(msg) {
        super(msg);
        this.name = "WebhookSignatureInvalid";
    }
}
exports.WebhookSignatureInvalid = WebhookSignatureInvalid;
class WebhookTimestampExpired extends Error {
    constructor(msg) {
        super(msg);
        this.name = "WebhookTimestampExpired";
    }
}
exports.WebhookTimestampExpired = WebhookTimestampExpired;
class WebhookReplayDetected extends Error {
    constructor(msg) {
        super(msg);
        this.name = "WebhookReplayDetected";
    }
}
exports.WebhookReplayDetected = WebhookReplayDetected;
//# sourceMappingURL=errors.js.map