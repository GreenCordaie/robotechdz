"use client";

import React, { useState, useMemo } from "react";
import {
    Spinner,
    Button,
    Input,
    Select,
    SelectItem,
    Tabs,
    Tab,
    Card,
    CardBody,
    Chip,
    Tooltip
} from "@heroui/react";
import toast from "react-hot-toast";
import {
    Search,
    Plus,
    Landmark,
    AlertTriangle,
    Settings,
    MoreVertical,
    Download,
    Filter,
    Calendar,
    CircleDollarSign,
    ArrowDownCircle,
    ArrowUpCircle,
    History,
    LayoutDashboard,
    Banknote,
    TrendingUp,
    ShieldCheck,
    Clock
} from "lucide-react";
import { markTransactionAsPaidAction } from "./actions";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/formatters";
import { AddSupplierModal } from "@/components/admin/modals/AddSupplierModal";
import { RechargeBalanceModal } from "@/components/admin/modals/RechargeBalanceModal";
import { PaySupplierModal } from "@/components/admin/modals/PaySupplierModal";
import { SupplierSettingsModal } from "@/components/admin/modals/SupplierSettingsModal";

interface Supplier {
    id: number;
    name: string;
    balance: string;
    currency: 'USD' | 'DZD';
    status: string;
}

interface Transaction {
    id: number;
    supplier: Supplier;
    type: string;
    amount: string;
    currency: string;
    reason: string | null;
    createdAt: string | Date;
    paymentStatus?: 'PAID' | 'UNPAID';
    paidAt?: string | Date | null;
    exchangeRate?: string | null;
}

interface SuppliersContentProps {
    initialSuppliers: Supplier[];
    initialHistory: Transaction[];
    initialStats?: {
        totalPaidDzd: string;
        totalUnpaidDzd: string;
        netProfit: string;
        exchangeRate: string;
    };
    shopSettings?: any;
}

export default function SuppliersContent({ initialSuppliers, initialHistory, initialStats, shopSettings }: SuppliersContentProps) {
    const router = useRouter();
    const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers || []);
    const [history, setHistory] = useState<Transaction[]>(initialHistory || []);

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isRechargeModalOpen, setIsRechargeModalOpen] = useState(false);
    const [isPayModalOpen, setIsPayModalOpen] = useState(false);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
    const [activeTab, setActiveTab] = useState("overview");
    const [isProcessing, setIsProcessing] = useState(false);

    // Filter states
    const [searchTerm, setSearchTerm] = useState("");
    const [filterSupplier, setFilterSupplier] = useState("all");
    const [filterDate, setFilterDate] = useState("today");
    const [filterAmount, setFilterAmount] = useState("all");
    const [searchHistory, setSearchHistory] = useState("");

    // Sync state when props change
    React.useEffect(() => {
        setSuppliers(initialSuppliers || []);
        setHistory(initialHistory || []);
    }, [initialSuppliers, initialHistory]);

    React.useEffect(() => {
        const interval = setInterval(() => {
            router.refresh();
        }, 5000);
        return () => clearInterval(interval);
    }, [router]);

    const stats = initialStats || { totalPaidDzd: "0", totalUnpaidDzd: "0", netProfit: "0", exchangeRate: "245" };
    const EXCHANGE_RATE_USD_DZD = parseFloat(stats.exchangeRate || "245");

    const totalSuppliedUsd = suppliers.reduce((acc, s) => acc + (s.currency === 'USD' ? parseFloat(s.balance || "0") : 0), 0);
    const totalSuppliedDzd = suppliers.reduce((acc, s) => acc + (s.currency === 'DZD' ? parseFloat(s.balance || "0") : 0), 0);
    const totalValeurDzd = totalSuppliedDzd + (totalSuppliedUsd * EXCHANGE_RATE_USD_DZD);

    const handleOpenRecharge = (supplier: Supplier) => {
        setSelectedSupplier(supplier);
        setIsRechargeModalOpen(true);
    };

    const handleMarkAsPaid = async (transactionId: number) => {
        setIsProcessing(true);
        try {
            const res = await markTransactionAsPaidAction({ transactionId });
            if (res.success) {
                toast.success("Transaction marquée comme payée");
                router.refresh();
            } else {
                toast.error(res.error || "Erreur lors de la mise à jour");
            }
        } catch (err) {
            toast.error("Erreur réseau");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleOpenSettings = (supplier: Supplier) => {
        setSelectedSupplier(supplier);
        setIsSettingsModalOpen(true);
    };

    const handleOpenPay = (supplier: Supplier) => {
        setSelectedSupplier(supplier);
        setIsPayModalOpen(true);
    };

    const filteredSuppliers = suppliers.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
        s.status !== 'ARCHIVE'
    );

    const alertsCount = suppliers.filter(s => {
        if (s.status === 'ARCHIVE') return false;
        const bal = parseFloat(s.balance || "0");
        const equivalentUsd = s.currency === 'USD' ? bal : bal / EXCHANGE_RATE_USD_DZD;
        return equivalentUsd < 100;
    }).length;

    const filteredHistory = useMemo(() => {
        return history.filter(h => {
            const matchesSearch = !searchHistory || (h.reason?.toLowerCase().includes(searchHistory.toLowerCase()) || h.type.toLowerCase().includes(searchHistory.toLowerCase()));
            const matchesSupplier = filterSupplier === "all" || h.supplier.id === parseInt(filterSupplier);

            // Date filter logic
            let matchesDate = true;
            if (filterDate === "today") {
                const today = new Date();
                const hDate = new Date(h.createdAt);
                matchesDate = today.toDateString() === hDate.toDateString();
            }

            // Amount filter logic
            let matchesAmount = true;
            if (filterAmount === "high") {
                matchesAmount = parseFloat(h.amount) > 1000;
            } else if (filterAmount === "low") {
                matchesAmount = parseFloat(h.amount) <= 1000;
            }

            return matchesSearch && matchesSupplier && matchesDate && matchesAmount;
        });
    }, [history, searchHistory, filterSupplier, filterDate, filterAmount]);

    const handleExportCSV = () => {
        const headers = ["Date", "Motif", "Fournisseur", "Montant", "Devise"];
        const rows = filteredHistory.map(h => [
            new Date(h.createdAt).toLocaleString(),
            h.reason || h.type,
            h.supplier.name,
            h.amount,
            h.currency
        ]);

        const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `journal_fournisseurs_${new Date().toISOString()}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="flex-1 flex flex-col font-sans antialiased text-slate-100 bg-[#0a0a0a] mx-[-32px] my-[-32px] min-h-screen">
            <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">

                {/* Header */}
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Gestion des Fournisseurs</h1>
                        <p className="text-slate-400 mt-1">Surveillez vos balances et gérez vos approvisionnements.</p>
                    </div>
                    <div className="flex items-center space-x-4">
                        <Button
                            onPress={() => setIsAddModalOpen(true)}
                            className="bg-[#ec5b13] hover:bg-orange-600 text-white font-bold h-11 px-6 rounded-xl flex items-center transition-all shadow-lg shadow-[#ec5b13]/20"
                            startContent={<Plus className="w-5 h-5 shrink-0" />}
                        >
                            Ajouter un Fournisseur
                        </Button>
                    </div>
                </header>

                {/* Tabs Navigation */}
                <div className="flex items-center space-x-8 border-b border-[#262626] mb-8 overflow-x-auto shrink-0">
                    <button
                        onClick={() => setActiveTab("overview")}
                        className={`pb-4 px-1 text-sm font-bold transition-colors relative whitespace-nowrap flex items-center gap-2 ${activeTab === "overview" ? "text-[#ec5b13]" : "text-slate-400 hover:text-white"}`}
                    >
                        <LayoutDashboard className="w-4 h-4 shrink-0" />
                        Vue d&apos;ensemble

                        {activeTab === "overview" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#ec5b13] rounded-full" />}
                    </button>
                    <button
                        onClick={() => setActiveTab("history")}
                        className={`pb-4 px-1 text-sm font-bold transition-colors relative whitespace-nowrap flex items-center gap-2 ${activeTab === "history" ? "text-[#ec5b13]" : "text-slate-400 hover:text-white"}`}
                    >
                        <History className="w-4 h-4 shrink-0" />
                        Journal de Caisse Fournisseurs
                        {activeTab === "history" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#ec5b13] rounded-full" />}
                    </button>
                </div>

                {activeTab === "overview" ? (
                    <>
                        {/* KPI Section */}
                        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                            <Card className="bg-[#161616] border border-[#262626] shadow-sm overflow-hidden group">
                                <CardBody className="p-6 relative">
                                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <Landmark className="w-12 h-12 text-white" />
                                    </div>
                                    <div className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">Valeur Stock (DZD)</div>
                                    <div className="text-2xl font-black mt-2 text-white">{formatCurrency(totalValeurDzd, 'DZD')}</div>
                                    <div className="mt-2 flex items-center gap-1.5">
                                        <span className="text-[10px] px-2 py-0.5 bg-white/5 rounded-full text-slate-500 font-bold border border-white/5">
                                            Cap. Brut: {formatCurrency(totalSuppliedUsd, 'USD')}
                                        </span>
                                    </div>
                                </CardBody>
                            </Card>

                            <Card className="bg-[#161616] border border-[#262626] shadow-sm overflow-hidden group">
                                <CardBody className="p-6 relative">
                                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <Banknote className="w-12 h-12 text-emerald-500" />
                                    </div>
                                    <div className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">Total Payé (DZD)</div>
                                    <div className="text-2xl font-black mt-2 text-emerald-500">{formatCurrency(stats.totalPaidDzd, 'DZD')}</div>
                                    <div className="mt-2 flex items-center gap-1">
                                        <ShieldCheck className="w-3 h-3 text-emerald-500/50" />
                                        <span className="text-[10px] text-emerald-500/50 font-bold">Flux sécurisé</span>
                                    </div>
                                </CardBody>
                            </Card>

                            <Card className={`bg-[#161616] border ${parseFloat(stats.totalUnpaidDzd) > 0 ? "border-orange-500/50" : "border-[#262626]"} shadow-sm overflow-hidden group transition-all duration-500`}>
                                <CardBody className="p-6 relative">
                                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <Clock className="w-12 h-12 text-orange-500" />
                                    </div>
                                    <div className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">Dettes Fournisseurs</div>
                                    <div className={`text-2xl font-black mt-2 ${parseFloat(stats.totalUnpaidDzd) > 0 ? "text-orange-500" : "text-slate-500"}`}>
                                        {formatCurrency(stats.totalUnpaidDzd, 'DZD')}
                                    </div>
                                    <div className="mt-2 flex items-center gap-1.5">
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-tighter ${parseFloat(stats.totalUnpaidDzd) > 0 ? "bg-orange-500/10 text-orange-500 animate-pulse" : "bg-white/5 text-slate-600"}`}>
                                            {parseFloat(stats.totalUnpaidDzd) > 0 ? "Paiements En Attente" : "Aucune Dette"}
                                        </span>
                                    </div>
                                </CardBody>
                            </Card>

                            <Card className="bg-[#161616] border border-[#ec5b13]/20 shadow-[0_0_20px_rgba(236,91,19,0.05)] overflow-hidden group">
                                <CardBody className="p-6 relative">
                                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <TrendingUp className="w-12 h-12 text-[#ec5b13]" />
                                    </div>
                                    <div className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">Profit Net Estimé</div>
                                    <div className="text-2xl font-black mt-2 text-[#ec5b13]">{formatCurrency(stats.netProfit, 'DZD')}</div>
                                    <div className="mt-2 flex items-center gap-1">
                                        <span className="text-[10px] text-[#ec5b13]/50 font-bold uppercase tracking-tight">Marge brute calculée</span>
                                    </div>
                                </CardBody>
                            </Card>
                        </section>

                        {/* Search and Filters for Grid */}
                        <div className="mb-6 flex justify-end">
                            <div className="relative group w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4 shrink-0 pointer-events-none group-focus-within:text-[#ec5b13] transition-colors" />
                                <input
                                    className="w-full bg-[#161616] border border-[#262626] rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#ec5b13] transition-all text-white placeholder:text-slate-600"
                                    placeholder="Rechercher un fournisseur..."
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Suppliers Grid */}
                        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                            {filteredSuppliers.map((s) => {
                                const bal = parseFloat(s.balance || "0");
                                const equivalentUsd = s.currency === 'USD' ? bal : bal / EXCHANGE_RATE_USD_DZD;
                                const isLow = equivalentUsd < 100;

                                return (
                                    <div
                                        key={s.id}
                                        className={`bg-[#161616] border rounded-2xl flex flex-col transition-all hover:translate-y-[-4px] hover:shadow-2xl group ${isLow ? 'border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.1)]' : 'border-[#262626] hover:border-white/10'}`}
                                    >
                                        <div className="p-6">
                                            <div className="flex items-center justify-between mb-6">
                                                <div className="flex items-center space-x-3">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black shrink-0 transition-transform group-hover:scale-110 ${s.name.includes("Prepaid") ? "bg-orange-500/20 text-orange-500" :
                                                        s.name.includes("Binance") ? "bg-yellow-500/20 text-yellow-500" : "bg-purple-500/20 text-purple-500"
                                                        }`}>
                                                        {s.name.substring(0, 2).toUpperCase()}
                                                    </div>
                                                    <div className="truncate font-bold text-lg text-white uppercase tracking-tight">{s.name}</div>
                                                </div>
                                                <Chip size="sm" variant="flat" className={`font-black uppercase text-[10px] ${!isLow ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500 animate-pulse"}`}>
                                                    {!isLow ? "Actif" : "Balance Basse"}
                                                </Chip>
                                            </div>
                                            <div className="space-y-1 mb-6">
                                                <div className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Solde disponible</div>
                                                <div className={`text-3xl font-black tracking-tighter whitespace-nowrap ${isLow ? 'text-red-500' : 'text-white'}`}>
                                                    {formatCurrency(bal, s.currency)}
                                                </div>
                                                {s.currency === 'USD' && (
                                                    <div className="flex items-center space-x-2 mt-2">
                                                        <span className="text-slate-400 text-xs font-bold">
                                                            ~ {formatCurrency(bal * EXCHANGE_RATE_USD_DZD, 'DZD')}
                                                        </span>
                                                        <span className="px-2 py-0.5 bg-[#262626] text-[10px] text-slate-300 rounded font-black uppercase tracking-tighter border border-white/5">{formatCurrency(EXCHANGE_RATE_USD_DZD, 'DZD')} / USD</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="mt-auto p-4 flex space-x-2 border-t border-[#262626] bg-[#262626]/20">
                                            <Button
                                                onPress={() => handleOpenRecharge(s)}
                                                className="flex-1 bg-[#262626] hover:bg-[#ec5b13] text-white font-bold rounded-xl text-xs transition-all uppercase tracking-widest"
                                            >
                                                Recharger
                                            </Button>
                                            <Button
                                                onPress={() => handleOpenPay(s)}
                                                className="flex-1 bg-blue-600/10 hover:bg-blue-600 text-blue-500 hover:text-white font-bold rounded-xl text-xs transition-all uppercase tracking-widest border border-blue-500/20"
                                                startContent={<Banknote className="w-3 h-3" />}
                                            >
                                                Payer Dette
                                            </Button>
                                            <Button
                                                isIconOnly
                                                aria-label="Paramètres du fournisseur"
                                                onPress={() => handleOpenSettings(s)}
                                                className="bg-transparent border border-[#262626] hover:bg-[#262626] text-slate-400 transition-colors"
                                            >
                                                <Settings className="w-5 h-5 shrink-0" />
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </section>
                    </>
                ) : (
                    <>
                        {/* Transaction History Filters */}
                        <div className="bg-[#161616] border border-[#262626] rounded-2xl p-4 mb-6 shadow-sm">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="relative group">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4 shrink-0 pointer-events-none group-focus-within:text-[#ec5b13] transition-colors" />
                                    <input
                                        className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-1 focus:ring-[#ec5b13] focus:border-[#ec5b13] text-white placeholder:text-slate-600 transition-all font-medium"
                                        placeholder="Filtrer motif / type..."
                                        type="text"
                                        value={searchHistory}
                                        onChange={(e) => setSearchHistory(e.target.value)}
                                    />
                                </div>
                                <div className="relative">
                                    <select
                                        className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl px-4 py-2 text-sm focus:ring-1 focus:ring-[#ec5b13] text-white appearance-none cursor-pointer font-medium"
                                        value={filterSupplier}
                                        onChange={(e) => setFilterSupplier(e.target.value)}
                                    >
                                        <option value="all">Tous les Fournisseurs</option>
                                        {suppliers.map(s => (
                                            <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                    </select>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                                        <ArrowDownCircle className="w-4 h-4 shrink-0" />
                                    </div>
                                </div>
                                <div className="relative">
                                    <select
                                        className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl px-4 py-2 text-sm focus:ring-1 focus:ring-[#ec5b13] text-white appearance-none cursor-pointer font-medium"
                                        value={filterDate}
                                        onChange={(e) => setFilterDate(e.target.value)}
                                    >
                                        <option value="all">Toutes les Dates</option>
                                        <option value="today">Aujourd&apos;hui</option>

                                    </select>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                                        <Calendar className="w-4 h-4 shrink-0" />
                                    </div>
                                </div>
                                <div className="relative">
                                    <select
                                        className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl px-4 py-2 text-sm focus:ring-1 focus:ring-[#ec5b13] text-white appearance-none cursor-pointer font-medium"
                                        value={filterAmount}
                                        onChange={(e) => setFilterAmount(e.target.value)}
                                    >
                                        <option value="all">Tous les Montants</option>
                                        <option value="high">Plus de 1000</option>
                                        <option value="low">1000 ou moins</option>
                                    </select>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                                        <CircleDollarSign className="w-4 h-4 shrink-0" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Transaction Table */}
                        <section className="bg-[#161616] border border-[#262626] rounded-2xl overflow-hidden mb-12 shadow-sm">
                            <div className="px-6 py-4 border-b border-[#262626] flex justify-between items-center bg-[#161616]">
                                <h2 className="font-black text-xs uppercase tracking-[0.2em] text-slate-400">Journal de Caisse</h2>
                                <div className="flex items-center space-x-2">
                                    <Button
                                        isIconOnly
                                        aria-label="Exporter en CSV"
                                        size="sm"
                                        variant="light"
                                        className="text-slate-500 hover:text-white transition-colors"
                                        onClick={handleExportCSV}
                                    >
                                        <Download className="w-4 h-4 shrink-0" />
                                    </Button>
                                    <Button
                                        isIconOnly
                                        aria-label="Filtrage avancé"
                                        size="sm"
                                        variant="light"
                                        className="text-slate-500 hover:text-white transition-colors"
                                        onClick={() => toast("Filtrage avancé bientôt disponible")}
                                    >
                                        <Filter className="w-4 h-4 shrink-0" />
                                    </Button>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left font-sans">
                                    <thead>
                                        <tr className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] bg-black/20 border-b border-[#262626]">
                                            <th className="px-6 py-4">Date & Heure</th>
                                            <th className="px-6 py-4">Mouvement / Détails</th>
                                            <th className="px-6 py-4">Fournisseur</th>
                                            <th className="px-6 py-4 text-right">Montant</th>
                                            <th className="px-6 py-4 text-center">Type</th>
                                            <th className="px-6 py-4 text-center">Paiement</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#262626]">
                                        {filteredHistory.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="px-6 py-12 text-center text-slate-500 font-bold uppercase tracking-widest text-xs">
                                                    Aucune transaction trouvée
                                                </td>
                                            </tr>
                                        ) : filteredHistory.map((h) => {
                                            const isDebit = h.type === "DEBIT" || h.type === "ACHAT_STOCK";
                                            const isPayment = h.type === "PAYMENT";
                                            const isUnpaid = h.type === "RECHARGE" && h.paymentStatus === "UNPAID";
                                            return (
                                                <tr key={h.id} className="hover:bg-white/[0.02] transition-colors group">
                                                    <td className="px-6 py-4 text-xs text-slate-400 font-bold whitespace-nowrap">
                                                        {new Date(h.createdAt).toLocaleDateString("fr-FR", { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-black text-white uppercase tracking-tight truncate max-w-[250px]">
                                                                {h.reason || (h.type === "RECHARGE" ? "Réapprovisionnement" : h.type)}
                                                            </span>
                                                            <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-0.5 opacity-50">#{h.id}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center space-x-2">
                                                            <div className={`size-6 rounded flex items-center justify-center text-[10px] font-black shrink-0 ${h.supplier.name.includes("Prepaid") ? "bg-orange-500/20 text-orange-500" :
                                                                h.supplier.name.includes("Binance") ? "bg-yellow-500/20 text-yellow-500" : "bg-purple-500/20 text-purple-500"
                                                                }`}>
                                                                {h.supplier.name.substring(0, 1).toUpperCase()}
                                                            </div>
                                                            <span className="text-xs font-bold text-slate-300 uppercase tracking-tight truncate max-w-[120px]">{h.supplier.name}</span>
                                                        </div>
                                                    </td>
                                                    <td className={`px-6 py-4 text-sm font-black text-right whitespace-nowrap ${isDebit ? 'text-red-500' : isPayment ? 'text-blue-500' : 'text-emerald-500'}`}>
                                                        <div className="flex flex-col items-end">
                                                            <span>{isDebit || isPayment ? '-' : '+'}{formatCurrency(h.amount, h.currency as any)}</span>
                                                            {h.exchangeRate && h.currency === 'USD' && (
                                                                <span className="text-[9px] text-slate-500 font-bold mt-1 bg-white/5 px-1.5 py-0.5 rounded">
                                                                    1$ = {h.exchangeRate} DZD
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <Chip size="sm" variant="flat" className={`font-black uppercase text-[9px] tracking-widest border-none ${isPayment ? "bg-blue-500/10 text-blue-500" : !isDebit ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}`}>
                                                            {h.type}
                                                        </Chip>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        {h.type === "RECHARGE" ? (
                                                            <div className="flex justify-center">
                                                                {h.paymentStatus === "PAID" ? (
                                                                    <Tooltip content={h.paidAt ? `Payé le ${new Date(h.paidAt).toLocaleDateString()}` : "Déjà payé"}>
                                                                        <Chip
                                                                            size="sm"
                                                                            startContent={<ShieldCheck size={12} />}
                                                                            className="bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase border-none h-6"
                                                                        >
                                                                            Payé
                                                                        </Chip>
                                                                    </Tooltip>
                                                                ) : (
                                                                    <Button
                                                                        size="sm"
                                                                        variant="solid"
                                                                        color="warning"
                                                                        isLoading={isProcessing}
                                                                        onPress={() => handleMarkAsPaid(h.id)}
                                                                        className="h-7 min-w-unit-0 px-3 text-[10px] font-black uppercase rounded-lg shadow-lg shadow-orange-500/20"
                                                                    >
                                                                        Marquer Payé
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">N/A</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    </>
                )}
            </main>

            <AddSupplierModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
            />

            <RechargeBalanceModal
                isOpen={isRechargeModalOpen}
                onClose={() => setIsRechargeModalOpen(false)}
                supplierId={selectedSupplier?.id || 0}
                supplierName={selectedSupplier?.name || ""}
                currentBalance={selectedSupplier?.balance || "0"}
                exchangeRate={EXCHANGE_RATE_USD_DZD.toString()}
                baseCurrency={selectedSupplier?.currency || 'USD'}
            />

            <PaySupplierModal
                isOpen={isPayModalOpen}
                onClose={() => setIsPayModalOpen(false)}
                supplierId={selectedSupplier?.id || 0}
                supplierName={selectedSupplier?.name || ""}
                currentDebt={useMemo(() => {
                    if (!selectedSupplier) return 0;
                    return history.filter(h => h.supplier.id === selectedSupplier.id).reduce((acc, h) => {
                        const amount = parseFloat(h.amount);
                        const rate = h.exchangeRate ? parseFloat(h.exchangeRate) : EXCHANGE_RATE_USD_DZD;
                        const dzd = h.currency === 'USD' ? amount * rate : amount;
                        if (h.type === 'RECHARGE' && h.paymentStatus === 'UNPAID') return acc + dzd;
                        if (h.type === 'PAYMENT') return acc - dzd;
                        return acc;
                    }, 0);
                }, [selectedSupplier, history, EXCHANGE_RATE_USD_DZD])}
                exchangeRate={EXCHANGE_RATE_USD_DZD.toString()}
                baseCurrency={selectedSupplier?.currency || 'USD'}
            />

            <SupplierSettingsModal
                isOpen={isSettingsModalOpen}
                onClose={() => setIsSettingsModalOpen(false)}
                supplier={selectedSupplier}
            />
        </div>
    );
}
