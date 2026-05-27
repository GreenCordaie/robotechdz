import { db } from "@/db";
import { NextResponse } from "next/server";
import { publicIpRateLimited, clientIpFrom } from "@/lib/public-rate-limit";

export const dynamic = "force-dynamic";



/**
 * Public API to fetch shop settings.
 * Cachable by Cloudflare at the Edge.
 */
export async function GET(request: Request) {
    try {
        if (await publicIpRateLimited(clientIpFrom(request), { bucket: "settings", limit: 120, windowSec: 60 })) {
            return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
        }
        const raw = await db.query.shopSettings.findFirst();
        // Only expose safe public fields — never tokens, secrets, or API keys
        const settings = raw ? {
            shopName: raw.shopName,
            shopAddress: raw.shopAddress,
            shopTel: raw.shopTel,
            raisonSociale: raw.raisonSociale,
            ein: raw.ein,
            footerMessage: raw.footerMessage,
            accentColor: raw.accentColor,
            logoUrl: raw.logoUrl,
            dashboardLogoUrl: raw.dashboardLogoUrl,
            faviconUrl: raw.faviconUrl,
            isB2bEnabled: raw.isB2bEnabled,
            usdExchangeRate: raw.usdExchangeRate,
        } : null;

        return NextResponse.json({ success: true, data: settings }, {
            headers: {
                // Settings change rarely: cache for 1 hour at edge
                "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
            },
        });
    } catch (error) {
        console.error("Settings API error:", error);
        return NextResponse.json({ success: false, error: "Failed to fetch settings" }, { status: 500 });
    }
}
