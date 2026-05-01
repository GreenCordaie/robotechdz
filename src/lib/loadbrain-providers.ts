// src/lib/loadbrain-providers.ts
/**
 * Mapping LoadBrain providerId (UUID stable prod) → slug technique attendu
 * dans customerInfo.iptvProvider pour les combos Ibosol.
 *
 * Référence: GET /api/v1/catalog renvoie ces UUIDs.
 */
export const PROVIDER_SLUGS: Record<string, string> = {
    "0eb51cbb-ba96-452d-b0a1-87b71d6cbea4": "panelking365",
    "46346069-075f-44f4-bf38-d1b876af3c6a": "ironmax",
    "7865ebe3-a204-4c1c-aba7-de17aef1193d": "atlaspro",
};

export function getProviderSlug(providerId: string): string {
    const slug = PROVIDER_SLUGS[providerId];
    if (!slug) {
        throw new Error(`Unknown LoadBrain providerId: ${providerId}`);
    }
    return slug;
}
