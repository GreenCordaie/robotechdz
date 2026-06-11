"use client";

import React from "react";
import { Card } from "@heroui/react";
import {
    AlertTriangle,
    Building2,
    ShieldCheck,
    TrendingUp,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { OverviewData } from "./types";

export function HeroCard({ data }: { data: OverviewData }) {
    const wallet = data.wallet;
    const tier = data.tier;
    const tierColor = tier?.color || "#94a3b8";
    const tierDiscountPct = tier ? parseFloat(tier.discountPct) : 0;

    return (
        <Card className="bg-gradient-to-br from-[#161616] to-[#0a0a0a] border border-[#262626] rounded-[32px] overflow-hidden p-8 relative">
            <div className="absolute -top-20 -right-20 size-60 bg-[var(--primary)]/10 blur-[80px] rounded-full" />
            <div className="relative z-10 space-y-8">
                <div className="flex items-center justify-between">
                    <Building2 className="text-slate-700" size={32} />
                    <ShieldCheck className="text-emerald-500" size={24} />
                </div>

                <div className="space-y-2">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        Solde Disponible
                    </p>
                    <h2 className="text-4xl font-black text-white" data-testid="wallet-balance">
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

                {wallet?.updatedAt && (
                    <p className="text-xs text-slate-500 font-bold italic">
                        Dernière mise à jour {formatDate(new Date(wallet.updatedAt))}
                    </p>
                )}
            </div>
        </Card>
    );
}

export function MiniStatsCard({ data }: { data: OverviewData }) {
    const totalSpent = data.wallet ? parseFloat(data.wallet.totalSpent ?? "0") : 0;
    const lowThr = data.lowBalanceThreshold;
    const balanceNow = data.wallet ? parseFloat(data.wallet.balance) : 0;
    const lowAlert = lowThr !== null && lowThr > 0 && balanceNow < lowThr;

    return (
        <div className="bg-[#1a1614] border border-[#2d2622] rounded-[32px] p-8 space-y-5">
            <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-3">
                <TrendingUp size={18} className="text-[var(--primary)]" />
                Aperçu
            </h3>
            <Row label="Volume du mois" value={formatCurrency(data.monthlyVolume, "DZD")} />
            <Row label="Cumul dépensé" value={formatCurrency(totalSpent, "DZD")} mute />
            <Row
                label="Commandes du mois"
                value={`${data.monthlyPurchaseCount}`}
                accent="emerald"
            />
            {data.monthlyRefundCount > 0 && (
                <Row
                    label="Remboursements (mois)"
                    value={`${data.monthlyRefundCount}`}
                    accent="blue"
                />
            )}
            {data.lastRechargeAt && data.lastRechargeAmount !== null && (
                <Row
                    label="Dernière recharge"
                    value={`${formatCurrency(data.lastRechargeAmount, "DZD")} · ${formatDate(
                        new Date(data.lastRechargeAt),
                    )}`}
                />
            )}
            {lowAlert && lowThr !== null && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 flex items-center gap-2 text-xs font-bold text-amber-400">
                    <AlertTriangle size={14} />
                    Solde sous le seuil {formatCurrency(lowThr, "DZD")}
                </div>
            )}
        </div>
    );
}

function Row({
    label,
    value,
    accent,
    mute,
}: {
    label: string;
    value: string;
    accent?: "emerald" | "blue";
    mute?: boolean;
}) {
    const accentClass =
        accent === "emerald"
            ? "text-emerald-500"
            : accent === "blue"
                ? "text-sky-400"
                : mute
                    ? "text-slate-400"
                    : "text-white";
    return (
        <div className="flex justify-between items-center text-sm font-bold">
            <span className="text-slate-500">{label}</span>
            <span className={accentClass}>{value}</span>
        </div>
    );
}
