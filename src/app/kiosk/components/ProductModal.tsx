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
                size="3xl"
                placement="center"
                backdrop="blur"
                hideCloseButton
                classNames={{
                    base: "bg-white/90 backdrop-blur-xl rounded-[32px] shadow-2xl p-0 overflow-hidden border border-white/20",
                    backdrop: "bg-slate-900/40 backdrop-blur-md",
                    body: "p-0"
                }}
            >
                <ModalContent>
                    <ModalBody className="relative flex flex-col p-0">
                        <style jsx global>{`
                        .material-symbols-outlined { font-size: 24px; }
                        .animate-in {
                            animation-duration: 300ms;
                            animation-fill-mode: both;
                        }
                        .no-scrollbar::-webkit-scrollbar { display: none; }
                    `}</style>

                        {/* Close Button */}
                        <button
                            onClick={onClose}
                            className="absolute top-6 right-6 size-12 bg-slate-100/50 hover:bg-slate-200/50 backdrop-blur-sm rounded-full flex items-center justify-center text-slate-900 transition-colors z-10"
                        >
                            <span className="material-symbols-outlined">close</span>
                        </button>

                        {/* BEGIN: Header Section */}
                        <div className="p-8 lg:p-10 overflow-y-auto max-h-[80vh] no-scrollbar">
                            <div className="flex flex-col md:flex-row gap-8 items-start md:items-center">
                                <div className="size-32 min-w-[128px] bg-slate-50 border border-slate-100 rounded-[24px] flex items-center justify-center overflow-hidden relative shadow-sm">
                                    {product.imageUrl ? (
                                        <Image
                                            alt={product.name}
                                            className="object-contain p-3"
                                            src={product.imageUrl}
                                            fill
                                            sizes="128px"
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-slate-200 flex items-center justify-center">
                                            <span className="material-symbols-rounded text-slate-400 text-4xl">package</span>
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1">
                                    <h1 className="text-black text-3xl font-black leading-tight tracking-tight uppercase">{product.name}</h1>
                                    <p className="text-black/50 text-base mt-2 leading-relaxed max-w-lg font-bold">
                                        {product.description || "Livraison instantanée du code d'activation sur votre ticket de caisse. Service Premium Digital."}
                                    </p>
                                </div>
                            </div>

                            {/* 2. Variants Section */}
                            <div className="mt-10">
                                <h2 className="text-black text-xl font-black mb-5 flex items-center gap-2 uppercase tracking-wide">
                                    <span className="bg-[#ec5b13] text-white size-6 rounded-full flex items-center justify-center text-xs">1</span>
                                    Choisissez une option
                                </h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {product.variants && product.variants.map((variant: any) => {
                                        const isActive = selectedVariant?.id === variant.id;
                                        const stockCount = variant.digitalCodes?.length || 0;
                                        const isOutOfStock = !product.isManualDelivery && stockCount === 0;

                                        return (
                                            <div
                                                key={variant.id}
                                                onClick={() => !isOutOfStock && setSelectedVariant(variant)}
                                                className={`relative rounded-[20px] p-5 flex flex-col justify-between min-h-[120px] transition-all border-2 ${isOutOfStock
                                                    ? 'border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed'
                                                    : isActive
                                                        ? 'border-[#ec5b13] bg-orange-50/50 cursor-pointer shadow-sm'
                                                        : 'border-slate-200/60 bg-white/50 hover:bg-white cursor-pointer'
                                                    }`}
                                            >
                                                {isActive && !isOutOfStock && (
                                                    <div className="absolute -top-2 -right-2 bg-[#ec5b13] text-white size-7 rounded-full flex items-center justify-center shadow-md">
                                                        <span className="material-symbols-outlined !text-sm font-black">check</span>
                                                    </div>
                                                )}
                                                {isOutOfStock && (
                                                    <div className="absolute -top-2 -right-2 bg-slate-400 text-white px-3 py-0.5 rounded-full text-[10px] font-black uppercase shadow-sm">
                                                        Rupture
                                                    </div>
                                                )}
                                                <div>
                                                    <p className={`text-xl font-black ${isOutOfStock ? 'text-slate-400' : isActive ? 'text-[#ec5b13]' : 'text-black'}`}>{variant.name}</p>
                                                    <p className={`text-lg font-black mt-0.5 ${isOutOfStock ? 'text-slate-300' : isActive ? 'text-black' : 'text-black/60'}`}>
                                                        {formatCurrency(variant.salePriceDzd, 'DZD')}
                                                    </p>
                                                </div>
                                                <div className="mt-3 flex items-center justify-between">
                                                    {!product.isManualDelivery && (
                                                        <span className={`text-[10px] font-black uppercase tracking-wider ${stockCount > 5 ? 'text-black/30' : stockCount > 0 ? 'text-orange-500' : 'text-red-600'}`}>
                                                            {stockCount > 0 ? `${stockCount} en stock` : 'Plus de stock'}
                                                        </span>
                                                    )}
                                                    {isActive && !isOutOfStock && (
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-[#ec5b13]/70 ml-auto">Sélectionné</span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 3. Quantity Section */}
                            <div className="mt-10">
                                <h2 className="text-black text-xl font-black mb-5 flex items-center gap-2 uppercase tracking-wide">
                                    <span className="bg-[#ec5b13] text-white size-6 rounded-full flex items-center justify-center text-xs">2</span>
                                    Quantité
                                </h2>
                                <div className="bg-slate-50/50 rounded-full p-2 flex items-center justify-between max-w-[280px] mx-auto md:mx-0 shadow-inner border border-slate-200/50">
                                    <button
                                        onClick={decrementQuantity}
                                        className="size-12 bg-white shadow-sm rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-transform border border-slate-100"
                                    >
                                        <span className="material-symbols-outlined text-black font-black">remove</span>
                                    </button>
                                    <span className="text-black text-3xl font-black px-6">{quantity}</span>
                                    <button
                                        onClick={incrementQuantity}
                                        className="size-12 bg-white shadow-sm rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-transform border border-slate-100"
                                    >
                                        <span className="material-symbols-outlined text-black font-black">add</span>
                                    </button>
                                </div>
                            </div>

                            {/* 4. Footer CTA Section */}
                            <div className="mt-12">
                                <button
                                    onClick={handleAddToCart}
                                    disabled={!selectedVariant || (!product.isManualDelivery && (selectedVariant.digitalCodes?.length || 0) < quantity)}
                                    className="w-full h-24 bg-[#ec5b13] hover:bg-orange-600 disabled:bg-slate-200 disabled:cursor-not-allowed text-white rounded-[24px] flex items-center justify-between px-8 shadow-lg shadow-orange-500/10 active:scale-[0.99] transition-all group"
                                >
                                    <div className="flex items-center gap-4">
                                        <span className="material-symbols-outlined !text-3xl group-hover:translate-x-1 transition-transform">shopping_basket</span>
                                        <span className="text-2xl font-black tracking-tight uppercase">
                                            {(!product.isManualDelivery && selectedVariant && (selectedVariant.digitalCodes?.length || 0) < quantity) ? "Stock insuffisant" : "Ajouter au panier"}
                                        </span>
                                    </div>
                                    <div className="h-10 w-px bg-white/20"></div>
                                    <div className="text-right">
                                        <p className="text-white/70 text-sm font-black uppercase tracking-widest">Total</p>
                                        <p className="text-2xl font-black">{formatCurrency(totalAmount, 'DZD')}</p>
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
