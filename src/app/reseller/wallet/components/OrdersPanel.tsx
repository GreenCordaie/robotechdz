"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Chip, Spinner } from "@heroui/react";
import { toast } from "react-hot-toast";
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
    getResellerOrdersByKindAction,
    type NormalizedOrderRow,
    type OrderKind,
} from "../actions";
import { KIND_LABELS, sanitizeSupplierText } from "./types";

const ORDER_TABS: Array<{ key: OrderKind; label: string }> = [
    { key: "all", label: "Toutes" },
    // BSV + G2Bulk merged into one neutral family — suppliers are confidential.
    { key: "giftcards", label: "Cartes & Vouchers" },
    { key: "iptv", label: "IPTV" },
    { key: "active", label: "Active Code" },
    { key: "manual", label: "Manuel" },
    { key: "legacy", label: "Legacy" },
];

export function OrdersPanel() {
    const router = useRouter();
    const [kind, setKind] = useState<OrderKind>("all");
    const [rows, setRows] = useState<NormalizedOrderRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        getResellerOrdersByKindAction({ kind, limit: 50 }).then((res) => {
            if (cancelled) return;
            if (res.success) {
                setRows(res.data as NormalizedOrderRow[]);
            } else {
                toast.error("Erreur chargement commandes");
            }
            setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [kind]);

    return (
        <div className="space-y-4" data-testid="wallet-orders-panel">
            <div className="bg-[#161616] border border-[#262626] rounded-2xl p-2 flex items-center gap-1 overflow-x-auto">
                {ORDER_TABS.map((t) => {
                    const active = kind === t.key;
                    return (
                        <button
                            type="button"
                            key={t.key}
                            data-testid={`orders-tab-${t.key}`}
                            onClick={() => setKind(t.key)}
                            className={`px-3 h-9 rounded-xl text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all ${
                                active
                                    ? "bg-[var(--primary)] text-white"
                                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                            }`}
                        >
                            {t.label}
                        </button>
                    );
                })}
            </div>

            {kind === "iptv" && (
                <div className="bg-sky-500/5 border border-sky-500/20 rounded-2xl p-4 flex items-center justify-between gap-3">
                    <p className="text-xs text-sky-300 font-medium leading-relaxed">
                        Pour gérer vos lignes (renouveler, suspendre, voir le détail),
                        utilisez la page dédiée.
                    </p>
                    <Button
                        size="sm"
                        onPress={() => router.push("/reseller/iptv")}
                        className="bg-sky-500/15 text-sky-300 font-bold border border-sky-500/30"
                    >
                        Gérer mes lignes
                    </Button>
                </div>
            )}

            <div className="space-y-3">
                {loading ? (
                    <div className="py-20 flex justify-center"><Spinner color="warning" /></div>
                ) : rows.length === 0 ? (
                    <div className="py-20 text-center opacity-30 italic font-bold">
                        Aucune commande dans cette catégorie
                    </div>
                ) : (
                    rows.map((r, i) => <OrderRowCard key={`${r.kind}-${r.orderNumber}-${i}`} row={r} />)
                )}
            </div>
        </div>
    );
}

function OrderRowCard({ row }: { row: NormalizedOrderRow }) {
    const statusStyle = orderStatusStyle(row.status);
    return (
        <div
            className="bg-[#161616] border border-[#262626] rounded-2xl p-5 flex items-center justify-between gap-4"
            data-testid="order-row"
        >
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-black text-white text-sm">{row.orderNumber}</span>
                    <Chip size="sm" className={`${statusStyle} font-bold text-[9px] uppercase`}>
                        {row.status}
                    </Chip>
                    <Chip size="sm" className="bg-white/5 text-slate-400 font-bold text-[9px] uppercase border border-white/10">
                        {KIND_LABELS[row.kind] ?? row.kind}
                    </Chip>
                </div>
                <p className="text-xs text-slate-400 font-medium truncate">
                    {sanitizeSupplierText(row.productName)}
                </p>
                <p className="text-[10px] text-slate-600 font-bold uppercase mt-1">
                    {formatDate(new Date(row.createdAt))}
                </p>
            </div>
            <div className="text-right shrink-0">
                <p className="font-black text-[var(--primary)] text-base">
                    {formatCurrency(row.priceDzd, "DZD")}
                </p>
            </div>
        </div>
    );
}

function orderStatusStyle(status: string): string {
    const s = status.toUpperCase();
    if (["COMPLETED", "DELIVERED", "TERMINE", "PAYE", "LIVRE", "ACTIVE"].includes(s)) {
        return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
    }
    if (["PENDING_LOADBRAIN", "PENDING_DELIVERY", "EN_ATTENTE", "PROCESSING", "QUEUED"].includes(s)) {
        return "bg-amber-500/10 text-amber-400 border border-amber-500/20";
    }
    if (["FAILED", "ANNULE", "CANCELLED", "EXPIRED"].includes(s)) {
        return "bg-red-500/10 text-red-400 border border-red-500/20";
    }
    if (["REFUNDED", "REMBOURSE"].includes(s)) {
        return "bg-sky-500/10 text-sky-400 border border-sky-500/20";
    }
    return "bg-slate-500/10 text-slate-400 border border-slate-500/20";
}
