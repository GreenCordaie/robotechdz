"use client";

import React, { useState, useMemo } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Spinner, Checkbox } from "@heroui/react";
import { RotateCcw, AlertTriangle } from "lucide-react";
import { refundOrderItem, refundFullOrder } from "@/app/admin/caisse/actions";
import toast from "react-hot-toast";
import { formatCurrency } from "@/lib/formatters";

interface OrderItem {
    id: number;
    name: string;
    quantity: number;
    price: string;
}

interface RefundOrderModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    order: {
        id: number;
        orderNumber: string;
        montantPaye: string;
        items: OrderItem[];
    } | null;
}

export default function RefundOrderModal({ isOpen, onClose, onSuccess, order }: RefundOrderModalProps) {
    const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(new Set());
    const [isRefunding, setIsRefunding] = useState(false);

    const allSelected = order ? selectedItemIds.size === order.items.length : false;

    const totalToRefund = useMemo(() => {
        if (!order) return 0;
        return order.items
            .filter(item => selectedItemIds.has(item.id))
            .reduce((acc, item) => acc + Number(item.price) * item.quantity, 0);
    }, [selectedItemIds, order]);

    const toggleItem = (id: number) => {
        setSelectedItemIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const toggleAll = () => {
        if (!order) return;
        if (allSelected) {
            setSelectedItemIds(new Set());
        } else {
            setSelectedItemIds(new Set(order.items.map(i => i.id)));
        }
    };

    const handleClose = () => {
        setSelectedItemIds(new Set());
        onClose();
    };

    const handleConfirm = async () => {
        if (!order || selectedItemIds.size === 0) return;
        setIsRefunding(true);
        try {
            if (allSelected) {
                const res = await refundFullOrder({ id: order.id, returnToStock: true });
                if (!res.success) throw new Error(res.error);
            } else {
                for (const itemId of Array.from(selectedItemIds)) {
                    const res = await refundOrderItem({ orderItemId: itemId, returnToStock: true });
                    if (!res.success) throw new Error(res.error);
                }
            }
            toast.success("Remboursement effectué avec succès");
            setSelectedItemIds(new Set());
            onSuccess();
            onClose();
        } catch (err) {
            toast.error((err as Error).message || "Erreur lors du remboursement");
        } finally {
            setIsRefunding(false);
        }
    };

    if (!order) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            size="md"
            classNames={{
                base: "bg-[#161616] border border-[#262626] text-white",
                header: "border-b border-[#262626]",
                footer: "border-t border-[#262626]",
            }}
        >
            <ModalContent>
                <ModalHeader className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <RotateCcw className="w-4 h-4 text-red-400 shrink-0" />
                        <span className="text-sm font-black uppercase tracking-widest">
                            Rembourser #{order.orderNumber.replace('#', '')}
                        </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-normal">
                        Montant payé : <span className="font-bold text-white">{formatCurrency(Number(order.montantPaye), 'DZD')}</span>
                    </p>
                </ModalHeader>

                <ModalBody className="py-4">
                    {/* Warning notice */}
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 mb-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-amber-300">
                            Les codes remboursés retournent automatiquement en stock. Cette action est irréversible.
                        </p>
                    </div>

                    {/* Select all toggle */}
                    <div className="flex items-center justify-between px-1 mb-2">
                        <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Articles</span>
                        <button
                            onClick={toggleAll}
                            className="text-[10px] font-black uppercase text-[var(--primary)] hover:opacity-80 transition-opacity"
                        >
                            {allSelected ? "Tout désélectionner" : "Tout sélectionner"}
                        </button>
                    </div>

                    {/* Items list */}
                    <div className="space-y-2">
                        {order.items.map(item => (
                            <div
                                key={item.id}
                                onClick={() => toggleItem(item.id)}
                                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                                    selectedItemIds.has(item.id)
                                        ? 'border-red-500/40 bg-red-500/5'
                                        : 'border-[#262626] bg-[#111111] hover:border-[#363636]'
                                }`}
                            >
                                <Checkbox
                                    isSelected={selectedItemIds.has(item.id)}
                                    onChange={() => toggleItem(item.id)}
                                    color="danger"
                                    size="sm"
                                    classNames={{ label: "hidden" }}
                                />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-white truncate">{item.name}</p>
                                    <p className="text-[10px] text-slate-500">Qté: {item.quantity}</p>
                                </div>
                                <p className="text-sm font-black text-white whitespace-nowrap shrink-0">
                                    {formatCurrency(Number(item.price) * item.quantity, 'DZD')}
                                </p>
                            </div>
                        ))}
                    </div>

                    {/* Calculated total */}
                    {selectedItemIds.size > 0 && (
                        <div className="mt-4 p-3 rounded-xl bg-[#111] border border-[#262626] flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase text-slate-500">Montant à rembourser</span>
                            <span className="text-lg font-black text-red-400">
                                {formatCurrency(totalToRefund, 'DZD')}
                            </span>
                        </div>
                    )}
                </ModalBody>

                <ModalFooter className="gap-2">
                    <Button
                        variant="flat"
                        className="flex-1 bg-[#262626] text-slate-400 font-bold"
                        onPress={handleClose}
                        isDisabled={isRefunding}
                    >
                        Annuler
                    </Button>
                    <Button
                        className="flex-1 bg-red-500 text-white font-black disabled:opacity-50"
                        onPress={handleConfirm}
                        isDisabled={selectedItemIds.size === 0 || isRefunding}
                        startContent={isRefunding ? <Spinner size="sm" color="white" /> : <RotateCcw className="w-4 h-4 shrink-0" />}
                    >
                        {isRefunding ? "Traitement..." : "Confirmer le remboursement"}
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}
