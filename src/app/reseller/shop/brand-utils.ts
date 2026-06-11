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
/**
 * SEED_BRANDS — aligned 1:1 with the G2Bulk catalog (audit 2026-05-25).
 *
 * Source of truth: classification of all 980 G2Bulk products via their
 * `raw.category_title` field, mapped through `deriveG2BulkBrand`. Brands
 * are ordered by product count (largest first) so the landing surfaces the
 * widest selection at the top of the grid. Counts are reference values for
 * the landing render — actual counts are recomputed live from the catalog.
 *
 * To re-seed after a G2Bulk catalog change, re-run the classification audit
 * (see commit 9708b33) and update this list.
 */
/**
 * Brand type taxonomy.
 *
 *  - `giftcard` — region-locked wallet credit (Steam, PSN, Amazon, iTunes,
 *    etc.). Consumers redeem the code on the platform store, usually tied
 *    to a specific country/currency.
 *  - `topup`    — in-game currency packs (Free Fire Diamonds, PUBG UC,
 *    Yalla Gold, etc.). Usually global, redeemed inside a specific game
 *    account.
 *  - `mixed`    — brand sells both variants (e.g. Roblox = regional
 *    giftcards + global Robux top-ups).
 */
export type BrandType = "giftcard" | "topup" | "mixed";

export const SEED_BRANDS: ReadonlyArray<{
    slug: string;
    label: string;
    type: BrandType;
}> = [
    // ── Gift Cards (regional wallet credit) ──────────────────────────────
    { slug: "playstation", label: "PlayStation Network", type: "giftcard" },       // 192
    { slug: "steam", label: "Steam", type: "giftcard" },                            // 188
    { slug: "apple-itunes", label: "Apple iTunes", type: "giftcard" },              // 137
    { slug: "xbox", label: "XBOX", type: "giftcard" },                              // 98
    { slug: "google-play", label: "Google Play", type: "giftcard" },                // 78
    { slug: "nintendo-eshop", label: "Nintendo eShop", type: "giftcard" },          // 66
    { slug: "amazon", label: "Amazon", type: "giftcard" },                          // 62
    { slug: "razer-gold", label: "Razer Gold", type: "giftcard" },                  // 42
    { slug: "twitch", label: "Twitch", type: "giftcard" },                          // 7
    { slug: "nintendo-switch-online", label: "Nintendo Switch Online", type: "giftcard" }, // 2
    // ── Game Top-Ups (in-game currency, mostly global) ───────────────────
    { slug: "yalla-ludo", label: "Yalla Ludo", type: "topup" },                     // 16
    { slug: "pubg-mobile", label: "PUBG Mobile", type: "topup" },                   // 10
    { slug: "jawaker", label: "Jawaker", type: "topup" },                           // 8
    { slug: "valorant", label: "Valorant", type: "topup" },                         // 6
    { slug: "free-fire", label: "Free Fire", type: "topup" },                       // 5
    { slug: "minecraft", label: "Minecraft", type: "topup" },                       // 4
    { slug: "discord", label: "Discord", type: "topup" },                           // 3
    { slug: "imo", label: "IMO GiftCards", type: "topup" },                         // 2
    { slug: "new-state-mobile", label: "New State Mobile", type: "topup" },         // 1
    // ── Mixed (sells both giftcards AND top-ups) ─────────────────────────
    { slug: "roblox", label: "Roblox", type: "mixed" },                             // 52
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

/**
 * Derive the pricing *category* scope for a G2Bulk product. Used by the
 * pricing service's `category`-scope rule lookup (precedence is
 * sku > brand > category > global).
 *
 * SINGLE SOURCE OF TRUTH — both the catalog pricing path
 * (`g2bulk-shop-actions.ts`) and the checkout/wallet path
 * (`reseller/actions.ts`) MUST use this so the displayed price and the
 * debited price can never diverge.
 *
 * A numeric `categoryId` from the provider wins when present; otherwise we
 * fall back to a brand → category mapping keyed on the canonical brand
 * slugs returned by `deriveG2BulkBrand`.
 */
const GAMING_BRANDS: ReadonlySet<string> = new Set([
    "steam", "playstation", "xbox", "nintendo-eshop", "nintendo-switch-online",
    "valorant", "roblox", "minecraft", "fortnite", "call-of-duty",
    "clash-of-clans", "clash-royale", "mobile-legends", "free-fire",
    "pubg-mobile", "new-state-mobile", "twitch",
]);
const STREAMING_BRANDS: ReadonlySet<string> = new Set(["netflix", "spotify"]);
const MOBILE_BRANDS: ReadonlySet<string> = new Set([
    "apple-itunes", "google-play", "imo", "jawaker", "yalla-ludo", "discord",
]);

export function inferG2BulkCategory(
    categoryId: number | null,
    brand: string,
): string {
    // Numeric categoryId mappings (heuristic — admin can override via rules).
    if (categoryId === 10) return "retail";
    if (categoryId === 20 || categoryId === 40 || categoryId === 50) return "gaming";
    if (categoryId === 30) return "mobile";
    // Fallback from canonical brand slug.
    if (GAMING_BRANDS.has(brand)) return "gaming";
    if (STREAMING_BRANDS.has(brand)) return "streaming";
    if (MOBILE_BRANDS.has(brand)) return "mobile";
    return "retail";
}

export interface BrandCategory {
    slug: string;
    label: string;
    count: number;
    imageUrl: string;
    type: BrandType;
}

/**
 * Map a BSV catalog `category` (gaming/streaming/retail/mobile/unknown) to the
 * shop's BrandType taxonomy. BSV clusters are overwhelmingly regional wallet
 * credit and have no first-class "top-up" concept at the cluster level today,
 * so every category defaults to "giftcard"; SEED_BRANDS overrides win in the
 * grid for the few mixed/top-up brands. Pure helper — safe in client modules.
 */
export function bsvCategoryToBrandType(category: string): BrandType {
    void category;
    return "giftcard";
}
