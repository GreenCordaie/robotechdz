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
    Chip
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
    Search
} from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";

interface DashboardContentProps {
    stats: {
        totalTurnover: number;
        pendingOrdersCount: number;
        totalProfit: number;
        latestOrders: any[];
        stockAlerts: number;
    };
}

import OrderDetailModal from "./modals/OrderDetailModal";

export default function DashboardContent({ stats }: DashboardContentProps) {
    const [selectedOrder, setSelectedOrder] = React.useState<any>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = React.useState(false);
    const [searchTerm, setSearchTerm] = React.useState("");
    const [chartPeriod, setChartPeriod] = React.useState<"7" | "30">("7");

    const handleViewOrder = (order: any) => {
        setSelectedOrder(order);
        setIsDetailModalOpen(true);
    };

    const filteredOrders = stats.latestOrders.filter(order =>
        order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.status.toLowerCase().includes(searchTerm.toLowerCase())
    );
    return (
        <div className="flex-1 space-y-8 bg-[#0a0a0a] min-h-full">

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
                    <Button
                        isIconOnly
                        className="size-10 rounded-xl bg-[#161616] border border-[#262626] flex items-center justify-center hover:bg-[#262626] transition-colors"
                        onClick={() => toast.success("Aucune nouvelle notification")}
                    >
                        <Bell className="w-5 h-5 text-slate-400" />
                    </Button>
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
                        <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Chiffre d'Affaires</span>
                        <span className="px-2 py-0.5 bg-green-500/10 text-green-500 text-[10px] font-bold rounded-lg">+12%</span>
                    </div>
                    <div className="text-[28px] font-black leading-none text-white tracking-tighter">
                        {stats.totalTurnover.toLocaleString()} <span className="text-sm font-bold text-slate-500">DZD</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2 font-medium">Aujourd'hui</p>
                </div>

                {/* Profit */}
                <div className="bg-[#161616] border border-[#262626] p-6 rounded-xl shadow-sm hover:border-primary/20 transition-colors">
                    <div className="flex justify-between items-start mb-4">
                        <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Bénéfice Net</span>
                        <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-bold rounded-lg">+5%</span>
                    </div>
                    <div className="text-[28px] font-black leading-none text-white tracking-tighter">
                        {stats.totalProfit.toLocaleString()} <span className="text-sm font-bold text-slate-500">DZD</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2 font-medium">Estimé ce mois</p>
                </div>

                {/* Pending */}
                <div className="bg-[#161616] border border-[#262626] p-6 rounded-xl shadow-sm hover:border-primary/20 transition-colors">
                    <div className="flex justify-between items-start mb-4">
                        <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Commandes en attente</span>
                        <span className="px-2 py-0.5 bg-red-500/10 text-red-500 text-[10px] font-bold rounded-lg">Alerte</span>
                    </div>
                    <div className="text-[28px] font-black leading-none text-white tracking-tighter">
                        {stats.pendingOrdersCount}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2 font-medium">Nécessite action</p>
                </div>

                {/* Supplier Alerts */}
                <div className="bg-[#161616] border border-[#262626] p-6 rounded-xl shadow-sm hover:border-primary/20 transition-colors">
                    <div className="flex justify-between items-start mb-4">
                        <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Alertes Stock</span>
                        <AlertTriangle className={stats.stockAlerts > 0 ? "text-red-500 w-4 h-4" : "text-amber-500 w-4 h-4"} />
                    </div>
                    <div className={`text-[28px] font-black leading-none tracking-tighter ${stats.stockAlerts > 0 ? "text-red-500" : "text-white"}`}>
                        {stats.stockAlerts} <span className="text-sm font-bold opacity-70">En rupture</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2 font-medium">Attention requise</p>
                </div>
            </div>

            {/* Main Chart Section - 100% Visual Fidelity with SVG and #161616 */}
            <div className="bg-[#161616] border border-[#262626] p-8 rounded-xl shadow-sm">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h3 className="text-lg font-bold text-white tracking-tight">Évolution des Ventes</h3>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-3xl font-black text-white tracking-tighter">840,000 DZD</span>
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
                <div className="h-64 w-full relative">
                    <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 1000 200">
                        <defs>
                            <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0%" stopColor="#FF8000" stopOpacity="0.3"></stop>
                                <stop offset="100%" stopColor="#FF8000" stopOpacity="0"></stop>
                            </linearGradient>
                        </defs>
                        <line className="stroke-[#262626]" strokeDasharray="4" strokeWidth="1" x1="0" x2="1000" y1="0" y2="0"></line>
                        <line className="stroke-[#262626]" strokeDasharray="4" strokeWidth="1" x1="0" x2="1000" y1="50" y2="50"></line>
                        <line className="stroke-[#262626]" strokeDasharray="4" strokeWidth="1" x1="0" x2="1000" y1="100" y2="100"></line>
                        <line className="stroke-[#262626]" strokeDasharray="4" strokeWidth="1" x1="0" x2="1000" y1="150" y2="150"></line>
                        <path d="M 0 150 Q 83 140 166 60 Q 249 100 332 40 Q 415 120 498 70 Q 581 160 664 120 Q 747 30 830 90 Q 913 140 1000 110 V 200 H 0 Z" fill="url(#chartGradient)"></path>
                        <path d="M 0 150 Q 83 140 166 60 Q 249 100 332 40 Q 415 120 498 70 Q 581 160 664 120 Q 747 30 830 90 Q 913 140 1000 110" fill="none" stroke="#FF8000" strokeLinecap="round" strokeWidth="3"></path>
                        <circle cx="747" cy="30" fill="#FF8000" r="5" stroke="#161616" strokeWidth="2"></circle>
                    </svg>
                    <div className="flex justify-between mt-6 px-2">
                        {["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"].map((day) => (
                            <span key={day} className="text-[10px] font-bold text-slate-500 tracking-widest uppercase">{day}</span>
                        ))}
                    </div>
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
                                            {Number(order.totalAmount).toLocaleString()} <span className="text-[10px] opacity-50">DZD</span>
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
