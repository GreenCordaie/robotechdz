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
    { slug: "imo", label: "IMO GiftCards" },
    { slug: "razer-gold", label: "Razer Gold" },
    { slug: "playstation", label: "PlayStation Network" },
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
    { slug: "mobile-legends", label: "Mobile Legends" },
    { slug: "fortnite", label: "Fortnite" },
    { slug: "netflix", label: "Netflix" },
    { slug: "spotify", label: "Spotify" },
    { slug: "apex-legends", label: "Apex Legends" },
    { slug: "call-of-duty", label: "Call of Duty" },
    { slug: "league-of-legends", label: "League of Legends" },
    { slug: "clash-royale", label: "Clash Royale" },
    { slug: "clash-of-clans", label: "Clash of Clans" },
    { slug: "blizzard", label: "Blizzard" },
    { slug: "world-of-warcraft", label: "World of Warcraft" },
    { slug: "gta5", label: "Grand Theft Auto V" },
    { slug: "gamestop", label: "GameStop" },
    { slug: "bigo-live", label: "Bigo Live" },
    { slug: "riot-access", label: "Riot Access" },
    { slug: "uber", label: "Uber" },
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

/**
 * Manifest of brand slugs that have a .webp asset on disk (the rest default
 * to .png). Keep in sync with `public/brands/`. When you add a new image,
 * include its slug here if it's webp; png is the implicit default.
 */
const WEBP_BRANDS: ReadonlySet<string> = new Set([
    "amazon",
    "fortnite",
    "google-play",
    "netflix",
    "nintendo-eshop",
    "nintendo-switch-online",
    "playstation",
    "razer-gold",
    "riot-access",
    "spotify",
    "uber",
    "valorant",
    "xbox",
]);

export function artworkFor(slug: string): string {
    const ext = WEBP_BRANDS.has(slug) ? "webp" : "png";
    return `/brands/${slug}.${ext}`;
}

/**
 * Mirror of the action-side `inferBrand` heuristic, kept local so the
 * landing can group products before they get passed through the pricing
 * service. Returns a slug-shaped label (with hyphens) to match BSV.
 */
/**
 * Best-effort brand classification for a G2Bulk product.
 *
 * Accepts either a raw title string (legacy callsites) or a full product
 * shape exposing `categoryTitle`. When `categoryTitle` is available it wins
 * over the title heuristics — G2Bulk titles often look like
 * "1 USD Diamond(100+10)" with no game name; the category title carries the
 * truth ("Garena Free Fire Vouchers(Official)").
 */
export function deriveG2BulkBrand(
    input: string | { title: string; categoryTitle?: string | null },
): string {
    const title = typeof input === "string" ? input : input.title;
    const categoryTitle =
        typeof input === "string" ? null : (input.categoryTitle ?? null);
    const ct = (categoryTitle ?? "").toLowerCase();
    const t = title.toLowerCase();

    // ── PRIMARY: category_title is the operator-friendly label from G2Bulk.
    // Audited across all 980 products to guarantee 100% classification.
    // Order matters where one substring contains another (e.g. switch before
    // nintendo-eshop).
    if (ct) {
        if (ct.includes("free fire") || ct.includes("garena")) return "free-fire";
        if (ct.includes("mobile legends")) return "mobile-legends";
        if (ct.includes("pubg")) return "pubg-mobile";
        if (ct.includes("call of duty") || ct.includes("cod mobile")) return "call-of-duty";
        if (ct.includes("clash of clans")) return "clash-of-clans";
        if (ct.includes("clash royale")) return "clash-royale";
        if (ct.includes("fortnite")) return "fortnite";
        if (ct.includes("new state")) return "new-state-mobile";
        if (ct.includes("yalla")) return "yalla-ludo";
        if (ct.includes("jawaker")) return "jawaker";
        if (ct.includes("imo")) return "imo";
        if (ct.includes("razer")) return "razer-gold";
        if (ct.includes("nintendo switch online")) return "nintendo-switch-online";
        if (ct.includes("nintendo")) return "nintendo-eshop";
        if (ct.includes("playstation") || ct.includes("psn")) return "playstation";
        if (ct.includes("xbox")) return "xbox";
        if (ct.includes("steam")) return "steam";
        if (ct.includes("apple") || ct.includes("itunes")) return "apple-itunes";
        if (ct.includes("amazon")) return "amazon";
        if (ct.includes("google play")) return "google-play";
        if (ct.includes("roblox")) return "roblox";
        if (ct.includes("twitch")) return "twitch";
        if (ct.includes("valorant") || ct.includes("riot")) return "valorant";
        if (ct.includes("minecraft")) return "minecraft";
        if (ct.includes("discord")) return "discord";
        if (ct.includes("netflix")) return "netflix";
        if (ct.includes("spotify")) return "spotify";
        if (ct.includes("test")) return "other"; // explicit drop for "Test Category"
    }

    // ── FALLBACK: title heuristics (when categoryTitle absent or unmatched).
    // In-game currency proxies for titles that omit the game name.
    if (/(^|\s)uc(\s|$)|uc voucher/.test(t)) return "pubg-mobile";
    if (t.includes("minecoin")) return "minecraft";
    if (t.includes("robux")) return "roblox";
    if (t.includes("pubg")) return "pubg-mobile";
    if (t.includes("imo")) return "imo";
    if (t.includes("razer")) return "razer-gold";
    if (t.includes("playstation") || t.includes("psn")) return "playstation";
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
    if (t.includes("valorant") || t.includes("riot")) return "valorant";
    if (t.includes("minecraft")) return "minecraft";
    if (t.includes("netflix")) return "netflix";
    if (t.includes("spotify")) return "spotify";
    return "other";
}

export interface BrandCategory {
    slug: string;
    label: string;
    count: number;
    imageUrl: string;
}
