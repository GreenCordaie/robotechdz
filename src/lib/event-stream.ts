import { eventBus, SystemEvent } from "./events";

type SSEClient = {
    id: string;
    controller: ReadableStreamDefaultController;
};

/**
 * Manages active SSE connections to broadcast events to the frontend.
 */
class EventStreamManager {
    private static instance: EventStreamManager;
    private clients: Set<SSEClient> = new Set();

    private constructor() {
        // Subscribe to ALL system events from the internal EventBus
        Object.values(SystemEvent).forEach((event) => {
            eventBus.on(event, (payload) => {
                this.broadcast(event, payload);
            });
        });
        console.log("[EventStream] Manager initialized");
    }

    public static getInstance(): EventStreamManager {
        if (!EventStreamManager.instance) {
            EventStreamManager.instance = new EventStreamManager();
        }
        return EventStreamManager.instance;
    }

    /**
     * Register a new SSE client
     */
    public addClient(id: string, controller: ReadableStreamDefaultController) {
        const client = { id, controller };
        this.clients.add(client);
        console.log(`[EventStream] Client connected: ${id} (Total: ${this.clients.size})`);

        // Send initial heartbeat/keep-alive
        this.sendToClient(client, "connected", { timestamp: new Date() });

        return () => {
            this.clients.delete(client);
            console.log(`[EventStream] Client disconnected: ${id} (Total: ${this.clients.size})`);
        };
    }

    /**
     * Broadcast an event to all connected clients
     */
    private broadcast(event: string, data: any) {
        const payload = JSON.stringify({ event, data });
        const encoder = new TextEncoder();
        const chunk = encoder.encode(`data: ${payload}\n\n`);

        this.clients.forEach((client) => {
            try {
                client.controller.enqueue(chunk);
            } catch (err) {
                // If enqueue fails, the stream might be closed. 
                // It will be cleaned up by the abort signal in the route handler.
                this.clients.delete(client);
            }
        });
    }

    /**
     * Send a message to a specific client
     */
    private sendToClient(client: SSEClient, event: string, data: any) {
        const payload = JSON.stringify({ event, data });
        const encoder = new TextEncoder();
        const chunk = encoder.encode(`data: ${payload}\n\n`);
        try {
            client.controller.enqueue(chunk);
        } catch (err) {
            this.clients.delete(client);
        }
    }
}

export const eventStreamManager = EventStreamManager.getInstance();
