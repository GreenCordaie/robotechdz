import { NextRequest } from "next/server";
import { eventStreamManager } from "@/lib/event-stream";

/**
 * SSE Endpoint: GET /api/events/stream
 * Provides real-time system events to the dashboard.
 */
export async function GET(req: NextRequest) {
    const streamId = Math.random().toString(36).substring(7);

    // Create a new ReadableStream for the SSE connection
    const stream = new ReadableStream({
        start(controller) {
            // Register client with the manager
            const unregister = eventStreamManager.addClient(streamId, controller);

            // Handle client disconnect
            req.signal.addEventListener("abort", () => {
                unregister();
            });
        },
        cancel() {
            // Stream was cancelled (e.g. navigation)
            console.log(`[SSE] Stream ${streamId} cancelled`);
        }
    });

    // Return the stream with proper SSE headers
    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no", // Disable buffering for Nginx if present
        },
    });
}

// Ensure the route is dynamic
export const dynamic = 'force-dynamic';
