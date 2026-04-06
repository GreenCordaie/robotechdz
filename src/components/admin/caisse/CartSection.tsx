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
    XCircle,
    ArrowRight
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
        <div className="flex flex-col h-full bg-background-dark/80 backdrop-blur-3xl rounded-3xl overflow-hidden border border-white/10 shadow-[0_0_50px_-15px_rgba(0,0,0,1)]">
            {/* Header */}
            <div className="p-8 border-b border-white/[0.08] bg-white/[0.02] flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-[var(--primary)] shadow-[0_0_20px_-5px_var(--primary)] flex items-center justify-center">
                        <ShoppingBag className="text-white" size={24} />
                    </div>
                    <div>
                        <h3 className="text-base font-black uppercase tracking-[0.1em] text-white">Commande</h3>
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{cart.length} articles sélectionnés</p>
                    </div>
                </div>
                <Button
                    isIconOnly
                    variant="flat"
                    color="danger"
                    size="sm"
                    onPress={clearCart}
                    className="bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all rounded-xl"
                >
                    <Trash2 size={18} />
                </Button>
            </div>

            {/* Cart Items */}
            <ScrollShadow className="flex-1 p-6 space-y-3" hideScrollBar>
                {cart.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-6 opacity-30 py-20">
                        <div className="w-24 h-24 rounded-full border-2 border-dashed border-slate-700 flex items-center justify-center">
                            <span className="material-symbols-outlined !text-5xl">shopping_basket</span>
                        </div>
                        <p className="font-black uppercase text-[10px] tracking-[0.4em] text-center">En attente de produits...</p>
                    </div>
                ) : (
                    cart.map((item) => (
                        <div key={item.id} className="flex flex-col gap-3 p-4 rounded-[1.5rem] bg-white/[0.03] border border-white/5 group hover:bg-white/[0.05] hover:border-white/10 transition-all duration-300">
                            <div className="flex justify-between items-start gap-4">
                                <div className="flex-1 min-w-0">
                                    <h4 className="text-xs font-black text-white truncate uppercase tracking-wider">{item.name}</h4>
                                    <p className="text-[9px] text-[var(--primary)] font-black mt-1 uppercase tracking-widest bg-[var(--primary)]/10 px-2 py-0.5 rounded-md inline-block">
                                        {formatCurrency(item.price, "DZD")}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-black text-white">{formatCurrency(item.price * item.quantity, "DZD")}</p>
                                    <button
                                        onClick={() => removeFromCart(item.id)}
                                        className="text-[9px] text-red-500 opacity-0 group-hover:opacity-100 font-black uppercase mt-1 transition-all"
                                    >
                                        Retirer
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center justify-between mt-1">
                                <div className="flex items-center gap-1 bg-black/50 rounded-xl p-1 border border-white/5">
                                    <Button
                                        isIconOnly
                                        size="sm"
                                        variant="light"
                                        className="h-7 w-7 min-w-0 rounded-lg text-slate-400 hover:text-white"
                                        onPress={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))}
                                    >
                                        <Minus size={12} />
                                    </Button>
                                    <span className="text-[11px] font-black w-6 text-center tabular-nums text-white">{item.quantity}</span>
                                    <Button
                                        isIconOnly
                                        size="sm"
                                        variant="light"
                                        className="h-7 w-7 min-w-0 rounded-lg text-slate-400 hover:text-white"
                                        onPress={() => updateQuantity(item.id, item.quantity + 1)}
                                    >
                                        <Plus size={12} />
                                    </Button>
                                </div>
                                <div className="h-px flex-1 bg-white/[0.03] mx-4" />
                            </div>
                        </div>
                    ))
                )}
            </ScrollShadow>

            {/* Footer Summary */}
            <div className="p-8 bg-black/60 border-t border-white/[0.08] backdrop-blur-xl space-y-8">
                <div className="space-y-4">
                    <div className="flex justify-between items-center text-slate-400 px-1">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em]">Sous-total</span>
                        <span className="text-xs font-black tabular-nums">{formatCurrency(subtotal, "DZD")}</span>
                    </div>

                    <div className="flex items-center justify-between gap-4 bg-white/[0.02] p-3 rounded-2xl border border-white/5 group hover:border-[var(--primary)]/30 transition-colors duration-300">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center">
                                <Percent size={14} className="text-[var(--primary)]" />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-300">Remise</span>
                        </div>
                        <div className="relative group/input">
                            <input
                                type="number"
                                value={remise}
                                onChange={(e) => setRemise(Number(e.target.value))}
                                className="w-24 bg-black/40 border border-white/10 group-hover/input:border-[var(--primary)]/50 rounded-xl py-1.5 px-3 text-right text-xs font-black text-white outline-none transition-all tabular-nums"
                            />
                        </div>
                    </div>

                    <div className="flex justify-between items-center bg-gradient-to-br from-[var(--primary)] to-[#ff6b00] p-6 rounded-[2rem] shadow-2xl shadow-[var(--primary)]/20 overflow-hidden relative group">
                        {/* Animated background flare */}
                        <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 skew-x-[-20deg]" />

                        <div className="relative">
                            <span className="text-[10px] font-black uppercase text-white/70 tracking-[0.2em]">Net à payer</span>
                            <div className="flex items-baseline gap-1 mt-1">
                                <span className="text-3xl font-black text-white tabular-nums">{formatCurrency(total, "DZD").split(' ')[0]}</span>
                                <span className="text-[10px] font-black text-white opacity-70 uppercase tracking-widest">{formatCurrency(total, "DZD").split(' ')[1]}</span>
                            </div>
                        </div>
                        <div className="relative opacity-20 group-hover:opacity-40 transition-opacity">
                            <CreditCard size={48} className="text-white" strokeWidth={1.5} />
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    <Button
                        className="bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-white font-black text-sm uppercase h-16 rounded-[1.5rem] shadow-xl shadow-[var(--primary)]/30 group transition-all"
                        isLoading={isProcessing}
                        onPress={handleCheckout}
                    >
                        {isProcessing ? "Traitement..." : (
                            <div className="flex items-center gap-3">
                                Valider Transaction
                                <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                            </div>
                        )}
                    </Button>
                    <div className="flex justify-center">
                        <p className="text-[9px] text-slate-600 font-bold uppercase tracking-[0.2em] flex items-center gap-2">
                            Sécurisé par RobotechDZ End-to-End
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
