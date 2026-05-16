import { NextRequest, NextResponse } from "next/server";
import { MicrosoftAuthService } from "@/services/microsoft-auth.service";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
    // Auth check
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const idParam = searchParams.get("id");

    if (!idParam) {
        return NextResponse.json({ error: "Paramètre 'id' manquant" }, { status: 400 });
    }

    const codeId = parseInt(idParam);
    if (isNaN(codeId)) {
        return NextResponse.json({ error: "ID invalide" }, { status: 400 });
    }

    try {
        const url = await MicrosoftAuthService.getAuthorizationUrl(codeId);
        // Redirect directly to Microsoft auth
        return NextResponse.redirect(url);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
