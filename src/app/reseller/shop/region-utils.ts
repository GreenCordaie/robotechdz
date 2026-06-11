/**
 * Canonical region mapping for shop denomination grouping.
 *
 * Goals:
 *  1. Single source of truth — every product across BSV / G2Bulk / Kinguin
 *     resolves to an ISO-2 code (or one of the special "group" codes below).
 *  2. Merge duplicates — G2Bulk uses "Saudi Arabia", "Saudi", and "KSA"
 *     interchangeably for the same country; we collapse them all to "SA".
 *  3. Stable display labels — pills always show "SA · Saudi Arabia" using
 *     the canonical label, never the upstream variant.
 *  4. No fake regions — products without a real region (top-ups) are tagged
 *     `GLOBAL` instead of "—" so the UI can show "Worldwide".
 *
 * Audit source: 2026-05-25 sweep across all 980 G2Bulk products (54
 * distinct upstream region tokens). Update `REGION_ALIASES` when new
 * tokens appear in catalog sync logs.
 */

/** Canonical region code. ISO-3166 alpha-2 for countries, custom for groups. */
export type RegionCode = string;

export interface RegionEntry {
    /** ISO-2 (or special group code like "EU", "GLOBAL"). */
    readonly code: RegionCode;
    /** Human display label, used in pills and filter labels. */
    readonly label: string;
    /** Optional flag emoji for visual hint. Groups use 🌍 / 🇪🇺. */
    readonly flag: string;
}

/**
 * Canonical entries. Keep this list in sync with the upstream tokens we
 * actually see — adding a country here AND in REGION_ALIASES is enough to
 * route new products correctly.
 */
export const REGIONS: ReadonlyArray<RegionEntry> = [
    // Special group codes
    { code: "GLOBAL", label: "Global", flag: "🌍" },
    { code: "EU", label: "EU (multi-country)", flag: "🇪🇺" },
    // MENA
    { code: "SA", label: "Saudi Arabia", flag: "🇸🇦" },
    { code: "AE", label: "United Arab Emirates", flag: "🇦🇪" },
    { code: "QA", label: "Qatar", flag: "🇶🇦" },
    { code: "KW", label: "Kuwait", flag: "🇰🇼" },
    { code: "BH", label: "Bahrain", flag: "🇧🇭" },
    { code: "OM", label: "Oman", flag: "🇴🇲" },
    { code: "LB", label: "Lebanon", flag: "🇱🇧" },
    { code: "EG", label: "Egypt", flag: "🇪🇬" },
    { code: "TR", label: "Turkey", flag: "🇹🇷" },
    // Asia
    { code: "JP", label: "Japan", flag: "🇯🇵" },
    { code: "ID", label: "Indonesia", flag: "🇮🇩" },
    { code: "MY", label: "Malaysia", flag: "🇲🇾" },
    { code: "TH", label: "Thailand", flag: "🇹🇭" },
    { code: "PH", label: "Philippines", flag: "🇵🇭" },
    { code: "SG", label: "Singapore", flag: "🇸🇬" },
    { code: "VN", label: "Vietnam", flag: "🇻🇳" },
    { code: "TW", label: "Taiwan", flag: "🇹🇼" },
    { code: "HK", label: "Hong Kong", flag: "🇭🇰" },
    { code: "KR", label: "South Korea", flag: "🇰🇷" },
    { code: "IN", label: "India", flag: "🇮🇳" },
    { code: "CN", label: "China", flag: "🇨🇳" },
    // Americas
    { code: "US", label: "United States", flag: "🇺🇸" },
    { code: "CA", label: "Canada", flag: "🇨🇦" },
    { code: "MX", label: "Mexico", flag: "🇲🇽" },
    { code: "BR", label: "Brazil", flag: "🇧🇷" },
    { code: "AR", label: "Argentina", flag: "🇦🇷" },
    { code: "CO", label: "Colombia", flag: "🇨🇴" },
    // Europe (per-country)
    { code: "GB", label: "United Kingdom", flag: "🇬🇧" },
    { code: "DE", label: "Germany", flag: "🇩🇪" },
    { code: "FR", label: "France", flag: "🇫🇷" },
    { code: "ES", label: "Spain", flag: "🇪🇸" },
    { code: "IT", label: "Italy", flag: "🇮🇹" },
    { code: "PL", label: "Poland", flag: "🇵🇱" },
    { code: "HU", label: "Hungary", flag: "🇭🇺" },
    { code: "CZ", label: "Czech Republic", flag: "🇨🇿" },
    { code: "SK", label: "Slovakia", flag: "🇸🇰" },
    { code: "RO", label: "Romania", flag: "🇷🇴" },
    { code: "BE", label: "Belgium", flag: "🇧🇪" },
    { code: "NL", label: "Netherlands", flag: "🇳🇱" },
    { code: "CH", label: "Switzerland", flag: "🇨🇭" },
    { code: "AT", label: "Austria", flag: "🇦🇹" },
    { code: "SE", label: "Sweden", flag: "🇸🇪" },
    { code: "NO", label: "Norway", flag: "🇳🇴" },
    { code: "FI", label: "Finland", flag: "🇫🇮" },
    { code: "PT", label: "Portugal", flag: "🇵🇹" },
    { code: "GR", label: "Greece", flag: "🇬🇷" },
    { code: "RU", label: "Russia", flag: "🇷🇺" },
    // Oceania + Africa
    { code: "AU", label: "Australia", flag: "🇦🇺" },
    { code: "NZ", label: "New Zealand", flag: "🇳🇿" },
    { code: "ZA", label: "South Africa", flag: "🇿🇦" },
];

export const REGION_BY_CODE: ReadonlyMap<RegionCode, RegionEntry> = new Map(
    REGIONS.map((r) => [r.code, r]),
);

/**
 * Free-form-token → canonical code aliases. Ordered: longest, most-specific
 * patterns first so substring matches don't collide ("Saudi Arabia" must
 * win over "Saudi").
 */
const REGION_ALIASES: ReadonlyArray<readonly [RegExp, RegionCode]> = [
    // Groups
    [/\b(global|worldwide|ww|region\s*free)\b/i, "GLOBAL"],
    [/\beu\b/i, "EU"],
    // Two-word countries (try first to avoid the single-word collision)
    [/\bsaudi\s*arabia\b|\bksa\b/i, "SA"],
    [/\bunited\s*arab\s*emirates\b|\buae\b/i, "AE"],
    [/\bunited\s*kingdom\b|\buk\b/i, "GB"],
    [/\bunited\s*states\b|\busa\b|\bus\b/i, "US"],
    [/\bsouth\s*africa\b/i, "ZA"],
    [/\bsouth\s*korea\b|\bkorea\b/i, "KR"],
    [/\bnew\s*zealand\b/i, "NZ"],
    [/\bhong\s*kong\b/i, "HK"],
    [/\bczech\s*republic\b|\bczechia\b/i, "CZ"],
    // Single-word countries
    [/\bsaudi\b/i, "SA"],
    [/\bturkey\b|\bturkiye\b/i, "TR"],
    [/\bindonesia\b/i, "ID"],
    [/\bmalaysia\b/i, "MY"],
    [/\bjapan\b/i, "JP"],
    [/\bthailand\b/i, "TH"],
    [/\bphilippines\b/i, "PH"],
    [/\bsingapore\b/i, "SG"],
    [/\bvietnam\b/i, "VN"],
    [/\btaiwan\b/i, "TW"],
    [/\bindia\b/i, "IN"],
    [/\bchina\b/i, "CN"],
    [/\bcanada\b/i, "CA"],
    [/\bmexico\b/i, "MX"],
    [/\bbrazil\b/i, "BR"],
    [/\bargentina\b/i, "AR"],
    [/\bcolombia\b/i, "CO"],
    [/\bgermany\b/i, "DE"],
    [/\bfrance\b/i, "FR"],
    [/\bspain\b/i, "ES"],
    [/\bitaly\b/i, "IT"],
    [/\bpoland\b/i, "PL"],
    [/\bhungary\b/i, "HU"],
    [/\bslovakia\b/i, "SK"],
    [/\bromania\b/i, "RO"],
    [/\bbelgium\b/i, "BE"],
    [/\bnetherlands\b/i, "NL"],
    [/\bswitzerland\b/i, "CH"],
    [/\baustria\b/i, "AT"],
    [/\bsweden\b/i, "SE"],
    [/\bnorway\b/i, "NO"],
    [/\bfinland\b/i, "FI"],
    [/\bportugal\b/i, "PT"],
    [/\bgreece\b/i, "GR"],
    [/\brussia\b/i, "RU"],
    [/\baustralia\b/i, "AU"],
    [/\bqatar\b/i, "QA"],
    [/\bkuwait\b/i, "KW"],
    [/\bbahrain\b/i, "BH"],
    [/\boman\b/i, "OM"],
    [/\blebanon\b/i, "LB"],
    [/\begypt\b/i, "EG"],
];

/**
 * Resolve a free-form region string (often a category title like "Steam
 * Malaysia", "PSN UK", "Apple iTunes Saudi Arabia") to a canonical
 * RegionCode. Returns `null` when nothing matches (top-up products that
 * have no region get classified as GLOBAL by the caller).
 */
export function resolveRegion(...sources: ReadonlyArray<string | null | undefined>): RegionCode | null {
    for (const src of sources) {
        if (!src) continue;
        for (const [re, code] of REGION_ALIASES) {
            if (re.test(src)) return code;
        }
        // Last-resort: a bare 2-letter uppercase token at end of string
        // (defensive; most BSV/G2Bulk strings don't use this).
        const m = src.match(/\b([A-Z]{2})\b\s*$/);
        if (m && REGION_BY_CODE.has(m[1])) return m[1];
    }
    return null;
}

export function regionLabel(code: RegionCode | null): string {
    if (!code) return "Other";
    return REGION_BY_CODE.get(code)?.label ?? code;
}

export function regionFlag(code: RegionCode | null): string {
    if (!code) return "❔";
    return REGION_BY_CODE.get(code)?.flag ?? "🏳️";
}
