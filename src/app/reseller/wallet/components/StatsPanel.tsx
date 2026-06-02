"use client";

import React, { useEffect, useState } from "react";
import { Spinner } from "@heroui/react";
import { TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { getResellerTransactionsPagedAction } from "../actions";
import type { OverviewData, TxRow } from "./types";

export function StatsPanel({ data }: { data: OverviewData }) {
    const [bars, setBars] = useState<Array<{ label: string; volume: number; count: number }>>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const now = new Date();
        const fromDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        getResellerTransactionsPagedAction({
            limit: 100,
            type: "PURCHASE",
            dateFrom: fromDate.toISOString(),
        }).then((res) => {
            if (res.success) {
                const items = (res.data as { items: TxRow[] }).items;
                const byMonth = new Map<string, { volume: number; count: number; label: string }>();
                for (let i = 3; i >= 0; i--) {
                    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    const key = `${d.getFullYear()}-${d.getMonth()}`;
                    byMonth.set(key, {
                        volume: 0,
                        count: 0,
                        label: d.toLocaleDateString("fr-FR", { month: "short" }),
                    });
                }
                for (const tx of items) {
                    if (!tx.createdAt) continue;
                    const d = new Date(tx.createdAt);
                    const key = `${d.getFullYear()}-${d.getMonth()}`;
                    const slot = byMonth.get(key);
                    if (!slot) continue;
                    slot.volume += parseFloat(tx.amount);
                    slot.count += 1;
                }
                setBars(Array.from(byMonth.values()));
            }
            setLoading(false);
        });
    }, []);

    const tier = data.tier;
    const nextTier = data.nextTier;
    const nextThreshold = nextTier ? parseFloat(nextTier.minMonthlyVolumeDzd) : 0;
    const progress =
        nextThreshold > 0
            ? Math.min(100, (data.monthlyVolume / nextThreshold) * 100)
            : 100;
    const maxBar = Math.max(1, ...bars.map((b) => b.volume));

    return (
        <div className="space-y-6" data-testid="wallet-stats-panel">
            <div className="bg-[#161616] border border-[#262626] rounded-[28px] p-6 space-y-4">
                <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                    <TrendingUp size={16} className="text-[var(--primary)]" />
                    Mon palier
                </h3>
                {tier ? (
                    <>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
                                    Niveau actuel
                                </p>
                                <p
                                    className="text-2xl font-black"
                                    style={{ color: tier.color ?? "#fff" }}
                                >
                                    {tier.name}
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
                                    Remise
                                </p>
                                <p className="text-2xl font-black text-emerald-400">
                                    -{parseFloat(tier.discountPct).toFixed(0)}%
                                </p>
                            </div>
                        </div>

                        {nextTier && (
                            <div className="pt-4 border-t border-white/5 space-y-3">
                                <div className="flex justify-between text-[10px] uppercase font-black text-slate-600">
                                    <span>Vers {nextTier.name}</span>
                                    <span>{progress.toFixed(0)}%</span>
                                </div>
                                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                                    <div
                                        className="h-full transition-all"
                                        style={{
                                            width: `${progress}%`,
                                            backgroundColor: nextTier.color ?? "#fff",
                                        }}
                                    />
                                </div>
                                <p className="text-xs text-slate-400">
                                    {formatCurrency(data.monthlyVolume, "DZD")} /{" "}
                                    {formatCurrency(nextThreshold, "DZD")} ce mois — passez à{" "}
                                    <span
                                        className="font-bold"
                                        style={{ color: nextTier.color ?? "#fff" }}
                                    >
                                        {nextTier.name}
                                    </span>{" "}
                                    pour -{parseFloat(nextTier.discountPct).toFixed(0)}%
                                </p>
                            </div>
                        )}
                        {!nextTier && (
                            <p className="text-xs text-emerald-400 font-bold pt-2 border-t border-white/5">
                                Palier maximum atteint
                            </p>
                        )}
                    </>
                ) : (
                    <p className="text-sm text-slate-500 italic">Aucun palier assigné</p>
                )}
            </div>

            <div className="bg-[#161616] border border-[#262626] rounded-[28px] p-6 space-y-4">
                <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                    <TrendingUp size={16} className="text-[var(--primary)]" />
                    Volume 4 derniers mois
                </h3>
                {loading ? (
                    <div className="py-10 flex justify-center"><Spinner color="warning" /></div>
                ) : (
                    <div className="grid grid-cols-4 gap-4 pt-2">
                        {bars.map((b, i) => (
                            <div key={i} className="flex flex-col items-center gap-2">
                                <div className="w-full h-32 bg-black/40 rounded-xl flex items-end overflow-hidden">
                                    <div
                                        className="w-full bg-gradient-to-t from-[var(--primary)] to-orange-400"
                                        style={{
                                            height: `${Math.max(2, (b.volume / maxBar) * 100)}%`,
                                        }}
                                        title={`${formatCurrency(b.volume, "DZD")} · ${b.count} cmd`}
                                    />
                                </div>
                                <p className="text-[10px] uppercase font-black text-slate-500 tracking-widest">
                                    {b.label}
                                </p>
                                <p className="text-[10px] font-bold text-slate-300">
                                    {formatCurrency(b.volume, "DZD")}
                                </p>
                                <p className="text-[9px] text-slate-600 font-bold">
                                    {b.count} cmd
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
