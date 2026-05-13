"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
    Card,
    CardBody,
    Button,
    Spinner,
    Divider,
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    useDisclosure,
} from "@heroui/react";
import {
    Search,
    Zap,
    ShoppingCart,
    CreditCard,
    ChevronRight,
    Gamepad2,
    Tv,
    Plus,
    Trash2,
    Minus,
    Package,
    Wrench,
} from "lucide-react";
import { getResellerCatalogAction, ResellerCatalogItem, ResellerCatalogPricing } from "./actions";
import { checkoutResellerAction, getCurrentResellerAction } from "../actions";
import { formatCurrency } from "@/lib/formatters";
import { toast } from "react-hot-toast";
import Image from "next/image";
import { useRouter } from "next/navigation";

type CartItem = ResellerCatalogItem & { quantity: number };

interface ResellerSummary {
    id: number;
    companyName: string;
}

export default function ResellerShop() {
    const [items, setItems] = useState<ResellerCatalogItem[]>([]);
    const [pricing, setPricing] = useState<ResellerCatalogPricing | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [selectedDelivery, setSelectedDelivery] = useState<"all" | "auto" | "stock">("all");
    const [cart, setCart] = useState<CartItem[]>([]);
    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const { isOpen, onOpen, onClose } = useDisclosure();
    const router = useRouter();

    const [reseller, setReseller] = useState<ResellerSummary | null>(null);

    // Debounce search input
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
        return () => clearTimeout(t);
    }, [searchTerm]);

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

    // Load catalog (on search/filter change)
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setIsLoading(true);
            try {
                const res: any = await getResellerCatalogAction({
                    page: 1,
                    limit: 48,
                    search: debouncedSearch || undefined,
                });
                if (cancelled) return;
                if (res?.success) {
                    setItems(res.data.items as ResellerCatalogItem[]);
                    setPricing(res.data.pricing as ResellerCatalogPricing);
                } else {
                    toast.error(res?.error || "Erreur catalogue");
                    setItems([]);
                }
            } catch (err) {
                if (!cancelled) toast.error("Erreur réseau catalogue");
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [debouncedSearch]);

    const filteredItems = useMemo(() => {
        if (selectedDelivery === "all") return items;
        return items.filter((i) => i.deliveryType === selectedDelivery);
    }, [items, selectedDelivery]);

    const addToCart = (item: ResellerCatalogItem) => {
        // Bloquer ajout si stock=0 et delivery=manual (sera commandé en attente)
        if (item.deliveryType === "stock" && item.stock <= 0) {
            toast.error("Rupture de stock");
            return;
        }
        setCart((prev) => {
            const existing = prev.find((c) => c.variantId === item.variantId);
            if (existing) {
                // Cap par stock pour les variants "stock"
                const max = item.deliveryType === "stock" ? item.stock : Infinity;
                if (existing.quantity >= max) {
                    toast.error(`Stock max atteint (${max})`);
                    return prev;
                }
                return prev.map((c) =>
                    c.variantId === item.variantId ? { ...c, quantity: c.quantity + 1 } : c
                );
            }
            toast.success(`${item.productName} — ${item.variantName}`, { icon: "🛒" });
            return [...prev, { ...item, quantity: 1 }];
        });
    };

    const removeFromCart = (variantId: number) => {
        setCart((prev) => prev.filter((c) => c.variantId !== variantId));
    };

    const updateQuantity = (variantId: number, delta: number) => {
        setCart((prev) =>
            prev
                .map((c) => {
                    if (c.variantId !== variantId) return c;
                    const max = c.deliveryType === "stock" ? c.stock : Infinity;
                    const next = Math.min(max, Math.max(0, c.quantity + delta));
                    return { ...c, quantity: next };
                })
                .filter((c) => c.quantity > 0)
        );
    };

    const cartTotal = cart.reduce(
        (acc, item) => acc + item.finalPrice * item.quantity,
        0
    );
    const cartGross = cart.reduce(
        (acc, item) => acc + item.basePrice * item.quantity,
        0
    );

    const handleCheckout = async () => {
        if (cart.length === 0 || !reseller) return;
        setIsCheckingOut(true);
        try {
            const res = await checkoutResellerAction({
                resellerId: reseller.id,
                cart: cart.map((c) => ({ id: c.variantId, quantity: c.quantity })),
            });
            if (res.success) {
                toast.success("Commande validée", { duration: 4000 });
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

    const tierPctLabel =
        pricing && pricing.totalDiscountPct > 0
            ? `−${pricing.totalDiscountPct.toFixed(0)}%`
            : null;

    return (
        <div className="flex flex-col h-full space-y-8 animate-in fade-in duration-500">
            {/* Top bar */}
            <div className="sticky top-[-32px] z-20 bg-[#0a0a0a]/80 backdrop-blur-xl p-4 -mx-4 rounded-b-[32px] border-b border-[#262626] mb-4">
                <div className="flex flex-col md:flex-row gap-6 max-w-7xl mx-auto items-center">
                    <div className="relative flex-1 group">
                        <Search
                            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-[var(--primary)] transition-colors"
                            size={20}
                        />
                        <input
                            className="w-full bg-[#161616] border border-[#262626] rounded-2xl pl-12 pr-4 py-4 text-sm focus:ring-1 focus:ring-[var(--primary)]/50 outline-none text-slate-200 transition-all"
                            placeholder="Rechercher une carte, un jeu, un abonnement..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="flex gap-2 bg-[#161616] p-1.5 rounded-2xl border border-[#262626]">
                        {([
                            ["all", "Tout"],
                            ["auto", "Instant"],
                            ["stock", "En stock"],
                        ] as const).map(([key, label]) => (
                            <button
                                key={key}
                                onClick={() => setSelectedDelivery(key)}
                                className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                                    selectedDelivery === key
                                        ? "bg-[var(--primary)] text-white shadow-lg shadow-orange-950/20"
                                        : "text-slate-500 hover:text-white"
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {cart.length > 0 && (
                        <Button
                            onPress={onOpen}
                            className="bg-emerald-500 text-white font-black px-8 h-14 rounded-2xl shadow-xl shadow-emerald-950/20 animate-in zoom-in duration-300"
                            endContent={<ChevronRight size={20} />}
                        >
                            Panier · {formatCurrency(cartTotal, "DZD")}
                        </Button>
                    )}
                </div>

                {pricing && tierPctLabel && (
                    <div className="max-w-7xl mx-auto mt-3 flex items-center justify-end gap-2 text-[11px] uppercase font-black tracking-widest">
                        <span className="text-slate-500">Tarif partenaire</span>
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
                        <span className="text-emerald-500">{tierPctLabel}</span>
                    </div>
                )}
            </div>

            {/* Grid */}
            {isLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center py-40 gap-4">
                    <Spinner color="warning" size="lg" />
                    <p className="text-slate-500 font-bold uppercase tracking-[0.3em] animate-pulse">
                        Initialisation du catalogue...
                    </p>
                </div>
            ) : filteredItems.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-40 space-y-6 opacity-40">
                    <div className="size-32 rounded-[40px] bg-[#161616] border border-[#262626] flex items-center justify-center">
                        <Search size={48} className="text-slate-500" />
                    </div>
                    <p className="text-xl font-bold text-slate-500 italic">
                        Aucun produit ne correspond à votre recherche
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 max-w-7xl mx-auto pb-20">
                    {filteredItems.map((item) => (
                        <Card
                            key={item.variantId}
                            isPressable
                            onPress={() => addToCart(item)}
                            className="bg-[#161616] border border-[#262626] hover:border-[var(--primary)]/40 transition-all group overflow-visible rounded-[24px]"
                        >
                            <CardBody className="p-0">
                                <div className="aspect-[4/3] w-full bg-[#0a0a0a] rounded-t-[23px] relative overflow-hidden flex items-center justify-center">
                                    {item.productImage ? (
                                        <Image
                                            src={item.productImage}
                                            alt={item.productName}
                                            fill
                                            sizes="(max-width: 768px) 50vw, 25vw"
                                            className="object-cover group-hover:scale-110 transition-transform duration-500 opacity-80"
                                        />
                                    ) : (
                                        <div className="flex flex-col items-center gap-3 opacity-20 group-hover:opacity-40 transition-opacity">
                                            <Tv size={40} />
                                        </div>
                                    )}

                                    <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] to-transparent opacity-60" />

                                    <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                                        <DeliveryBadge type={item.deliveryType} stock={item.stock} />
                                        {item.isSharing && (
                                            <span className="px-2 py-1 rounded-md bg-purple-500/20 backdrop-blur-md text-[9px] font-bold text-purple-400 uppercase border border-purple-500/30 flex items-center gap-1">
                                                <Zap size={10} />
                                                Shared
                                            </span>
                                        )}
                                    </div>

                                    <div className="absolute bottom-3 right-3 text-white">
                                        <div className="size-10 rounded-xl bg-[var(--primary)] flex items-center justify-center shadow-lg shadow-orange-950/40 opacity-0 group-hover:opacity-100 translate-y-4 group-hover:translate-y-0 transition-all duration-300">
                                            <Plus size={24} strokeWidth={3} />
                                        </div>
                                    </div>
                                </div>

                                <div className="p-5 space-y-3">
                                    <div className="min-h-[40px]">
                                        <h4 className="font-bold text-white text-sm line-clamp-2 leading-snug group-hover:text-[var(--primary)] transition-colors">
                                            {item.productName}
                                        </h4>
                                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                                            {item.variantName}
                                        </p>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <div className="flex flex-col">
                                            {item.discountPct > 0 && (
                                                <span className="text-xs text-slate-500 font-bold line-through opacity-50">
                                                    {formatCurrency(item.basePrice, "DZD")}
                                                </span>
                                            )}
                                            <span className="text-lg font-black text-white leading-tight">
                                                {formatCurrency(item.finalPrice, "DZD")}
                                            </span>
                                        </div>
                                        {item.discountPct > 0 && (
                                            <div className="bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase px-2 py-1 rounded-lg border border-emerald-500/20">
                                                −{item.discountPct.toFixed(0)}%
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </CardBody>
                        </Card>
                    ))}
                </div>
            )}

            {/* Checkout Modal */}
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
                                    Récapitulatif de Commande
                                </h2>
                                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">
                                    Paiement via Wallet partenaire
                                </p>
                            </ModalHeader>
                            <ModalBody>
                                <div className="space-y-6 max-h-[40vh] overflow-y-auto pr-2">
                                    {cart.map((item) => (
                                        <div
                                            key={item.variantId}
                                            className="flex items-center justify-between bg-[#161616] p-4 rounded-2xl border border-[#262626] group"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="size-12 rounded-xl bg-[#0a0a0a] flex items-center justify-center border border-white/5 relative overflow-hidden">
                                                    {item.productImage ? (
                                                        <Image
                                                            src={item.productImage}
                                                            alt={item.productName}
                                                            fill
                                                            sizes="48px"
                                                            className="object-cover opacity-60"
                                                        />
                                                    ) : (
                                                        <Gamepad2 className="text-slate-700" size={24} />
                                                    )}
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-white text-sm line-clamp-1">
                                                        {item.productName}
                                                    </h4>
                                                    <p className="text-[10px] text-slate-500 font-medium">{item.variantName}</p>
                                                    <p className="text-xs text-[var(--primary)] font-black mt-0.5">
                                                        {formatCurrency(item.finalPrice, "DZD")}{" "}
                                                        <span className="text-slate-500 font-medium">/ unité</span>
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-6">
                                                <div className="flex items-center gap-3 bg-[#0a0a0a] rounded-xl border border-[#262626] p-1">
                                                    <button
                                                        onClick={() => updateQuantity(item.variantId, -1)}
                                                        className="size-8 rounded-lg flex items-center justify-center hover:bg-white/5 text-slate-400 transition-colors"
                                                        aria-label="Diminuer"
                                                    >
                                                        <Minus size={14} />
                                                    </button>
                                                    <span className="text-sm font-black w-4 text-center">{item.quantity}</span>
                                                    <button
                                                        onClick={() => updateQuantity(item.variantId, 1)}
                                                        className="size-8 rounded-lg flex items-center justify-center hover:bg-white/5 text-slate-400 transition-colors"
                                                        aria-label="Augmenter"
                                                    >
                                                        <Plus size={14} />
                                                    </button>
                                                </div>
                                                <button
                                                    onClick={() => removeFromCart(item.variantId)}
                                                    className="p-2 text-slate-600 hover:text-red-500 transition-colors"
                                                    aria-label="Retirer du panier"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-8 p-6 rounded-2xl bg-orange-500/5 border border-orange-500/10 space-y-4">
                                    {pricing && pricing.totalDiscountPct > 0 && (
                                        <>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-slate-400 font-bold uppercase tracking-wider">Sous-total brut</span>
                                                <span className="text-slate-300 font-black">{formatCurrency(cartGross, "DZD")}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-slate-400 font-bold uppercase tracking-wider">
                                                    Remise partenaire
                                                    {pricing.tierName ? ` (${pricing.tierName})` : ""}
                                                </span>
                                                <span className="text-emerald-500 font-black">
                                                    −{pricing.totalDiscountPct.toFixed(0)}%
                                                </span>
                                            </div>
                                            <Divider className="bg-[#2d2622]" />
                                        </>
                                    )}
                                    <div className="flex justify-between items-center">
                                        <span className="text-lg font-black text-white">Total à débiter</span>
                                        <span className="text-3xl font-black text-[var(--primary)]">
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
                                    onPress={handleCheckout}
                                    disabled={isCheckingOut}
                                    className="bg-[var(--primary)] text-white font-black px-10 h-14 rounded-2xl shadow-xl shadow-orange-950/40"
                                    endContent={!isCheckingOut && <CreditCard size={20} />}
                                >
                                    {isCheckingOut ? <Spinner size="sm" color="white" /> : "Confirmer & Payer"}
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>
        </div>
    );
}

function DeliveryBadge({ type, stock }: { type: "auto" | "stock" | "manual"; stock: number }) {
    if (type === "auto") {
        return (
            <span className="px-2 py-1 rounded-md bg-cyan-500/20 backdrop-blur-md text-[9px] font-black text-cyan-400 uppercase border border-cyan-500/30 flex items-center gap-1">
                <Zap size={10} /> Instant
            </span>
        );
    }
    if (type === "stock") {
        const color = stock > 5 ? "emerald" : "amber";
        return (
            <span
                className={`px-2 py-1 rounded-md backdrop-blur-md text-[9px] font-black uppercase border flex items-center gap-1 bg-${color}-500/20 text-${color}-400 border-${color}-500/30`}
            >
                <Package size={10} /> Stock {stock}
            </span>
        );
    }
    return (
        <span className="px-2 py-1 rounded-md bg-slate-500/20 backdrop-blur-md text-[9px] font-black text-slate-400 uppercase border border-slate-500/30 flex items-center gap-1">
            <Wrench size={10} /> Sur demande
        </span>
    );
}
