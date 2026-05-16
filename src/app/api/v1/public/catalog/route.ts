import { getKioskData } from "@/app/kiosk/actions";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";



/**
 * Public API to fetch catalog data.
 * Cachable by Cloudflare at the Edge.
 */
export async function GET() {
    try {
        const data = await getKioskData();

        return NextResponse.json(data, {
            headers: {
                // public: Cachable by shared caches (CDN)
                // s-maxage=60: Cache on CDN for 60 seconds
                // stale-while-revalidate=300: Serve stale content for up to 300s while revalidating
                "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
                "CDN-Cache-Control": "revalidate", // Cloudflare specific revalidation hint
            },
        });
    } catch (error) {
        console.error("Catalog API error:", error);
        return NextResponse.json({ error: "Failed to fetch catalog" }, { status: 500 });
    }
}
