"use client";

import React from "react";
import {
    Button,
    Card,
    CardBody,
    Input,
    Table,
    TableHeader,
    TableColumn,
    TableBody,
    TableRow,
    TableCell,
    Chip,
    Dropdown,
    DropdownTrigger,
    DropdownMenu,
    DropdownItem
} from "@heroui/react";
import {
    LayoutDashboard,
    BookOpen,
    Wallet,
    Settings,
    Truck,
    Eye,
    TrendingUp,
    AlertTriangle,
    Bell,
    Search,
    MessageSquare
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { formatCurrency } from "@/lib/formatters";
import { useAuthStore } from "@/store/useAuthStore";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts';

interface DashboardContentProps {
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

import OrderDetailModal from "./modals/OrderDetailModal";
import { cancelOrderAction } from "@/app/admin/caisse/actions";
import { getDashboardStats } from "@/app/admin/dashboard/actions";
import { useThermalPrinter } from "@/hooks/useThermalPrinter";
import { useWebUSBPrinter } from "@/hooks/useWebUSBPrinter";
import { generateOrderEscPos } from "@/lib/escpos";
import { useSettingsStore } from "@/store/useSettingsStore";
import { ThermalReceiptV2 } from "@/components/admin/receipt/ThermalReceiptV2";
import { Usb, Loader2, Activity } from "lucide-react";
import { LiveActivityFeed } from "./dashboard/LiveActivityFeed";
import { useLiveEvents } from "@/hooks/useLiveEvents";

export default function DashboardContent({ stats }: DashboardContentProps) {
    const { user } = useAuthStore();
    const router = useRouter();
    const { isConnected } = useLiveEvents(); // Centrally handles global refresh on events

    const [selectedOrder, setSelectedOrder] = React.useState<any>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = React.useState(false);
    const [searchTerm, setSearchTerm] = React.useState("");
    const [chartPeriod, setChartPeriod] = React.useState<"7" | "30">("7");
    const { printToIframe } = useThermalPrinter();
    const settings = useSettingsStore();
    const { accentColor } = useSettingsStore();
    const webusb = useWebUSBPrinter();

    // The useLiveEvents hook already handles router.refresh() on relevant events.
    // We can remove the local setInterval or keep it as a very slow fallback (e.g. 2 mins).
    React.useEffect(() => {
        const interval = setInterval(() => {
            router.refresh();
        }, 120000); // Slow fallback 2m
        return () => clearInterval(interval);
    }, [router]);

    const handleViewOrder = (order: any) => {
        setSelectedOrder(order);
        setIsDetailModalOpen(true);
    };

    const handleCancelOrder = async (orderId: number) => {
        if (!confirm("Êtes-vous sûr de vouloir annuler/rembourser cette commande ? Cette action est irréversible.")) return;
        try {
            const res = await cancelOrderAction({ orderId });
            if (res.success) {
                toast.success("Commande annulée");
                setIsDetailModalOpen(false);
                window.location.reload(); // Quick refresh for dashboard stats
            } else {
                toast.error("Erreur: " + (res as any).error);
            }
        } catch (error) {
            toast.error("Erreur technique");
        }
    };

    const filteredOrders = stats.latestOrders.filter(order =>
        order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.status.toLowerCase().includes(searchTerm.toLowerCase())
    );
    return (
        <div className="flex-1 space-y-8 bg-background-light dark:bg-[#0a0a0a] min-h-full">

            {stats.isMaintenanceMode && (
                <div className="bg-red-500/20 border-2 border-red-500 p-4 rounded-2xl flex items-center justify-between animate-pulse shadow-lg shadow-red-500/10">
                    <div className="flex items-center gap-4">
                        <div className="size-12 rounded-xl bg-red-500 flex items-center justify-center text-white">
                            <AlertTriangle className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-red-100 uppercase tracking-tighter">Mode Maintenance Actif</h3>
                            <p className="text-sm text-red-200/70 font-medium">Tous les accès non-administrateurs sont bloqués. Le système est en sécurité mode.</p>
                        </div>
                    </div>
                    <Button
                        as={Link}
                        href="/admin/settings"
                        variant="flat"
                        color="danger"
                        className="font-bold uppercase tracking-widest text-[10px]"
                    >
                        Accéder aux réglages
                    </Button>
                </div>
            )}

            {/* Header matches Stitch structure */}
            <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-8">
                <div className="flex items-center gap-4">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Dashboard Overview</h2>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative w-full max-w-xs md:w-72 shrink-0">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
                        <Input
                            classNames={{
                                input: "pl-10 text-slate-900 dark:text-white",
                                inputWrapper: "bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-white/10 rounded-xl h-11 text-sm focus-within:ring-2 focus-within:ring-[var(--primary)]/50 transition-all font-medium"
                            }}
                            placeholder="Rechercher une commande..."
                            value={searchTerm}
                            onValueChange={setSearchTerm}
                        />
                    </div>
                    <Dropdown placement="bottom-end">
                        <DropdownTrigger>
                            <Button
                                isIconOnly
                                className="size-11 rounded-xl bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-white/10 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-zinc-800 transition-all relative shadow-sm"
                            >
                                <Bell className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                                {stats.notifications.length > 0 && (
                                    <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-[var(--primary)] rounded-full ring-2 ring-white dark:ring-zinc-900" />
                                )}
                            </Button>
                        </DropdownTrigger>
                        <DropdownMenu
                            aria-label="Notifications systeme"
                            className="w-[calc(100vw-2rem)] md:w-80 p-2"
                            emptyContent="Aucune notification"
                        >
                            {stats.notifications.map((notif: any) => (
                                <DropdownItem
                                    key={notif.id}
                                    description={notif.message}
                                    startContent={
                                        <div className={`p-1.5 rounded-lg ${notif.type === 'danger' ? 'bg-red-500/10 text-red-500' :
                                            notif.type === 'warning' ? 'bg-orange-500/10 text-orange-500' :
                                                'bg-blue-500/10 text-blue-500'
                                            }`}>
                                            <AlertTriangle className="w-3.5 h-3.5" />
                                        </div>
                                    }
                                    classNames={{
                                        base: "py-3 border-b border-white/5 last:border-0",
                                        title: "font-bold text-xs uppercase tracking-wider",
                                        description: "text-[10px] text-slate-400 leading-relaxed mt-0.5"
                                    }}
                                >
                                    {notif.title}
                                </DropdownItem>
                            ))}
                        </DropdownMenu>
                    </Dropdown>

                    {/* WebUSB Hardware UI */}
                    <div className="flex items-center gap-2 pl-3 border-l border-white/10 mx-1">
                        <div className={`hidden lg:flex items-center gap-1.5 px-2 py-1 rounded-md border text-[9px] font-black uppercase transition-all ${webusb.connected
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                            : "bg-red-500/10 border-red-500/20 text-red-400"
                            }`}>
                            <div className={`size-1.5 rounded-full ${webusb.connected ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
                            {webusb.connected ? "PRÊT" : "OFF"}
                        </div>
                        <Button
                            isIconOnly
                            className={`size-10 rounded-xl border border-white/5 flex items-center justify-center transition-all ${webusb.connected ? "bg-zinc-800 text-slate-400" : "bg-primary/10 text-primary border-primary/20"
                                }`}
                            onClick={webusb.connected ? webusb.disconnect : webusb.connect}
                            disabled={webusb.isConnecting}
                        >
                            {webusb.isConnecting ? <Loader2 className="size-5 animate-spin" /> : <Usb className="size-5" />}
                        </Button>
                    </div>

                    <Button
                        isIconOnly
                        className="size-10 rounded-xl bg-white dark:bg-[#161616] border border-slate-200 dark:border-[#262626] flex items-center justify-center hover:bg-slate-50 dark:hover:bg-[#262626] transition-colors"
                        as={Link}
                        href="/admin/settings"
                    >
                        <Settings className="w-5 h-5 text-slate-400" />
                    </Button>
                </div>
            </header>

            {/* Stats Cards - Exact Stitch Fidelity Image 2 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Turnover */}
                <div className="card-premium p-6 hover:border-[var(--primary)]/30">
                    <div className="flex justify-between items-start mb-4">
                        <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Chiffre d&apos;Affaires</span>
                        <span className={`px-2 py-1 ${stats.turnoverChange >= 0 ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"} text-[10px] font-bold rounded-lg`}>
                            {stats.turnoverChange >= 0 ? "+" : ""}{stats.turnoverChange.toFixed(0)}%
                        </span>
                    </div>
                    <div className="text-[28px] font-black leading-none text-slate-900 dark:text-white tracking-tighter">
                        {user?.role === 'ADMIN' ? formatCurrency(stats.totalTurnover, 'DZD') : '************'}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-3 font-medium">Ventes aujourd&apos;hui</p>
                </div>

                {/* Profit */}
                <div className="card-premium p-6 hover:border-[var(--primary)]/30">
                    <div className="flex justify-between items-start mb-4">
                        <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Bénéfice Net</span>
                        <span className={`px-2 py-1 ${stats.profitChange >= 0 ? "bg-[var(--primary)]/10 text-[var(--primary)]" : "bg-red-500/10 text-red-500"} text-[10px] font-bold rounded-lg`}>
                            {stats.profitChange >= 0 ? "+" : ""}{stats.profitChange.toFixed(0)}%
                        </span>
                    </div>
                    <div className="text-[28px] font-black leading-none text-slate-900 dark:text-white tracking-tighter">
                        {user?.role === 'ADMIN' ? formatCurrency(stats.totalProfit, 'DZD') : '************'}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-3 font-medium">Aujourd&apos;hui vs Hier</p>
                </div>

                {/* Orders */}
                <div className="card-premium p-6 hover:border-[var(--primary)]/30">
                    <div className="flex justify-between items-start mb-4">
                        <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Commandes</span>
                        <span className={`px-2 py-1 ${stats.ordersChange >= 0 ? "bg-blue-500/10 text-blue-500" : "bg-red-500/10 text-red-500"} text-[10px] font-bold rounded-lg`}>
                            {stats.ordersChange >= 0 ? "+" : ""}{stats.ordersChange.toFixed(0)}%
                        </span>
                    </div>
                    <div className="text-[28px] font-black leading-none text-slate-900 dark:text-white tracking-tighter">
                        {stats.ordersToday}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-3 font-medium">{stats.pendingOrdersCount} en attente</p>
                </div>

                {/* Support Tickets */}
                <Link href="/admin/support" className="card-premium p-6 hover:border-[var(--primary)]/30 group">
                    <div className="flex justify-between items-start mb-4">
                        <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Tickets Support</span>
                        <MessageSquare className={`${stats.openTicketsCount > 0 ? "text-red-500" : "text-emerald-500"} w-4 h-4 transition-colors`} />
                    </div>
                    <div className={`text-[28px] font-black leading-none tracking-tighter ${stats.openTicketsCount > 0 ? "text-red-500" : "text-emerald-500"} transition-colors`}>
                        {stats.openTicketsCount} <span className="text-sm font-bold opacity-70 uppercase">{stats.openTicketsCount === 1 ? 'Actif' : 'Actifs'}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-3 font-medium group-hover:text-[var(--primary)] transition-colors">Gérer l&apos;assistance client</p>
                </Link>
            </div>

            {/* Main Chart Section - Only for Admin */}
            {user?.role === 'ADMIN' && (
                <div className="card-premium p-8">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">Évolution des Ventes</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter">
                                    {formatCurrency(stats.totalTurnover, 'DZD')}
                                </span>
                                <span className={`${stats.turnoverChange >= 0 ? "text-green-500" : "text-red-500"} font-bold text-sm flex items-center gap-1`}>
                                    {stats.turnoverChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4 rotate-180" />}
                                    {stats.turnoverChange >= 0 ? "+" : ""}{stats.turnoverChange.toFixed(1)}%
                                </span>
                            </div>
                        </div>
                        <div className="flex bg-slate-50 dark:bg-[#0a0a0a] p-1 rounded-xl border border-slate-200 dark:border-[#262626]">
                            <button
                                onClick={async () => {
                                    setChartPeriod("7");
                                    // Map "7" to "week" for the server action
                                    const res = await getDashboardStats({ period: "week" });
                                    if (res) router.refresh();
                                }}
                                className={`px-4 py-1.5 text-[11px] font-bold rounded-lg shadow-sm transition-all ${chartPeriod === "7" ? "bg-white dark:bg-[#262626] text-slate-900 dark:text-white" : "text-slate-500 hover:text-slate-700 dark:hover:text-white"}`}
                            >
                                7 Jours
                            </button>
                            <button
                                onClick={async () => {
                                    setChartPeriod("30");
                                    // Map "30" to "month" for the server action
                                    const res = await getDashboardStats({ period: "month" });
                                    if (res) router.refresh();
                                }}
                                className={`px-4 py-1.5 text-[11px] font-bold rounded-lg shadow-sm transition-all ${chartPeriod === "30" ? "bg-white dark:bg-[#262626] text-slate-900 dark:text-white" : "text-slate-500 hover:text-slate-700 dark:hover:text-white"}`}
                            >
                                30 Jours
                            </button>
                        </div>
                    </div>
                    <div className="h-72 w-full relative">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart
                                data={stats.revenueData}
                                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                            >
                                <defs>
                                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={accentColor} stopOpacity={0.3} />
                                        <stop offset="95%" stopColor={accentColor} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                                <XAxis
                                    dataKey="name"
                                    stroke="#64748b"
                                    fontSize={10}
                                    tickLine={false}
                                    axisLine={false}
                                    dy={10}
                                />
                                <YAxis
                                    stroke="#64748b"
                                    fontSize={10}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => `${value}`}
                                    hide
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#161616',
                                        border: '1px solid #262626',
                                        borderRadius: '8px',
                                        fontSize: '12px'
                                    }}
                                    itemStyle={{ color: accentColor, fontWeight: 'bold' }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="total"
                                    stroke={accentColor}
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorTotal)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mt-8">
                {/* Latest Orders Section - Now 3/4 width */}
                <div className="lg:col-span-3 card-premium overflow-hidden">
                    <div className="p-6 border-b border-zinc-100 dark:border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Dernières Commandes</h3>
                            {isConnected && <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />}
                        </div>
                        <Button
                            variant="flat"
                            color="primary"
                            size="sm"
                            className="font-bold text-[11px] uppercase tracking-wider"
                            as={Link}
                            href="/admin/traitement"
                        >
                            Voir tout
                        </Button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest bg-slate-50/50 dark:bg-white/5">
                                    <th className="px-6 py-4">Commande ID</th>
                                    <th className="px-6 py-4">Heure</th>
                                    <th className="px-6 py-4 text-right">Montant</th>
                                    <th className="px-6 py-4">Statut</th>
                                    <th className="px-6 py-4 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                                {filteredOrders.length > 0 ? (
                                    filteredOrders.map((order) => (
                                        <tr key={order.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group">
                                            <td className="px-6 py-4 font-bold text-sm text-slate-900 dark:text-white">{order.orderNumber}</td>
                                            <td className="px-6 py-4 text-xs text-slate-500 dark:text-slate-400 font-medium">
                                                {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                            <td className="px-6 py-4 text-right font-black text-sm whitespace-nowrap text-slate-900 dark:text-white">
                                                {user?.role === 'ADMIN' ? formatCurrency(order.totalAmount, 'DZD') : '************'}
                                            </td>
                                            <td className="px-6 py-4">
                                                <Chip
                                                    size="sm"
                                                    variant="flat"
                                                    className="font-bold text-[10px] uppercase px-2"
                                                    color={order.status === "TERMINE" ? "success" : order.status === "EN_ATTENTE" ? "warning" : order.status === "PAYE" ? "primary" : "danger"}
                                                >
                                                    {order.status === "EN_ATTENTE" ? "En attente" : order.status === "PAYE" ? "Payé" : order.status === "TERMINE" ? "Terminé" : "Annulé"}
                                                </Chip>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <Button
                                                    isIconOnly
                                                    size="sm"
                                                    variant="light"
                                                    className="text-slate-400 group-hover:text-[var(--primary)] transition-all"
                                                    onClick={() => handleViewOrder(order)}
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </Button>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-slate-400 text-sm italic">Aucune commande récente</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Live Activity Feed - 1/4 width */}
                <div className="lg:col-span-1 border-l border-zinc-100 dark:border-white/5 pl-6">
                    <LiveActivityFeed />
                </div>
            </div>
            {/* SAV Detail Modal */}
            <OrderDetailModal
                isOpen={isDetailModalOpen}
                onClose={() => setIsDetailModalOpen(false)}
                order={selectedOrder}
                onReprint={async () => {
                    if (!selectedOrder) return;

                    if (webusb.connected) {
                        try {
                            const buffer = generateOrderEscPos(selectedOrder, settings);
                            await webusb.print(buffer);
                            toast.success("Réimpression USB lancée");
                        } catch (e) {
                            console.error("Dashboard USB print fail:", e);
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

            {/* Hidden Print Container */}
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
                        remise={selectedOrder.remise}
                        paymentMethod={selectedOrder.paymentMethod}
                        totalClientDebt={selectedOrder.totalClientDebt}
                    />
                </div>
            )}
        </div>
    );
}
