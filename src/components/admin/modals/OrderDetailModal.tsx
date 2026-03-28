"use client";

import React, { useState } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from "@heroui/react";
import { X, Gamepad2, Key, Copy, Printer, RotateCcw, CreditCard, User, RefreshCw, AlertTriangle, ShieldCheck } from "lucide-react";
import { formatCurrency, formatWhatsApp } from "@/lib/formatters";
import { toast } from "react-hot-toast";
import { useAuthStore } from "@/store/useAuthStore";
import { updateItemPurchasePrice, resendWhatsAppAction } from "@/app/admin/caisse/actions";
import { MessageSquare } from "lucide-react";

interface OrderItem {
    id: number;
    name: string;
    price: string;
    quantity: number;
    purchasePrice?: string;
    purchaseCurrency?: string;
    fullCodes?: { id: number; code: string }[];
    fullSlots?: { id: number; code: string; slotNumber: number; profileName?: string; parentCode: string }[];
    customData?: string;
    playerNickname?: string;
}

interface OrderDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: {
        id: number;
        orderNumber: string;
        status: string;
        createdAt: string | Date;
        totalAmount: string | number;
        remise?: string | number;
        items: OrderItem[];
        deliveryMethod?: "TICKET" | "WHATSAPP";
        customerPhone?: string;
        paymentMethod?: string;
        cashierName?: string;
    } | null;
    onRefund?: (orderId: number) => void;
    onReprint?: (orderId: number) => void;
    onReplaceCode?: (orderItemId: number, codeId: number, type: 'standard' | 'slot', reason: 'DEFECTIVE' | 'RETURN_TO_STOCK') => Promise<void>;
    onRefundItem?: (orderItemId: number, returnToStock: boolean) => Promise<void>;
}

export default function OrderDetailModal({
    isOpen,
    onClose,
    order,
    onRefund,
    onReprint,
    onReplaceCode,
    onRefundItem
}: OrderDetailModalProps) {
    const { user } = useAuthStore();
    const [isActionLoading, setIsActionLoading] = useState(false);

    // Purchase Price Editing States
    const [editingPurchaseItemId, setEditingPurchaseItemId] = useState<number | null>(null);
    const [tempPurchasePrice, setTempPurchasePrice] = useState("");
    const [tempPurchaseCurrency, setTempPurchaseCurrency] = useState("USD");

    if (!order) return null;

    const handleSavePurchasePrice = async (orderItemId: number) => {
        if (!tempPurchasePrice) return;

        setIsActionLoading(true);
        try {
            const res = await updateItemPurchasePrice({
                orderItemId,
                newPurchasePrice: tempPurchasePrice,
                newPurchaseCurrency: tempPurchaseCurrency
            });

            if (res && 'success' in res && res.success) {
                toast.success("Prix d'achat mis à jour et solde fournisseur ajusté");
                setEditingPurchaseItemId(null);
                if (order) {
                    const item = order.items.find(i => i.id === orderItemId);
                    if (item) {
                        (item as any).purchasePrice = tempPurchasePrice;
                        (item as any).purchaseCurrency = tempPurchaseCurrency;
                    }
                }
            } else {
                toast.error((res as any)?.error || "Erreur de mise à jour");
            }
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setIsActionLoading(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success("Copié !");
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

    const handleAction = async (fn: () => Promise<any>, successMsg: string) => {
        setIsActionLoading(true);
        try {
            await fn();
            toast.success(successMsg);
        } catch (error: any) {
            toast.error(error.message || "Une erreur est survenue");
        } finally {
            setIsActionLoading(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="3xl"
            backdrop="blur"
            classNames={{
                base: "bg-[#111111] border border-[#262626] rounded-[20px] shadow-2xl overflow-hidden",
                header: "border-b border-white/5 p-4 md:p-5",
                body: "p-4 md:p-5",
                footer: "border-t border-white/5 bg-black/40 p-4 md:p-5",
                closeButton: "hover:bg-white/5 active:scale-95 transition-all text-slate-400"
            }}
            hideCloseButton
        >
            <ModalContent>
                {(onClose) => (
                    <>
                        <ModalHeader className="flex justify-between items-center gap-4">
                            <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-2.5">
                                    <h1 className="text-slate-100 text-lg font-black tracking-tight uppercase">Commande {order.orderNumber}</h1>
                                    <span className="bg-emerald-500/10 text-emerald-500 text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider border border-emerald-500/20">
                                        {order.status === "TERMINE" ? "Livré" : order.status === "PAYE" ? "Payé" : order.status === "NON_PAYE" ? "Dette" : order.status === "PARTIEL" ? "Partiel" : order.status}
                                    </span>
                                    {order.deliveryMethod === "WHATSAPP" && (
                                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-[#25D366]/10 text-[#25D366] rounded-md border border-[#25D366]/20">
                                            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.438 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"></path>
                                            </svg>
                                            <span className="text-[10px] font-black uppercase tracking-widest">{formatWhatsApp(order.customerPhone || null)}</span>
                                        </div>
                                    )}
                                </div>
                                <p className="text-slate-500 text-[11px] font-bold uppercase tracking-wider">{formatDate(order.createdAt)}</p>
                            </div>
                            <button
                                onClick={onClose}
                                className="text-slate-500 hover:text-white transition-all p-1.5 hover:bg-white/5 rounded-lg shrink-0"
                            >
                                <X size={20} />
                            </button>
                        </ModalHeader>

                        <ModalBody className="space-y-4 max-h-[65vh] overflow-y-auto py-4">
                            {/* Items List */}
                            <div className="space-y-3">
                                {(order.items || []).map((item) => (
                                    <section key={item.id} className="bg-white/5 border border-white/5 rounded-lg p-4">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-[#ec5b13]/10 rounded-lg flex items-center justify-center shrink-0 border border-[#ec5b13]/20">
                                                    <Gamepad2 className="text-[#ec5b13] w-5 h-5" />
                                                </div>
                                                <div className="flex flex-col">
                                                    <h2 className="text-slate-100 text-sm font-black uppercase tracking-tight">{item.quantity}x {item.name}</h2>
                                                    <div className="text-[9px] text-[#ec5b13] font-black uppercase tracking-[0.15em] mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                                                        {item.customData && (
                                                            <span className="flex items-center gap-1">
                                                                ID: {item.customData}
                                                            </span>
                                                        )}
                                                        {item.playerNickname && (
                                                            <span className={`flex items-center gap-1 opacity-70 ${item.customData ? 'border-l border-[#ec5b13]/30 pl-2.5' : ''}`}>
                                                                PSEUDO: {item.playerNickname}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex flex-col items-end gap-2">
                                                <span className="text-slate-100 text-sm font-black whitespace-nowrap">{formatCurrency(item.price, 'DZD')}</span>

                                                {/* Admin Purchase Price Section */}
                                                {(user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN' || user?.role === 'TRAITEUR') && (item as any).purchasePrice && (
                                                    <div className="flex flex-col items-end gap-1 mt-1 border-t border-white/5 pt-1 w-full">
                                                        <div className="flex items-center gap-1.5 group/edit">
                                                            <span className="text-[9px] text-slate-500 font-bold uppercase">Achat: </span>
                                                            {editingPurchaseItemId === item.id ? (
                                                                <div className="flex items-center gap-1">
                                                                    <input
                                                                        type="text"
                                                                        className="w-16 h-5 bg-black border border-[#ec5b13]/50 rounded text-[9px] px-1 text-white outline-none"
                                                                        value={tempPurchasePrice}
                                                                        onChange={(e) => setTempPurchasePrice(e.target.value)}
                                                                        autoFocus
                                                                    />
                                                                    <select
                                                                        className="h-5 bg-black border border-[#ec5b13]/50 rounded text-[9px] text-white outline-none px-0.5"
                                                                        value={tempPurchaseCurrency}
                                                                        onChange={(e) => setTempPurchaseCurrency(e.target.value)}
                                                                    >
                                                                        <option value="USD">USD</option>
                                                                        <option value="DZD">DZD</option>
                                                                    </select>
                                                                    <button
                                                                        onClick={() => handleSavePurchasePrice(item.id)}
                                                                        disabled={isActionLoading}
                                                                        className="size-5 flex items-center justify-center bg-emerald-500/20 text-emerald-500 rounded hover:bg-emerald-500/30"
                                                                    >
                                                                        <ShieldCheck size={10} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => setEditingPurchaseItemId(null)}
                                                                        className="size-5 flex items-center justify-center bg-white/5 text-slate-400 rounded hover:bg-white/10"
                                                                    >
                                                                        <X size={10} />
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    onClick={() => {
                                                                        setEditingPurchaseItemId(item.id);
                                                                        setTempPurchasePrice((item as any).purchasePrice);
                                                                        setTempPurchaseCurrency((item as any).purchaseCurrency || 'USD');
                                                                    }}
                                                                    className="flex items-center gap-1 hover:text-[#ec5b13] transition-colors"
                                                                >
                                                                    <span className="text-[10px] text-slate-400 font-black">
                                                                        {formatCurrency((item as any).purchasePrice, (item as any).purchaseCurrency || 'USD')}
                                                                    </span>
                                                                    <RefreshCw size={8} className="text-slate-600 group-hover/edit:text-[#ec5b13]" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                {onRefundItem && (
                                                    <Dropdown>
                                                        <DropdownTrigger>
                                                            <Button size="sm" variant="light" color="danger" className="h-6 text-[9px] font-black uppercase tracking-tighter bg-red-500/10 border border-red-500/20">
                                                                Rembourser Article
                                                            </Button>
                                                        </DropdownTrigger>
                                                        <DropdownMenu variant="flat" color="danger">
                                                            <DropdownItem
                                                                key="trash"
                                                                startContent={<AlertTriangle size={14} />}
                                                                onPress={() => handleAction(() => onRefundItem(item.id, false), "Article remboursé (Défectueux)")}
                                                            >
                                                                Rembourser (Défectueux)
                                                            </DropdownItem>
                                                            <DropdownItem
                                                                key="stock"
                                                                startContent={<ShieldCheck size={14} />}
                                                                onPress={() => handleAction(() => onRefundItem(item.id, true), "Article remboursé (Retour Stock)")}
                                                            >
                                                                Rembourser (Retour Stock)
                                                            </DropdownItem>
                                                        </DropdownMenu>
                                                    </Dropdown>
                                                )}
                                            </div>
                                        </div>

                                        {/* Codes Zone */}
                                        <div className="bg-black/60 border border-white/5 rounded-md p-3 flex flex-col gap-2">
                                            {/* Standard Codes */}
                                            {item.fullCodes?.map((codeObj, idx) => (
                                                <div key={`code-${codeObj.id}`} className="flex items-center justify-between group gap-2">
                                                    <div className="flex items-center gap-2.5 overflow-hidden flex-1">
                                                        <Key className="text-[#ec5b13] w-3.5 h-3.5 shrink-0" />
                                                        <code className="font-mono text-[#ec5b13] text-[11px] sm:text-xs tracking-[0.1em] font-black truncate">
                                                            [CODE] : {codeObj.code}
                                                        </code>
                                                    </div>
                                                    <div className="flex gap-1.5 shrink-0">
                                                        <Button
                                                            size="sm"
                                                            variant="light"
                                                            className="h-7 text-[9px] font-black text-slate-400 bg-white/5 hover:bg-[#ec5b13] px-2 rounded-md transition-all uppercase"
                                                            onClick={() => copyToClipboard(codeObj.code)}
                                                        >
                                                            <Copy size={12} />
                                                        </Button>
                                                        {onReplaceCode && (
                                                            <Dropdown>
                                                                <DropdownTrigger>
                                                                    <Button size="sm" variant="light" className="h-7 text-[9px] font-black text-[#ec5b13] bg-[#ec5b13]/10 border border-[#ec5b13]/20 px-2 rounded-md transition-all uppercase">
                                                                        <RefreshCw size={12} className="mr-1" /> Remplacer
                                                                    </Button>
                                                                </DropdownTrigger>
                                                                <DropdownMenu variant="flat" color="warning">
                                                                    <DropdownItem
                                                                        key="defective"
                                                                        description="Marquer comme code défectueux"
                                                                        onPress={() => handleAction(() => onReplaceCode(item.id, codeObj.id, 'standard', 'DEFECTIVE'), "Code remplacé")}
                                                                    >
                                                                        Code Défectueux
                                                                    </DropdownItem>
                                                                    <DropdownItem
                                                                        key="return"
                                                                        description="Remettre en stock et créditer"
                                                                        onPress={() => handleAction(() => onReplaceCode(item.id, codeObj.id, 'standard', 'RETURN_TO_STOCK'), "Code remis en stock & remplacé")}
                                                                    >
                                                                        Retour en Stock
                                                                    </DropdownItem>
                                                                </DropdownMenu>
                                                            </Dropdown>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}

                                            {/* Shared Slots */}
                                            {item.fullSlots?.map((slotObj, idx) => (
                                                <div key={`slot-${slotObj.id}`} className="flex flex-col gap-2 bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-3 group transition-all hover:bg-emerald-500/10">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2.5">
                                                            <div className="size-6 rounded bg-emerald-500 flex items-center justify-center text-black font-black text-[10px]">
                                                                P{slotObj.slotNumber}
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider">{slotObj.profileName || "Profil unique"}</span>
                                                                <code className="font-mono text-slate-400 text-[10px] tracking-tight truncate max-w-[200px]">{slotObj.parentCode}</code>
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-1">
                                                            <Button
                                                                size="sm"
                                                                variant="light"
                                                                isIconOnly
                                                                className="h-7 w-7 text-slate-400 hover:text-white"
                                                                onClick={() => copyToClipboard(`${slotObj.parentCode} | Profil ${slotObj.slotNumber}`)}
                                                            >
                                                                <Copy size={12} />
                                                            </Button>
                                                            {onReplaceCode && (
                                                                <Dropdown>
                                                                    <DropdownTrigger>
                                                                        <Button size="sm" variant="light" isIconOnly className="h-7 w-7 text-emerald-500">
                                                                            <RefreshCw size={12} />
                                                                        </Button>
                                                                    </DropdownTrigger>
                                                                    <DropdownMenu variant="flat" color="warning">
                                                                        <DropdownItem
                                                                            key="defective"
                                                                            onPress={() => handleAction(() => onReplaceCode(item.id, slotObj.id, 'slot', 'DEFECTIVE'), "Profil remplacé")}
                                                                        >
                                                                            Profil Défectueux
                                                                        </DropdownItem>
                                                                        <DropdownItem
                                                                            key="return"
                                                                            onPress={() => handleAction(() => onReplaceCode(item.id, slotObj.id, 'slot', 'RETURN_TO_STOCK'), "Profil remis en stock")}
                                                                        >
                                                                            Retour en Stock
                                                                        </DropdownItem>
                                                                    </DropdownMenu>
                                                                </Dropdown>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {slotObj.code && (
                                                        <div className="flex items-center justify-between bg-black/60 rounded-xl px-4 py-2.5 border border-emerald-500/20 mt-1 shadow-lg ring-1 ring-emerald-500/10">
                                                            <div className="flex items-center gap-3">
                                                                <Key size={16} className="text-emerald-500 animate-pulse" />
                                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Secret PIN :</span>
                                                            </div>
                                                            <span className="font-mono text-emerald-400 text-lg font-black tracking-[0.4em] drop-shadow-[0_0_8px_rgba(52,211,153,0.3)]">{slotObj.code}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}

                                            {(!item.fullCodes?.length && !item.fullSlots?.length) && (
                                                <div className="flex items-center gap-2 text-slate-500 italic text-[11px] py-1">
                                                    <AlertTriangle size={12} />
                                                    Livrable manuellement par le traiteur
                                                </div>
                                            )}
                                        </div>
                                    </section>
                                ))}
                            </div>

                            {/* Financial Summary */}
                            <section className="flex flex-col items-end gap-1.5 pt-2 border-t border-white/5">
                                <div className="flex flex-col items-end">
                                    <span className="text-slate-500 text-[10px] uppercase tracking-[0.2em] font-black">Total Payé</span>
                                    <div className="flex flex-col items-end">
                                        <span className="text-white text-2xl font-black whitespace-nowrap tracking-tight">
                                            {formatCurrency(Number(order.totalAmount) - Number(order.remise || 0), 'DZD')}
                                        </span>
                                        {Number(order.remise || 0) > 0 && (
                                            <span className="text-[10px] text-orange-400 font-bold uppercase tracking-wider">
                                                Réduction: -{formatCurrency(order.remise!, 'DZD')}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-1 mt-1">
                                    <div className="flex items-center gap-2 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                                        <CreditCard size={14} className="opacity-50" />
                                        <span>Paiement : <span className="text-slate-300">{order.paymentMethod || "Espèces"}</span></span>
                                    </div>
                                    <div className="flex items-center gap-2 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                                        <User size={14} className="opacity-50" />
                                        <span>Caissier : <span className="text-slate-300">{order.cashierName || "Admin User"}</span></span>
                                    </div>
                                </div>
                            </section>
                        </ModalBody>

                        <ModalFooter className="flex flex-col sm:flex-row justify-between items-center gap-3">
                            <Dropdown>
                                <DropdownTrigger>
                                    <Button
                                        variant="light"
                                        color="danger"
                                        className="px-4 py-2 rounded-lg transition-all font-black text-[11px] flex items-center gap-2 h-10 uppercase tracking-wider border border-transparent hover:border-red-500/30"
                                        isLoading={isActionLoading}
                                    >
                                        <RotateCcw size={14} className="mr-1" />
                                        Rembourser Commande
                                    </Button>
                                </DropdownTrigger>
                                <DropdownMenu variant="flat" color="danger">
                                    <DropdownItem
                                        key="defective_full"
                                        startContent={<AlertTriangle size={14} />}
                                        onPress={() => onRefund && handleAction(async () => { onRefund(order.id) }, "Commande remboursée")}
                                    >
                                        Remboursement Simple
                                    </DropdownItem>
                                </DropdownMenu>
                            </Dropdown>

                            {order.deliveryMethod === "WHATSAPP" && (
                                <Button
                                    className="bg-[#25D366] text-white hover:bg-[#128C7E] px-6 py-2.5 rounded-lg transition-all font-black text-[11px] flex items-center gap-2 shadow-lg active:scale-95 shrink-0 h-10 uppercase tracking-widest"
                                    isLoading={isActionLoading}
                                    onClick={() => handleAction(() => resendWhatsAppAction({ orderId: order.id }), "Envoyé sur WhatsApp")}
                                >
                                    <MessageSquare size={14} className="mr-1" />
                                    Renvoie sur WhatsApp
                                </Button>
                            )}

                            <Button
                                className="bg-white text-black hover:bg-[#ec5b13] hover:text-white px-6 py-2.5 rounded-lg transition-all font-black text-[11px] flex items-center gap-2 shadow-lg active:scale-95 shrink-0 h-10 uppercase tracking-widest border border-white"
                                onClick={() => onReprint?.(order.id)}
                            >
                                <Printer size={14} className="mr-1" />
                                Réimprimer le Ticket
                            </Button>
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
}
