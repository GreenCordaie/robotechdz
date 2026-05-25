/**
 * Pure helpers for the categorized landing. Kept separate from
 * `aggregate-brands.ts` (a `"use server"` module) so client components can
 * import these without forcing a server-action boundary.
 */

/**
 * Seed list mirrored from the g2bulk.com reference design. We want the
 * landing to always show these even when neither catalog has live items for
 * them yet (operators expect a consistent gallery on first paint).
 */
export const SEED_BRANDS: ReadonlyArray<{ slug: string; label: string }> = [
    { slug: "pubg-mobile", label: "PUBG Mobile" },
    { slug: "imo-giftcards", label: "IMO GiftCards" },
    { slug: "razer-gold", label: "Razer Gold" },
    { slug: "playstation-network", label: "PlayStation Network" },
    { slug: "free-fire", label: "Free Fire" },
    { slug: "yalla-ludo", label: "Yalla Ludo" },
    { slug: "new-state-mobile", label: "New State Mobile" },
    { slug: "discord", label: "Discord" },
    { slug: "steam", label: "Steam" },
    { slug: "apple-itunes", label: "Apple iTunes" },
    { slug: "roblox", label: "Roblox" },
    { slug: "nintendo-eshop", label: "Nintendo eShop" },
    { slug: "xbox", label: "XBOX" },
    { slug: "google-play", label: "Google Play" },
    { slug: "amazon", label: "Amazon" },
    { slug: "jawaker", label: "Jawaker" },
    { slug: "twitch", label: "Twitch" },
    { slug: "valorant", label: "Valorant" },
    { slug: "minecraft", label: "Minecraft" },
    { slug: "nintendo-switch-online", label: "Nintendo Switch Online" },
    { slug: "test", label: "Test" },
];

/**
 * Convert a free-form brand string into a stable slug usable as URL segment
 * + image filename. Collapses non-alphanumerics so we never produce empty
 * segments.
 */
export function toBrandSlug(raw: string): string {
    return raw
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

export function prettifyLabel(slug: string): string {
    return slug
        .split("-")
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

export function artworkFor(slug: string): string {
    return `/brands/${slug}.png`;
}

/**
 * Mirror of the action-side `inferBrand` heuristic, kept local so the
 * landing can group products before they get passed through the pricing
 * service. Returns a slug-shaped label (with hyphens) to match BSV.
 */
export function deriveG2BulkBrand(title: string): string {
    const t = title.toLowerCase();
    if (t.includes("pubg")) return "pubg-mobile";
    if (t.includes("imo")) return "imo-giftcards";
    if (t.includes("razer")) return "razer-gold";
    if (t.includes("playstation") || t.includes("psn")) return "playstation-network";
    if (t.includes("free fire")) return "free-fire";
    if (t.includes("yalla")) return "yalla-ludo";
    if (t.includes("new state")) return "new-state-mobile";
    if (t.includes("discord")) return "discord";
    if (t.includes("steam")) return "steam";
    if (t.includes("itunes") || t.includes("apple")) return "apple-itunes";
    if (t.includes("roblox")) return "roblox";
    if (t.includes("nintendo") && t.includes("switch")) return "nintendo-switch-online";
    if (t.includes("nintendo")) return "nintendo-eshop";
    if (t.includes("xbox")) return "xbox";
    if (t.includes("google play")) return "google-play";
    if (t.includes("amazon")) return "amazon";
    if (t.includes("jawaker")) return "jawaker";
    if (t.includes("twitch")) return "twitch";
    if (t.includes("valorant")) return "valorant";
    if (t.includes("minecraft")) return "minecraft";
    return "other";
}

export interface BrandCategory {
    slug: string;
    label: string;
    count: number;
    imageUrl: string;
}
