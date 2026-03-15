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
    Chip
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
    LayoutDashboard
} from "lucide-react";
import { AddSupplierModal } from "@/components/admin/modals/AddSupplierModal";
import { RechargeBalanceModal } from "@/components/admin/modals/RechargeBalanceModal";
import { SupplierSettingsModal } from "@/components/admin/modals/SupplierSettingsModal";

interface Supplier {
    id: number;
    name: string;
    balanceUsd: string;
    balanceDzd: string;
    exchangeRate: string;
    baseCurrency: 'USD' | 'DZD';
}

interface Transaction {
    id: number;
    supplier: Supplier;
    type: string;
    amountUsd: string;
    exchangeRate: string;
    amountDzd: string;
    salePriceDzd: string | null;
    reason: string | null;
    status: string;
    createdAt: string | Date;
}

interface SuppliersContentProps {
    initialSuppliers: Supplier[];
    initialHistory: Transaction[];
}

export default function SuppliersContent({ initialSuppliers, initialHistory }: SuppliersContentProps) {
    const [suppliers, setSuppliers] = useState(initialSuppliers);
    const [history, setHistory] = useState(initialHistory);

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isRechargeModalOpen, setIsRechargeModalOpen] = useState(false);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
    const [activeTab, setActiveTab] = useState("overview");

    // Filter states
    const [searchTerm, setSearchTerm] = useState("");
    const [filterSupplier, setFilterSupplier] = useState("all");
    const [filterStatus, setFilterStatus] = useState("all");
    const [filterDate, setFilterDate] = useState("today");
    const [filterAmount, setFilterAmount] = useState("all");
    const [searchHistory, setSearchHistory] = useState("");

    // Sync state when props change
    React.useEffect(() => {
        setSuppliers(initialSuppliers);
        setHistory(initialHistory);
    }, [initialSuppliers, initialHistory]);

    const totalCapitalUsd = suppliers.reduce((acc, s) => acc + parseFloat(s.balanceUsd || "0"), 0);
    const totalValeurDzd = suppliers.reduce((acc, s) => acc + parseFloat(s.balanceDzd || "0"), 0);
    const avgRate = totalCapitalUsd > 0 ? (totalValeurDzd / totalCapitalUsd).toFixed(2) : "225";
    const alertsCount = suppliers.filter(s => parseFloat(s.balanceUsd || "0") < 50).length;

    const handleOpenRecharge = (supplier: Supplier) => {
        setSelectedSupplier(supplier);
        setIsRechargeModalOpen(true);
    };

    const handleOpenSettings = (supplier: Supplier) => {
        setSelectedSupplier(supplier);
        setIsSettingsModalOpen(true);
    };

    const filteredSuppliers = suppliers.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredHistory = useMemo(() => {
        return history.filter(h => {
            const matchesSearch = !searchHistory || (h.reason?.toLowerCase().includes(searchHistory.toLowerCase()));
            const matchesSupplier = filterSupplier === "all" || h.supplier.id.toString() === filterSupplier;
            const matchesStatus = filterStatus === "all" || h.status === filterStatus;

            // Date filter logic
            let matchesDate = true;
            if (filterDate === "today") {
                const today = new Date();
                const hDate = new Date(h.createdAt);
                matchesDate = today.toDateString() === hDate.toDateString();
            }

            // Amount filter logic (example: high amount > 1000)
            let matchesAmount = true;
            if (filterAmount === "high") {
                matchesAmount = parseFloat(h.amountUsd) > 1000;
            } else if (filterAmount === "low") {
                matchesAmount = parseFloat(h.amountUsd) <= 1000;
            }

            return matchesSearch && matchesSupplier && matchesStatus && matchesDate && matchesAmount;
        });
    }, [history, searchHistory, filterSupplier, filterStatus, filterDate, filterAmount]);

    const handleExportCSV = () => {
        const headers = ["Date", "Reason", "Supplier", "Amount USD", "Amount DZD", "Status"];
        const rows = filteredHistory.map(h => [
            new Date(h.createdAt).toLocaleString(),
            h.reason || h.type,
            h.supplier.name,
            h.amountUsd,
            h.amountDzd,
            h.status
        ]);

        const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `history_${new Date().toISOString()}.csv`);
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
                        Vue d'ensemble
                        {activeTab === "overview" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#ec5b13] rounded-full" />}
                    </button>
                    <button
                        onClick={() => setActiveTab("history")}
                        className={`pb-4 px-1 text-sm font-bold transition-colors relative whitespace-nowrap flex items-center gap-2 ${activeTab === "history" ? "text-[#ec5b13]" : "text-slate-400 hover:text-white"}`}
                    >
                        <History className="w-4 h-4 shrink-0" />
                        Historique des Transactions
                        {activeTab === "history" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#ec5b13] rounded-full" />}
                    </button>
                </div>

                {activeTab === "overview" ? (
                    <>
                        {/* KPI Section */}
                        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                            <Card className="bg-[#161616] border border-[#262626] shadow-sm">
                                <CardBody className="p-6">
                                    <div className="text-slate-400 text-xs font-black uppercase tracking-widest">Capital Total (USD)</div>
                                    <div className="text-2xl font-black mt-2 text-white">{totalCapitalUsd.toLocaleString()} $</div>
                                </CardBody>
                            </Card>
                            <Card className="bg-[#161616] border border-[#262626] shadow-sm">
                                <CardBody className="p-6">
                                    <div className="text-slate-400 text-xs font-black uppercase tracking-widest">Valeur Totale (DZD)</div>
                                    <div className="text-2xl font-black mt-2 text-white">{totalValeurDzd.toLocaleString()} <span className="text-sm font-bold text-slate-500">DZD</span></div>
                                </CardBody>
                            </Card>
                            <Card className="bg-[#161616] border border-[#262626] shadow-sm">
                                <CardBody className="p-6">
                                    <div className="text-slate-400 text-xs font-black uppercase tracking-widest">Taux Moyen</div>
                                    <div className="text-2xl font-black mt-2 text-[#ec5b13]">1 USD = {avgRate} DZD</div>
                                </CardBody>
                            </Card>
                            <Card className={`bg-[#161616] border ${alertsCount > 0 ? "border-red-500/50" : "border-[#262626]"} shadow-sm`}>
                                <CardBody className="p-6 flex flex-row items-start justify-between">
                                    <div>
                                        <div className="text-slate-400 text-xs font-black uppercase tracking-widest">Alertes</div>
                                        <div className={`text-2xl font-black mt-2 ${alertsCount > 0 ? "text-red-500" : "text-emerald-500"}`}>
                                            {alertsCount} {alertsCount <= 1 ? "Critique" : "Critiques"}
                                        </div>
                                    </div>
                                    <div className={`p-2 rounded-lg ${alertsCount > 0 ? "bg-red-500/10 text-red-500" : "bg-emerald-500/10 text-emerald-500"}`}>
                                        <AlertTriangle className="w-6 h-6 shrink-0" />
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
                                const balUsd = parseFloat(s.balanceUsd || "0");
                                const balDzd = parseFloat(s.balanceDzd || "0");
                                return (
                                    <div key={s.id} className="bg-[#161616] border border-[#262626] rounded-2xl flex flex-col transition-all hover:translate-y-[-4px] hover:shadow-2xl hover:border-white/10 group">
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
                                                <Chip size="sm" variant="flat" className={`font-black uppercase text-[10px] ${balUsd > 50 ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}`}>
                                                    {balUsd > 50 ? "Actif" : "Vide"}
                                                </Chip>
                                            </div>
                                            <div className="space-y-1 mb-6">
                                                <div className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Solde disponible</div>
                                                <div className="text-3xl font-black tracking-tighter whitespace-nowrap text-white">
                                                    {s.baseCurrency === 'DZD' ? (
                                                        <>{balDzd.toLocaleString()} <span className="text-sm">DA</span></>
                                                    ) : (
                                                        <>{balUsd.toLocaleString()} $</>
                                                    )}
                                                </div>
                                                <div className="flex items-center space-x-2 mt-2">
                                                    <span className="text-slate-400 text-xs font-bold">
                                                        {s.baseCurrency === 'DZD' ? `~ ${balUsd.toLocaleString()} $` : `~ ${balDzd.toLocaleString()} DZD`}
                                                    </span>
                                                    {s.baseCurrency === 'USD' && (
                                                        <span className="px-2 py-0.5 bg-[#262626] text-[10px] text-slate-300 rounded font-black uppercase tracking-tighter border border-white/5">{s.exchangeRate} / USD</span>
                                                    )}
                                                </div>
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
                                                isIconOnly
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
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                                <div className="relative group">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4 shrink-0 pointer-events-none group-focus-within:text-[#ec5b13] transition-colors" />
                                    <input
                                        className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-1 focus:ring-[#ec5b13] focus:border-[#ec5b13] text-white placeholder:text-slate-600 transition-all font-medium"
                                        placeholder="Produit / Commande..."
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
                                            <option key={s.id} value={s.id.toString()}>{s.name}</option>
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
                                        <option value="today">Aujourd'hui</option>
                                    </select>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                                        <Calendar className="w-4 h-4 shrink-0" />
                                    </div>
                                </div>
                                <div className="relative">
                                    <select
                                        className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl px-4 py-2 text-sm focus:ring-1 focus:ring-[#ec5b13] text-white appearance-none cursor-pointer font-medium"
                                        value={filterStatus}
                                        onChange={(e) => setFilterStatus(e.target.value)}
                                    >
                                        <option value="all">Tous les Statuts</option>
                                        <option value="COMPLETED">Validé</option>
                                        <option value="PENDING">En attente</option>
                                    </select>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                                        <ArrowDownCircle className="w-4 h-4 shrink-0" />
                                    </div>
                                </div>
                                <div className="relative">
                                    <select
                                        className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl px-4 py-2 text-sm focus:ring-1 focus:ring-[#ec5b13] text-white appearance-none cursor-pointer font-medium"
                                        value={filterAmount}
                                        onChange={(e) => setFilterAmount(e.target.value)}
                                    >
                                        <option value="all">Tous les Montants</option>
                                        <option value="high">Plus de 1000$</option>
                                        <option value="low">1000$ ou moins</option>
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
                                <h2 className="font-black text-xs uppercase tracking-[0.2em] text-slate-400">Historique des Ventes & Débits</h2>
                                <div className="flex items-center space-x-2">
                                    <Button
                                        isIconOnly
                                        size="sm"
                                        variant="light"
                                        className="text-slate-500 hover:text-white transition-colors"
                                        onClick={handleExportCSV}
                                    >
                                        <Download className="w-4 h-4 shrink-0" />
                                    </Button>
                                    <Button
                                        isIconOnly
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
                                            <th className="px-6 py-4">Détails / Produit</th>
                                            <th className="px-6 py-4">Fournisseur</th>
                                            <th className="px-6 py-4 text-right">Debit USD</th>
                                            <th className="px-6 py-4 text-right">Vente DZD</th>
                                            <th className="px-6 py-4 text-center">Statut</th>
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
                                            const isAchat = h.type === "ACHAT_STOCK";
                                            return (
                                                <tr key={h.id} className="hover:bg-white/[0.02] transition-colors group">
                                                    <td className="px-6 py-4 text-xs text-slate-400 font-bold">
                                                        {new Date(h.createdAt).toLocaleDateString("fr-FR", { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-black text-white uppercase tracking-tight truncate max-w-[200px]">
                                                                {isAchat ? h.reason?.replace("Achat automatique : ", "") : h.type}
                                                            </span>
                                                            <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-0.5">#{h.id + 5000}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center space-x-2">
                                                            <div className={`size-6 rounded flex items-center justify-center text-[10px] font-black shrink-0 ${h.supplier.name.includes("Prepaid") ? "bg-orange-500/20 text-orange-500" :
                                                                h.supplier.name.includes("Binance") ? "bg-yellow-500/20 text-yellow-500" : "bg-purple-500/20 text-purple-500"
                                                                }`}>
                                                                {h.supplier.name.substring(0, 1).toUpperCase()}
                                                            </div>
                                                            <span className="text-xs font-bold text-slate-300 uppercase tracking-tight">{h.supplier.name}</span>
                                                        </div>
                                                    </td>
                                                    <td className={`px-6 py-4 text-sm font-black text-right whitespace-nowrap ${isAchat ? 'text-red-500' : 'text-emerald-500'}`}>
                                                        {isAchat ? '-' : '+'}{parseFloat(h.amountUsd).toLocaleString()} $
                                                    </td>
                                                    <td className="px-6 py-4 text-sm font-black text-right whitespace-nowrap text-white">
                                                        {h.salePriceDzd ? `${parseFloat(h.salePriceDzd).toLocaleString()} DZD` : "-"}
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <Chip size="sm" variant="flat" className={`font-black uppercase text-[9px] tracking-widest ${h.status === "COMPLETED" ? "bg-emerald-500/10 text-emerald-500" : "bg-orange-500/10 text-orange-400"}`}>
                                                            {h.status === "COMPLETED" ? "Validé" : "En attente"}
                                                        </Chip>
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
                currentBalance={selectedSupplier?.balanceUsd || "0"}
                exchangeRate={selectedSupplier?.exchangeRate || "225"}
            />

            <SupplierSettingsModal
                isOpen={isSettingsModalOpen}
                onClose={() => setIsSettingsModalOpen(false)}
                supplier={selectedSupplier}
            />
        </div>
    );
}
