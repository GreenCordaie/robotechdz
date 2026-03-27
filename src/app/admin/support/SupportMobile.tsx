"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
    Spinner,
    Button,
    Card,
    CardBody,
    Chip,
    Tabs,
    Tab
} from "@heroui/react";
import {
    Search,
    Eye,
    CheckCircle2,
    Clock,
    MessageSquare,
    Phone,
    ArrowRight,
    ExternalLink
} from "lucide-react";
import { getSupportTickets, updateTicketStatus } from "./actions";
import { replaceOrderItemCode, refundOrderItem, refundFullOrder } from "../caisse/actions";
import OrderDetailModal from "@/components/admin/modals/OrderDetailModal";
import { toast } from "react-hot-toast";
import { formatWhatsApp } from "@/lib/formatters";

interface SupportMobileProps {
    initialTickets?: any[];
}

export default function SupportMobile({ initialTickets = [] }: SupportMobileProps) {
    const [tickets, setTickets] = useState<any[]>(initialTickets);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<"OUVERT" | "RESOLU">("OUVERT");
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

    const loadTickets = useCallback(async () => {
        try {
            const data = await getSupportTickets(statusFilter);
            if (Array.isArray(data)) setTickets(data);
        } catch (error) {
            toast.error("Chargement échoué");
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
                toast.success("Ticket résolu");
                loadTickets();
            }
        } catch (e) {
            toast.error("Erreur mise à jour");
        }
    };

    const filteredTickets = tickets.filter(t =>
        t.order?.orderNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.message?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="flex flex-col min-h-screen bg-[#0a0a0a] text-white pb-32">
            <header className="p-4 border-b border-white/5 space-y-4">
                <div className="flex justify-between items-center">
                    <h1 className="text-xl font-black italic uppercase tracking-tighter">Centre d&apos;Aide</h1>
                    <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/5">
                        <div className="size-1.5 rounded-full bg-orange-500 animate-pulse" />
                        <span className="text-[10px] font-black uppercase text-slate-400">{tickets.filter(t => t.status === 'OUVERT').length} Ouverts</span>
                    </div>
                </div>

                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input
                        type="text"
                        placeholder="N° Commande / Message..."
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 outline-none focus:border-primary/50 transition-all font-bold placeholder:text-slate-600"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </header>

            <main className="px-4 mt-2">
                <Tabs
                    aria-label="Filtres"
                    variant="underlined"
                    classNames={{
                        base: "w-full",
                        tabList: "gap-6 w-full relative rounded-none p-0 border-b border-white/5",
                        cursor: "w-full bg-primary",
                        tab: "max-w-fit px-0 h-12",
                        tabContent: "group-data-[selected=true]:text-primary font-black uppercase text-[11px] tracking-widest"
                    }}
                    selectedKey={statusFilter}
                    onSelectionChange={(key) => setStatusFilter(key as any)}
                >
                    <Tab key="OUVERT" title="Actifs" />
                    <Tab key="RESOLU" title="Archives" />
                </Tabs>

                <div className="py-6 space-y-4">
                    {isLoading && tickets.length === 0 ? (
                        <div className="flex justify-center py-20"><Spinner color="primary" /></div>
                    ) : filteredTickets.length === 0 ? (
                        <div className="py-20 text-center opacity-30">
                            <CheckCircle2 size={48} className="mx-auto mb-4" />
                            <p className="text-sm font-bold uppercase tracking-widest">Tout est en ordre</p>
                        </div>
                    ) : filteredTickets.map((ticket) => (
                        <div key={ticket.id} className="p-5 bg-[#161616] border border-white/5 rounded-[2.5rem] space-y-5">
                            <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">Réclamation #{ticket.id}</p>
                                    <p className="text-lg font-black uppercase italic tracking-tighter">CMD {ticket.order?.orderNumber || "???"}</p>
                                </div>
                                <Chip size="sm" variant="flat" color={ticket.status === 'OUVERT' ? "warning" : "success"} className="font-black uppercase text-[9px] border-none">
                                    {ticket.status}
                                </Chip>
                            </div>

                            <div className="p-4 bg-black/20 rounded-2xl border border-white/5 italic">
                                <p className="text-sm text-slate-300 leading-relaxed">&quot;{ticket.message}&quot;</p>
                            </div>

                            {ticket.customerPhone && (
                                <div className="flex items-center gap-2 px-1">
                                    <Phone size={12} className="text-primary" />
                                    <span className="text-xs font-bold text-slate-400">{formatWhatsApp(ticket.customerPhone)}</span>
                                </div>
                            )}

                            <div className="flex gap-2 pt-2">
                                <Button
                                    className="flex-1 bg-white/5 hover:bg-white/10 transition-all font-black text-[10px] uppercase rounded-2xl h-12"
                                    onPress={() => {
                                        setSelectedTicket(ticket);
                                        setIsDetailModalOpen(true);
                                    }}
                                >
                                    Voir Dossier
                                </Button>

                                {ticket.status === 'OUVERT' && ticket.customerPhone && (
                                    <Button
                                        as="a"
                                        href={`https://wa.me/${formatWhatsApp(ticket.customerPhone).replace(/\+/g, '')}`}
                                        target="_blank"
                                        className="bg-emerald-500/20 text-emerald-500 font-black text-[10px] uppercase rounded-2xl h-12 px-5"
                                    >
                                        <MessageSquare size={18} />
                                    </Button>
                                )}

                                {ticket.status === 'OUVERT' && (
                                    <Button
                                        isIconOnly
                                        className="bg-orange-500/20 text-orange-500 font-black rounded-2xl h-12 w-12"
                                        onPress={() => handleResolve(ticket.id)}
                                    >
                                        <CheckCircle2 size={18} />
                                    </Button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </main>

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
