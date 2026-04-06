"use client";

import React, { useState, useEffect } from "react";
import {
    Card,
    CardBody,
    Table,
    TableHeader,
    TableColumn,
    TableBody,
    TableRow,
    TableCell,
    Spinner,
    Chip
} from "@heroui/react";
import {
    History,
    ExternalLink,
    Search,
    Filter,
    Calendar,
    ShoppingBag
} from "lucide-react";
import { getResellerOrdersAction } from "../actions";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { toast } from "react-hot-toast";

export default function ResellerOrders() {
    const [orders, setOrders] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadOrders = async () => {
            const res: any = await getResellerOrdersAction({});
            if (res.success) {
                setOrders((res.data as any) || []);
            } else {
                toast.error("Erreur: " + res.error);
            }
            setIsLoading(false);
        };
        loadOrders();
    }, []);

    const getStatusChip = (status: string) => {
        switch (status) {
            case 'PAYE': return <Chip size="sm" className="bg-emerald-500/10 text-emerald-500 font-bold border border-emerald-500/20">Payé</Chip>;
            case 'LIVRE': return <Chip size="sm" className="bg-blue-500/10 text-blue-500 font-bold border border-blue-500/20">Livré</Chip>;
            case 'EN_ATTENTE': return <Chip size="sm" className="bg-amber-500/10 text-amber-500 font-bold border border-amber-500/20">En Attente</Chip>;
            default: return <Chip size="sm" className="bg-slate-500/10 text-slate-500 font-bold border border-slate-500/20">{status}</Chip>;
        }
    };

    return (
        <div className="space-y-10 animate-in fade-in duration-500 pb-20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
                        <History className="text-[var(--primary)] size-8" />
                        Mes Commandes
                    </h1>
                    <p className="text-slate-500 font-medium mt-1 uppercase tracking-widest text-[10px]">Historique complet de vos achats B2B</p>
                </div>
            </div>

            <Card className="bg-[#161616] border border-[#262626] rounded-[32px] overflow-hidden">
                <CardBody className="p-0">
                    {isLoading ? (
                        <div className="py-40 flex flex-col items-center justify-center gap-4">
                            <Spinner color="warning" />
                            <p className="text-slate-500 font-bold text-xs uppercase tracking-widest">Chargement de l&apos;historique...</p>
                        </div>
                    ) : orders.length === 0 ? (
                        <div className="py-40 flex flex-col items-center justify-center gap-6 opacity-30">
                            <ShoppingBag size={64} className="text-slate-500" />
                            <p className="text-xl font-bold italic">Aucune commande pour le moment</p>
                        </div>
                    ) : (
                        <Table
                            aria-label="Historique des commandes"
                            removeWrapper
                            classNames={{
                                th: "bg-[#1a1a1a] text-slate-500 font-black uppercase text-[10px] tracking-widest py-6 border-b border-[#262626]",
                                td: "py-6 text-slate-300 font-medium border-b border-[#262626]/50 transition-colors group-hover:bg-white/5",
                            }}
                        >
                            <TableHeader>
                                <TableColumn>N° COMMANDE</TableColumn>
                                <TableColumn>DATE</TableColumn>
                                <TableColumn>PRODUITS</TableColumn>
                                <TableColumn>MONTANT</TableColumn>
                                <TableColumn>STATUT</TableColumn>
                                <TableColumn>ACTIONS</TableColumn>
                            </TableHeader>
                            <TableBody>
                                {orders.map((order) => (
                                    <TableRow key={order.id} className="group">
                                        <TableCell className="font-black text-white">{order.orderNumber}</TableCell>
                                        <TableCell>{formatDate(order.createdAt)}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-xs text-slate-400">Articles en gros</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-black text-[var(--primary)]">{formatCurrency(order.totalAmount, 'DZD')}</TableCell>
                                        <TableCell>{getStatusChip(order.status)}</TableCell>
                                        <TableCell>
                                            <button className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all text-slate-400 hover:text-white">
                                                <ExternalLink size={16} />
                                            </button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardBody>
            </Card>
        </div>
    );
}
