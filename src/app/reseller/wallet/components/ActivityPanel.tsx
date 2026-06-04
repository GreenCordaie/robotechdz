"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
    Button,
    Chip,
    Select,
    SelectItem,
    Spinner,
} from "@heroui/react";
import {
    ArrowDownCircle,
    ArrowUpCircle,
    Filter,
    RefreshCw,
    Search,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
    getResellerTransactionsPagedAction,
    TX_SOURCES,
    TX_TYPES,
} from "../actions";
import { SOURCE_LABELS, TX_TYPE_LABELS, sanitizeSupplierText, type TxRow } from "./types";

// Dedupe the source filter by display label so the two confidential suppliers
// (BSV, G2BULK) — both shown as "Cartes & Vouchers" — collapse to one option.
const SOURCE_FILTER_OPTIONS = (() => {
    const seen = new Set<string>();
    return TX_SOURCES.filter((s) => {
        const label = SOURCE_LABELS[s] ?? s;
        if (seen.has(label)) return false;
        seen.add(label);
        return true;
    });
})();

export function ActivityPanel({ walletId }: { walletId: number | null }) {
    const [items, setItems] = useState<TxRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [offset, setOffset] = useState(0);
    const [nextOffset, setNextOffset] = useState<number | null>(null);
    const [type, setType] = useState<string>("ALL");
    const [source, setSource] = useState<string>("ALL");
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");

    useEffect(() => {
        const t = window.setTimeout(() => setDebouncedSearch(search), 400);
        return () => window.clearTimeout(t);
    }, [search]);

    const load = useCallback(
        async (resetOffset: boolean) => {
            if (!walletId) {
                setItems([]);
                setLoading(false);
                return;
            }
            setLoading(true);
            const o = resetOffset ? 0 : offset;
            const res = await getResellerTransactionsPagedAction({
                offset: o,
                limit: 50,
                type: type !== "ALL" ? (type as (typeof TX_TYPES)[number]) : undefined,
                source: source !== "ALL" ? (source as (typeof TX_SOURCES)[number]) : undefined,
                search: debouncedSearch || undefined,
            });
            if (res.success) {
                const data = res.data as { items: TxRow[]; nextOffset: number | null };
                setItems((prev) => (resetOffset ? data.items : [...prev, ...data.items]));
                setNextOffset(data.nextOffset);
                if (resetOffset) setOffset(0);
            } else {
                toast.error("Erreur chargement transactions");
            }
            setLoading(false);
        },
        [walletId, type, source, debouncedSearch, offset],
    );

    useEffect(() => {
        load(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [walletId, type, source, debouncedSearch]);

    useEffect(() => {
        if (offset > 0) load(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [offset]);

    const onLoadMore = () => {
        if (nextOffset === null) return;
        setOffset(nextOffset);
    };

    return (
        <div className="space-y-4" data-testid="wallet-activity-panel">
            <div className="bg-[#161616] border border-[#262626] rounded-2xl p-4 flex flex-col md:flex-row gap-3">
                <div className="flex-1 relative">
                    <Search
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                    />
                    <input
                        type="text"
                        placeholder="Rechercher dans les descriptions..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-[var(--primary)]/50"
                    />
                </div>
                <Select
                    aria-label="Type"
                    size="sm"
                    selectedKeys={[type]}
                    onChange={(e) => setType(e.target.value || "ALL")}
                    className="md:w-44"
                    startContent={<Filter size={14} />}
                >
                    {[
                        <SelectItem key="ALL">Tous types</SelectItem>,
                        ...TX_TYPES.map((t) => (
                            <SelectItem key={t}>{TX_TYPE_LABELS[t] ?? t}</SelectItem>
                        )),
                    ]}
                </Select>
                <Select
                    aria-label="Source"
                    size="sm"
                    selectedKeys={[source]}
                    onChange={(e) => setSource(e.target.value || "ALL")}
                    className="md:w-52"
                >
                    {[
                        <SelectItem key="ALL">Toutes sources</SelectItem>,
                        ...SOURCE_FILTER_OPTIONS.map((s) => (
                            <SelectItem key={s}>{SOURCE_LABELS[s] ?? s}</SelectItem>
                        )),
                    ]}
                </Select>
            </div>

            <div className="space-y-3">
                {loading && items.length === 0 ? (
                    <div className="py-20 flex justify-center"><Spinner color="warning" /></div>
                ) : items.length === 0 ? (
                    <div className="py-20 text-center opacity-30 italic font-bold">
                        Aucune transaction
                    </div>
                ) : (
                    items.map((tx) => <TxRowCard key={tx.id} tx={tx} />)
                )}
            </div>

            {nextOffset !== null && (
                <div className="flex justify-center">
                    <Button
                        size="sm"
                        onPress={onLoadMore}
                        isDisabled={loading}
                        className="bg-white/5 text-white font-bold border border-white/10"
                        startContent={loading ? <Spinner size="sm" color="white" /> : <RefreshCw size={14} />}
                    >
                        {loading ? "Chargement..." : "Charger 50 de plus"}
                    </Button>
                </div>
            )}
        </div>
    );
}

function TxRowCard({ tx }: { tx: TxRow }) {
    // Bug 4 fix — 3 distinct styles for PURCHASE / RECHARGE / REFUND.
    let icon: React.ReactNode;
    let badgeBg: string;
    let badgeColor: string;
    let amountClass: string;
    let sign: string;
    if (tx.type === "PURCHASE") {
        icon = <ArrowDownCircle size={20} />;
        badgeBg = "bg-red-500/10 border-red-500/20 text-red-500";
        badgeColor = "text-red-400";
        amountClass = "text-white";
        sign = "-";
    } else if (tx.type === "RECHARGE") {
        icon = <ArrowUpCircle size={20} />;
        badgeBg = "bg-emerald-500/10 border-emerald-500/20 text-emerald-500";
        badgeColor = "text-emerald-400";
        amountClass = "text-emerald-400";
        sign = "+";
    } else {
        // REFUND
        icon = <RefreshCw size={20} />;
        badgeBg = "bg-sky-500/10 border-sky-500/20 text-sky-400";
        badgeColor = "text-sky-400";
        amountClass = "text-sky-300";
        sign = "+";
    }

    const sourceLabel = tx.source ? SOURCE_LABELS[tx.source] ?? tx.source : null;

    return (
        <div
            className="bg-[#161616] border border-[#262626] rounded-2xl p-5 flex items-center justify-between gap-4 hover:border-[var(--primary)]/20 transition-all"
            data-testid="tx-row"
            data-tx-type={tx.type}
            data-tx-source={tx.source ?? ""}
        >
            <div className="flex items-center gap-4 min-w-0">
                <div className={`size-12 rounded-xl flex items-center justify-center border shrink-0 ${badgeBg}`}>
                    {icon}
                </div>
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-white text-sm truncate">
                            {sanitizeSupplierText(tx.description) ||
                                (tx.type === "PURCHASE"
                                    ? "Achat"
                                    : tx.type === "RECHARGE"
                                        ? "Rechargement"
                                        : "Remboursement")}
                        </h4>
                        {sourceLabel && (
                            <Chip
                                size="sm"
                                className={`bg-white/5 ${badgeColor} font-bold text-[9px] uppercase tracking-wider border border-white/10`}
                            >
                                {sourceLabel}
                            </Chip>
                        )}
                    </div>
                    <p className="text-xs text-slate-500 font-medium">Ref: #{tx.id}</p>
                </div>
            </div>
            <div className="text-right shrink-0">
                <p className={`font-black ${amountClass}`}>
                    {sign}
                    {formatCurrency(parseFloat(tx.amount), "DZD")}
                </p>
                <p className="text-[10px] text-slate-600 font-bold uppercase mt-1">
                    {tx.createdAt ? formatDate(new Date(tx.createdAt)) : ""}
                </p>
            </div>
        </div>
    );
}
