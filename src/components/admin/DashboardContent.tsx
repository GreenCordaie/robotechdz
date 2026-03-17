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

export default function DashboardContent({ stats }: DashboardContentProps) {
    const router = useRouter();
    const [selectedOrder, setSelectedOrder] = React.useState<any>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = React.useState(false);
    const [searchTerm, setSearchTerm] = React.useState("");
    const [chartPeriod, setChartPeriod] = React.useState<"7" | "30">("7");

    React.useEffect(() => {
        const interval = setInterval(() => {
            router.refresh();
        }, 3000);
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
        <div className="flex-1 space-y-8 bg-[#0a0a0a] min-h-full">

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
            <header className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <h2 className="text-xl font-bold text-white tracking-tight">Dashboard Overview</h2>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
                        <Input
                            classNames={{
                                input: "pl-10 text-white",
                                inputWrapper: "bg-[#161616] border border-[#262626] rounded-xl h-10 text-sm focus-within:ring-2 focus-within:ring-primary/50"
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
                                className="size-10 rounded-xl bg-[#161616] border border-[#262626] flex items-center justify-center hover:bg-[#262626] transition-colors relative"
                            >
                                <Bell className="w-5 h-5 text-slate-400" />
                                {stats.notifications.length > 0 && (
                                    <span className="absolute top-2 right-2 w-2 h-2 bg-[#ec5b13] rounded-full ring-2 ring-[#161616]" />
                                )}
                            </Button>
                        </DropdownTrigger>
                        <DropdownMenu
                            aria-label="Notifications systeme"
                            className="w-80 p-2"
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
                    <Button
                        isIconOnly
                        className="size-10 rounded-xl bg-[#161616] border border-[#262626] flex items-center justify-center hover:bg-[#262626] transition-colors"
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
                <div className="bg-[#161616] border border-[#262626] p-6 rounded-xl shadow-sm hover:border-primary/20 transition-colors">
                    <div className="flex justify-between items-start mb-4">
                        <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Chiffre d&apos;Affaires</span>
                        <span className={`px-2 py-0.5 ${stats.turnoverChange >= 0 ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"} text-[10px] font-bold rounded-lg`}>
                            {stats.turnoverChange >= 0 ? "+" : ""}{stats.turnoverChange.toFixed(0)}%
                        </span>
                    </div>
                    <div className="text-[28px] font-black leading-none text-white tracking-tighter">
                        {formatCurrency(stats.totalTurnover, 'DZD')}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2 font-medium">Ventes aujourd&apos;hui</p>
                </div>

                {/* Profit */}
                <div className="bg-[#161616] border border-[#262626] p-6 rounded-xl shadow-sm hover:border-primary/20 transition-colors">
                    <div className="flex justify-between items-start mb-4">
                        <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Bénéfice Net</span>
                        <span className={`px-2 py-0.5 ${stats.profitChange >= 0 ? "bg-primary/10 text-primary" : "bg-red-500/10 text-red-500"} text-[10px] font-bold rounded-lg`}>
                            {stats.profitChange >= 0 ? "+" : ""}{stats.profitChange.toFixed(0)}%
                        </span>
                    </div>
                    <div className="text-[28px] font-black leading-none text-white tracking-tighter">
                        {formatCurrency(stats.totalProfit, 'DZD')}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2 font-medium">Aujourd&apos;hui vs Hier</p>
                </div>

                {/* Orders */}
                <div className="bg-[#161616] border border-[#262626] p-6 rounded-xl shadow-sm hover:border-primary/20 transition-colors">
                    <div className="flex justify-between items-start mb-4">
                        <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Commandes</span>
                        <span className={`px-2 py-0.5 ${stats.ordersChange >= 0 ? "bg-blue-500/10 text-blue-500" : "bg-red-500/10 text-red-500"} text-[10px] font-bold rounded-lg`}>
                            {stats.ordersChange >= 0 ? "+" : ""}{stats.ordersChange.toFixed(0)}%
                        </span>
                    </div>
                    <div className="text-[28px] font-black leading-none text-white tracking-tighter">
                        {stats.ordersToday}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2 font-medium">{stats.pendingOrdersCount} en attente</p>
                </div>

                {/* Support Tickets */}
                <Link href="/admin/support" className="bg-[#161616] border border-[#262626] p-6 rounded-xl shadow-sm hover:border-primary/20 transition-colors group">
                    <div className="flex justify-between items-start mb-4">
                        <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Tickets Support</span>
                        <MessageSquare className={`${stats.openTicketsCount > 0 ? "text-red-500" : "text-emerald-500"} w-4 h-4 transition-colors`} />
                    </div>
                    <div className={`text-[28px] font-black leading-none tracking-tighter ${stats.openTicketsCount > 0 ? "text-red-500" : "text-emerald-500"} transition-colors`}>
                        {stats.openTicketsCount} <span className="text-sm font-bold opacity-70 uppercase">{stats.openTicketsCount === 1 ? 'Actif' : 'Actifs'}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2 font-medium group-hover:text-primary transition-colors">Gérer l&apos;assistance client</p>
                </Link>
            </div>

            {/* Main Chart Section - 100% Visual Fidelity with SVG and #161616 */}
            <div className="bg-[#161616] border border-[#262626] p-8 rounded-xl shadow-sm">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h3 className="text-lg font-bold text-white tracking-tight">Évolution des Ventes</h3>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-3xl font-black text-white tracking-tighter">{formatCurrency(stats.totalTurnover, 'DZD')}</span>
                            <span className="text-green-500 font-bold text-sm flex items-center gap-1">
                                <TrendingUp className="w-4 h-4" /> +8.4%
                            </span>
                        </div>
                    </div>
                    <div className="flex bg-[#0a0a0a] p-1 rounded-xl border border-[#262626]">
                        <button
                            onClick={() => setChartPeriod("7")}
                            className={`px-4 py-1.5 text-[11px] font-bold rounded-lg shadow-sm transition-all ${chartPeriod === "7" ? "bg-[#262626] text-white" : "text-slate-500 hover:text-white"}`}
                        >
                            7 Jours
                        </button>
                        <button
                            onClick={() => setChartPeriod("30")}
                            className={`px-4 py-1.5 text-[11px] font-bold rounded-lg shadow-sm transition-all ${chartPeriod === "30" ? "bg-[#262626] text-white" : "text-slate-500 hover:text-white"}`}
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
                                    <stop offset="5%" stopColor="#ec5b13" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#ec5b13" stopOpacity={0} />
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
                                itemStyle={{ color: '#ec5b13', fontWeight: 'bold' }}
                            />
                            <Area
                                type="monotone"
                                dataKey="total"
                                stroke="#ec5b13"
                                strokeWidth={3}
                                fillOpacity={1}
                                fill="url(#colorTotal)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Latest Orders Section - 161616 Background */}
            <div className="bg-[#161616] border border-[#262626] rounded-xl shadow-sm overflow-hidden">
                <div className="p-6 border-b border-[#262626] flex items-center justify-between">
                    <h3 className="text-lg font-bold text-white">Dernières Commandes</h3>
                    <Button
                        variant="light"
                        color="primary"
                        className="font-bold text-sm"
                        as={Link}
                        href="/admin/traitement"
                    >
                        Voir tout
                    </Button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest bg-[#262626]/50">
                                <th className="px-6 py-4">Commande ID</th>
                                <th className="px-6 py-4">Heure</th>
                                <th className="px-6 py-4 text-right">Montant</th>
                                <th className="px-6 py-4">Statut</th>
                                <th className="px-6 py-4 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#262626]">
                            {filteredOrders.length > 0 ? (
                                filteredOrders.map((order) => (
                                    <tr key={order.id} className="hover:bg-white/5 transition-colors">
                                        <td className="px-6 py-4 font-bold text-sm text-white">{order.orderNumber}</td>
                                        <td className="px-6 py-4 text-xs text-slate-500 font-medium">
                                            {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td className="px-6 py-4 text-right font-black text-sm whitespace-nowrap text-white">
                                            {formatCurrency(order.totalAmount, 'DZD')}
                                        </td>
                                        <td className="px-6 py-4">
                                            <Chip
                                                size="sm"
                                                variant="flat"
                                                className="font-black text-[10px] uppercase"
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
                                                className="text-slate-500 hover:text-white transition-colors hover:bg-[#262626]"
                                                onClick={() => handleViewOrder(order)}
                                            >
                                                <Eye className="w-4 h-4" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500 text-sm">Aucune commande récente</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            {/* SAV Detail Modal */}
            <OrderDetailModal
                isOpen={isDetailModalOpen}
                onClose={() => setIsDetailModalOpen(false)}
                order={selectedOrder}
                onReprint={() => window.print()}
            />
        </div>
    );
}
