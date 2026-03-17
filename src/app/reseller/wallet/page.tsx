"use client";

import React, { useState, useEffect } from "react";
import {
    Card,
    CardBody,
    Spinner,
    Button,
    Divider,
    Input
} from "@heroui/react";
import {
    Wallet,
    ArrowUpCircle,
    ArrowDownCircle,
    CreditCard,
    Plus,
    History,
    TrendingUp,
    ShieldCheck,
    Copy,
    Building2
} from "lucide-react";
import { getCurrentResellerAction, getResellerTransactionsAction } from "../actions";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { toast } from "react-hot-toast";

export default function ResellerWallet() {
    const [reseller, setReseller] = useState<any>(null);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            const [resRes, txRes]: [any, any] = await Promise.all([
                getCurrentResellerAction({}),
                getResellerTransactionsAction({})
            ]);

            if (resRes.success) {
                setReseller(resRes.data);
            } else {
                toast.error("Erreur session revendeur");
            }

            if (txRes.success) {
                setTransactions((txRes.data as any) || []);
            } else {
                toast.error("Erreur historique transactions");
            }
            setIsLoading(false);
        };
        loadData();
    }, []);

    const wallet = reseller?.wallet;

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success("ID Compte copié !");
    };

    return (
        <div className="space-y-10 animate-in fade-in duration-500 max-w-7xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-4">
                        <Wallet className="text-[#ec5b13] size-8" />
                        Mon Portefeuille
                    </h1>
                    <p className="text-slate-500 font-medium mt-1 uppercase tracking-widest text-[10px]">Gérez votre crédit et vos transactions</p>
                </div>
                <Button
                    className="bg-[#ec5b13] text-white font-black px-8 h-14 rounded-2xl shadow-xl shadow-orange-950/20"
                    startContent={<Plus size={20} />}
                >
                    Recharger le Compte
                </Button>
            </div>

            {isLoading ? (
                <div className="py-40 flex justify-center"><Spinner color="warning" /></div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left: Balance Card */}
                    <div className="lg:col-span-1 space-y-6">
                        <Card className="bg-gradient-to-br from-[#161616] to-[#0a0a0a] border border-[#262626] rounded-[32px] overflow-hidden p-8 relative">
                            {/* Decorative Glow */}
                            <div className="absolute -top-20 -right-20 size-60 bg-[#ec5b13]/10 blur-[80px] rounded-full"></div>

                            <div className="relative z-10 space-y-10">
                                <div className="flex items-center justify-between">
                                    <Building2 className="text-slate-700" size={32} />
                                    <ShieldCheck className="text-emerald-500" size={24} />
                                </div>

                                <div className="space-y-2">
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Solde Disponible</p>
                                    <h2 className="text-4xl font-black text-white">{formatCurrency(wallet?.balance || 0, 'DZD')}</h2>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-white/5">
                                        <div className="flex flex-col">
                                            <span className="text-[9px] font-black text-slate-600 uppercase">Token Compte</span>
                                            <span className="text-xs font-mono text-slate-300">WLT-4491-X2</span>
                                        </div>
                                        <button onClick={() => copyToClipboard("WLT-4491-X2")} className="p-2 hover:bg-white/5 rounded-lg text-slate-500">
                                            <Copy size={14} />
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between px-2">
                                        <p className="text-xs text-slate-500 font-bold italic">Vérifié le {formatDate(new Date())}</p>
                                    </div>
                                </div>
                            </div>
                        </Card>

                        <div className="bg-[#1a1614] border border-[#2d2622] rounded-[32px] p-8 space-y-6">
                            <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-3">
                                <TrendingUp size={18} className="text-[#ec5b13]" />
                                Statistiques
                            </h3>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center text-sm font-bold">
                                    <span className="text-slate-500">Volume mensuel</span>
                                    <span className="text-white">12,500 DZD</span>
                                </div>
                                <div className="flex justify-between items-center text-sm font-bold">
                                    <span className="text-slate-500">Économies (5%)</span>
                                    <span className="text-emerald-500">625 DZD</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right: Transactions List */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-3">
                                <History size={20} className="text-[#ec5b13]" />
                                Transactions Récentes
                            </h2>
                        </div>

                        <div className="space-y-4">
                            {transactions.length === 0 ? (
                                <div className="py-20 text-center opacity-30 italic font-bold">Aucune transaction récente</div>
                            ) : transactions.map((tx) => (
                                <div key={tx.id} className="bg-[#161616] border border-[#262626] rounded-2xl p-5 flex items-center justify-between group hover:border-[#ec5b13]/20 transition-all">
                                    <div className="flex items-center gap-4">
                                        <div className={`size-12 rounded-xl flex items-center justify-center border ${tx.type === 'PURCHASE' ? "bg-red-500/10 border-red-500/20 text-red-500" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                                            }`}>
                                            {tx.type === 'PURCHASE' ? <ArrowDownCircle size={20} /> : <ArrowUpCircle size={20} />}
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-white text-sm">
                                                {tx.description || (tx.type === 'PURCHASE' ? "Achat Wholesale" : "Rechargement Compte")}
                                            </h4>
                                            <p className="text-xs text-slate-500 font-medium">Ref: #{tx.id}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className={`font-black ${tx.type === 'PURCHASE' ? "text-white" : "text-emerald-500"}`}>
                                            {tx.type === 'PURCHASE' ? "-" : "+"}{formatCurrency(tx.amount, 'DZD')}
                                        </p>
                                        <p className="text-[10px] text-slate-600 font-bold uppercase mt-1">{formatDate(tx.createdAt)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
