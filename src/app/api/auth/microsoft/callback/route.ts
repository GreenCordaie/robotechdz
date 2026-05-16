import { NextRequest, NextResponse } from "next/server";
import { MicrosoftAuthService } from "@/services/microsoft-auth.service";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state"); // L'ID du code digital
    const error = searchParams.get("error");

    if (error) {
        console.error("[MS_AUTH_CALLBACK] Error from Microsoft:", error);
        return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/auth/microsoft-callback?auth=error&msg=${error}`);
    }

    if (!code || !state) {
        return NextResponse.json({ error: "Code or state missing" }, { status: 400 });
    }

    try {
        // Le state peut être "ID" ou "ID:CLIENT_ID"
        const stateParts = state.split(':');
        const codeId = parseInt(stateParts[0]);
        const explicitClientId = stateParts[1] || undefined;

        // 1. Échanger le code contre les tokens en utilisant le bon Client ID
        const tokens = await MicrosoftAuthService.exchangeCodeForTokens(code, explicitClientId);

        // 2. Sauvegarder le refresh_token avec le Client ID associé
        await MicrosoftAuthService.saveRefreshToken(codeId, tokens.refresh_token, undefined, explicitClientId);

        console.log(`[MS_AUTH_CALLBACK] Success for digital_code ID: ${codeId} with Client: ${explicitClientId || 'default'}`);

        // 3. Rediriger vers l'admin avec succès
        return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/auth/microsoft-callback?auth=success&id=${codeId}`);
    } catch (err: any) {
        console.error("[MS_AUTH_CALLBACK] Exception:", err.message);
        const safeMsg = encodeURIComponent(err.message?.slice(0, 200) || "server_error");
        return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/auth/microsoft-callback?auth=error&msg=${safeMsg}`);
    }
}
