"use client";

import React, { useState, useEffect } from "react";
import { Spinner } from "@heroui/react";
import { toast } from "react-hot-toast";
import { getPaidOrders, getFinishedOrders, processOrder, markOrderAsTermine } from "../caisse/actions";
import { ThermalReceipt } from "@/components/admin/receipt/ThermalReceipt";
import OrderDetailModal from "@/components/admin/modals/OrderDetailModal";
import { Eye } from "lucide-react";

export default function TraitementContent() {
    const [view, setView] = useState<"pending" | "finished">("pending");
    const [orders, setOrders] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
    const [codes, setCodes] = useState<Record<string, string>>({});
    const [isProcessing, setIsProcessing] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [orderForDetail, setOrderForDetail] = useState<any | null>(null);
    const processedIds = React.useRef<Set<number>>(new Set());

    const loadOrders = async () => {
        setIsLoading(true);
        try {
            const data = view === "pending" ? await getPaidOrders() : await getFinishedOrders();
            setOrders(data);
        } catch (error) {
            console.error("Load failed:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadOrders();
        const interval = setInterval(async () => {
            const data = view === "pending" ? await getPaidOrders() : await getFinishedOrders();
            setOrders(data);

            // Auto-Print Logic for Webhook-delivered orders
            if (view === "pending") {
                const orderToPrint = data.find((o: any) => o.status === "LIVRE" && !processedIds.current.has(o.id));
                if (orderToPrint) {
                    processedIds.current.add(orderToPrint.id);
                    toast.success(`Impression automatique : ${orderToPrint.orderNumber}`, { icon: '🖨️' });
                    setOrderForDetail(orderToPrint);
                    // The printing is now handled by a separate useEffect for reliability
                }
            }
        }, 3000);
        return () => clearInterval(interval);
    }, [view]);

    // Separate Effect for Auto-Print trigger
    useEffect(() => {
        if (orderForDetail && orderForDetail.status === "LIVRE") {
            const printTimer = setTimeout(async () => {
                console.log("Triggering window.print() for", orderForDetail.orderNumber);
                window.print();
                await markOrderAsTermine(orderForDetail.id);
                loadOrders();
            }, 800); // Increased delay for rendering safety
            return () => clearTimeout(printTimer);
        }
    }, [orderForDetail]);

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
            const res: any = await processOrder(selectedOrder.id, itemsWithCodes);
            if (res && !res.error) {
                // Flatten codes for the detail view / receipt
                const flattened = {
                    ...res,
                    items: (res.items as any[]).map(item => ({
                        ...item,
                        codes: (item.codes as any[]).map((c: any) => c.code)
                    }))
                };
                setOrderForDetail(flattened);
                loadOrders();
                setSelectedOrder(null);
                setCodes({});
                setTimeout(() => window.print(), 300);
            }
        } catch (error) {
            console.error("Process failed:", error);
        } finally {
            setIsProcessing(false);
        }
    };

    const filteredOrders = orders.filter(o =>
        o.orderNumber.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getTimeAgo = (date: any) => {
        const diffMs = new Date().getTime() - new Date(date).getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 60) return `${diffMins} min`;
        return `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`;
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
                        <h2 className="text-xl font-bold tracking-tight">Traitement des Commandes</h2>
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
                    </div>
                </header>

                {/* Dual Column Layout */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Left Column: Queue */}
                    <section className="w-96 flex flex-col border-r border-[#ec5b13]/5 shrink-0">
                        <div className="p-6 shrink-0">
                            <h3 className="text-lg font-bold mb-1">File d'attente</h3>
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
                                        : "bg-[#2a1b15]/40 border-white/5 hover:border-[#ec5b13]/20"}`}
                                >
                                    <div className="flex justify-between items-start mb-2 gap-2">
                                        <span className={`font-bold truncate ${selectedOrder?.id === order.id ? "text-[#ec5b13]" : "text-slate-300 group-hover:text-[#ec5b13]"}`}>
                                            #{order.orderNumber}
                                        </span>
                                        {getStatusBadge(order.status)}
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-sm text-slate-400">Il y a {getTimeAgo(order.createdAt)}</p>
                                        <div className="flex justify-between items-center">
                                            <p className="text-xs text-slate-500">
                                                {order.items.reduce((acc: number, item: any) => acc + item.quantity, 0)} articles • {Number(order.totalAmount).toLocaleString()} DZD
                                            </p>
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
                        {selectedOrder ? (
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
                                        <button
                                            onClick={() => window.print()}
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
                                                        <p className="text-slate-500 text-sm">Quantité: <span className="text-white font-medium">{item.quantity}</span></p>
                                                    </div>
                                                </div>
                                                <p className="text-xl font-bold whitespace-nowrap text-[#ec5b13]">{Number(item.price).toLocaleString()} DZD</p>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-18">
                                                {Array.from({ length: item.quantity }).map((_, i) => (
                                                    <div key={i} className="relative">
                                                        <div className="absolute inset-y-0 left-0 w-1 bg-[#ec5b13]/40 rounded-full"></div>
                                                        <input
                                                            className="w-full bg-[#2a1b15] border-white/5 rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-[#ec5b13] focus:border-[#ec5b13] outline-none text-white placeholder:text-slate-600 transition-all"
                                                            placeholder={`Entrez le code #${i + 1} pour ${item.name}...`}
                                                            type="text"
                                                            value={codes[`${item.id}-${i}`] || ""}
                                                            onChange={(e) => handleCodeChange(item.id, i, e.target.value)}
                                                            disabled={view === "finished"}
                                                        />
                                                    </div>
                                                ))}
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
                                            <span className="text-2xl font-black">{Number(selectedOrder.totalAmount).toLocaleString()} DZD</span>
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
                                <p className="text-slate-700 text-sm max-w-[250px] leading-relaxed">Veuillez sélectionner une commande dans la file d'attente</p>
                            </div>
                        )}
                    </section>
                </div>
            </main>

            {/* Hidden Print Container */}
            {(selectedOrder || orderForDetail) && (
                <div className="hidden print:block text-black">
                    <ThermalReceipt
                        orderNumber={selectedOrder?.orderNumber || orderForDetail?.orderNumber}
                        date={selectedOrder?.createdAt || orderForDetail?.createdAt}
                        items={(selectedOrder || orderForDetail)?.items.map((item: any) => ({
                            ...item,
                            codes: selectedOrder
                                ? Array.from({ length: item.quantity }, (_, i) => codes[`${item.id}-${i}`]).filter(Boolean)
                                : item.codes
                        })) || []}
                        totalAmount={selectedOrder?.totalAmount || orderForDetail?.totalAmount}
                    />
                </div>
            )}

            <OrderDetailModal
                isOpen={isDetailModalOpen}
                onClose={() => setIsDetailModalOpen(false)}
                order={orderForDetail}
                onReprint={() => {
                    setTimeout(() => window.print(), 200);
                }}
            />
        </div>
    );
}
