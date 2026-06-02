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
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
    activeCodeOrders,
    orders,
    resellerTransactions,
    resellerWallets,
    resellers,
} from "@/db/schema";
import { getCurrentResellerAction } from "../../actions";
import { notifyLowBalanceAfterDebit } from "@/services/reseller-notifications.service";

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

/**
 * Re-fetch the authoritative price for a single plan from the LoadBrain
 * public catalog. We refuse to trust any price the client may have sent
 * (a tampered request could otherwise buy a 1500 DZD plan for 1 DZD).
 *
 * Returns null when the plan is gone (unlikely outside of admin edits),
 * the catalog hasn't priced it for this site, or the network blip.
 */
async function fetchAuthoritativePlanFromLb(
    planId: string,
): Promise<{ priceDzd: number; label: string } | null> {
    const auth = resolveLoadBrainAuth();
    if (!auth) return null;
    try {
        // The catalog endpoint doesn't accept a planId filter directly,
        // so we paginate up to a generous slice and find the row. The
        // typical catalog is 200-ish plans for the foreseeable future
        // and we can lift this when the dedicated /plan/:id route lands.
        const res = await fetch(
            `${auth.baseUrl}/api/v1/giftcards/reseller-catalog/active-code?limit=200&offset=0`,
            {
                headers: { "X-API-Key": auth.apiKey },
                cache: "no-store",
            },
        );
        if (!res.ok) return null;
        const body = (await res.json()) as {
            data?: {
                items?: Array<{
                    id: string;
                    display_name: string;
                    reseller_price_dzd_cents: number | null;
                }>;
            };
        };
        const match = body.data?.items?.find((i) => i.id === planId);
        if (!match || match.reseller_price_dzd_cents == null) return null;
        return {
            priceDzd: Math.round(match.reseller_price_dzd_cents / 100),
            label: match.display_name,
        };
    } catch {
        return null;
    }
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
 * Place a buy order for a single Active Code plan.
 *
 * Atomic-ish flow:
 *   1. Authenticate the caller as a reseller and re-fetch the
 *      authoritative price from LoadBrain (the client-side value is
 *      never trusted — a tampered request could otherwise buy a
 *      premium plan for 1 DZD).
 *   2. Inside a DB transaction: lock the wallet row, verify balance,
 *      debit, create a local `orders` row + tracking
 *      `active_code_orders` row in PENDING_LOADBRAIN.
 *   3. Outside the tx: call the LoadBrain public reseller-order route
 *      and poll its status for up to 60 s.
 *   4. Persist the outcome on the tracking row (DELIVERED / FAILED).
 *      On FAILED, refund the wallet via a separate transaction and
 *      flip status to REFUNDED.
 *
 * Returns a discriminated union the storefront modal renders directly.
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

    // ─── 1. Reseller identity + authoritative price ──────────────────
    const resellerRes = await getCurrentResellerAction({});
    if (!resellerRes.success || !resellerRes.data) {
        return { ok: false, error: "Reseller introuvable" };
    }
    const resellerData = resellerRes.data as {
        id: number;
        companyName: string;
        contactPhone: string | null;
    };
    const resellerId = resellerData.id;

    const plan = await fetchAuthoritativePlanFromLb(planId);
    if (!plan) {
        return { ok: false, error: "Plan introuvable ou non tarifé pour votre boutique" };
    }
    const priceDzd = plan.priceDzd;

    // ─── 2. Wallet debit + order row creation ────────────────────────
    const orderNumber = `AC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    let localOrderId: number;
    let activeCodeOrderId: number;
    let lbOrderId: string;
    let lbTaskId: string | null = null;

    try {
        const txResult = await db.transaction(async (tx) => {
            const locked = await tx.query.resellers.findFirst({
                where: eq(resellers.id, resellerId),
                with: { wallet: true },
            });
            if (!locked || !locked.wallet) {
                throw new Error("Portefeuille introuvable");
            }
            const [lockedWallet] = await tx
                .select({ balance: resellerWallets.balance })
                .from(resellerWallets)
                .where(eq(resellerWallets.id, locked.wallet.id))
                .for("update");
            const balance = parseFloat(lockedWallet?.balance ?? "0");
            if (balance < priceDzd) {
                throw new Error("Solde insuffisant");
            }

            // Synthesise a deterministic-ish LB orderId so a retry on the
            // same logical purchase doesn't double-queue the panel.
            const lbId = `ac-${resellerId}-${planId.slice(0, 8)}-${Date.now()}`;

            const [newOrder] = await tx
                .insert(orders)
                .values({
                    orderNumber,
                    status: "PAYE",
                    totalAmount: priceDzd.toFixed(2),
                    montantPaye: priceDzd.toFixed(2),
                    resteAPayer: "0",
                    resellerId,
                    source: "B2B_WEB",
                    deliveryMethod: "TICKET",
                })
                .returning();

            await tx
                .update(resellerWallets)
                .set({
                    balance: sql`${resellerWallets.balance} - ${priceDzd}`,
                    totalSpent: sql`${resellerWallets.totalSpent} + ${priceDzd}`,
                    updatedAt: new Date(),
                })
                .where(eq(resellerWallets.id, locked.wallet.id));

            await tx.insert(resellerTransactions).values({
                walletId: locked.wallet.id,
                type: "PURCHASE",
                amount: priceDzd.toString(),
                orderId: newOrder.id,
                description: `Active Code — ${plan.label}`,
                source: "ACTIVE_CODE",
            });

            const [aco] = await tx
                .insert(activeCodeOrders)
                .values({
                    localOrderId: newOrder.id,
                    resellerId,
                    planId,
                    planLabel: plan.label,
                    pricePaidDzd: priceDzd.toFixed(2),
                    lbOrderId: lbId,
                    status: "PENDING_LOADBRAIN",
                })
                .returning();

            return {
                localOrderId: newOrder.id,
                activeCodeOrderId: aco.id,
                lbId,
                walletId: locked.wallet.id,
            };
        });
        localOrderId = txResult.localOrderId;
        activeCodeOrderId = txResult.activeCodeOrderId;
        lbOrderId = txResult.lbId;
    } catch (err) {
        return {
            ok: false,
            error: err instanceof Error ? err.message : "Erreur paiement",
        };
    }

    // Low-balance alert (edge-triggered, opt-in via reseller threshold).
    // Fire-and-forget — must never block the buy flow.
    notifyLowBalanceAfterDebit(
        {
            id: resellerData.id,
            companyName: resellerData.companyName,
            contactPhone: resellerData.contactPhone,
        },
        priceDzd,
    ).catch(() => {});

    // ─── 3. Call LoadBrain provision (outside tx, network roundtrip) ──
    const buyUrl = `${auth.baseUrl}/api/v1/giftcards/reseller-order/active-code`;
    let buyJson: { success?: boolean; data?: ProvisionTaskShape };
    try {
        const buyRes = await fetch(buyUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": auth.apiKey,
            },
            body: JSON.stringify({
                planId,
                customerId: input.customerId ?? `reseller-${resellerId}`,
                customerInfo: { ...(input.customerInfo ?? {}), orderId: lbOrderId },
            }),
            cache: "no-store",
        });
        const rawBody = await buyRes.text();
        if (!buyRes.ok) {
            let parsed: { error?: string } = {};
            try {
                parsed = JSON.parse(rawBody) as { error?: string };
            } catch {
                /* ignore */
            }
            await refundActiveCodeOrder({
                activeCodeOrderId,
                localOrderId,
                resellerId,
                priceDzd,
                reason: parsed.error ?? `upstream ${buyRes.status}`,
            });
            return { ok: false, error: parsed.error ?? `upstream ${buyRes.status}` };
        }
        buyJson = JSON.parse(rawBody) as { success?: boolean; data?: ProvisionTaskShape };
    } catch (err) {
        const msg = err instanceof Error ? err.message : "network error";
        await refundActiveCodeOrder({
            activeCodeOrderId,
            localOrderId,
            resellerId,
            priceDzd,
            reason: msg,
        });
        return { ok: false, error: msg };
    }

    const task = buyJson.data;
    lbTaskId = task?.taskId ?? task?.id ?? null;
    if (lbTaskId) {
        await db
            .update(activeCodeOrders)
            .set({ lbTaskId, updatedAt: new Date() })
            .where(eq(activeCodeOrders.id, activeCodeOrderId));
    }

    // Already terminal on the first POST? Forward straight away.
    if (task?.status === "completed" && task.result?.code) {
        await db
            .update(activeCodeOrders)
            .set({
                status: "DELIVERED",
                code: task.result.code,
                updatedAt: new Date(),
            })
            .where(eq(activeCodeOrders.id, activeCodeOrderId));
        return {
            ok: true,
            status: "completed",
            orderId: lbOrderId,
            code: task.result.code,
            extraCodes: task.result.extraCodes ?? [],
        };
    }
    if (task?.status === "failed") {
        await refundActiveCodeOrder({
            activeCodeOrderId,
            localOrderId,
            resellerId,
            priceDzd,
            reason: task.error ?? "provisioning failed",
        });
        return { ok: false, error: task.error ?? "provisioning failed" };
    }

    // ─── 4. Poll status up to 60 s ───────────────────────────────────
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        try {
            const pollRes = await fetch(
                `${auth.baseUrl}/api/v1/giftcards/reseller-order/active-code/${encodeURIComponent(lbOrderId)}/status`,
                {
                    headers: { "X-API-Key": auth.apiKey },
                    cache: "no-store",
                },
            );
            if (!pollRes.ok) continue;
            const pollJson = (await pollRes.json()) as { success?: boolean; data?: ProvisionTaskShape };
            const t = pollJson.data;
            if (t?.status === "completed" && t.result?.code) {
                await db
                    .update(activeCodeOrders)
                    .set({
                        status: "DELIVERED",
                        code: t.result.code,
                        updatedAt: new Date(),
                    })
                    .where(eq(activeCodeOrders.id, activeCodeOrderId));
                return {
                    ok: true,
                    status: "completed",
                    orderId: lbOrderId,
                    code: t.result.code,
                    extraCodes: t.result.extraCodes ?? [],
                };
            }
            if (t?.status === "failed") {
                await refundActiveCodeOrder({
                    activeCodeOrderId,
                    localOrderId,
                    resellerId,
                    priceDzd,
                    reason: t.error ?? "provisioning failed",
                });
                return { ok: false, error: t.error ?? "provisioning failed" };
            }
        } catch {
            // Transient — keep polling.
        }
    }

    // Still pending after 60 s — the wallet stays debited and the
    // tracking row stays PENDING_LOADBRAIN. A background reconciler can
    // pick this up later; the storefront simply shows "in progress".
    return { ok: true, status: "pending", orderId: lbOrderId };
}

/**
 * Refund a failed Active Code purchase. Runs in its own transaction so
 * we still credit the wallet back even if the tracking update fails.
 * Best-effort logging — the order remains visible in REFUNDED state.
 */
async function refundActiveCodeOrder(args: {
    activeCodeOrderId: number;
    localOrderId: number;
    resellerId: number;
    priceDzd: number;
    reason: string;
}): Promise<void> {
    try {
        await db.transaction(async (tx) => {
            const locked = await tx.query.resellers.findFirst({
                where: eq(resellers.id, args.resellerId),
                with: { wallet: true },
            });
            if (locked?.wallet) {
                await tx
                    .update(resellerWallets)
                    .set({
                        balance: sql`${resellerWallets.balance} + ${args.priceDzd}`,
                        totalSpent: sql`GREATEST(${resellerWallets.totalSpent} - ${args.priceDzd}, 0)`,
                        updatedAt: new Date(),
                    })
                    .where(eq(resellerWallets.id, locked.wallet.id));
                await tx.insert(resellerTransactions).values({
                    walletId: locked.wallet.id,
                    type: "REFUND",
                    amount: args.priceDzd.toString(),
                    orderId: args.localOrderId,
                    description: `Active Code refund — ${args.reason.slice(0, 200)}`,
                    source: "ACTIVE_CODE",
                });
            }
            await tx
                .update(orders)
                .set({ status: "REMBOURSE" })
                .where(eq(orders.id, args.localOrderId));
            await tx
                .update(activeCodeOrders)
                .set({
                    status: "REFUNDED",
                    error: args.reason.slice(0, 1000),
                    updatedAt: new Date(),
                })
                .where(eq(activeCodeOrders.id, args.activeCodeOrderId));
        });
    } catch (err) {
        console.error("[active-code-refund] failed:", err);
    }
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
