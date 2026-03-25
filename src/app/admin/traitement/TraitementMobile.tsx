"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Spinner, Button } from "@heroui/react";
import { toast } from "react-hot-toast";
import { getPaidOrders, getFinishedOrders, processOrder, markOrderAsTermine, cancelOrderAction, resendWhatsAppAction, requeueForPrint } from "../caisse/actions";
import { formatCurrency } from "@/lib/formatters";
import { useThermalPrinter } from "@/hooks/useThermalPrinter";
import { useWebUSBPrinter } from "@/hooks/useWebUSBPrinter";
import { generateOrderEscPos } from "@/lib/escpos";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useAuthStore } from "@/store/useAuthStore";
import { ThermalReceiptV2 } from "@/components/admin/receipt/ThermalReceiptV2";
import OrderDetailModal from "@/components/admin/modals/OrderDetailModal";
import { Search, RefreshCw, ArrowLeft, Send, CheckCircle2, History, Eye, Printer, XCircle, Usb, Loader2, Wifi, WifiOff, MessageSquare } from "lucide-react";
import Image from "next/image";

interface TraitementMobileProps {
    initialOrders?: any[];
    initialFinished?: any[];
}

export default function TraitementMobile({ initialOrders = [], initialFinished = [] }: TraitementMobileProps) {
    const [view, setView] = useState<"pending" | "finished">("pending");
    const [orders, setOrders] = useState<any[]>(initialOrders);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
    const [codes, setCodes] = useState<Record<string, string>>({});
    const [isProcessing, setIsProcessing] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [orderForDetail, setOrderForDetail] = useState<any | null>(null);
    const [shouldPrint, setShouldPrint] = useState(false);
    const processedIds = React.useRef<Set<number>>(new Set());
    const prevOrderIds = React.useRef<Set<number>>(new Set());
    const { printToIframe } = useThermalPrinter();
    const settings = useSettingsStore();
    const webusb = useWebUSBPrinter();
    const { user } = useAuthStore();
    const handlePrint = async (data: any) => {
        if (!data?.id) return;
        const res: any = await requeueForPrint({ orderId: data.id });
        if (res?.success) {
            toast.success(`🖨️ Ticket #${data.orderNumber} en file d'impression`);
        } else {
            toast.error(`🖨️ Erreur: ${res?.error || 'Impossible de mettre en file'}`);
        }
    };

    const loadOrders = useCallback(async () => {
        if (view === "pending" && orders.length === 0) setIsLoading(true);
        if (view === "finished" && orders.length === 0) setIsLoading(true);

        try {
            const res: any = view === "pending" ? await getPaidOrders({}) : await getFinishedOrders({});
            setOrders(Array.isArray(res) ? res : []);
        } catch (error) {
            console.error("Load failed:", error);
        } finally {
            setIsLoading(false);
        }
    }, [view, orders.length]);

    // Sync initial state on view change
    useEffect(() => {
        if (view === "pending") setOrders(initialOrders);
        else setOrders(initialFinished);
    }, [view, initialOrders, initialFinished]);

    useEffect(() => {
        const interval = setInterval(async () => {
            const res: any = view === "pending" ? await getPaidOrders({}) : await getFinishedOrders({});
            const data = Array.isArray(res) ? res : [];

            // Visual Notification for Mobile
            if (view === "pending") {
                const currentIds = new Set(data.map((o: any) => o.id));
                const newOrders = data.filter((o: any) => !prevOrderIds.current.has(o.id));

                if (newOrders.length > 0 && prevOrderIds.current.size > 0) {
                    newOrders.forEach((o: any) => {
                        toast.success(`NOUVELLE COMMANDE : ${o.orderNumber}`, {
                            icon: '🛎️',
                            duration: 5000,
                            position: 'top-center'
                        });
                    });
                }
                prevOrderIds.current = currentIds;
            }

            setOrders(data);

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

    const handleCancelOrder = async (orderId: number) => {
        if (!confirm("Annuler/Rembourser cette commande ?")) return;
        try {
            const res = await cancelOrderAction({ orderId });
            if (res.success) {
                toast.success("Commande annulée");
                setIsDetailModalOpen(false);
                loadOrders();
            }
        } catch (error) {
            toast.error("Erreur technique");
        }
    };

    const handleCodeChange = (itemId: string, index: number, value: string) => {
        setCodes(prev => ({ ...prev, [`${itemId}-${index}`]: value }));
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
                const flattened = {
                    ...res,
                    items: res.items.map((item: any) => ({
                        ...item,
                        codes: item.codes
                    }))
                };
                setOrderForDetail(flattened);
                // setShouldPrint(true); // Removed as processOrder now handles print status
                toast.success("Validation réussie !");
                loadOrders();
                setSelectedOrder(null);
                setCodes({});
            } else {
                toast.error(res.error || "Erreur lors du traitement");
            }
        } catch (error) {
            toast.error("Erreur technique");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleResendWhatsApp = async (orderId: number) => {
        try {
            const res: any = await resendWhatsAppAction({ orderId });
            if (res.success) toast.success("WhatsApp renvoyé");
            else toast.error(res.error || "Erreur WhatsApp");
        } catch (e) {
            toast.error("Erreur de connexion");
        }
    };

    const filteredOrders = orders.filter(o =>
        o.orderNumber.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getTimeAgo = (date: any) => {
        const diffMs = new Date().getTime() - new Date(date).getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 60) return `${diffMins}m`;
        return `${Math.floor(diffMins / 60)}h`;
    };

    return (
        <div className="flex flex-col min-h-screen bg-[#0a0a0a] text-white">
            {/* Header */}
            <header className="p-4 border-b border-white/5 flex items-center justify-between sticky top-0 bg-[#0a0a0a]/80 backdrop-blur-md z-30">
                <div>
                    <h1 className="text-xl font-black tracking-tight text-emerald-500">Validation</h1>
                    <div className="flex gap-2 mt-1">
                        <button
                            onClick={() => setView("pending")}
                            className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${view === 'pending' ? 'bg-emerald-500 text-black' : 'bg-white/5 text-slate-500'}`}
                        >
                            Attente
                        </button>
                        <button
                            onClick={() => setView("finished")}
                            className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${view === 'finished' ? 'bg-emerald-500 text-black' : 'bg-white/5 text-slate-500'}`}
                        >
                            Finies
                        </button>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => loadOrders()} className="p-2 bg-white/5 rounded-full text-slate-400">
                        <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
                    </button>
                </div>
            </header>

            {selectedOrder ? (
                /* DETAIL VIEW */
                <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-4 space-y-6">
                        <button
                            onClick={() => setSelectedOrder(null)}
                            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
                        >
                            <ArrowLeft size={20} />
                            <span className="font-bold text-sm">Retour</span>
                        </button>

                        <div className="bg-white/5 rounded-3xl p-6 border border-white/10 space-y-6">
                            <div>
                                <h2 className="text-2xl font-black">#{selectedOrder.orderNumber}</h2>
                                <p className="text-xs text-slate-500">{new Date(selectedOrder.createdAt).toLocaleString()}</p>
                            </div>

                            <div className="space-y-6">
                                {selectedOrder.items.map((item: any) => (
                                    <div key={item.id} className="space-y-3">
                                        <div className="flex justify-between items-center bg-white/5 p-3 rounded-2xl">
                                            <span className="font-bold text-sm">{item.name}</span>
                                            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-black">QTY: {item.quantity}</span>
                                        </div>
                                        <div className="space-y-2">
                                            {Array.from({ length: item.quantity }).map((_, i) => {
                                                const isPreassigned = item.codes && item.codes[i];
                                                return (
                                                    <div key={i} className="relative group">
                                                        <div className={`absolute inset-y-0 left-0 w-1 ${isPreassigned ? 'bg-blue-500' : 'bg-emerald-500'} rounded-full`} />
                                                        <input
                                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 outline-none placeholder:text-slate-700 font-bold"
                                                            placeholder={isPreassigned ? "Code pré-assigné" : `Code #${i + 1}...`}
                                                            value={codes[`${item.id}-${i}`] || ""}
                                                            onChange={(e) => handleCodeChange(item.id, i, e.target.value)}
                                                            disabled={view === 'finished' || !!isPreassigned}
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Actions Panel - Fixed at bottom */}
                    <div className="p-4 border-t border-white/10 bg-[#0a0a0a]/95 backdrop-blur-md">
                        {view === 'pending' && (
                            <div className="flex flex-col gap-2">
                                <button
                                    disabled={!isOrderReady() || isProcessing}
                                    onClick={handleProcess}
                                    className={`w-full py-4 rounded-2xl font-black uppercase text-sm shadow-xl transition-all flex items-center justify-center gap-3 ${isOrderReady() ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-emerald-500/20 active:scale-95' : 'bg-white/5 text-slate-600 opacity-50'}`}
                                >
                                    {isProcessing ? <Spinner size="sm" color="white" /> : (
                                        <>
                                            <Send size={18} />
                                            <span>Valider & Imprimer</span>
                                        </>
                                    )}
                                </button>
                                <button
                                    onClick={() => handleResendWhatsApp(selectedOrder.id)}
                                    className="w-full py-3 bg-emerald-500/10 text-emerald-500 rounded-xl border border-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                                >
                                    <MessageSquare size={18} />
                                    <span className="font-bold text-xs uppercase">Renvoyer WhatsApp</span>
                                </button>
                            </div>
                        )}
                    </div>
                </main>
            ) : (
                /* LIST VIEW */
                <main className="flex-1 p-4">
                    <div className="mb-6">
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                            <input
                                type="text"
                                placeholder="Numéro de commande..."
                                className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 outline-none focus:border-emerald-500/50 transition-all font-bold placeholder:text-slate-600 px-4"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-3">
                        {isLoading && orders.length === 0 ? (
                            <div className="flex justify-center py-20"><Spinner color="success" /></div>
                        ) : filteredOrders.length === 0 ? (
                            <div className="text-center py-20 text-slate-500 italic flex flex-col items-center gap-4">
                                <CheckCircle2 size={48} className="opacity-10 text-emerald-500" />
                                <p className="font-bold uppercase tracking-widest text-[10px]">Tout est à jour</p>
                            </div>
                        ) : (
                            filteredOrders.map(order => (
                                <div
                                    key={order.id}
                                    onClick={() => setSelectedOrder(order)}
                                    className="p-4 bg-white/5 border border-white/10 rounded-2xl active:scale-[0.98] transition-all flex justify-between items-center"
                                >
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-black text-lg">#{order.orderNumber}</span>
                                            {order.source === 'B2B_WEB' && (
                                                <span className="bg-orange-500/10 text-orange-400 text-[8px] font-black uppercase px-2 py-0.5 rounded border border-orange-500/20">Client B2B</span>
                                            )}
                                            {order.source === 'API' && (
                                                <span className="bg-purple-500/10 text-purple-400 text-[8px] font-black uppercase px-2 py-0.5 rounded border border-purple-500/20">API</span>
                                            )}
                                            {order.items.some((it: any) => it.codes?.length > 0) && (
                                                <span className="bg-blue-500/10 text-blue-400 text-[8px] font-black uppercase px-2 py-0.5 rounded border border-blue-500/20">Auto</span>
                                            )}
                                            {order.deliveryMethod === 'WHATSAPP' && (
                                                <MessageSquare size={12} className="text-emerald-500" />
                                            )}
                                        </div>
                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">
                                            {getTimeAgo(order.createdAt)} • {order.items?.length} Articles
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {order.status === "TERMINE" && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setOrderForDetail(order);
                                                    setIsDetailModalOpen(true);
                                                }}
                                                className="p-3 bg-white/5 rounded-xl text-primary"
                                            >
                                                <Eye size={18} />
                                            </button>
                                        )}
                                        <div className="text-right">
                                            <p className="text-emerald-500 font-black text-lg leading-none">{formatCurrency(order.totalAmount, 'DZD')}</p>
                                            <span className="material-symbols-outlined text-slate-700 text-sm mt-1">arrow_forward_ios</span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </main>
            )}

            {/* Optimized Print Container */}
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
                onReprint={() => handlePrint(orderForDetail)}
            />
        </div>
    );
}
