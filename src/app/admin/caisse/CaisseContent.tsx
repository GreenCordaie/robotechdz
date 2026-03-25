"use client";

import React, { useState, useEffect } from "react";
import { Spinner, Button, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Tooltip } from "@heroui/react";
import { useOrderStore } from "@/store/useOrderStore";
import { payOrder, getTodayOrders, cancelOrderAction, replaceOrderItemCode, refundOrderItem, refundFullOrder, notifyTraiteurAction, requeueForPrint } from "./actions";
import { InitiateReturnModal } from "@/components/admin/modals/InitiateReturnModal";
import { ApproveReturnModal } from "@/components/admin/modals/ApproveReturnModal";
import { useAuthStore } from "@/store/useAuthStore";
import { toast } from "react-hot-toast";
import OrderDetailModal from "@/components/admin/modals/OrderDetailModal";
import RefundOrderModal from "@/components/admin/modals/RefundOrderModal";
import { Eye, User as UserIcon, Plus, RotateCcw } from "lucide-react";
import { getAllClients, createClient } from "../clients/actions";
import { formatCurrency } from "@/lib/formatters";
import { ThermalReceiptV2 } from "@/components/admin/receipt/ThermalReceiptV2";
import { useSettingsStore } from "@/store/useSettingsStore";

export default function CaisseContent() {
    const {
        currentOrder,
        setCurrentOrder,
        searchQuery,
        setSearchQuery,
    } = useOrderStore();
    const { user } = useAuthStore();

    const [isUpdating, setIsUpdating] = useState(false);
    const [allTodayOrders, setAllTodayOrders] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<string>("Toutes");
    const [remise, setRemise] = useState<number>(0);
    const [montantRecu, setMontantRecu] = useState<number | string>("");
    const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
    const [allClients, setAllClients] = useState<any[]>([]);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [orderForDetail, setOrderForDetail] = useState<any | null>(null);
    const [isCreatingClient, setIsCreatingClient] = useState(false);
    const [newClientName, setNewClientName] = useState("");
    const [newClientPhone, setNewClientPhone] = useState("");
    const [itemSuppliers, setItemSuppliers] = useState<Record<number, number>>({});
    const [itemPriceOverrides, setItemPriceOverrides] = useState<Record<number, { price: string, currency: string }>>({});
    const [lastReloadTime, setLastReloadTime] = useState<Date>(new Date());
    const [orderToRefund, setOrderToRefund] = useState<any | null>(null);
    const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
    const [orderForInitiateReturn, setOrderForInitiateReturn] = useState<any | null>(null);
    const [orderForApproveReturn, setOrderForApproveReturn] = useState<any | null>(null);
    const settings = useSettingsStore();

    const handlePrint = async (data: any) => {
        if (!data?.id) return;
        const res: any = await requeueForPrint({ orderId: data.id });
        if (res?.success) {
            toast.success(`🖨️ Ticket #${data.orderNumber} en file d'impression`);
        } else {
            toast.error(`🖨️ Erreur: ${res?.error || 'Impossible de mettre en file'}`);
        }
    };

    const loadOrders = async (silent = false) => {
        if (!silent) setIsLoading(true);
        try {
            const res: any = await getTodayOrders({});
            if (res && res.success === false) {
                toast.error("Erreur de sécurité : " + res.error);
                setAllTodayOrders([]);
            } else {
                setAllTodayOrders(Array.isArray(res) ? res : []);
                setLastReloadTime(new Date());
            }
        } catch (error) {
            console.error("Orders load failed:", error);
            setAllTodayOrders([]);
        } finally {
            if (!silent) setIsLoading(false);
        }
    };

    useEffect(() => {
        loadOrders();
        const loadClients = async () => {
            const res: any = await getAllClients({});
            setAllClients(res.success && Array.isArray(res.clients) ? res.clients : []);
        };
        loadClients();

        // POLL Strategy: 10s (Extended from 3s)
        const interval = setInterval(async () => {
            await loadOrders(true);
        }, 10000);

        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (currentOrder) {
            setRemise(0);
            setMontantRecu(Number(currentOrder.totalAmount));
            setSelectedClientId(null);

            // AUTO-SELECT BEST MARGIN SUPPLIER & INIT OVERRIDES
            const initialSuppliers: Record<number, number> = {};
            const initialOverrides: Record<number, { price: string, currency: string }> = {};

            (currentOrder.items as any[]).forEach(item => {
                if (item.variant?.variantSuppliers?.length > 0) {
                    const cheapest = [...item.variant.variantSuppliers].sort((a, b) =>
                        parseFloat(a.purchasePrice) - parseFloat(b.purchasePrice)
                    )[0];
                    initialSuppliers[item.id] = cheapest.supplierId;
                    initialOverrides[item.id] = {
                        price: cheapest.purchasePrice,
                        currency: cheapest.currency
                    };
                }
            });
            setItemSuppliers(initialSuppliers);
            setItemPriceOverrides(initialOverrides);
        }
    }, [currentOrder]);

    const handleEncaisser = async (clientIdOverride?: number) => {
        if (!currentOrder || !user) return;

        const totalApresRemise = Number(currentOrder.totalAmount) - remise;
        const effectiveRecu = montantRecu === "" ? totalApresRemise : Number(montantRecu);
        const finalClientId = clientIdOverride || selectedClientId;

        if (effectiveRecu < totalApresRemise && !finalClientId) {
            setIsCreatingClient(true);
            return;
        }

        setIsUpdating(true);
        try {
            const paymentMethodLabel = effectiveRecu >= (Number(currentOrder.totalAmount) - remise) ? "Espèces" : "Crédit / Partiel";

            const res: any = await payOrder({
                id: currentOrder.id,
                options: {
                    remise,
                    montantPaye: effectiveRecu,
                    clientId: finalClientId || undefined,
                    itemSuppliers,
                    itemPriceOverrides: itemPriceOverrides as any,
                    paymentMethod: paymentMethodLabel,
                }
            });
            if (res.success && res.order) {
                toast.success(`Commande #${currentOrder.orderNumber} encaissée avec succès !`, {
                    className: 'bg-green-950 text-green-400 border border-green-900'
                });

                // Ticket mis en file d'impression automatiquement par payOrder (print_pending en DB)
                if (res.order.deliveryMethod === "TICKET") {
                    const hasManual = res.order.items?.some((it: any) => it.variant?.product?.isManualDelivery);
                    if (!hasManual) {
                        toast.success(`🖨️ Ticket #${res.order.orderNumber} envoyé à l'imprimante`, { duration: 3000 });
                    } else {
                        toast.success("Commande mixte/manuelle : l'impression se lancera après insertion des codes manquants", { duration: 5000 });
                    }
                }

                setCurrentOrder(null);
                loadOrders();
            } else {
                toast.error("Échec de l'encaissement: " + res.error);
            }
        } catch (error) {
            console.error("Update failed:", error);
            toast.error("Erreur technique lors de l'encaissement");
        } finally {
            setIsUpdating(false);
            if (clientIdOverride) setIsCreatingClient(false);
        }
    };

    const handleNotifyTraiteur = async () => {
        if (!currentOrder) return;
        setIsUpdating(true);
        try {
            const res = await notifyTraiteurAction({ orderId: currentOrder.id });
            if (res.success) {
                toast.success("Notification envoyée au traiteur !");
            } else {
                toast.error("Erreur : " + res.error);
            }
        } catch (error) {
            toast.error("Erreur technique");
        } finally {
            setIsUpdating(false);
        }
    };


    const statusMap: Record<string, string> = {
        "Toutes": "ALL",
        "En attente": "EN_ATTENTE",
        "Payées": "PAYE",
        "Livrées": "TERMINE",
        "Partiel": "PARTIEL",
        "Dettes": "NON_PAYE",
        "Remboursés": "REMBOURSE"
    };

    const handleCancelOrder = async (orderId: number) => {
        if (!confirm("Êtes-vous sûr de vouloir annuler/rembourser cette commande ? Cette action est irréversible et libérera les codes digitaux associés.")) return;

        setIsUpdating(true);
        try {
            const res = await cancelOrderAction({ orderId });
            if (res.success) {
                toast.success("Commande annulée avec succès");
                setIsDetailModalOpen(false);
                loadOrders();
            } else {
                toast.error("Erreur: " + res.error);
            }
        } catch (error) {
            console.error("Cancel failed:", error);
            toast.error("Erreur technique lors de l'annulation");
        } finally {
            setIsUpdating(false);
        }
    };

    const getStatusConfig = (status: string) => {
        switch (status) {
            case "EN_ATTENTE":
                return { label: "À Encaisser", classes: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800" };
            case "PAYE":
                return { label: "Payé", classes: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" };
            case "TERMINE":
                return { label: "Livrée", classes: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800" };
            case "PARTIEL":
                return { label: "Partiel", classes: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800" };
            case "NON_PAYE":
                return { label: "Dette", classes: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800" };
            case "REMBOURSE":
                return { label: "Remboursé", classes: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200 dark:border-purple-800" };
            default:
                return { label: status, classes: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700" };
        }
    };

    const filteredOrders = allTodayOrders.filter(o => {
        const matchesSearch = o.orderNumber.toLowerCase().includes(searchQuery.toLowerCase());
        if (!matchesSearch) return false;
        if (filterStatus === "Toutes") return true;
        return o.status === statusMap[filterStatus];
    });

    return (
        <main className="flex flex-1 min-w-0 overflow-hidden h-[calc(100vh-64px)] mx-[-32px] my-[-32px] bg-background-light dark:bg-background-dark font-sans antialiased">
            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(236, 91, 19, 0.2); border-radius: 10px; }
            `}</style>

            {/* Left Zone (60%) - Order List */}
            <section className="flex-[0.6] min-w-0 flex flex-col bg-background-light dark:bg-[#221610] border-r border-[#ec5b13]/10">
                {/* Pending Returns Section — SUPER_ADMIN only */}
                {(user?.role as string) === "SUPER_ADMIN" && allTodayOrders.some((o: any) => o.returnRequest?.status === "EN_ATTENTE") && (
                    <div className="px-6 pt-4">
                        <div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-700/30 rounded-xl p-4">
                            <h3 className="text-xs font-black uppercase tracking-wider text-yellow-700 dark:text-yellow-400 mb-3">
                                🔔 Retours en attente d'approbation
                            </h3>
                            <div className="space-y-2">
                                {allTodayOrders
                                    .filter((o: any) => o.returnRequest?.status === "EN_ATTENTE")
                                    .map((o: any) => (
                                        <div key={o.id} className="flex items-center justify-between bg-white dark:bg-yellow-900/20 rounded-lg px-3 py-2 text-sm">
                                            <div>
                                                <span className="font-bold text-gray-900 dark:text-white">#{o.orderNumber}</span>
                                                <span className="mx-2 text-gray-400">—</span>
                                                <span className="text-gray-700 dark:text-gray-300">{parseFloat(o.returnRequest.montant).toLocaleString("fr-DZ")} DA</span>
                                                <span className="ml-2 text-xs text-gray-400">{o.returnRequest.typeRemboursement === "ESPECES" ? "Espèces" : "Crédit Wallet"}</span>
                                            </div>
                                            <button
                                                onClick={() => setOrderForApproveReturn(o)}
                                                className="px-3 py-1 bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-bold rounded-lg transition-colors"
                                            >
                                                Traiter
                                            </button>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Header / Filters */}
                <header className="p-6 space-y-6">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg font-bold tracking-tight shrink-0 text-[#ec5b13]">Commandes du jour</h2>
                        </div>
                        <div className="flex flex-nowrap gap-1 p-1 bg-slate-200 dark:bg-[#ec5b13]/5 rounded-xl transition-all overflow-x-auto scrollbar-hide">
                            {["Toutes", "En attente", "Payées", "Partiel", "Dettes", "Livrées", "Remboursés"].map((s) => (
                                <button
                                    key={s}
                                    onClick={() => setFilterStatus(s)}
                                    className={`px-2 py-1 text-[10px] font-black uppercase tracking-tighter rounded-lg transition-all whitespace-nowrap ${filterStatus === s
                                        ? "bg-white dark:bg-[#ec5b13] text-[#ec5b13] dark:text-white shadow-sm"
                                        : "text-slate-500 hover:text-[#ec5b13]"
                                        }`}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>

                    </div>
                    <div className="relative">
                        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                        <input
                            className="w-full bg-white dark:bg-[#ec5b13]/5 border border-slate-200 dark:border-[#ec5b13]/20 rounded-xl py-3 pl-12 pr-4 focus:ring-2 focus:ring-[#ec5b13] focus:border-transparent outline-none transition-all placeholder:text-slate-400"
                            placeholder="Rechercher une commande (ex: #A45)"
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </header>

                {/* Orders List / Cards */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-6 pb-6">
                    {/* Desktop Table View */}
                    <div className="hidden md:block bg-white dark:bg-[#ec5b13]/5 rounded-2xl border border-slate-200 dark:border-[#ec5b13]/10 overflow-x-auto shadow-sm">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-100 dark:border-[#ec5b13]/10 bg-slate-50 dark:bg-[#ec5b13]/10">
                                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Order #</th>
                                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Heure</th>
                                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Montant</th>
                                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-[#ec5b13]/10">
                                {isLoading && allTodayOrders.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="p-12 text-center"><Spinner color="warning" /></td>
                                    </tr>
                                ) : filteredOrders.map((o) => {
                                    const config = getStatusConfig(o.status);
                                    const isActive = currentOrder?.id === o.id;
                                    return (
                                        <tr
                                            key={o.id}
                                            onClick={() => setCurrentOrder(o)}
                                            className={`cursor-pointer transition-colors ${isActive ? 'bg-[#ec5b13]/5 border-l-4 border-l-[#ec5b13]' : 'hover:bg-slate-50 dark:hover:bg-[#ec5b13]/10 border-l-4 border-l-transparent'}`}
                                        >
                                            <td className={`px-6 py-4 font-bold ${isActive ? 'text-[#ec5b13]' : ''}`}>
                                                <div className="flex items-center gap-2">
                                                    <span>{o.orderNumber.startsWith('#') ? o.orderNumber : `#${o.orderNumber}`}</span>
                                                    {o.deliveryMethod === "WHATSAPP" && (
                                                        <Tooltip content={`WhatsApp: +213 ${o.customerPhone}`} color="success">
                                                            <div className="bg-[#25D366]/10 p-1 rounded-md">
                                                                <svg className="w-4 h-4 text-[#25D366]" fill="currentColor" viewBox="0 0 24 24">
                                                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.438 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"></path>
                                                                </svg>
                                                            </div>
                                                        </Tooltip>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                                                {new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                            <td className="px-6 py-4 font-semibold whitespace-nowrap">{formatCurrency(o.totalAmount, 'DZD')}</td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-3">
                                                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border shrink-0 ${config.classes}`}>
                                                        {config.label}
                                                    </span>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setOrderForDetail(o);
                                                            setIsDetailModalOpen(true);
                                                        }}
                                                        className="p-1.5 rounded-lg bg-white/5 hover:bg-[#ec5b13]/20 text-slate-400 hover:text-[#ec5b13] transition-all"
                                                    >
                                                        <Eye size={14} />
                                                    </button>
                                                    {["PAYE", "TERMINE", "LIVRE", "PARTIEL"].includes(o.status) && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setOrderToRefund(o);
                                                                setIsRefundModalOpen(true);
                                                            }}
                                                            className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-all"
                                                            title="Rembourser cette commande"
                                                        >
                                                            <RotateCcw size={14} />
                                                        </button>
                                                    )}
                                                    {["PAYE", "LIVRE"].includes(o.status) && !(o as any).returnRequest && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setOrderForInitiateReturn(o);
                                                            }}
                                                            className="p-1.5 rounded-lg bg-white/5 hover:bg-orange-500/20 text-slate-400 hover:text-orange-400 transition-all"
                                                            title="Initier un retour / remboursement"
                                                        >
                                                            <span className="material-symbols-outlined !text-sm">assignment_return</span>
                                                        </button>
                                                    )}
                                                    {(o as any).returnRequest?.status === "EN_ATTENTE" && (
                                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-yellow-100 text-yellow-700 border border-yellow-200 whitespace-nowrap">
                                                            En attente
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Card View */}
                    <div className="md:hidden space-y-4">
                        {isLoading && allTodayOrders.length === 0 ? (
                            <div className="flex justify-center p-12"><Spinner color="warning" /></div>
                        ) : filteredOrders.map((o) => {
                            const config = getStatusConfig(o.status);
                            const isActive = currentOrder?.id === o.id;
                            return (
                                <div
                                    key={o.id}
                                    onClick={() => setCurrentOrder(o)}
                                    className={`p-4 rounded-2xl border transition-all cursor-pointer ${isActive
                                        ? 'bg-[#ec5b13]/10 border-[#ec5b13] shadow-lg shadow-[#ec5b13]/5 ring-1 ring-[#ec5b13]/20'
                                        : 'bg-white dark:bg-[#ec5b13]/5 border-slate-200 dark:border-[#ec5b13]/10 shadow-sm'
                                        }`}
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-sm font-black ${isActive ? 'text-[#ec5b13]' : 'text-slate-900 dark:text-white'}`}>
                                                {o.orderNumber.startsWith('#') ? o.orderNumber : `#${o.orderNumber}`}
                                            </span>
                                            {o.deliveryMethod === "WHATSAPP" && (
                                                <div className="bg-[#25D366]/10 p-1 rounded-md">
                                                    <svg className="w-3 h-3 text-[#25D366]" fill="currentColor" viewBox="0 0 24 24">
                                                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.438 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"></path>
                                                    </svg>
                                                </div>
                                            )}
                                        </div>
                                        <span className="text-[10px] text-slate-400 font-bold uppercase">
                                            {new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <div className="flex items-end justify-between">
                                        <div>
                                            <p className="text-xs text-slate-500 font-medium mb-1">Total à régler</p>
                                            <p className="text-lg font-black text-slate-900 dark:text-white">{formatCurrency(o.totalAmount, 'DZD')}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter border ${config.classes}`}>
                                                {config.label}
                                            </span>
                                            <Button
                                                isIconOnly
                                                size="sm"
                                                variant="light"
                                                onPress={(e) => {
                                                    setOrderForDetail(o);
                                                    setIsDetailModalOpen(true);
                                                }}
                                                className="text-[#ec5b13]"
                                            >
                                                <Eye size={16} />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Right Zone (40%) - Checkout Panel */}
            <section className="flex-[0.4] flex flex-col bg-white dark:bg-[#110b08]/80 backdrop-blur-md">
                {currentOrder ? (
                    <div className="flex-1 flex flex-col p-6 overflow-hidden">
                        {/* Checkout Header */}
                        <div className="flex items-center justify-between mb-8 shrink-0">
                            <div>
                                <div className="flex items-center gap-3">
                                    <h3 className="text-xl font-bold">Commande {currentOrder.orderNumber.startsWith('#') ? currentOrder.orderNumber : `#${currentOrder.orderNumber}`}</h3>
                                    {currentOrder.deliveryMethod === "WHATSAPP" && (
                                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#25D366]/10 text-[#25D366] rounded-lg border border-[#25D366]/20">
                                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.438 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"></path>
                                            </svg>
                                            <span className="text-[10px] font-black uppercase">WhatsApp</span>
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className={`w-2 h-2 rounded-full animate-pulse ${currentOrder.status === 'EN_ATTENTE' ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                                    <span className="text-xs text-slate-500 font-medium">
                                        {currentOrder.deliveryMethod === "WHATSAPP" ? `WhatsApp: +213 ${currentOrder.customerPhone}` : "Ticket Imprimé (Standard)"}
                                    </span>
                                </div>
                            </div>
                            <span className={`px-4 py-1.5 rounded-xl text-xs font-bold uppercase border shrink-0 ${getStatusConfig(currentOrder.status).classes}`}>
                                {getStatusConfig(currentOrder.status).label}
                            </span>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2 mb-6">
                            {(currentOrder.items as any[]).map((item, idx) => {
                                const linkedSuppliers = item.variant?.variantSuppliers || [];
                                return (
                                    <div key={idx} className="flex flex-col gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-[#ec5b13]/5 border border-slate-200 dark:border-[#ec5b13]/10 group">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-xl bg-[#ec5b13]/20 flex items-center justify-center overflow-hidden shrink-0">
                                                <span className="material-symbols-outlined text-[#ec5b13] text-xl">category</span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-sm truncate uppercase tracking-tight">{item.name}</p>
                                                {item.customData && (
                                                    <p className="text-[10px] text-[#ec5b13] font-black uppercase tracking-widest mt-0.5 flex items-center gap-1">
                                                        <span className="material-symbols-outlined !text-[12px]">poker_chip</span>
                                                        ID/LIEN: {item.customData}
                                                    </p>
                                                )}
                                                {item.playerNickname && (
                                                    <p className="text-[10px] text-emerald-500 font-black uppercase tracking-widest mt-0.5 flex items-center gap-1">
                                                        <span className="material-symbols-outlined !text-[12px]">person</span>
                                                        PSEUDO: {item.playerNickname}
                                                    </p>
                                                )}
                                                <p className="text-[10px] text-slate-500 font-bold">Qty: {item.quantity} • {formatCurrency(item.price, 'DZD')}</p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="font-black text-white">{formatCurrency(Number(item.price) * item.quantity, 'DZD')}</p>
                                            </div>
                                        </div>

                                        {/* Supplier & Price Override Section */}
                                        {linkedSuppliers.length > 0 && (
                                            <div className="flex flex-col gap-2 pt-2 border-t border-[#ec5b13]/10">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-bold text-slate-500 uppercase shrink-0">Fournisseur :</span>
                                                    <select
                                                        className="flex-1 bg-black/40 border border-[#ec5b13]/20 rounded-lg px-2 py-1 text-[11px] text-white outline-none cursor-pointer hover:border-[#ec5b13]/50 transition-colors"
                                                        value={itemSuppliers[item.id] || ""}
                                                        onChange={(e) => {
                                                            const sid = parseInt(e.target.value);
                                                            setItemSuppliers(prev => ({ ...prev, [item.id]: sid }));
                                                            const s = linkedSuppliers.find((ls: any) => ls.supplierId === sid);
                                                            if (s) {
                                                                setItemPriceOverrides(prev => ({
                                                                    ...prev,
                                                                    [item.id]: { price: s.purchasePrice, currency: s.currency }
                                                                }));
                                                            }
                                                        }}
                                                    >
                                                        <option value="" className="bg-[#1a1614]">Aucun</option>
                                                        {linkedSuppliers.map((ls: any) => (
                                                            <option key={ls.supplier.id} value={ls.supplier.id} className="bg-[#1a1614]">
                                                                {ls.supplier.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-bold text-slate-500 uppercase shrink-0">Prix Achat :</span>
                                                    <div className="flex-1 flex gap-1 items-center">
                                                        <input
                                                            className="flex-1 bg-black/40 border border-[#ec5b13]/20 rounded-lg px-2 py-1 text-[11px] text-white outline-none focus:border-[#ec5b13]/50 transition-colors"
                                                            type="text"
                                                            value={itemPriceOverrides[item.id]?.price || ""}
                                                            placeholder="0.00"
                                                            onChange={(e) => setItemPriceOverrides(prev => ({
                                                                ...prev,
                                                                [item.id]: { ...prev[item.id], price: e.target.value }
                                                            }))}
                                                        />
                                                        <select
                                                            className="bg-black/40 border border-[#ec5b13]/20 rounded-lg px-1 py-1 text-[11px] text-white outline-none cursor-pointer"
                                                            value={itemPriceOverrides[item.id]?.currency || "USD"}
                                                            onChange={(e) => setItemPriceOverrides(prev => ({
                                                                ...prev,
                                                                [item.id]: { ...prev[item.id], currency: e.target.value }
                                                            }))}
                                                        >
                                                            <option value="USD">$</option>
                                                            <option value="DZD">DA</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Financial Block */}
                        <div className="border-t border-slate-200 dark:border-[#ec5b13]/20 pt-6 space-y-4 shrink-0">
                            <div className="flex justify-between items-center text-sm font-medium">
                                <span className="text-slate-500">Sous-total</span>
                                <span className="whitespace-nowrap">{formatCurrency(currentOrder.totalAmount, 'DZD')}</span>
                            </div>

                            {/* Remise & Client Block */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col gap-1.5 p-3 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10">
                                    <span className="text-[10px] uppercase font-bold text-slate-500">Remise (DZD)</span>
                                    <input
                                        className="bg-transparent border-none focus:ring-0 p-0 font-bold text-emerald-500 outline-none w-full"
                                        type="number"
                                        placeholder="0"
                                        value={remise}
                                        onChange={(e) => setRemise(Number(e.target.value))}
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5 p-3 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10">
                                    <span className="text-[10px] uppercase font-bold text-slate-500">Montant Reçu</span>
                                    <input
                                        className="bg-transparent border-none focus:ring-0 p-0 font-bold text-[#ec5b13] outline-none w-full"
                                        type="number"
                                        placeholder="0"
                                        value={montantRecu}
                                        onChange={(e) => setMontantRecu(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Quick Modes */}
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    variant="flat"
                                    className="flex-1 bg-emerald-500/10 text-emerald-500 font-bold text-[10px] uppercase h-8"
                                    onPress={() => setMontantRecu(Number(currentOrder.totalAmount) - remise)}
                                >
                                    Paiement Total
                                </Button>
                                <Button
                                    size="sm"
                                    variant="flat"
                                    className="flex-1 bg-red-500/10 text-red-500 font-bold text-[10px] uppercase h-8"
                                    onPress={() => setMontantRecu(0)}
                                >
                                    Crédit (0 DZD)
                                </Button>
                            </div>

                            {/* Client Selection */}
                            <div className="p-3 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1">
                                        <UserIcon size={10} /> Client (Optionnel)
                                    </span>
                                    {selectedClientId && (
                                        <button onClick={() => setSelectedClientId(null)} className="text-[10px] text-red-500 font-bold uppercase">X Annuler</button>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <select
                                        className="bg-transparent border-none focus:ring-0 p-0 text-sm font-semibold text-[#ec5b13] dark:text-white flex-1 outline-none"
                                        value={selectedClientId || ""}
                                        onChange={(e) => setSelectedClientId(Number(e.target.value) || null)}
                                    >
                                        <option value="" className="bg-[#1a1614]">Client de passage</option>
                                        {allClients.map(c => (
                                            <option key={c.id} value={c.id} className="bg-[#1a1614]">{c.nomComplet}</option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={() => setIsCreatingClient(true)}
                                        className="p-1 rounded bg-[#ec5b13]/20 text-[#ec5b13] hover:bg-[#ec5b13]/30 transition-colors"
                                    >
                                        <Plus size={14} />
                                    </button>
                                </div>
                            </div>

                            <div className="flex justify-between items-end pt-2">
                                <span className="text-sm font-bold uppercase tracking-widest text-slate-500 pb-2">Reste à payer</span>
                                <div className="text-right">
                                    <span className={`text-4xl font-black tracking-tight whitespace-nowrap ${(Number(currentOrder.totalAmount) - remise - (montantRecu === "" ? (Number(currentOrder.totalAmount) - remise) : Number(montantRecu))) > 0 ? 'text-red-500' : 'text-[#ec5b13]'}`}>
                                        {formatCurrency(Math.max(0, Number(currentOrder.totalAmount) - remise - (montantRecu === "" ? (Number(currentOrder.totalAmount) - remise) : Number(montantRecu))), 'DZD')}
                                    </span>
                                    <span className="text-xl font-bold ml-1 opacity-50">DZD</span>
                                </div>
                            </div>
                        </div>

                        {/* Payment Actions */}
                        {currentOrder.status === 'EN_ATTENTE' && (
                            <div className="grid gap-4 mt-8 shrink-0 pb-2 grid-cols-1">
                                <button
                                    onClick={() => handleEncaisser()}
                                    disabled={isUpdating}
                                    className="flex flex-col items-center justify-center gap-2 p-5 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-lg shadow-emerald-500/20 hover:scale-[1.02] active:scale-100 transition-transform disabled:opacity-50"
                                >
                                    {isUpdating ? <Spinner size="sm" color="white" /> : (
                                        <>
                                            <span className="material-symbols-outlined text-3xl">payments</span>
                                            <span className="text-xs font-bold uppercase tracking-tighter">Encaisser Espèces</span>
                                        </>
                                    )}
                                </button>

                                {/* Traiteur Notification Button */}
                                <button
                                    onClick={() => handleNotifyTraiteur()}
                                    disabled={isUpdating}
                                    className="flex items-center justify-center gap-2 p-4 rounded-xl bg-orange-500/10 text-orange-500 border border-orange-500/20 hover:bg-orange-500/20 active:scale-95 transition-all disabled:opacity-50"
                                >
                                    {isUpdating ? <Spinner size="sm" color="warning" /> : (
                                        <>
                                            <span className="material-symbols-outlined">chef_hat</span>
                                            <span className="text-[10px] font-black uppercase">Envoyer au Traiteur</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-400">
                        <span className="material-symbols-outlined text-6xl mb-4 opacity-20">receipt_long</span>
                        <p className="font-semibold">Sélectionnez une commande pour voir les détails</p>
                    </div>
                )}
            </section>

            <OrderDetailModal
                isOpen={isDetailModalOpen}
                onClose={() => setIsDetailModalOpen(false)}
                order={orderForDetail}
                onRefund={async (id) => {
                    const res = await refundFullOrder({ id, returnToStock: true });
                    if (res.success) {
                        setIsDetailModalOpen(false);
                        loadOrders();
                    }
                }}
                onReplaceCode={async (orderItemId, codeId, type, reason) => {
                    const res = await replaceOrderItemCode({
                        orderItemId,
                        oldCodeId: type === 'standard' ? codeId : undefined,
                        oldSlotId: type === 'slot' ? codeId : undefined,
                        reason
                    });
                    if (res.success) loadOrders();
                }}
                onRefundItem={async (orderItemId, returnToStock) => {
                    const res = await refundOrderItem({ orderItemId, returnToStock });
                    if (res.success) loadOrders();
                }}
                onReprint={async () => {
                    if (!orderForDetail) return;
                    const enrichedItems = orderForDetail.items.map((it: any) => {
                        const standard = (it.fullCodes || []).map((c: any) => c.code);
                        const slots = (it.fullSlots || []).map((s: any) => `${s.parentCode} | Profil ${s.slotNumber}`);
                        return {
                            name: it.name,
                            quantity: it.quantity,
                            price: it.price,
                            codes: [...standard, ...slots],
                            customData: it.customData,
                            playerNickname: it.playerNickname
                        };
                    });

                    const dataToPrint = {
                        id: orderForDetail.id,
                        orderNumber: orderForDetail.orderNumber,
                        date: orderForDetail.createdAt,
                        items: enrichedItems,
                        totalAmount: orderForDetail.totalAmount,
                        remise: orderForDetail.remise,
                        paymentMethod: orderForDetail.paymentMethod || "Espèces",
                        cashier: user?.nom || "Admin"
                    };

                    await handlePrint(dataToPrint);
                }}
            />

            {/* Initiate Return Modal */}
            {orderForInitiateReturn && (
                <InitiateReturnModal
                    isOpen={!!orderForInitiateReturn}
                    onClose={() => { setOrderForInitiateReturn(null); loadOrders(true); }}
                    order={{
                        id: orderForInitiateReturn.id,
                        orderNumber: orderForInitiateReturn.orderNumber,
                        totalAmount: orderForInitiateReturn.totalAmount,
                        remise: orderForInitiateReturn.remise,
                        clientId: orderForInitiateReturn.clientId ?? null,
                        status: orderForInitiateReturn.status,
                    }}
                />
            )}

            {/* Approve/Reject Return Modal */}
            {orderForApproveReturn && (orderForApproveReturn as any).returnRequest && (
                <ApproveReturnModal
                    isOpen={!!orderForApproveReturn}
                    onClose={() => { setOrderForApproveReturn(null); loadOrders(true); }}
                    order={{
                        id: orderForApproveReturn.id,
                        orderNumber: orderForApproveReturn.orderNumber,
                        returnRequest: (orderForApproveReturn as any).returnRequest,
                        clientName: orderForApproveReturn.clientId ? `Client #${orderForApproveReturn.clientId}` : undefined,
                    }}
                />
            )}

            <RefundOrderModal
                isOpen={isRefundModalOpen}
                onClose={() => {
                    setIsRefundModalOpen(false);
                    setOrderToRefund(null);
                }}
                onSuccess={() => loadOrders()}
                order={orderToRefund ? {
                    id: orderToRefund.id,
                    orderNumber: orderToRefund.orderNumber,
                    montantPaye: orderToRefund.montantPaye || orderToRefund.totalAmount,
                    items: (orderToRefund.items || []).map((item: any) => ({
                        id: item.id,
                        name: item.name,
                        quantity: item.quantity,
                        price: item.price,
                    }))
                } : null}
            />

            {/* Auto New Client Modal */}
            <Modal
                isOpen={isCreatingClient}
                onClose={() => setIsCreatingClient(false)}
                classNames={{ base: "bg-[#161616] text-white border border-[#262626]" }}
            >
                <ModalContent>
                    {(onClose) => {
                        const innerSave = async () => {
                            if (!newClientName) return;
                            try {
                                const res: any = await createClient({ nom: newClientName, telephone: newClientPhone });
                                if (res.success && res.client) {
                                    const newC = res.client;
                                    // Refresh list
                                    const clientsRes: any = await getAllClients({});
                                    setAllClients(Array.isArray(clientsRes) ? clientsRes : []);
                                    setSelectedClientId(newC.id);

                                    // AUTO VALIDATE TRANSACTION
                                    await handleEncaisser(newC.id);

                                    setIsCreatingClient(false);
                                    setNewClientName("");
                                    setNewClientPhone("");
                                } else {
                                    toast.error(res.error || "Erreur création client");
                                }
                            } catch (e) { toast.error("Erreur création client"); }

                        };

                        return (
                            <>
                                <ModalHeader className="flex flex-col gap-1">
                                    <h3 className="text-xl font-bold">Nouveau Profil Client</h3>
                                    <p className="text-xs text-slate-400">Requis pour enregistrer un crédit</p>
                                </ModalHeader>
                                <ModalBody className="gap-4">
                                    <div className="space-y-4">
                                        <div className="flex flex-col gap-2">
                                            <span className="text-[10px] uppercase font-bold text-slate-500">Nom Complet</span>
                                            <input
                                                autoFocus
                                                className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl p-3 text-sm focus:border-[#ec5b13] outline-none transition-colors"
                                                placeholder="Ex: Ahmed Ben"
                                                value={newClientName}
                                                onChange={(e) => setNewClientName(e.target.value)}
                                            />
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <span className="text-[10px] uppercase font-bold text-slate-500">Téléphone (Optionnel)</span>
                                            <input
                                                className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl p-3 text-sm focus:border-[#ec5b13] outline-none transition-colors"
                                                placeholder="0X XX XX XX XX"
                                                value={newClientPhone}
                                                onChange={(e) => setNewClientPhone(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </ModalBody>
                                <ModalFooter>
                                    <Button variant="flat" onPress={onClose} className="text-slate-400">Ignorer</Button>
                                    <Button
                                        className="bg-[#ec5b13] text-white font-bold px-8"
                                        onPress={innerSave}
                                    >
                                        Valider & Sélectionner
                                    </Button>
                                </ModalFooter>
                            </>
                        );
                    }}
                </ModalContent>
            </Modal>

            {/* Hidden Print Container - Sync source for hook */}
            <div
                id="thermal-receipt-source"
                className="fixed -top-[9999px] -left-[9999px] opacity-0 pointer-events-none text-black bg-white"
                aria-hidden="true"
            >
            </div>
        </main>
    );
}
