"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@heroui/react";
import { ArrowLeft, Search, Store } from "lucide-react";
import { toast } from "react-hot-toast";

import { getBsvSkuCatalogAction } from "../bsv-sku-catalog";
import { checkoutResellerAction, getCurrentResellerAction } from "../../actions";
import {
    ALL_REGION,
    DenominationRow,
    PurchasePanel,
    RegionPills,
    bsvSkuToDenomination,
    groupByRegion,
    regionsFrom,
    type Denomination,
} from "../components/Denomination";
import {
    SEED_BRANDS,
    artworkFor,
    bsvCategoryToBrandType,
    prettifyLabel,
    toBrandSlug,
    type BrandCategory,
    type BrandType,
} from "../brand-utils";
import { regionFlag, regionLabel } from "../region-utils";
import PurchaseSuccessModal from "../components/PurchaseSuccessModal";
import type { EnrichedBsvSkuItem } from "@/types/bsv-sku-catalog";

/* ──────────────────────────────────────────────────────────────────────────
 * Marketplace — stable BSV catalog organized CATEGORY → BRAND → denomination.
 *
 * Reuses the exact shop design system: dark surfaces (#161616 / #262626),
 * #FACC15 accent, CategoryGrid + BrandCard for the brand grid, RegionPills +
 * DenominationRow + PurchasePanel for the per-brand denomination view. The
 * supplier is fully hidden (rows show "ROBOTECHDZ"). Buying orders by SKU so
 * LoadBrain auto-falls-back across live seller listings.
 * ────────────────────────────────────────────────────────────────────────── */

type CategoryTab = "all" | "giftcard" | "topup";

const CATEGORY_TABS: ReadonlyArray<{ key: CategoryTab; label: string }> = [
    { key: "all", label: "Tout" },
    { key: "giftcard", label: "Gift Cards & Vouchers" },
    { key: "topup", label: "Game Top-Up" },
];

const keepType = (tab: CategoryTab, t: BrandType): boolean => {
    if (tab === "all") return true;
    if (tab === "giftcard") return t === "giftcard" || t === "mixed";
    return t === "topup" || t === "mixed";
};

export default function ResellerMarketplacePage() {
    const router = useRouter();

    const [all, setAll] = useState<ReadonlyArray<EnrichedBsvSkuItem>>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [tab, setTab] = useState<CategoryTab>("all");
    const [rawQuery, setRawQuery] = useState("");
    const [query, setQuery] = useState("");

    // null = brand grid; set = denomination view for that brand slug.
    const [activeBrand, setActiveBrand] = useState<string | null>(null);
    const [region, setRegion] = useState<string>(ALL_REGION);
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [quantity, setQuantity] = useState(1);

    const [resellerId, setResellerId] = useState<number | null>(null);
    const [resellerName, setResellerName] = useState<string | undefined>(undefined);
    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const [modalOrderId, setModalOrderId] = useState<number | null>(null);
    const [boughtLabel, setBoughtLabel] = useState<string | undefined>(undefined);

    /* ───── Reseller identity ───── */
    useEffect(() => {
        getCurrentResellerAction({}).then((res) => {
            if (res.success && res.data) {
                const r = res.data as { id: number; companyName?: string };
                setResellerId(r.id);
                setResellerName(r.companyName);
            }
        });
    }, []);

    /* ───── Load the stable BSV SKU catalog once ───── */
    useEffect(() => {
        let active = true;
        setIsLoading(true);
        setError(null);
        getBsvSkuCatalogAction({})
            .then((res) => {
                if (!active) return;
                if (res.success) setAll(res.data.items);
                else setError(res.error);
            })
            .catch(() => {
                if (active) setError("Catalogue indisponible");
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });
        return () => {
            active = false;
        };
    }, []);

    /* ───── Debounced search ───── */
    useEffect(() => {
        const t = setTimeout(() => setQuery(rawQuery.trim().toLowerCase()), 250);
        return () => clearTimeout(t);
    }, [rawQuery]);

    /* ───── Brand tiles (category tab filtered) for the grid view ───── */
    const seedBySlug = useMemo(
        () => new Map(SEED_BRANDS.map((b) => [b.slug, b])),
        [],
    );

    const brandCategories = useMemo<ReadonlyArray<BrandCategory>>(() => {
        const byBrand = new Map<
            string,
            { label: string; count: number; type: BrandType }
        >();
        for (const it of all) {
            const slug = it.brandSlug || toBrandSlug(it.brand || "other");
            if (!slug || slug === "other") continue;
            const seed = seedBySlug.get(slug);
            const type: BrandType =
                seed?.type ?? bsvCategoryToBrandType(it.category);
            const prev = byBrand.get(slug);
            byBrand.set(slug, {
                label: seed?.label ?? prettifyLabel(slug),
                count: (prev?.count ?? 0) + 1,
                type: prev?.type ?? type,
            });
        }
        return Array.from(byBrand.entries())
            .map(([slug, v]) => ({
                slug,
                label: v.label,
                count: v.count,
                imageUrl: artworkFor(slug),
                type: v.type,
            }))
            .filter((c) => keepType(tab, c.type))
            .sort((a, b) => b.count - a.count);
    }, [all, seedBySlug, tab]);

    /* ───── Denominations for the selected brand ───── */
    const brandItems = useMemo<ReadonlyArray<Denomination>>(() => {
        if (!activeBrand) return [];
        return all
            .filter((it) => (it.brandSlug || toBrandSlug(it.brand)) === activeBrand)
            .map(bsvSkuToDenomination);
    }, [all, activeBrand]);

    const regions = useMemo(() => regionsFrom(brandItems), [brandItems]);

    const regionFiltered = useMemo(() => {
        if (region === ALL_REGION) return brandItems;
        return brandItems.filter((it) => it.region === region);
    }, [brandItems, region]);

    const grouped = useMemo(
        () => groupByRegion(regionFiltered, region),
        [regionFiltered, region],
    );

    const selected = useMemo(
        () => brandItems.find((it) => it.key === selectedKey) ?? null,
        [brandItems, selectedKey],
    );

    /* ───── Reset selection/region when leaving a brand ───── */
    const openBrand = (slug: string) => {
        setActiveBrand(slug);
        setRegion(ALL_REGION);
        setSelectedKey(null);
        setQuantity(1);
    };
    const backToGrid = () => {
        setActiveBrand(null);
        setSelectedKey(null);
    };

    const handlePurchase = async () => {
        if (!selected || !resellerId) return;
        const sku = (selected.raw as EnrichedBsvSkuItem).sku;
        setIsCheckingOut(true);
        try {
            const res = await checkoutResellerAction({
                resellerId,
                cart: [{ sku, quantity }],
            });
            if (res.success) {
                setBoughtLabel(selected.title);
                setSelectedKey(null);
                setModalOrderId((res as { orderId?: number }).orderId ?? null);
            } else {
                toast.error(res.error || "Échec de la commande");
            }
        } catch {
            toast.error("Erreur technique lors du paiement");
        } finally {
            setIsCheckingOut(false);
        }
    };

    const activeBrandLabel =
        (activeBrand && seedBySlug.get(activeBrand)?.label) ||
        (activeBrand ? prettifyLabel(activeBrand) : "");

    /* ─────────────────────────── BRAND-DETAIL VIEW ─────────────────────────── */
    if (activeBrand) {
        return (
            <div className="space-y-6 animate-in fade-in duration-300">
                <button
                    onClick={backToGrid}
                    className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
                >
                    <ArrowLeft size={14} />
                    Retour au marketplace
                </button>

                <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
                    <div className="space-y-5 min-w-0">
                        <div className="space-y-1">
                            <h1 className="text-4xl lg:text-5xl font-black text-[#FACC15] tracking-tight">
                                {activeBrandLabel}
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

                        {regionFiltered.length === 0 ? (
                            <p className="text-center text-slate-500 italic py-12">
                                Aucune dénomination pour cette catégorie / région.
                            </p>
                        ) : (
                            <div className="space-y-6" data-testid="denomination-list">
                                {grouped.map(({ region: r, items: groupItems }) => (
                                    <section
                                        key={r}
                                        data-testid="region-group"
                                        data-region={r}
                                    >
                                        {region === ALL_REGION && (
                                            <header className="flex items-baseline justify-between mb-2 pb-1 border-b border-[#262626]">
                                                <h2 className="text-sm font-black uppercase tracking-widest text-slate-300 flex items-center gap-2">
                                                    <span aria-hidden>{regionFlag(r)}</span>
                                                    <span>{regionLabel(r)}</span>
                                                    <span className="text-[10px] text-slate-500 ml-1">
                                                        ({r})
                                                    </span>
                                                </h2>
                                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                    {groupItems.length} dénomination
                                                    {groupItems.length === 1 ? "" : "s"}
                                                </span>
                                            </header>
                                        )}
                                        <ul className="space-y-2">
                                            {groupItems.map((it) => (
                                                <DenominationRow
                                                    key={it.key}
                                                    item={it}
                                                    selected={selectedKey === it.key}
                                                    onSelect={(d) => {
                                                        if (d.stock <= 0) {
                                                            toast.error(
                                                                "Rupture de stock — choisissez une autre dénomination.",
                                                            );
                                                            return;
                                                        }
                                                        setSelectedKey(d.key);
                                                        setQuantity(1);
                                                    }}
                                                />
                                            ))}
                                        </ul>
                                    </section>
                                ))}
                            </div>
                        )}
                    </div>

                    <aside className="lg:sticky lg:top-24">
                        <PurchasePanel
                            item={selected}
                            quantity={quantity}
                            onQuantity={setQuantity}
                            isCheckingOut={isCheckingOut}
                            onPurchase={handlePurchase}
                        />
                    </aside>
                </div>

                <PurchaseSuccessModal
                    isOpen={modalOrderId !== null}
                    onClose={() => setModalOrderId(null)}
                    orderId={modalOrderId}
                    productLabel={boughtLabel}
                    resellerName={resellerName}
                />
            </div>
        );
    }

    /* ───────────────────────────── BRAND-GRID VIEW ─────────────────────────── */
    const filteredBrandCategories = query
        ? brandCategories.filter(
              (c) =>
                  c.label.toLowerCase().includes(query) || c.slug.includes(query),
          )
        : brandCategories;

    const countLabel = isLoading
        ? "Chargement…"
        : error
          ? "Catalogue indisponible"
          : `${filteredBrandCategories.length} marque${
                filteredBrandCategories.length === 1 ? "" : "s"
            }`;

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <button
                onClick={() => router.push("/reseller/shop")}
                className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
                <ArrowLeft size={14} />
                Retour aux catégories
            </button>

            <div className="space-y-1">
                <h1 className="text-4xl lg:text-5xl font-black text-white tracking-tight flex items-center gap-3">
                    <Store className="text-[#FACC15]" size={36} />
                    Marketplace
                </h1>
                <p className="text-sm text-slate-400">{countLabel}</p>
            </div>

            {/* Category tabs — same pill design as the shop landing */}
            <div className="flex flex-wrap gap-2">
                {CATEGORY_TABS.map((t) => (
                    <button
                        key={t.key}
                        type="button"
                        onClick={() => setTab(t.key)}
                        className={`px-4 py-2 rounded-full text-xs font-black tracking-tight border transition ${
                            tab === t.key
                                ? "bg-[#FACC15] text-black border-[#FACC15]"
                                : "bg-[#161616] text-slate-300 border-[#262626] hover:border-[#FACC15]/40"
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Search bar — mirrors marketplace/shop search input */}
            <div className="relative">
                <Search
                    size={16}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                    type="search"
                    placeholder="Rechercher une marque…"
                    value={rawQuery}
                    onChange={(e) => setRawQuery(e.target.value)}
                    data-testid="marketplace-search"
                    className="w-full h-12 pl-11 pr-4 rounded-full bg-[#161616] border border-[#262626] text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FACC15]/60 focus:ring-2 focus:ring-[#FACC15]/20 transition-all"
                />
            </div>

            {isLoading ? (
                <div className="py-20 flex justify-center">
                    <Spinner color="warning" />
                </div>
            ) : error ? (
                <p className="text-center text-slate-500 italic py-12">
                    Réessayez dans un instant. ({error})
                </p>
            ) : filteredBrandCategories.length === 0 ? (
                <p className="text-center text-slate-500 italic py-12">
                    Aucune marque pour le moment.
                </p>
            ) : (
                // Reuse the exact grid layout from CategoryGrid via BrandCard,
                // but intercept clicks to open the in-page denomination view
                // (CategoryGrid links out to /shop/[brand]; here we stay local).
                <MarketplaceBrandGrid
                    categories={filteredBrandCategories}
                    onOpen={openBrand}
                />
            )}

            <PurchaseSuccessModal
                isOpen={modalOrderId !== null}
                onClose={() => setModalOrderId(null)}
                orderId={modalOrderId}
                productLabel={boughtLabel}
                resellerName={resellerName}
            />
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────────────────
 * In-page brand grid — same visual treatment as BrandCard / CategoryGrid but
 * clicking opens the local denomination view instead of routing to the
 * g2bulk-backed /shop/[brand] page (the marketplace is a separate catalog).
 * ────────────────────────────────────────────────────────────────────────── */
function MarketplaceBrandGrid({
    categories,
    onOpen,
}: {
    categories: ReadonlyArray<BrandCategory>;
    onOpen: (slug: string) => void;
}) {
    return (
        <div
            data-testid="category-grid"
            className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3"
        >
            {categories.map((c) => (
                <MarketplaceBrandCard key={c.slug} category={c} onOpen={onOpen} />
            ))}
        </div>
    );
}

function MarketplaceBrandCard({
    category,
    onOpen,
}: {
    category: BrandCategory;
    onOpen: (slug: string) => void;
}) {
    const [imgFailed, setImgFailed] = useState(false);
    const initial = (category.label[0] || "?").toUpperCase();
    return (
        <button
            type="button"
            onClick={() => onOpen(category.slug)}
            data-testid="brand-card"
            data-brand-slug={category.slug}
            className="group relative aspect-square overflow-hidden rounded-2xl bg-[#161616] border border-[#262626] hover:border-[#FACC15] hover:ring-2 hover:ring-[#FACC15]/30 transition-all text-left"
        >
            {!imgFailed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={category.imageUrl}
                    alt={category.label}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    onError={() => setImgFailed(true)}
                />
            ) : (
                <div
                    className="absolute inset-0 flex items-center justify-center text-white"
                    style={{
                        background: `linear-gradient(135deg, hsl(${hashHue(category.slug)} 70% 35%), hsl(${hashHue(category.slug) + 40} 70% 20%))`,
                    }}
                >
                    <span className="text-6xl font-black tracking-tight opacity-90">
                        {initial}
                    </span>
                </div>
            )}

            <span
                data-testid="brand-type-badge"
                className={`absolute top-2 left-2 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md border backdrop-blur-sm ${
                    category.type === "topup"
                        ? "text-cyan-300 bg-cyan-500/15 border-cyan-400/40"
                        : category.type === "mixed"
                          ? "text-purple-300 bg-purple-500/15 border-purple-400/40"
                          : "text-emerald-300 bg-emerald-500/15 border-emerald-400/40"
                }`}
            >
                {category.type === "topup"
                    ? "Top-Up"
                    : category.type === "mixed"
                      ? "Mixed"
                      : "Gift Card"}
            </span>

            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-3">
                <div className="flex items-end justify-between gap-2">
                    <h3 className="text-sm font-black text-white tracking-tight line-clamp-1">
                        {category.label}
                    </h3>
                    {category.count > 0 && (
                        <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-[#FACC15] bg-black/40 border border-[#FACC15]/30 rounded-md px-1.5 py-0.5">
                            {category.count}
                        </span>
                    )}
                </div>
            </div>
        </button>
    );
}

const HUE_MOD = 360;
function hashHue(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h) % HUE_MOD;
}
