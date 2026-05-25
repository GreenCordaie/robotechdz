"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    Button,
    Divider,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Spinner,
    useDisclosure,
} from "@heroui/react";
import {
    ChevronRight,
    CreditCard,
    Minus,
    Plus,
    ShoppingCart,
    Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";

import { getBsvCatalogAction } from "./actions";
import {
    getG2BulkCatalogAction,
    type G2BulkCatalogProduct,
} from "./g2bulk-shop-actions";
import { checkoutResellerAction, getCurrentResellerAction } from "../actions";
import { formatCurrency } from "@/lib/formatters";
import {
    BsvShopFilters,
    type BsvShopFiltersValue,
} from "./components/BsvShopFilters";
import { BsvListingGrid } from "./components/BsvListingGrid";
import type { EnrichedBsvListing } from "@/types/bsv-listings";

type CartItem = {
    // Either a BSV listing or a G2Bulk product, distinguished by `source`.
    source: "bsv" | "g2bulk";
    // BSV uses listingId (string), G2Bulk uses g2bulkProductId (number).
    listingId?: string;
    g2bulkProductId?: number;
    title: string;
    seller: string;
    finalPriceDzd: number;
    listPriceDzd: number;
    quantity: number;
};

interface ResellerSummary {
    id: number;
    companyName: string;
}

interface PaginationMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

interface PricingMeta {
    tierName: string | null;
    tierColor: string | null;
    tierDiscountPct: number;
    customDiscountPct: number;
    conversionRate: number;
}

const DEFAULT_FILTERS: BsvShopFiltersValue = {
    q: "",
    brand: "",
    category: "",
    region: "",
    deliveryType: "all",
    sellerRankMin: "all",
    priceMinDzd: undefined,
    priceMaxDzd: undefined,
    sortBy: "score",
};

export default function ResellerShop() {
    const router = useRouter();
    const [filters, setFilters] = useState<BsvShopFiltersValue>(DEFAULT_FILTERS);
    const [debouncedQ, setDebouncedQ] = useState("");
    const [page, setPage] = useState(1);

    const [items, setItems] = useState<EnrichedBsvListing[]>([]);
    const [pagination, setPagination] = useState<PaginationMeta>({
        page: 1,
        limit: 24,
        total: 0,
        totalPages: 1,
    });
    const [pricing, setPricing] = useState<PricingMeta | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // G2Bulk catalog state — fetched in parallel with BSV, rendered as a
    // distinct section in the same page (operator-visible badge, unified UX).
    const [g2bulkItems, setG2bulkItems] = useState<G2BulkCatalogProduct[]>([]);
    const [g2bulkLoading, setG2bulkLoading] = useState(true);

    const [reseller, setReseller] = useState<ResellerSummary | null>(null);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const { isOpen, onOpen, onClose } = useDisclosure();

    // Debounce search input
    useEffect(() => {
        const t = setTimeout(() => setDebouncedQ(filters.q), 300);
        return () => clearTimeout(t);
    }, [filters.q]);

    // Reset page when filters change (except q which uses debouncedQ)
    useEffect(() => {
        setPage(1);
    }, [
        debouncedQ,
        filters.brand,
        filters.category,
        filters.region,
        filters.deliveryType,
        filters.sellerRankMin,
        filters.priceMinDzd,
        filters.priceMaxDzd,
        filters.sortBy,
    ]);

    // Load reseller (one-shot)
    useEffect(() => {
        getCurrentResellerAction({}).then((res) => {
            if (res.success && res.data) {
                const r = res.data as { id: number; companyName: string };
                setReseller({ id: r.id, companyName: r.companyName });
            } else {
                toast.error("Session revendeur non trouvée");
            }
        });
    }, []);

    // Load G2Bulk catalog in parallel with BSV (page/search apply to both,
    // best-effort: G2Bulk uses its own categoryId/priceMax — title-search
    // shared).
    useEffect(() => {
        let cancelled = false;
        const loadG2bulk = async () => {
            setG2bulkLoading(true);
            try {
                const res = await getG2BulkCatalogAction({
                    q: debouncedQ || undefined,
                    priceMaxDzd: filters.priceMaxDzd,
                    sortBy:
                        filters.sortBy === "price_asc"
                            ? "price_asc"
                            : filters.sortBy === "price_desc"
                                ? "price_desc"
                                : "newest",
                    page: 1,
                    limit: 24,
                });
                if (cancelled) return;
                if (res?.success) {
                    setG2bulkItems(res.data.items as G2BulkCatalogProduct[]);
                } else {
                    setG2bulkItems([]);
                }
            } catch {
                if (!cancelled) setG2bulkItems([]);
            } finally {
                if (!cancelled) setG2bulkLoading(false);
            }
        };
        loadG2bulk();
        return () => {
            cancelled = true;
        };
    }, [debouncedQ, filters.priceMaxDzd, filters.sortBy]);

    // Load catalog reactively
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setIsLoading(true);
            try {
                const res = await getBsvCatalogAction({
                    q: debouncedQ || undefined,
                    brand: filters.brand || undefined,
                    category: filters.category || undefined,
                    region: filters.region || undefined,
                    deliveryType: filters.deliveryType,
                    sellerRankMin: filters.sellerRankMin,
                    priceMinDzd: filters.priceMinDzd,
                    priceMaxDzd: filters.priceMaxDzd,
                    sortBy: filters.sortBy,
                    page,
                    limit: 24,
                });
                if (cancelled) return;
                if (res?.success) {
                    setItems(res.data.items as EnrichedBsvListing[]);
                    setPagination(res.data.pagination);
                    setPricing(res.data.pricing);
                } else {
                    toast.error(res?.error || "Erreur catalogue");
                    setItems([]);
                }
            } catch {
                if (!cancelled) toast.error("Erreur réseau catalogue");
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [
        debouncedQ,
        filters.brand,
        filters.category,
        filters.region,
        filters.deliveryType,
        filters.sellerRankMin,
        filters.priceMinDzd,
        filters.priceMaxDzd,
        filters.sortBy,
        page,
    ]);

    const cartListingIds = useMemo(
        () =>
            new Set(
                cart.filter((c) => c.source === "bsv").map((c) => c.listingId as string)
            ),
        [cart]
    );
    const cartG2bulkIds = useMemo(
        () =>
            new Set(
                cart.filter((c) => c.source === "g2bulk").map((c) => c.g2bulkProductId as number)
            ),
        [cart]
    );

    const addToCart = useCallback((listing: EnrichedBsvListing) => {
        setCart((prev) => {
            const existing = prev.find(
                (c) => c.source === "bsv" && c.listingId === listing.listingId
            );
            if (existing) {
                toast(`${listing.product.displayName} (déjà au panier)`, {
                    icon: "✓",
                });
                return prev.map((c) =>
                    c.source === "bsv" && c.listingId === listing.listingId
                        ? { ...c, quantity: c.quantity + 1 }
                        : c
                );
            }
            toast.success(`${listing.product.displayName}`, { icon: "🛒" });
            return [
                ...prev,
                {
                    source: "bsv",
                    listingId: listing.listingId,
                    title: listing.product.displayName,
                    seller: listing.seller.slug,
                    finalPriceDzd: listing.pricing.finalPriceDzd,
                    listPriceDzd: listing.pricing.listPriceDzd,
                    quantity: 1,
                },
            ];
        });
    }, []);

    const addG2BulkToCart = useCallback((product: G2BulkCatalogProduct) => {
        setCart((prev) => {
            const existing = prev.find(
                (c) => c.source === "g2bulk" && c.g2bulkProductId === product.productId
            );
            if (existing) {
                toast(`${product.title} (déjà au panier)`, { icon: "✓" });
                return prev.map((c) =>
                    c.source === "g2bulk" && c.g2bulkProductId === product.productId
                        ? { ...c, quantity: c.quantity + 1 }
                        : c
                );
            }
            toast.success(`${product.title}`, { icon: "🛒" });
            return [
                ...prev,
                {
                    source: "g2bulk",
                    g2bulkProductId: product.productId,
                    title: product.title,
                    seller: "G2Bulk",
                    finalPriceDzd: product.pricing.finalPriceDzd,
                    listPriceDzd: product.pricing.basePriceDzd,
                    quantity: 1,
                },
            ];
        });
    }, []);

    // Composite cart key: stable across both sources.
    const cartKey = (c: CartItem): string =>
        c.source === "bsv" ? `bsv:${c.listingId}` : `g2b:${c.g2bulkProductId}`;

    const removeFromCart = (key: string) => {
        setCart((prev) => prev.filter((c) => cartKey(c) !== key));
    };

    const updateQuantity = (key: string, delta: number) => {
        setCart((prev) =>
            prev
                .map((c) =>
                    cartKey(c) === key
                        ? { ...c, quantity: Math.max(0, c.quantity + delta) }
                        : c
                )
                .filter((c) => c.quantity > 0)
        );
    };

    const cartTotal = cart.reduce(
        (acc, item) => acc + item.finalPriceDzd * item.quantity,
        0
    );
    const cartGross = cart.reduce(
        (acc, item) => acc + item.listPriceDzd * item.quantity,
        0
    );

    const handleCheckout = async () => {
        if (cart.length === 0 || !reseller) return;
        // The server-side checkout rejects mixing sources; nudge the user
        // before the round-trip when we can detect it client-side.
        const sources = new Set(cart.map((c) => c.source));
        if (sources.size > 1) {
            toast.error("Panier mixé BSV+G2Bulk non supporté — séparez les commandes.");
            return;
        }
        setIsCheckingOut(true);
        try {
            const res = await checkoutResellerAction({
                resellerId: reseller.id,
                cart: cart.map((c) =>
                    c.source === "bsv"
                        ? { listingId: c.listingId as string, quantity: c.quantity }
                        : { g2bulkProductId: c.g2bulkProductId as number, quantity: c.quantity }
                ),
            });
            if (res.success) {
                toast.success("Commande envoyée à LoadBrain", { duration: 4000 });
                setCart([]);
                onClose();
                router.push("/reseller/orders");
            } else {
                toast.error(res.error || "Échec de la commande");
            }
        } catch {
            toast.error("Erreur technique lors du paiement");
        } finally {
            setIsCheckingOut(false);
        }
    };

    return (
        <div className="flex flex-col h-full space-y-6 animate-in fade-in duration-500">
            {/* Top bar */}
            <div className="sticky top-[-32px] z-20 bg-[#0a0a0a]/80 backdrop-blur-xl p-4 -mx-4 rounded-b-[32px] border-b border-[#262626] mb-4">
                <div className="flex flex-col md:flex-row gap-4 max-w-7xl mx-auto items-stretch md:items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-black text-white tracking-tight">
                            Catalogue BSV
                        </h1>
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">
                            {pagination.total} annonces · prix DZD partenaire
                        </p>
                    </div>

                    {pricing && (
                        <div className="flex items-center gap-2 text-[11px] uppercase font-black tracking-widest">
                            {pricing.tierName && (
                                <span
                                    className="px-2 py-0.5 rounded-md border"
                                    style={{
                                        color: pricing.tierColor ?? "#94a3b8",
                                        backgroundColor: `${pricing.tierColor ?? "#94a3b8"}15`,
                                        borderColor: `${pricing.tierColor ?? "#94a3b8"}40`,
                                    }}
                                >
                                    {pricing.tierName}
                                </span>
                            )}
                            <span className="text-emerald-500">
                                −
                                {(
                                    pricing.tierDiscountPct +
                                    pricing.customDiscountPct
                                ).toFixed(0)}
                                %
                            </span>
                            <span className="text-slate-500 normal-case font-medium">
                                1$ ≈ {pricing.conversionRate} DZD
                            </span>
                        </div>
                    )}

                    {cart.length > 0 && (
                        <Button
                            onPress={onOpen}
                            data-testid="open-cart"
                            className="bg-emerald-500 text-white font-black px-6 h-12 rounded-2xl shadow-xl shadow-emerald-950/20"
                            endContent={<ChevronRight size={20} />}
                        >
                            Panier · {formatCurrency(cartTotal, "DZD")}
                        </Button>
                    )}
                </div>
            </div>

            <div className="max-w-7xl mx-auto w-full px-2">
                <BsvShopFilters value={filters} onChange={setFilters} />
            </div>

            <BsvListingGrid
                items={items}
                pagination={pagination}
                isLoading={isLoading}
                cartListingIds={cartListingIds}
                onAddToCart={addToCart}
                onPageChange={setPage}
            />

            {/* ----------------- G2Bulk catalog section ----------------- */}
            <section className="max-w-7xl mx-auto w-full px-2 mt-12">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <h2 className="text-xl font-black text-white tracking-tight">
                            Catalogue G2Bulk
                        </h2>
                        <span className="text-[10px] uppercase font-black tracking-widest text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 px-2 py-1 rounded">
                            G2Bulk
                        </span>
                    </div>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">
                        {g2bulkItems.length} produit{g2bulkItems.length === 1 ? "" : "s"}
                    </p>
                </div>

                {g2bulkLoading && (
                    <div className="py-10 flex justify-center">
                        <Spinner color="warning" />
                    </div>
                )}

                {!g2bulkLoading && g2bulkItems.length === 0 && (
                    <p className="text-center text-slate-500 text-sm italic py-8">
                        Aucun produit G2Bulk pour ces filtres.
                    </p>
                )}

                {!g2bulkLoading && g2bulkItems.length > 0 && (
                    <div
                        data-testid="g2bulk-grid"
                        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                    >
                        {g2bulkItems.map((p) => {
                            const inCart = cartG2bulkIds.has(p.productId);
                            return (
                                <div
                                    key={p.productId}
                                    className="bg-[#161616] border border-[#262626] rounded-2xl p-4 flex flex-col gap-3 hover:border-cyan-500/40 transition-colors"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <h3 className="font-bold text-white text-sm line-clamp-2 flex-1">
                                            {p.title}
                                        </h3>
                                        <span className="text-[9px] uppercase font-black tracking-widest text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 px-1.5 py-0.5 rounded shrink-0">
                                            G2Bulk
                                        </span>
                                    </div>
                                    {p.description && (
                                        <p className="text-[11px] text-slate-500 line-clamp-2">
                                            {p.description}
                                        </p>
                                    )}
                                    <div className="flex items-end justify-between mt-auto">
                                        <div>
                                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                                                Stock: {p.stock}
                                            </p>
                                            <p className="text-lg font-black text-[var(--primary)]">
                                                {formatCurrency(
                                                    p.pricing.finalPriceDzd,
                                                    "DZD"
                                                )}
                                            </p>
                                        </div>
                                        <Button
                                            size="sm"
                                            color={inCart ? "success" : "primary"}
                                            onPress={() => addG2BulkToCart(p)}
                                            isDisabled={inCart}
                                            startContent={
                                                inCart ? null : <Plus size={14} />
                                            }
                                            className="font-bold"
                                        >
                                            {inCart ? "Au panier" : "Ajouter"}
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            <Modal
                isOpen={isOpen}
                onClose={onClose}
                size="2xl"
                classNames={{
                    base: "bg-[#0f0d0c] border border-[#2d2622] rounded-[32px]",
                    header: "border-b border-[#2d2622] p-8",
                    body: "p-8",
                    footer: "border-t border-[#2d2622] p-8",
                }}
            >
                <ModalContent>
                    {(closeFn) => (
                        <>
                            <ModalHeader className="flex flex-col gap-1">
                                <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
                                    <ShoppingCart className="text-[var(--primary)]" />
                                    Récapitulatif Commande BSV
                                </h2>
                                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">
                                    Paiement via Wallet partenaire
                                </p>
                            </ModalHeader>
                            <ModalBody>
                                <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-2">
                                    {cart.map((item) => (
                                        <div
                                            key={cartKey(item)}
                                            className="flex items-center justify-between bg-[#161616] p-4 rounded-2xl border border-[#262626]"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-bold text-white text-sm line-clamp-1">
                                                    {item.title}
                                                    {item.source === "g2bulk" && (
                                                        <span className="ml-2 text-[9px] uppercase font-black tracking-widest text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 px-1.5 py-0.5 rounded">
                                                            G2Bulk
                                                        </span>
                                                    )}
                                                </h4>
                                                <p className="text-[10px] text-slate-500 font-medium">
                                                    Vendeur: {item.seller}
                                                </p>
                                                <p className="text-xs text-[var(--primary)] font-black mt-0.5">
                                                    {formatCurrency(
                                                        item.finalPriceDzd,
                                                        "DZD"
                                                    )}{" "}
                                                    <span className="text-slate-500 font-medium">
                                                        / unité
                                                    </span>
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-4 ml-4">
                                                <div className="flex items-center gap-2 bg-[#0a0a0a] rounded-xl border border-[#262626] p-1">
                                                    <button
                                                        onClick={() =>
                                                            updateQuantity(
                                                                cartKey(item),
                                                                -1
                                                            )
                                                        }
                                                        className="size-7 rounded-lg flex items-center justify-center hover:bg-white/5 text-slate-400"
                                                        aria-label="Diminuer"
                                                    >
                                                        <Minus size={14} />
                                                    </button>
                                                    <span className="text-sm font-black w-4 text-center">
                                                        {item.quantity}
                                                    </span>
                                                    <button
                                                        onClick={() =>
                                                            updateQuantity(
                                                                cartKey(item),
                                                                1
                                                            )
                                                        }
                                                        className="size-7 rounded-lg flex items-center justify-center hover:bg-white/5 text-slate-400"
                                                        aria-label="Augmenter"
                                                    >
                                                        <Plus size={14} />
                                                    </button>
                                                </div>
                                                <button
                                                    onClick={() =>
                                                        removeFromCart(
                                                            cartKey(item)
                                                        )
                                                    }
                                                    className="p-2 text-slate-600 hover:text-red-500"
                                                    aria-label="Retirer"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-6 p-6 rounded-2xl bg-orange-500/5 border border-orange-500/10 space-y-4">
                                    {cartGross !== cartTotal && (
                                        <>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-slate-400 font-bold uppercase tracking-wider">
                                                    Sous-total brut
                                                </span>
                                                <span className="text-slate-300 font-black">
                                                    {formatCurrency(
                                                        cartGross,
                                                        "DZD"
                                                    )}
                                                </span>
                                            </div>
                                            <Divider className="bg-[#2d2622]" />
                                        </>
                                    )}
                                    <div className="flex justify-between items-center">
                                        <span className="text-lg font-black text-white">
                                            Total à débiter
                                        </span>
                                        <span className="text-3xl font-black text-[var(--primary)]">
                                            {formatCurrency(cartTotal, "DZD")}
                                        </span>
                                    </div>
                                </div>
                            </ModalBody>
                            <ModalFooter>
                                <Button
                                    variant="light"
                                    onPress={closeFn}
                                    className="font-bold text-slate-400"
                                >
                                    Continuer mes achats
                                </Button>
                                <Button
                                    onPress={handleCheckout}
                                    disabled={isCheckingOut}
                                    className="bg-[var(--primary)] text-white font-black px-10 h-14 rounded-2xl shadow-xl shadow-orange-950/40"
                                    endContent={
                                        !isCheckingOut && <CreditCard size={20} />
                                    }
                                >
                                    {isCheckingOut ? (
                                        <Spinner size="sm" color="white" />
                                    ) : (
                                        "Confirmer & Payer"
                                    )}
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>
        </div>
    );
}
