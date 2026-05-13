import { NextResponse } from "next/server";

/**
 * Garde commune pour les routes de debug qui exposent des données sensibles
 * (codes déchiffrés, emails clients, refresh tokens Microsoft, etc.).
 *
 * Comportement :
 *   - En production : 404 par défaut, sauf si ENABLE_DEBUG_ROUTES === "true"
 *   - En dev/test : autorisé
 *
 * Usage dans une route :
 *
 *   const guard = guardDebugRoute();
 *   if (guard) return guard;
 *
 * Cette garde s'ajoute en plus de la vérification CRON_SECRET — elle ne la remplace pas.
 */
export function guardDebugRoute(): NextResponse | null {
    if (process.env.NODE_ENV !== "production") return null;
    if (process.env.ENABLE_DEBUG_ROUTES === "true") return null;
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
}
