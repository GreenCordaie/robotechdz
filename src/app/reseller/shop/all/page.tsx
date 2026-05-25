"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button, Spinner } from "@heroui/react";
import { Search, Minus, Plus, ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";
import { toast } from "react-hot-toast";

import {
    getG2BulkCatalogAction,
    type G2BulkCatalogProduct,
    type G2BulkCatalogPricingMeta,
} from "../g2bulk-shop-actions";
import { checkoutResellerAction, getCurrentResellerAction } from "../../actions";
import { formatCurrency } from "@/lib/formatters";
import {
    SEED_BRANDS,
    artworkFor,
    deriveG2BulkBrand,
    prettifyLabel,
    toBrandSlug,
} from "../brand-utils";
import { regionFlag, resolveRegion } from "../region-utils";

// Action schema caps `limit` at 48 — one upstream page per fetch.
const PAGE_SIZE = 48;
const SEARCH_DEBOUNCE_MS = 350;

type SortBy = "newest" | "price_asc" | "price_desc" | "title";

const SORT_OPTIONS: ReadonlyArray<{ value: SortBy; label: string }> = [
    { value: "newest", label: "Nouveautés" },
    { value: "price_asc", label: "Prix ↑" },
    { value: "price_desc", label: "Prix ↓" },
    { value: "title", label: "A → Z" },
];

function brandLabelFor(slug: string): string {
    return SEED_BRANDS.find((b) => b.slug === slug)?.label ?? prettifyLabel(slug);
}

/**
 * Flat, searchable catalog of EVERY G2Bulk product (server-paginated).
 * Complements the brand-gallery landing for operators who want to browse or
 * search the full ~980-product catalog in one place rather than drilling
 * brand → region → denomination.
 */
export default function ResellerShopAllPage() {
    const router = useRouter();

    const [items, setItems] = useState<ReadonlyArray<G2BulkCatalogProduct>>([]);
    const [meta, setMeta] = useState<G2BulkCatalogPricingMeta | null>(null);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [page, setPage] = useState(1);
    const [sortBy, setSortBy] = useState<SortBy>("newest");
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);

    const [rawQuery, setRawQuery] = useState("");
    const [query, setQuery] = useState("");

    const [resellerId, setResellerId] = useState<number | null>(null);
    const [quantities, setQuantities] = useState<Record<number, number>>({});
    const [buyingId, setBuyingId] = useState<number | null>(null);

    /* ───── Reseller id ───── */
    useEffect(() => {
        getCurrentResellerAction({}).then((res) => {
            if (res.success && res.data) {
                setResellerId((res.data as { id: number }).id);
            }
        });
    }, []);

    /* ───── Debounce search → reset to page 1 ───── */
    useEffect(() => {
        const t = setTimeout(() => {
            setQuery(rawQuery.trim());
            setPage(1);
        }, SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(t);
    }, [rawQuery]);

    /* ───── Catalog fetch (server-side search + pagination) ───── */
    useEffect(() => {
        let active = true;
        const load = async () => {
            setIsLoading(true);
            setLoadError(false);
            const res = await getG2BulkCatalogAction({
                q: query || undefined,
                page,
                limit: PAGE_SIZE,
                sortBy,
            }).catch(() => null);
            if (!active) return;
            if (res?.success) {
                setItems(res.data.items as G2BulkCatalogProduct[]);
                setMeta(res.data.pricing);
                setTotal(res.data.pagination.total);
                setTotalPages(Math.max(1, res.data.pagination.totalPages));
            } else {
                setItems([]);
                setLoadError(true);
            }
            setIsLoading(false);
        };
        load();
        return () => {
            active = false;
        };
    }, [query, page, sortBy]);

    const setQty = useCallback((productId: number, next: number, stock: number) => {
        setQuantities((prev) => ({
            ...prev,
            [productId]: Math.min(Math.max(1, next), Math.max(1, stock)),
        }));
    }, []);

    const handleBuy = useCallback(
        async (product: G2BulkCatalogProduct) => {
            if (!resellerId) {
                toast.error("Compte revendeur introuvable");
                return;
            }
            const quantity = quantities[product.productId] ?? 1;
            setBuyingId(product.productId);
            try {
                const res = await checkoutResellerAction({
                    resellerId,
                    cart: [{ g2bulkProductId: product.productId, quantity }],
                });
                if (res.success) {
                    toast.success("Commande envoyée à LoadBrain", { duration: 4000 });
                    setQuantities((prev) => ({ ...prev, [product.productId]: 1 }));
                } else {
                    toast.error(res.error || "Échec de la commande");
                }
            } catch {
                toast.error("Erreur technique lors du paiement");
            } finally {
                setBuyingId(null);
            }
        },
        [resellerId, quantities],
    );

    const headerCount = useMemo(() => {
        if (isLoading) return "Chargement…";
        if (query) return `${total} résultat${total === 1 ? "" : "s"} pour « ${query} »`;
        return `${total} produit${total === 1 ? "" : "s"} au catalogue`;
    }, [isLoading, total, query]);

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <button
                onClick={() => router.push("/reseller/shop")}
                className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
                <ArrowLeft size={14} />
                Retour aux catégories
            </button>

            <header className="space-y-1">
                <h1 className="text-3xl lg:text-4xl font-black text-white tracking-tight">
                    Tout le catalogue
                </h1>
                <p className="text-sm text-slate-400">{headerCount}</p>
                {meta && (meta.tierDiscountPct > 0 || meta.customDiscountPct > 0) && (
                    <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-400">
                        Remise appliquée :{" "}
                        {(meta.tierDiscountPct + meta.customDiscountPct).toFixed(0)}%
                        {meta.tierName ? ` · Tier ${meta.tierName}` : ""}
                    </p>
                )}
            </header>

            {/* Controls: search + sort */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search
                        size={16}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
                    />
                    <input
                        type="search"
                        placeholder="Rechercher un produit (titre, région…)"
                        value={rawQuery}
                        onChange={(e) => setRawQuery(e.target.value)}
                        data-testid="catalog-search"
                        className="w-full h-12 pl-11 pr-4 rounded-full bg-[#161616] border border-[#262626] text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FACC15]/60 focus:ring-2 focus:ring-[#FACC15]/20 transition-all"
                    />
                </div>
                <div className="flex gap-1.5 shrink-0">
                    {SORT_OPTIONS.map((opt) => (
                        <button
                            key={opt.value}
                            onClick={() => {
                                setSortBy(opt.value);
                                setPage(1);
                            }}
                            className={`px-3.5 h-12 rounded-full text-xs font-black tracking-tight transition-all ${
                                sortBy === opt.value
                                    ? "bg-[#FACC15] text-black"
                                    : "bg-[#161616] border border-[#262626] text-slate-300 hover:border-[#FACC15]/40"
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Grid */}
            {isLoading ? (
                <div className="py-20 flex justify-center">
                    <Spinner color="warning" />
                </div>
            ) : loadError ? (
                <p className="text-center text-amber-400 italic py-12">
                    Catalogue indisponible pour le moment. Réessayez dans un instant.
                </p>
            ) : items.length === 0 ? (
                <p className="text-center text-slate-500 italic py-12">
                    Aucun produit ne correspond à votre recherche.
                </p>
            ) : (
                <div
                    data-testid="catalog-grid"
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                >
                    {items.map((p) => (
                        <ProductCard
                            key={p.productId}
                            product={p}
                            quantity={quantities[p.productId] ?? 1}
                            onQuantity={(n) => setQty(p.productId, n, p.stock)}
                            onBuy={() => handleBuy(p)}
                            isBuying={buyingId === p.productId}
                        />
                    ))}
                </div>
            )}

            {/* Pagination */}
            {!isLoading && !loadError && totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-2">
                    <Button
                        isIconOnly
                        isDisabled={page <= 1}
                        onPress={() => setPage((p) => Math.max(1, p - 1))}
                        className="bg-[#161616] border border-[#262626] text-white min-w-10 h-10"
                        aria-label="Page précédente"
                    >
                        <ChevronLeft size={16} />
                    </Button>
                    <span className="text-sm font-black text-slate-300 tabular-nums">
                        Page {page} / {totalPages}
                    </span>
                    <Button
                        isIconOnly
                        isDisabled={page >= totalPages}
                        onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                        className="bg-[#161616] border border-[#262626] text-white min-w-10 h-10"
                        aria-label="Page suivante"
                    >
                        <ChevronRight size={16} />
                    </Button>
                </div>
            )}
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────────────── */

const ProductCard: React.FC<{
    readonly product: G2BulkCatalogProduct;
    readonly quantity: number;
    readonly onQuantity: (n: number) => void;
    readonly onBuy: () => void;
    readonly isBuying: boolean;
}> = ({ product, quantity, onQuantity, onBuy, isBuying }) => {
    const [imgFailed, setImgFailed] = useState(false);
    const brandSlug = toBrandSlug(
        deriveG2BulkBrand({ title: product.title, categoryTitle: product.categoryTitle }),
    );
    const region = resolveRegion(product.categoryTitle, product.title);
    const outOfStock = product.stock <= 0;
    const max = Math.max(1, product.stock);
    const hasDiscount = product.pricing.basePriceDzd > product.pricing.finalPriceDzd;

    return (
        <div
            data-testid="catalog-product"
            data-product-id={product.productId}
            className="flex flex-col bg-[#161616] border border-[#262626] rounded-2xl overflow-hidden hover:border-[#FACC15]/40 transition-all"
        >
            {/* Brand strip */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[#262626]">
                <span className="relative size-6 rounded-md overflow-hidden bg-[#0a0a0a] shrink-0">
                    {!imgFailed ? (
                        <Image
                            src={artworkFor(brandSlug)}
                            alt={brandLabelFor(brandSlug)}
                            fill
                            sizes="24px"
                            className="object-cover"
                            onError={() => setImgFailed(true)}
                        />
                    ) : null}
                </span>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 truncate">
                    {brandLabelFor(brandSlug)}
                </span>
                {region && (
                    <span className="ml-auto text-[10px] font-bold text-slate-400 shrink-0">
                        {regionFlag(region)} {region}
                    </span>
                )}
            </div>

            {/* Body */}
            <div className="flex-1 p-3 flex flex-col gap-2">
                <h3 className="text-sm font-bold text-white leading-snug line-clamp-2 min-h-[2.5rem]">
                    {product.title}
                </h3>
                <div className="flex items-baseline gap-2">
                    <span className="text-lg font-black text-[#FACC15]">
                        {formatCurrency(product.pricing.finalPriceDzd, "DZD")}
                    </span>
                    {hasDiscount && (
                        <span className="text-[11px] text-slate-500 line-through">
                            {formatCurrency(product.pricing.basePriceDzd, "DZD")}
                        </span>
                    )}
                </div>
                <span
                    className={`text-[10px] font-black uppercase tracking-widest ${
                        outOfStock ? "text-red-400" : "text-emerald-400"
                    }`}
                >
                    {outOfStock ? "Rupture" : `${product.stock} en stock`}
                </span>
            </div>

            {/* Footer: qty + buy */}
            <div className="p-3 pt-0 flex items-center gap-2">
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={() => onQuantity(quantity - 1)}
                        disabled={outOfStock}
                        className="size-8 rounded-lg border border-[#262626] flex items-center justify-center hover:border-[#FACC15]/40 text-white disabled:opacity-40"
                        aria-label="Diminuer"
                    >
                        <Minus size={13} />
                    </button>
                    <input
                        type="number"
                        min={1}
                        max={max}
                        value={quantity}
                        disabled={outOfStock}
                        onChange={(e) => {
                            const n = parseInt(e.target.value, 10);
                            if (Number.isFinite(n)) onQuantity(n);
                        }}
                        className="w-12 h-8 bg-[#0a0a0a] border border-[#262626] rounded-lg text-center text-white text-sm font-black focus:outline-none focus:border-[#FACC15] disabled:opacity-40"
                    />
                    <button
                        type="button"
                        onClick={() => onQuantity(quantity + 1)}
                        disabled={outOfStock}
                        className="size-8 rounded-lg border border-[#262626] flex items-center justify-center hover:border-[#FACC15]/40 text-white disabled:opacity-40"
                        aria-label="Augmenter"
                    >
                        <Plus size={13} />
                    </button>
                </div>
                <Button
                    onPress={onBuy}
                    isLoading={isBuying}
                    isDisabled={isBuying || outOfStock}
                    data-testid="catalog-buy-btn"
                    className="flex-1 h-9 bg-[#FACC15] text-black font-black text-sm rounded-xl hover:bg-[#FACC15]/90 transition-colors"
                >
                    Acheter
                </Button>
            </div>
        </div>
    );
};
