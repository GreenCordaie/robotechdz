"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
    Spinner,
    Button,
    Input,
    Card,
    CardBody,
    Chip,
    Tabs,
    Tab
} from "@heroui/react";
import { useRouter } from "next/navigation";
import { Banknote, Search, Plus, Landmark, AlertTriangle, Settings, History, LayoutDashboard, ArrowUpCircle, ArrowDownCircle, Download, DollarSign, RefreshCcw } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { AddSupplierModal } from "@/components/admin/modals/AddSupplierModal";
import { RechargeBalanceModal } from "@/components/admin/modals/RechargeBalanceModal";
import { PaySupplierModal } from "@/components/admin/modals/PaySupplierModal";
import { SupplierSettingsModal } from "@/components/admin/modals/SupplierSettingsModal";

import { markTransactionAsPaidAction } from "./actions";
import toast from "react-hot-toast";

export default function SuppliersMobile({ initialSuppliers, initialHistory, initialStats, shopSettings }: any) {
    const router = useRouter();
    const [suppliers, setSuppliers] = useState(initialSuppliers || []);
    const [history, setHistory] = useState(initialHistory || []);
    const [activeTab, setActiveTab] = useState("overview");
    const [searchTerm, setSearchTerm] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isRechargeModalOpen, setIsRechargeModalOpen] = useState(false);
    const [isPayModalOpen, setIsPayModalOpen] = useState(false);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [selectedSupplier, setSelectedSupplier] = useState<any>(null);

    // History Filters
    const [searchHist, setSearchHist] = useState("");
    const [filterSupp, setFilterSupp] = useState("all");
    const [filterDate, setFilterDate] = useState("all");
    const [filterAmount, setFilterAmount] = useState("all");

    const stats = initialStats || { totalPaidDzd: "0", totalUnpaidDzd: "0", netProfit: "0", exchangeRate: "245" };
    const EXCHANGE_RATE_USD_DZD = parseFloat(stats.exchangeRate || "245");

    useEffect(() => {
        setSuppliers(initialSuppliers || []);
        setHistory(initialHistory || []);
    }, [initialSuppliers, initialHistory]);

    useEffect(() => {
        const interval = setInterval(() => router.refresh(), 5000);
        return () => clearInterval(interval);
    }, [router]);

    const totalSuppliedUsd = suppliers.reduce((acc: number, s: any) => acc + (s.currency === 'USD' ? parseFloat(s.balance || "0") : 0), 0);
    const totalSuppliedDzd = suppliers.reduce((acc: number, s: any) => acc + (s.currency === 'DZD' ? parseFloat(s.balance || "0") : 0), 0);
    const totalValeurDzd = totalSuppliedDzd + (totalSuppliedUsd * EXCHANGE_RATE_USD_DZD);

    const handleMarkAsPaid = async (transactionId: number) => {
        setIsProcessing(true);
        try {
            const res = await markTransactionAsPaidAction({ transactionId });
            if (res.success) {
                toast.success("Payé !");
                router.refresh();
            } else {
                toast.error(res.error || "Erreur");
            }
        } catch (err) {
            toast.error("Erreur réseau");
        } finally {
            setIsProcessing(false);
        }
    };

    const filteredSuppliers = suppliers.filter((s: any) =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) && s.status !== 'ARCHIVE'
    );

    const alertsCount = suppliers.filter((s: any) => {
        if (s.status === 'ARCHIVE') return false;
        const bal = parseFloat(s.balance || "0");
        const equivalentUsd = s.currency === 'USD' ? bal : bal / EXCHANGE_RATE_USD_DZD;
        return equivalentUsd < 100;
    }).length;

    const filteredHistory = useMemo(() => {
        return history.filter((h: any) => {
            const matchesSearch = !searchHist || (h.reason?.toLowerCase().includes(searchHist.toLowerCase()) || h.type.toLowerCase().includes(searchHist.toLowerCase()));
            const matchesSupp = filterSupp === "all" || h.supplier.id === parseInt(filterSupp);

            let matchesDate = true;
            if (filterDate === "today") {
                const today = new Date();
                const hDate = new Date(h.createdAt);
                matchesDate = today.toDateString() === hDate.toDateString();
            }

            let matchesAmount = true;
            if (filterAmount === "high") {
                matchesAmount = parseFloat(h.amount) > 1000;
            } else if (filterAmount === "low") {
                matchesAmount = parseFloat(h.amount) <= 1000;
            }

            return matchesSearch && matchesSupp && matchesDate && matchesAmount;
        });
    }, [history, searchHist, filterSupp, filterDate, filterAmount]);

    const handleExportCSV = () => {
        const headers = ["Date", "Motif", "Fournisseur", "Montant", "Devise"];
        const rows = filteredHistory.map((h: any) => [
            new Date(h.createdAt).toLocaleString(),
            h.reason || h.type,
            h.supplier.name,
            h.amount,
            h.currency
        ]);
        const csv = [headers, ...rows].map(e => e.join(",")).join("\n");
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `journal_${new Date().getTime()}.csv`;
        a.click();
    };

    const handleOpenRecharge = (supplier: any) => {
        setSelectedSupplier(supplier);
        setIsRechargeModalOpen(true);
    };

    const handleOpenSettings = (supplier: any) => {
        setSelectedSupplier(supplier);
        setIsSettingsModalOpen(true);
    };

    const handleOpenPay = (supplier: any) => {
        setSelectedSupplier(supplier);
        setIsPayModalOpen(true);
    };

    return (
        <div className="flex flex-col min-h-screen bg-[#0a0a0a] text-white pb-32">
            <header className="p-4 border-b border-white/5 space-y-4">
                <div className="flex justify-between items-center">
                    <h1 className="text-xl font-black italic uppercase tracking-tighter">Flux Devise</h1>
                    <Button isIconOnly size="sm" color="primary" className="rounded-full" onPress={() => setIsAddModalOpen(true)}>
                        <Plus size={18} />
                    </Button>
                </div>

                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input
                        type="text"
                        placeholder="Chercher fournisseur..."
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 outline-none focus:border-primary/50 transition-all font-bold placeholder:text-slate-600"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </header>

            {/* Quick KPIs Summary */}
            <div className="p-4 grid grid-cols-2 gap-3">
                <div className="p-4 bg-white/5 border border-white/10 rounded-[2rem] space-y-1">
                    <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest">Valeur Stock</p>
                    <p className="text-base font-black truncate">{formatCurrency(totalValeurDzd, 'DZD')}</p>
                </div>
                <div className="p-4 bg-[#ec5b13]/10 border border-[#ec5b13]/20 rounded-[2rem] space-y-1 shadow-[0_0_15px_rgba(236,91,19,0.05)]">
                    <p className="text-[8px] font-black uppercase text-[#ec5b13] tracking-widest">Profit Net</p>
                    <p className="text-base font-black text-[#ec5b13] truncate">{formatCurrency(stats.netProfit, 'DZD')}</p>
                </div>
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-[2rem] space-y-1">
                    <p className="text-[8px] font-black uppercase text-emerald-500 tracking-widest">Total Payé</p>
                    <p className="text-base font-black text-emerald-500 truncate">{formatCurrency(stats.totalPaidDzd, 'DZD')}</p>
                </div>
                <div className={`p-4 ${parseFloat(stats.totalUnpaidDzd) > 0 ? 'bg-orange-500/10 border-orange-500/30 shadow-[0_0_15px_rgba(249,115,22,0.1)]' : 'bg-white/5 border-white/10'} rounded-[2rem] space-y-1 transition-all`}>
                    <p className={`text-[8px] font-black uppercase tracking-widest ${parseFloat(stats.totalUnpaidDzd) > 0 ? 'text-orange-500 pulse' : 'text-slate-500'}`}>Dettes</p>
                    <p className={`text-base font-black truncate ${parseFloat(stats.totalUnpaidDzd) > 0 ? 'text-orange-500' : 'text-slate-400'}`}>{formatCurrency(stats.totalUnpaidDzd, 'DZD')}</p>
                </div>
            </div>

            <main className="px-4 mt-2">
                <Tabs
                    aria-label="Options"
                    variant="underlined"
                    classNames={{
                        base: "w-full",
                        tabList: "gap-6 w-full relative rounded-none p-0 border-b border-white/5",
                        cursor: "w-full bg-primary",
                        tab: "max-w-fit px-0 h-12",
                        tabContent: "group-data-[selected=true]:text-primary font-black uppercase text-[11px] tracking-widest"
                    }}
                    selectedKey={activeTab}
                    onSelectionChange={(key) => setActiveTab(key as string)}
                >
                    <Tab key="overview" title="Vue d'ensemble">
                        <div className="py-6 space-y-4">
                            {alertsCount > 0 && (
                                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 mb-2 animate-pulse">
                                    <AlertTriangle className="text-red-500" size={20} />
                                    <p className="text-xs font-bold text-red-100">{alertsCount} Balances critiques détectées</p>
                                </div>
                            )}

                            {filteredSuppliers.map((s: any) => {
                                const bal = parseFloat(s.balance || "0");
                                const equivUsd = s.currency === 'USD' ? bal : bal / EXCHANGE_RATE_USD_DZD;
                                const isLow = equivUsd < 100;

                                return (
                                    <div key={s.id} className={`p-5 bg-[#161616] border ${isLow ? 'border-red-500/30' : 'border-white/5'} rounded-[2.5rem] space-y-4`}>
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center gap-3">
                                                <div className="size-10 rounded-2xl bg-white/5 flex items-center justify-center font-black text-primary border border-white/5 uppercase">
                                                    {s.name.substring(0, 2)}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-black uppercase tracking-tight">{s.name}</p>
                                                    <Chip size="sm" variant="dot" color={isLow ? "danger" : "success"} className="h-5 text-[8px] font-black uppercase border-none bg-transparent">
                                                        {isLow ? "Faible" : "Opérationnel"}
                                                    </Chip>
                                                </div>
                                            </div>
                                            <Button isIconOnly size="sm" variant="light" className="text-slate-600" onPress={() => handleOpenSettings(s)}>
                                                <Settings size={18} />
                                            </Button>
                                        </div>

                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Solde Actuel</p>
                                            <div className="flex items-baseline gap-2">
                                                <p className={`text-2xl font-black ${isLow ? 'text-red-500' : 'text-white'}`}>{formatCurrency(bal, s.currency)}</p>
                                                {s.currency === 'USD' && (
                                                    <p className="text-[10px] font-bold text-slate-600">~ {formatCurrency(bal * EXCHANGE_RATE_USD_DZD, 'DZD')}</p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex gap-2 mt-4 pt-4 border-t border-white/5">
                                            <Button
                                                className="flex-1 bg-white/5 hover:bg-[#ec5b13] hover:text-white transition-all font-black text-[10px] uppercase rounded-2xl h-11"
                                                onPress={() => handleOpenRecharge(s)}
                                            >
                                                Plus de Fonds
                                            </Button>
                                            <Button
                                                className="flex-1 bg-blue-500/5 hover:bg-blue-500 text-blue-500 hover:text-white transition-all font-black text-[10px] uppercase rounded-2xl h-11 border border-blue-500/10"
                                                onPress={() => handleOpenPay(s)}
                                                startContent={<Banknote size={14} />}
                                            >
                                                Payer Dette
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </Tab>
                    <Tab key="history" title="Historique">
                        <div className="py-6 space-y-6">
                            <div className="space-y-3">
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                                        <input
                                            placeholder="Motif..."
                                            className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-9 pr-3 text-xs outline-none focus:border-primary/50 font-bold"
                                            value={searchHist}
                                            onChange={(e) => setSearchHist(e.target.value)}
                                        />
                                    </div>
                                    <Button isIconOnly size="sm" variant="flat" className="bg-white/5 text-slate-400" onPress={handleExportCSV}>
                                        <Download size={14} />
                                    </Button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <select
                                        className="bg-[#161616] border border-white/10 rounded-xl py-2 px-3 text-xs outline-none font-bold text-white appearance-none"
                                        value={filterSupp}
                                        onChange={(e) => setFilterSupp(e.target.value)}
                                    >
                                        <option value="all">Tous Fournisseurs</option>
                                        {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                    <select
                                        className="bg-[#161616] border border-white/10 rounded-xl py-2 px-3 text-xs outline-none font-bold text-white appearance-none"
                                        value={filterDate}
                                        onChange={(e) => setFilterDate(e.target.value)}
                                    >
                                        <option value="all">Toutes Dates</option>
                                        <option value="today">Aujourd&apos;hui</option>
                                    </select>
                                    <select
                                        className="bg-[#161616] border border-white/10 rounded-xl py-2 px-3 text-xs outline-none font-bold text-white appearance-none col-span-2"
                                        value={filterAmount}
                                        onChange={(e) => setFilterAmount(e.target.value)}
                                    >
                                        <option value="all">Tous Montants</option>
                                        <option value="high">Plus de 1000</option>
                                        <option value="low">1000 ou moins</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {filteredHistory.slice(0, 30).map((h: any) => {
                                    const isDebit = h.type === "DEBIT" || h.type === "ACHAT_STOCK";
                                    const isUnpaid = h.type === "RECHARGE" && h.paymentStatus === "UNPAID";

                                    return (
                                        <div key={h.id} className={`p-4 ${isUnpaid ? 'bg-orange-500/5 border-orange-500/20' : 'bg-white/[0.02] border-white/5'} border rounded-2xl`}>
                                            <div className="flex justify-between items-center mb-3">
                                                <div className="flex items-center gap-3">
                                                    <div className={`size-8 rounded-full flex items-center justify-center ${isDebit ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                                                        {isDebit ? <ArrowUpCircle size={16} /> : <ArrowDownCircle size={16} />}
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-black uppercase text-white truncate max-w-[120px]">{h.reason || (h.type === "RECHARGE" ? "Fonds" : h.type)}</p>
                                                        <p className="text-[8px] font-bold text-slate-600 uppercase">{new Date(h.createdAt).toLocaleDateString()} • {h.supplier.name}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className={`text-sm font-black ${isDebit ? 'text-red-500' : 'text-emerald-500'}`}>
                                                        {isDebit ? '-' : '+'}{formatCurrency(h.amount, h.currency as any)}
                                                    </p>
                                                </div>
                                            </div>

                                            {h.type === "RECHARGE" && (
                                                <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                                                    <Chip
                                                        size="sm"
                                                        variant="flat"
                                                        className={`h-5 text-[8px] font-black uppercase border-none ${h.paymentStatus === "PAID" ? "bg-emerald-500/10 text-emerald-500" : "bg-orange-500/10 text-orange-500"}`}
                                                    >
                                                        {h.paymentStatus === "PAID" ? "Payé" : "En Attente"}
                                                    </Chip>

                                                    {h.paymentStatus === "UNPAID" && (
                                                        <Button
                                                            size="sm"
                                                            variant="solid"
                                                            color="warning"
                                                            isLoading={isProcessing}
                                                            onPress={() => handleMarkAsPaid(h.id)}
                                                            className="h-7 text-[8px] font-black uppercase rounded-lg px-4"
                                                        >
                                                            Marquer Payé
                                                        </Button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                {filteredHistory.length === 0 && (
                                    <div className="py-20 text-center opacity-30">
                                        <History size={48} className="mx-auto mb-4" />
                                        <p className="text-sm font-bold uppercase tracking-widest">Aucune donnée</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </Tab>
                </Tabs>
            </main>

            <AddSupplierModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
            <RechargeBalanceModal
                isOpen={isRechargeModalOpen}
                onClose={() => setIsRechargeModalOpen(false)}
                supplierId={selectedSupplier?.id || 0}
                supplierName={selectedSupplier?.name || ""}
                currentBalance={selectedSupplier?.balance || "0"}
                exchangeRate={EXCHANGE_RATE_USD_DZD.toString()}
                baseCurrency={selectedSupplier?.currency || 'USD'}
            />
            <SupplierSettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} supplier={selectedSupplier} />
            <PaySupplierModal
                isOpen={isPayModalOpen}
                onClose={() => setIsPayModalOpen(false)}
                supplierId={selectedSupplier?.id || 0}
                supplierName={selectedSupplier?.name || ""}
                currentDebt={useMemo(() => {
                    if (!selectedSupplier) return 0;
                    return history.filter((h: any) => h.supplier.id === selectedSupplier.id).reduce((acc: number, h: any) => {
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
        </div>
    );
}
