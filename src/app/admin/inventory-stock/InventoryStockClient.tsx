"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes, RefreshCw, RotateCcw } from "lucide-react";
import { formatDate } from "@/lib/formatters";
import type {
    InventoryStockData,
    InventoryStockSummaryRow,
    InventoryStockUnitRow,
} from "./actions";

/** Source → human label + badge palette. */
function sourceLabel(source: string): string {
    switch (source) {
        case "refund":
            return "Remboursé";
        case "prebuy":
            return "Pré-acheté";
        case "import":
            return "Importé";
        case "surplus":
            return "Surplus";
        default:
            return source || "—";
    }
}

function sourceBadgeStyle(source: string): string {
    switch (source) {
        case "refund":
            return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
        case "prebuy":
            return "bg-sky-500/10 text-sky-400 border border-sky-500/20";
        case "import":
            return "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20";
        case "surplus":
            return "bg-amber-500/10 text-amber-400 border border-amber-500/20";
        default:
            return "bg-slate-500/10 text-slate-400 border border-slate-500/20";
    }
}

/** A grouped product summary, aggregated from the summary rows. */
interface ProductGroup {
    key: string;
    provider: string;
    productRef: string;
    label: string;
    totalAvailable: number;
    refundCount: number;
    bySource: Record<string, number>;
}

function groupSummary(summary: InventoryStockSummaryRow[]): ProductGroup[] {
    const map = new Map<string, ProductGroup>();
    for (const row of summary) {
        // Only count available stock toward the headline totals.
        if (row.status !== "available") continue;
        const label = row.label ?? row.product_ref;
        const key = `${row.provider}::${row.product_ref}::${label}`;
        const existing =
            map.get(key) ??
            {
                key,
                provider: row.provider,
                productRef: row.product_ref,
                label,
                totalAvailable: 0,
                refundCount: 0,
                bySource: {},
            };
        existing.totalAvailable += row.n;
        existing.bySource[row.source] = (existing.bySource[row.source] ?? 0) + row.n;
        if (row.source === "refund") existing.refundCount += row.n;
        map.set(key, existing);
    }
    return Array.from(map.values()).sort((a, b) => {
        // Products with refunded stock float to the top, then by total desc.
        if (b.refundCount !== a.refundCount) return b.refundCount - a.refundCount;
        return b.totalAvailable - a.totalAvailable;
    });
}

export default function InventoryStockClient({
    data,
    error,
}: {
    data: InventoryStockData;
    error: string | null;
}) {
    const router = useRouter();
    const [search, setSearch] = useState("");

    const groups = useMemo(() => groupSummary(data.summary), [data.summary]);

    const totalRefund = useMemo(
        () => groups.reduce((acc, g) => acc + g.refundCount, 0),
        [groups],
    );
    const totalAvailable = useMemo(
        () => groups.reduce((acc, g) => acc + g.totalAvailable, 0),
        [groups],
    );

    const units = useMemo(() => {
        const q = search.trim().toLowerCase();
        const filtered = q
            ? data.units.filter((u) =>
                  (u.label ?? u.productRef).toLowerCase().includes(q),
              )
            : data.units;
        // Refunded units first, then newest created.
        return [...filtered].sort((a, b) => {
            const aRef = a.source === "refund" ? 0 : 1;
            const bRef = b.source === "refund" ? 0 : 1;
            if (aRef !== bRef) return aRef - bRef;
            const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return bt - at;
        });
    }, [data.units, search]);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                    <div className="size-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                        <Boxes className="size-5" />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-white">Stock de codes</h1>
                        <p className="text-xs text-slate-500 font-medium">
                            Inventaire LoadBrain — codes disponibles (les remboursés sont du
                            stock récupéré)
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => router.refresh()}
                    className="inline-flex items-center gap-2 border border-[#262626] text-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors hover:bg-white/5"
                >
                    <RefreshCw className="size-4" />
                    Rafraîchir
                </button>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-4 py-3 text-sm font-medium">
                    Impossible de charger le stock : {error}
                </div>
            )}

            {data.disabled && (
                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-xl px-4 py-3 text-sm font-medium">
                    L&apos;inventaire est désactivé (INVENTORY_ENABLED=off). Aucun stock
                    livré pour le moment.
                </div>
            )}

            {/* ─── Headline stats ─────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <StatCard
                    label="Codes disponibles"
                    value={totalAvailable}
                    tone="default"
                />
                <StatCard
                    label="Codes remboursés (récupérés)"
                    value={totalRefund}
                    tone="refund"
                    icon={<RotateCcw className="size-4" />}
                />
                <StatCard
                    label="Produits en stock"
                    value={groups.length}
                    tone="default"
                />
            </div>

            {/* ─── Summary per product ────────────────────────────────── */}
            <div className="bg-[#161616] border border-[#262626] rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-[#262626]">
                    <h2 className="text-sm font-black text-white">Stock par produit</h2>
                </div>
                {groups.length === 0 ? (
                    <div className="py-14 text-center opacity-30 italic font-bold">
                        Aucun stock disponible
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-[#262626] text-[10px] uppercase tracking-widest text-slate-500">
                                    <th className="text-left font-bold px-4 py-3">Produit</th>
                                    <th className="text-left font-bold px-4 py-3">Provider</th>
                                    <th className="text-right font-bold px-4 py-3">Disponible</th>
                                    <th className="text-right font-bold px-4 py-3">Remboursés</th>
                                    <th className="text-left font-bold px-4 py-3">Sources</th>
                                </tr>
                            </thead>
                            <tbody>
                                {groups.map((g) => (
                                    <tr
                                        key={g.key}
                                        className="border-b border-[#262626] last:border-0 hover:bg-white/[0.02]"
                                    >
                                        <td className="px-4 py-3 font-bold text-white">
                                            {g.label}
                                        </td>
                                        <td className="px-4 py-3 text-slate-400">
                                            {g.provider}
                                        </td>
                                        <td className="px-4 py-3 text-right font-black text-white whitespace-nowrap">
                                            {g.totalAvailable}
                                        </td>
                                        <td className="px-4 py-3 text-right whitespace-nowrap">
                                            {g.refundCount > 0 ? (
                                                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                    {g.refundCount}
                                                </span>
                                            ) : (
                                                <span className="text-slate-600">0</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-wrap gap-1.5">
                                                {Object.entries(g.bySource).map(
                                                    ([src, n]) => (
                                                        <span
                                                            key={src}
                                                            className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${sourceBadgeStyle(src)}`}
                                                        >
                                                            {sourceLabel(src)} · {n}
                                                        </span>
                                                    ),
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ─── Units table ────────────────────────────────────────── */}
            <div className="bg-[#161616] border border-[#262626] rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-[#262626] flex items-center justify-between gap-3 flex-wrap">
                    <h2 className="text-sm font-black text-white">
                        Codes en stock ({units.length})
                    </h2>
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Filtrer par produit…"
                        className="bg-[#0a0a0a] border border-[#262626] rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 w-56 max-w-full"
                    />
                </div>
                {units.length === 0 ? (
                    <div className="py-14 text-center opacity-30 italic font-bold">
                        Aucun code en stock
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-[#262626] text-[10px] uppercase tracking-widest text-slate-500">
                                    <th className="text-left font-bold px-4 py-3">Produit</th>
                                    <th className="text-left font-bold px-4 py-3">Provider</th>
                                    <th className="text-left font-bold px-4 py-3">Source</th>
                                    <th className="text-left font-bold px-4 py-3">Code</th>
                                    <th className="text-left font-bold px-4 py-3">Type</th>
                                    <th className="text-left font-bold px-4 py-3">Créé le</th>
                                    <th className="text-left font-bold px-4 py-3">Expire le</th>
                                </tr>
                            </thead>
                            <tbody>
                                {units.map((u: InventoryStockUnitRow) => (
                                    <tr
                                        key={u.id}
                                        className={`border-b border-[#262626] last:border-0 hover:bg-white/[0.02] ${u.source === "refund" ? "bg-emerald-500/[0.04]" : ""}`}
                                    >
                                        <td className="px-4 py-3 font-bold text-white">
                                            {u.label ?? u.productRef}
                                        </td>
                                        <td className="px-4 py-3 text-slate-400">
                                            {u.provider}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${sourceBadgeStyle(u.source)}`}
                                            >
                                                {sourceLabel(u.source)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs text-slate-200 whitespace-nowrap">
                                            {u.code ?? "—"}
                                        </td>
                                        <td className="px-4 py-3 text-slate-500 text-xs">
                                            {u.deliverableType}
                                        </td>
                                        <td className="px-4 py-3 text-[11px] text-slate-500 whitespace-nowrap">
                                            {u.createdAt
                                                ? formatDate(new Date(u.createdAt))
                                                : "—"}
                                        </td>
                                        <td className="px-4 py-3 text-[11px] text-slate-500 whitespace-nowrap">
                                            {u.expiresAt
                                                ? formatDate(new Date(u.expiresAt))
                                                : "—"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

function StatCard({
    label,
    value,
    tone,
    icon,
}: {
    label: string;
    value: number;
    tone: "default" | "refund";
    icon?: React.ReactNode;
}) {
    const accent =
        tone === "refund"
            ? "border-emerald-500/30 bg-emerald-500/[0.06]"
            : "border-[#262626] bg-[#161616]";
    const valueColor = tone === "refund" ? "text-emerald-400" : "text-white";
    return (
        <div className={`rounded-2xl border p-4 ${accent}`}>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                {icon}
                {label}
            </div>
            <div className={`text-3xl font-black mt-1.5 ${valueColor}`}>{value}</div>
        </div>
    );
}
