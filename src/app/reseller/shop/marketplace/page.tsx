"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Button,
} from "@heroui/react";
import { ArrowLeft, Search, Store, Zap, Clock, Minus, Plus } from "lucide-react";
import { toast } from "react-hot-toast";

import { formatCurrency } from "@/lib/formatters";
import { getBsvCatalogAction, type BsvCatalogPricingMeta } from "../actions";
import { checkoutResellerAction, getCurrentResellerAction } from "../../actions";
import { BsvListingGrid } from "../components/BsvListingGrid";
import PurchaseSuccessModal from "../components/PurchaseSuccessModal";
import type { EnrichedBsvListing, BsvListingsPagination } from "@/types/bsv-listings";

type DeliveryFilter = "all" | "auto" | "manual";

const PAGE_SIZE = 24;

const DELIVERY_PILLS: ReadonlyArray<{ value: DeliveryFilter; label: string }> = [
    { value: "all", label: "Tous" },
    { value: "auto", label: "⚡ Instantané" },
    { value: "manual", label: "⏳ Sous 24h" },
];

const EMPTY_PAGINATION: BsvListingsPagination = { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 };

// BSV search matches ALL whitespace tokens (AND). A long, specific title like
// "Xbox Game Pass Ultimate 1+1 Month" returns 0 because no single listing
// carries every token. Progressively drop trailing tokens until a query hits,
// so the search behaves like a forgiving marketplace. Capped at 5 attempts.
function buildQueryCandidates(q: string): string[] {
    const tokens = q.split(/\s+/).filter(Boolean);
    if (tokens.length <= 1) return [q];
    const out: string[] = [];
    for (let end = tokens.length; end >= 1 && out.length < 5; end--) {
        out.push(tokens.slice(0, end).join(" "));
    }
    return out;
}

/**
 * Marketplace — live BuySellVouchers mirror. Every search query hits BSV in
 * real time via `getBsvCatalogAction` (LoadBrain SDK v2 `listings.search`).
 * Buying debits the wallet and creates the upstream order; the code is then
 * delivered instantly (auto listings) or as soon as the seller fulfils it
 * (manual) — surfaced by the polling PurchaseSuccessModal.
 */
export default function ResellerMarketplacePage() {
    const router = useRouter();

    const [rawQuery, setRawQuery] = useState("");
    const [query, setQuery] = useState("");
    const [effectiveQuery, setEffectiveQuery] = useState("");
    const [delivery, setDelivery] = useState<DeliveryFilter>("all");
    const [page, setPage] = useState(1);

    const [items, setItems] = useState<ReadonlyArray<EnrichedBsvListing>>([]);
    const [pagination, setPagination] = useState<BsvListingsPagination>(EMPTY_PAGINATION);
    const [meta, setMeta] = useState<BsvCatalogPricingMeta | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [resellerId, setResellerId] = useState<number | null>(null);
    const [resellerName, setResellerName] = useState<string | undefined>(undefined);

    // Purchase flow.
    const [selected, setSelected] = useState<EnrichedBsvListing | null>(null);
    const [quantity, setQuantity] = useState(1);
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

    /* ───── Debounce the search input (300ms) ───── */
    useEffect(() => {
        const t = setTimeout(() => {
            setQuery(rawQuery.trim());
            setPage(1);
        }, 300);
        return () => clearTimeout(t);
    }, [rawQuery]);

    // Reset to page 1 when the delivery filter changes.
    useEffect(() => {
        setPage(1);
    }, [delivery]);

    /* ───── Live BSV search (with progressive token fallback) ───── */
    useEffect(() => {
        let active = true;
        setIsLoading(true);
        setError(null);

        const run = async () => {
            const candidates: ReadonlyArray<string | undefined> = query
                ? buildQueryCandidates(query)
                : [undefined];

            for (let i = 0; i < candidates.length; i++) {
                const cand = candidates[i];
                const res = await getBsvCatalogAction({
                    q: cand || undefined,
                    deliveryType: delivery,
                    sellerRankMin: "all",
                    sortBy: "score",
                    page,
                    limit: PAGE_SIZE,
                });
                if (!active) return;
                if (!res.success) {
                    setItems([]);
                    setPagination(EMPTY_PAGINATION);
                    setError(res.error);
                    setIsLoading(false);
                    return;
                }
                const isLast = i === candidates.length - 1;
                if (res.data.pagination.total > 0 || isLast) {
                    setItems(res.data.items);
                    setPagination(res.data.pagination);
                    setMeta(res.data.pricing);
                    setEffectiveQuery(cand ?? "");
                    setIsLoading(false);
                    return;
                }
            }
            setIsLoading(false);
        };

        run();
        return () => {
            active = false;
        };
    }, [query, delivery, page]);

    const max = Math.max(1, selected?.stockQty ?? 1);
    const total = (selected?.pricing.finalPriceDzd ?? 0) * quantity;

    const selectListing = useCallback((listing: EnrichedBsvListing) => {
        if ((listing.stockQty ?? 0) <= 0) {
            toast.error("Annonce en rupture — choisissez-en une autre.");
            return;
        }
        setSelected(listing);
        setQuantity(1);
    }, []);

    const handlePurchase = useCallback(async () => {
        if (!selected || !resellerId || quantity < 1) return;
        setIsCheckingOut(true);
        try {
            const res = await checkoutResellerAction({
                resellerId,
                cart: [{ listingId: selected.listingId, quantity }],
            });
            if (res.success) {
                setBoughtLabel(selected.product.displayName);
                setSelected(null);
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

    const countLabel = useMemo(() => {
        if (isLoading) return "Recherche en cours…";
        if (error) return "Catalogue temporairement indisponible";
        const n = pagination.total;
        const base = `${n} annonce${n === 1 ? "" : "s"}`;
        return query ? `${base} pour « ${query} »` : base;
    }, [isLoading, error, pagination.total, query]);

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
                {!isLoading &&
                    !error &&
                    !!query &&
                    effectiveQuery !== query &&
                    pagination.total > 0 && (
                        <p className="text-[11px] font-bold text-amber-400/90">
                            Aucun résultat exact — résultats élargis pour «{" "}
                            {effectiveQuery} »
                        </p>
                    )}
                {meta && (meta.tierDiscountPct > 0 || meta.customDiscountPct > 0) && (
                    <p className="text-[11px] font-black uppercase tracking-widest text-emerald-400">
                        Remise appliquée :{" "}
                        {(meta.tierDiscountPct + meta.customDiscountPct).toFixed(0)}%
                        {meta.tierName ? ` · Tier ${meta.tierName}` : ""}
                    </p>
                )}
            </div>

            {/* Live search */}
            <div className="relative">
                <Search
                    size={16}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                    type="search"
                    placeholder="Rechercher en direct sur le marché (marque, montant, région…)"
                    value={rawQuery}
                    onChange={(e) => setRawQuery(e.target.value)}
                    data-testid="marketplace-search"
                    className="w-full h-12 pl-11 pr-4 rounded-full bg-[#161616] border border-[#262626] text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FACC15]/60 focus:ring-2 focus:ring-[#FACC15]/20 transition-all"
                />
            </div>

            {/* Delivery filter pills */}
            <div className="flex flex-wrap gap-2">
                {DELIVERY_PILLS.map((pill) => (
                    <button
                        key={pill.value}
                        type="button"
                        onClick={() => setDelivery(pill.value)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                            delivery === pill.value
                                ? "bg-[#FACC15] text-black border-[#FACC15]"
                                : "bg-[#161616] text-slate-300 border-[#262626] hover:border-[#FACC15]/40"
                        }`}
                    >
                        {pill.label}
                    </button>
                ))}
            </div>

            {error ? (
                <div className="text-center text-slate-500 italic py-12">
                    Réessayez dans un instant. ({error})
                </div>
            ) : (
                <BsvListingGrid
                    items={items as EnrichedBsvListing[]}
                    pagination={pagination}
                    isLoading={isLoading}
                    cartListingIds={new Set()}
                    onAddToCart={selectListing}
                    onPageChange={setPage}
                    ctaLabel="Acheter"
                />
            )}

            {/* Purchase confirmation */}
            <Modal isOpen={!!selected} onClose={() => setSelected(null)} size="md">
                <ModalContent className="bg-[#161616] border border-[#262626]">
                    {(close) =>
                        selected && (
                            <>
                                <ModalHeader className="flex flex-col gap-1">
                                    <span className="flex items-center gap-2">
                                        {selected.deliveryType === "auto" ? (
                                            <span className="px-2 py-0.5 rounded-md bg-cyan-500/15 text-[9px] font-black text-cyan-400 uppercase border border-cyan-500/30 flex items-center gap-1">
                                                <Zap size={10} /> Instantané
                                            </span>
                                        ) : (
                                            <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-[9px] font-black text-amber-400 uppercase border border-amber-500/30 flex items-center gap-1">
                                                <Clock size={10} /> Sous 24h
                                            </span>
                                        )}
                                    </span>
                                    <span className="text-base font-black text-white leading-snug">
                                        {selected.product.displayName}
                                    </span>
                                </ModalHeader>
                                <ModalBody className="space-y-4">
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-lg font-black text-[#FACC15]">
                                            {formatCurrency(selected.pricing.finalPriceDzd, "DZD")}
                                        </span>
                                        <span className="text-xs text-slate-500">/ unité</span>
                                        <span className="ml-auto text-[10px] uppercase font-black tracking-widest text-emerald-400">
                                            {selected.stockQty ?? 0} dispo
                                        </span>
                                    </div>

                                    <div className="border-t border-[#262626] pt-4 space-y-2">
                                        <label className="text-[10px] uppercase font-black tracking-widest text-slate-500">
                                            Quantité
                                        </label>
                                        <div className="flex items-center gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setQuantity(Math.max(1, quantity - 1))}
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
                                                        setQuantity(Math.min(max, Math.max(1, n)));
                                                }}
                                                className="flex-1 h-9 bg-[#0a0a0a] border border-[#262626] rounded-lg text-center text-white font-black focus:outline-none focus:border-[#FACC15]"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setQuantity(Math.min(max, quantity + 1))}
                                                className="size-9 rounded-lg border border-[#262626] flex items-center justify-center hover:border-[#FACC15]/40 text-white"
                                                aria-label="Augmenter"
                                            >
                                                <Plus size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="border-t border-[#262626] pt-4 flex items-baseline justify-between">
                                        <span className="text-[11px] uppercase font-black tracking-widest text-slate-500">
                                            Total
                                        </span>
                                        <span className="text-xl font-black text-[#FACC15]">
                                            {formatCurrency(total, "DZD")}
                                        </span>
                                    </div>

                                    <p className="text-[11px] text-slate-500">
                                        {selected.deliveryType === "auto"
                                            ? "Livraison instantanée — le code s'affiche juste après l'achat."
                                            : "Livraison sous 24h — le code apparaîtra ici et dans « Mes Achats » dès que le vendeur livre."}
                                    </p>
                                </ModalBody>
                                <ModalFooter>
                                    <Button
                                        variant="light"
                                        onPress={close}
                                        isDisabled={isCheckingOut}
                                        className="text-slate-400 font-bold"
                                    >
                                        Annuler
                                    </Button>
                                    <Button
                                        onPress={handlePurchase}
                                        isLoading={isCheckingOut}
                                        isDisabled={isCheckingOut || (selected.stockQty ?? 0) <= 0}
                                        data-testid="marketplace-buy-btn"
                                        className="bg-[#FACC15] text-black font-black px-6"
                                    >
                                        {isCheckingOut ? "Traitement…" : "Acheter maintenant"}
                                    </Button>
                                </ModalFooter>
                            </>
                        )
                    }
                </ModalContent>
            </Modal>

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
