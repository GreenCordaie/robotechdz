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

interface PurchaseInput {
    readonly planId: string;
    readonly customerId?: string;
    readonly customerInfo?: Record<string, unknown>;
}

interface ProvisionTaskShape {
    taskId?: string;
    id?: string;
    orderId?: string;
    status?: "queued" | "processing" | "completed" | "failed";
    result?: { code?: string; extraCodes?: readonly string[] } | null;
    error?: string | null;
}

/**
 * Place a buy order for a single Active Code plan. The LoadBrain side
 * mints a provision task and the worker runs the panel handshake; we
 * poll the order status here for up to 60s before falling back to
 * "in progress" so the customer-facing surface doesn't hang.
 */
export async function purchaseActiveCodeAction(input: PurchaseInput): Promise<
    | { ok: true; status: "completed"; orderId: string; code: string; extraCodes: ReadonlyArray<string> }
    | { ok: true; status: "pending"; orderId: string }
    | { ok: false; error: string }
> {
    const auth = resolveLoadBrainAuth();
    if (!auth) {
        return { ok: false, error: "LoadBrain not configured" };
    }
    const planId = input.planId.trim();
    if (!planId) {
        return { ok: false, error: "missing planId" };
    }

    let buyJson: { success?: boolean; data?: ProvisionTaskShape };
    try {
        const buyRes = await fetch(`${auth.baseUrl}/api/v1/giftcards/reseller-order/active-code`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": auth.apiKey,
            },
            body: JSON.stringify({
                planId,
                customerId: input.customerId,
                customerInfo: input.customerInfo,
            }),
            cache: "no-store",
        });
        if (!buyRes.ok) {
            const body = (await buyRes.json().catch(() => ({}))) as { error?: string };
            return { ok: false, error: body.error ?? `upstream ${buyRes.status}` };
        }
        buyJson = (await buyRes.json()) as { success?: boolean; data?: ProvisionTaskShape };
    } catch (err) {
        return {
            ok: false,
            error: err instanceof Error ? err.message : "network error",
        };
    }

    const task = buyJson.data;
    const orderId = task?.orderId;
    if (!orderId) {
        return { ok: false, error: "upstream returned no order id" };
    }

    // Already terminal on the first POST? Forward straight away.
    if (task?.status === "completed" && task.result?.code) {
        return {
            ok: true,
            status: "completed",
            orderId,
            code: task.result.code,
            extraCodes: task.result.extraCodes ?? [],
        };
    }
    if (task?.status === "failed") {
        return { ok: false, error: task.error ?? "provisioning failed" };
    }

    // Poll the status. The worker dispatches the panel handshake which
    // can take a handful of seconds; cap the wait at 60s so the UI
    // stays responsive even when the panel is sluggish.
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        try {
            const pollRes = await fetch(
                `${auth.baseUrl}/api/v1/giftcards/reseller-order/active-code/${encodeURIComponent(orderId)}/status`,
                {
                    headers: { "X-API-Key": auth.apiKey },
                    cache: "no-store",
                },
            );
            if (!pollRes.ok) continue;
            const pollJson = (await pollRes.json()) as { success?: boolean; data?: ProvisionTaskShape };
            const t = pollJson.data;
            if (t?.status === "completed" && t.result?.code) {
                return {
                    ok: true,
                    status: "completed",
                    orderId,
                    code: t.result.code,
                    extraCodes: t.result.extraCodes ?? [],
                };
            }
            if (t?.status === "failed") {
                return { ok: false, error: t.error ?? "provisioning failed" };
            }
        } catch {
            // Transient — keep polling.
        }
    }

    return { ok: true, status: "pending", orderId };
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
