"use server";

/**
 * Active Code reseller storefront — server actions.
 *
 * Reads from the LoadBrain public reseller route
 * (`/api/v1/giftcards/reseller-catalog/active-code`) using the site's
 * X-API-Key (`LOADBRAIN_API_KEY` env). The siteId is derived server-side
 * by LoadBrain from the validated key, so callers cannot probe another
 * site's catalog.
 *
 * Source-hiding contract: the upstream `brand` field is hard-mapped to
 * "Code Premium" by the LoadBrain projection; the panel name never
 * appears here. Any future drift is caught by `pnpm sanitize:audit`.
 */

interface ActiveCodeItemUpstream {
    id: string;
    slug: string;
    brand: string; // always "Code Premium" per LB projection
    category: string; // always "active_code"
    sub_category: string; // panel taxonomy: iptv|test|vod|mango|server|internet|legacy_iptv
    region: string | null;
    face_value: number | null;
    face_unit: string | null;
    display_name: string;
    description_fr: string | null;
    image_sha256: string | null;
    image_cdn_url: string | null;
    reseller_price_dzd_cents: number | null;
}

export interface ActiveCodeListResult {
    items: ReadonlyArray<{
        readonly id: string;
        readonly title: string;
        readonly subCategory: "iptv" | "test" | "vod" | "mango" | "server" | "internet" | "legacy";
        readonly region: string;
        readonly priceDzd: number | null;
        readonly description: string | null;
    }>;
    total: number;
}

function normalizeSubCategory(raw: string): ActiveCodeListResult["items"][number]["subCategory"] {
    if (raw === "legacy_iptv") return "legacy";
    if (
        raw === "iptv" || raw === "test" || raw === "vod"
        || raw === "mango" || raw === "server" || raw === "internet"
    ) return raw;
    return "iptv";
}

interface ListParams {
    readonly subCategory?: string; // empty string or panel taxonomy
    readonly search?: string;
    readonly limit?: number;
    readonly offset?: number;
}

/**
 * Resolve the LoadBrain base URL + API key from env. Returns null when
 * the env is missing — callers should render an empty state in that
 * case rather than crash.
 */
function resolveLoadBrainAuth(): { baseUrl: string; apiKey: string } | null {
    const apiKey = process.env.LOADBRAIN_API_KEY;
    const baseUrl = process.env.LOADBRAIN_URL;
    if (!apiKey || !baseUrl) return null;
    return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
}

export async function getActiveCodeCatalogAction(
    params: ListParams = {},
): Promise<{ ok: true; data: ActiveCodeListResult } | { ok: false; error: string }> {
    const auth = resolveLoadBrainAuth();
    if (!auth) {
        return { ok: false, error: "LoadBrain not configured" };
    }

    const qs = new URLSearchParams();
    if (params.subCategory) {
        qs.set("category", params.subCategory === "legacy" ? "legacy_iptv" : params.subCategory);
    }
    if (params.search) qs.set("search", params.search);
    qs.set("limit", String(Math.min(Math.max(params.limit ?? 100, 1), 200)));
    qs.set("offset", String(Math.max(params.offset ?? 0, 0)));

    try {
        const url = `${auth.baseUrl}/api/v1/giftcards/reseller-catalog/active-code?${qs.toString()}`;
        const res = await fetch(url, {
            method: "GET",
            headers: { "X-API-Key": auth.apiKey },
            // Avoid Next.js caching reseller catalog responses — pricing
            // and stock can move on every order.
            cache: "no-store",
        });
        if (!res.ok) {
            return { ok: false, error: `upstream ${res.status}` };
        }
        const body = (await res.json()) as {
            success?: boolean;
            data?: { items?: ActiveCodeItemUpstream[]; total?: number };
        };
        const items = body.data?.items ?? [];
        const total = Number(body.data?.total ?? 0);
        return {
            ok: true,
            data: {
                items: items.map((it) => ({
                    id: it.id,
                    title: it.display_name,
                    subCategory: normalizeSubCategory(it.sub_category),
                    region: it.region ?? "GLOBAL",
                    priceDzd:
                        typeof it.reseller_price_dzd_cents === "number"
                            ? Math.round(it.reseller_price_dzd_cents / 100)
                            : null,
                    description: it.description_fr ?? null,
                })),
                total,
            },
        };
    } catch (err) {
        return {
            ok: false,
            error: err instanceof Error ? err.message : "network error",
        };
    }
}
