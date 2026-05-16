import { createNextRouteHandler, validateConfig } from "@loadbrain/site-integration";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Catch-all proxy LoadBrain. La config est résolue au PREMIER appel (lazy)
 * pour éviter un crash au build statique quand les env vars LOADBRAIN_*
 * ne sont pas définies (CI, build local sans creds).
 */
let cachedHandlers: ReturnType<typeof createNextRouteHandler> | null = null;
let initError: string | null = null;

function getHandlers() {
    if (cachedHandlers) return cachedHandlers;
    if (initError) return null;
    try {
        const config = validateConfig({
            apiKey: process.env.LOADBRAIN_API_KEY || "",
            baseUrl: process.env.LOADBRAIN_URL || "http://localhost:3000",
            siteUrl: process.env.LOADBRAIN_SITE_URL || "http://localhost:1556",
            webhookSecret: process.env.LOADBRAIN_WEBHOOK_SECRET || "",
        });
        cachedHandlers = createNextRouteHandler(config);
        return cachedHandlers;
    } catch (err) {
        initError = err instanceof Error ? err.message : "LoadBrain config invalide";
        console.warn("[loadbrain-proxy] config invalide — endpoint désactivé:", initError);
        return null;
    }
}

function disabledResponse() {
    return NextResponse.json(
        { error: "LoadBrain non configuré (env LOADBRAIN_* manquantes)", detail: initError },
        { status: 503 }
    );
}

export async function GET(req: Request, ctx: { params: { path: string[] } }) {
    const h = getHandlers();
    if (!h) return disabledResponse();
    return h.GET(req as never, ctx as never);
}

export async function POST(req: Request, ctx: { params: { path: string[] } }) {
    const h = getHandlers();
    if (!h) return disabledResponse();
    return h.POST(req as never, ctx as never);
}

export async function DELETE(req: Request, ctx: { params: { path: string[] } }) {
    const h = getHandlers();
    if (!h) return disabledResponse();
    return h.DELETE(req as never, ctx as never);
}
