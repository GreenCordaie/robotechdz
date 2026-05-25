"use client";

import React from "react";
import { Button } from "@heroui/react";
import { Check, Minus, Plus } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import {
    regionFlag,
    regionLabel,
    resolveRegion,
    type RegionCode,
} from "../region-utils";
import type { G2BulkCatalogProduct } from "../g2bulk-shop-actions";
import type { EnrichedBsvListing } from "@/types/bsv-listings";

/* ──────────────────────────────────────────────────────────────────────────
 * Shared denomination model + presentational components.
 *
 * Used by both the per-brand page (/reseller/shop/[brand]) and the flat
 * catalog (/reseller/shop/all) so the "list + sticky purchase panel" UX is
 * defined once. Kept framework-pure (no data fetching) — callers own state.
 * ────────────────────────────────────────────────────────────────────────── */

export type DenominationSource = "bsv" | "g2bulk";

export interface Denomination {
    readonly key: string; // unique key for selection / cart
    readonly source: DenominationSource;
    readonly title: string;
    readonly region: string; // 2-letter ISO code, or "GLOBAL" when unknown
    readonly stock: number; // 0 = out of stock
    readonly priceDzd: number;
    readonly priceUsd: number | null;
    readonly listPriceDzd: number;
    readonly seller: string;
    readonly raw: EnrichedBsvListing | G2BulkCatalogProduct;
}

export const ALL_REGION = "ALL";

/**
 * Extract the leading numeric face-value from a denomination title, used to
 * order rows smallest → largest within a region group.
 *   "10 USD Diamond(1080+108)" → 10 · "500 MXN iTunes Mexico" → 500
 * Returns Number.MAX_SAFE_INTEGER for titles with no leading number so they
 * sort to the bottom rather than disappearing.
 */
export function extractFaceValue(title: string): number {
    const match = title.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    if (!match) return Number.MAX_SAFE_INTEGER;
    const n = Number(match[0]);
    return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

export function sortByFaceValue(arr: Denomination[]): Denomination[] {
    return [...arr].sort((a, b) => extractFaceValue(a.title) - extractFaceValue(b.title));
}

/* ───── Mappers — catalog item → unified Denomination row ───── */

export function bsvToDenomination(l: EnrichedBsvListing): Denomination {
    // BSV exposes seller stock via `stockQty`. `null` = "unknown but in
    // stock" — fall back to 1 so the row stays selectable; the real guard is
    // the BSV won-snapshot at checkout.
    const stock = l.stockQty ?? 1;
    return {
        key: `bsv:${l.listingId}`,
        source: "bsv",
        title: l.product.displayName,
        region:
            resolveRegion(l.product.region ?? null, l.product.displayName) ?? "GLOBAL",
        stock,
        priceDzd: l.pricing.finalPriceDzd,
        priceUsd: null,
        listPriceDzd: l.pricing.listPriceDzd,
        seller: l.seller.slug,
        raw: l,
    };
}

export function g2bToDenomination(p: G2BulkCatalogProduct): Denomination {
    return {
        key: `g2b:${p.productId}`,
        source: "g2bulk",
        title: p.title,
        // G2Bulk's category_title carries the region authoritatively
        // ("Apple iTunes Saudi Arabia"). Title-fallback when it's null.
        region: resolveRegion(p.categoryTitle, p.title) ?? "GLOBAL",
        stock: p.stock,
        priceDzd: p.pricing.finalPriceDzd,
        priceUsd: p.unitPriceCents / 100,
        listPriceDzd: p.pricing.basePriceDzd,
        seller: "G2Bulk",
        raw: p,
    };
}

/**
 * Group denominations by region (ascending face-value within each group).
 * When a single region is selected, returns one group unwrapped.
 */
export function groupByRegion(
    items: ReadonlyArray<Denomination>,
    activeRegion: string,
): ReadonlyArray<{ region: RegionCode; items: Denomination[] }> {
    if (activeRegion !== ALL_REGION) {
        return [{ region: activeRegion as RegionCode, items: sortByFaceValue(items as Denomination[]) }];
    }
    const byRegion = new Map<RegionCode, Denomination[]>();
    items.forEach((it) => {
        const r = (it.region as RegionCode) || "GLOBAL";
        const arr = byRegion.get(r) ?? [];
        arr.push(it);
        byRegion.set(r, arr);
    });
    return Array.from(byRegion.entries())
        .sort((a, b) => b[1].length - a[1].length)
        .map(([r, arr]) => ({ region: r, items: sortByFaceValue(arr) }));
}

/** Unique region codes present in items, ordered by population (densest first). */
export function regionsFrom(items: ReadonlyArray<Denomination>): ReadonlyArray<RegionCode> {
    const counts = new Map<RegionCode, number>();
    items.forEach((it) => {
        if (!it.region) return;
        counts.set(it.region, (counts.get(it.region) ?? 0) + 1);
    });
    return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([code]) => code);
}

/* ───── Components ───── */

export const RegionPills: React.FC<{
    readonly regions: ReadonlyArray<RegionCode>;
    readonly value: string;
    readonly onChange: (r: string) => void;
}> = ({ regions, value, onChange }) => {
    const opts = [ALL_REGION, ...regions];
    return (
        <div className="flex flex-wrap gap-2" data-testid="region-filter">
            {opts.map((r) => {
                const active = value === r;
                const isAll = r === ALL_REGION;
                const flag = isAll ? "🗺️" : regionFlag(r);
                const text = isAll ? "Toutes régions" : regionLabel(r);
                return (
                    <button
                        key={r}
                        onClick={() => onChange(r)}
                        data-region-code={r}
                        title={isAll ? "Afficher toutes les régions" : text}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black tracking-tight transition-all ${
                            active
                                ? "bg-[#FACC15] text-black"
                                : "bg-[#161616] border border-[#262626] text-slate-300 hover:border-[#FACC15]/40"
                        }`}
                    >
                        <span aria-hidden>{flag}</span>
                        <span>{isAll ? text : r}</span>
                        {!isAll && (
                            <span
                                className={`text-[9px] font-bold ${active ? "text-black/60" : "text-slate-500"}`}
                            >
                                {text}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
};

export const DenominationRow: React.FC<{
    readonly item: Denomination;
    readonly selected: boolean;
    readonly onSelect: (it: Denomination) => void;
    /** Show the brand label inline (useful in the cross-brand flat catalog). */
    readonly brandLabel?: string;
}> = ({ item, selected, onSelect, brandLabel }) => {
    const outOfStock = item.stock <= 0;
    return (
        <li>
            <button
                type="button"
                onClick={() => onSelect(item)}
                disabled={outOfStock}
                data-testid="denomination-row"
                data-selected={selected}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                    selected
                        ? "bg-[#FACC15]/10 border-[#FACC15] ring-1 ring-[#FACC15]/60"
                        : outOfStock
                          ? "bg-[#0f0f0f] border-[#1a1a1a] opacity-50 cursor-not-allowed"
                          : "bg-[#161616] border-[#262626] hover:border-[#FACC15]/40 hover:bg-[#1c1c1c]"
                }`}
            >
                <span
                    className={`size-5 shrink-0 rounded-md border flex items-center justify-center ${
                        selected ? "bg-[#FACC15] border-[#FACC15]" : "bg-transparent border-[#3a3a3a]"
                    }`}
                >
                    {selected && <Check size={14} className="text-black" />}
                </span>

                <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-semibold text-white">
                        {brandLabel && (
                            <span className="text-[#FACC15]/90 font-black mr-1.5">
                                {brandLabel} ·
                            </span>
                        )}
                        {item.title}
                    </p>
                    <p className="truncate text-[10px] text-slate-500 font-medium mt-0.5">
                        <span
                            className={`uppercase font-black tracking-widest mr-1.5 ${
                                item.source === "bsv" ? "text-orange-400" : "text-cyan-400"
                            }`}
                        >
                            {item.source === "bsv" ? "BSV" : "G2Bulk"}
                        </span>
                        · vendeur {item.seller}
                        {item.region && ` · ${regionFlag(item.region)} ${item.region}`}
                    </p>
                </div>

                <span
                    className={`shrink-0 text-[10px] font-black uppercase tracking-widest ${
                        outOfStock ? "text-red-400" : "text-emerald-400"
                    }`}
                >
                    {outOfStock ? "Rupture" : `${item.stock} en stock`}
                </span>

                <span className="shrink-0 text-sm font-black text-white min-w-[110px] text-right">
                    {formatCurrency(item.priceDzd, "DZD")}
                </span>
            </button>
        </li>
    );
};

export const PurchasePanel: React.FC<{
    readonly item: Denomination | null;
    readonly quantity: number;
    readonly onQuantity: (n: number) => void;
    readonly onPurchase: () => void;
    readonly isCheckingOut: boolean;
}> = ({ item, quantity, onQuantity, onPurchase, isCheckingOut }) => {
    if (!item) {
        return (
            <div className="bg-[#161616] border border-[#262626] rounded-2xl p-6 text-center text-slate-500 text-sm">
                Choisissez une dénomination dans la liste pour acheter.
            </div>
        );
    }
    const max = Math.max(1, item.stock);
    const total = item.priceDzd * quantity;
    return (
        <div className="bg-[#161616] border border-[#262626] rounded-2xl p-5 space-y-4">
            <div>
                <p className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-1">
                    Sélection
                </p>
                <h3 className="text-base font-black text-white leading-snug">{item.title}</h3>
                <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-lg font-black text-[#FACC15]">
                        {formatCurrency(item.priceDzd, "DZD")}
                    </span>
                    <span className="text-xs text-slate-500">/ unité</span>
                    <span className="ml-auto text-[10px] uppercase font-black tracking-widest text-emerald-400">
                        {item.stock} en stock
                    </span>
                </div>
            </div>

            <div className="border-t border-[#262626] pt-4 space-y-2">
                <label className="text-[10px] uppercase font-black tracking-widest text-slate-500">
                    Quantité
                </label>
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => onQuantity(Math.max(1, quantity - 1))}
                        className="size-9 rounded-lg border border-[#262626] flex items-center justify-center hover:border-[#FACC15]/40 text-white"
                        aria-label="Diminuer"
                    >
                        <Minus size={14} />
                    </button>
                    <input
                        type="number"
                        min={1}
                        max={max}
                        value={quantity}
                        onChange={(e) => {
                            const n = parseInt(e.target.value, 10);
                            if (Number.isFinite(n)) onQuantity(Math.min(max, Math.max(1, n)));
                        }}
                        className="flex-1 h-9 bg-[#0a0a0a] border border-[#262626] rounded-lg text-center text-white font-black focus:outline-none focus:border-[#FACC15]"
                    />
                    <button
                        type="button"
                        onClick={() => onQuantity(Math.min(max, quantity + 1))}
                        className="size-9 rounded-lg border border-[#262626] flex items-center justify-center hover:border-[#FACC15]/40 text-white"
                        aria-label="Augmenter"
                    >
                        <Plus size={14} />
                    </button>
                </div>
                <p className="text-[10px] text-slate-500">Max {max} unité{max > 1 ? "s" : ""}</p>
            </div>

            <div className="border-t border-[#262626] pt-4 flex items-baseline justify-between">
                <span className="text-[11px] uppercase font-black tracking-widest text-slate-500">
                    Total
                </span>
                <span className="text-xl font-black text-[#FACC15]">
                    {formatCurrency(total, "DZD")}
                </span>
            </div>

            <Button
                onPress={onPurchase}
                isLoading={isCheckingOut}
                isDisabled={isCheckingOut || item.stock <= 0}
                data-testid="purchase-btn"
                className="w-full h-12 bg-[#FACC15] text-black font-black text-base rounded-xl hover:bg-[#FACC15]/90 transition-colors"
            >
                {isCheckingOut ? "Traitement…" : "Acheter maintenant"}
            </Button>
        </div>
    );
};
