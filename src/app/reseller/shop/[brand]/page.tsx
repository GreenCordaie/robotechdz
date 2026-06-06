"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Spinner } from "@heroui/react";
import { ArrowLeft } from "lucide-react";
import { toast } from "react-hot-toast";

// BSV import temporarily commented out — operator disabled BSV catalog 2026-05-25,
// will re-enable via curated import flow. Restore when ready.
// import { getBsvCatalogAction } from "../actions";
import {
    getG2BulkCatalogAction,
    type G2BulkCatalogProduct,
} from "../g2bulk-shop-actions";
import { checkoutResellerAction, getCurrentResellerAction } from "../../actions";
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
import type { EnrichedBsvListing } from "@/types/bsv-listings";
import PurchaseSuccessModal from "../components/PurchaseSuccessModal";
import { CartBar } from "../components/CartBar";
import { useResellerCart } from "@/store/useResellerCart";

// Action schemas cap `limit` at 48 — keep at or below that.
const PAGE_SIZE = 48;

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

    /* ───── Catalog fetch ───── */
    useEffect(() => {
        let active = true;
        const load = async () => {
            setIsLoading(true);
            try {
                // G2Bulk: fetch ALL pages and filter client-side by
                // categoryTitle-derived brand. We CANNOT use q=label because
                // G2Bulk titles often omit the game name (e.g. "1 USD Diamond"
                // for Free Fire) — q would return zero matches for many brands.
                // 980 products / 48-per-page = 21 pages. Bump to 25 for headroom.
                //
                // PERF: page 1 first to learn `totalPages`, then the remaining
                // pages IN PARALLEL (was a sequential loop ~21 round-trips).
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
    const regions = useMemo(() => regionsFrom(items), [items]);

    const filtered = useMemo(() => {
        if (region === ALL_REGION) return items;
        return items.filter((it) => it.region === region);
    }, [items, region]);

    const grouped = useMemo(() => groupByRegion(filtered, region), [filtered, region]);

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
            const cartItem =
                selected.source === "bsv"
                    ? { listingId: (selected.raw as EnrichedBsvListing).listingId, quantity }
                    : {
                          g2bulkProductId: (selected.raw as G2BulkCatalogProduct).productId,
                          quantity,
                      };
            const res = await checkoutResellerAction({ resellerId, cart: [cartItem] });
            if (res.success) {
                setSelectedKey(null);
                // Open the post-purchase modal with the delivered code(s) instead
                // of redirecting to "Mes Achats".
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
                {/* LEFT: title + filters + list */}
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
                        <RegionPills regions={regions} value={region} onChange={setRegion} />
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
                        <div className="space-y-6" data-testid="denomination-list">
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
                                                onSelect={handleSelect}
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
                                              brandLabel: label,
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
