"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Spinner, Button, Card, CardBody, Chip } from "@heroui/react";
import { Search, Eye, CheckCircle2, Clock, MessageSquare } from "lucide-react";
import { getSupportTickets, updateTicketStatus } from "./actions";
import { replaceOrderItemCode, refundOrderItem, refundFullOrder } from "../caisse/actions";
import OrderDetailModal from "@/components/admin/modals/OrderDetailModal";
import { toast } from "react-hot-toast";

interface SupportContentProps {
    initialTickets?: any[];
}

export default function SupportContent({ initialTickets = [] }: SupportContentProps) {
    const [tickets, setTickets] = useState<any[]>(initialTickets);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<"OUVERT" | "RESOLU">("OUVERT");
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

    const loadTickets = useCallback(async () => {
        setIsLoading(true);
        try {
            // Fix: the action expects an object with status
            const data = await getSupportTickets(statusFilter);
            setTickets(data);
        } catch (error) {
            toast.error("Échec du chargement des tickets");
        } finally {
            setIsLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => {
        loadTickets();
        const interval = setInterval(loadTickets, 5000);
        return () => clearInterval(interval);
    }, [loadTickets]);

    const handleResolve = async (ticketId: number) => {
        try {
            const res: any = await updateTicketStatus({ ticketId, status: "RESOLU" });
            if (res.success) {
                toast.success("Ticket marqué comme résolu");
                loadTickets();
            }
        } catch (e) {
            toast.error("Erreur lors de la mise à jour");
        }
    };

    const filteredTickets = tickets.filter(t =>
        t.order?.orderNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.message?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="flex flex-col gap-6 p-6 max-w-[1200px] mx-auto min-h-screen">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-3">
                        <span className="p-2 bg-[#ec5b13]/10 rounded-xl">
                            <MessageSquare className="text-[#ec5b13] w-6 h-6" />
                        </span>
                        Tickets Support
                    </h1>
                    <p className="text-slate-500 text-sm font-medium mt-1 uppercase tracking-wider">Gérez les demandes d&apos;assistance des clients</p>
                </div>

                <div className="flex bg-[#1a1614] p-1.5 rounded-2xl border border-white/5 shadow-xl">
                    <button
                        onClick={() => setStatusFilter("OUVERT")}
                        className={`px-6 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${statusFilter === "OUVERT"
                            ? "bg-[#ec5b13] text-white shadow-lg shadow-[#ec5b13]/20"
                            : "text-slate-500 hover:text-white"
                            }`}
                    >
                        Tickets Actifs
                    </button>
                    <button
                        onClick={() => setStatusFilter("RESOLU")}
                        className={`px-6 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${statusFilter === "RESOLU"
                            ? "bg-[#ec5b13] text-white shadow-lg shadow-[#ec5b13]/20"
                            : "text-slate-500 hover:text-white"
                            }`}
                    >
                        Archives
                    </button>
                </div>
            </div>

            {/* Search & Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-3 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                        type="text"
                        placeholder="Rechercher par n° de commande ou message..."
                        className="w-full bg-[#1a1614] border border-white/5 rounded-2xl py-3 pl-12 pr-4 text-sm text-white placeholder:text-slate-600 outline-none focus:border-[#ec5b13]/50 transition-all shadow-xl"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="bg-[#1a1614] border border-white/5 rounded-2xl p-3 flex items-center justify-center gap-4 shadow-xl">
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] font-black text-slate-500 uppercase">Ouverts</span>
                        <span className="text-lg font-black text-[#ec5b13]">{tickets.filter(t => t.status === 'OUVERT').length}</span>
                    </div>
                    <div className="w-px h-8 bg-white/5" />
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] font-black text-slate-500 uppercase">Total</span>
                        <span className="text-lg font-black text-white">{tickets.length}</span>
                    </div>
                </div>
            </div>

            {/* Tickets Grid/List */}
            <div className="space-y-4">
                {isLoading && tickets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <Spinner color="warning" />
                        <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Chargement des tickets...</p>
                    </div>
                ) : filteredTickets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-[#1a1614] rounded-[32px] border border-dashed border-white/10">
                        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                            <CheckCircle2 className="text-slate-700 w-8 h-8" />
                        </div>
                        <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">Aucun ticket trouvé</p>
                    </div>
                ) : (
                    filteredTickets.map((ticket) => (
                        <Card key={ticket.id} className="bg-[#1a1614] border border-white/5 hover:border-white/10 transition-all group overflow-hidden shadow-xl rounded-[24px]">
                            <CardBody className="p-0">
                                <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-white/5">
                                    {/* Left: Info */}
                                    <div className="p-6 md:w-80 flex flex-col gap-3">
                                        <div className="flex items-center justify-between">
                                            <Chip
                                                variant="flat"
                                                size="sm"
                                                color={ticket.status === 'OUVERT' ? 'warning' : 'success'}
                                                className="font-black uppercase text-[10px]"
                                                startContent={ticket.status === 'OUVERT' ? <Clock size={12} /> : <CheckCircle2 size={12} />}
                                            >
                                                {ticket.status}
                                            </Chip>
                                            <span className="text-[10px] text-slate-600 font-bold">#{ticket.id}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest leading-none">Commande</span>
                                            <span className="text-lg font-black text-white">{ticket.order?.orderNumber || "Inconnu"}</span>
                                        </div>
                                        {ticket.customerPhone && (
                                            <div className="flex flex-col">
                                                <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest leading-none">Contact</span>
                                                <span className="text-sm font-black text-[#ec5b13]">+213 {ticket.customerPhone}</span>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2 text-slate-500 text-[10px] font-bold">
                                            <Clock size={12} />
                                            {new Date(ticket.createdAt).toLocaleString()}
                                        </div>
                                    </div>

                                    {/* Middle: Message */}
                                    <div className="flex-1 p-6 bg-white/[0.02]">
                                        <span className="text-[10px] text-[#ec5b13] font-black uppercase tracking-widest mb-1.5 block">Message du client</span>
                                        <p className="text-slate-300 text-sm leading-relaxed italic">
                                            &quot;{ticket.message}&quot;
                                        </p>
                                    </div>

                                    {/* Right: Actions */}
                                    <div className="p-6 md:w-64 flex flex-col justify-center gap-3 bg-black/20">
                                        <Button
                                            size="sm"
                                            className="w-full bg-[#ec5b13] text-white font-black text-[11px] uppercase tracking-wider h-10 rounded-xl shadow-lg shadow-[#ec5b13]/20"
                                            startContent={<Eye size={14} />}
                                            onPress={() => {
                                                setSelectedTicket(ticket);
                                                setIsDetailModalOpen(true);
                                            }}
                                        >
                                            Voir Commande
                                        </Button>

                                        {ticket.status === 'OUVERT' && ticket.customerPhone && (
                                            <Button
                                                size="sm"
                                                as="a"
                                                href={`https://wa.me/213${ticket.customerPhone.replace(/\s+/g, '')}`}
                                                target="_blank"
                                                className="w-full bg-[#25D366] text-white font-black text-[11px] uppercase tracking-wider h-10 rounded-xl shadow-lg shadow-emerald-500/20"
                                                startContent={<MessageSquare size={14} />}
                                            >
                                                WhatsApp
                                            </Button>
                                        )}

                                        {ticket.status === 'OUVERT' && (
                                            <Button
                                                size="sm"
                                                variant="bordered"
                                                className="w-full border-white/10 text-emerald-500 font-black text-[11px] uppercase tracking-wider h-10 rounded-xl hover:bg-emerald-500/10 transition-all"
                                                startContent={<CheckCircle2 size={14} />}
                                                onPress={() => handleResolve(ticket.id)}
                                            >
                                                Marquer Résolu
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </CardBody>
                        </Card>
                    ))
                )}
            </div>

            {/* Order Detail Modal for handling refunds/replacements directly from support */}
            {selectedTicket?.order && (
                <OrderDetailModal
                    isOpen={isDetailModalOpen}
                    onClose={() => setIsDetailModalOpen(false)}
                    order={selectedTicket.order}
                    onRefund={async (id) => {
                        const res: any = await refundFullOrder({ id, returnToStock: false });
                        if (res.success) {
                            setIsDetailModalOpen(false);
                            loadTickets();
                        }
                    }}
                    onReplaceCode={async (orderItemId, codeId, type, reason) => {
                        const res = await replaceOrderItemCode({
                            orderItemId,
                            oldCodeId: type === 'standard' ? codeId : undefined,
                            oldSlotId: type === 'slot' ? codeId : undefined,
                            reason
                        });
                        if (res.success) loadTickets();
                    }}
                    onRefundItem={async (orderItemId, returnToStock) => {
                        const res: any = await refundOrderItem({ orderItemId, returnToStock });
                        if (res.success) loadTickets();
                    }}
                />
            )}
        </div>
    );
}
