"use client";

import React, { useState, useEffect } from "react";
import {
    Modal,
    ModalContent,
    ModalBody,
} from "@heroui/react";
import { useKioskStore } from "@/store/useKioskStore";
import PlayerIdModal from "./PlayerIdModal";
import Image from "next/image";
import { formatCurrency } from "@/lib/formatters";

interface ProductModalProps {
    isOpen: boolean;
    onClose: () => void;
    product: any;
}

export default function ProductModal({ isOpen, onClose, product }: ProductModalProps) {
    const { addToCart } = useKioskStore();

    // State for local selection
    const [selectedVariant, setSelectedVariant] = useState<any>(null);
    const [quantity, setQuantity] = useState(1);
    const [isPlayerIdModalOpen, setIsPlayerIdModalOpen] = useState(false);

    // Reset selection when modal opens with a new product
    useEffect(() => {
        if (product && product.variants && product.variants.length > 0) {
            setSelectedVariant(product.variants[0]);
            setQuantity(1);
        }
    }, [product, isOpen]);

    if (!product) return null;

    const handleAddToCart = () => {
        if (!selectedVariant) return;

        if (product.requiresPlayerId) {
            setIsPlayerIdModalOpen(true);
            return;
        }

        finalizeAddToCart();
    };

    const finalizeAddToCart = (customData?: string, playerNickname?: string) => {
        addToCart({
            variantId: selectedVariant.id,
            productId: product.id,
            name: selectedVariant.name,
            productName: product.name,
            price: selectedVariant.salePriceDzd,
            quantity: quantity,
            imageUrl: product.imageUrl,
            customData,
            playerNickname
        });
        onClose();
    };

    const incrementQuantity = () => setQuantity(prev => prev + 1);
    const decrementQuantity = () => setQuantity(prev => Math.max(1, prev - 1));

    const totalAmount = selectedVariant ? Number(selectedVariant.salePriceDzd) * quantity : 0;

    return (
        <>
            <Modal
                isOpen={isOpen}
                onOpenChange={onClose}
                size="2xl"
                placement="center"
                backdrop="blur"
                hideCloseButton
                classNames={{
                    base: "bg-white/90 backdrop-blur-xl rounded-[24px] shadow-2xl p-0 overflow-hidden border border-white/20",
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
                            className="absolute top-4 right-4 size-10 bg-slate-100/50 hover:bg-slate-200/50 backdrop-blur-sm rounded-full flex items-center justify-center text-slate-900 transition-colors z-10"
                        >
                            <span className="material-symbols-outlined">close</span>
                        </button>

                        {/* BEGIN: Header Section */}
                        <div className="p-6 lg:p-8 overflow-y-auto max-h-[80vh] no-scrollbar">
                            <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
                                <div className="size-24 min-w-[96px] bg-slate-50 border border-slate-100 rounded-[20px] flex items-center justify-center overflow-hidden relative shadow-sm">
                                    {product.imageUrl ? (
                                        <Image
                                            alt={product.name}
                                            className="object-contain p-2"
                                            src={product.imageUrl}
                                            fill
                                            sizes="96px"
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-slate-200 flex items-center justify-center">
                                            <span className="material-symbols-rounded text-slate-400 text-3xl">package</span>
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1">
                                    <h1 className="text-black text-xl font-black leading-tight tracking-tight uppercase">{product.name}</h1>
                                    <p className="text-black/50 text-xs mt-1 leading-relaxed max-w-lg font-bold">
                                        {product.description || "Livraison instantanée du code d'activation sur votre ticket de caisse. Service Premium Digital."}
                                    </p>
                                </div>
                            </div>

                            {/* 2. Variants Section */}
                            <div className="mt-8">
                                <h2 className="text-black text-lg font-black mb-4 flex items-center gap-2 uppercase tracking-wide">
                                    <span className="bg-[#ec5b13] text-white size-5 rounded-full flex items-center justify-center text-[10px]">1</span>
                                    Choisissez une option
                                </h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {product.variants && product.variants.map((variant: any) => {
                                        const isActive = selectedVariant?.id === variant.id;
                                        const stockCount = variant.stockCount || 0;

                                        // Un variant n'est jamais vraiment "en rupture" bloquante maintenant, 
                                        // il bascule juste en manuel
                                        const isAutoOutOfStock = !product.isManualDelivery && stockCount === 0;
                                        const isManual = product.isManualDelivery || stockCount === 0;

                                        return (
                                            <div
                                                key={variant.id}
                                                onClick={() => setSelectedVariant(variant)}
                                                className={`relative rounded-[16px] p-4 flex flex-col justify-between min-h-[100px] transition-all border-2 ${isActive
                                                    ? 'border-[#ec5b13] bg-orange-50/50 cursor-pointer shadow-sm'
                                                    : 'border-slate-200/60 bg-white/50 hover:bg-white cursor-pointer'
                                                    }`}
                                            >
                                                {isActive && (
                                                    <div className="absolute -top-2 -right-2 bg-[#ec5b13] text-white size-7 rounded-full flex items-center justify-center shadow-md">
                                                        <span className="material-symbols-outlined !text-sm font-black">check</span>
                                                    </div>
                                                )}

                                                {isAutoOutOfStock && (
                                                    <div className="absolute -top-2 -right-2 bg-blue-600 text-white px-3 py-0.5 rounded-full text-[10px] font-black uppercase shadow-sm flex items-center gap-1">
                                                        <span className="material-symbols-outlined !text-[12px]">person</span>
                                                        Manuel
                                                    </div>
                                                )}

                                                <div>
                                                    <p className={`text-lg font-black ${isActive ? 'text-[#ec5b13]' : 'text-black'}`}>{variant.name}</p>
                                                    <p className={`text-base font-black mt-0.5 ${isActive ? 'text-black' : 'text-black/60'}`}>
                                                        {formatCurrency(variant.salePriceDzd, 'DZD')}
                                                    </p>
                                                </div>
                                                <div className="mt-3 flex items-center justify-between">
                                                    {isManual ? (
                                                        <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 flex items-center gap-1">
                                                            <span className="material-symbols-outlined !text-[14px]">schedule</span>
                                                            Délai: ~15min
                                                        </span>
                                                    ) : (
                                                        <span className={`text-[10px] font-black uppercase tracking-wider ${stockCount > 5 ? 'text-black/30' : 'text-orange-500'}`}>
                                                            {stockCount} {variant.isSharing ? 'profils' : 'en stock'}
                                                        </span>
                                                    )}
                                                    {isActive && (
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-[#ec5b13]/70 ml-auto">Sélectionné</span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 3. Quantity Section */}
                            <div className="mt-8">
                                <h2 className="text-black text-lg font-black mb-4 flex items-center gap-2 uppercase tracking-wide">
                                    <span className="bg-[#ec5b13] text-white size-5 rounded-full flex items-center justify-center text-[10px]">2</span>
                                    Quantité
                                </h2>
                                <div className="bg-slate-50/50 rounded-full p-1.5 flex items-center justify-between max-w-[220px] mx-auto md:mx-0 shadow-inner border border-slate-200/50">
                                    <button
                                        onClick={decrementQuantity}
                                        className="size-10 bg-white shadow-sm rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-transform border border-slate-100"
                                    >
                                        <span className="material-symbols-outlined text-black font-black">remove</span>
                                    </button>
                                    <span className="text-black text-xl font-black px-4">{quantity}</span>
                                    <button
                                        onClick={incrementQuantity}
                                        className="size-10 bg-white shadow-sm rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-transform border border-slate-100"
                                    >
                                        <span className="material-symbols-outlined text-black font-black">add</span>
                                    </button>
                                </div>
                            </div>

                            {/* 4. Footer CTA Section */}
                            <div className="mt-8">
                                <button
                                    onClick={handleAddToCart}
                                    disabled={!selectedVariant}
                                    className="w-full h-16 bg-[#ec5b13] hover:bg-orange-600 disabled:bg-slate-200 disabled:cursor-not-allowed text-white rounded-[20px] flex items-center justify-between px-6 shadow-lg shadow-orange-500/10 active:scale-[0.99] transition-all group"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="material-symbols-outlined !text-2xl group-hover:translate-x-1 transition-transform">shopping_basket</span>
                                        <span className="text-lg font-black tracking-tight uppercase">
                                            {(!product.isManualDelivery && selectedVariant && (selectedVariant.stockCount || 0) < quantity) ? "Commander (Traitement Manuel)" : "Ajouter au panier"}
                                        </span>
                                    </div>
                                    <div className="h-8 w-px bg-white/20"></div>
                                    <div className="text-right">
                                        <p className="text-white/70 text-[10px] font-black uppercase tracking-widest leading-none mb-1">Total</p>
                                        <p className="text-lg font-black leading-none">{formatCurrency(totalAmount, 'DZD')}</p>
                                    </div>
                                </button>
                                <p className="text-center text-black/30 text-sm mt-5 font-black uppercase tracking-wide">
                                    Paiement sécurisé par carte ou espèces à la caisse.
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
        </>
    );
}
