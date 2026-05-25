"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button, Spinner } from "@heroui/react";
import { ArrowLeft, Check, Minus, Plus } from "lucide-react";
import { toast } from "react-hot-toast";

// BSV import temporarily commented out — operator disabled BSV catalog 2026-05-25,
// will re-enable via curated import flow. Restore when ready.
// import { getBsvCatalogAction } from "../actions";
import {
    getG2BulkCatalogAction,
    type G2BulkCatalogProduct,
} from "../g2bulk-shop-actions";
import { checkoutResellerAction, getCurrentResellerAction } from "../../actions";
import { formatCurrency } from "@/lib/formatters";
import {
    SEED_BRANDS,
    deriveG2BulkBrand,
    prettifyLabel,
    toBrandSlug,
} from "../brand-utils";
import {
    regionFlag,
    regionLabel,
    resolveRegion,
    type RegionCode,
} from "../region-utils";
import type { EnrichedBsvListing } from "@/types/bsv-listings";

/* ──────────────────────────────────────────────────────────────────────────
 * Types
 * ────────────────────────────────────────────────────────────────────────── */

type Source = "bsv" | "g2bulk";

interface Denomination {
    readonly key: string; // unique key for selection / cart
    readonly source: Source;
    readonly title: string;
    readonly region: string; // 2-letter ISO code, or "—" when unknown
    readonly stock: number; // 0 = out of stock
    readonly priceDzd: number;
    readonly priceUsd: number | null;
    readonly listPriceDzd: number;
    readonly seller: string;
    readonly raw: EnrichedBsvListing | G2BulkCatalogProduct;
}

// NOTE: BSV/G2Bulk action schemas cap `limit` at 48 — keep at or below that
// to avoid Zod validation failure that returns success:false with no items.
const PAGE_SIZE = 48;
const ALL_REGION = "ALL";

/* ──────────────────────────────────────────────────────────────────────────
 * Mappers — turn catalog items into the unified Denomination row type
 * ────────────────────────────────────────────────────────────────────────── */

function bsvToDenomination(l: EnrichedBsvListing): Denomination {
    // BSV exposes the real seller stock via `stockQty`. Treat `null` as
    // "unknown but in stock" (BSV doesn't always reveal exact qty) — fall
    // back to 1 so the row stays selectable; the actual purchase guard is
    // the BSV won-snapshot at checkout.
    const stock = l.stockQty ?? 1;
    return {
        key: `bsv:${l.listingId}`,
        source: "bsv",
        title: l.product.displayName,
        region:
            resolveRegion(l.product.region ?? null, l.product.displayName) ??
            "GLOBAL",
        stock,
        priceDzd: l.pricing.finalPriceDzd,
        priceUsd: null,
        listPriceDzd: l.pricing.listPriceDzd,
        seller: l.seller.slug,
        raw: l,
    };
}

function g2bToDenomination(p: G2BulkCatalogProduct): Denomination {
    return {
        key: `g2b:${p.productId}`,
        source: "g2bulk",
        title: p.title,
        // G2Bulk's category_title carries the region authoritatively
        // ("Apple iTunes Saudi Arabia"). Title-fallback for the few where
        // categoryTitle is null.
        region: resolveRegion(p.categoryTitle, p.title) ?? "GLOBAL",
        stock: p.stock,
        priceDzd: p.pricing.finalPriceDzd,
        priceUsd: p.unitPriceCents / 100,
        listPriceDzd: p.pricing.basePriceDzd,
        seller: "G2Bulk",
        raw: p,
    };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Main page
 * ────────────────────────────────────────────────────────────────────────── */

export default function ResellerBrandPage() {
    const router = useRouter();
    const params = useParams<{ brand: string }>();
    const slug = decodeURIComponent(params?.brand || "");
    const seed = SEED_BRANDS.find((b) => b.slug === slug);
    const label = seed?.label ?? prettifyLabel(slug);

    const [items, setItems] = useState<ReadonlyArray<Denomination>>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [region, setRegion] = useState<string>(ALL_REGION);
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [quantity, setQuantity] = useState(1);
    const [resellerId, setResellerId] = useState<number | null>(null);
    const [isCheckingOut, setIsCheckingOut] = useState(false);

    /* ───── Reseller ───── */
    useEffect(() => {
        getCurrentResellerAction({}).then((res) => {
            if (res.success && res.data) {
                setResellerId((res.data as { id: number }).id);
            }
        });
    }, []);

    /* ───── Catalog fetch ───── */
    useEffect(() => {
        let active = true;
        const load = async () => {
            setIsLoading(true);
            try {
                // BSV temporarily disabled (operator decision 2026-05-25):
                // catalog reactivation will be a curated manual list, not the
                // 17k auto-discovered firehose. Re-enable via BSV import flow
                // (TODO) when ready.
                // -----------------------------------------------------------
                // G2Bulk: fetch ALL pages and filter client-side by
                // categoryTitle-derived brand. We CANNOT use q=label because
                // G2Bulk titles often omit the game name (e.g. "1 USD Diamond"
                // for Free Fire) — q would return zero matches for many brands.
                // 980 products / 48-per-page = 21 pages. Bump to 25 for headroom.
                // (Schema caps `limit` at 48, so we can't fetch fewer pages.)
                //
                // PERF: page 1 is fetched first to learn `totalPages`, then the
                // remaining pages are fetched IN PARALLEL (was a sequential loop
                // of ~21 round-trips → ~10-20s). Bounded by MAX_PAGES.
                const MAX_PAGES = 25;
                const fetchPage = (page: number) =>
                    getG2BulkCatalogAction({
                        page,
                        limit: PAGE_SIZE,
                        sortBy: "newest",
                    }).catch(() => null);

                const first = await fetchPage(1);
                if (!active) return;
                const all: G2BulkCatalogProduct[] = [];
                if (first?.success) {
                    all.push(...(first.data.items as G2BulkCatalogProduct[]));
                    const lastPage = Math.min(first.data.pagination.totalPages, MAX_PAGES);
                    if (lastPage > 1) {
                        const rest = await Promise.all(
                            Array.from({ length: lastPage - 1 }, (_, i) => fetchPage(i + 2))
                        );
                        if (!active) return;
                        for (const res of rest) {
                            if (res?.success) {
                                all.push(...(res.data.items as G2BulkCatalogProduct[]));
                            }
                        }
                    }
                }
                const matched = all.filter(
                    (p) => toBrandSlug(deriveG2BulkBrand(p)) === slug
                );
                setItems(matched.map(g2bToDenomination));
            } finally {
                if (active) setIsLoading(false);
            }
        };
        load();
        return () => {
            active = false;
        };
    }, [slug, label]);

    /* ───── Derived ───── */
    // Region pills: unique canonical region codes from items, ordered by
    // product count (most-populated first) so the densest regions are
    // surfaced as primary entry points.
    const regions = useMemo<ReadonlyArray<RegionCode>>(() => {
        const counts = new Map<RegionCode, number>();
        items.forEach((it) => {
            if (!it.region) return;
            counts.set(it.region, (counts.get(it.region) ?? 0) + 1);
        });
        return Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([code]) => code);
    }, [items]);

    const filtered = useMemo(() => {
        if (region === ALL_REGION) return items;
        return items.filter((it) => it.region === region);
    }, [items, region]);

    const selected = useMemo(
        () => items.find((it) => it.key === selectedKey) || null,
        [items, selectedKey]
    );

    // Clamp quantity to selected stock whenever selection changes
    useEffect(() => {
        if (!selected) {
            setQuantity(1);
            return;
        }
        setQuantity(Math.min(Math.max(1, quantity), Math.max(1, selected.stock)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedKey]);

    // Reset selection when region filter changes if selected item not visible
    useEffect(() => {
        if (selected && region !== ALL_REGION && selected.region !== region) {
            setSelectedKey(null);
        }
    }, [region, selected]);

    /* ───── Actions ───── */
    const handleSelect = useCallback(
        (it: Denomination) => {
            if (it.stock <= 0) {
                toast.error("Rupture de stock — choisissez une autre dénomination.");
                return;
            }
            setSelectedKey(it.key);
        },
        []
    );

    const handlePurchase = useCallback(async () => {
        if (!selected || !resellerId || quantity < 1) return;
        setIsCheckingOut(true);
        try {
            const cartItem =
                selected.source === "bsv"
                    ? { listingId: (selected.raw as EnrichedBsvListing).listingId, quantity }
                    : {
                          g2bulkProductId: (selected.raw as G2BulkCatalogProduct).productId,
                          quantity,
                      };
            const res = await checkoutResellerAction({
                resellerId,
                cart: [cartItem],
            });
            if (res.success) {
                toast.success("Commande envoyée à LoadBrain", { duration: 4000 });
                setSelectedKey(null);
                router.push("/reseller/orders");
            } else {
                toast.error(res.error || "Échec de la commande");
            }
        } catch {
            toast.error("Erreur technique lors du paiement");
        } finally {
            setIsCheckingOut(false);
        }
    }, [selected, resellerId, quantity, router]);

    /* ───── Render ───── */
    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Back link */}
            <button
                onClick={() => router.push("/reseller/shop")}
                className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
                <ArrowLeft size={14} />
                Retour aux catégories
            </button>

            {/* Two-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
                {/* ----- LEFT: title + filters + list ----- */}
                <div className="space-y-5 min-w-0">
                    <div className="space-y-1">
                        <h1 className="text-4xl lg:text-5xl font-black text-[#FACC15] tracking-tight">
                            {label}
                        </h1>
                        <p className="text-sm text-slate-400">
                            Sélectionnez une dénomination à acheter
                        </p>
                    </div>

                    {regions.length > 1 && (
                        <RegionPills
                            regions={regions}
                            value={region}
                            onChange={setRegion}
                        />
                    )}

                    {isLoading ? (
                        <div className="py-20 flex justify-center">
                            <Spinner color="warning" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <p className="text-center text-slate-500 italic py-12">
                            Aucune dénomination pour cette catégorie / région.
                        </p>
                    ) : (
                        <ul className="space-y-2" data-testid="denomination-list">
                            {filtered.map((it) => (
                                <DenominationRow
                                    key={it.key}
                                    item={it}
                                    selected={selectedKey === it.key}
                                    onSelect={handleSelect}
                                />
                            ))}
                        </ul>
                    )}
                </div>

                {/* ----- RIGHT: sticky purchase panel ----- */}
                <aside className="lg:sticky lg:top-24">
                    <PurchasePanel
                        item={selected}
                        quantity={quantity}
                        onQuantity={setQuantity}
                        onPurchase={handlePurchase}
                        isCheckingOut={isCheckingOut}
                    />
                </aside>
            </div>
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Sub-components
 * ────────────────────────────────────────────────────────────────────────── */

const RegionPills: React.FC<{
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

const DenominationRow: React.FC<{
    readonly item: Denomination;
    readonly selected: boolean;
    readonly onSelect: (it: Denomination) => void;
}> = ({ item, selected, onSelect }) => {
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
                        selected
                            ? "bg-[#FACC15] border-[#FACC15]"
                            : "bg-transparent border-[#3a3a3a]"
                    }`}
                >
                    {selected && <Check size={14} className="text-black" />}
                </span>

                <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-semibold text-white">
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

const PurchasePanel: React.FC<{
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
                <h3 className="text-base font-black text-white leading-snug">
                    {item.title}
                </h3>
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
                            if (Number.isFinite(n))
                                onQuantity(Math.min(max, Math.max(1, n)));
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
