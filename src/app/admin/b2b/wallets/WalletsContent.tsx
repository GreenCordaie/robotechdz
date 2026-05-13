"use client";

import React, { useEffect, useState } from "react";
import {
    Spinner,
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Button,
    Input,
    Select,
    SelectItem,
    Textarea,
    useDisclosure,
    Chip,
} from "@heroui/react";
import {
    Wallet,
    Search,
    Plus,
    Building2,
    Mail,
    Phone,
    Banknote,
    CreditCard,
    Landmark,
    HandCoins,
    HelpCircle,
    CheckCircle2,
} from "lucide-react";
import { toast } from "react-hot-toast";
import {
    listResellerWalletsForAdminAction,
    adminRechargeWalletAction,
} from "./actions";
import { formatCurrency, formatDate } from "@/lib/formatters";

interface WalletRow {
    resellerId: number;
    companyName: string;
    contactPhone: string | null;
    resellerStatus: string;
    userEmail: string;
    walletId: number | null;
    balance: string | null;
    totalSpent: string | null;
    updatedAt: Date | string | null;
}

type Method = "CASH" | "CIB" | "EDAHABIA" | "BANK_TRANSFER" | "OTHER";

const METHOD_OPTIONS: Array<{ value: Method; label: string; icon: React.ReactNode }> = [
    { value: "CASH", label: "Espèces (boutique)", icon: <HandCoins size={16} /> },
    { value: "CIB", label: "Carte CIB", icon: <CreditCard size={16} /> },
    { value: "EDAHABIA", label: "Carte Edahabia", icon: <CreditCard size={16} /> },
    { value: "BANK_TRANSFER", label: "Virement bancaire", icon: <Landmark size={16} /> },
    { value: "OTHER", label: "Autre", icon: <HelpCircle size={16} /> },
];

export default function WalletsContent() {
    const [wallets, setWallets] = useState<WalletRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");

    const [activeWallet, setActiveWallet] = useState<WalletRow | null>(null);
    const rechargeModal = useDisclosure();
    const successModal = useDisclosure();
    const [successData, setSuccessData] = useState<{
        previousBalance: number;
        newBalance: number;
        amount: number;
    } | null>(null);

    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search), 300);
        return () => clearTimeout(t);
    }, [search]);

    const load = async () => {
        setLoading(true);
        const res = await listResellerWalletsForAdminAction({
            search: debouncedSearch || undefined,
        });
        if (res.success) {
            setWallets(res.data as WalletRow[]);
        } else {
            toast.error("Erreur chargement");
        }
        setLoading(false);
    };

    useEffect(() => {
        load();
    }, [debouncedSearch]);

    const openRecharge = (wallet: WalletRow) => {
        setActiveWallet(wallet);
        rechargeModal.onOpen();
    };

    const totalBalance = wallets.reduce(
        (acc, w) => acc + parseFloat(w.balance ?? "0"),
        0
    );
    const totalSpent = wallets.reduce(
        (acc, w) => acc + parseFloat(w.totalSpent ?? "0"),
        0
    );

    return (
        <div className="p-8 space-y-6 max-w-7xl">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
                        <Wallet className="text-[var(--primary)]" />
                        Wallets revendeurs
                    </h1>
                    <p className="text-sm text-slate-500 font-medium mt-1">
                        Recharge manuelle : le reseller paie en boutique → vous créditez son
                        wallet. Aucun paiement en ligne, tout passe par vous.
                    </p>
                </div>

                <div className="relative w-full md:w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input
                        type="text"
                        placeholder="Recherche raison sociale / email / tel"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-[#161616] border border-[#262626] rounded-2xl pl-11 pr-4 py-3 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-[var(--primary)]/50"
                    />
                </div>
            </header>

            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <KpiCard label="Total wallets" value={wallets.length.toString()} />
                <KpiCard label="Solde global" value={formatCurrency(totalBalance, "DZD")} accent />
                <KpiCard label="Volume cumulé" value={formatCurrency(totalSpent, "DZD")} />
            </div>

            {loading ? (
                <div className="py-20 flex justify-center">
                    <Spinner color="warning" />
                </div>
            ) : wallets.length === 0 ? (
                <div className="py-20 text-center text-slate-500 italic">
                    Aucun reseller {search ? "trouvé" : "encore enregistré"}.
                </div>
            ) : (
                <ul className="divide-y divide-[#262626] bg-[#161616] border border-[#262626] rounded-2xl overflow-hidden">
                    {wallets.map((w) => (
                        <li
                            key={w.resellerId}
                            data-testid="wallet-row"
                            className="p-5 flex flex-col md:flex-row md:items-center gap-4 hover:bg-white/[0.02]"
                        >
                            <div className="flex-1 min-w-0 space-y-1.5">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <Building2 size={14} className="text-slate-500" />
                                    <span className="font-bold text-white text-sm">{w.companyName}</span>
                                    <StatusBadge status={w.resellerStatus} />
                                </div>
                                <div className="text-xs text-slate-500 font-medium flex flex-wrap gap-3">
                                    <span className="flex items-center gap-1">
                                        <Mail size={12} /> {w.userEmail}
                                    </span>
                                    {w.contactPhone && (
                                        <span className="flex items-center gap-1">
                                            <Phone size={12} /> {w.contactPhone}
                                        </span>
                                    )}
                                </div>
                                <div className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">
                                    Dernière activité :{" "}
                                    {w.updatedAt ? formatDate(new Date(w.updatedAt)) : "—"}
                                </div>
                            </div>

                            <div className="flex flex-col items-end gap-2">
                                <div className="text-right">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                        Solde
                                    </p>
                                    <p className="text-xl font-black text-[var(--primary)]">
                                        {formatCurrency(parseFloat(w.balance ?? "0"), "DZD")}
                                    </p>
                                </div>
                                <Button
                                    size="sm"
                                    onPress={() => openRecharge(w)}
                                    data-testid="recharge-btn"
                                    disabled={w.resellerStatus !== "ACTIVE"}
                                    className="bg-[var(--primary)] text-white font-black"
                                    startContent={<Plus size={14} />}
                                >
                                    Recharger
                                </Button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {activeWallet && (
                <RechargeModal
                    isOpen={rechargeModal.isOpen}
                    onClose={rechargeModal.onClose}
                    wallet={activeWallet}
                    onSuccess={async (data) => {
                        setSuccessData(data);
                        rechargeModal.onClose();
                        successModal.onOpen();
                        await load();
                    }}
                />
            )}

            <Modal
                isOpen={successModal.isOpen}
                onClose={successModal.onClose}
                size="md"
                classNames={{
                    base: "bg-[#0f0d0c] border border-emerald-500/30 rounded-3xl",
                }}
            >
                <ModalContent>
                    {(close) => (
                        <>
                            <ModalHeader className="text-emerald-500 flex items-center gap-2">
                                <CheckCircle2 /> Recharge effectuée
                            </ModalHeader>
                            <ModalBody className="space-y-3 text-sm">
                                {successData && activeWallet && (
                                    <>
                                        <div className="space-y-1">
                                            <p className="text-xs text-slate-500 font-bold uppercase">Reseller</p>
                                            <p className="text-white font-bold">{activeWallet.companyName}</p>
                                        </div>
                                        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-white/5">
                                            <div>
                                                <p className="text-[9px] text-slate-500 font-black uppercase">Avant</p>
                                                <p className="text-slate-300 font-bold">
                                                    {formatCurrency(successData.previousBalance, "DZD")}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-[9px] text-emerald-500 font-black uppercase">+ Recharge</p>
                                                <p className="text-emerald-400 font-black">
                                                    +{formatCurrency(successData.amount, "DZD")}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-[9px] text-slate-500 font-black uppercase">Après</p>
                                                <p className="text-white font-black">
                                                    {formatCurrency(successData.newBalance, "DZD")}
                                                </p>
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-slate-500 italic pt-3 border-t border-white/5">
                                            Pensez à confirmer manuellement au reseller via WhatsApp/SMS.
                                            L&apos;envoi automatique sera implémenté en EPIC 6.
                                        </p>
                                    </>
                                )}
                            </ModalBody>
                            <ModalFooter>
                                <Button onPress={close} className="bg-[var(--primary)] text-white font-black">
                                    OK
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>
        </div>
    );
}

interface RechargeModalProps {
    isOpen: boolean;
    onClose: () => void;
    wallet: WalletRow;
    onSuccess: (data: { previousBalance: number; newBalance: number; amount: number }) => void;
}

function RechargeModal({ isOpen, onClose, wallet, onSuccess }: RechargeModalProps) {
    const [amount, setAmount] = useState("");
    const [method, setMethod] = useState<Method>("CASH");
    const [reference, setReference] = useState("");
    const [note, setNote] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setAmount("");
            setMethod("CASH");
            setReference("");
            setNote("");
        }
    }, [isOpen]);

    const submit = async () => {
        if (!amount || parseFloat(amount) <= 0) {
            toast.error("Montant invalide");
            return;
        }
        setSubmitting(true);
        try {
            const res = await adminRechargeWalletAction({
                resellerId: wallet.resellerId,
                amountDzd: amount,
                method,
                referenceNumber: reference || undefined,
                note: note || undefined,
            });
            if (res.success) {
                onSuccess(res.data as {
                    previousBalance: number;
                    newBalance: number;
                    amount: number;
                });
            } else {
                toast.error(res.error || "Échec recharge");
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="md"
            classNames={{
                base: "bg-[#0f0d0c] border border-[#2d2622] rounded-3xl",
                header: "border-b border-[#2d2622]",
                footer: "border-t border-[#2d2622]",
            }}
        >
            <ModalContent>
                {(close) => (
                    <>
                        <ModalHeader>
                            <div>
                                <h2 className="text-xl font-black text-white">Recharger wallet</h2>
                                <p className="text-xs text-slate-500 mt-1">
                                    {wallet.companyName} · solde actuel{" "}
                                    <span className="text-white font-bold">
                                        {formatCurrency(parseFloat(wallet.balance ?? "0"), "DZD")}
                                    </span>
                                </p>
                            </div>
                        </ModalHeader>
                        <ModalBody className="space-y-4">
                            <Input
                                label="Montant DZD"
                                type="number"
                                inputMode="decimal"
                                placeholder="10000"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                startContent={<Banknote size={16} className="text-slate-500" />}
                                variant="flat"
                                isRequired
                                data-testid="recharge-amount"
                            />

                            <Select
                                label="Méthode de paiement"
                                selectedKeys={new Set([method])}
                                onChange={(e) => setMethod(e.target.value as Method)}
                                variant="flat"
                                isRequired
                            >
                                {METHOD_OPTIONS.map((opt) => (
                                    <SelectItem key={opt.value} startContent={opt.icon}>
                                        {opt.label}
                                    </SelectItem>
                                ))}
                            </Select>

                            <Input
                                label="Référence reçu (optionnel)"
                                placeholder="N° de reçu, ID transaction CIB..."
                                value={reference}
                                onChange={(e) => setReference(e.target.value)}
                                variant="flat"
                                maxLength={80}
                            />

                            <Textarea
                                label="Note interne (optionnel)"
                                placeholder="Contexte, conditions spéciales..."
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                variant="flat"
                                maxLength={500}
                                description={`${note.length}/500`}
                            />

                            <p className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 italic">
                                ⚠️ Cette action est <strong>irréversible</strong>. La transaction est
                                inscrite avec audit log. Pensez à enregistrer le reçu physique.
                            </p>
                        </ModalBody>
                        <ModalFooter>
                            <Button variant="light" onPress={close} className="font-bold">
                                Annuler
                            </Button>
                            <Button
                                onPress={submit}
                                disabled={submitting || !amount}
                                className="bg-[var(--primary)] text-white font-black"
                                data-testid="recharge-submit"
                            >
                                {submitting ? <Spinner size="sm" color="white" /> : "Confirmer recharge"}
                            </Button>
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
}

function KpiCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
    return (
        <div className="bg-[#161616] border border-[#262626] rounded-2xl p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
            <p
                className={`mt-2 text-2xl font-black ${
                    accent ? "text-[var(--primary)]" : "text-white"
                }`}
            >
                {value}
            </p>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const map: Record<string, string> = {
        ACTIVE: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
        SUSPENDED: "bg-red-500/15 text-red-400 border-red-500/30",
    };
    return (
        <Chip
            size="sm"
            className={`${map[status] ?? "bg-slate-500/15 text-slate-400 border-slate-500/30"} font-bold text-[10px] uppercase tracking-wider border`}
        >
            {status}
        </Chip>
    );
}
