"use client";

import React from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Tooltip } from "@heroui/react";
import { X, Gamepad2, Key, Copy, Printer, RotateCcw, CreditCard, User, CheckCircle2 } from "lucide-react";

interface OrderItem {
    id: string;
    name: string;
    price: string;
    quantity: number;
    codes?: string[];
    customData?: string;
}

interface OrderDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: {
        id: string;
        orderNumber: string;
        status: string;
        createdAt: string | Date;
        totalAmount: string | number;
        items: OrderItem[];
        deliveryMethod?: "TICKET" | "WHATSAPP";
        customerPhone?: string;
        paymentMethod?: string;
        cashierName?: string;
    } | null;
    onRefund?: (orderId: string) => void;
    onReprint?: (orderId: string) => void;
}

export default function OrderDetailModal({ isOpen, onClose, order, onRefund, onReprint }: OrderDetailModalProps) {
    if (!order) return null;

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        // Could add a toast here if available
    };

    const formatDate = (date: string | Date) => {
        return new Date(date).toLocaleString("fr-FR", {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="3xl"
            backdrop="blur"
            classNames={{
                base: "bg-[#161616] border border-[#262626] rounded-[24px] shadow-2xl",
                header: "border-b border-[#262626] p-6",
                body: "p-6",
                footer: "border-t border-[#262626] bg-black/20 p-6",
                closeButton: "hover:bg-white/5 active:scale-95 transition-all text-slate-400"
            }}
            hideCloseButton
        >
            <ModalContent>
                {(onClose) => (
                    <>
                        <ModalHeader className="flex justify-between items-start">
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-3">
                                    <h1 className="text-slate-100 text-xl font-bold tracking-tight">Commande {order.orderNumber}</h1>
                                    <span className="bg-emerald-500/10 text-emerald-500 text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wider">
                                        {order.status === "TERMINE" ? "Livré" : order.status === "PAYE" ? "Payé" : order.status}
                                    </span>
                                    {order.deliveryMethod === "WHATSAPP" && (
                                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-[#25D366]/10 text-[#25D366] rounded-full border border-[#25D366]/20">
                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.438 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"></path>
                                            </svg>
                                            <span className="text-[10px] font-bold uppercase">+213 {order.customerPhone}</span>
                                        </div>
                                    )}
                                </div>
                                <p className="text-slate-400 text-sm">{formatDate(order.createdAt)}</p>
                            </div>
                            <button
                                onClick={onClose}
                                className="text-slate-400 hover:text-white transition-colors p-2 hover:bg-white/5 rounded-lg shrink-0"
                            >
                                <X size={24} />
                            </button>
                        </ModalHeader>

                        <ModalBody className="space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                            {/* Items List */}
                            <div className="space-y-4">
                                {order.items.map((item) => (
                                    <section key={item.id} className="bg-[#0a0a0a] border border-[#262626] rounded-xl p-6" data-purpose="items-list">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 bg-[#ec5b13]/10 rounded-lg flex items-center justify-center shrink-0">
                                                    <Gamepad2 className="text-[#ec5b13] w-6 h-6" />
                                                </div>
                                                <div className="flex flex-col">
                                                    <h2 className="text-slate-100 text-lg font-bold">{item.quantity}x {item.name}</h2>
                                                    {item.customData && (
                                                        <span className="text-[10px] text-[#ec5b13] font-black uppercase tracking-widest mt-0.5 flex items-center gap-1">
                                                            ID/LIEN: {item.customData}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <span className="text-slate-100 text-lg font-bold whitespace-nowrap">{Number(item.price).toLocaleString()} DZD</span>
                                        </div>

                                        {/* Codes Zone */}
                                        {item.codes && item.codes.length > 0 && (
                                            <div className="bg-black/40 border border-white/5 rounded-lg p-4 flex flex-col gap-3" data-purpose="codes-zone">
                                                {item.codes.map((code, idx) => (
                                                    <div key={idx} className="flex items-center justify-between group">
                                                        <div className="flex items-center gap-3 overflow-hidden">
                                                            <Key className="text-[#ec5b13] w-4 h-4 shrink-0" />
                                                            <code className="font-mono text-[#ec5b13] text-sm sm:text-base tracking-wider truncate">
                                                                [CODE] : {code}
                                                            </code>
                                                        </div>
                                                        <Button
                                                            size="sm"
                                                            variant="light"
                                                            className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-md transition-all shrink-0 min-w-0 h-auto"
                                                            onClick={() => copyToClipboard(code)}
                                                            startContent={<Copy size={14} />}
                                                        >
                                                            COPIER
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </section>
                                ))}
                            </div>

                            {/* Financial Summary */}
                            <section className="flex flex-col items-end gap-2" data-purpose="financial-summary">
                                <div className="flex flex-col items-end">
                                    <span className="text-slate-400 text-xs uppercase tracking-widest font-semibold">Total Payé</span>
                                    <span className="text-white text-3xl font-bold whitespace-nowrap">{Number(order.totalAmount).toLocaleString()} DZD</span>
                                </div>
                                <div className="flex flex-col items-end gap-1 mt-2">
                                    <div className="flex items-center gap-2 text-slate-400 text-sm">
                                        <CreditCard size={16} />
                                        <span>Mode de paiement : <span className="text-slate-200">{order.paymentMethod || "Espèces"}</span></span>
                                    </div>
                                    <div className="flex items-center gap-2 text-slate-400 text-sm">
                                        <User size={16} />
                                        <span>Caissier : <span className="text-slate-200">{order.cashierName || "Admin User"}</span></span>
                                    </div>
                                </div>
                            </section>
                        </ModalBody>

                        <ModalFooter className="flex flex-col sm:flex-row justify-between items-center gap-4">
                            <Button
                                variant="light"
                                color="danger"
                                className="px-4 py-2 rounded-xl transition-colors font-medium text-sm flex items-center gap-2 h-auto"
                                onClick={() => onRefund?.(order.id)}
                                startContent={<RotateCcw size={16} />}
                            >
                                Rembourser / Annuler
                            </Button>
                            <Button
                                className="bg-white text-black hover:bg-slate-200 px-8 py-3 rounded-xl transition-all font-bold text-sm flex items-center gap-2 shadow-lg shadow-white/5 shrink-0 h-auto"
                                onClick={() => onReprint?.(order.id)}
                                startContent={<Printer size={16} />}
                            >
                                Réimprimer le Ticket
                            </Button>
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
}
