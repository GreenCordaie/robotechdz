"use server";

import { db } from "@/db";
import { pricingRules, shopSettings } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withAuth, logSecurityAction } from "@/lib/security";
import { UserRole } from "@/lib/constants";
import { ResalePricingService } from "@/services/markup-pricing.service";
import { bsvPricingService } from "@/services/bsv-pricing.service";
import { g2bulkPricingService } from "@/services/g2bulk-pricing.service";

/**
 * Unified resale-pricing admin actions. Operate on the single `pricing_rules`
 * table, discriminated by `source`. Supports the three markup modes:
 *   pct (basis points) | fixed_dzd (margin added) | fixed_price (absolute DZD).
 */

const KNOWN_SOURCES = ["bsv", "g2bulk", "iptv", "*"] as const;
const sourceEnum = z.enum(KNOWN_SOURCES);
const scopeTypeEnum = z.enum(["global", "category", "brand", "sku"]);
const markupTypeEnum = z.enum(["pct", "fixed_dzd", "fixed_price"]);

const markupValueSchema = z
    .string()
    .refine((s) => Number.isFinite(Number(s)) && Number(s) >= 0, {
        message: "markupValue doit être un nombre positif",
    });

const ruleCreateSchema = z.object({
    source: sourceEnum,
    scopeType: scopeTypeEnum,
    scopeValue: z.string().min(1).max(255),
    markupType: markupTypeEnum,
    markupValue: markupValueSchema,
    notes: z.string().max(500).nullable().optional(),
    isActive: z.boolean().optional(),
});

const ruleUpdateSchema = ruleCreateSchema.partial().extend({ id: z.number().int().positive() });

/** Invalidate the in-memory cache of whichever service owns this source. */
function invalidateFor(source: string): void {
    if (source === "bsv") bsvPricingService.invalidateCache();
    else if (source === "g2bulk") g2bulkPricingService.invalidateCache();
    // iptv + '*' services are created per request; nothing process-wide to bust.
}

// ── READ ───────────────────────────────────────────────────────────────────

export const getRulesAction = withAuth(
    { roles: [UserRole.ADMIN], schema: z.object({ source: sourceEnum.optional() }).optional() },
    async (input) => {
        try {
            const where = input?.source ? eq(pricingRules.source, input.source) : undefined;
            const rows = await db
                .select()
                .from(pricingRules)
                .where(where)
                .orderBy(asc(pricingRules.source), asc(pricingRules.scopeType), asc(pricingRules.scopeValue));
            return { success: true as const, data: rows };
        } catch (error) {
            return { success: false as const, error: (error as Error).message };
        }
    },
);

export const getUsdRateAction = withAuth({ roles: [UserRole.ADMIN] }, async () => {
    try {
        const settings = await db.select({ rate: shopSettings.usdExchangeRate }).from(shopSettings).limit(1);
        const rate = settings[0]?.rate != null ? Number(settings[0].rate) : 270;
        return { success: true as const, data: { rate } };
    } catch (error) {
        return { success: false as const, error: (error as Error).message };
    }
});

// ── CREATE ───────────────────────────────────────────────────────────────────

export const createRuleAction = withAuth(
    { roles: [UserRole.ADMIN], schema: ruleCreateSchema },
    async (input) => {
        try {
            const [row] = await db
                .insert(pricingRules)
                .values({
                    source: input.source,
                    scopeType: input.scopeType,
                    scopeValue: input.scopeValue,
                    markupType: input.markupType,
                    markupValue: input.markupValue,
                    notes: input.notes ?? null,
                    isActive: input.isActive ?? true,
                })
                .returning();
            invalidateFor(input.source);
            await logSecurityAction({
                userId: null,
                action: "PRICING_RULE_CREATE",
                entityType: "PRICING_RULE",
                entityId: String(row?.id ?? ""),
                newData: input,
            });
            revalidatePath("/admin/pricing-revente");
            return { success: true as const, data: row };
        } catch (error) {
            return { success: false as const, error: (error as Error).message };
        }
    },
);

// ── UPDATE ───────────────────────────────────────────────────────────────────

export const updateRuleAction = withAuth(
    { roles: [UserRole.ADMIN], schema: ruleUpdateSchema },
    async (input) => {
        try {
            const { id, ...rest } = input;
            const patch: Record<string, unknown> = { updatedAt: new Date() };
            for (const [k, v] of Object.entries(rest)) {
                if (v !== undefined) patch[k] = v === null ? null : v;
            }
            const [row] = await db.update(pricingRules).set(patch).where(eq(pricingRules.id, id)).returning();
            if (row?.source) invalidateFor(row.source);
            revalidatePath("/admin/pricing-revente");
            return { success: true as const, data: row };
        } catch (error) {
            return { success: false as const, error: (error as Error).message };
        }
    },
);

// ── DELETE (never the all-sources or per-source global fallback) ──────────────

export const deleteRuleAction = withAuth(
    { roles: [UserRole.ADMIN], schema: z.object({ id: z.number().int().positive() }) },
    async ({ id }) => {
        try {
            const [existing] = await db.select().from(pricingRules).where(eq(pricingRules.id, id));
            if (!existing) return { success: false as const, error: "Règle introuvable" };
            if (existing.scopeType === "global" && existing.source === "*") {
                return { success: false as const, error: "La règle globale par défaut (toutes sources) ne peut pas être supprimée." };
            }
            await db.delete(pricingRules).where(eq(pricingRules.id, id));
            invalidateFor(existing.source);
            revalidatePath("/admin/pricing-revente");
            return { success: true as const };
        } catch (error) {
            return { success: false as const, error: (error as Error).message };
        }
    },
);

// ── SET USD RATE (shared shop setting) ───────────────────────────────────────

export const setUsdRateAction = withAuth(
    { roles: [UserRole.ADMIN], schema: z.object({ rate: z.number().positive() }) },
    async ({ rate }) => {
        try {
            const [s] = await db.select({ id: shopSettings.id }).from(shopSettings).limit(1);
            if (s) await db.update(shopSettings).set({ usdExchangeRate: String(rate) }).where(eq(shopSettings.id, s.id));
            bsvPricingService.invalidateCache();
            g2bulkPricingService.invalidateCache();
            revalidatePath("/admin/pricing-revente");
            return { success: true as const };
        } catch (error) {
            return { success: false as const, error: (error as Error).message };
        }
    },
);

// ── SIMULATE (preview the price a rule set produces) ─────────────────────────

export const simulatePricingAction = withAuth(
    {
        roles: [UserRole.ADMIN],
        schema: z.object({
            source: sourceEnum,
            priceCents: z.number().int().nonnegative(),
            costCurrency: z.enum(["USD", "DZD"]).optional(),
            category: z.string().default(""),
            brand: z.string().default(""),
            sku: z.string().default(""),
        }),
    },
    async (input) => {
        try {
            const svc = new ResalePricingService(input.source);
            const price = await svc.computePrice(
                {
                    priceCentsUsd: input.priceCents,
                    costCurrency: input.costCurrency,
                    category: input.category,
                    brand: input.brand,
                    sku: input.sku,
                },
                { resellerId: 0, tierDiscountPct: 0, customDiscountPct: 0 },
            );
            return { success: true as const, data: price };
        } catch (error) {
            return { success: false as const, error: (error as Error).message };
        }
    },
);
