"use client";

import React from "react";
import { Card, CardBody, Divider, Spinner } from "@heroui/react";
import {
    Wallet,
    ArrowUpRight,
    ShoppingBag,
    Clock,
    CheckCircle2,
    AlertTriangle,
    Plus,
    History,
    Percent,
    Building2
} from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/formatters";

import { getCurrentResellerAction, getResellerOrdersAction } from "../actions";
import { toast } from "react-hot-toast";

export default function ResellerDashboard() {
    const [reseller, setReseller] = React.useState<any>(null);
    const [orders, setOrders] = React.useState<any[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);

    React.useEffect(() => {
        const loadData = async () => {
            const [resRes, ordRes]: [any, any] = await Promise.all([
                getCurrentResellerAction({}),
                getResellerOrdersAction({})
            ]);

            if (resRes.success) {
                setReseller(resRes.data);
            } else {
                toast.error("Erreur de session revendeur");
            }

            if (ordRes.success) {
                setOrders((ordRes.data as any) || []);
            } else {
                toast.error("Impossible de charger les commandes");
            }
            setIsLoading(false);
        };
        loadData();
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Spinner color="warning" />
            </div>
        );
    }

    const partnerInfo = {
        name: reseller?.companyName || "...",
        id: reseller?.id ? `B2B-${reseller.id}` : "...",
        balance: Number(reseller?.wallet?.balance || 0),
        discount: parseFloat(reseller?.customDiscount || "5.00"),
        totalOrders: orders.length,
        pendingOrders: orders.filter(o => o.status === "EN_ATTENTE").length,
    };

    const recentOrders = orders.slice(0, 3).map(o => ({
        id: o.orderNumber,
        date: new Date(o.createdAt).toLocaleDateString(),
        amount: Number(o.totalAmount),
        status: o.status,
        items: o.items?.[0]?.name + (o.items?.length > 1 ? ` +${o.items.length - 1}` : "")
    }));

    return (
        <div className="space-y-10 max-w-7xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Top Bar / Welcome */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Building2 className="text-[var(--primary)] size-6" />
                        <h1 className="text-3xl font-black text-white tracking-tight">Bonjour, {partnerInfo.name}</h1>
                    </div>
                    <p className="text-slate-500 font-medium">Voici l&apos;état de votre compte partenaire aujourd&apos;hui.</p>
                </div>
                <div className="flex items-center gap-3">
                    <Link
                        href="/reseller/shop"
                        className="bg-[var(--primary)] hover:bg-orange-600 text-white px-6 py-3.5 rounded-2xl font-bold text-sm shadow-xl shadow-orange-950/20 transition-all flex items-center gap-2 active:scale-95"
                    >
                        <Plus className="size-5" />
                        Nouvelle Commande
                    </Link>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card className="bg-[#161616] border border-[#262626] rounded-[28px] overflow-hidden group">
                    <CardBody className="p-6 relative">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Wallet className="size-20" />
                        </div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Solde de Crédit</p>
                        <h3 className="text-3xl font-black text-white mb-2">{formatCurrency(partnerInfo.balance, 'DZD')}</h3>
                        <div className="flex items-center gap-1.5 text-emerald-500 text-xs font-bold">
                            <ArrowUpRight className="size-4" />
                            <span>Compte Rechargé</span>
                        </div>
                    </CardBody>
                </Card>

                <Card className="bg-[#161616] border border-[#262626] rounded-[28px] overflow-hidden group">
                    <CardBody className="p-6 relative">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Percent className="size-20" />
                        </div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Remise Partenaire</p>
                        <h3 className="text-3xl font-black text-[var(--primary)] mb-2">{partnerInfo.discount}%</h3>
                        <div className="flex items-center gap-1.5 text-slate-500 text-xs font-bold">
                            <span>Niveau SILVER</span>
                        </div>
                    </CardBody>
                </Card>

                <Card className="bg-[#161616] border border-[#262626] rounded-[28px] overflow-hidden group">
                    <CardBody className="p-6 relative">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <ShoppingBag className="size-20" />
                        </div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Volume Total</p>
                        <h3 className="text-3xl font-black text-white mb-2">{partnerInfo.totalOrders}</h3>
                        <div className="flex items-center gap-1.5 text-slate-500 text-xs font-bold">
                            <span>Commandes effectuées</span>
                        </div>
                    </CardBody>
                </Card>

                <Card className="bg-[#161616] border border-[#262626] rounded-[28px] overflow-hidden group">
                    <CardBody className="p-6 relative">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Clock className="size-20" />
                        </div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">En Attente</p>
                        <h3 className="text-3xl font-black text-white mb-2">{partnerInfo.pendingOrders}</h3>
                        <div className="flex items-center gap-1.5 text-amber-500 text-xs font-bold">
                            <AlertTriangle className="size-4" />
                            <span>À traiter par l&apos;équipe</span>
                        </div>
                    </CardBody>
                </Card>
            </div>

            {/* Bottom Content Split */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                {/* Recent Orders List */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-3">
                            <History className="size-6 text-[var(--primary)]" />
                            Commandes Récentes
                        </h2>
                        <Link href="/reseller/orders" className="text-xs font-black text-[var(--primary)] uppercase tracking-widest hover:underline">
                            Voir tout
                        </Link>
                    </div>

                    <div className="space-y-4">
                        {recentOrders.map((order) => (
                            <div key={order.id} className="bg-[#161616] border border-[#262626] rounded-2xl p-5 flex items-center justify-between group hover:border-[var(--primary)]/30 transition-all">
                                <div className="flex items-center gap-5">
                                    <div className={`size-12 rounded-xl flex items-center justify-center border ${order.status === "TERMINE" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" : "bg-orange-500/10 border-orange-500/20 text-orange-500"
                                        }`}>
                                        <ShoppingBag className="size-6" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-bold text-white tracking-tight">{order.id}</h4>
                                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${order.status === "TERMINE" ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"
                                                }`}>
                                                {order.status === "TERMINE" ? "Livré" : "Traitement"}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-500 font-medium mt-0.5">{order.items}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-white">{formatCurrency(order.amount, 'DZD')}</p>
                                    <p className="text-[10px] text-slate-600 font-bold uppercase tracking-wider mt-1">{order.date}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Quick Actions / Tips */}
                <div className="space-y-8">
                    <div className="bg-[#1a1614] border border-[#2d2622] rounded-[32px] p-8 overflow-hidden relative group">
                        <div className="absolute -top-10 -right-10 size-40 bg-[var(--primary)]/5 blur-[60px] rounded-full"></div>
                        <h3 className="text-lg font-black text-white mb-4">Besoin d&apos;aide ?</h3>
                        <p className="text-sm text-slate-400 leading-relaxed mb-8">
                            Votre remise de 5% est appliquée automatiquement sur tous vos achats.
                            Le solde minimum de recharge est de 1000 DZD.
                        </p>
                        <Link
                            href="/reseller/support"
                            className="flex items-center justify-between p-4 bg-[#0a0a0a] border border-[#262626] rounded-2xl group/btn hover:border-[var(--primary)]/50 transition-all font-bold text-sm text-slate-300"
                        >
                            <span>Contacter le support</span>
                            <ArrowUpRight className="size-4 group-hover/btn:translate-x-1 group-hover/btn:-translate-y-1 transition-transform" />
                        </Link>
                    </div>

                    <div className="bg-gradient-to-br from-[var(--primary)] to-orange-700 rounded-[32px] p-8 text-white shadow-2xl shadow-orange-950/20">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-80 mb-2">Promotion</p>
                        <h3 className="text-xl font-black mb-4 leading-tight">Augmentez votre marge bénéficiaire !</h3>
                        <p className="text-sm text-white/80 leading-relaxed mb-6 font-medium">
                            Passez au niveau GOLD en atteignant 200,000 DZD de volume mensuel et bénéficiez de 7% de remise.
                        </p>
                        <button className="w-full py-3 bg-white text-[var(--primary)] rounded-xl font-black text-sm active:scale-95 transition-all">
                            En savoir plus
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
