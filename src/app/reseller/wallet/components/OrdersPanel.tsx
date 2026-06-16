"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Chip, Spinner } from "@heroui/react";
import { Copy, Send, RotateCcw } from "lucide-react";
import { toast } from "react-hot-toast";
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
    getResellerOrdersByKindAction,
    type NormalizedOrderRow,
} from "../actions";
import { requestActiveCodeRefundAction } from "@/app/reseller/refunds/actions";
import { KIND_LABELS, sanitizeSupplierText, type OrderKind } from "./types";

const ORDER_TABS: Array<{ key: OrderKind; label: string }> = [
    { key: "all", label: "Toutes" },
    // BSV + G2Bulk merged into one neutral family — suppliers are confidential.
    { key: "giftcards", label: "Cartes & Vouchers" },
    { key: "iptv", label: "IPTV" },
    { key: "active", label: "Active Code" },
    { key: "manual", label: "Manuel" },
    { key: "legacy", label: "Legacy" },
];

const PAGE_SIZE = 12;

export function OrdersPanel() {
    const router = useRouter();
    const [kind, setKind] = useState<OrderKind>("all");
    const [rows, setRows] = useState<NormalizedOrderRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [resellerName, setResellerName] = useState<string | undefined>(undefined);
    const [page, setPage] = useState(1);

    // Reseller shop name — signs the WhatsApp re-share message.
    useEffect(() => {
        import("@/app/reseller/actions").then(({ getCurrentResellerAction }) =>
            getCurrentResellerAction({}).then((res) => {
                if (res.success && res.data) {
                    setResellerName((res.data as { companyName?: string }).companyName);
                }
            }),
        );
    }, []);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setPage(1);
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
                    rows
                        .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
                        .map((r, i) => (
                            <OrderRowCard
                                key={`${r.kind}-${r.orderNumber}-${i}`}
                                row={r}
                                resellerName={resellerName}
                            />
                        ))
                )}
            </div>

            {!loading && rows.length > PAGE_SIZE && (
                <div className="flex items-center justify-between gap-3 pt-1">
                    <button
                        type="button"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className="px-3 h-9 rounded-lg border border-[#262626] text-xs font-bold text-slate-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        ← Précédent
                    </button>
                    <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                        Page {page} / {Math.ceil(rows.length / PAGE_SIZE)} · {rows.length}{" "}
                        commande{rows.length > 1 ? "s" : ""}
                    </span>
                    <button
                        type="button"
                        disabled={page >= Math.ceil(rows.length / PAGE_SIZE)}
                        onClick={() =>
                            setPage((p) =>
                                Math.min(Math.ceil(rows.length / PAGE_SIZE), p + 1),
                            )
                        }
                        className="px-3 h-9 rounded-lg border border-[#262626] text-xs font-bold text-slate-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        Suivant →
                    </button>
                </div>
            )}
        </div>
    );
}

function OrderRowCard({ row, resellerName }: { row: NormalizedOrderRow; resellerName?: string }) {
    const statusStyle = orderStatusStyle(row.status);
    const code = row.codeOrLink;
    const isLink = !!code && /^https?:\/\//i.test(code);

    // Refund-request state for eligible active-code rows.
    const canRequestRefund =
        row.kind === "active" &&
        row.status.toUpperCase() === "DELIVERED" &&
        typeof row.activeCodeOrderId === "number";
    const [refundOpen, setRefundOpen] = useState(false);
    const [refundReason, setRefundReason] = useState("");
    const [refundSubmitting, setRefundSubmitting] = useState(false);
    const [refundSent, setRefundSent] = useState(false);

    const submitRefund = async () => {
        if (typeof row.activeCodeOrderId !== "number") return;
        setRefundSubmitting(true);
        const res = await requestActiveCodeRefundAction({
            activeCodeOrderId: row.activeCodeOrderId,
            reason: refundReason.trim() || undefined,
        });
        setRefundSubmitting(false);
        if (res.success) {
            setRefundSent(true);
            setRefundOpen(false);
            toast.success("Demande de remboursement envoyée");
        } else {
            toast.error(res.error || "Échec de la demande");
        }
    };

    const copyCode = () => {
        if (!code) return;
        navigator.clipboard
            .writeText(code)
            .then(() => toast.success(isLink ? "Lien copié" : "Code copié"))
            .catch(() => toast.error("Impossible de copier"));
    };

    const shareWhatsApp = () => {
        if (!code) return;
        const who = resellerName?.trim() ? ` — ${resellerName.trim()}` : "";
        const intro = isLink ? "Voici votre lien d'accès" : "Voici votre code";
        const msg =
            `🛍️ *Votre commande*${who}\n\n${intro} :\n${code}\n\nMerci de votre confiance ! 🙏`;
        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
    };

    return (
        <div
            className="bg-[#161616] border border-[#262626] rounded-2xl p-5"
            data-testid="order-row"
        >
            <div className="flex items-center justify-between gap-4">
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

            {/* Re-access the delivered code/link any time — copy + WhatsApp share. */}
            {code && (
                <div className="mt-3 pt-3 border-t border-[#262626] flex items-center gap-2">
                    <button
                        type="button"
                        onClick={copyCode}
                        title="Cliquer pour copier"
                        className="flex-1 min-w-0 flex items-center justify-between gap-2 bg-[#0a0a0a] border border-[#262626] rounded-lg px-3 py-2 hover:border-[var(--primary)]/40 transition-colors text-left group"
                    >
                        <span className="font-mono text-xs text-white truncate">{code}</span>
                        <Copy className="size-4 text-slate-500 group-hover:text-[var(--primary)] shrink-0" />
                    </button>
                    <button
                        type="button"
                        onClick={shareWhatsApp}
                        className="shrink-0 inline-flex items-center gap-1.5 bg-[#25D366] text-black font-black rounded-lg px-3 py-2 hover:bg-[#25D366]/90 transition-colors text-xs"
                    >
                        <Send className="size-4" /> Partager
                    </button>
                </div>
            )}

            {/* Refund-request affordance — only on eligible delivered active-code rows. */}
            {canRequestRefund && (
                <div className="mt-3 pt-3 border-t border-[#262626] flex items-center justify-end">
                    {refundSent ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-sky-400">
                            <RotateCcw className="size-3.5" /> Demande envoyée
                        </span>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setRefundOpen(true)}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 border border-[#262626] rounded-lg px-3 py-1.5 transition-colors hover:border-sky-500/40 hover:text-sky-300"
                        >
                            <RotateCcw className="size-3.5" /> Demander un remboursement
                        </button>
                    )}
                </div>
            )}

            {refundOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-[#161616] border border-[#262626] rounded-2xl w-full max-w-md overflow-hidden">
                        <div className="px-5 py-4 border-b border-[#262626] flex items-center justify-between">
                            <div>
                                <h2 className="text-sm font-black text-white">
                                    Demander un remboursement
                                </h2>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                    {row.orderNumber} · {sanitizeSupplierText(row.productName)}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setRefundOpen(false)}
                                className="text-slate-500 hover:text-white text-xl leading-none"
                            >
                                ×
                            </button>
                        </div>
                        <div className="px-5 py-5 space-y-4">
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Votre demande sera examinée par un administrateur. Aucun
                                montant n&apos;est crédité tant qu&apos;elle n&apos;est pas
                                approuvée.
                            </p>
                            <div>
                                <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">
                                    Motif (optionnel)
                                </label>
                                <textarea
                                    value={refundReason}
                                    onChange={(e) => setRefundReason(e.target.value)}
                                    maxLength={500}
                                    rows={3}
                                    placeholder="Expliquez la raison de la demande…"
                                    className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-sky-500/50 resize-none"
                                />
                            </div>
                            <div className="flex gap-3 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setRefundOpen(false)}
                                    disabled={refundSubmitting}
                                    className="flex-1 border border-[#262626] text-slate-300 rounded-xl py-2.5 text-sm font-bold transition-colors hover:bg-white/5 disabled:opacity-50"
                                >
                                    Annuler
                                </button>
                                <button
                                    type="button"
                                    onClick={submitRefund}
                                    disabled={refundSubmitting}
                                    className="flex-1 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-black transition-colors"
                                >
                                    {refundSubmitting ? "Envoi…" : "Envoyer la demande"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
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
