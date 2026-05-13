import "server-only";
import { db } from "@/db";
import { resellers, resellerTiers, resellerTransactions, resellerWallets } from "@/db/schema";
import { eq, and, gte, sum, desc } from "drizzle-orm";

/**
 * Tier Service — gère les paliers (Bronze/Silver/Gold) appliqués aux resellers.
 *
 * Règles métier :
 *   - Chaque reseller peut être assigné à un tier (resellers.tierId).
 *   - Le tier ajoute un discount_pct EN PLUS du customDiscount éventuel.
 *   - Si tierId est NULL, on retombe sur le tier marqué `is_default=true`
 *     (typiquement BRONZE 0%) — JAMAIS d'erreur.
 *   - La promotion automatique (recalculate) compare le volume mensuel
 *     PURCHASE du reseller au min_monthly_volume_dzd de chaque tier et
 *     assigne le plus haut atteignable.
 */
export class TierService {
    /** Cache mémoire light (10 min) pour éviter de re-query à chaque checkout. */
    private static defaultTierCache: { tier: TierRow | null; loadedAt: number } | null = null;
    private static readonly CACHE_TTL_MS = 10 * 60 * 1000;

    /** Récupère le tier par défaut (is_default=true). Mémoïsé. */
    static async getDefaultTier(): Promise<TierRow | null> {
        const now = Date.now();
        if (
            this.defaultTierCache &&
            now - this.defaultTierCache.loadedAt < this.CACHE_TTL_MS
        ) {
            return this.defaultTierCache.tier;
        }
        const tier = await db.query.resellerTiers.findFirst({
            where: eq(resellerTiers.isDefault, true),
        });
        this.defaultTierCache = { tier: tier ?? null, loadedAt: now };
        return tier ?? null;
    }

    /** Force le rechargement du cache (à appeler après update tier admin). */
    static invalidateCache(): void {
        this.defaultTierCache = null;
    }

    /** Récupère le tier effectif d'un reseller (assigné OU défaut OU null). */
    static async getCurrentTierForReseller(resellerId: number): Promise<TierRow | null> {
        const reseller = await db.query.resellers.findFirst({
            where: eq(resellers.id, resellerId),
            with: { tier: true },
        });
        if (reseller?.tier) return reseller.tier as TierRow;
        return this.getDefaultTier();
    }

    /** Liste tous les tiers, triés par rank croissant. */
    static async listAll(): Promise<TierRow[]> {
        return db.query.resellerTiers.findMany({
            orderBy: (t, { asc }) => [asc(t.rank), asc(t.id)],
        });
    }

    /**
     * Calcule le volume PURCHASE mensuel (DZD) d'un reseller pour le mois en cours.
     * Utilisé par recalculateTierForReseller pour la promotion automatique.
     */
    static async getMonthlyPurchaseVolume(resellerId: number): Promise<number> {
        const wallet = await db.query.resellerWallets.findFirst({
            where: eq(resellerWallets.resellerId, resellerId),
        });
        if (!wallet) return 0;

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const result = await db
            .select({ total: sum(resellerTransactions.amount) })
            .from(resellerTransactions)
            .where(
                and(
                    eq(resellerTransactions.walletId, wallet.id),
                    eq(resellerTransactions.type, "PURCHASE"),
                    gte(resellerTransactions.createdAt, startOfMonth)
                )
            );

        const raw = result[0]?.total;
        return raw ? parseFloat(String(raw)) : 0;
    }

    /**
     * Recalcule et applique le tier le plus haut atteignable selon le volume mensuel.
     * Idempotent — si déjà au bon tier, ne fait rien.
     * Retourne { changed, previousTierId, newTierId, monthlyVolume }.
     */
    static async recalculateTierForReseller(resellerId: number): Promise<RecalculateResult> {
        const reseller = await db.query.resellers.findFirst({
            where: eq(resellers.id, resellerId),
        });
        if (!reseller) {
            return { changed: false, previousTierId: null, newTierId: null, monthlyVolume: 0 };
        }

        const volume = await this.getMonthlyPurchaseVolume(resellerId);
        const allTiers = await this.listAll();
        if (allTiers.length === 0) {
            return { changed: false, previousTierId: reseller.tierId, newTierId: reseller.tierId, monthlyVolume: volume };
        }

        // Pick le tier le plus élevé dont min_monthly_volume_dzd <= volume
        const eligibleTier = allTiers
            .slice()
            .sort((a, b) => parseFloat(String(b.minMonthlyVolumeDzd)) - parseFloat(String(a.minMonthlyVolumeDzd)))
            .find((t) => parseFloat(String(t.minMonthlyVolumeDzd)) <= volume);

        const targetTierId = eligibleTier?.id
            ?? allTiers.find((t) => t.isDefault)?.id
            ?? allTiers[0].id;

        if (reseller.tierId === targetTierId) {
            return {
                changed: false,
                previousTierId: reseller.tierId,
                newTierId: targetTierId,
                monthlyVolume: volume,
            };
        }

        await db
            .update(resellers)
            .set({ tierId: targetTierId })
            .where(eq(resellers.id, resellerId));

        return {
            changed: true,
            previousTierId: reseller.tierId,
            newTierId: targetTierId,
            monthlyVolume: volume,
        };
    }

    /**
     * Applique le discount tier sur un montant brut.
     * customDiscount sur reseller (s'il existe) est appliqué EN PLUS via le caller.
     * Retourne { discountedAmount, discountPct, tierName }.
     */
    static async applyTierDiscount(
        resellerId: number,
        grossAmount: number
    ): Promise<{ discountedAmount: number; discountPct: number; tierName: string | null }> {
        const tier = await this.getCurrentTierForReseller(resellerId);
        if (!tier) {
            return { discountedAmount: grossAmount, discountPct: 0, tierName: null };
        }
        const pct = parseFloat(String(tier.discountPct));
        const discounted = grossAmount * (1 - pct / 100);
        return { discountedAmount: discounted, discountPct: pct, tierName: tier.name };
    }
}

export interface TierRow {
    id: number;
    name: string;
    discountPct: string;
    minMonthlyVolumeDzd: string;
    color: string | null;
    isDefault: boolean;
    rank: number;
    createdAt: Date | null;
}

export interface RecalculateResult {
    changed: boolean;
    previousTierId: number | null;
    newTierId: number | null;
    monthlyVolume: number;
}
