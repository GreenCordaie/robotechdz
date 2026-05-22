import { NextResponse } from "next/server";
import { getIbosolApps } from "@/lib/ibosol-apps";

export const dynamic = "force-dynamic";

export async function GET() {
    const apps = await getIbosolApps();
    return NextResponse.json({ success: true, data: apps });
}
