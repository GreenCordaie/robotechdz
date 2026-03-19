"use client";

import React, { useState, useEffect } from "react";
import { Spinner, Button, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/react";
import { useOrderStore } from "@/store/useOrderStore";
import { useAuthStore } from "@/store/useAuthStore";
import { toast } from "react-hot-toast";
import { Eye, Search, Filter, ArrowLeft, RefreshCw, Smartphone, User as UserIcon, Plus, Usb, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { useThermalPrinter } from "@/hooks/useThermalPrinter";
import { useWebUSBPrinter } from "@/hooks/useWebUSBPrinter";
import { generateOrderEscPos } from "@/lib/escpos";
import { useSettingsStore } from "@/store/useSettingsStore";
import { ThermalReceiptV2 } from "@/components/admin/receipt/ThermalReceiptV2";
import OrderDetailModal from "@/components/admin/modals/OrderDetailModal";
import { getAllClients, createClient } from "../clients/actions";
import { refundFullOrder, replaceOrderItemCode, refundOrderItem, payOrder, getTodayOrders, cancelOrderAction } from "./actions";

export default function CaisseMobile() {
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
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [orderForDetail, setOrderForDetail] = useState<any | null>(null);
    const [isCreatingClient, setIsCreatingClient] = useState(false);
    const [newClientName, setNewClientName] = useState("");
    const [newClientPhone, setNewClientPhone] = useState("");
    const [allClients, setAllClients] = useState<any[]>([]);
    const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
    const [itemSuppliers, setItemSuppliers] = useState<Record<number, number>>({});
    const [printData, setPrintData] = useState<any>(null);
    const [lastReloadTime, setLastReloadTime] = useState<Date>(new Date());
    const { printToIframe } = useThermalPrinter();

    const settings = useSettingsStore();
    const webusb = useWebUSBPrinter();

    const handlePrint = async (data: any) => {
        // Strategy 1: High-Performance WebUSB
        if (webusb.connected) {
            try {
                const buffer = generateOrderEscPos(data, settings);
                await webusb.print(buffer);
                toast.success(`Ticket USB : #${data.orderNumber}`, { icon: '⚡' });
                return;
            } catch (error) {
                console.error("Mobile Caisse USB Print fail:", error);
                toast.error("Échec USB, basculement mode standard...");
            }
        }

        // Strategy 2: Standard Iframe Fallback
        setTimeout(() => {
            const printContent = document.getElementById('thermal-receipt-source');
            if (printContent) {
                printToIframe(data.orderNumber, printContent.innerHTML);
                toast.success(`Impression : #${data.orderNumber}`);
            }
        }, 500);
    };

    useEffect(() => {
        if (printData) {
            handlePrint(printData);
            setPrintData(null);
        }
    }, [printData]);

    const loadOrders = async (silent = false) => {
        if (!silent) setIsLoading(true);
        try {
            const res: any = await getTodayOrders({});
            if (res && res.success !== false) {
                setAllTodayOrders(Array.isArray(res) ? res : []);
                setLastReloadTime(new Date());
            }
        } catch (error) {
            console.error("Orders load failed:", error);
        } finally {
            if (!silent) setIsLoading(false);
        }
    };

    useEffect(() => {
        loadOrders();
        const loadClients = async () => {
            const res: any = await getAllClients({});
            setAllClients(Array.isArray(res) ? res : []);
        };
        loadClients();
        const interval = setInterval(() => loadOrders(true), 10000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (currentOrder) {
            setRemise(0);
            setMontantRecu(Number(currentOrder.totalAmount));
            setSelectedClientId(null);
            const initialSuppliers: Record<number, number> = {};
            (currentOrder.items as any[]).forEach(item => {
                if (item.variant?.variantSuppliers?.length > 0) {
                    const cheapest = [...item.variant.variantSuppliers].sort((a, b) =>
                        parseFloat(a.purchasePrice) - parseFloat(b.purchasePrice)
                    )[0];
                    initialSuppliers[item.id] = cheapest.supplierId;
                }
            });
            setItemSuppliers(initialSuppliers);
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
            const res: any = await payOrder({
                id: currentOrder.id,
                options: {
                    remise,
                    montantPaye: effectiveRecu,
                    clientId: finalClientId || undefined,
                    itemSuppliers
                }
            });
            if (res.success && res.order) {
                toast.success(`Encaissé ! #${currentOrder.orderNumber}`);

                if (res.order.deliveryMethod === "TICKET") {
                    const hasManual = res.order.items?.some((it: any) => it.variant?.product?.isManualDelivery);
                    if (!hasManual) {
                        setPrintData({
                            orderNumber: res.order.orderNumber,
                            date: res.order.createdAt,
                            items: (res.order.items || []).map((it: any) => ({
                                name: it.name,
                                quantity: it.quantity,
                                price: it.price,
                                codes: it.codes,
                                customData: it.customData,
                                playerNickname: it.playerNickname
                            })),
                            totalAmount: res.order.totalAmount,
                            paymentMethod: effectiveRecu >= (Number(res.order.totalAmount) - Number(res.order.remise)) ? "Espèces" : "Crédit / Partiel"
                        });
                    }
                }

                setCurrentOrder(null);
                loadOrders();
            } else {
                toast.error(res.error);
            }
        } catch (e) {
            toast.error("Erreur technique");
        } finally {
            setIsUpdating(false);
            if (clientIdOverride) setIsCreatingClient(false);
        }
    };

    const statusMap: Record<string, string> = {
        "Toutes": "ALL",
        "En attente": "EN_ATTENTE",
        "Payées": "PAYE",
        "Dettes": "NON_PAYE"
    };

    const filteredOrders = allTodayOrders.filter(o => {
        const matchesSearch = o.orderNumber.toLowerCase().includes(searchQuery.toLowerCase());
        if (!matchesSearch) return false;
        if (filterStatus === "Toutes") return true;
        return o.status === statusMap[filterStatus];
    });

    const getStatusColor = (status: string) => {
        switch (status) {
            case "EN_ATTENTE": return "text-amber-500 bg-amber-500/10";
            case "PAYE": return "text-emerald-500 bg-emerald-500/10";
            case "NON_PAYE": return "text-red-500 bg-red-500/10";
            default: return "text-slate-500 bg-slate-500/10";
        }
    };

    return (
        <div className="flex flex-col min-h-screen bg-[#0a0a0a] text-white">
            {/* Header */}
            <header className="p-4 border-b border-white/5 flex items-center justify-between sticky top-0 bg-[#0a0a0a]/80 backdrop-blur-md z-30">
                <div>
                    <h1 className="text-xl font-black tracking-tight text-[#ec5b13]">Caisse Mobile</h1>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{allTodayOrders.length} Commandes</p>
                </div>
                <div className="flex items-center gap-2">
                    {/* USB Status Indicator */}
                    <div className={`flex items-center gap-1 px-2 py-1 rounded bg-white/5 border text-[7px] font-black uppercase transition-all ${webusb.connected ? "border-emerald-500/30 text-emerald-400" : "border-white/10 text-slate-500"
                        }`}>
                        <div className={`size-1 rounded-full ${webusb.connected ? "bg-emerald-400 animate-pulse" : "bg-slate-600"}`} />
                        {webusb.connected ? "USB Prêt" : "Standard"}
                    </div>

                    <button
                        onClick={webusb.connected ? webusb.disconnect : webusb.connect}
                        disabled={webusb.isConnecting}
                        className={`p-2 rounded-full transition-all active:scale-95 ${webusb.connected ? "bg-zinc-800 text-slate-400" : "bg-[#ec5b13]/10 text-[#ec5b13]"
                            }`}
                    >
                        {webusb.isConnecting ? <Loader2 size={18} className="animate-spin" /> : <Usb size={18} />}
                    </button>

                    <button onClick={() => loadOrders()} className="p-2 bg-white/5 rounded-full text-slate-400">
                        <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
                    </button>
                </div>
            </header>

            {/* Content Switcher */}
            {currentOrder ? (
                /* Detail/Checkout View */
                <main className="flex-1 p-4 space-y-6 pb-32">
                    <button
                        onClick={() => setCurrentOrder(null)}
                        className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
                    >
                        <ArrowLeft size={20} />
                        <span className="font-bold text-sm">Retour à la liste</span>
                    </button>

                    <div className="bg-white/5 rounded-3xl p-6 border border-white/10">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h2 className="text-2xl font-black">#{currentOrder.orderNumber}</h2>
                                <p className="text-xs text-slate-500">{currentOrder.createdAt ? new Date(currentOrder.createdAt).toLocaleString() : ""}</p>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${getStatusColor(currentOrder.status)}`}>
                                {currentOrder.status}
                            </span>
                        </div>

                        <div className="space-y-4 mb-8">
                            {currentOrder.items?.map((item: any, idx: number) => {
                                const linkedSuppliers = item.variant?.variantSuppliers || [];
                                return (
                                    <div key={idx} className="p-3 bg-white/5 rounded-2xl border border-white/5 space-y-3">
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="font-bold">{item.quantity}x {item.name}</span>
                                            <span className="font-black text-emerald-500">{formatCurrency(item.price * item.quantity, 'DZD')}</span>
                                        </div>
                                        {linkedSuppliers.length > 0 && (
                                            <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                                                <span className="text-[9px] font-bold text-slate-500 uppercase">Via:</span>
                                                <select
                                                    className="flex-1 bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white outline-none"
                                                    value={itemSuppliers[item.id] || ""}
                                                    onChange={(e) => setItemSuppliers(prev => ({ ...prev, [item.id]: parseInt(e.target.value) }))}
                                                >
                                                    {linkedSuppliers.map((ls: any) => (
                                                        <option key={ls.supplier.id} value={ls.supplier.id}>
                                                            {ls.supplier.name} ({formatCurrency(ls.purchasePrice, ls.currency)})
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="space-y-4 pt-4 border-t border-white/10">
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400">Total à payer</span>
                                <span className="text-2xl font-black text-[#ec5b13]">{formatCurrency(currentOrder.totalAmount, 'DZD')}</span>
                            </div>

                            {currentOrder.status === 'EN_ATTENTE' && (
                                <div className="space-y-4 pt-4">
                                    <div className="flex gap-2">
                                        <Button
                                            size="sm"
                                            className="flex-1 bg-emerald-500/10 text-emerald-500 font-black text-[10px] uppercase"
                                            onPress={() => setMontantRecu(Number(currentOrder.totalAmount) - remise)}
                                        >
                                            Total
                                        </Button>
                                        <Button
                                            size="sm"
                                            className="flex-1 bg-red-500/10 text-red-500 font-black text-[10px] uppercase"
                                            onPress={() => setMontantRecu(0)}
                                        >
                                            Dette
                                        </Button>
                                    </div>

                                    {/* Client Selector */}
                                    <div className="p-3 bg-white/5 rounded-2xl border border-white/10 space-y-2">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1">
                                                <UserIcon size={10} /> Client (Optionnel)
                                            </span>
                                            {selectedClientId && (
                                                <button onClick={() => setSelectedClientId(null)} className="text-[10px] text-red-500 font-bold uppercase">Annuler</button>
                                            )}
                                        </div>
                                        <div className="flex gap-2 text-white">
                                            <select
                                                className="bg-transparent border-none text-sm font-bold flex-1 outline-none appearance-none"
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
                                                className="p-1 rounded bg-[#ec5b13]/20 text-[#ec5b13]"
                                            >
                                                <Plus size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    <button
                                        disabled={isUpdating}
                                        onClick={() => handleEncaisser()}
                                        className="w-full py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-2xl font-black uppercase text-sm shadow-xl shadow-emerald-500/20 active:scale-95 transition-transform disabled:opacity-50"
                                    >
                                        {isUpdating ? <Spinner size="sm" color="white" /> : "Valider le Paiement"}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </main>
            ) : (
                /* List View */
                <main className="flex-1 p-4">
                    <div className="mb-6 space-y-4">
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                            <input
                                type="text"
                                placeholder="Rechercher #..."
                                className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 outline-none focus:border-[#ec5b13]/50 transition-all font-bold placeholder:text-slate-600"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                            {["Toutes", "En attente", "Payées", "Dettes"].map((s) => (
                                <button
                                    key={s}
                                    onClick={() => setFilterStatus(s)}
                                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all whitespace-nowrap ${filterStatus === s ? "bg-[#ec5b13] text-white shadow-lg shadow-[#ec5b13]/20" : "bg-white/5 text-slate-500"
                                        }`}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-3">
                        {isLoading && allTodayOrders.length === 0 ? (
                            <div className="flex justify-center py-20"><Spinner color="warning" /></div>
                        ) : filteredOrders.map((o) => (
                            <div
                                key={o.id}
                                onClick={() => setCurrentOrder(o)}
                                className="p-4 bg-white/5 border border-white/10 rounded-2xl active:scale-[0.98] transition-all flex justify-between items-center"
                            >
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-black text-lg">#{o.orderNumber}</span>
                                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase ${getStatusColor(o.status)}`}>
                                            {o.status === "EN_ATTENTE" ? "À Encaisser" : o.status}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase">
                                        {new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                </div>
                                <div className="text-right flex items-center gap-3">
                                    <div>
                                        <p className="font-black text-[#ec5b13] text-lg leading-none">{formatCurrency(o.totalAmount, 'DZD')}</p>
                                        <p className="text-[9px] text-slate-500 font-bold mt-1 uppercase">{o.items?.length} article(s)</p>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setOrderForDetail(o);
                                            setIsDetailModalOpen(true);
                                        }}
                                        className="p-2 bg-white/5 rounded-xl text-primary"
                                    >
                                        <Eye size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </main>
            )}

            <OrderDetailModal
                isOpen={isDetailModalOpen}
                onClose={() => setIsDetailModalOpen(false)}
                order={orderForDetail}
                onRefund={async (id) => {
                    const res = await refundFullOrder({ id, returnToStock: false });
                    if (res.success) {
                        setIsDetailModalOpen(false);
                        loadOrders();
                    }
                }}
                onReplaceCode={async (orderItemId, codeId, type, reason) => {
                    const res = await replaceOrderItemCode({ orderItemId, oldCodeId: type === 'standard' ? codeId : undefined, oldSlotId: type === 'slot' ? codeId : undefined, reason });
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
                        return { name: it.name, quantity: it.quantity, price: it.price, codes: [...standard, ...slots], customData: it.customData, playerNickname: it.playerNickname };
                    });

                    const dataToPrint = {
                        orderNumber: orderForDetail.orderNumber,
                        date: orderForDetail.createdAt,
                        items: enrichedItems,
                        totalAmount: orderForDetail.totalAmount,
                        paymentMethod: orderForDetail.paymentMethod || "Espèces",
                        cashier: user?.nom || "Admin"
                    };

                    if (webusb.connected) {
                        try {
                            const buffer = generateOrderEscPos(dataToPrint, settings);
                            await webusb.print(buffer);
                            toast.success("Réimpression USB OK", { icon: '⚡' });
                        } catch (e) {
                            console.error("Caisse Mobile Reprini USB fail:", e);
                            toast.error("Erreur USB");
                        }
                    } else {
                        const printContent = document.getElementById('thermal-receipt-source');
                        if (printContent) {
                            toast.loading("Lancement réimpression...", { duration: 2000 });
                            printToIframe(orderForDetail.orderNumber, printContent.innerHTML);
                        }
                    }
                }}
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
                                    const clientsRes: any = await getAllClients({});
                                    setAllClients(Array.isArray(clientsRes) ? clientsRes : []);
                                    setSelectedClientId(newC.id);
                                    await handleEncaisser(newC.id);
                                    setIsCreatingClient(false);
                                    setNewClientName("");
                                    setNewClientPhone("");
                                }
                            } catch (e) { toast.error("Erreur creation client"); }
                        };
                        return (
                            <>
                                <ModalHeader>Nouveau Client</ModalHeader>
                                <ModalBody>
                                    <div className="space-y-4">
                                        <input
                                            className="w-full bg-black border border-white/10 rounded-xl p-3 text-sm"
                                            placeholder="Nom Complet"
                                            value={newClientName}
                                            onChange={(e) => setNewClientName(e.target.value)}
                                        />
                                        <input
                                            className="w-full bg-black border border-white/10 rounded-xl p-3 text-sm"
                                            placeholder="Téléphone"
                                            value={newClientPhone}
                                            onChange={(e) => setNewClientPhone(e.target.value)}
                                        />
                                    </div>
                                </ModalBody>
                                <ModalFooter>
                                    <Button onPress={onClose} variant="flat">Ignorer</Button>
                                    <Button className="bg-[#ec5b13] text-white font-bold" onPress={innerSave}>Enregistrer & Payer</Button>
                                </ModalFooter>
                            </>
                        );
                    }}
                </ModalContent>
            </Modal>

            {/* Hidden Print Container - Standardized for Audit Reliability */}
            <div
                id="thermal-receipt-source"
                className="fixed -top-[9999px] -left-[9999px] opacity-0 pointer-events-none text-black bg-white"
                aria-hidden="true"
            >
                {printData && <ThermalReceiptV2 {...printData} />}
            </div>
        </div>
    );
}
