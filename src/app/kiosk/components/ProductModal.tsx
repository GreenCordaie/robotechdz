"use client";

import React, { useState, useEffect } from "react";
import {
    Modal,
    ModalContent,
    ModalBody,
} from "@heroui/react";
import { useKioskStore } from "@/store/useKioskStore";
import PlayerIdModal from "./PlayerIdModal";

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

    const finalizeAddToCart = (customData?: string) => {
        addToCart({
            variantId: selectedVariant.id,
            productId: product.id,
            name: selectedVariant.name,
            productName: product.name,
            price: selectedVariant.salePriceDzd,
            quantity: quantity,
            imageUrl: product.imageUrl,
            customData
        });
        onClose();
    };

    const incrementQuantity = () => setQuantity(prev => prev + 1);
    const decrementQuantity = () => setQuantity(prev => Math.max(1, prev - 1));

    const totalAmount = selectedVariant ? Number(selectedVariant.salePriceDzd) * quantity : 0;

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={onClose}
            size="4xl"
            placement="center"
            backdrop="blur"
            hideCloseButton
            classNames={{
                base: "bg-white rounded-[40px] shadow-2xl p-0 overflow-hidden",
                backdrop: "bg-slate-900/60 backdrop-blur-md",
                body: "p-0"
            }}
        >
            <ModalContent>
                <ModalBody className="relative flex flex-col p-0">
                    <style jsx global>{`
                        .material-symbols-outlined { font-size: 32px; }
                        .animate-in {
                            animation-duration: 300ms;
                            animation-fill-mode: both;
                        }
                    `}</style>

                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        className="absolute top-8 right-8 size-16 bg-slate-100 hover:bg-slate-200 rounded-full flex items-center justify-center text-slate-900 transition-colors z-10"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>

                    {/* Scrollable Content */}
                    <div className="p-10 lg:p-14 overflow-y-auto max-h-[85vh] no-scrollbar">
                        {/* 1. Header Section */}
                        <div className="flex flex-col md:flex-row gap-10 items-start md:items-center">
                            <div className="size-48 min-w-[192px] bg-slate-50 border border-slate-100 rounded-[32px] flex items-center justify-center overflow-hidden">
                                <img
                                    alt={product.name}
                                    className="w-2/3 object-contain"
                                    src={product.imageUrl}
                                />
                            </div>
                            <div className="flex-1">
                                <h1 className="text-slate-900 text-5xl font-extrabold leading-tight tracking-tight">{product.name}</h1>
                                <p className="text-slate-500 text-xl mt-4 leading-relaxed max-w-xl">
                                    {product.description || "Livraison instantanée du code d'activation sur votre ticket de caisse. Service Premium Digital."}
                                </p>
                            </div>
                        </div>

                        {/* 2. Variants Section */}
                        <div className="mt-12">
                            <h2 className="text-slate-900 text-2xl font-bold mb-6 flex items-center gap-3">
                                <span className="bg-[#ec5b13] text-white size-8 rounded-full flex items-center justify-center text-base">1</span>
                                Choisissez une option
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {product.variants && product.variants.map((variant: any) => {
                                    const isActive = selectedVariant?.id === variant.id;
                                    return (
                                        <div
                                            key={variant.id}
                                            onClick={() => setSelectedVariant(variant)}
                                            className={`relative cursor-pointer rounded-[24px] p-8 flex flex-col justify-between min-h-[160px] transition-all border-4 ${isActive
                                                ? 'border-[#ec5b13] bg-orange-50'
                                                : 'border-slate-200 bg-white hover:bg-slate-50'
                                                }`}
                                        >
                                            {isActive && (
                                                <div className="absolute -top-4 -right-4 bg-[#ec5b13] text-white size-10 rounded-full flex items-center justify-center shadow-lg">
                                                    <span className="material-symbols-outlined !text-xl">check</span>
                                                </div>
                                            )}
                                            <div>
                                                <p className={`text-3xl font-bold ${isActive ? 'text-[#ec5b13]' : 'text-slate-900'}`}>{variant.name}</p>
                                                <p className={`text-2xl font-medium mt-1 ${isActive ? 'text-slate-900' : 'text-slate-500'}`}>
                                                    {Number(variant.salePriceDzd).toLocaleString()} DZD
                                                </p>
                                            </div>
                                            {isActive && (
                                                <div className="mt-2 inline-flex">
                                                    <span className="text-xs font-bold uppercase tracking-widest text-[#ec5b13]/70">Sélectionné</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 3. Quantity Section */}
                        <div className="mt-12">
                            <h2 className="text-slate-900 text-2xl font-bold mb-6 flex items-center gap-3">
                                <span className="bg-[#ec5b13] text-white size-8 rounded-full flex items-center justify-center text-base">2</span>
                                Quantité
                            </h2>
                            <div className="bg-slate-50 rounded-full p-3 flex items-center justify-between max-w-sm mx-auto md:mx-0 shadow-inner border border-slate-200">
                                <button
                                    onClick={decrementQuantity}
                                    className="size-20 bg-white shadow-md rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
                                >
                                    <span className="material-symbols-outlined text-slate-900">remove</span>
                                </button>
                                <span className="text-slate-900 text-5xl font-black px-8">{quantity}</span>
                                <button
                                    onClick={incrementQuantity}
                                    className="size-20 bg-white shadow-md rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
                                >
                                    <span className="material-symbols-outlined text-slate-900">add</span>
                                </button>
                            </div>
                        </div>

                        {/* 4. Footer CTA Section */}
                        <div className="mt-16">
                            <button
                                onClick={handleAddToCart}
                                className="w-full h-32 bg-[#ec5b13] hover:bg-orange-600 text-white rounded-[40px] flex items-center justify-between px-10 shadow-xl shadow-orange-500/20 active:scale-[0.98] transition-all group"
                            >
                                <div className="flex items-center gap-6">
                                    <span className="material-symbols-outlined !text-5xl group-hover:translate-x-1 transition-transform">shopping_basket</span>
                                    <span className="text-4xl font-extrabold tracking-tight">Ajouter au panier</span>
                                </div>
                                <div className="h-16 w-px bg-white/20"></div>
                                <div className="text-right">
                                    <p className="text-white/80 text-lg font-bold uppercase tracking-widest">Total</p>
                                    <p className="text-4xl font-black">{totalAmount.toLocaleString()} DZD</p>
                                </div>
                            </button>
                            <p className="text-center text-slate-400 text-lg mt-6 font-medium">
                                Paiement sécurisé par carte ou espèces à la caisse.
                            </p>
                        </div>
                    </div>
                </ModalBody>
            </ModalContent>

            <PlayerIdModal
                isOpen={isPlayerIdModalOpen}
                onClose={() => setIsPlayerIdModalOpen(false)}
                onConfirm={(id) => finalizeAddToCart(id)}
                productName={product.name}
                productImage={product.imageUrl}
            />
        </Modal>
    );
}
