"use client";

import React, { useState } from "react";
import {
    Button,
    Card,
    CardBody,
    Divider,
    Input,
    ScrollShadow,
    Avatar,
    Chip,
    Tooltip,
    Select,
    SelectItem
} from "@heroui/react";
import {
    Trash2,
    Plus,
    Minus,
    ShoppingBag,
    User,
    CreditCard,
    Wallet,
    Percent,
    CheckCircle2,
    XCircle
} from "lucide-react";
import { usePosStore } from "@/store/usePosStore";
import { formatCurrency } from "@/lib/formatters";
import toast from "react-hot-toast";

export function CartSection() {
    const { cart, removeFromCart, updateQuantity, clearCart } = usePosStore();
    const [remise, setRemise] = useState(0);
    const [isProcessing, setIsProcessing] = useState(false);

    const subtotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const total = Math.max(0, subtotal - remise);

    const handleCheckout = async () => {
        if (cart.length === 0) {
            toast.error("Le panier est vide");
            return;
        }
        setIsProcessing(true);
        try {
            // Mock checkout for now
            await new Promise(r => setTimeout(r, 1000));
            toast.success("Commande validée avec succès !");
            clearCart();
            setRemise(0);
        } catch (e) {
            toast.error("Erreur lors de la validation");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#0a0a0a] rounded-2xl overflow-hidden border border-white/5 shadow-2xl">
            {/* Header */}
            <div className="p-6 border-b border-white/5 bg-black/20 backdrop-blur-md flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#ec5b13]/10 flex items-center justify-center">
                        <ShoppingBag className="text-[#ec5b13]" size={20} />
                    </div>
                    <div>
                        <h3 className="text-sm font-black uppercase tracking-widest text-white">Panier Actuel</h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase">{cart.length} articles</p>
                    </div>
                </div>
                <Button
                    isIconOnly
                    variant="light"
                    color="danger"
                    size="sm"
                    onPress={clearCart}
                    className="opacity-50 hover:opacity-100 transition-opacity"
                >
                    <Trash2 size={18} />
                </Button>
            </div>

            {/* Cart Items */}
            <ScrollShadow className="flex-1 p-6 space-y-4" hideScrollBar>
                {cart.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-4 opacity-50">
                        <span className="material-symbols-outlined !text-6xl">shopping_basket</span>
                        <p className="font-bold uppercase text-xs tracking-widest text-center">Votre panier est vide</p>
                    </div>
                ) : (
                    cart.map((item) => (
                        <div key={item.id} className="flex gap-4 p-4 rounded-2xl bg-white/5 border border-white/5 group hover:border-white/10 transition-all">
                            <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-bold text-white truncate uppercase tracking-tight">{item.name}</h4>
                                <p className="text-[10px] text-[#ec5b13] font-black mt-1 uppercase tracking-widest">
                                    {formatCurrency(item.price, "DZD")} / unité
                                </p>
                            </div>
                            <div className="flex items-center gap-3 bg-black/40 rounded-xl p-1 border border-white/5">
                                <Button
                                    isIconOnly
                                    size="sm"
                                    variant="light"
                                    className="h-8 w-8 min-w-0"
                                    onPress={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))}
                                >
                                    <Minus size={14} />
                                </Button>
                                <span className="text-xs font-black w-4 text-center">{item.quantity}</span>
                                <Button
                                    isIconOnly
                                    size="sm"
                                    variant="light"
                                    className="h-8 w-8 min-w-0"
                                    onPress={() => updateQuantity(item.id, item.quantity + 1)}
                                >
                                    <Plus size={14} />
                                </Button>
                            </div>
                            <div className="text-right min-w-[80px]">
                                <p className="text-sm font-black text-white">{formatCurrency(item.price * item.quantity, "DZD")}</p>
                                <button
                                    onClick={() => removeFromCart(item.id)}
                                    className="text-[10px] text-red-500/50 hover:text-red-500 font-bold uppercase mt-1 transition-colors"
                                >
                                    Supprimer
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </ScrollShadow>

            {/* Footer Summary */}
            <div className="p-6 bg-black/40 border-t border-white/5 space-y-6">
                <div className="space-y-3">
                    <div className="flex justify-between items-center text-slate-400">
                        <span className="text-xs font-bold uppercase tracking-widest">Sous-total</span>
                        <span className="text-sm font-black">{formatCurrency(subtotal, "DZD")}</span>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2 text-slate-400">
                            <Percent size={14} className="text-[#ec5b13]" />
                            <span className="text-xs font-bold uppercase tracking-widest">Remise</span>
                        </div>
                        <div className="relative w-24 group">
                            <input
                                type="number"
                                value={remise}
                                onChange={(e) => setRemise(Number(e.target.value))}
                                className="w-full bg-white/5 border border-white/10 rounded-lg py-1 px-2 text-right text-sm font-black text-white focus:border-[#ec5b13] outline-none transition-all"
                            />
                        </div>
                    </div>

                    <Divider className="bg-white/5" />

                    <div className="flex justify-between items-center bg-[#ec5b13]/5 p-3 rounded-xl border border-[#ec5b13]/10">
                        <span className="text-xs font-black uppercase text-[#ec5b13] tracking-widest">Total à payer</span>
                        <span className="text-xl font-black text-white">{formatCurrency(total, "DZD")}</span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <Button
                        variant="flat"
                        className="bg-white/5 text-white font-black text-xs uppercase h-12 rounded-xl border border-white/5 hover:bg-white/10 transition-all"
                    >
                        Appliquer Promo
                    </Button>
                    <Button
                        className="bg-[#ec5b13] text-white font-black text-xs uppercase h-12 rounded-xl shadow-lg shadow-[#ec5b13]/20"
                        isLoading={isProcessing}
                        onPress={handleCheckout}
                    >
                        Valider Transaction
                    </Button>
                </div>
            </div>
        </div>
    );
}
