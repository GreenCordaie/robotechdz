"use client";

import React from "react";
import Link from "next/link";
import {
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Button,
} from "@heroui/react";
import { ShoppingCart, Trash2, Plus, Minus, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "react-hot-toast";
import { formatCurrency } from "@/lib/formatters";
import { useResellerCart, cartKey } from "@/store/useResellerCart";
import { checkoutResellerAction, getCurrentResellerAction } from "@/app/reseller/actions";
import { purchaseActiveCodeAction } from "@/app/reseller/shop/active-code/actions";

interface PayResult {
    label: string;
    ok: boolean;
    error?: string;
}

const SOURCE_LABEL: Record<string, string> = {
    g2bulk: "Cartes & Vouchers",
    streaming: "Streaming",
    activecode: "Active Code",
};

/**
 * Universal floating cart + modal. Accumulates items from several families and
 * pays them at once — fanning out into one order per family (suppliers can't
 * be mixed in a single order).
 */
export function CartBar() {
    const items = useResellerCart((s) => s.items);
    const setQty = useResellerCart((s) => s.setQty);
    const remove = useResellerCart((s) => s.remove);
    const clear = useResellerCart((s) => s.clear);

    const [open, setOpen] = React.useState(false);
    const [resellerId, setResellerId] = React.useState<number | null>(null);
    const [isCheckingOut, setIsCheckingOut] = React.useState(false);
    const [results, setResults] = React.useState<PayResult[] | null>(null);

    React.useEffect(() => {
        getCurrentResellerAction({}).then((res) => {
            if (res.success && res.data) {
                setResellerId((res.data as { id: number }).id);
            }
        });
    }, []);

    const count = items.reduce((a, i) => a + i.quantity, 0);
    const total = items.reduce((a, i) => a + i.priceDzd * i.quantity, 0);

    const pay = async () => {
        if (!resellerId || items.length === 0) return;
        setIsCheckingOut(true);
        const out: PayResult[] = [];
        try {
            const g2b = items.filter((i) => i.source === "g2bulk");
            const streaming = items.filter((i) => i.source === "streaming");
            const active = items.filter((i) => i.source === "activecode");

            // G2Bulk — one grouped order.
            if (g2b.length > 0) {
                const r = await checkoutResellerAction({
                    resellerId,
                    cart: g2b.map((i) => ({ g2bulkProductId: Number(i.refId), quantity: i.quantity })),
                });
                out.push({ label: SOURCE_LABEL.g2bulk, ok: r.success, error: r.success ? undefined : r.error });
            }
            // Streaming — one grouped order (legacy local variants).
            if (streaming.length > 0) {
                const r = await checkoutResellerAction({
                    resellerId,
                    cart: streaming.map((i) => ({ id: Number(i.refId), quantity: i.quantity })),
                });
                out.push({ label: SOURCE_LABEL.streaming, ok: r.success, error: r.success ? undefined : r.error });
            }
            // Active Code — one order per unit (instant single codes).
            for (const a of active) {
                for (let n = 0; n < a.quantity; n++) {
                    try {
                        const r = await purchaseActiveCodeAction({ planId: String(a.refId) });
                        out.push({
                            label: `${a.title} (${n + 1}/${a.quantity})`,
                            ok: r.ok,
                            error: r.ok ? undefined : r.error,
                        });
                    } catch (e) {
                        out.push({ label: `${a.title} (${n + 1}/${a.quantity})`, ok: false, error: String(e) });
                    }
                }
            }

            const anyOk = out.some((r) => r.ok);
            if (anyOk) clear();
            setResults(out);
        } catch {
            toast.error("Erreur technique lors du paiement");
            setResults(out.length ? out : [{ label: "Paiement", ok: false, error: "Erreur technique" }]);
        } finally {
            setIsCheckingOut(false);
        }
    };

    const closeAll = () => {
        setOpen(false);
        setResults(null);
    };

    return (
        <>
            {count > 0 && (
                <div className="fixed bottom-4 inset-x-0 z-40 flex justify-center px-4 pointer-events-none">
                    <button
                        type="button"
                        onClick={() => {
                            setResults(null);
                            setOpen(true);
                        }}
                        data-testid="cart-bar"
                        className="pointer-events-auto inline-flex items-center gap-3 bg-[#FACC15] text-black font-black rounded-2xl px-5 py-3 shadow-2xl shadow-black/40 hover:bg-[#FACC15]/90 active:scale-95 transition"
                    >
                        <span className="relative">
                            <ShoppingCart size={18} />
                            <span className="absolute -top-2 -right-2 bg-black text-white text-[10px] rounded-full size-4 flex items-center justify-center">
                                {count}
                            </span>
                        </span>
                        <span>Voir le panier</span>
                        <span className="font-black">{formatCurrency(total, "DZD")}</span>
                    </button>
                </div>
            )}

            <Modal isOpen={open} onClose={closeAll} size="lg" scrollBehavior="inside">
                <ModalContent className="bg-[#161616] border border-[#262626]">
                    <ModalHeader className="text-white font-black flex items-center gap-2">
                        <ShoppingCart size={18} /> {results ? "Récapitulatif" : `Mon panier (${count})`}
                    </ModalHeader>
                    <ModalBody className="space-y-3">
                        {results ? (
                            <>
                                {results.map((r, idx) => (
                                    <div
                                        key={idx}
                                        className="flex items-center gap-3 bg-[#0a0a0a] border border-[#262626] rounded-xl p-3"
                                    >
                                        {r.ok ? (
                                            <CheckCircle2 className="size-5 text-emerald-500 shrink-0" />
                                        ) : (
                                            <XCircle className="size-5 text-red-500 shrink-0" />
                                        )}
                                        <span className="flex-1 text-sm font-bold text-white truncate">{r.label}</span>
                                        <span className={`text-xs font-bold ${r.ok ? "text-emerald-400" : "text-red-400"}`}>
                                            {r.ok ? "Commande passée" : r.error || "Échec"}
                                        </span>
                                    </div>
                                ))}
                                <p className="text-xs text-slate-500 pt-2">
                                    Retrouvez vos codes et le partage WhatsApp dans « Mes Achats ».
                                </p>
                            </>
                        ) : items.length === 0 ? (
                            <p className="text-slate-500 italic py-8 text-center">Panier vide.</p>
                        ) : (
                            items.map((i) => (
                                <div
                                    key={cartKey(i)}
                                    className="flex items-center gap-3 bg-[#0a0a0a] border border-[#262626] rounded-xl p-3"
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-white truncate">
                                            {i.brandLabel && (
                                                <span className="text-[#FACC15]/90">{i.brandLabel} · </span>
                                            )}
                                            {i.title}
                                        </p>
                                        <p className="text-[11px] text-slate-500">
                                            {SOURCE_LABEL[i.source]} · {formatCurrency(i.priceDzd, "DZD")} / unité
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setQty(cartKey(i), i.quantity - 1)}
                                            className="size-7 rounded-md border border-[#262626] text-white flex items-center justify-center"
                                            aria-label="Diminuer"
                                        >
                                            <Minus size={12} />
                                        </button>
                                        <span className="w-7 text-center text-white font-black text-sm">
                                            {i.quantity}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setQty(cartKey(i), i.quantity + 1)}
                                            className="size-7 rounded-md border border-[#262626] text-white flex items-center justify-center"
                                            aria-label="Augmenter"
                                        >
                                            <Plus size={12} />
                                        </button>
                                    </div>
                                    <span className="w-[90px] text-right text-sm font-black text-white shrink-0">
                                        {formatCurrency(i.priceDzd * i.quantity, "DZD")}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => remove(cartKey(i))}
                                        className="text-slate-500 hover:text-red-400 shrink-0"
                                        aria-label="Retirer"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            ))
                        )}
                    </ModalBody>
                    <ModalFooter className="flex items-center justify-between">
                        {results ? (
                            <>
                                <Link
                                    href="/reseller/wallet?tab=orders"
                                    className="text-xs font-bold text-slate-400 hover:text-[#FACC15]"
                                >
                                    Voir Mes Achats
                                </Link>
                                <Button onPress={closeAll} className="bg-[#FACC15] text-black font-black px-6">
                                    Fermer
                                </Button>
                            </>
                        ) : (
                            <>
                                <div className="text-left">
                                    <p className="text-[10px] uppercase font-black tracking-widest text-slate-500">
                                        Total
                                    </p>
                                    <p className="text-xl font-black text-[#FACC15]">
                                        {formatCurrency(total, "DZD")}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {items.length > 0 && (
                                        <Button variant="light" onPress={() => clear()} className="text-slate-400 font-bold">
                                            Vider
                                        </Button>
                                    )}
                                    <Button
                                        onPress={pay}
                                        isLoading={isCheckingOut}
                                        isDisabled={isCheckingOut || items.length === 0}
                                        className="bg-[#FACC15] text-black font-black px-6 h-12 rounded-xl"
                                    >
                                        {isCheckingOut ? "Traitement…" : "Payer le panier"}
                                    </Button>
                                </div>
                            </>
                        )}
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </>
    );
}
