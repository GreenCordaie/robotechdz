import { EventEmitter } from "events";

/**
 * Per-slot pub/sub bus used by the streaming deeplink SSE endpoint.
 * Lives on the global so HMR / module reload don't lose listeners.
 */

export interface StreamingPayload {
    type: "OTP_CODE" | "HOUSEHOLD_LINK";
    value: string;
    timestamp: string;
}

class StreamingEventBus extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(500);
    }
    publish(slotId: number, payload: StreamingPayload) {
        this.emit(`slot:${slotId}`, payload);
    }
    subscribe(slotId: number, handler: (p: StreamingPayload) => void): () => void {
        const event = `slot:${slotId}`;
        this.on(event, handler);
        return () => this.off(event, handler);
    }
}

const g = globalThis as any;
if (!g.__streamingEventBus) {
    g.__streamingEventBus = new StreamingEventBus();
}

export const streamingEventBus: StreamingEventBus = g.__streamingEventBus;
