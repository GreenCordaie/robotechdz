"use client";

import React, { useState, useTransition } from "react";
import { Button, Spinner, Chip } from "@heroui/react";
import { Search, Eye, Filter, Calendar, CreditCard, User, History, ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import dynamic from "next/dynamic";
import { useRouter, usePathname } from "next/navigation";
const OrderDetailModal = dynamic(() => import("@/components/admin/modals/OrderDetailModal"), { ssr: false });
import { cancelOrderAction, requeueForPrint } from "../caisse/actions";
import { toast } from "react-hot-toast";

interface CommandesContentProps {
    initialOrders: any[];
    total: number;
    page: number;
    totalPages: number;
    search: string;
}

export function CommandesContent({ initialOrders, total, page, totalPages, search }: CommandesContentProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [isPending, startTransition] = useTransition();
    const [searchInput, setSearchInput] = useState(search);
    const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const navigate = (newPage: number, newSearch?: string) => {
        const params = new URLSearchParams();
        if (newPage > 1) params.set("page", String(newPage));
        const s = newSearch !== undefined ? newSearch : searchInput;
        if (s) params.set("search", s);
        startTransition(() => {
            router.push(`${pathname}?${params.toString()}`);
        });
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        navigate(1, searchInput);
    };

    const handleOpenDetail = (order: any) => {
        const formattedOrder = {
            ...order,
            totalAmount: Number(order.totalAmount),
            remise: Number(order.remise || 0),
            // fullCodes and fullSlots are already mapped by getHistoryPaginated
            items: (order.items || []).map((item: any) => ({
                ...item,
                fullCodes: item.fullCodes || [],
                fullSlots: item.fullSlots || []
            }))
        };
        setSelectedOrder(formattedOrder);
        setIsDetailModalOpen(true);
    };

    const handlePrint = async (order: any) => {
        try {
            const res: any = await requeueForPrint({ orderId: order.id });
            if (res?.success) {
                toast.success(`Ticket #${order.orderNumber} en file d'impression`);
            } else {
                toast.error(res?.error || "Erreur d'impression");
            }
        } catch (e: any) {
            toast.error(e.message || "Erreur d'impression");
        }
    };

    const handleCancelOrder = async (orderId: number) => {
        if (!confirm("Êtes-vous sûr de vouloir annuler cette commande ?")) return;
        setIsLoading(true);
        try {
            const res = await cancelOrderAction({ orderId });
            if (res.success) router.refresh();
        } catch (error) {
            console.error("Cancel order error:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case "TERMINE": return "success";
            case "PAYE": return "primary";
            case "ANNULE": return "danger";
            case "NON_PAYE": return "warning";
            case "REMBOURSE": return "secondary";
            default: return "default";
        }
    };

    const formatDateShort = (date: string | Date) => {
        return new Date(date).toLocaleString("fr-FR", {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
        });
    };

    return (
        <div className="flex flex-col min-h-screen bg-[#0a0a0a] text-white">
            <header className="p-6 border-b border-white/5 bg-[#111] sticky top-0 z-30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-[var(--primary)]/10 rounded-xl border border-[var(--primary)]/20">
                        <History size={24} className="text-[var(--primary)]" />
                    </div>
                    <div>
                        <h1 className="text-xl font-black uppercase tracking-tight">Historique Commandes</h1>
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">
                            {total} commande{total > 1 ? "s" : ""} au total
                        </p>
                    </div>
                </div>
            </header>

            <main className="p-6 flex-1 overflow-auto max-w-[1400px] mx-auto w-full">
                {/* Search */}
                <form onSubmit={handleSearch} className="flex items-center gap-4 mb-8">
                    <div className="relative max-w-md w-full">
                        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                        <input
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            placeholder="Rechercher par #, client ou téléphone..."
                            className="w-full bg-white/5 border border-white/5 hover:border-[var(--primary)]/40 transition-colors h-12 rounded-xl pl-11 pr-4 text-sm outline-none focus:border-[var(--primary)]/60 text-white placeholder:text-slate-500"
                        />
                    </div>
                    <button
                        type="submit"
                        className="h-12 px-5 bg-[var(--primary)] text-white rounded-xl font-bold text-sm hover:opacity-90 active:scale-95 transition-all"
                    >
                        {isPending ? <Spinner size="sm" color="white" /> : "Rechercher"}
                    </button>
                    {search && (
                        <button
                            type="button"
                            onClick={() => { setSearchInput(""); navigate(1, ""); }}
                            className="h-12 px-4 bg-white/5 text-slate-400 rounded-xl font-bold text-sm hover:bg-white/10 transition-all"
                        >
                            Effacer
                        </button>
                    )}
                    <div className="flex-1" />
                    <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-lg border border-white/5 text-[10px] font-black uppercase text-slate-400">
                        <Filter size={14} />
                        <span>Page {page}/{totalPages || 1}</span>
                    </div>
                </form>

                {/* Orders list */}
                <div className="grid grid-cols-1 gap-4">
                    {isPending ? (
                        <div className="py-20 flex items-center justify-center">
                            <Spinner color="warning" size="lg" />
                        </div>
                    ) : initialOrders.length === 0 ? (
                        <div className="py-20 flex flex-col items-center justify-center text-slate-500 bg-white/5 rounded-3xl border border-dashed border-white/10">
                            <Search size={48} className="mb-4 opacity-20" />
                            <p className="font-bold uppercase tracking-widest italic text-sm">Aucune commande trouvée</p>
                        </div>
                    ) : initialOrders.map((order) => (
                        <div
                            key={order.id}
                            className="bg-[#111] border border-white/5 rounded-2xl p-5 hover:border-[var(--primary)]/30 transition-all group flex items-center justify-between gap-6"
                        >
                            <div className="flex flex-col gap-1.5 min-w-[200px]">
                                <div className="flex items-center gap-3">
                                    <span className="text-sm font-black text-slate-200 group-hover:text-[var(--primary)] transition-colors">#{order.orderNumber}</span>
                                    <Chip
                                        size="sm"
                                        variant="flat"
                                        color={getStatusColor(order.status) as any}
                                        className="text-[9px] font-black uppercase tracking-tighter"
                                    >
                                        {order.status === "TERMINE" ? "LIVRÉ" : order.status}
                                    </Chip>
                                </div>
                                <div className="flex items-center gap-2 text-slate-500 text-[10px] font-bold uppercase tracking-wide">
                                    <Calendar size={12} />
                                    <span>{formatDateShort(order.createdAt)}</span>
                                </div>
                            </div>

                            <div className="flex-1 flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                    <User size={14} className="text-[var(--primary)]" />
                                    <span className="text-xs font-bold text-slate-200">{order.clientName}</span>
                                    {order.customerPhone && (
                                        <span className="text-[10px] text-slate-500 bg-white/5 px-1.5 py-0.5 rounded italic">
                                            {order.customerPhone}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-4 mt-1">
                                    <div className="flex items-center gap-1 text-[9px] font-black text-slate-500 uppercase">
                                        <CreditCard size={12} />
                                        <span>{order.paymentMethod || "Cache"}</span>
                                    </div>
                                    <div className="text-[9px] font-black text-[var(--primary)] border-l border-white/10 pl-3 uppercase">
                                        {(order.items || []).length} article(s)
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col items-end gap-1.5 min-w-[150px]">
                                <span className="text-lg font-black text-white px-3 py-1 bg-white/5 rounded-lg border border-white/5">
                                    {formatCurrency(order.totalAmount, "DZD")}
                                </span>
                                {order.remise > 0 && (
                                    <span className="text-[9px] text-emerald-500 font-bold uppercase italic">
                                        Remise: {formatCurrency(order.remise, "DZD")}
                                    </span>
                                )}
                            </div>

                            <div className="flex items-center gap-2">
                                <Button
                                    isIconOnly
                                    size="md"
                                    variant="flat"
                                    className="bg-white/5 hover:bg-white/10 text-slate-500 hover:text-slate-300 border border-white/5 transition-all"
                                    onClick={() => handlePrint(order)}
                                    title="Imprimer"
                                >
                                    <Printer size={18} />
                                </Button>
                                <Button
                                    isIconOnly
                                    size="md"
                                    variant="flat"
                                    className="bg-white/5 hover:bg-[var(--primary)]/20 text-slate-400 hover:text-[var(--primary)] border border-white/5 transition-all"
                                    onClick={() => handleOpenDetail(order)}
                                >
                                    <Eye size={20} />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-3 mt-10">
                        <button
                            onClick={() => navigate(page - 1)}
                            disabled={page <= 1 || isPending}
                            className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm font-bold text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >
                            <ChevronLeft size={16} />
                            Précédent
                        </button>

                        <div className="flex items-center gap-2">
                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                                .reduce((acc: (number | string)[], p, idx, arr) => {
                                    if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push("...");
                                    acc.push(p);
                                    return acc;
                                }, [])
                                .map((p, idx) => p === "..." ? (
                                    <span key={`dots-${idx}`} className="px-2 text-slate-600 font-bold">…</span>
                                ) : (
                                    <button
                                        key={p}
                                        onClick={() => navigate(p as number)}
                                        disabled={isPending}
                                        className={`w-10 h-10 rounded-xl text-sm font-black transition-all ${p === page
                                            ? "bg-[var(--primary)] text-white shadow-lg shadow-[var(--primary)]/20"
                                            : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-white/10"
                                            }`}
                                    >
                                        {p}
                                    </button>
                                ))
                            }
                        </div>

                        <button
                            onClick={() => navigate(page + 1)}
                            disabled={page >= totalPages || isPending}
                            className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm font-bold text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >
                            Suivant
                            <ChevronRight size={16} />
                        </button>
                    </div>
                )}
            </main>

            {selectedOrder && (
                <OrderDetailModal
                    isOpen={isDetailModalOpen}
                    onClose={() => setIsDetailModalOpen(false)}
                    order={selectedOrder}
                    onRefund={() => handleCancelOrder(selectedOrder.id)}
                    onReprint={() => handlePrint(selectedOrder)}
                />
            )}
        </div>
    );
}
