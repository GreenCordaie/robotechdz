"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@heroui/react";
import { ArrowLeft, Search } from "lucide-react";
import { toast } from "react-hot-toast";

import {
    getG2BulkCatalogAction,
    type G2BulkCatalogProduct,
    type G2BulkCatalogPricingMeta,
} from "../g2bulk-shop-actions";
import { checkoutResellerAction, getCurrentResellerAction } from "../../actions";
import PurchaseSuccessModal from "../components/PurchaseSuccessModal";
import { CartBar } from "../components/CartBar";
import { useResellerCart } from "@/store/useResellerCart";
import {
    SEED_BRANDS,
    deriveG2BulkBrand,
    prettifyLabel,
    toBrandSlug,
} from "../brand-utils";
import { regionFlag, regionLabel } from "../region-utils";
import {
    ALL_REGION,
    DenominationRow,
    PurchasePanel,
    RegionPills,
    g2bToDenomination,
    groupByRegion,
    regionsFrom,
    type Denomination,
} from "../components/Denomination";

// Action schema caps `limit` at 48 → one upstream page per fetch.
const PAGE_SIZE = 48;
// 980 products / 48 ≈ 21 pages. 25 gives headroom for catalog growth.
const MAX_PAGES = 25;

function brandLabelForSlug(slug: string): string {
    return SEED_BRANDS.find((b) => b.slug === slug)?.label ?? prettifyLabel(slug);
}

/**
 * Flat, searchable catalog of EVERY G2Bulk product, rendered with the same
 * list + sticky purchase panel UX as the per-brand page (shared components
 * from `../components/Denomination`). Loads the full catalog once, then
 * filters/groups client-side so search and region pills are instant.
 */
export default function ResellerShopAllPage() {
    const router = useRouter();

    const [items, setItems] = useState<ReadonlyArray<Denomination>>([]);
    const [brandLabels, setBrandLabels] = useState<ReadonlyMap<string, string>>(new Map());
    const [meta, setMeta] = useState<G2BulkCatalogPricingMeta | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const [rawQuery, setRawQuery] = useState("");
    const [query, setQuery] = useState("");
    const [region, setRegion] = useState<string>(ALL_REGION);

    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [quantity, setQuantity] = useState(1);
    const [resellerId, setResellerId] = useState<number | null>(null);
    const [resellerName, setResellerName] = useState<string | undefined>(undefined);
    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const [modalOrderId, setModalOrderId] = useState<number | null>(null);
    const addToCart = useResellerCart((s) => s.add);

    /* ───── Reseller ───── */
    useEffect(() => {
        getCurrentResellerAction({}).then((res) => {
            if (res.success && res.data) {
                const r = res.data as { id: number; companyName?: string };
                setResellerId(r.id);
                setResellerName(r.companyName);
            }
        });
    }, []);

    /* ───── Debounce search ───── */
    useEffect(() => {
        const t = setTimeout(() => setQuery(rawQuery.trim().toLowerCase()), 250);
        return () => clearTimeout(t);
    }, [rawQuery]);

    /* ───── Load the FULL catalog (page 1, then the rest in parallel) ───── */
    useEffect(() => {
        let active = true;
        const load = async () => {
            setIsLoading(true);
            const fetchPage = (page: number) =>
                getG2BulkCatalogAction({ page, limit: PAGE_SIZE, sortBy: "newest" }).catch(
                    () => null,
                );

            const first = await fetchPage(1);
            if (!active) return;
            const all: G2BulkCatalogProduct[] = [];
            if (first?.success) {
                setMeta(first.data.pricing);
                all.push(...(first.data.items as G2BulkCatalogProduct[]));
                const lastPage = Math.min(first.data.pagination.totalPages, MAX_PAGES);
                if (lastPage > 1) {
                    const rest = await Promise.all(
                        Array.from({ length: lastPage - 1 }, (_, i) => fetchPage(i + 2)),
                    );
                    if (!active) return;
                    for (const res of rest) {
                        if (res?.success) all.push(...(res.data.items as G2BulkCatalogProduct[]));
                    }
                }
            }

            const labels = new Map<string, string>();
            const denoms = all.map((p) => {
                const d = g2bToDenomination(p);
                const slug = toBrandSlug(
                    deriveG2BulkBrand({ title: p.title, categoryTitle: p.categoryTitle }),
                );
                labels.set(d.key, brandLabelForSlug(slug));
                return d;
            });
            setItems(denoms);
            setBrandLabels(labels);
            setIsLoading(false);
        };
        load();
        return () => {
            active = false;
        };
    }, []);

    /* ───── Derived (search → region pills → region filter → group) ───── */
    const searched = useMemo(() => {
        if (!query) return items;
        return items.filter((it) => {
            const label = brandLabels.get(it.key) ?? "";
            return (
                it.title.toLowerCase().includes(query) ||
                label.toLowerCase().includes(query) ||
                it.region.toLowerCase().includes(query) ||
                regionLabel(it.region).toLowerCase().includes(query)
            );
        });
    }, [items, query, brandLabels]);

    const regions = useMemo(() => regionsFrom(searched), [searched]);

    const filtered = useMemo(() => {
        if (region === ALL_REGION) return searched;
        return searched.filter((it) => it.region === region);
    }, [searched, region]);

    const grouped = useMemo(() => groupByRegion(filtered, region), [filtered, region]);

    const selected = useMemo(
        () => items.find((it) => it.key === selectedKey) || null,
        [items, selectedKey],
    );

    // Drop a stale region filter when a new search hides it.
    useEffect(() => {
        if (region !== ALL_REGION && !regions.includes(region)) setRegion(ALL_REGION);
    }, [regions, region]);

    // Clamp quantity to selected stock on selection change.
    useEffect(() => {
        if (!selected) {
            setQuantity(1);
            return;
        }
        setQuantity(Math.min(Math.max(1, quantity), Math.max(1, selected.stock)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedKey]);

    /* ───── Actions ───── */
    const handleSelect = useCallback((it: Denomination) => {
        if (it.stock <= 0) {
            toast.error("Rupture de stock — choisissez une autre dénomination.");
            return;
        }
        setSelectedKey(it.key);
    }, []);

    const handlePurchase = useCallback(async () => {
        if (!selected || !resellerId || quantity < 1) return;
        setIsCheckingOut(true);
        try {
            const res = await checkoutResellerAction({
                resellerId,
                cart: [
                    {
                        g2bulkProductId: (selected.raw as G2BulkCatalogProduct).productId,
                        quantity,
                    },
                ],
            });
            if (res.success) {
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
    }, [selected, resellerId, quantity]);

    const countLabel = isLoading
        ? "Chargement du catalogue…"
        : query
          ? `${filtered.length} résultat${filtered.length === 1 ? "" : "s"} pour « ${query} »`
          : `${items.length} produit${items.length === 1 ? "" : "s"} au catalogue`;

    /* ───── Render ───── */
    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <button
                onClick={() => router.push("/reseller/shop")}
                className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
                <ArrowLeft size={14} />
                Retour aux catégories
            </button>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
                {/* LEFT: header + search + filters + list */}
                <div className="space-y-5 min-w-0">
                    <div className="space-y-1">
                        <h1 className="text-4xl lg:text-5xl font-black text-white tracking-tight">
                            Tout le catalogue
                        </h1>
                        <p className="text-sm text-slate-400">{countLabel}</p>
                        {meta && (meta.tierDiscountPct > 0 || meta.customDiscountPct > 0) && (
                            <p className="text-[11px] font-black uppercase tracking-widest text-emerald-400">
                                Remise appliquée :{" "}
                                {(meta.tierDiscountPct + meta.customDiscountPct).toFixed(0)}%
                                {meta.tierName ? ` · Tier ${meta.tierName}` : ""}
                            </p>
                        )}
                    </div>

                    <div className="relative">
                        <Search
                            size={16}
                            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
                        />
                        <input
                            type="search"
                            placeholder="Rechercher (marque, titre, région…)"
                            value={rawQuery}
                            onChange={(e) => setRawQuery(e.target.value)}
                            data-testid="catalog-search"
                            className="w-full h-12 pl-11 pr-4 rounded-full bg-[#161616] border border-[#262626] text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FACC15]/60 focus:ring-2 focus:ring-[#FACC15]/20 transition-all"
                        />
                    </div>

                    {regions.length > 1 && (
                        <RegionPills regions={regions} value={region} onChange={setRegion} />
                    )}

                    {isLoading ? (
                        <div className="py-20 flex justify-center">
                            <Spinner color="warning" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <p className="text-center text-slate-500 italic py-12">
                            Aucun produit ne correspond à votre recherche.
                        </p>
                    ) : (
                        <div className="space-y-6" data-testid="catalog-list">
                            {grouped.map(({ region: r, items: groupItems }) => (
                                <section key={r} data-testid="region-group" data-region={r}>
                                    {region === ALL_REGION && (
                                        <header className="flex items-baseline justify-between mb-2 pb-1 border-b border-[#262626]">
                                            <h2 className="text-sm font-black uppercase tracking-widest text-slate-300 flex items-center gap-2">
                                                <span aria-hidden>{regionFlag(r)}</span>
                                                <span>{regionLabel(r)}</span>
                                                <span className="text-[10px] text-slate-500 ml-1">({r})</span>
                                            </h2>
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                {groupItems.length} produit
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
                                                onSelect={handleSelect}
                                                brandLabel={brandLabels.get(it.key)}
                                            />
                                        ))}
                                    </ul>
                                </section>
                            ))}
                        </div>
                    )}
                </div>

                {/* RIGHT: sticky purchase panel */}
                <aside className="lg:sticky lg:top-24">
                    <PurchasePanel
                        item={selected}
                        quantity={quantity}
                        onQuantity={setQuantity}
                        onPurchase={handlePurchase}
                        isCheckingOut={isCheckingOut}
                        onAddToCart={
                            selected && selected.source === "g2bulk"
                                ? () => {
                                      addToCart(
                                          {
                                              productId: (selected.raw as G2BulkCatalogProduct).productId,
                                              title: selected.title,
                                              priceDzd: selected.priceDzd,
                                              stock: selected.stock,
                                              brandLabel: brandLabels.get(selected.key),
                                              region: selected.region,
                                          },
                                          quantity,
                                      );
                                      toast.success("Ajouté au panier");
                                  }
                                : undefined
                        }
                    />
                </aside>
            </div>

            <PurchaseSuccessModal
                isOpen={modalOrderId !== null}
                onClose={() => setModalOrderId(null)}
                orderId={modalOrderId}
                resellerName={resellerName}
            />
            <CartBar />
        </div>
    );
}
