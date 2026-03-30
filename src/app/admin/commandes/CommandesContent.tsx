"use client";

import React, { useState, useMemo } from "react";
import { Input, Button, Spinner, Chip } from "@heroui/react";
import { Search, Eye, Filter, Calendar, CreditCard, User, History } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import dynamic from "next/dynamic";
const OrderDetailModal = dynamic(() => import("@/components/admin/modals/OrderDetailModal"), { ssr: false });
import { cancelOrderAction } from "../caisse/actions";

interface CommandesContentProps {
    initialOrders: any[];
}

export function CommandesContent({ initialOrders }: CommandesContentProps) {
    const [orders, setOrders] = useState<any[]>(initialOrders);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const filteredOrders = useMemo(() => {
        return orders.filter(order =>
            order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (order.clientName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
            (order.customerPhone || "").toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [orders, searchTerm]);

    const handleOpenDetail = (order: any) => {
        // Transform the order data to match the Detail modal expectation if necessary
        const formattedOrder = {
            ...order,
            totalAmount: Number(order.totalAmount),
            remise: Number(order.remise || 0),
            items: (order.items || []).map((item: any) => ({
                ...item,
                fullCodes: (item.codes || []).map((c: any, idx: number) => ({ id: idx, code: c })),
                fullSlots: (item.slots || []).map((s: any) => ({
                    id: s.id,
                    code: s.code,
                    slotNumber: s.slotNumber,
                    profileName: s.profileName,
                    parentCode: s.digitalCode?.code
                }))
            }))
        };
        setSelectedOrder(formattedOrder);
        setIsDetailModalOpen(true);
    };

    const handleCancelOrder = async (orderId: number) => {
        if (!confirm("Êtes-vous sûr de vouloir annuler cette commande ?")) return;

        setIsLoading(true);
        try {
            const res = await cancelOrderAction({ orderId });
            if (res.success) {
                setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: "ANNULE" } : o));
            }
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
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
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
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Gestion et consultation des transactions</p>
                    </div>
                </div>
            </header>

            <main className="p-6 flex-1 overflow-auto max-w-[1400px] mx-auto w-full">
                <div className="flex items-center gap-4 mb-8">
                    <Input
                        placeholder="Rechercher par #, client ou téléphone..."
                        startContent={<Search size={18} className="text-slate-500" />}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="max-w-md"
                        variant="flat"
                        classNames={{
                            input: "bg-transparent",
                            inputWrapper: "bg-white/5 border border-white/5 hover:border-[var(--primary)]/40 transition-colors h-12"
                        }}
                    />
                    <div className="flex-1" />
                    <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-lg border border-white/5 text-[10px] font-black uppercase text-slate-400">
                        <Filter size={14} />
                        <span>Recent orders</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    {filteredOrders.map((order) => (
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
                                    className="bg-white/5 hover:bg-[var(--primary)]/20 text-slate-400 hover:text-[var(--primary)] border border-white/5 transition-all"
                                    onClick={() => handleOpenDetail(order)}
                                >
                                    <Eye size={20} />
                                </Button>
                            </div>
                        </div>
                    ))}

                    {filteredOrders.length === 0 && (
                        <div className="py-20 flex flex-col items-center justify-center text-slate-500 bg-white/5 rounded-3xl border border-dashed border-white/10">
                            <Search size={48} className="mb-4 opacity-20" />
                            <p className="font-bold uppercase tracking-widest italic text-sm">Aucune commande trouvée</p>
                        </div>
                    )}
                </div>
            </main>

            {selectedOrder && (
                <OrderDetailModal
                    isOpen={isDetailModalOpen}
                    onClose={() => setIsDetailModalOpen(false)}
                    order={selectedOrder}
                    onRefund={() => handleCancelOrder(selectedOrder.id)}
                    onReprint={(orderId) => {
                        console.log("Reprinting order", orderId);
                        // Implement reprint logic if needed here, 
                        // though it might need specific hook integration
                        toast.error("Réimpression non implémentée sur cette page");
                    }}
                />
            )}
        </div>
    );
}

// Helper needed because toast is client side
import { toast } from "react-hot-toast";
