"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
    Card,
    Spinner,
    Button,
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    useDisclosure,
} from "@heroui/react";
import {
    Wallet,
    ArrowUpCircle,
    ArrowDownCircle,
    History,
    TrendingUp,
    ShieldCheck,
    Copy,
    Building2,
    Plus,
    MessageCircle,
    HandCoins,
    CreditCard,
    Landmark,
} from "lucide-react";
import { getCurrentResellerAction, getResellerTransactionsAction } from "../actions";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { toast } from "react-hot-toast";
import { useSettingsStore } from "@/store/useSettingsStore";

interface ResellerWalletData {
    id: number;
    balance: string | null;
    totalSpent: string | null;
    updatedAt: Date | null;
}

interface ResellerTier {
    id: number;
    name: string;
    discountPct: string;
    minMonthlyVolumeDzd: string;
    color: string | null;
    rank: number;
}

interface ResellerData {
    id: number;
    userId: number;
    companyName: string;
    wallet?: ResellerWalletData | null;
    tier?: ResellerTier | null;
    monthlyVolume?: number;
}

interface ResellerTransaction {
    id: number;
    type: string;
    amount: string;
    description: string | null;
    createdAt: Date | null;
}

export default function ResellerWallet() {
    const [reseller, setReseller] = useState<ResellerData | null>(null);
    const [transactions, setTransactions] = useState<ResellerTransaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const rechargeInfoModal = useDisclosure();
    const shopName = useSettingsStore((s) => s.shopName);
    const shopTel = useSettingsStore((s) => s.shopTel);
    const shopAddress = useSettingsStore((s) => s.shopAddress);

    useEffect(() => {
        const loadData = async () => {
            const [resRes, txRes] = await Promise.all([
                getCurrentResellerAction({}),
                getResellerTransactionsAction({})
            ]);

            if (resRes.success) {
                setReseller(resRes.data as ResellerData);
            } else {
                toast.error("Erreur session revendeur");
            }

            if (txRes.success) {
                setTransactions((txRes.data as ResellerTransaction[]) ?? []);
            } else {
                toast.error("Erreur historique transactions");
            }
            setIsLoading(false);
        };
        loadData();
    }, []);

    const wallet = reseller?.wallet ?? null;

    // Stats calculées sur les vraies transactions du mois courant
    const monthlyStats = useMemo(() => {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthlyTx = transactions.filter((tx) => {
            const created = tx.createdAt ? new Date(tx.createdAt) : null;
            return created !== null && created >= startOfMonth;
        });
        const monthlyVolume = monthlyTx
            .filter((tx) => tx.type === "PURCHASE")
            .reduce((acc, tx) => acc + parseFloat(tx.amount || "0"), 0);
        return { monthlyVolume, monthlyCount: monthlyTx.length };
    }, [transactions]);

    const copyToClipboard = async (text: string) => {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
            } else {
                // Fallback non-HTTPS / vieux Safari
                const ta = document.createElement("textarea");
                ta.value = text;
                ta.setAttribute("readonly", "");
                ta.style.position = "absolute";
                ta.style.left = "-9999px";
                document.body.appendChild(ta);
                ta.select();
                document.execCommand("copy");
                document.body.removeChild(ta);
            }
            toast.success("Identifiant copié !");
        } catch {
            toast.error("Copie impossible — sélectionnez et copiez manuellement.");
        }
    };

    const accountToken = reseller
        ? `WLT-${reseller.id.toString().padStart(4, "0")}`
        : "WLT-0000";

    const tier = reseller?.tier;
    const tierColor = tier?.color || "#94a3b8";
    const tierDiscountPct = tier ? parseFloat(tier.discountPct) : 0;
    const monthlyVolume = reseller?.monthlyVolume ?? 0;
    const nextTierThreshold = tier ? parseFloat(tier.minMonthlyVolumeDzd) : 0;

    return (
        <div className="space-y-10 animate-in fade-in duration-500 max-w-7xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-4">
                        <Wallet className="text-[var(--primary)] size-8" />
                        Mon Portefeuille
                    </h1>
                    <p className="text-slate-500 font-medium mt-1 uppercase tracking-widest text-[10px]">Gérez votre crédit et vos transactions</p>
                </div>
                <Button
                    onPress={rechargeInfoModal.onOpen}
                    className="bg-[var(--primary)] text-white font-black px-6 h-14 rounded-2xl shadow-xl shadow-orange-950/20"
                    startContent={<Plus size={18} />}
                    data-testid="recharge-info-btn"
                >
                    Recharger le compte
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
                            <div className="absolute -top-20 -right-20 size-60 bg-[var(--primary)]/10 blur-[80px] rounded-full"></div>

                            <div className="relative z-10 space-y-10">
                                <div className="flex items-center justify-between">
                                    <Building2 className="text-slate-700" size={32} />
                                    <ShieldCheck className="text-emerald-500" size={24} />
                                </div>

                                <div className="space-y-2">
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Solde Disponible</p>
                                    <h2 className="text-4xl font-black text-white">
                                        {formatCurrency(parseFloat(wallet?.balance ?? "0"), "DZD")}
                                    </h2>
                                </div>

                                {tier && (
                                    <div
                                        className="flex items-center justify-between p-3 rounded-2xl border"
                                        style={{
                                            backgroundColor: `${tierColor}15`,
                                            borderColor: `${tierColor}40`,
                                        }}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span
                                                className="w-2 h-2 rounded-full"
                                                style={{ backgroundColor: tierColor }}
                                                aria-hidden
                                            />
                                            <span
                                                className="text-xs font-black uppercase tracking-widest"
                                                style={{ color: tierColor }}
                                            >
                                                Palier {tier.name}
                                            </span>
                                        </div>
                                        <span className="text-xs font-bold text-white">
                                            -{tierDiscountPct.toFixed(0)}%
                                        </span>
                                    </div>
                                )}

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-white/5">
                                        <div className="flex flex-col">
                                            <span className="text-[9px] font-black text-slate-600 uppercase">Token Compte</span>
                                            <span className="text-xs font-mono text-slate-300">{accountToken}</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => copyToClipboard(accountToken)}
                                            className="p-2 hover:bg-white/5 rounded-lg text-slate-500"
                                            aria-label="Copier le token"
                                        >
                                            <Copy size={14} />
                                        </button>
                                    </div>
                                    {wallet?.updatedAt && (
                                        <div className="flex items-center justify-between px-2">
                                            <p className="text-xs text-slate-500 font-bold italic">
                                                Dernière mise à jour {formatDate(new Date(wallet.updatedAt))}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </Card>

                        <div className="bg-[#1a1614] border border-[#2d2622] rounded-[32px] p-8 space-y-6">
                            <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-3">
                                <TrendingUp size={18} className="text-[var(--primary)]" />
                                Statistiques (mois en cours)
                            </h3>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center text-sm font-bold">
                                    <span className="text-slate-500">Volume d&apos;achat</span>
                                    <span className="text-white">
                                        {formatCurrency(Math.max(monthlyStats.monthlyVolume, monthlyVolume), "DZD")}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-sm font-bold">
                                    <span className="text-slate-500">Nb transactions</span>
                                    <span className="text-emerald-500">{monthlyStats.monthlyCount}</span>
                                </div>
                                {tier && nextTierThreshold > 0 && monthlyVolume < nextTierThreshold && (
                                    <div className="pt-4 border-t border-white/5">
                                        <div className="flex justify-between text-[10px] uppercase font-black text-slate-600 mb-2">
                                            <span>Vers palier suivant</span>
                                            <span>{Math.min(100, Math.round((monthlyVolume / nextTierThreshold) * 100))}%</span>
                                        </div>
                                        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                            <div
                                                className="h-full transition-all"
                                                style={{
                                                    width: `${Math.min(100, (monthlyVolume / nextTierThreshold) * 100)}%`,
                                                    backgroundColor: tierColor,
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right: Transactions List */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-3">
                                <History size={20} className="text-[var(--primary)]" />
                                Transactions Récentes
                            </h2>
                        </div>

                        <div className="space-y-4">
                            {transactions.length === 0 ? (
                                <div className="py-20 text-center opacity-30 italic font-bold">Aucune transaction récente</div>
                            ) : transactions.map((tx) => (
                                <div key={tx.id} className="bg-[#161616] border border-[#262626] rounded-2xl p-5 flex items-center justify-between group hover:border-[var(--primary)]/20 transition-all">
                                    <div className="flex items-center gap-4">
                                        <div className={`size-12 rounded-xl flex items-center justify-center border ${tx.type === "PURCHASE" ? "bg-red-500/10 border-red-500/20 text-red-500" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                                            }`}>
                                            {tx.type === "PURCHASE" ? <ArrowDownCircle size={20} /> : <ArrowUpCircle size={20} />}
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-white text-sm">
                                                {tx.description || (tx.type === "PURCHASE" ? "Achat Wholesale" : "Rechargement Compte")}
                                            </h4>
                                            <p className="text-xs text-slate-500 font-medium">Ref: #{tx.id}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className={`font-black ${tx.type === "PURCHASE" ? "text-white" : "text-emerald-500"}`}>
                                            {tx.type === "PURCHASE" ? "-" : "+"}{formatCurrency(parseFloat(tx.amount), "DZD")}
                                        </p>
                                        <p className="text-[10px] text-slate-600 font-bold uppercase mt-1">
                                            {tx.createdAt ? formatDate(new Date(tx.createdAt)) : ""}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal d'instructions pour recharge manuelle */}
            <Modal
                isOpen={rechargeInfoModal.isOpen}
                onClose={rechargeInfoModal.onClose}
                size="lg"
                classNames={{
                    base: "bg-[#0f0d0c] border border-[#2d2622] rounded-[32px]",
                    header: "border-b border-[#2d2622]",
                    footer: "border-t border-[#2d2622]",
                }}
            >
                <ModalContent>
                    {(close) => (
                        <>
                            <ModalHeader>
                                <div className="flex items-center gap-3">
                                    <Plus className="text-[var(--primary)]" />
                                    <div>
                                        <h2 className="text-xl font-black text-white">Recharger votre wallet</h2>
                                        <p className="text-xs text-slate-500 font-medium mt-0.5">
                                            La recharge se fait directement avec {shopName || "l'admin"}.
                                        </p>
                                    </div>
                                </div>
                            </ModalHeader>
                            <ModalBody className="space-y-5">
                                <div className="space-y-3">
                                    <p className="text-sm text-slate-300 leading-relaxed">
                                        Pour créditer votre wallet, contactez l&apos;équipe avec le montant souhaité et
                                        le moyen de paiement parmi :
                                    </p>
                                    <ul className="space-y-2 pl-1">
                                        <PaymentMethodRow icon={<HandCoins size={16} />} label="Espèces en boutique" />
                                        <PaymentMethodRow icon={<CreditCard size={16} />} label="Carte CIB" />
                                        <PaymentMethodRow icon={<CreditCard size={16} />} label="Carte Edahabia" />
                                        <PaymentMethodRow icon={<Landmark size={16} />} label="Virement bancaire" />
                                    </ul>
                                </div>

                                {(shopTel || shopAddress) && (
                                    <div className="pt-4 border-t border-white/5 space-y-2">
                                        <h3 className="text-[10px] uppercase font-black tracking-widest text-slate-500">
                                            Coordonnées
                                        </h3>
                                        {shopTel && (
                                            <div className="bg-[#161616] border border-[#262626] rounded-xl p-3 flex items-center justify-between">
                                                <div>
                                                    <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">
                                                        Téléphone / WhatsApp
                                                    </p>
                                                    <p className="text-white font-bold">{shopTel}</p>
                                                </div>
                                                <a
                                                    href={`https://wa.me/${shopTel.replace(/\D/g, "")}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 font-bold text-xs px-3 py-2 rounded-lg border border-emerald-500/30 flex items-center gap-1.5 transition-colors"
                                                    data-testid="recharge-wa-link"
                                                >
                                                    <MessageCircle size={14} />
                                                    WhatsApp
                                                </a>
                                            </div>
                                        )}
                                        {shopAddress && (
                                            <div className="bg-[#161616] border border-[#262626] rounded-xl p-3">
                                                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">
                                                    Adresse boutique
                                                </p>
                                                <p className="text-white font-bold text-sm leading-snug">
                                                    {shopAddress}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <p className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 italic">
                                    📌 Une fois le paiement reçu, votre wallet sera crédité instantanément
                                    et vous recevrez une confirmation WhatsApp.
                                </p>
                            </ModalBody>
                            <ModalFooter>
                                <Button onPress={close} className="bg-[var(--primary)] text-white font-black">
                                    Compris
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>
        </div>
    );
}

function PaymentMethodRow({ icon, label }: { icon: React.ReactNode; label: string }) {
    return (
        <li className="flex items-center gap-3 bg-[#161616] border border-[#262626] rounded-xl px-3 py-2">
            <span className="text-[var(--primary)]">{icon}</span>
            <span className="text-sm text-slate-200 font-medium">{label}</span>
        </li>
    );
}
