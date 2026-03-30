"use client";

import React from "react";
import { Card, CardBody, Button, Chip } from "@heroui/react";
import {
    TrendingUp,
    AlertTriangle,
    Wallet,
    ShoppingBag,
    ArrowRight,
    Bell,
    Clock,
    Eye,
    Search,
    Printer,
    ChevronRight
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import OrderDetailModal from "./modals/OrderDetailModal";
import { cancelOrderAction } from "@/app/admin/caisse/actions";
import { useThermalPrinter } from "@/hooks/useThermalPrinter";
import { useWebUSBPrinter } from "@/hooks/useWebUSBPrinter";
import { generateOrderEscPos } from "@/lib/escpos";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useAuthStore } from "@/store/useAuthStore";
import { ThermalReceiptV2 } from "@/components/admin/receipt/ThermalReceiptV2";
import { Usb, Loader2 } from "lucide-react";
import {
    AreaChart,
    Area,
    ResponsiveContainer,
    XAxis,
    Tooltip as RechartsTooltip
} from 'recharts';

interface DashboardMobileProps {
    stats: {
        totalTurnover: number;
        turnoverChange: number;
        totalProfit: number;
        profitChange: number;
        ordersToday: number;
        ordersChange: number;
        pendingOrdersCount: number;
        latestOrders: any[];
        stockAlerts: number;
        openTicketsCount: number;
        revenueData: { name: string; total: number }[];
        notifications: any[];
        isMaintenanceMode: boolean;
    };
}

export default function DashboardMobile({ stats }: DashboardMobileProps) {
    const router = useRouter();
    const [searchTerm, setSearchTerm] = React.useState("");
    const [chartPeriod, setChartPeriod] = React.useState("7");
    const [selectedOrder, setSelectedOrder] = React.useState<any>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = React.useState(false);
    const { printToIframe } = useThermalPrinter();
    const settings = useSettingsStore();
    const { accentColor } = useSettingsStore();
    const webusb = useWebUSBPrinter();
    const { user } = useAuthStore();

    React.useEffect(() => {
        const interval = setInterval(() => {
            router.refresh();
        }, 30000);
        return () => clearInterval(interval);
    }, [router]);

    const handleViewOrder = (order: any) => {
        setSelectedOrder(order);
        setIsDetailModalOpen(true);
    };

    const filteredOrders = stats.latestOrders.filter(order =>
        order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.status.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex flex-col gap-6 pb-20">
            {/* Search Header */}
            <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input
                    type="text"
                    placeholder="Trouver une commande..."
                    className="w-full bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/5 rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-primary/50 transition-all font-bold text-sm text-slate-900 dark:text-white shadow-sm"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Sub-Header: Global Hardware Status */}
            <div className="flex items-center justify-between px-4 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-2xl mx-1 shadow-sm">
                <div className="flex items-center gap-2">
                    <div className={`size-2 rounded-full ${webusb.connected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`} />
                    <span className={`text-[10px] font-black uppercase tracking-tighter ${webusb.connected ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {webusb.connected ? 'Hardware Connecté' : 'Mode Standard'}
                    </span>
                </div>
                <button
                    onClick={webusb.connected ? webusb.disconnect : webusb.connect}
                    disabled={webusb.isConnecting}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all active:scale-95 ${webusb.connected ? 'bg-white/5 text-slate-400' : 'bg-[var(--primary)]/10 text-[var(--primary)]'
                        }`}
                >
                    {webusb.isConnecting ? <Loader2 size={12} className="animate-spin" /> : <Usb size={12} />}
                    {webusb.connected ? 'Off' : 'Connecter'}
                </button>
            </div>
            {/* Maintenance Warning */}
            {stats.isMaintenanceMode && (
                <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 p-4 rounded-3xl flex items-center gap-4 shadow-sm">
                    <AlertTriangle className="text-red-500 shrink-0" size={24} />
                    <p className="text-xs font-bold text-red-100 uppercase tracking-tighter">Mode Maintenance Actif</p>
                </div>
            )}

            {/* Quick Summary Cards */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/5 p-5 rounded-[2rem] space-y-2 shadow-sm">
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-slate-500 uppercase">Revenu</span>
                        <TrendingUp size={12} className="text-emerald-500" />
                    </div>
                    <p className="text-xl font-black text-slate-900 dark:text-white">
                        {user?.role === 'ADMIN' ? formatCurrency(stats.totalTurnover, 'DZD').split(',')[0] : '************'}
                        <span className="text-[10px] ml-1 opacity-50">DZD</span>
                    </p>
                    <p className="text-[9px] font-bold text-emerald-500">+{stats.turnoverChange.toFixed(0)}%</p>
                </div>
                <div className="bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/5 p-5 rounded-[2rem] space-y-2 shadow-sm">
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-slate-500 uppercase">Profit</span>
                        <Wallet size={12} className="text-primary" />
                    </div>
                    <p className="text-xl font-black text-slate-900 dark:text-white">
                        {user?.role === 'ADMIN' ? formatCurrency(stats.totalProfit, 'DZD').split(',')[0] : '************'}
                        <span className="text-[10px] ml-1 opacity-50">DZD</span>
                    </p>
                    <p className="text-[9px] font-bold text-primary">+{stats.profitChange.toFixed(0)}%</p>
                </div>
            </div>

            {/* Micro Chart - Only for Admin */}
            {user?.role === 'ADMIN' && (
                <div className="bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/5 p-6 rounded-[2.5rem] space-y-4 shadow-sm">
                    <div className="flex justify-between items-center px-2">
                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Activité</h3>
                        <div className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-[var(--primary)]"></span>
                            <span className="text-[10px] font-bold">Ventes</span>
                        </div>
                    </div>

                    <div className="flex bg-slate-100 dark:bg-[#0a0a0a] p-1 rounded-xl border border-slate-200 dark:border-white/5 w-fit ml-auto">
                        <button
                            onClick={async () => {
                                setChartPeriod("7");
                                router.refresh();
                            }}
                            className={`px-4 py-1.5 text-[10px] font-bold rounded-lg transition-all ${chartPeriod === "7" ? "bg-white dark:bg-[#262626] text-slate-900 dark:text-white shadow-sm" : "text-slate-500"}`}
                        >
                            7J
                        </button>
                        <button
                            onClick={async () => {
                                setChartPeriod("30");
                                router.refresh();
                            }}
                            className={`px-4 py-1.5 text-[10px] font-bold rounded-lg transition-all ${chartPeriod === "30" ? "bg-white dark:bg-[#262626] text-slate-900 dark:text-white shadow-sm" : "text-slate-500"}`}
                        >
                            30J
                        </button>
                    </div>

                    <div className="h-40 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={stats.revenueData}>
                                <defs>
                                    <linearGradient id="mobileGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={accentColor} stopOpacity={0.2} />
                                        <stop offset="95%" stopColor={accentColor} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="name" hide />
                                <RechartsTooltip
                                    contentStyle={{ backgroundColor: '#111', border: 'none', borderRadius: '12px', fontSize: '10px' }}
                                    itemStyle={{ color: accentColor }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="total"
                                    stroke={accentColor}
                                    strokeWidth={3}
                                    fill="url(#mobileGrad)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Action List */}
            <div className="space-y-4">
                <div className="flex justify-between items-center px-4">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Alertes & Actions</h3>
                </div>

                <div className="grid gap-3">
                    <Link href="/admin/caisse" className="flex items-center justify-between p-5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-3xl active:scale-95 transition-all shadow-sm">
                        <div className="flex items-center gap-4">
                            <div className="size-12 rounded-2xl bg-[var(--primary)]/10 flex items-center justify-center text-[var(--primary)]">
                                <ShoppingBag size={20} />
                            </div>
                            <div>
                                <p className="font-bold text-sm text-slate-900 dark:text-white">Attente Caisse</p>
                                <p className="text-[10px] text-slate-500 font-bold uppercase">{stats.pendingOrdersCount} commandes à encaisser</p>
                            </div>
                        </div>
                        <div className="size-8 rounded-full bg-white/5 flex items-center justify-center">
                            <ArrowRight size={14} className="text-slate-500" />
                        </div>
                    </Link>

                    <Link href="/admin/support" className="flex items-center justify-between p-5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-3xl active:scale-95 transition-all shadow-sm">
                        <div className="flex items-center gap-4">
                            <div className="size-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                                <Bell size={20} />
                            </div>
                            <div>
                                <p className="font-bold text-sm text-slate-900 dark:text-white">Tickets Support</p>
                                <p className="text-[10px] text-slate-500 font-bold uppercase">{stats.openTicketsCount} tickets ouverts</p>
                            </div>
                        </div>
                        <div className="size-8 rounded-full bg-white/5 flex items-center justify-center">
                            <ArrowRight size={14} className="text-slate-500" />
                        </div>
                    </Link>
                </div>
            </div>

            {/* Recent activity feed */}
            <div className="space-y-4 mt-2">
                <div className="flex justify-between items-center px-4">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Récent</h3>
                    <Link href="/admin/traitement" className="text-[9px] font-black text-primary uppercase">Tout voir</Link>
                </div>

                <div className="space-y-3">
                    {filteredOrders.slice(0, 10).map((order: any) => (
                        <div
                            key={order.id}
                            className="p-4 bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/5 rounded-[2rem] flex justify-between items-center active:scale-95 transition-all shadow-sm"
                            onClick={() => handleViewOrder(order)}
                        >
                            <div className="flex items-center gap-3">
                                <div className="size-10 rounded-2xl bg-white/5 flex items-center justify-center text-slate-500">
                                    <Clock size={16} />
                                </div>
                                <div>
                                    <p className="text-sm font-black text-slate-900 dark:text-white">#{order.orderNumber}</p>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase">{new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="text-right">
                                    <p className="text-sm font-black text-[var(--primary)]">
                                        {user?.role === 'ADMIN' ? formatCurrency(order.totalAmount, 'DZD') : '************'}
                                    </p>
                                    <div className="flex justify-end mt-1">
                                        <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${order.status === 'TERMINE' ? 'bg-emerald-500/10 text-emerald-500' :
                                            order.status === 'EN_ATTENTE' ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-500'
                                            }`}>
                                            {order.status.replace('_', ' ')}
                                        </span>
                                    </div>
                                </div>
                                <ChevronRight size={14} className="text-slate-700" />
                            </div>
                        </div>
                    ))}
                    {filteredOrders.length === 0 && (
                        <p className="py-10 text-center text-xs text-slate-600 font-bold uppercase">Aucun résultat</p>
                    )}
                </div>
            </div>

            <OrderDetailModal
                isOpen={isDetailModalOpen}
                onClose={() => setIsDetailModalOpen(false)}
                order={selectedOrder}
                onReprint={async () => {
                    if (!selectedOrder) return;

                    const printData = {
                        ...selectedOrder,
                        cashier: user?.nom || "Admin"
                    };

                    if (webusb.connected) {
                        try {
                            const buffer = generateOrderEscPos(printData, settings);
                            await webusb.print(buffer);
                            toast.success("Réimpression USB lancée");
                        } catch (e) {
                            console.error("Dashboard Mobile USB fail:", e);
                            toast.error("Erreur USB");
                        }
                    } else {
                        const printContent = document.getElementById('thermal-receipt-source');
                        if (printContent) {
                            toast.success("Lancement impression (standard)...");
                            printToIframe(selectedOrder.orderNumber, printContent.innerHTML);
                        }
                    }
                }}
            />

            {/* Hidden Print Container - Standardized for Audit Reliability */}
            {selectedOrder && (
                <div
                    id="thermal-receipt-source"
                    className="fixed -top-[9999px] -left-[9999px] opacity-0 pointer-events-none text-black bg-white"
                    aria-hidden="true"
                >
                    <ThermalReceiptV2
                        orderNumber={selectedOrder.orderNumber}
                        date={selectedOrder.createdAt}
                        items={selectedOrder.items.map((it: any) => ({
                            ...it,
                            codes: it.codes || [],
                            customData: it.customData,
                            playerNickname: it.playerNickname
                        }))}
                        totalAmount={selectedOrder.totalAmount}
                        paymentMethod={selectedOrder.paymentMethod}
                    />
                </div>
            )}
        </div>
    );
}
