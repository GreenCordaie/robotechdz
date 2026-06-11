"use server";

import { db } from "@/db";
import {
    resellers,
    orders,
    resellerWallets,
    resellerTransactions,
    g2bulkOrders,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { withAuth } from "@/lib/security";
import { UserRole } from "@/lib/constants";
import { z } from "zod";
import { TierService } from "@/services/tier.service";
import {
    g2bulkPricingService,
    type ComputedPrice,
} from "@/services/g2bulk-pricing.service";
import { ResellerNotifications, notifyLowBalanceAfterDebit } from "@/services/reseller-notifications.service";
import { markRefunded } from "@/services/g2bulk-reconciler.service";
import { buildGameWonSnapshot } from "./game-snapshot";

/* ----------------------------------------------------------------------
 * G2Bulk GAME TOP-UPS (in-game currency) — distinct surface from gift-card
 * vouchers. LoadBrain exposes these under /api/v2/g2bulk/games/* (the SDK v2
 * has no `games` namespace yet, so we call the gateway directly).
 *
 *   GET  /games                       → list of games
 *   GET  /games/:code/catalogue       → { game, items[] } sellable packages
 *   GET  /games/:code/fields          → required player fields (per game)
 *   POST /games/orders                → place a top-up order
 * --------------------------------------------------------------------- */

export interface G2BulkGame {
    id: number;
    providerId: string;
    code: string;
    name: string;
    imageUrl: string | null;
    isActive: boolean;
}

export interface G2BulkGamePackage {
    id: number;
    providerId: string;
    gameId: number;
    gameCode: string;
    name: string;
    unitPriceCents: number;
    currency: string;
    isActive: boolean;
}

/** A player input field required to fulfil a top-up, as declared upstream. */
export interface G2BulkGameField {
    key: string;
    label: string;
    type: "string" | "enum";
    required: boolean;
    /** Present when `type === "enum"`: value → display label. */
    options?: Record<string, string>;
}

export interface EnrichedGamePackage {
    catalogueId: number;
    name: string;
    unitPriceCents: number;
    currency: string;
    pricing: ComputedPrice;
}

export interface GameCatalogueMeta {
    tierName: string | null;
    tierDiscountPct: number;
    customDiscountPct: number;
    conversionRate: number;
}

const LB_TIMEOUT_MS = 15_000;

/** Server-only fetch against the LoadBrain v2 gateway. Throws on non-OK. */
async function lbGames<T>(path: string, init?: RequestInit): Promise<T> {
    const base = process.env.LOADBRAIN_URL;
    const key = process.env.LOADBRAIN_API_KEY;
    if (!base || !key) throw new Error("LoadBrain n'est pas configuré (LOADBRAIN_URL/API_KEY)");
    const res = await fetch(`${base}${path}`, {
        ...init,
        headers: {
            "X-API-Key": key,
            "Content-Type": "application/json",
            ...(init?.headers ?? {}),
        },
        signal: AbortSignal.timeout(LB_TIMEOUT_MS),
    });
    const text = await res.text();
    let json: { success?: boolean; data?: unknown; error?: unknown } | null = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch {
        json = null;
    }
    if (!res.ok || !json?.success) {
        // The upstream `error` may be a string, a structured object, or absent
        // (e.g. a bare 403 with empty body). Always surface a readable string —
        // never let `new Error(object)` collapse to "[object Object]".
        const e = json?.error;
        const detail =
            typeof e === "string"
                ? e
                : e && typeof e === "object" && "message" in e
                  ? String((e as { message: unknown }).message)
                  : e
                    ? JSON.stringify(e)
                    : text
                      ? text.slice(0, 300)
                      : "(réponse vide)";
        throw new Error(`G2Bulk games (HTTP ${res.status}) : ${detail}`);
    }
    return json.data as T;
}

/** Resolve the calling reseller's pricing context (tier + custom discount). */
async function resolvePricingContext(userId: number) {
    const reseller = await db.query.resellers.findFirst({
        where: eq(resellers.userId, userId),
        with: { wallet: true },
    });
    if (!reseller) return null;
    const tier = await TierService.getCurrentTierForReseller(reseller.id);
    const tierDiscountPct = tier ? parseFloat(tier.discountPct) : 0;
    const customDiscountPct = reseller.customDiscount
        ? Math.min(parseFloat(reseller.customDiscount), 100 - tierDiscountPct)
        : 0;
    return { reseller, tier, tierDiscountPct, customDiscountPct };
}

/* ───── Reads ───── */

export const getG2BulkGamesAction = withAuth(
    { roles: [UserRole.RESELLER] },
    async () => {
        try {
            const data = await lbGames<{ items?: G2BulkGame[]; games?: G2BulkGame[] }>(
                "/api/v2/g2bulk/games",
            );
            const games = (data.items ?? data.games ?? []).filter((g) => g.isActive);
            games.sort((a, b) => a.name.localeCompare(b.name));
            return { success: true as const, data: games };
        } catch (err) {
            return { success: false as const, error: (err as Error).message };
        }
    },
);

export const getG2BulkGameCatalogueAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({ code: z.string().min(1).max(64) }),
    },
    async ({ code }, user) => {
        const ctx = await resolvePricingContext(user.id);
        if (!ctx) return { success: false as const, error: "Compte revendeur introuvable" };

        let payload: { game: G2BulkGame; items: G2BulkGamePackage[] };
        try {
            payload = await lbGames<{ game: G2BulkGame; items: G2BulkGamePackage[] }>(
                `/api/v2/g2bulk/games/${encodeURIComponent(code)}/catalogue`,
            );
        } catch (err) {
            return { success: false as const, error: (err as Error).message };
        }

        const items = (payload.items ?? []).filter((p) => p.isActive);
        const prices = await g2bulkPricingService.computeBulk(
            items.map((p) => ({
                priceCentsUsd: p.unitPriceCents,
                category: "gaming",
                brand: code,
                sku: `g2bgame__${p.id}`,
            })),
            {
                resellerId: ctx.reseller.id,
                tierDiscountPct: ctx.tierDiscountPct,
                customDiscountPct: ctx.customDiscountPct,
            },
        );
        const rate = await g2bulkPricingService.getUsdToDzdRate();

        const enriched: EnrichedGamePackage[] = items.map((p, i) => ({
            catalogueId: p.id,
            name: p.name,
            unitPriceCents: p.unitPriceCents,
            currency: p.currency,
            pricing: prices[i],
        }));

        return {
            success: true as const,
            data: {
                game: payload.game,
                items: enriched,
                meta: {
                    tierName: ctx.tier?.name ?? null,
                    tierDiscountPct: ctx.tierDiscountPct,
                    customDiscountPct: ctx.customDiscountPct,
                    conversionRate: rate,
                } as GameCatalogueMeta,
            },
        };
    },
);

export const getG2BulkGameFieldsAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({ code: z.string().min(1).max(64) }),
    },
    async ({ code }) => {
        try {
            const data = await lbGames<{
                gameCode: string;
                fields: G2BulkGameField[];
                notes?: string | null;
            }>(`/api/v2/g2bulk/games/${encodeURIComponent(code)}/fields`);
            return { success: true as const, data };
        } catch (err) {
            return { success: false as const, error: (err as Error).message };
        }
    },
);

/* ───── Checkout (wallet debit + LoadBrain order) ───── */

export const createG2BulkGameOrderAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({
            gameCode: z.string().min(1).max(64),
            catalogueId: z.number().int().positive(),
            quantity: z.number().int().min(1).max(50),
            player: z.record(z.string(), z.string()),
        }),
    },
    async ({ gameCode, catalogueId, quantity, player }, user) => {
        try {
            const ctx = await resolvePricingContext(user.id);
            if (!ctx || !ctx.reseller.wallet) {
                return { success: false as const, error: "Compte revendeur introuvable" };
            }
            const { reseller } = ctx;

            // Validate player fields against the upstream-declared requirements.
            const fieldsData = await lbGames<{ fields: G2BulkGameField[] }>(
                `/api/v2/g2bulk/games/${encodeURIComponent(gameCode)}/fields`,
            );
            for (const f of fieldsData.fields) {
                if (f.required && !player[f.key]?.trim()) {
                    return { success: false as const, error: `Champ requis manquant : ${f.label}` };
                }
                if (f.type === "enum" && player[f.key] && f.options && !(player[f.key] in f.options)) {
                    return { success: false as const, error: `Valeur invalide pour ${f.label}` };
                }
            }

            // Re-fetch the package server-side (never trust client price/identity).
            const cat = await lbGames<{ items: G2BulkGamePackage[] }>(
                `/api/v2/g2bulk/games/${encodeURIComponent(gameCode)}/catalogue`,
            );
            const pkg = cat.items.find((p) => p.id === catalogueId && p.isActive);
            if (!pkg) {
                return { success: false as const, error: "Package introuvable ou indisponible" };
            }

            const [price] = await g2bulkPricingService.computeBulk(
                [
                    {
                        priceCentsUsd: pkg.unitPriceCents,
                        category: "gaming",
                        brand: gameCode,
                        sku: `g2bgame__${pkg.id}`,
                    },
                ],
                {
                    resellerId: reseller.id,
                    tierDiscountPct: ctx.tierDiscountPct,
                    customDiscountPct: ctx.customDiscountPct,
                },
            );
            const totalAmount = price.finalPriceDzd * quantity;
            const orderNumber = `G2G-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const externalOrderId = `${orderNumber}-0`;

            // Phase 1 — débit atomique + ordre + miroir PENDING (lbOrderId=null).
            // L'appel HTTP upstream est SORTI de la transaction : sinon le verrou
            // FOR UPDATE du wallet est tenu pendant tout le timeout réseau et
            // sérialise les checkouts du reseller. Le reconciler ne ramasse que
            // les lignes lbOrderId NOT NULL, donc une ligne PENDING sans lbOrderId
            // n'est jamais polled tant que la phase 2 n'a pas réussi.
            const created = await db.transaction(async (tx) => {
                const lockedWallet = await tx
                    .select()
                    .from(resellerWallets)
                    .where(eq(resellerWallets.id, reseller.wallet!.id))
                    .for("update");
                const balance = parseFloat(lockedWallet[0]?.balance ?? "0");
                if (balance < totalAmount) throw new Error("Solde insuffisant");

                const [newOrder] = await tx
                    .insert(orders)
                    .values({
                        orderNumber,
                        status: "PAYE",
                        totalAmount: totalAmount.toFixed(2),
                        montantPaye: totalAmount.toFixed(2),
                        resteAPayer: "0",
                        resellerId: reseller.id,
                        source: "B2B_WEB",
                        deliveryMethod: "TICKET",
                    })
                    .returning();

                await tx
                    .update(resellerWallets)
                    .set({
                        balance: sql`${resellerWallets.balance} - ${totalAmount}`,
                        totalSpent: sql`${resellerWallets.totalSpent} + ${totalAmount}`,
                        updatedAt: new Date(),
                    })
                    .where(eq(resellerWallets.id, reseller.wallet!.id));

                await tx.insert(resellerTransactions).values({
                    walletId: reseller.wallet!.id,
                    type: "PURCHASE",
                    amount: totalAmount.toFixed(2),
                    orderId: newOrder.id,
                    description: `Top-up ${gameCode} - ${orderNumber}`,
                    source: "G2BULK",
                });

                const [g2bRow] = await tx
                    .insert(g2bulkOrders)
                    .values({
                        localOrderId: newOrder.id,
                        resellerId: reseller.id,
                        productId: `game:${catalogueId}`,
                        quantity,
                        pricePaidDzd: totalAmount.toFixed(2),
                        lbOrderId: null,
                        status: "PENDING_LOADBRAIN",
                        wonSnapshot: buildGameWonSnapshot({
                            gameCode,
                            catalogueId,
                            packageName: pkg.name,
                            player,
                        }),
                    })
                    .returning();

                return { id: newOrder.id, orderNumber, g2bRow };
            });

            // Phase 2 — appel HTTP upstream HORS transaction (aucun verrou tenu).
            let lb: { orderId?: string; status?: string };
            try {
                lb = await lbGames<{ orderId?: string; status?: string }>(
                    "/api/v2/g2bulk/games/orders",
                    {
                        method: "POST",
                        body: JSON.stringify({
                            gameCode,
                            catalogueId,
                            quantity,
                            player,
                            externalOrderId,
                        }),
                    },
                );
            } catch (httpErr) {
                // Compensation : la commande n'a jamais été placée upstream → on
                // recrédite le wallet et on marque l'ordre REFUNDED. Réutilise le
                // chemin éprouvé du reconciler (idempotent via la garde de statut).
                await markRefunded(db, created.g2bRow, "placement_failed");
                const msg = httpErr instanceof Error ? httpErr.message : String(httpErr);
                console.error("[createG2BulkGameOrderAction] upstream placement failed, refunded:", msg);
                return {
                    success: false as const,
                    error: "Commande fournisseur indisponible — votre solde a été recrédité.",
                };
            }

            // Phase 3 — succès upstream : enregistre lbOrderId + snapshot complet.
            await db.transaction(async (tx) => {
                const [fresh] = await tx
                    .select()
                    .from(g2bulkOrders)
                    .where(eq(g2bulkOrders.id, created.g2bRow.id))
                    .for("update");
                if (!fresh || fresh.status !== "PENDING_LOADBRAIN") return; // déjà réconcilié
                await tx
                    .update(g2bulkOrders)
                    .set({
                        lbOrderId: lb.orderId ?? null,
                        wonSnapshot: buildGameWonSnapshot({
                            gameCode,
                            catalogueId,
                            packageName: pkg.name,
                            player,
                            lb,
                        }),
                    })
                    .where(eq(g2bulkOrders.id, created.g2bRow.id));
            });

            const res = { id: created.id, orderNumber: created.orderNumber };

            ResellerNotifications.notifyOrderConfirmed({
                resellerId: reseller.id,
                companyName: reseller.companyName,
                contactPhone: reseller.contactPhone,
                orderNumber: res.orderNumber,
                totalAmount,
                itemCount: quantity,
                hasInstantDelivery: true,
            }).catch(() => {});

            // Low-balance alert (edge-triggered, opt-in via reseller threshold).
            notifyLowBalanceAfterDebit(
                { id: reseller.id, companyName: reseller.companyName, contactPhone: reseller.contactPhone },
                totalAmount,
            ).catch(() => {});

            revalidatePath("/reseller/orders");
            return { success: true as const, orderNumber: res.orderNumber };
        } catch (err) {
            // Robust error extraction: drizzle / pg / upstream services can throw
            // shapes other than plain Error (objects with a nested message, raw
            // Response bodies, etc.). Always surface a readable string so the
            // client never collapses to "[object Object]" in a toast.
            const message = ((): string => {
                if (err instanceof Error && typeof err.message === "string") {
                    return err.message;
                }
                if (err && typeof err === "object") {
                    const maybe = (err as { message?: unknown }).message;
                    if (typeof maybe === "string") return maybe;
                    try {
                        return JSON.stringify(err);
                    } catch {
                        /* circular — fall through */
                    }
                }
                return String(err ?? "Erreur inconnue");
            })();
            console.error("[createG2BulkGameOrderAction] failed:", err);
            return { success: false as const, error: message };
        }
    },
);
