import { NextRequest, NextResponse } from "next/server";
import { eventStreamManager } from "@/lib/event-stream";
import { getSession } from "@/lib/auth";
import { UserRole } from "@/lib/constants";

export const dynamic = 'force-dynamic';

const STAFF_ROLES: string[] = [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.TRAITEUR, UserRole.CAISSIER];

/**
 * SSE Endpoint: GET /api/events/stream
 * Provides real-time internal system events to the dashboard.
 * Staff-only — resellers must not receive POS/internal events.
 */
export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!STAFF_ROLES.includes(session.userRole)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const streamId = Math.random().toString(36).substring(7);

    const stream = new ReadableStream({
        start(controller) {
            const unregister = eventStreamManager.addClient(streamId, controller);
            req.signal.addEventListener("abort", () => {
                unregister();
            });
        },
        cancel() {
            // Stream cancelled (navigation or disconnect)
        }
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    });
}
