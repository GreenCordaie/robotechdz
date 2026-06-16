"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { toast } from "react-hot-toast";
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
    approveActiveCodeRefundAction,
    rejectActiveCodeRefundAction,
} from "./actions";

export interface RefundRequestRow {
    id: number;
    kind: string;
    activeCodeOrderId: number;
    orderNumber: string | null;
    resellerCompany: string | null;
    provider: string;
    planId: string;
    planLabel: string | null;
    priceDzd: string;
    reason: string | null;
    status: string;
    reusable: boolean | null;
    decisionReason: string | null;
    decidedBy: number | null;
    decidedAt: Date | string | null;
    createdAt: Date | string | null;
}

const KIND_LABELS: Record<string, string> = {
    active: "Active Code",
    g2bulk: "g2bulk",
    bsv: "BSV/Carte",
};

function kindLabel(kind: string): string {
    return KIND_LABELS[kind] ?? kind;
}

function kindStyle(kind: string): string {
    switch (kind) {
        case "active":
            return "bg-violet-500/10 text-violet-400 border border-violet-500/20";
        case "g2bulk":
            return "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20";
        case "bsv":
            return "bg-orange-500/10 text-orange-400 border border-orange-500/20";
        default:
            return "bg-slate-500/10 text-slate-400 border border-slate-500/20";
    }
}

function statusStyle(status: string): string {
    switch (status.toUpperCase()) {
        case "PENDING":
            return "bg-amber-500/10 text-amber-400 border border-amber-500/20";
        case "APPROVED":
            return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
        case "REJECTED":
            return "bg-red-500/10 text-red-400 border border-red-500/20";
        default:
            return "bg-slate-500/10 text-slate-400 border border-slate-500/20";
    }
}

export default function RefundRequestsClient({
    initialRows,
}: {
    initialRows: RefundRequestRow[];
}) {
    const router = useRouter();
    const [approveTarget, setApproveTarget] = useState<RefundRequestRow | null>(null);
    const [rejectTarget, setRejectTarget] = useState<RefundRequestRow | null>(null);

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                    <RotateCcw className="size-5" />
                </div>
                <div>
                    <h1 className="text-xl font-black text-white">Remboursements</h1>
                    <p className="text-xs text-slate-500 font-medium">
                        Demandes de remboursement Active Code (revendeurs)
                    </p>
                </div>
            </div>

            <div className="bg-[#161616] border border-[#262626] rounded-2xl overflow-hidden">
                {initialRows.length === 0 ? (
                    <div className="py-20 text-center opacity-30 italic font-bold">
                        Aucune demande de remboursement
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-[#262626] text-[10px] uppercase tracking-widest text-slate-500">
                                    <th className="text-left font-bold px-4 py-3">Commande</th>
                                    <th className="text-left font-bold px-4 py-3">Type</th>
                                    <th className="text-left font-bold px-4 py-3">Revendeur</th>
                                    <th className="text-left font-bold px-4 py-3">Offre</th>
                                    <th className="text-right font-bold px-4 py-3">Prix</th>
                                    <th className="text-left font-bold px-4 py-3">Motif</th>
                                    <th className="text-left font-bold px-4 py-3">Statut</th>
                                    <th className="text-left font-bold px-4 py-3">Date</th>
                                    <th className="text-right font-bold px-4 py-3">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {initialRows.map((r) => (
                                    <tr
                                        key={r.id}
                                        className="border-b border-[#262626] last:border-0 hover:bg-white/[0.02]"
                                    >
                                        <td className="px-4 py-3 font-black text-white whitespace-nowrap">
                                            {r.orderNumber ?? `AC-${r.activeCodeOrderId}`}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <span
                                                className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${kindStyle(r.kind)}`}
                                            >
                                                {kindLabel(r.kind)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-300">
                                            {r.resellerCompany ?? "—"}
                                        </td>
                                        <td className="px-4 py-3 text-slate-400">
                                            {r.planLabel ?? r.planId}
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-[var(--primary)] whitespace-nowrap">
                                            {formatCurrency(parseFloat(r.priceDzd), "DZD")}
                                        </td>
                                        <td className="px-4 py-3 text-slate-500 max-w-[220px] truncate">
                                            {r.reason || "—"}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${statusStyle(r.status)}`}
                                            >
                                                {r.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-[11px] text-slate-500 whitespace-nowrap">
                                            {r.createdAt ? formatDate(new Date(r.createdAt)) : "—"}
                                        </td>
                                        <td className="px-4 py-3 text-right whitespace-nowrap">
                                            {r.status.toUpperCase() === "PENDING" ? (
                                                <div className="inline-flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setApproveTarget(r)}
                                                        className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg px-3 py-1.5 text-xs font-bold transition-colors"
                                                    >
                                                        Approuver
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setRejectTarget(r)}
                                                        className="border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors"
                                                    >
                                                        Rejeter
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="text-[11px] text-slate-600">—</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {approveTarget && (
                <ApproveModal
                    request={approveTarget}
                    onClose={() => setApproveTarget(null)}
                    onDone={() => {
                        setApproveTarget(null);
                        router.refresh();
                    }}
                />
            )}
            {rejectTarget && (
                <RejectModal
                    request={rejectTarget}
                    onClose={() => setRejectTarget(null)}
                    onDone={() => {
                        setRejectTarget(null);
                        router.refresh();
                    }}
                />
            )}
        </div>
    );
}

function ApproveModal({
    request,
    onClose,
    onDone,
}: {
    request: RefundRequestRow;
    onClose: () => void;
    onDone: () => void;
}) {
    const [reusable, setReusable] = useState(false);
    const [loading, setLoading] = useState(false);

    const confirm = async () => {
        setLoading(true);
        const res = await approveActiveCodeRefundAction({
            requestId: request.id,
            reusable,
        });
        setLoading(false);
        if (res.success) {
            toast.success("Remboursement approuvé");
            onDone();
        } else {
            toast.error(res.error || "Échec de l'approbation");
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-[#161616] border border-[#262626] rounded-2xl w-full max-w-md overflow-hidden">
                <div className="px-5 py-4 border-b border-[#262626] flex items-center justify-between">
                    <div>
                        <h2 className="text-sm font-black text-white">
                            Approuver le remboursement
                        </h2>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                            {request.orderNumber ?? `AC-${request.activeCodeOrderId}`}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-slate-500 hover:text-white text-xl leading-none"
                    >
                        ×
                    </button>
                </div>
                <div className="px-5 py-5 space-y-4">
                    <div className="bg-[#0a0a0a] border border-[#262626] rounded-xl p-4 space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-slate-500">Revendeur</span>
                            <span className="font-bold text-white">
                                {request.resellerCompany ?? "—"}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500">Offre</span>
                            <span className="font-semibold text-slate-200">
                                {request.planLabel ?? request.planId}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500">Montant remboursé</span>
                            <span className="font-black text-[var(--primary)]">
                                {formatCurrency(parseFloat(request.priceDzd), "DZD")}
                            </span>
                        </div>
                        {request.reason && (
                            <div className="pt-1 border-t border-[#262626]">
                                <span className="text-slate-500 text-xs">Motif</span>
                                <p className="text-slate-300 text-xs mt-0.5">
                                    {request.reason}
                                </p>
                            </div>
                        )}
                    </div>

                    <label className="flex items-start gap-3 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={reusable}
                            onChange={(e) => setReusable(e.target.checked)}
                            className="mt-0.5 size-4 accent-sky-500 shrink-0"
                        />
                        <span>
                            <span className="text-sm font-bold text-white">
                                Code non utilisé / réutilisable (remettre en stock)
                            </span>
                            <span className="block text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                                Cochez seulement si le code n&apos;a pas été utilisé — il
                                sera remis en vente.
                            </span>
                        </span>
                    </label>

                    <div className="flex gap-3 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={loading}
                            className="flex-1 border border-[#262626] text-slate-300 rounded-xl py-2.5 text-sm font-bold transition-colors hover:bg-white/5 disabled:opacity-50"
                        >
                            Annuler
                        </button>
                        <button
                            type="button"
                            onClick={confirm}
                            disabled={loading}
                            className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-black transition-colors"
                        >
                            {loading ? "Traitement…" : "Confirmer le remboursement"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function RejectModal({
    request,
    onClose,
    onDone,
}: {
    request: RefundRequestRow;
    onClose: () => void;
    onDone: () => void;
}) {
    const [reason, setReason] = useState("");
    const [loading, setLoading] = useState(false);

    const confirm = async () => {
        setLoading(true);
        const res = await rejectActiveCodeRefundAction({
            requestId: request.id,
            reason: reason.trim() || undefined,
        });
        setLoading(false);
        if (res.success) {
            toast.success("Demande rejetée");
            onDone();
        } else {
            toast.error(res.error || "Échec du rejet");
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-[#161616] border border-[#262626] rounded-2xl w-full max-w-md overflow-hidden">
                <div className="px-5 py-4 border-b border-[#262626] flex items-center justify-between">
                    <div>
                        <h2 className="text-sm font-black text-white">
                            Rejeter la demande
                        </h2>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                            {request.orderNumber ?? `AC-${request.activeCodeOrderId}`}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-slate-500 hover:text-white text-xl leading-none"
                    >
                        ×
                    </button>
                </div>
                <div className="px-5 py-5 space-y-4">
                    <div>
                        <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">
                            Motif du rejet (optionnel)
                        </label>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            maxLength={500}
                            rows={3}
                            placeholder="Expliquez la raison du rejet…"
                            className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-red-500/50 resize-none"
                        />
                    </div>
                    <div className="flex gap-3 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={loading}
                            className="flex-1 border border-[#262626] text-slate-300 rounded-xl py-2.5 text-sm font-bold transition-colors hover:bg-white/5 disabled:opacity-50"
                        >
                            Annuler
                        </button>
                        <button
                            type="button"
                            onClick={confirm}
                            disabled={loading}
                            className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-black transition-colors"
                        >
                            {loading ? "Rejet…" : "Confirmer le rejet"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
