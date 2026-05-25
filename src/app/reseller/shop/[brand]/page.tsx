"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
    ArrowLeft,
    ChevronRight,
    CreditCard,
    Minus,
    Plus,
    ShoppingCart,
    Trash2,
} from "lucide-react";
import { toast } from "react-hot-toast";

import { getBsvCatalogAction } from "../actions";
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
import type { EnrichedBsvListing } from "@/types/bsv-listings";

type SourceFilter = "all" | "bsv" | "g2bulk";

interface CartItem {
    readonly source: "bsv" | "g2bulk";
    readonly listingId?: string;
    readonly g2bulkProductId?: number;
    readonly title: string;
    readonly seller: string;
    readonly finalPriceDzd: number;
    readonly listPriceDzd: number;
    readonly quantity: number;
}

const PAGE_SIZE = 24;

export default function ResellerBrandPage() {
    const router = useRouter();
    const params = useParams<{ brand: string }>();
    const slug = decodeURIComponent(params?.brand || "");
    const seed = SEED_BRANDS.find((b) => b.slug === slug);
    const label = seed?.label ?? prettifyLabel(slug);

    const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
    const [page, setPage] = useState(1);
    const [bsvItems, setBsvItems] = useState<EnrichedBsvListing[]>([]);
    const [bsvTotal, setBsvTotal] = useState(0);
    const [g2bItems, setG2bItems] = useState<G2BulkCatalogProduct[]>([]);
    const [g2bTotal, setG2bTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    const [resellerId, setResellerId] = useState<number | null>(null);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const { isOpen, onOpen, onClose } = useDisclosure();

    useEffect(() => {
        getCurrentResellerAction({}).then((res) => {
            if (res.success && res.data) {
                setResellerId((res.data as { id: number }).id);
            }
        });
    }, []);

    useEffect(() => {
        let active = true;
        const load = async () => {
            setIsLoading(true);
            try {
                const [bsvRes, g2bRes] = await Promise.all([
                    sourceFilter === "g2bulk"
                        ? Promise.resolve(null)
                        : getBsvCatalogAction({
                              brand: label,
                              page,
                              limit: PAGE_SIZE,
                              deliveryType: "all",
                              sellerRankMin: "all",
                              sortBy: "score",
                          }),
                    sourceFilter === "bsv"
                        ? Promise.resolve(null)
                        : getG2BulkCatalogAction({
                              q: label,
                              page,
                              limit: PAGE_SIZE,
                              sortBy: "newest",
                          }),
                ]);
                if (!active) return;
                if (bsvRes?.success) {
                    setBsvItems(bsvRes.data.items as EnrichedBsvListing[]);
                    setBsvTotal(bsvRes.data.pagination.total);
                } else {
                    setBsvItems([]);
                    setBsvTotal(0);
                }
                if (g2bRes?.success) {
                    const filtered = (g2bRes.data.items as G2BulkCatalogProduct[]).filter(
                        (p) => toBrandSlug(deriveG2BulkBrand(p.title)) === slug
                    );
                    setG2bItems(filtered);
                    setG2bTotal(filtered.length);
                } else {
                    setG2bItems([]);
                    setG2bTotal(0);
                }
            } finally {
                if (active) setIsLoading(false);
            }
        };
        load();
        return () => {
            active = false;
        };
    }, [slug, label, sourceFilter, page]);

    const cartBsvIds = useMemo(
        () => new Set(cart.filter((c) => c.source === "bsv").map((c) => c.listingId as string)),
        [cart]
    );
    const cartG2bIds = useMemo(
        () => new Set(cart.filter((c) => c.source === "g2bulk").map((c) => c.g2bulkProductId as number)),
        [cart]
    );

    const addBsv = useCallback((l: EnrichedBsvListing) => {
        setCart((prev) => {
            const ex = prev.find((c) => c.source === "bsv" && c.listingId === l.listingId);
            if (ex) {
                toast(`${l.product.displayName} (déjà au panier)`, { icon: "✓" });
                return prev.map((c) =>
                    c.source === "bsv" && c.listingId === l.listingId
                        ? { ...c, quantity: c.quantity + 1 }
                        : c
                );
            }
            toast.success(l.product.displayName, { icon: "🛒" });
            return [
                ...prev,
                {
                    source: "bsv",
                    listingId: l.listingId,
                    title: l.product.displayName,
                    seller: l.seller.slug,
                    finalPriceDzd: l.pricing.finalPriceDzd,
                    listPriceDzd: l.pricing.listPriceDzd,
                    quantity: 1,
                },
            ];
        });
    }, []);

    const addG2b = useCallback((p: G2BulkCatalogProduct) => {
        setCart((prev) => {
            const ex = prev.find(
                (c) => c.source === "g2bulk" && c.g2bulkProductId === p.productId
            );
            if (ex) {
                toast(`${p.title} (déjà au panier)`, { icon: "✓" });
                return prev.map((c) =>
                    c.source === "g2bulk" && c.g2bulkProductId === p.productId
                        ? { ...c, quantity: c.quantity + 1 }
                        : c
                );
            }
            toast.success(p.title, { icon: "🛒" });
            return [
                ...prev,
                {
                    source: "g2bulk",
                    g2bulkProductId: p.productId,
                    title: p.title,
                    seller: "G2Bulk",
                    finalPriceDzd: p.pricing.finalPriceDzd,
                    listPriceDzd: p.pricing.basePriceDzd,
                    quantity: 1,
                },
            ];
        });
    }, []);

    const cartKey = (c: CartItem) =>
        c.source === "bsv" ? `bsv:${c.listingId}` : `g2b:${c.g2bulkProductId}`;
    const removeFromCart = (key: string) =>
        setCart((prev) => prev.filter((c) => cartKey(c) !== key));
    const updateQuantity = (key: string, delta: number) =>
        setCart((prev) =>
            prev
                .map((c) =>
                    cartKey(c) === key
                        ? { ...c, quantity: Math.max(0, c.quantity + delta) }
                        : c
                )
                .filter((c) => c.quantity > 0)
        );

    const cartTotal = cart.reduce(
        (acc, item) => acc + item.finalPriceDzd * item.quantity,
        0
    );

    const handleCheckout = async () => {
        if (cart.length === 0 || !resellerId) return;
        const sources = new Set(cart.map((c) => c.source));
        if (sources.size > 1) {
            toast.error("Panier mixé BSV+G2Bulk non supporté — séparez les commandes.");
            return;
        }
        setIsCheckingOut(true);
        try {
            const res = await checkoutResellerAction({
                resellerId,
                cart: cart.map((c) =>
                    c.source === "bsv"
                        ? { listingId: c.listingId as string, quantity: c.quantity }
                        : {
                              g2bulkProductId: c.g2bulkProductId as number,
                              quantity: c.quantity,
                          }
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

    const totalCount =
        sourceFilter === "bsv"
            ? bsvTotal
            : sourceFilter === "g2bulk"
              ? g2bTotal
              : bsvTotal + g2bTotal;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                    <button
                        onClick={() => router.push("/reseller/shop")}
                        className="size-10 rounded-full bg-[#161616] border border-[#262626] flex items-center justify-center hover:border-[#FACC15]/40 shrink-0"
                        aria-label="Retour"
                    >
                        <ArrowLeft size={16} />
                    </button>
                    <div className="min-w-0">
                        <h1 className="text-2xl lg:text-3xl font-black text-white tracking-tight truncate">
                            {label}
                        </h1>
                        <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest">
                            {totalCount} produit{totalCount === 1 ? "" : "s"}
                        </p>
                    </div>
                </div>

                {cart.length > 0 && (
                    <Button
                        onPress={onOpen}
                        data-testid="open-cart"
                        className="bg-[#FACC15] text-black font-black px-5 h-11 rounded-full"
                        endContent={<ChevronRight size={18} />}
                    >
                        Panier · {formatCurrency(cartTotal, "DZD")}
                    </Button>
                )}
            </div>

            <SourceFilterChips value={sourceFilter} onChange={setSourceFilter} />

            {isLoading ? (
                <div className="py-20 flex justify-center">
                    <Spinner color="warning" />
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {(sourceFilter === "g2bulk" ? [] : bsvItems).map((l) => (
                        <BsvCard
                            key={`bsv-${l.listingId}`}
                            listing={l}
                            inCart={cartBsvIds.has(l.listingId)}
                            onAdd={addBsv}
                        />
                    ))}
                    {(sourceFilter === "bsv" ? [] : g2bItems).map((p) => (
                        <G2bCard
                            key={`g2b-${p.productId}`}
                            product={p}
                            inCart={cartG2bIds.has(p.productId)}
                            onAdd={addG2b}
                        />
                    ))}
                    {!isLoading &&
                        (sourceFilter === "g2bulk" ? [] : bsvItems).length === 0 &&
                        (sourceFilter === "bsv" ? [] : g2bItems).length === 0 && (
                            <p className="col-span-full text-center text-slate-500 italic py-12">
                                Aucun produit dans cette catégorie pour le moment.
                            </p>
                        )}
                </div>
            )}

            <CartModal
                isOpen={isOpen}
                onClose={onClose}
                cart={cart}
                cartTotal={cartTotal}
                onUpdateQty={updateQuantity}
                onRemove={removeFromCart}
                onCheckout={handleCheckout}
                isCheckingOut={isCheckingOut}
                cartKey={cartKey}
            />
        </div>
    );
}

// ---------------------------------------------------------------------------
// Sub-components kept in the same file for locality — none exceed 50 lines.
// ---------------------------------------------------------------------------

const SourceFilterChips: React.FC<{
    readonly value: SourceFilter;
    readonly onChange: (v: SourceFilter) => void;
}> = ({ value, onChange }) => {
    const opts: ReadonlyArray<{ key: SourceFilter; label: string }> = [
        { key: "all", label: "Tous" },
        { key: "bsv", label: "BSV" },
        { key: "g2bulk", label: "G2Bulk" },
    ];
    return (
        <div className="flex items-center gap-2" data-testid="source-filter">
            {opts.map((o) => {
                const active = value === o.key;
                return (
                    <button
                        key={o.key}
                        onClick={() => onChange(o.key)}
                        className={`px-4 py-1.5 rounded-full text-xs font-black tracking-tight transition-all ${
                            active
                                ? "bg-[#FACC15] text-black"
                                : "bg-[#161616] border border-[#262626] text-slate-400 hover:text-white"
                        }`}
                    >
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
};

const BsvCard: React.FC<{
    readonly listing: EnrichedBsvListing;
    readonly inCart: boolean;
    readonly onAdd: (l: EnrichedBsvListing) => void;
}> = ({ listing, inCart, onAdd }) => (
    <div className="bg-[#161616] border border-[#262626] rounded-2xl p-4 flex flex-col gap-3 hover:border-[#FACC15]/40 transition-colors">
        <div className="flex items-start justify-between gap-2">
            <h3 className="font-bold text-white text-sm line-clamp-2 flex-1">
                {listing.product.displayName}
            </h3>
            <span className="text-[9px] uppercase font-black tracking-widest text-orange-400 bg-orange-500/10 border border-orange-500/30 px-1.5 py-0.5 rounded shrink-0">
                BSV
            </span>
        </div>
        <p className="text-[10px] text-slate-500 font-medium line-clamp-1">
            Vendeur: {listing.seller.slug} · Rang {listing.seller.rank ?? "—"}
        </p>
        <div className="flex items-end justify-between mt-auto">
            <div>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                    Stock: {listing.stockQty ?? "—"}
                </p>
                <p className="text-lg font-black text-[#FACC15]">
                    {formatCurrency(listing.pricing.finalPriceDzd, "DZD")}
                </p>
            </div>
            <Button
                size="sm"
                onPress={() => onAdd(listing)}
                isDisabled={inCart}
                startContent={inCart ? null : <Plus size={14} />}
                className={`font-bold ${inCart ? "bg-emerald-500/20 text-emerald-400" : "bg-[#FACC15] text-black"}`}
            >
                {inCart ? "Au panier" : "Ajouter"}
            </Button>
        </div>
    </div>
);

const G2bCard: React.FC<{
    readonly product: G2BulkCatalogProduct;
    readonly inCart: boolean;
    readonly onAdd: (p: G2BulkCatalogProduct) => void;
}> = ({ product, inCart, onAdd }) => (
    <div className="bg-[#161616] border border-[#262626] rounded-2xl p-4 flex flex-col gap-3 hover:border-cyan-500/40 transition-colors">
        <div className="flex items-start justify-between gap-2">
            <h3 className="font-bold text-white text-sm line-clamp-2 flex-1">
                {product.title}
            </h3>
            <span className="text-[9px] uppercase font-black tracking-widest text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 px-1.5 py-0.5 rounded shrink-0">
                G2Bulk
            </span>
        </div>
        {product.description && (
            <p className="text-[11px] text-slate-500 line-clamp-2">{product.description}</p>
        )}
        <div className="flex items-end justify-between mt-auto">
            <div>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                    Stock: {product.stock}
                </p>
                <p className="text-lg font-black text-[#FACC15]">
                    {formatCurrency(product.pricing.finalPriceDzd, "DZD")}
                </p>
            </div>
            <Button
                size="sm"
                onPress={() => onAdd(product)}
                isDisabled={inCart}
                startContent={inCart ? null : <Plus size={14} />}
                className={`font-bold ${inCart ? "bg-emerald-500/20 text-emerald-400" : "bg-[#FACC15] text-black"}`}
            >
                {inCart ? "Au panier" : "Ajouter"}
            </Button>
        </div>
    </div>
);

interface CartModalProps {
    readonly isOpen: boolean;
    readonly onClose: () => void;
    readonly cart: ReadonlyArray<CartItem>;
    readonly cartTotal: number;
    readonly onUpdateQty: (key: string, delta: number) => void;
    readonly onRemove: (key: string) => void;
    readonly onCheckout: () => void;
    readonly isCheckingOut: boolean;
    readonly cartKey: (c: CartItem) => string;
}

const CartModal: React.FC<CartModalProps> = ({
    isOpen,
    onClose,
    cart,
    cartTotal,
    onUpdateQty,
    onRemove,
    onCheckout,
    isCheckingOut,
    cartKey,
}) => (
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
                            <ShoppingCart className="text-[#FACC15]" />
                            Récapitulatif
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
                                        </h4>
                                        <p className="text-[10px] text-slate-500 font-medium">
                                            Vendeur: {item.seller}
                                        </p>
                                        <p className="text-xs text-[#FACC15] font-black mt-0.5">
                                            {formatCurrency(item.finalPriceDzd, "DZD")}{" "}
                                            <span className="text-slate-500 font-medium">/ unité</span>
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-4 ml-4">
                                        <div className="flex items-center gap-2 bg-[#0a0a0a] rounded-xl border border-[#262626] p-1">
                                            <button
                                                onClick={() => onUpdateQty(cartKey(item), -1)}
                                                className="size-7 rounded-lg flex items-center justify-center hover:bg-white/5 text-slate-400"
                                                aria-label="Diminuer"
                                            >
                                                <Minus size={14} />
                                            </button>
                                            <span className="text-sm font-black w-4 text-center">
                                                {item.quantity}
                                            </span>
                                            <button
                                                onClick={() => onUpdateQty(cartKey(item), 1)}
                                                className="size-7 rounded-lg flex items-center justify-center hover:bg-white/5 text-slate-400"
                                                aria-label="Augmenter"
                                            >
                                                <Plus size={14} />
                                            </button>
                                        </div>
                                        <button
                                            onClick={() => onRemove(cartKey(item))}
                                            className="p-2 text-slate-600 hover:text-red-500"
                                            aria-label="Retirer"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-6 p-6 rounded-2xl bg-[#FACC15]/5 border border-[#FACC15]/10">
                            <div className="flex justify-between items-center">
                                <span className="text-lg font-black text-white">Total à débiter</span>
                                <span className="text-3xl font-black text-[#FACC15]">
                                    {formatCurrency(cartTotal, "DZD")}
                                </span>
                            </div>
                        </div>
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="light" onPress={closeFn} className="font-bold text-slate-400">
                            Continuer mes achats
                        </Button>
                        <Button
                            onPress={onCheckout}
                            disabled={isCheckingOut}
                            className="bg-[#FACC15] text-black font-black px-10 h-14 rounded-2xl"
                            endContent={!isCheckingOut && <CreditCard size={20} />}
                        >
                            {isCheckingOut ? <Spinner size="sm" /> : "Confirmer & Payer"}
                        </Button>
                    </ModalFooter>
                </>
            )}
        </ModalContent>
    </Modal>
);
