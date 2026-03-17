"use client";

import React from "react";
import { useKioskStore } from "@/store/useKioskStore";
import { createKioskOrder } from "../actions";
import { useDisclosure } from "@heroui/react";
import DeliveryMethodModal from "../components/DeliveryMethodModal";
import Image from "next/image";
import { formatCurrency } from "@/lib/formatters";

export default function CartView() {
    const {
        cart,
        setStep,
        clearCart,
        removeFromCart,
        updateQuantity,
        getTotalAmount,
        setLastOrderNumber
    } = useKioskStore();

    const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    const totalAmount = getTotalAmount();

    const handleUpdateQuantity = (variantId: number, delta: number, customData?: string) => {
        updateQuantity(variantId, delta, customData);
    };

    const handleCheckout = () => {
        if (cart.length === 0) return;
        onOpen();
    };

    const confirmOrder = async (deliveryMethod: "TICKET" | "WHATSAPP", phone?: string) => {
        setIsSubmitting(true);
        try {
            const formattedItems = cart.map(i => ({
                variantId: i.variantId,
                name: i.name,
                price: i.price,
                quantity: i.quantity,
                customData: i.customData,
                playerNickname: i.playerNickname
            }));
            const order = await createKioskOrder(formattedItems, totalAmount.toFixed(2), deliveryMethod, phone);
            setLastOrderNumber(order.orderNumber);
            setStep("CONFIRMATION");
            clearCart();
            onClose();
        } catch (error) {
            console.error("Order failed:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="bg-[#F9FAFB] text-slate-900 font-sans flex flex-col h-screen overflow-hidden select-none">
            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 12px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #e2e8f0;
                    border-radius: 10px;
                }
                .shadow-up {
                    box-shadow: 0 -10px 25px -5px rgba(0, 0, 0, 0.1), 0 -8px 10px -6px rgba(0, 0, 0, 0.1);
                }
            `}</style>

            {/* BEGIN: MainHeader */}
            <header className="flex items-center justify-between px-8 py-10 bg-[#F9FAFB] z-10 shrink-0">
                {/* Back Button */}
                <button
                    onClick={() => setStep("CATALOGUE")}
                    aria-label="Retour"
                    className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-md active:scale-95 transition-transform"
                >
                    <svg className="w-10 h-10 text-black" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" strokeLinecap="round" strokeLinejoin="round"></path>
                    </svg>
                </button>
                {/* Title */}
                <h1 className="text-4xl font-bold tracking-tight text-black">Mon Panier</h1>
                {/* Empty Cart Button */}
                <button
                    onClick={clearCart}
                    className="px-6 py-4 text-xl font-semibold text-red-600 active:bg-red-50 rounded-2xl transition-colors"
                >
                    Vider le panier
                </button>
            </header>
            {/* END: MainHeader */}

            {/* BEGIN: CartContent */}
            <main className="flex-1 overflow-y-auto px-8 pb-48 custom-scrollbar">
                <div className="flex flex-col gap-6 max-w-5xl mx-auto py-4">
                    {cart.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-black/40">
                            <svg className="w-32 h-32 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path>
                            </svg>
                            <p className="text-3xl font-bold">Votre panier est vide</p>
                            <button
                                onClick={() => setStep("CATALOGUE")}
                                className="mt-8 px-10 py-5 bg-white border border-slate-200 rounded-full text-black text-xl font-bold shadow-sm active:scale-95 transition-all"
                            >
                                Retour au catalogue
                            </button>
                        </div>
                    ) : cart.map((item) => (
                        <div key={`${item.variantId}-${item.customData || 'no-data'}`} className="bg-white rounded-[32px] p-6 shadow-sm flex items-center gap-6">
                            {/* Product Image */}
                            <div className="w-32 h-32 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center flex-shrink-0 overflow-hidden relative">
                                {item.imageUrl ? (
                                    <Image
                                        src={item.imageUrl}
                                        alt={item.productName}
                                        className="object-contain p-4"
                                        fill
                                    />
                                ) : (
                                    <svg className="w-16 h-16 text-black/20" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z"></path>
                                    </svg>
                                )}
                            </div>
                            {/* Product Details */}
                            <div className="flex-1">
                                <h2 className="text-2xl font-bold text-black">{item.productName}</h2>
                                <p className="text-xl text-black font-semibold mt-1">{item.name}</p>
                                {item.customData && (
                                    <div className="mt-2 inline-flex items-center gap-2 bg-[#ec5b13]/5 text-[#ec5b13] px-4 py-1.5 rounded-xl border border-[#ec5b13]/10">
                                        <span className="material-symbols-outlined !text-lg text-[#ec5b13]">poker_chip</span>
                                        <span className="text-sm font-bold uppercase tracking-wider">ID: {item.customData}</span>
                                    </div>
                                )}
                            </div>
                            {/* Quantity Selector */}
                            <div className="flex items-center bg-slate-100 rounded-full p-2 h-20">
                                <button
                                    onClick={() => handleUpdateQuantity(item.variantId, -1, item.customData)}
                                    className="w-16 h-16 flex items-center justify-center text-3xl font-bold text-black active:bg-white rounded-full transition-colors"
                                >
                                    -
                                </button>
                                <span className="w-16 text-center text-3xl font-bold text-black">{item.quantity}</span>
                                <button
                                    onClick={() => handleUpdateQuantity(item.variantId, 1, item.customData)}
                                    className="w-16 h-16 flex items-center justify-center text-3xl font-bold text-black active:bg-white rounded-full transition-colors"
                                >
                                    +
                                </button>
                            </div>
                            {/* Price and Actions */}
                            <div className="flex items-center gap-6">
                                <div className="text-2xl font-black text-right min-w-[140px] text-black">
                                    {formatCurrency(Number(item.price) * item.quantity, 'DZD')}
                                </div>
                                <button
                                    onClick={() => removeFromCart(item.variantId, item.customData)}
                                    aria-label="Supprimer"
                                    className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center active:bg-red-100 transition-colors"
                                >
                                    <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                        <path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" strokeLinecap="round" strokeLinejoin="round"></path>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </main>
            {/* END: CartContent */}

            {/* BEGIN: ValidationFooter */}
            <footer className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[40px] shadow-up p-8 z-20 shrink-0">
                <div className="max-w-5xl mx-auto">
                    {/* Total Line */}
                    <div className="flex justify-between items-end mb-8">
                        <span className="text-3xl text-black font-bold">Total à payer</span>
                        <span className="text-5xl font-black text-black tracking-tight">{formatCurrency(totalAmount, 'DZD')}</span>
                    </div>
                    {/* Action Button */}
                    <button
                        onClick={handleCheckout}
                        disabled={cart.length === 0}
                        className="w-full h-28 bg-[#ec5b13] rounded-full text-white text-3xl font-black flex items-center justify-center gap-4 shadow-xl shadow-orange-200 active:scale-[0.98] transition-all disabled:opacity-50 disabled:shadow-none"
                    >
                        <svg className="w-10 h-10" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                            <path d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.618 0-1.13-.514-1.122-1.141L6.34 18m11.32 0c.41 0 .746-.301.791-.707L19.01 5.39a1.125 1.125 0 00-1.121-1.24H6.111a1.125 1.125 0 00-1.121 1.24l.558 11.903c.045.406.381.707.791.707m11.32 0H6.34" strokeLinecap="round" strokeLinejoin="round"></path>
                        </svg>
                        Valider et Imprimer le Ticket
                    </button>
                </div>
            </footer>
            {/* END: ValidationFooter */}

            <DeliveryMethodModal
                isOpen={isOpen}
                onClose={onClose}
                onConfirm={confirmOrder}
                isSubmitting={isSubmitting}
            />
        </div>
    );
}
