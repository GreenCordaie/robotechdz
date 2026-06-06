"use client";

import React from "react";
import {
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Button,
} from "@heroui/react";
import { ShoppingCart, Trash2, Plus, Minus } from "lucide-react";
import { toast } from "react-hot-toast";
import { formatCurrency } from "@/lib/formatters";
import { useResellerCart } from "@/store/useResellerCart";
import { checkoutResellerAction, getCurrentResellerAction } from "../../actions";
import PurchaseSuccessModal from "./PurchaseSuccessModal";

/**
 * Floating cart bar + modal for the G2Bulk (Cartes & Vouchers) shop. Lets a
 * reseller accumulate several products/quantities and pay them in one order.
 */
export function CartBar() {
    const items = useResellerCart((s) => s.items);
    const setQty = useResellerCart((s) => s.setQty);
    const remove = useResellerCart((s) => s.remove);
    const clear = useResellerCart((s) => s.clear);

    const [open, setOpen] = React.useState(false);
    const [resellerId, setResellerId] = React.useState<number | null>(null);
    const [resellerName, setResellerName] = React.useState<string | undefined>(undefined);
    const [isCheckingOut, setIsCheckingOut] = React.useState(false);
    const [modalOrderId, setModalOrderId] = React.useState<number | null>(null);

    React.useEffect(() => {
        getCurrentResellerAction({}).then((res) => {
            if (res.success && res.data) {
                const r = res.data as { id: number; companyName?: string };
                setResellerId(r.id);
                setResellerName(r.companyName);
            }
        });
    }, []);

    const count = items.reduce((a, i) => a + i.quantity, 0);
    const total = items.reduce((a, i) => a + i.priceDzd * i.quantity, 0);

    const pay = async () => {
        if (!resellerId || items.length === 0) return;
        setIsCheckingOut(true);
        try {
            const res = await checkoutResellerAction({
                resellerId,
                cart: items.map((i) => ({ g2bulkProductId: i.productId, quantity: i.quantity })),
            });
            if (res.success) {
                clear();
                setOpen(false);
                setModalOrderId((res as { orderId?: number }).orderId ?? null);
            } else {
                toast.error(res.error || "Échec de la commande");
            }
        } catch {
            toast.error("Erreur technique lors du paiement");
        } finally {
            setIsCheckingOut(false);
        }
    };

    return (
        <>
            {count > 0 && (
                <div className="fixed bottom-4 inset-x-0 z-40 flex justify-center px-4 pointer-events-none">
                    <button
                        type="button"
                        onClick={() => setOpen(true)}
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

            <Modal isOpen={open} onClose={() => setOpen(false)} size="lg" scrollBehavior="inside">
                <ModalContent className="bg-[#161616] border border-[#262626]">
                    <ModalHeader className="text-white font-black flex items-center gap-2">
                        <ShoppingCart size={18} /> Mon panier ({count})
                    </ModalHeader>
                    <ModalBody className="space-y-3">
                        {items.length === 0 ? (
                            <p className="text-slate-500 italic py-8 text-center">Panier vide.</p>
                        ) : (
                            items.map((i) => (
                                <div
                                    key={i.productId}
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
                                            {formatCurrency(i.priceDzd, "DZD")} / unité
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setQty(i.productId, i.quantity - 1)}
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
                                            onClick={() => setQty(i.productId, i.quantity + 1)}
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
                                        onClick={() => remove(i.productId)}
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
                    </ModalFooter>
                </ModalContent>
            </Modal>

            <PurchaseSuccessModal
                isOpen={modalOrderId !== null}
                onClose={() => setModalOrderId(null)}
                orderId={modalOrderId}
                productLabel="Panier Cartes & Vouchers"
                resellerName={resellerName}
            />
        </>
    );
}
