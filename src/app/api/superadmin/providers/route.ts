import { NextResponse } from "next/server";
import { fetchLoadbrainProviders } from "@/lib/loadbrain-providers-registry";
import { getCurrentUser } from "@/lib/security";
import { hasRole } from "@/lib/roles";
import { UserRole } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET() {
    const user = await getCurrentUser();
    if (!hasRole(user, UserRole.SUPER_ADMIN)) {
        return NextResponse.json(
            { success: false, error: "Forbidden", data: [], downCount: 0, totalCount: 0 },
            { status: 403 },
        );
    }
    const result = await fetchLoadbrainProviders();
    return NextResponse.json(result);
}
