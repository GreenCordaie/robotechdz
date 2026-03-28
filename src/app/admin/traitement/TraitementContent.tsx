"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Spinner } from "@heroui/react";
import { toast } from "react-hot-toast";
import { getPaidOrders, getFinishedOrders, processOrder, markOrderAsTermine, cancelOrderAction, resendWhatsAppAction, requeueForPrint, updateItemPurchasePrice } from "../caisse/actions";
import { attribuerSlotAutomatiqueAction } from "../comptes-partages/actions";
import { ThermalReceiptV2 } from "@/components/admin/receipt/ThermalReceiptV2";
import OrderDetailModal from "@/components/admin/modals/OrderDetailModal";
import { Eye } from "lucide-react";
import Image from "next/image";
import { formatCurrency } from "@/lib/formatters";
import { useThermalPrinter } from "@/hooks/useThermalPrinter";
import { useWebUSBPrinter } from "@/hooks/useWebUSBPrinter";
import { generateOrderEscPos } from "@/lib/escpos";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useAuthStore } from "@/store/useAuthStore";
import { Wifi, WifiOff, Usb, Loader2, MessageSquare, AlertTriangle } from "lucide-react";
import { ConfirmModal } from "@/components/admin/modals/ConfirmModal";

interface TraitementContentProps {
    initialOrders?: any[];
    initialFinished?: any[];
}

export default function TraitementContent({ initialOrders = [], initialFinished = [] }: TraitementContentProps) {
    const [view, setView] = useState<"pending" | "finished">("pending");
    const [orders, setOrders] = useState<any[]>(initialOrders);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
    const [codes, setCodes] = useState<Record<string, string>>({});
    const [isProcessing, setIsProcessing] = useState(false);
    const [isResending, setIsResending] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [orderForDetail, setOrderForDetail] = useState<any | null>(null);
    const [shouldPrint, setShouldPrint] = useState(false);
    const processedIds = React.useRef<Set<number>>(new Set());
    const prevOrderIds = React.useRef<Set<number>>(new Set());
    const { printToIframe } = useThermalPrinter();
    const webusb = useWebUSBPrinter();
    const settings = useSettingsStore();
    const { user } = useAuthStore();

    const [isAssigning, setIsAssigning] = useState<Record<string, boolean>>({});
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        description: string;
        onConfirm: () => void;
        variant: "danger" | "warning" | "info" | "success";
    }>({
        isOpen: false,
        title: "",
        description: "",
        onConfirm: () => { },
        variant: "danger"
    });
    const [editingPurchaseItemId, setEditingPurchaseItemId] = useState<number | null>(null);
    const [tempPurchasePrice, setTempPurchasePrice] = useState("");
    const [tempPurchaseCurrency, setTempPurchaseCurrency] = useState("USD");
    const [isActionLoading, setIsActionLoading] = useState(false);
    const handlePrint = async (data: any) => {
        if (!data?.id) return;
        const res: any = await requeueForPrint({ orderId: data.id });
        if (res?.success) {
            toast.success(`🖨️ Ticket #${data.orderNumber} en file d'impression`);
        } else {
            toast.error(`🖨️ Erreur: ${res?.error || 'Impossible de mettre en file'}`);
        }
    };

    const handleSavePurchasePrice = async (orderItemId: number) => {
        if (!tempPurchasePrice) return;

        setIsActionLoading(true);
        try {
            const res: any = await updateItemPurchasePrice({
                orderItemId,
                newPurchasePrice: tempPurchasePrice,
                newPurchaseCurrency: tempPurchaseCurrency
            });

            if (res && res.success) {
                toast.success("Prix d'achat mis à jour");
                setEditingPurchaseItemId(null);
                // Update local state to reflect change without full reload if possible,
                // but loadOrders is safer for consistency.
                loadOrders();
            } else {
                toast.error(res?.error || "Erreur de mise à jour");
            }
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleAutoAssign = async (orderItemId: number, variantId: number, slotIndex: number) => {
        const key = `${orderItemId}-${slotIndex}`;
        setIsAssigning(prev => ({ ...prev, [key]: true }));
        try {
            const res = await attribuerSlotAutomatiqueAction({ orderItemId, variantId }) as any;
            if (res.success) {
                toast.success("Slot attribué avec succès !");
                loadOrders();
            } else {
                toast.error(res.error || "Erreur d'attribution");
            }
        } catch (error) {
            toast.error("Erreur technique");
        } finally {
            setIsAssigning(prev => ({ ...prev, [key]: false }));
        }
    };

    const loadOrders = useCallback(async () => {
        // Optimization: Don't set loading if we already have initial data for the current view
        if (view === "pending" && orders.length === 0) setIsLoading(true);
        if (view === "finished" && orders.length === 0) setIsLoading(true);

        try {
            const res = (view === "pending" ? await getPaidOrders({}) : await getFinishedOrders({})) as any;
            if (res && res.success === false) {
                toast.error("Erreur de sécurité : " + res.error);
                setOrders([]);
            } else {
                const newData = Array.isArray(res) ? res : [];
                setOrders(newData);
            }
        } catch (error) {
            console.error("Load failed:", error);
            setOrders([]);
        } finally {
            setIsLoading(false);
        }
    }, [view]); // Removed orders.length to stabilize reference

    // Initial state sync when view changes
    useEffect(() => {
        if (view === "pending") setOrders(initialOrders);
        else setOrders(initialFinished);
    }, [view, initialOrders, initialFinished]);

    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const res: any = view === "pending" ? await getPaidOrders({}) : await getFinishedOrders({});
                const data = Array.isArray(res) ? res : [];

                if (view === "pending") {
                    const currentIds = new Set(data.map((o: any) => o.id));
                    const newOrders = data.filter((o: any) => !prevOrderIds.current.has(o.id));

                    if (newOrders.length > 0 && prevOrderIds.current.size > 0) {
                        newOrders.forEach((o: any) => {
                            toast.success(`NOUVELLE COMMANDE : ${o.orderNumber}`, {
                                icon: '🛎️',
                                duration: 8000,
                                style: {
                                    borderRadius: '12px',
                                    background: '#ec5b13',
                                    color: '#fff',
                                    fontWeight: 'black',
                                    fontSize: '14px'
                                }
                            });
                        });
                    }
                    prevOrderIds.current = currentIds;

                    // Auto-Print Logic for Webhook-delivered orders
                    const orderToPrint = data.find((o: any) => o.status === "LIVRE" && !processedIds.current.has(o.id));
                    if (orderToPrint) {
                        processedIds.current.add(orderToPrint.id);
                        toast.success(`Impression automatique : ${orderToPrint.orderNumber}`, { icon: '🖨️' });
                        setOrderForDetail(orderToPrint);
                        setShouldPrint(true);
                    }
                }

                setOrders(data);
                setIsLoading(false);
            } catch (err) {
                console.error("Polling error:", err);
            }
        }, 5000); // Increased to 5s for better performance
        return () => clearInterval(interval);
    }, [view]); // Stable polling

    // Consolidated Effect for Auto-Print trigger (Cloud Print Mode)
    useEffect(() => {
        if (shouldPrint && orderForDetail) {
            handlePrint(orderForDetail);
            setShouldPrint(false);
            if (orderForDetail.status === "LIVRE") {
                markOrderAsTermine({ id: orderForDetail.id }).then(() => loadOrders());
            }
        }
    }, [shouldPrint, orderForDetail, loadOrders]);

    const handleCodeChange = (itemId: string, index: number, value: string) => {
        setCodes(prev => ({
            ...prev,
            [`${itemId}-${index}`]: value
        }));
    };

    const isOrderReady = () => {
        if (!selectedOrder) return false;
        return selectedOrder.items.every((item: any) => {
            for (let i = 0; i < item.quantity; i++) {
                if (!codes[`${item.id}-${i}`]) return false;
            }
            return true;
        });
    };

    const handleProcess = async () => {
        if (!selectedOrder || !isOrderReady()) return;
        setIsProcessing(true);
        try {
            const itemsWithCodes = selectedOrder.items.map((item: any) => ({
                id: item.id,
                name: item.name,
                codes: Array.from({ length: item.quantity }, (_, i) => codes[`${item.id}-${i}`])
            }));
            const res: any = await processOrder({ id: selectedOrder.id, codesData: itemsWithCodes });
            if (res && !res.error) {
                // Flatten codes for the detail view / receipt
                const flattened = {
                    ...res,
                    items: res.items.map((item: any) => ({
                        ...item,
                        codes: item.codes
                    }))
                };
                setOrderForDetail(flattened);
                // setShouldPrint(true); // Removed as processOrder now handles print status
                loadOrders();
                setSelectedOrder(null);
                setCodes({});
            }
        } catch (error) {
            console.error("Process failed:", error);
        } finally {
            setIsProcessing(false);
        }
    };

    // Auto-populate codes from order items if they already have them (pre-assigned)
    useEffect(() => {
        if (selectedOrder) {
            const initialCodes: Record<string, string> = {};
            selectedOrder.items.forEach((item: any) => {
                if (item.codes && item.codes.length > 0) {
                    item.codes.forEach((code: string, i: number) => {
                        initialCodes[`${item.id}-${i}`] = code;
                    });
                }
            });
            setCodes(prev => ({ ...prev, ...initialCodes }));
        }
    }, [selectedOrder]);

    const handleResendWhatsApp = async (orderId: number) => {
        setIsResending(true);
        try {
            const res: any = await resendWhatsAppAction({ orderId });
            if (res.success) {
                toast.success("Livraison WhatsApp relancée");
            } else {
                toast.error("Échec: " + res.error);
            }
        } catch (error) {
            toast.error("Erreur de connexion");
        } finally {
            setIsResending(false);
        }
    };

    const handleCancelOrder = async (orderId: number) => {
        setConfirmModal({
            isOpen: true,
            title: "Annuler la commande",
            description: "Êtes-vous sûr de vouloir annuler/rembourser cette commande ? Cette action est irréversible et libérera les codes digitaux associés.",
            variant: "danger",
            onConfirm: async () => {
                try {
                    const res = await cancelOrderAction({ orderId });
                    if (res.success) {
                        toast.success("Commande annulée avec succès");
                        setIsDetailModalOpen(false);
                        loadOrders();
                    } else {
                        toast.error("Erreur: " + (res as any).error);
                    }
                } catch (error) {
                    console.error("Cancel failed:", error);
                    toast.error("Erreur technique lors de l'annulation");
                }
            }
        });
    };

    const filteredOrders = React.useMemo(() => {
        return orders.filter(o => {
            const val = searchTerm.toLowerCase();
            return (
                o.orderNumber.toLowerCase().includes(val) ||
                o.user?.name?.toLowerCase().includes(val) ||
                o.client?.name?.toLowerCase().includes(val)
            );
        }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [orders, searchTerm]);

    const getTimeAgo = (date: any) => {
        const diffMs = new Date().getTime() - new Date(date).getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 60) return `${diffMins} min`;
        return `${Math.floor(diffMins / 60)}h ${diffMins % 60} m`;
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "PAYE": return <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase px-2 py-0.5 rounded shrink-0">Payé</span>;
            case "PARTIEL": return <span className="bg-amber-500/20 text-amber-400 text-[10px] font-bold uppercase px-2 py-0.5 rounded shrink-0">Partiel</span>;
            case "NON_PAYE": return <span className="bg-red-500/20 text-red-500 text-[10px] font-bold uppercase px-2 py-0.5 rounded shrink-0">Dette</span>;
            case "TERMINE": return <span className="bg-blue-500/20 text-blue-400 text-[10px] font-bold uppercase px-2 py-0.5 rounded shrink-0">Livré</span>;
            default: return null;
        }
    };

    const getSourceBadge = (source: string) => {
        switch (source) {
            case "B2B_WEB": return <span className="bg-[#ec5b13]/20 text-[#ec5b13] text-[9px] font-black uppercase px-2 py-0.5 rounded border border-[#ec5b13]/30">PARTENAIRE</span>;
            case "API": return <span className="bg-purple-500/20 text-purple-400 text-[9px] font-black uppercase px-2 py-0.5 rounded border border-purple-500/30">API</span>;
            default: return null;
        }
    };

    // Helper for category-based icons
    const getProductIcon = (name: string) => {
        const n = name.toLowerCase();
        if (n.includes('psn') || n.includes('playstation') || n.includes('xbox') || n.includes('game')) return 'sports_esports';
        if (n.includes('netflix') || n.includes('tv') || n.includes('streaming')) return 'tv_signin';
        return 'inventory_2';
    };

    return (
        <div className="flex h-[calc(100vh-64px)] w-full overflow-hidden bg-background-light dark:bg-[#1a0f0a] mx-[-32px] my-[-32px] font-sans antialiased text-slate-900 dark:text-white">
            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #4b2e24; border-radius: 10px; }
            `}</style>

            <main className="flex-1 flex flex-col min-w-0 bg-transparent">
                {/* Header */}
                <header className="h-20 border-b border-slate-200 dark:border-[#ec5b13]/10 px-8 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="size-10 bg-[#ec5b13]/10 rounded-xl flex items-center justify-center text-[#ec5b13]">
                            <span className="material-symbols-outlined font-light">history_edu</span>
                        </div>
                        <h2 className="text-xl font-bold tracking-tight">Traitement des Commandes (File d&apos;attente)</h2>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="relative w-64">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">search</span>
                            <input
                                className="w-full bg-white dark:bg-[#2a1b15] border border-slate-200 dark:border-none rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-[#ec5b13]/50 text-slate-900 dark:text-slate-200 outline-none"
                                placeholder="Rechercher une commande..."
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-2 bg-slate-100 dark:bg-[#2a1b15] p-1 rounded-xl">
                            <button
                                onClick={() => setView("pending")}
                                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${view === "pending" ? "bg-[#ec5b13] text-white" : "text-slate-500 hover:text-white"}`}
                            >
                                Attente
                            </button>
                            <button
                                onClick={() => setView("finished")}
                                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${view === "finished" ? "bg-[#ec5b13] text-white" : "text-slate-500 hover:text-white"}`}
                            >
                                Finies
                            </button>
                        </div>
                    </div>
                </header>

                {/* Dual Column Layout */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Left Column: Queue */}
                    <section className="w-96 flex flex-col border-r border-slate-200 dark:border-[#ec5b13]/5 shrink-0 bg-slate-50/50 dark:bg-transparent">
                        <div className="p-6 shrink-0">
                            <h3 className="text-lg font-bold mb-1">File d&apos;attente</h3>
                            <p className="text-sm text-slate-500 uppercase tracking-widest text-[10px] font-bold">
                                {view === "pending" ? "Payé - À Traiter" : "Traitement Terminé"}
                            </p>
                        </div>
                        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-3 custom-scrollbar">
                            {isLoading && orders.length === 0 ? (
                                <div className="flex justify-center p-12"><Spinner color="warning" /></div>
                            ) : filteredOrders.length === 0 ? (
                                <div className="text-center p-12 text-slate-600 italic">Aucune commande à traiter</div>
                            ) : filteredOrders.map(order => (
                                <div
                                    key={order.id}
                                    onClick={() => setSelectedOrder(order)}
                                    className={`p-4 rounded-2xl border transition-all cursor-pointer group ${selectedOrder?.id === order.id
                                        ? "bg-[#ec5b13]/10 border-[#ec5b13]/30 ring-1 ring-[#ec5b13]/20"
                                        : "bg-white dark:bg-[#2a1b15]/40 border-slate-200 dark:border-white/5 hover:border-[#ec5b13]/20 shadow-sm dark:shadow-none"
                                        }`}
                                >
                                    <div className="flex justify-between items-start mb-2 gap-2">
                                        <span className={`font-bold truncate ${selectedOrder?.id === order.id ? "text-[#ec5b13]" : "text-slate-300 group-hover:text-[#ec5b13]"}`}>
                                            #{order.orderNumber}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            {getSourceBadge(order.source)}
                                            {getStatusBadge(order.status)}
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-sm text-slate-400">Il y a {getTimeAgo(order.createdAt)}</p>
                                        <div className="flex justify-between items-center">
                                            <p className="text-xs text-slate-500">
                                                {order.items.reduce((acc: number, item: any) => acc + item.quantity, 0)} articles • {formatCurrency(order.totalAmount, 'DZD')}
                                            </p>
                                            {order.items.some((it: any) => it.codes?.some((c: string) => c.includes('| Profil'))) && (
                                                <span className="flex items-center gap-1 text-[9px] font-black text-secondary uppercase bg-secondary/10 px-1.5 py-0.5 rounded-md">
                                                    <span className="material-symbols-outlined text-[11px]">group</span>
                                                    Partagé
                                                </span>
                                            )}
                                            {order.status === "TERMINE" && (
                                                <button
                                                    aria-label="Voir les détails de la commande"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setOrderForDetail(order);
                                                        setIsDetailModalOpen(true);
                                                    }}
                                                    className="p-1.5 rounded-lg bg-white/5 hover:bg-[#ec5b13]/20 text-slate-400 hover:text-[#ec5b13] transition-all"
                                                >
                                                    <Eye size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Right Column: Workspace */}
                    <section className="flex-1 flex flex-col min-w-0 bg-[#1a0f0a]/30 relative overflow-hidden">
                        {selectedOrder ? (
                            <div className="flex-1 flex flex-col min-w-0">
                                <div className="p-8 border-b border-white/5 shrink-0 flex justify-between items-center">
                                    <div>
                                        <h4 className="text-2xl font-bold tracking-tight mb-1 truncate">Détails de la Commande {selectedOrder.orderNumber}</h4>
                                        <p className="text-slate-500 dark:text-slate-400 text-sm flex items-center gap-2">
                                            <span className="material-symbols-outlined text-sm">calendar_today</span>
                                            {new Date(selectedOrder.createdAt).toLocaleDateString("fr-FR", { day: 'numeric', month: 'long', year: 'numeric' })} • {new Date(selectedOrder.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                    <div className="flex gap-2">
                                        {selectedOrder.deliveryMethod === "whatsapp" && (
                                            <button
                                                aria-label="Renvoyer par WhatsApp"
                                                onClick={() => handleResendWhatsApp(selectedOrder.id)}
                                                disabled={isResending}
                                                title="Renvoyer par WhatsApp"
                                                className="p-2.5 rounded-xl bg-[#25D366]/10 border border-[#25D366]/20 text-[#25D366] hover:bg-[#25D366]/20 transition-all disabled:opacity-50"
                                            >
                                                {isResending ? <Loader2 className="size-5 animate-spin" /> : <MessageSquare size={20} />}
                                            </button>
                                        )}
                                        <button
                                            aria-label="Réimprimer le ticket"
                                            onClick={() => handlePrint(selectedOrder)}
                                            className="p-2.5 rounded-xl bg-white dark:bg-[#2a1b15] border border-slate-200 dark:border-white/5 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                                        >
                                            <span className="material-symbols-outlined">print</span>
                                        </button>
                                        <button aria-label="Désélectionner la commande" className="p-2.5 rounded-xl bg-white dark:bg-[#2a1b15] border border-slate-200 dark:border-white/5 text-slate-400 hover:text-red-400 transition-colors" onClick={() => setSelectedOrder(null)}>
                                            <span className="material-symbols-outlined">block</span>
                                        </button>
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto custom-scrollbar">
                                    <div className="p-8 space-y-8">
                                        {selectedOrder.items.map((item: any) => (
                                            <div key={item.id} className="space-y-4">
                                                <div className="flex justify-between items-center">
                                                    <div className="flex items-center gap-4">
                                                        <div className={`size-14 rounded-2xl flex items-center justify-center border ${item.name.toLowerCase().includes('psn') ? 'bg-blue-600/20 text-blue-400 border-blue-600/30' : 'bg-red-600/20 text-red-500 border-red-600/30'}`}>
                                                            <span className="material-symbols-outlined text-3xl">{getProductIcon(item.name)}</span>
                                                        </div>
                                                        <div>
                                                            <h5 className="font-bold text-lg truncate">{item.name}</h5>
                                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                                                                <p className="text-slate-500 text-sm">Quantité: <span className="text-slate-900 dark:text-white font-medium">{item.quantity}</span></p>
                                                                {item.customData && (
                                                                    <span className="text-[10px] text-[#ec5b13] font-black uppercase tracking-widest border-l border-white/10 pl-3">ID: {item.customData}</span>
                                                                )}
                                                                {item.playerNickname && (
                                                                    <span className="text-[10px] text-emerald-500 font-black uppercase tracking-widest border-l border-white/10 pl-3">PSEUDO: {item.playerNickname}</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col items-end">
                                                        <p className="text-xl font-bold whitespace-nowrap text-[#ec5b13]">{formatCurrency(item.price, 'DZD')}</p>

                                                        {/* Purchase Price Section */}
                                                        <div className="flex flex-col items-end gap-1 mt-1 border-t border-white/5 pt-1 w-full min-w-[120px]">
                                                            <div className="flex items-center gap-1.5 group/edit">
                                                                <span className="text-[10px] text-slate-500 font-bold uppercase whitespace-nowrap">Achat: </span>
                                                                {editingPurchaseItemId === item.id ? (
                                                                    <div className="flex items-center gap-1">
                                                                        <input
                                                                            type="text"
                                                                            className="w-16 h-6 bg-black border border-[#ec5b13]/50 rounded text-[10px] px-1 text-white outline-none"
                                                                            value={tempPurchasePrice}
                                                                            onChange={(e) => setTempPurchasePrice(e.target.value)}
                                                                            autoFocus
                                                                        />
                                                                        <select
                                                                            className="h-6 bg-black border border-[#ec5b13]/50 rounded text-[10px] text-white outline-none px-0.5"
                                                                            value={tempPurchaseCurrency}
                                                                            onChange={(e) => setTempPurchaseCurrency(e.target.value)}
                                                                        >
                                                                            <option value="USD">USD</option>
                                                                            <option value="DZD">DZD</option>
                                                                        </select>
                                                                        <button
                                                                            onClick={() => handleSavePurchasePrice(item.id)}
                                                                            disabled={isActionLoading}
                                                                            className="size-6 flex items-center justify-center bg-emerald-500/20 text-emerald-500 rounded hover:bg-emerald-500/30 transition-colors"
                                                                        >
                                                                            <span className="material-symbols-outlined text-sm">check_circle</span>
                                                                        </button>
                                                                        <button
                                                                            onClick={() => setEditingPurchaseItemId(null)}
                                                                            className="size-6 flex items-center justify-center bg-white/5 text-slate-400 rounded hover:bg-white/10 transition-colors"
                                                                        >
                                                                            <span className="material-symbols-outlined text-sm">close</span>
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        onClick={() => {
                                                                            setEditingPurchaseItemId(item.id);
                                                                            setTempPurchasePrice(item.purchasePrice || "0");
                                                                            setTempPurchaseCurrency(item.purchaseCurrency || 'USD');
                                                                        }}
                                                                        className="flex items-center gap-1.5 hover:text-[#ec5b13] transition-colors"
                                                                    >
                                                                        <span className="text-[11px] text-slate-400 font-black">
                                                                            {item.purchasePrice ? formatCurrency(item.purchasePrice, item.purchaseCurrency || 'USD') : "Non défini"}
                                                                        </span>
                                                                        <span className="material-symbols-outlined text-[12px] text-slate-600 transition-transform group-hover/edit:rotate-180">sync</span>
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-18">
                                                    {Array.from({ length: item.quantity }).map((_, i) => {
                                                        const isPreassigned = item.codes && item.codes[i];
                                                        const isSharing = item.variant?.isSharing;
                                                        const isAssigningKey = `${item.id}-${i}`;

                                                        return (
                                                            <div key={i} className="flex flex-col gap-2">
                                                                <div className="relative">
                                                                    <div className={`absolute inset-y-0 left-0 w-1 ${isPreassigned ? 'bg-emerald-500' : 'bg-[#ec5b13]/40'} rounded-full`}></div>
                                                                    <input
                                                                        className={`w-full bg-slate-50 dark:bg-[#2a1b15] border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-[#ec5b13] focus:border-[#ec5b13] outline-none text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 transition-all ${isPreassigned ? 'opacity-60 cursor-not-allowed border-emerald-500/30' : ''}`}
                                                                        placeholder={isPreassigned ? "Code automatique assigné" : `Entrez le code #${i + 1} pour ${item.name}...`}
                                                                        type="text"
                                                                        value={codes[`${item.id}-${i}`] || ""}
                                                                        onChange={(e) => handleCodeChange(item.id, i, e.target.value)}
                                                                        disabled={view === "finished" || isPreassigned}
                                                                    />
                                                                </div>

                                                                {isSharing && !isPreassigned && view === "pending" && (
                                                                    <button
                                                                        onClick={() => handleAutoAssign(item.id, item.variantId, i)}
                                                                        disabled={isAssigning[isAssigningKey]}
                                                                        className="flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 hover:bg-orange-500/20 text-xs font-black transition-all group active:scale-95"
                                                                    >
                                                                        {isAssigning[isAssigningKey] ? (
                                                                            <Loader2 className="size-3 animate-spin" />
                                                                        ) : (
                                                                            <span className="material-symbols-outlined text-sm group-hover:rotate-12 transition-transform">pyscript</span>
                                                                        )}
                                                                        <span>ATTRIBUER SLOT AUTO</span>
                                                                    </button>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}

                                        <div className="mt-12 p-6 rounded-2xl bg-slate-50 dark:bg-[#2a1b15]/30 border border-slate-200 dark:border-white/5 space-y-3">
                                            <div className="flex justify-between text-slate-400 text-sm">
                                                <span>Validation des codes</span>
                                                <span>{Object.keys(codes).length} injectés</span>
                                            </div>
                                            <div className="pt-3 border-t border-slate-200 dark:border-white/5 flex justify-between items-center text-slate-900 dark:text-white">
                                                <span className="font-bold text-lg">Total à valider</span>
                                                <span className="text-2xl font-black">{formatCurrency(selectedOrder.totalAmount, 'DZD')}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {view === "pending" && (
                                    <footer className="p-8 border-t border-slate-200 dark:border-white/5 bg-white dark:bg-[#1a0f0a] shrink-0">
                                        <button
                                            onClick={handleProcess}
                                            disabled={!isOrderReady() || isProcessing}
                                            className={`w-full font-bold py-4 rounded-2xl shadow-xl transition-all flex items-center justify-center gap-3 active:scale-[0.98] ${isOrderReady() ? 'bg-gradient-to-r from-[#ec5b13] to-orange-600 text-white shadow-[#ec5b13]/20 hover:from-[#ec5b13] hover:to-[#ec5b13]' : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'}`}
                                        >
                                            {isProcessing ? <Spinner size="sm" color="white" /> : (
                                                <>
                                                    <span className="material-symbols-outlined shrink-0">task_alt</span>
                                                    <span>Valider & Imprimer le Ticket</span>
                                                </>
                                            )}
                                        </button>
                                    </footer>
                                )}
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center p-20 text-center group opacity-40">
                                <div className="size-48 rounded-[64px] bg-white dark:bg-[#2a1b15]/40 border border-slate-200 dark:border-white/5 flex items-center justify-center mb-10 shadow-2xl relative overflow-hidden">
                                    <div className="absolute inset-0 bg-[#ec5b13]/5" />
                                    <span className="material-symbols-outlined text-8xl text-[#ec5b13]/20 group-hover:scale-110 transition-all duration-700">order_approve</span>
                                </div>
                                <h3 className="text-3xl font-bold text-slate-600 uppercase tracking-widest italic mb-4">Poste de Travail</h3>
                                <p className="text-slate-400 font-medium">Veuillez sélectionner une commande dans la file d&apos;attente</p>
                            </div>
                        )}
                    </section>
                </div>
            </main>

            {/* Optimized Print Container - Only renders items calculation when actually printing or needed */}
            {shouldPrint && (selectedOrder || orderForDetail) && (
                <div
                    id="thermal-receipt-source"
                    className="fixed -top-[9999px] -left-[9999px] opacity-0 pointer-events-none text-black bg-white"
                    aria-hidden="true"
                >
                    <ThermalReceiptV2
                        orderNumber={selectedOrder?.orderNumber || orderForDetail?.orderNumber}
                        date={selectedOrder?.createdAt || orderForDetail?.createdAt}
                        items={(selectedOrder || orderForDetail)?.items.map((item: any) => ({
                            ...item,
                            codes: selectedOrder
                                ? Array.from({ length: item.quantity }, (_, i) => codes[`${item.id}-${i}`]).filter(Boolean)
                                : item.codes
                        })) || []}
                        totalAmount={selectedOrder?.totalAmount || orderForDetail?.totalAmount}
                        remise={selectedOrder?.remise || orderForDetail?.remise}
                        paymentMethod={(selectedOrder || orderForDetail)?.paymentMethod}
                        totalClientDebt={(selectedOrder || orderForDetail)?.totalClientDebt}
                    />
                </div>
            )}

            <OrderDetailModal
                isOpen={isDetailModalOpen}
                onClose={() => setIsDetailModalOpen(false)}
                order={orderForDetail}
                onRefund={() => handleCancelOrder(orderForDetail.id)}
                onReprint={() => handlePrint(orderForDetail)}
            />

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                description={confirmModal.description}
                variant={confirmModal.variant}
            />
        </div>
    );
}
