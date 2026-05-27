import { NextResponse } from "next/server";
import { getIbosolApps } from "@/lib/ibosol-apps";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
    // Exposes internal LoadBrain provider/app IDs — require an authenticated
    // session so it can't be scraped anonymously.
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const apps = await getIbosolApps();
    return NextResponse.json({ success: true, data: apps });
}
