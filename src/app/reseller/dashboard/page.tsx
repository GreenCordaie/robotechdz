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

// An order is "delivered" once it reaches LIVRE or TERMINE — IPTV/marketplace
// orders settle on LIVRE (codes/credentials sent), not TERMINE. The old badge
// only checked TERMINE, so delivered orders wrongly showed "Traitement".
const DELIVERED_STATUSES = new Set(["TERMINE", "LIVRE"]);
function orderBadge(status: string): { label: string; delivered: boolean; cancelled: boolean } {
    if (DELIVERED_STATUSES.has(status)) return { label: "Livré", delivered: true, cancelled: false };
    if (status === "REMBOURSE") return { label: "Remboursé", delivered: false, cancelled: true };
    if (status === "ANNULE") return { label: "Annulé", delivered: false, cancelled: true };
    if (status === "EN_ATTENTE") return { label: "En attente", delivered: false, cancelled: false };
    return { label: "Traitement", delivered: false, cancelled: false };
}

export default function ResellerDashboard() {
    const [reseller, setReseller] = React.useState<any>(null);
    const [orders, setOrders] = React.useState<any[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const seqRef = React.useRef(0);
    const firstLoadRef = React.useRef(true);

    // Refresh balance/stats/orders so a purchase made in another tab is
    // reflected without a manual reload. Last-write-wins via a monotonic seq
    // so an in-flight stale response never overwrites a fresher one. Toast
    // only on the FIRST load failure (a 30s poll must not spam toasts).
    const loadData = React.useCallback(async () => {
        const myTurn = ++seqRef.current;
        const [resRes, ordRes]: [any, any] = await Promise.all([
            getCurrentResellerAction({}),
            getResellerOrdersAction({}),
        ]);
        if (myTurn < seqRef.current) return; // a newer refresh already landed

        if (resRes.success) setReseller(resRes.data);
        else if (firstLoadRef.current) toast.error("Erreur de session revendeur");

        if (ordRes.success) setOrders((ordRes.data as any) || []);
        else if (firstLoadRef.current) toast.error("Impossible de charger les commandes");

        firstLoadRef.current = false;
        setIsLoading(false);
    }, []);

    React.useEffect(() => {
        loadData();
        const onFocus = () => loadData();
        const onVisible = () => {
            if (document.visibilityState === "visible") loadData();
        };
        window.addEventListener("focus", onFocus);
        document.addEventListener("visibilitychange", onVisible);
        const interval = window.setInterval(loadData, 30_000);
        return () => {
            window.removeEventListener("focus", onFocus);
            document.removeEventListener("visibilitychange", onVisible);
            window.clearInterval(interval);
        };
    }, [loadData]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Spinner color="warning" />
            </div>
        );
    }

    const tier = reseller?.tier ?? null;
    const nextTier = reseller?.nextTier ?? null;
    const monthlyVolume = Number(reseller?.monthlyVolume ?? 0);
    const tierDiscountPct = tier ? parseFloat(tier.discountPct) : 0;
    const customDiscountPct = reseller?.customDiscount
        ? parseFloat(reseller.customDiscount)
        : 0;
    // Effective discount surfaced to the partner = tier base + any custom
    // bonus the chef granted (capped at 100% by the server).
    const effectiveDiscountPct = tierDiscountPct + customDiscountPct;

    const partnerInfo = {
        name: reseller?.companyName || "...",
        id: reseller?.id ? `B2B-${reseller.id}` : "...",
        balance: Number(reseller?.wallet?.balance || 0),
        discount: effectiveDiscountPct,
        // Real monthly DZD volume (replaces orders.length as "Volume Total").
        monthlyVolumeDzd: monthlyVolume,
        totalOrders: orders.length,
        pendingOrders: orders.filter(o => o.status === "EN_ATTENTE").length,
        tierName: tier?.name ?? "—",
        tierColor: tier?.color ?? "#94a3b8",
    };

    // Low-balance alert (opt-in): reseller.lowBalanceThreshold NULL/<=0 = off.
    const lowBalanceThreshold = Number(reseller?.lowBalanceThreshold ?? 0);
    const isLowBalance =
        lowBalanceThreshold > 0 && partnerInfo.balance < lowBalanceThreshold;

    const recentOrders = orders.slice(0, 3).map(o => {
        // G2Bulk/IPTV/streaming orders carry no `items` rows — the real label
        // lives in the enriched `productNames`. Fall back gracefully.
        const names: string[] = o.productNames ?? [];
        const first = names[0] ?? "Commande";
        const extra = names.length > 1 ? ` +${names.length - 1}` : "";
        return {
            id: o.orderNumber,
            date: new Date(o.createdAt).toLocaleDateString(),
            amount: Number(o.totalAmount),
            status: o.status,
            items: first + extra,
        };
    });

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
                        <h3 className={`text-3xl font-black mb-2 ${isLowBalance ? "text-amber-400" : "text-white"}`}>
                            {formatCurrency(partnerInfo.balance, 'DZD')}
                        </h3>
                        {isLowBalance ? (
                            <Link
                                href="/reseller/wallet"
                                className="inline-flex items-center gap-1.5 text-amber-500 text-xs font-bold hover:underline"
                            >
                                <AlertTriangle className="size-4" />
                                <span>Solde bas — recharger</span>
                            </Link>
                        ) : (
                            <Link
                                href="/reseller/wallet"
                                className="inline-flex items-center gap-1.5 text-slate-400 text-xs font-bold hover:text-[var(--primary)] transition-colors"
                            >
                                <Plus className="size-4" />
                                <span>Recharger mon solde</span>
                            </Link>
                        )}
                    </CardBody>
                </Card>

                <Card className="bg-[#161616] border border-[#262626] rounded-[28px] overflow-hidden group">
                    <CardBody className="p-6 relative">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Percent className="size-20" />
                        </div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Remise Partenaire</p>
                        <h3 className="text-3xl font-black text-[var(--primary)] mb-2">{partnerInfo.discount.toFixed(0)}%</h3>
                        <div className="flex items-center gap-1.5 text-xs font-bold" style={{ color: partnerInfo.tierColor }}>
                            <span>Palier {partnerInfo.tierName}</span>
                        </div>
                    </CardBody>
                </Card>

                <Card className="bg-[#161616] border border-[#262626] rounded-[28px] overflow-hidden group">
                    <CardBody className="p-6 relative">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <ShoppingBag className="size-20" />
                        </div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Volume du mois</p>
                        <h3 className="text-3xl font-black text-white mb-2">{formatCurrency(partnerInfo.monthlyVolumeDzd, 'DZD')}</h3>
                        <div className="flex items-center gap-1.5 text-slate-500 text-xs font-bold">
                            <span>{partnerInfo.totalOrders} commande{partnerInfo.totalOrders > 1 ? 's' : ''} au total</span>
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
                        {recentOrders.length === 0 ? (
                            <div className="bg-[#161616] border border-dashed border-[#262626] rounded-2xl p-10 text-center">
                                <ShoppingBag className="size-10 text-slate-600 mx-auto mb-3" />
                                <p className="text-slate-300 font-bold mb-1">Aucune commande pour le moment</p>
                                <p className="text-slate-500 text-sm mb-5">
                                    Faites votre premier achat pour démarrer votre activité.
                                </p>
                                <Link
                                    href="/reseller/shop"
                                    className="inline-flex items-center gap-2 bg-[var(--primary)] hover:bg-orange-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95"
                                >
                                    <Plus className="size-4" /> Faire un premier achat
                                </Link>
                            </div>
                        ) : (
                        recentOrders.map((order) => {
                            const badge = orderBadge(order.status);
                            const iconCls = badge.delivered
                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                                : badge.cancelled
                                    ? "bg-red-500/10 border-red-500/20 text-red-500"
                                    : "bg-orange-500/10 border-orange-500/20 text-orange-500";
                            const chipCls = badge.delivered
                                ? "bg-emerald-500/10 text-emerald-500"
                                : badge.cancelled
                                    ? "bg-red-500/10 text-red-500"
                                    : "bg-amber-500/10 text-amber-500";
                            return (
                            <div key={order.id} className="bg-[#161616] border border-[#262626] rounded-2xl p-5 flex items-center justify-between group hover:border-[var(--primary)]/30 transition-all">
                                <div className="flex items-center gap-5">
                                    <div className={`size-12 rounded-xl flex items-center justify-center border ${iconCls}`}>
                                        <ShoppingBag className="size-6" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-bold text-white tracking-tight">{order.id}</h4>
                                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${chipCls}`}>
                                                {badge.label}
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
                            );
                        })
                        )}
                    </div>
                </div>

                {/* Quick Actions / Tips */}
                <div className="space-y-8">
                    <div className="bg-[#1a1614] border border-[#2d2622] rounded-[32px] p-8 overflow-hidden relative group">
                        <div className="absolute -top-10 -right-10 size-40 bg-[var(--primary)]/5 blur-[60px] rounded-full"></div>
                        <h3 className="text-lg font-black text-white mb-4">Besoin d&apos;aide ?</h3>
                        <p className="text-sm text-slate-400 leading-relaxed mb-8">
                            Votre remise de {partnerInfo.discount.toFixed(0)}% est appliquée automatiquement
                            sur tous vos achats. Le solde minimum de recharge est de 1000 DZD.
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
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-80 mb-2">Progression</p>
                        {nextTier ? (
                            <>
                                <h3 className="text-xl font-black mb-4 leading-tight">
                                    Passez au palier {nextTier.name} !
                                </h3>
                                <p className="text-sm text-white/80 leading-relaxed mb-4 font-medium">
                                    Atteignez {formatCurrency(parseFloat(nextTier.minMonthlyVolumeDzd), 'DZD')} de volume mensuel
                                    et bénéficiez de {parseFloat(nextTier.discountPct).toFixed(0)}% de remise.
                                </p>
                                <div className="mb-6">
                                    <div className="flex justify-between text-[10px] uppercase font-black opacity-80 mb-1.5">
                                        <span>Mois en cours</span>
                                        <span>
                                            {Math.min(
                                                100,
                                                Math.round(
                                                    (monthlyVolume /
                                                        Math.max(parseFloat(nextTier.minMonthlyVolumeDzd), 1)) *
                                                        100
                                                )
                                            )}
                                            %
                                        </span>
                                    </div>
                                    <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-white"
                                            style={{
                                                width: `${Math.min(
                                                    100,
                                                    (monthlyVolume /
                                                        Math.max(
                                                            parseFloat(nextTier.minMonthlyVolumeDzd),
                                                            1
                                                        )) *
                                                        100
                                                )}%`,
                                            }}
                                        />
                                    </div>
                                </div>
                                <Link
                                    href="/reseller/wallet?tab=stats"
                                    className="block w-full py-3 bg-white text-[var(--primary)] rounded-xl font-black text-sm text-center active:scale-95 transition-all"
                                >
                                    Voir détails
                                </Link>
                            </>
                        ) : (
                            <>
                                <h3 className="text-xl font-black mb-4 leading-tight">
                                    Palier maximum atteint
                                </h3>
                                <p className="text-sm text-white/80 leading-relaxed mb-6 font-medium">
                                    Vous êtes au palier le plus haut — {partnerInfo.discount.toFixed(0)}% de
                                    remise automatique sur tous vos achats.
                                </p>
                                <Link
                                    href="/reseller/wallet?tab=stats"
                                    className="block w-full py-3 bg-white text-[var(--primary)] rounded-xl font-black text-sm text-center active:scale-95 transition-all"
                                >
                                    Voir le détail
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
