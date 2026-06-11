"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Spinner } from "@heroui/react";
import { ArrowLeft, Check, Minus, Plus, Users } from "lucide-react";
import { toast } from "react-hot-toast";

import { formatCurrency } from "@/lib/formatters";
import { checkoutResellerAction, getCurrentResellerAction } from "../../actions";
import {
    getResellerStreamingOffersAction,
    type StreamingOffer,
} from "../streaming-actions";
import PurchaseSuccessModal from "../components/PurchaseSuccessModal";
import { useResellerCart } from "@/store/useResellerCart";

export default function ResellerStreamingPage() {
    const router = useRouter();

    const [offers, setOffers] = useState<ReadonlyArray<StreamingOffer>>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [quantity, setQuantity] = useState(1);
    const [resellerId, setResellerId] = useState<number | null>(null);
    const [resellerName, setResellerName] = useState<string | undefined>(undefined);
    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const [modalOrderId, setModalOrderId] = useState<number | null>(null);
    const [boughtLabel, setBoughtLabel] = useState<string | undefined>(undefined);
    const addToCart = useResellerCart((s) => s.add);

    useEffect(() => {
        getCurrentResellerAction({}).then((res) => {
            if (res.success && res.data) {
                const r = res.data as { id: number; companyName?: string };
                setResellerId(r.id);
                setResellerName(r.companyName);
            }
        });
    }, []);

    useEffect(() => {
        let active = true;
        getResellerStreamingOffersAction({})
            .then((res) => {
                if (!active) return;
                if (res.success) setOffers(res.data);
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });
        return () => {
            active = false;
        };
    }, []);

    const selected = offers.find((o) => o.variantId === selectedId) ?? null;

    // Clamp quantity to the selected offer's stock.
    useEffect(() => {
        if (!selected) {
            setQuantity(1);
            return;
        }
        setQuantity((q) => Math.min(Math.max(1, q), Math.max(1, selected.stock)));
    }, [selectedId, selected]);

    const handleSelect = useCallback((o: StreamingOffer) => {
        if (o.stock <= 0) {
            toast.error("Rupture de stock — réapprovisionnement en cours.");
            return;
        }
        setSelectedId(o.variantId);
    }, []);

    const handlePurchase = useCallback(async () => {
        if (!selected || !resellerId || quantity < 1) return;
        setIsCheckingOut(true);
        try {
            const res = await checkoutResellerAction({
                resellerId,
                cart: [{ id: selected.variantId, quantity }],
            });
            if (res.success) {
                setBoughtLabel(selected.title);
                setSelectedId(null);
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

    const max = Math.max(1, selected?.stock ?? 1);
    const total = (selected?.priceDzd ?? 0) * quantity;

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
                {/* LEFT: title + offer list */}
                <div className="space-y-5 min-w-0">
                    <div className="space-y-1">
                        <h1 className="text-4xl lg:text-5xl font-black text-[#E50914] tracking-tight">
                            Streaming
                        </h1>
                        <p className="text-sm text-slate-400">
                            Comptes partagés livrés instantanément — lien magique &amp; code
                            en temps réel pour votre client.
                        </p>
                    </div>

                    {isLoading ? (
                        <div className="py-20 flex justify-center">
                            <Spinner color="warning" />
                        </div>
                    ) : offers.length === 0 ? (
                        <p className="text-center text-slate-500 italic py-12">
                            Aucune offre streaming disponible pour le moment.
                        </p>
                    ) : (
                        <ul className="space-y-2" data-testid="streaming-offers">
                            {offers.map((o) => {
                                const outOfStock = o.stock <= 0;
                                const isSelected = selectedId === o.variantId;
                                return (
                                    <li key={o.variantId}>
                                        <button
                                            type="button"
                                            onClick={() => handleSelect(o)}
                                            disabled={outOfStock}
                                            data-testid="streaming-offer-row"
                                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                                                isSelected
                                                    ? "bg-[#FACC15]/10 border-[#FACC15] ring-1 ring-[#FACC15]/60"
                                                    : outOfStock
                                                      ? "bg-[#0f0f0f] border-[#1a1a1a] opacity-50 cursor-not-allowed"
                                                      : "bg-[#161616] border-[#262626] hover:border-[#FACC15]/40 hover:bg-[#1c1c1c]"
                                            }`}
                                        >
                                            <span
                                                className={`size-5 shrink-0 rounded-md border flex items-center justify-center ${
                                                    isSelected
                                                        ? "bg-[#FACC15] border-[#FACC15]"
                                                        : "bg-transparent border-[#3a3a3a]"
                                                }`}
                                            >
                                                {isSelected && <Check size={14} className="text-black" />}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <p className="truncate text-sm font-semibold text-white">
                                                    {o.title}
                                                </p>
                                                <p className="truncate text-[10px] text-slate-500 font-medium mt-0.5 flex items-center gap-1">
                                                    <Users size={11} className="text-[#E50914]" />
                                                    Profil partagé
                                                </p>
                                            </div>
                                            <span
                                                className={`shrink-0 text-[10px] font-black uppercase tracking-widest ${
                                                    outOfStock ? "text-red-400" : "text-emerald-400"
                                                }`}
                                            >
                                                {outOfStock ? "Rupture" : `${o.stock} dispo`}
                                            </span>
                                            <span className="shrink-0 text-sm font-black text-white min-w-[110px] text-right">
                                                {formatCurrency(o.priceDzd, "DZD")}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                {/* RIGHT: sticky purchase panel */}
                <aside className="lg:sticky lg:top-24">
                    {!selected ? (
                        <div className="bg-[#161616] border border-[#262626] rounded-2xl p-6 text-center text-slate-500 text-sm">
                            Choisissez une offre dans la liste pour acheter.
                        </div>
                    ) : (
                        <div className="bg-[#161616] border border-[#262626] rounded-2xl p-5 space-y-4">
                            <div>
                                <p className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-1">
                                    Sélection
                                </p>
                                <h3 className="text-base font-black text-white leading-snug">
                                    {selected.title}
                                </h3>
                                <div className="flex items-baseline gap-2 mt-2">
                                    <span className="text-lg font-black text-[#FACC15]">
                                        {formatCurrency(selected.priceDzd, "DZD")}
                                    </span>
                                    <span className="text-xs text-slate-500">/ profil</span>
                                    <span className="ml-auto text-[10px] uppercase font-black tracking-widest text-emerald-400">
                                        {selected.stock} dispo
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
                                <p className="text-[10px] text-slate-500">
                                    Max {max} profil{max > 1 ? "s" : ""}
                                </p>
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
                                onPress={() => {
                                    addToCart(
                                        {
                                            source: "streaming",
                                            refId: selected.variantId,
                                            title: selected.title,
                                            priceDzd: selected.priceDzd,
                                            stock: selected.stock,
                                            brandLabel: "Streaming",
                                        },
                                        quantity,
                                    );
                                    toast.success("Ajouté au panier");
                                }}
                                isDisabled={selected.stock <= 0}
                                className="w-full h-11 bg-[#262626] text-white font-black rounded-xl hover:bg-[#333] transition-colors"
                            >
                                Ajouter au panier
                            </Button>
                            <Button
                                onPress={handlePurchase}
                                isLoading={isCheckingOut}
                                isDisabled={isCheckingOut || selected.stock <= 0}
                                data-testid="streaming-purchase-btn"
                                className="w-full h-12 bg-[#FACC15] text-black font-black text-base rounded-xl hover:bg-[#FACC15]/90 transition-colors"
                            >
                                {isCheckingOut ? "Traitement…" : "Acheter maintenant"}
                            </Button>
                        </div>
                    )}
                </aside>
            </div>

            <PurchaseSuccessModal
                isOpen={modalOrderId !== null}
                onClose={() => setModalOrderId(null)}
                orderId={modalOrderId}
                productLabel={boughtLabel ?? "Streaming — Profil partagé"}
                resellerName={resellerName}
            />
        </div>
    );
}
