"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    Spinner,
    Button,
    Input,
    Select,
    SelectItem,
    Textarea,
    Chip,
} from "@heroui/react";
import {
    Wallet,
    Plus,
    ArrowDownToLine,
    ArrowUpFromLine,
    Banknote,
    Building2,
    RefreshCw,
} from "lucide-react";
import { toast } from "react-hot-toast";
import {
    getCentralWalletAction,
    topUpCentralWalletAction,
    creditResellerFromCentralAction,
    listCentralWalletTransactionsAction,
    listResellersForCreditAction,
} from "./actions";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { reconcileCentralCounters } from "@/services/central-wallet.service";

type CentralWalletState = {
    balance: string;
    totalToppedUp: string;
    totalDisbursed: string;
    updatedAt: Date | string;
};

type ResellerOption = {
    resellerId: number;
    companyName: string;
    status: string;
    walletBalance: string | null;
};

type TxRow = {
    id: number;
    type: string;
    amountDzd: string;
    balanceAfter: string;
    resellerId: number | null;
    companyName: string | null;
    adminUserId: number | null;
    adminEmail: string | null;
    reference: string | null;
    notes: string | null;
    createdAt: Date | string;
};

type TypeFilter = "all" | "admin_topup" | "reseller_credit" | "adjustment";

const FILTERS: Array<{ key: TypeFilter; label: string }> = [
    { key: "all", label: "Tous" },
    { key: "admin_topup", label: "Top-ups" },
    { key: "reseller_credit", label: "Crédits revendeur" },
    { key: "adjustment", label: "Ajustements" },
];

export default function CentralWalletContent() {
    const [wallet, setWallet] = useState<CentralWalletState | null>(null);
    const [loadingWallet, setLoadingWallet] = useState(true);

    const [resellers, setResellers] = useState<ResellerOption[]>([]);

    const [txs, setTxs] = useState<TxRow[]>([]);
    const [txTotal, setTxTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
    const [loadingTxs, setLoadingTxs] = useState(false);

    const refreshAll = useCallback(async () => {
        setLoadingWallet(true);
        const [walletRes, resellerRes] = await Promise.all([
            getCentralWalletAction({}),
            listResellersForCreditAction({}),
        ]);
        if (walletRes.success) setWallet(walletRes.data as CentralWalletState);
        else toast.error(walletRes.error || "Erreur chargement wallet");
        if (resellerRes.success) setResellers(resellerRes.data as ResellerOption[]);
        setLoadingWallet(false);
    }, []);

    const loadTxs = useCallback(async () => {
        setLoadingTxs(true);
        const res = await listCentralWalletTransactionsAction({
            page,
            limit: 25,
            type: typeFilter === "all" ? undefined : typeFilter,
        });
        if (res.success) {
            setTxs(res.data.items as TxRow[]);
            setTxTotal(res.data.pagination.total);
        } else {
            toast.error(res.error || "Erreur chargement transactions");
        }
        setLoadingTxs(false);
    }, [page, typeFilter]);

    useEffect(() => {
        refreshAll();
    }, [refreshAll]);

    useEffect(() => {
        loadTxs();
    }, [loadTxs]);

    const onTopUpDone = async () => {
        await refreshAll();
        await loadTxs();
    };

    const onCreditDone = async () => {
        await refreshAll();
        await loadTxs();
    };

    const balanceNum = parseFloat(wallet?.balance ?? "0");
    const totalPages = Math.max(1, Math.ceil(txTotal / 25));

    const reconciliation = wallet
        ? reconcileCentralCounters({
              balance: wallet.balance,
              totalToppedUp: wallet.totalToppedUp,
              totalDisbursed: wallet.totalDisbursed,
          })
        : null;

    return (
        <div className="p-8 space-y-6 max-w-7xl">
            <header className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
                        <Wallet className="text-[var(--primary)]" />
                        Wallet central B2B
                    </h1>
                    <p className="text-sm text-slate-500 font-medium mt-1">
                        Caisse centrale alimentée manuellement. Source des recharges revendeurs.
                    </p>
                </div>
                <Button
                    variant="flat"
                    onPress={refreshAll}
                    startContent={<RefreshCw size={14} />}
                    className="font-bold"
                >
                    Rafraîchir
                </Button>
            </header>

            {/* Sticky header KPIs */}
            <div className="sticky top-0 z-10 -mx-8 px-8 py-4 bg-[#0a0a0a]/95 backdrop-blur border-b border-[#262626]">
                {loadingWallet || !wallet ? (
                    <div className="h-16 flex items-center"><Spinner color="warning" /></div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <KpiCard
                            label="Solde actuel"
                            value={formatCurrency(balanceNum, "DZD")}
                            accent
                        />
                        <KpiCard
                            label="Total alimenté (à vie)"
                            value={formatCurrency(parseFloat(wallet.totalToppedUp), "DZD")}
                        />
                        <KpiCard
                            label="Total distribué (à vie)"
                            value={formatCurrency(parseFloat(wallet.totalDisbursed), "DZD")}
                        />
                    </div>
                )}
            </div>

            {/* Reconciliation banner — only shown when books don't balance */}
            {reconciliation && !reconciliation.balanced && (
                <div
                    data-testid="reconciliation-alert"
                    className="bg-red-500/10 border border-red-500/40 rounded-2xl p-4 flex items-start gap-3"
                >
                    <div className="text-red-400 text-2xl leading-none mt-0.5">⚠</div>
                    <div className="flex-1 space-y-1">
                        <p className="text-sm font-black text-red-300 uppercase tracking-wider">
                            Écart de réconciliation détecté
                        </p>
                        <p className="text-xs text-red-200/90 font-medium">
                            Solde attendu (top-ups − distributions) :{" "}
                            <strong>{formatCurrency(reconciliation.expectedBalance, "DZD")}</strong>
                            {" · "}
                            Solde réel : <strong>{formatCurrency(reconciliation.actualBalance, "DZD")}</strong>
                            {" · "}
                            Drift :{" "}
                            <strong className={reconciliation.drift < 0 ? "text-red-400" : "text-amber-400"}>
                                {reconciliation.drift > 0 ? "+" : ""}
                                {formatCurrency(reconciliation.drift, "DZD")}
                            </strong>
                        </p>
                        <p className="text-[11px] text-red-300/70">
                            Un écart indique une transaction qui a écrit sur le central sans passer
                            par le flux normal. Inspecter les ajustements et auditer les transactions.
                        </p>
                    </div>
                </div>
            )}

            {/* Action forms side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <TopUpForm
                    disabled={loadingWallet}
                    onDone={onTopUpDone}
                />
                <CreditResellerForm
                    centralBalance={balanceNum}
                    resellers={resellers}
                    disabled={loadingWallet}
                    onDone={onCreditDone}
                />
            </div>

            {/* Transactions table */}
            <section className="bg-[#161616] border border-[#262626] rounded-2xl">
                <header className="p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-[#262626]">
                    <h2 className="text-lg font-black text-white tracking-tight">
                        Historique des transactions
                    </h2>
                    <div className="flex gap-2 flex-wrap">
                        {FILTERS.map((f) => (
                            <Chip
                                key={f.key}
                                onClick={() => {
                                    setTypeFilter(f.key);
                                    setPage(1);
                                }}
                                className={`cursor-pointer font-bold text-xs uppercase tracking-wider border ${
                                    typeFilter === f.key
                                        ? "bg-[var(--primary)]/20 text-[var(--primary)] border-[var(--primary)]/40"
                                        : "bg-transparent text-slate-400 border-[#262626] hover:border-slate-500"
                                }`}
                            >
                                {f.label}
                            </Chip>
                        ))}
                    </div>
                </header>

                {loadingTxs ? (
                    <div className="py-12 flex justify-center"><Spinner color="warning" /></div>
                ) : txs.length === 0 ? (
                    <div className="py-12 text-center text-slate-500 italic">
                        Aucune transaction.
                    </div>
                ) : (
                    <ul className="divide-y divide-[#262626]">
                        {txs.map((t) => <TxRowItem key={t.id} tx={t} />)}
                    </ul>
                )}

                {totalPages > 1 && (
                    <footer className="p-4 flex items-center justify-between border-t border-[#262626]">
                        <span className="text-xs text-slate-500 font-bold">
                            Page {page} / {totalPages} · {txTotal} transactions
                        </span>
                        <div className="flex gap-2">
                            <Button
                                size="sm"
                                variant="flat"
                                disabled={page <= 1}
                                onPress={() => setPage((p) => Math.max(1, p - 1))}
                            >
                                Précédent
                            </Button>
                            <Button
                                size="sm"
                                variant="flat"
                                disabled={page >= totalPages}
                                onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                            >
                                Suivant
                            </Button>
                        </div>
                    </footer>
                )}
            </section>
        </div>
    );
}

function KpiCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
    return (
        <div className="bg-[#161616] border border-[#262626] rounded-2xl p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
            <p className={`mt-2 text-2xl font-black ${accent ? "text-[var(--primary)]" : "text-white"}`}>
                {value}
            </p>
        </div>
    );
}

function TopUpForm({
    onDone,
    disabled,
}: {
    onDone: () => void | Promise<void>;
    disabled?: boolean;
}) {
    const [amount, setAmount] = useState("");
    const [reference, setReference] = useState("");
    const [notes, setNotes] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const submit = async () => {
        if (!amount || parseFloat(amount) <= 0) {
            toast.error("Montant invalide");
            return;
        }
        setSubmitting(true);
        try {
            const res = await topUpCentralWalletAction({
                amountDzd: amount,
                reference: reference || undefined,
                notes: notes || undefined,
            });
            if (res.success) {
                toast.success(
                    `Wallet central rechargé. Nouveau solde : ${formatCurrency(parseFloat(res.data.newBalance), "DZD")}`
                );
                setAmount("");
                setReference("");
                setNotes("");
                await onDone();
            } else {
                toast.error(res.error || "Échec recharge");
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <section
            data-testid="topup-form"
            className="bg-[#161616] border border-[#262626] rounded-2xl p-5 space-y-4"
        >
            <header className="flex items-center gap-2 text-emerald-400">
                <ArrowDownToLine size={18} />
                <h2 className="text-lg font-black text-white">Recharger le wallet central</h2>
            </header>
            <p className="text-xs text-slate-500">
                Inscrit un dépôt manuel (virement reçu, cash en boutique, etc.).
            </p>

            <Input
                label="Montant DZD"
                type="number"
                inputMode="decimal"
                placeholder="100000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                startContent={<Banknote size={16} className="text-slate-500" />}
                variant="flat"
                isRequired
                data-testid="topup-amount"
            />
            <Input
                label="Référence (optionnel)"
                placeholder="Virement BNA #12345"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                variant="flat"
                maxLength={120}
            />
            <Textarea
                label="Notes internes (optionnel)"
                placeholder="Origine du dépôt, contexte..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                variant="flat"
                maxLength={500}
                description={`${notes.length}/500`}
            />

            <Button
                onPress={submit}
                disabled={submitting || disabled || !amount}
                className="bg-emerald-500 text-white font-black w-full"
                startContent={<Plus size={14} />}
                data-testid="topup-submit"
            >
                {submitting ? <Spinner size="sm" color="white" /> : "Recharger le wallet central"}
            </Button>
        </section>
    );
}

function CreditResellerForm({
    centralBalance,
    resellers,
    onDone,
    disabled,
}: {
    centralBalance: number;
    resellers: ResellerOption[];
    onDone: () => void | Promise<void>;
    disabled?: boolean;
}) {
    const [resellerId, setResellerId] = useState<string>("");
    const [amount, setAmount] = useState("");
    const [reference, setReference] = useState("");
    const [notes, setNotes] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const selectedReseller = useMemo(
        () => resellers.find((r) => r.resellerId.toString() === resellerId),
        [resellers, resellerId]
    );

    const amountNum = parseFloat(amount || "0");
    const insufficient = amountNum > 0 && amountNum > centralBalance;
    const postCentral = Math.max(0, centralBalance - (amountNum || 0));
    const postReseller = (parseFloat(selectedReseller?.walletBalance ?? "0") || 0) + (amountNum || 0);

    const submit = async () => {
        if (!selectedReseller) {
            toast.error("Sélectionnez un revendeur");
            return;
        }
        if (!amount || amountNum <= 0) {
            toast.error("Montant invalide");
            return;
        }
        if (insufficient) {
            toast.error("Solde central insuffisant");
            return;
        }
        setSubmitting(true);
        try {
            const res = await creditResellerFromCentralAction({
                resellerId: selectedReseller.resellerId,
                amountDzd: amount,
                reference: reference || undefined,
                notes: notes || undefined,
            });
            if (res.success) {
                toast.success(
                    `${selectedReseller.companyName} crédité. Nouveau solde reseller : ${formatCurrency(parseFloat(res.data.resellerNewBalance), "DZD")}`
                );
                setAmount("");
                setReference("");
                setNotes("");
                await onDone();
            } else {
                toast.error(res.error || "Échec crédit");
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <section
            data-testid="credit-form"
            className="bg-[#161616] border border-[#262626] rounded-2xl p-5 space-y-4"
        >
            <header className="flex items-center gap-2 text-[var(--primary)]">
                <ArrowUpFromLine size={18} />
                <h2 className="text-lg font-black text-white">Créditer un revendeur</h2>
            </header>
            <p className="text-xs text-slate-500">
                Débite le wallet central et crédite le wallet du revendeur sélectionné.
            </p>

            <Select
                label="Revendeur"
                placeholder="Sélectionner un revendeur actif"
                selectedKeys={resellerId ? new Set([resellerId]) : new Set()}
                onChange={(e) => setResellerId(e.target.value)}
                variant="flat"
                isRequired
                startContent={<Building2 size={16} className="text-slate-500" />}
            >
                {resellers.map((r) => (
                    <SelectItem
                        key={r.resellerId.toString()}
                        textValue={r.companyName}
                    >
                        <div className="flex items-center justify-between w-full">
                            <span className="font-bold">{r.companyName}</span>
                            <span className="text-xs text-slate-400">
                                {formatCurrency(parseFloat(r.walletBalance ?? "0"), "DZD")}
                            </span>
                        </div>
                    </SelectItem>
                ))}
            </Select>

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
                data-testid="credit-amount"
                color={insufficient ? "danger" : "default"}
                errorMessage={insufficient ? "Solde central insuffisant" : undefined}
            />
            <Input
                label="Référence (optionnel)"
                placeholder="Note interne"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                variant="flat"
                maxLength={120}
            />
            <Textarea
                label="Notes internes (optionnel)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                variant="flat"
                maxLength={500}
            />

            {selectedReseller && amountNum > 0 && !insufficient && (
                <div className="bg-[#0e0e0e] border border-[#262626] rounded-xl p-3 grid grid-cols-2 gap-3 text-xs">
                    <div>
                        <p className="text-[9px] text-slate-500 font-black uppercase">Central après</p>
                        <p className="text-white font-bold">{formatCurrency(postCentral, "DZD")}</p>
                    </div>
                    <div>
                        <p className="text-[9px] text-slate-500 font-black uppercase">Reseller après</p>
                        <p className="text-emerald-400 font-bold">{formatCurrency(postReseller, "DZD")}</p>
                    </div>
                </div>
            )}

            <Button
                onPress={submit}
                disabled={
                    submitting ||
                    disabled ||
                    !amount ||
                    !selectedReseller ||
                    insufficient
                }
                className="bg-[var(--primary)] text-white font-black w-full"
                data-testid="credit-submit"
            >
                {submitting ? <Spinner size="sm" color="white" /> : "Créditer le revendeur"}
            </Button>
        </section>
    );
}

function TxRowItem({ tx }: { tx: TxRow }) {
    const amount = parseFloat(tx.amountDzd);
    const isOut = amount < 0;
    const typeLabel: Record<string, string> = {
        admin_topup: "Top-up admin",
        reseller_credit: "Crédit revendeur",
        adjustment: "Ajustement",
    };
    return (
        <li className="p-4 flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                    <Chip
                        size="sm"
                        className={`font-bold text-[10px] uppercase tracking-wider border ${
                            tx.type === "admin_topup"
                                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                : tx.type === "reseller_credit"
                                ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                                : "bg-slate-500/15 text-slate-300 border-slate-500/30"
                        }`}
                    >
                        {typeLabel[tx.type] ?? tx.type}
                    </Chip>
                    {tx.companyName && (
                        <span className="text-sm font-bold text-white">{tx.companyName}</span>
                    )}
                    {tx.reference && (
                        <span className="text-xs text-slate-500">· {tx.reference}</span>
                    )}
                </div>
                {tx.notes && (
                    <p className="text-xs text-slate-500 italic">{tx.notes}</p>
                )}
                <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">
                    {formatDate(new Date(tx.createdAt))}
                    {tx.adminEmail ? ` · par ${tx.adminEmail}` : ""}
                </p>
            </div>
            <div className="text-right shrink-0">
                <p className={`text-lg font-black ${isOut ? "text-red-400" : "text-emerald-400"}`}>
                    {isOut ? "" : "+"}
                    {formatCurrency(amount, "DZD")}
                </p>
                <p className="text-[10px] text-slate-500 font-bold uppercase">
                    Solde après: {formatCurrency(parseFloat(tx.balanceAfter), "DZD")}
                </p>
            </div>
        </li>
    );
}
