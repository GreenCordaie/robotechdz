"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Spinner } from "@heroui/react";
import { toast } from "react-hot-toast";
import { getPaidOrders, getFinishedOrders, processOrder, markOrderAsTermine, cancelOrderAction, resendWhatsAppAction } from "../caisse/actions";
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
import { Wifi, WifiOff, Usb, Loader2, MessageSquare } from "lucide-react";

export default function TraitementContent() {
    const [view, setView] = useState<"pending" | "finished">("pending");
    const [orders, setOrders] = useState<any[]>([]);
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

    const loadOrders = useCallback(async () => {
        setIsLoading(true);
        try {
            const res: any = view === "pending" ? await getPaidOrders({}) : await getFinishedOrders({});
            if (res && res.success === false) {
                toast.error("Erreur de sécurité : " + res.error);
                setOrders([]);
            } else {
                setOrders(Array.isArray(res) ? res : []);
            }
        } catch (error) {
            console.error("Load failed:", error);
            setOrders([]);
        } finally {
            setIsLoading(false);
        }
    }, [view]);

    useEffect(() => {
        loadOrders();
        const interval = setInterval(async () => {
            const res: any = view === "pending" ? await getPaidOrders({}) : await getFinishedOrders({});
            const data = Array.isArray(res) ? res : [];

            // Visual Notification for New Arrivals
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
            }

            setOrders(data);

            // Auto-Print Logic for Webhook-delivered orders
            if (view === "pending") {
                const orderToPrint = data.find((o: any) => o.status === "LIVRE" && !processedIds.current.has(o.id));
                if (orderToPrint) {
                    processedIds.current.add(orderToPrint.id);
                    toast.success(`Impression automatique : ${orderToPrint.orderNumber}`, { icon: '🖨️' });
                    setOrderForDetail(orderToPrint);
                    setShouldPrint(true);
                }
            }
        }, 3000);
        return () => clearInterval(interval);
    }, [view, loadOrders]);

    // Consolidated Effect for Auto-Print trigger (Robust Hybrid Mode)
    useEffect(() => {
        if (shouldPrint && orderForDetail) {
            const triggerPrint = async () => {
                // Prepare data for ESC/POS with cashier info
                const printData = {
                    ...orderForDetail,
                    cashier: user?.nom || "Admin"
                };

                // Strategy 1: WebUSB (Direct)
                if (webusb.connected) {
                    try {
                        const buffer = generateOrderEscPos(printData, settings);
                        const success = await webusb.print(buffer);
                        if (success) {
                            toast.success(`Ticket imprimé (USB) : ${orderForDetail.orderNumber}`, { icon: '⚡' });
                        } else {
                            throw new Error("USB failure");
                        }
                    } catch (err) {
                        console.warn("WebUSB failed, fallback to Iframe", err);
                        // Fallback logic handled below
                    }
                }

                // Strategy 2: Iframe Fallback (Standard)
                if (!webusb.connected) {
                    const printContent = document.getElementById('thermal-receipt-source');
                    if (printContent) {
                        const success = printToIframe(orderForDetail.orderNumber, printContent.innerHTML);
                        if (success) {
                            toast.success(`Impression envoyée : ${orderForDetail.orderNumber}`, { icon: '🖨️' });
                        }
                    }
                }

                setShouldPrint(false);
                if (orderForDetail.status === "LIVRE") {
                    markOrderAsTermine({ id: orderForDetail.id }).then(() => loadOrders());
                }
            };

            const timer = setTimeout(triggerPrint, 500);
            return () => clearTimeout(timer);
        }
    }, [shouldPrint, orderForDetail, loadOrders, printToIframe, webusb, settings, user]);

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
                setShouldPrint(true);
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
        if (!confirm("Êtes-vous sûr de vouloir annuler/rembourser cette commande ? Cette action est irréversible et libérera les codes digitaux associés.")) return;

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
    };

    const filteredOrders = orders.filter(o =>
        o.orderNumber.toLowerCase().includes(searchTerm.toLowerCase())
    );

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
        <div className="flex h-[calc(100vh-64px)] w-full overflow-hidden bg-[#1a0f0a] mx-[-32px] my-[-32px] font-sans antialiased">
            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #4b2e24; border-radius: 10px; }
            `}</style>

            <main className="flex-1 flex flex-col min-w-0 bg-[#1a0f0a]/95">
                {/* Header */}
                <header className="h-20 border-b border-[#ec5b13]/10 px-8 flex items-center justify-between shrink-0">
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
                                className="w-full bg-[#2a1b15] border-none rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-[#ec5b13]/50 text-slate-200 outline-none"
                                placeholder="Rechercher une commande..."
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-2 bg-[#2a1b15] p-1 rounded-xl">
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

                        {/* WebUSB Hardware Status */}
                        <div className="flex items-center gap-3 pl-4 border-l border-[#ec5b13]/20">
                            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${webusb.connected
                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                : "bg-red-500/10 border-red-500/20 text-red-400"
                                }`}>
                                <div className={`size-2 rounded-full ${webusb.connected ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
                                <span className="text-[10px] font-bold uppercase tracking-widest leading-none">
                                    {webusb.connected ? "Imprimante prête" : "Hors ligne"}
                                </span>
                            </div>

                            <button
                                onClick={webusb.connected ? webusb.disconnect : webusb.connect}
                                disabled={webusb.isConnecting}
                                className={`h-9 px-4 rounded-xl flex items-center gap-2 text-xs font-bold transition-all shadow-lg active:scale-95 ${webusb.connected
                                    ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                                    : "bg-[#ec5b13] text-white hover:bg-orange-600 shadow-orange-950/20"
                                    }`}
                            >
                                {webusb.isConnecting ? <Loader2 className="size-4 animate-spin" /> : <Usb className="size-4" />}
                                {webusb.connected ? "Déconnecter" : "Connecter USB"}
                            </button>
                        </div>
                    </div>
                </header>

                {/* Dual Column Layout */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Left Column: Queue */}
                    <section className="w-96 flex flex-col border-r border-[#ec5b13]/5 shrink-0">
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
                                        : "bg-[#2a1b15]/40 border-white/5 hover:border-[#ec5b13]/20"
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
                        {
                            selectedOrder ? (
                                <div className="flex-1 flex flex-col min-w-0">
                                    <div className="p-8 border-b border-white/5 shrink-0 flex justify-between items-center">
                                        <div>
                                            <h4 className="text-2xl font-bold tracking-tight mb-1">Détails de la Commande {selectedOrder.orderNumber}</h4>
                                            <p className="text-slate-500 text-sm flex items-center gap-2">
                                                <span className="material-symbols-outlined text-sm">calendar_today</span>
                                                {new Date(selectedOrder.createdAt).toLocaleDateString("fr-FR", { day: 'numeric', month: 'long', year: 'numeric' })} • {new Date(selectedOrder.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            {selectedOrder.deliveryMethod === "whatsapp" && (
                                                <button
                                                    onClick={() => handleResendWhatsApp(selectedOrder.id)}
                                                    disabled={isResending}
                                                    title="Renvoyer par WhatsApp"
                                                    className="p-2.5 rounded-xl bg-[#25D366]/10 border border-[#25D366]/20 text-[#25D366] hover:bg-[#25D366]/20 transition-all disabled:opacity-50"
                                                >
                                                    {isResending ? <Loader2 className="size-5 animate-spin" /> : <MessageSquare size={20} />}
                                                </button>
                                            )}
                                            <button
                                                onClick={async () => {
                                                    // Robust Reprint Logic
                                                    if (webusb.connected) {
                                                        const printData = { ...selectedOrder, cashier: user?.nom || "Admin" };
                                                        const buffer = generateOrderEscPos(printData, settings);
                                                        await webusb.print(buffer);
                                                        toast.success("Réimpression USB lancée");
                                                    } else {
                                                        const printContent = document.getElementById('thermal-receipt-source');
                                                        if (printContent) {
                                                            printToIframe(selectedOrder.orderNumber, printContent.innerHTML);
                                                            toast.success("Impression demandée...");
                                                        }
                                                    }
                                                }}
                                                className="p-2.5 rounded-xl bg-[#2a1b15] border border-white/5 text-slate-400 hover:text-white transition-colors"
                                            >
                                                <span className="material-symbols-outlined">print</span>
                                            </button>
                                            <button className="p-2.5 rounded-xl bg-[#2a1b15] border border-white/5 text-slate-400 hover:text-red-400 transition-colors" onClick={() => setSelectedOrder(null)}>
                                                <span className="material-symbols-outlined">block</span>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                                        {selectedOrder.items.map((item: any) => (
                                            <div key={item.id} className="space-y-4">
                                                <div className="flex justify-between items-center">
                                                    <div className="flex items-center gap-4">
                                                        <div className={`size-14 rounded-2xl flex items-center justify-center border ${item.name.toLowerCase().includes('psn') ? 'bg-blue-600/20 text-blue-400 border-blue-600/30' : 'bg-red-600/20 text-red-500 border-red-600/30'}`}>
                                                            <span className="material-symbols-outlined text-3xl">{getProductIcon(item.name)}</span>
                                                        </div>
                                                        <div>
                                                            <h5 className="font-bold text-lg">{item.name}</h5>
                                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                                                                <p className="text-slate-500 text-sm">Quantité: <span className="text-white font-medium">{item.quantity}</span></p>
                                                                {item.customData && (
                                                                    <span className="text-[10px] text-[#ec5b13] font-black uppercase tracking-widest border-l border-white/10 pl-3">ID: {item.customData}</span>
                                                                )}
                                                                {item.playerNickname && (
                                                                    <span className="text-[10px] text-emerald-500 font-black uppercase tracking-widest border-l border-white/10 pl-3">PSEUDO: {item.playerNickname}</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <p className="text-xl font-bold whitespace-nowrap text-[#ec5b13]">{formatCurrency(item.price, 'DZD')}</p>
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-18">
                                                    {Array.from({ length: item.quantity }).map((_, i) => {
                                                        const isPreassigned = item.codes && item.codes[i];
                                                        return (
                                                            <div key={i} className="relative">
                                                                <div className={`absolute inset-y-0 left-0 w-1 ${isPreassigned ? 'bg-emerald-500' : 'bg-[#ec5b13]/40'} rounded-full`}></div>
                                                                <input
                                                                    className={`w-full bg-[#2a1b15] border-white/5 rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-[#ec5b13] focus:border-[#ec5b13] outline-none text-white placeholder:text-slate-600 transition-all ${isPreassigned ? 'opacity-60 cursor-not-allowed border-emerald-500/30' : ''}`}
                                                                    placeholder={isPreassigned ? "Code automatique assigné" : `Entrez le code #${i + 1} pour ${item.name}...`}
                                                                    type="text"
                                                                    value={codes[`${item.id}-${i}`] || ""}
                                                                    onChange={(e) => handleCodeChange(item.id, i, e.target.value)}
                                                                    disabled={view === "finished" || isPreassigned}
                                                                />
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}

                                        <div className="mt-12 p-6 rounded-2xl bg-[#2a1b15]/30 border border-white/5 space-y-3">
                                            <div className="flex justify-between text-slate-400 text-sm">
                                                <span>Validation des codes</span>
                                                <span>{Object.keys(codes).length} injectés</span>
                                            </div>
                                            <div className="pt-3 border-t border-white/5 flex justify-between items-center text-white">
                                                <span className="font-bold text-lg">Total à valider</span>
                                                <span className="text-2xl font-black">{formatCurrency(selectedOrder.totalAmount, 'DZD')}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {view === "pending" && (
                                        <footer className="p-8 border-t border-white/5 shrink-0 bg-[#1a0f0a]">
                                            <button
                                                onClick={handleProcess}
                                                disabled={!isOrderReady() || isProcessing}
                                                className={`w-full font-bold py-4 rounded-2xl shadow-xl transition-all flex items-center justify-center gap-3 active:scale-[0.98] ${isOrderReady() ? 'bg-gradient-to-r from-[#ec5b13] to-orange-600 text-white shadow-[#ec5b13]/20 hover:from-[#ec5b13] hover:to-[#ec5b13]' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
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
                                    <div className="size-48 rounded-[64px] bg-[#2a1b15]/40 border border-white/5 flex items-center justify-center mb-10 shadow-2xl relative overflow-hidden">
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

            {/* Optimized Print Container (Off-screen source for the Iframe printer fallback) */}
            {(selectedOrder || orderForDetail) && (
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
                            customData: item.customData,
                            playerNickname: item.playerNickname,
                            codes: selectedOrder
                                ? Array.from({ length: item.quantity }, (_, i) => codes[`${item.id}-${i}`]).filter(Boolean)
                                : item.codes
                        })) || []}
                        totalAmount={selectedOrder?.totalAmount || orderForDetail?.totalAmount}
                        paymentMethod={(selectedOrder || orderForDetail)?.paymentMethod}
                    />
                </div>
            )}

            <OrderDetailModal
                isOpen={isDetailModalOpen}
                onClose={() => setIsDetailModalOpen(false)}
                order={orderForDetail}
                onRefund={() => handleCancelOrder(orderForDetail.id)}
                onReprint={async () => {
                    if (webusb.connected) {
                        const printData = { ...orderForDetail, cashier: user?.nom || "Admin" };
                        const buffer = generateOrderEscPos(printData, settings);
                        await webusb.print(buffer);
                        toast.success("Réimpression USB lancée");
                    } else {
                        const printContent = document.getElementById('thermal-receipt-source');
                        if (printContent) {
                            toast.loading("Lancement réimpression...", { duration: 2000 });
                            printToIframe(orderForDetail.orderNumber, printContent.innerHTML);
                        }
                    }
                }}
            />
        </div>
    );
}
