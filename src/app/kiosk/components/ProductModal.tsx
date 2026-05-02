"use client";

import React, { useState, useEffect } from "react";
import {
    Modal,
    ModalContent,
    ModalBody,
} from "@heroui/react";
import { useKioskStore } from "@/store/useKioskStore";
import PlayerIdModal from "./PlayerIdModal";
import IbosolDeviceModal from "./IbosolDeviceModal";
import IbosolComboModal, { type IptvPlan } from "./IbosolComboModal";
import IbosolCheckModal from "./IbosolCheckModal";
import IbosolCheckResultModal from "./IbosolCheckResultModal";
import { checkIbosolDevice, type CheckDeviceResult } from "../actions/check-device";
import { toast } from "react-hot-toast";
import Image from "next/image";
import { formatCurrency } from "@/lib/formatters";

interface ProductModalProps {
    isOpen: boolean;
    onClose: () => void;
    product: any;
    iptvPlans?: IptvPlan[];
}

interface ComboPayload {
    iptvVariantId: number;
    iptvProviderId: string;
    iptvPlanId: string;
    iptvProductName: string;
    iptvPrice: string;
}

export default function ProductModal({ isOpen, onClose, product, iptvPlans = [] }: ProductModalProps) {
    const { addToCart } = useKioskStore();

    // State for local selection
    const [selectedQuantities, setSelectedQuantities] = useState<Record<number, number>>({});
    const [isPlayerIdModalOpen, setIsPlayerIdModalOpen] = useState(false);
    const [isIbosolModalOpen, setIsIbosolModalOpen] = useState(false);

    // Sequential Ibosol flow
    const [isComboModalOpen, setIsComboModalOpen] = useState(false);
    const [pendingDevice, setPendingDevice] = useState<{ mac: string; appId: number } | null>(null);

    // Free check flow
    const [isCheckModalOpen, setIsCheckModalOpen] = useState(false);
    const [isCheckResultOpen, setIsCheckResultOpen] = useState(false);
    const [checkLoading, setCheckLoading] = useState(false);
    const [checkResult, setCheckResult] = useState<CheckDeviceResult | null>(null);
    const [lastCheckedDevice, setLastCheckedDevice] = useState<{ mac: string; appId: number } | null>(null);

    // Reset selection when modal opens with a new product
    useEffect(() => {
        if (product && isOpen) {
            setSelectedQuantities({});
        }
    }, [product, isOpen]);

    if (!product) return null;

    const updateVariantQuantity = (variantId: number, delta: number) => {
        setSelectedQuantities(prev => {
            const current = prev[variantId] || 0;
            const next = Math.max(0, current + delta);
            if (next === 0) {
                const { [variantId]: _, ...rest } = prev;
                return rest;
            }
            return { ...prev, [variantId]: next };
        });
    };

    // Detect if any selected variant is an Ibosol product (slug starts with "ibo-")
    const hasIbosolSelected = product?.variants?.some((v: any) =>
        (selectedQuantities[v.id] || 0) > 0 && typeof v.loadbrainSlug === "string" && v.loadbrainSlug.startsWith("ibo-")
    );

    const productHasIbosolVariant = product?.variants?.some?.(
        (v: any) => typeof v.loadbrainSlug === "string" && v.loadbrainSlug.startsWith("ibo-")
    );

    const getSelectedIbosolPrice = (): string => {
        const variant = product?.variants?.find((v: any) =>
            v.loadbrainSlug?.startsWith?.("ibo-") && (selectedQuantities[v.id] || 0) > 0
        );
        return variant?.salePriceDzd ?? "0";
    };

    const getSelectedIbosolName = (): string => {
        const variant = product?.variants?.find((v: any) =>
            v.loadbrainSlug?.startsWith?.("ibo-") && (selectedQuantities[v.id] || 0) > 0
        );
        return variant?.name ?? "Activation IBO";
    };

    const handleAddToCart = () => {
        if (Object.keys(selectedQuantities).length === 0) return;

        const cart = useKioskStore.getState().cart;
        const hasIboInCart = cart.some((it: any) =>
            typeof it.loadbrainSlug === "string" && it.loadbrainSlug.startsWith("ibo-")
        );

        if (hasIbosolSelected) {
            if (hasIboInCart) {
                toast.error("Vous avez déjà un IBO Player au panier. Faites une commande séparée pour activer un autre device.");
                return;
            }
            setIsIbosolModalOpen(true);
            return;
        }

        if (product.requiresPlayerId) {
            setIsPlayerIdModalOpen(true);
            return;
        }

        finalizeAddToCart();
    };

    const finalizeAddToCart = (
        customData?: string,
        playerNickname?: string,
        combo?: ComboPayload
    ) => {
        product.variants.forEach((variant: any) => {
            const qty = selectedQuantities[variant.id];
            if (qty && qty > 0) {
                addToCart({
                    variantId: variant.id,
                    productId: product.id,
                    name: variant.name,
                    productName: product.name,
                    price: variant.salePriceDzd,
                    quantity: qty,
                    imageUrl: product.imageUrl,
                    customData,
                    playerNickname,
                    loadbrainSlug: variant.loadbrainSlug || null,
                    combo,
                });
            }
        });
        onClose();
    };

    const totalAmount = product.variants.reduce((acc: number, v: any) => {
        const qty = selectedQuantities[v.id] || 0;
        return acc + (Number(v.salePriceDzd) * qty);
    }, 0);

    return (
        <>
            <Modal
                isOpen={isOpen}
                onOpenChange={onClose}
                size="2xl"
                placement="bottom-center"
                backdrop="blur"
                hideCloseButton
                classNames={{
                    base: "bg-white rounded-t-[32px] sm:rounded-[24px] shadow-2xl p-0 overflow-hidden m-0",
                    backdrop: "bg-slate-900/40 backdrop-blur-md",
                    body: "p-0"
                }}
            >
                <ModalContent>
                    <ModalBody className="relative flex flex-col p-0">
                        <style jsx global>{`
                        .material-symbols-outlined { font-size: 20px; }
                        .animate-in {
                            animation-duration: 300ms;
                            animation-fill-mode: both;
                        }
                        .no-scrollbar::-webkit-scrollbar { display: none; }
                    `}</style>

                        {/* Close Button */}
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 size-11 bg-slate-100/50 hover:bg-slate-200/50 backdrop-blur-sm rounded-full flex items-center justify-center text-slate-900 transition-colors z-30"
                        >
                            <span className="material-symbols-outlined">close</span>
                        </button>

                        {/* BEGIN: Header Section */}
                        <div className="p-5 sm:p-8 overflow-y-auto max-h-[85vh] no-scrollbar">
                            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-start sm:items-center">
                                <div className="size-20 sm:size-24 min-w-[80px] sm:min-w-[96px] bg-slate-50 border border-slate-100 rounded-[20px] flex items-center justify-center overflow-hidden relative shadow-sm">
                                    {product.imageUrl ? (
                                        <Image
                                            alt={product.name}
                                            className="object-cover"
                                            src={product.imageUrl}
                                            fill
                                            sizes="(max-width: 768px) 80px, 96px"
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-slate-200 flex items-center justify-center">
                                            <span className="material-symbols-rounded text-slate-400 text-3xl">package</span>
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1">
                                    <h1 className="text-[#0c121e] text-lg sm:text-xl font-black leading-tight tracking-tight uppercase font-['Plus_Jakarta_Sans']">{product.name}</h1>
                                    <p className="text-slate-400 text-[10px] sm:text-xs mt-1 leading-relaxed max-w-lg font-medium">
                                        {product.description || "Livraison instantanée du code d'activation sur votre ticket de caisse."}
                                    </p>
                                </div>
                            </div>

                            {/* 2. Variants Section */}
                            <div className="mt-8">
                                <h2 className="text-[#0c121e] text-lg font-black mb-4 flex items-center gap-2 uppercase tracking-wide">
                                    <span className="bg-primary text-white size-5 rounded-full flex items-center justify-center text-[10px]">1</span>
                                    Choisissez une option
                                </h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {product.variants && product.variants.map((variant: any) => {
                                        const qty = selectedQuantities[variant.id] || 0;
                                        const isIptv = !!variant.loadbrainSlug;
                                        const isIbosolVariant = typeof variant.loadbrainSlug === "string" && variant.loadbrainSlug.startsWith("ibo-");
                                        const stockCount = isIptv ? 999 : (variant.stockCount || 0);
                                        const isManual = !isIptv && (product.isManualDelivery || stockCount === 0);

                                        return (
                                            <div
                                                key={variant.id}
                                                className={`relative rounded-[20px] p-4 flex flex-col justify-between min-h-[120px] transition-all border-2 ${qty > 0
                                                    ? 'border-[var(--primary)] bg-orange-50/50 shadow-sm'
                                                    : 'border-slate-100 bg-white/50 hover:bg-white hover:border-slate-200'
                                                    }`}
                                            >
                                                <div>
                                                    <div className="flex justify-between items-start mb-1">
                                                        <p className={`text-base font-black ${qty > 0 ? 'text-[var(--primary)]' : 'text-black'}`}>{variant.name}</p>
                                                        {qty > 0 && <span className="bg-[var(--primary)] text-white text-[10px] font-black px-2 py-0.5 rounded-full">x{qty}</span>}
                                                    </div>
                                                    <p className={`text-sm font-black ${qty > 0 ? 'text-black' : 'text-black/60'}`}>
                                                        {formatCurrency(variant.salePriceDzd, 'DZD')}
                                                    </p>
                                                </div>

                                                <div className="mt-4 flex items-center justify-between">
                                                    <div className="flex flex-col">
                                                        {isManual ? (
                                                            <span className="text-[9px] font-black uppercase tracking-wider text-blue-600 flex items-center gap-1">
                                                                <span className="material-symbols-outlined !text-[12px]">schedule</span>
                                                                Délai: ~15min
                                                            </span>
                                                        ) : isIptv ? (
                                                            <span className="text-[9px] font-black uppercase tracking-wider text-cyan-600">
                                                                Disponible — Instant
                                                            </span>
                                                        ) : (
                                                            <span className={`text-[9px] font-black uppercase tracking-wider ${stockCount > 5 ? 'text-black/30' : 'text-orange-500'}`}>
                                                                {stockCount} {variant.isSharing ? 'profils' : 'en stock'}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {isIbosolVariant ? (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedQuantities(prev => {
                                                                    const current = prev[variant.id] || 0;
                                                                    if (current > 0) {
                                                                        const { [variant.id]: _, ...rest } = prev;
                                                                        return rest;
                                                                    }
                                                                    // Force qty=1 — and unselect any other Ibosol variants of this product
                                                                    const next: Record<number, number> = { ...prev };
                                                                    product.variants.forEach((v: any) => {
                                                                        if (typeof v.loadbrainSlug === "string" && v.loadbrainSlug.startsWith("ibo-")) {
                                                                            delete next[v.id];
                                                                        }
                                                                    });
                                                                    next[variant.id] = 1;
                                                                    return next;
                                                                });
                                                            }}
                                                            className={`px-4 h-11 rounded-xl font-black text-xs uppercase transition-colors ${qty > 0 ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                                                        >
                                                            {qty > 0 ? "✓ Sélectionné" : "Choisir"}
                                                        </button>
                                                    ) : (
                                                        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); updateVariantQuantity(variant.id, -1); }}
                                                                className="size-11 rounded-lg flex items-center justify-center text-slate-400 hover:text-black hover:bg-slate-50 transition-all active:scale-90"
                                                            >
                                                                <span className="material-symbols-outlined !text-lg">remove</span>
                                                            </button>
                                                            <span className="text-sm font-black w-4 text-center tabular-nums text-black">{qty}</span>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); updateVariantQuantity(variant.id, 1); }}
                                                                className="size-11 rounded-lg flex items-center justify-center text-[var(--primary)] hover:bg-orange-50 transition-all active:scale-90"
                                                            >
                                                                <span className="material-symbols-outlined !text-lg">add</span>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {productHasIbosolVariant && (
                                    <button
                                        onClick={() => setIsCheckModalOpen(true)}
                                        className="mt-3 w-full h-12 bg-cyan-50 border-2 border-cyan-100 text-cyan-700 font-black text-xs uppercase tracking-wider rounded-xl hover:bg-cyan-100 transition-colors"
                                    >
                                        🔍 Vérifier mon device gratuitement
                                    </button>
                                )}
                            </div>

                            {/* 3. Footer CTA Section */}
                            <div className="mt-10">
                                <button
                                    onClick={handleAddToCart}
                                    disabled={Object.keys(selectedQuantities).length === 0}
                                    className="w-full h-16 bg-primary hover:bg-primary/90 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed text-white rounded-[20px] flex items-center justify-between px-6 shadow-xl shadow-primary/20 active:scale-[0.98] transition-all group"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="material-symbols-outlined !text-2xl group-hover:translate-x-1 transition-transform">shopping_basket</span>
                                        <span className="text-sm font-black tracking-widest uppercase">
                                            Ajouter au panier
                                        </span>
                                    </div>
                                    <div className="h-8 w-px bg-white/20"></div>
                                    <div className="text-right">
                                        <p className="text-white/60 text-[9px] font-black uppercase tracking-widest leading-none mb-1">Total Sélection</p>
                                        <p className="text-lg font-black leading-none">{formatCurrency(totalAmount, 'DZD')}</p>
                                    </div>
                                </button>
                                <p className="text-center text-slate-300 text-[10px] mt-5 font-bold uppercase tracking-widest">
                                    Paiement sécurisé à la caisse
                                </p>
                            </div>
                        </div>
                    </ModalBody>
                </ModalContent>
            </Modal>

            <PlayerIdModal
                isOpen={isPlayerIdModalOpen}
                onClose={() => setIsPlayerIdModalOpen(false)}
                onConfirm={(id, pseudo) => finalizeAddToCart(id, pseudo)}
                productName={product.name}
                productImage={product.imageUrl}
            />

            <IbosolDeviceModal
                isOpen={isIbosolModalOpen}
                onClose={() => setIsIbosolModalOpen(false)}
                onConfirm={(mac, appId) => {
                    setPendingDevice({ mac, appId });
                    setIsIbosolModalOpen(false);
                    setIsComboModalOpen(true);
                }}
                productName={product.name}
            />

            <IbosolComboModal
                isOpen={isComboModalOpen}
                onClose={() => {
                    setIsComboModalOpen(false);
                    setPendingDevice(null);
                }}
                onConfirm={(combo) => {
                    if (!pendingDevice) {
                        setIsComboModalOpen(false);
                        return;
                    }
                    const customData: Record<string, unknown> = {
                        type: "ibosol",
                        mac: pendingDevice.mac,
                        appId: pendingDevice.appId,
                    };
                    if (combo) {
                        customData.combo = {
                            iptvVariantId: combo.variantId,
                            iptvProviderId: combo.providerId,
                            iptvPlanId: combo.planId,
                            iptvProductName: combo.productName,
                            iptvPrice: combo.price,
                        };
                    }
                    finalizeAddToCart(
                        JSON.stringify(customData),
                        undefined,
                        combo
                            ? {
                                iptvVariantId: combo.variantId,
                                iptvProviderId: combo.providerId,
                                iptvPlanId: combo.planId,
                                iptvProductName: combo.productName,
                                iptvPrice: combo.price,
                            }
                            : undefined,
                    );
                    setIsComboModalOpen(false);
                    setPendingDevice(null);
                }}
                iboPrice={getSelectedIbosolPrice()}
                iboName={getSelectedIbosolName()}
                availablePlans={iptvPlans}
            />

            <IbosolCheckModal
                isOpen={isCheckModalOpen}
                onClose={() => setIsCheckModalOpen(false)}
                onSubmit={async (mac, appId) => {
                    setIsCheckModalOpen(false);
                    setCheckLoading(true);
                    setIsCheckResultOpen(true);
                    setLastCheckedDevice({ mac, appId });
                    const result = await checkIbosolDevice({ mac, appId });
                    setCheckResult(result);
                    setCheckLoading(false);
                }}
            />

            <IbosolCheckResultModal
                isOpen={isCheckResultOpen}
                onClose={() => {
                    setIsCheckResultOpen(false);
                    setCheckResult(null);
                }}
                result={checkResult}
                loading={checkLoading}
                inputMac={lastCheckedDevice?.mac}
                inputAppId={lastCheckedDevice?.appId}
                onActivate={(mac, appId) => {
                    setIsCheckResultOpen(false);
                    setPendingDevice({ mac, appId });
                    setIsComboModalOpen(true);
                }}
            />
        </>
    );
}
