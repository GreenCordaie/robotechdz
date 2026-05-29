"use client";

import React, { useState, useTransition } from "react";
import { Card, CardBody, Button, Chip } from "@heroui/react";
import { RefreshCw, AlertCircle, CheckCircle2, Plus, Zap } from "lucide-react";
import toast from "react-hot-toast";
import { refreshSupplierBalanceAction } from "./actions";

interface ExternalSupplier {
    id: number;
    name: string;
    balance: string;
    currency: string;
    providerKind: string | null;
    alertThreshold: string | null;
    lastBalanceAt: Date | string | null;
    externalConfig: { apiKeyEnv?: string; endpoint?: string; module?: string } | null;
}

function fmtBalance(balance: string, currency: string): string {
    const n = Number(balance);
    if (currency === "USD") return `$${n.toFixed(2)}`;
    if (currency === "EUR") return `€${n.toFixed(2)}`;
    if (currency === "DZD") return `${n.toLocaleString("fr-FR")} DZD`;
    return `${n.toFixed(2)} ${currency}`;
}

function timeAgo(d: Date | string | null): string {
    if (!d) return "jamais";
    const t = typeof d === "string" ? new Date(d) : d;
    const diffSec = Math.floor((Date.now() - t.getTime()) / 1000);
    if (diffSec < 60) return `il y a ${diffSec}s`;
    if (diffSec < 3600) return `il y a ${Math.floor(diffSec / 60)} min`;
    if (diffSec < 86400) return `il y a ${Math.floor(diffSec / 3600)} h`;
    return `il y a ${Math.floor(diffSec / 86400)} j`;
}

function alertLevel(balance: string, threshold: string | null): "ok" | "warning" | "danger" {
    if (!threshold) return "ok";
    const b = Number(balance);
    const t = Number(threshold);
    if (b <= 0) return "danger";
    if (b < t) return "warning";
    return "ok";
}

export default function ExternalSuppliersSection({
    suppliers,
}: {
    suppliers: ExternalSupplier[];
}) {
    const [refreshing, setRefreshing] = useState<Set<number>>(new Set());
    const [, startTransition] = useTransition();

    if (suppliers.length === 0) {
        return (
            <section className="mb-10">
                <SectionHeader />
                <Card className="bg-[#161616] border border-dashed border-[#262626]">
                    <CardBody className="p-8 text-center">
                        <Zap className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                        <div className="text-slate-400 text-sm">
                            Aucun service externe configuré.
                        </div>
                        <div className="text-slate-500 text-xs mt-1">
                            Ajoute CapSolver, 2Captcha, Mudfish, ou un module LoadBrain depuis la DB ou via l&apos;API.
                        </div>
                    </CardBody>
                </Card>
            </section>
        );
    }

    const handleRefresh = (id: number) => {
        setRefreshing((s) => new Set(s).add(id));
        startTransition(async () => {
            const res = await refreshSupplierBalanceAction({ supplierId: id });
            if (res.success) {
                toast.success(`Balance refresh ✓ ${fmtBalance(String(res.balance), res.currency ?? "USD")}`);
            } else {
                toast.error(`Refresh failed: ${res.error}`);
            }
            setRefreshing((s) => {
                const n = new Set(s);
                n.delete(id);
                return n;
            });
        });
    };

    return (
        <section className="mb-10">
            <SectionHeader />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {suppliers.map((s) => {
                    const level = alertLevel(s.balance, s.alertThreshold);
                    const isRefreshing = refreshing.has(s.id);
                    return (
                        <Card
                            key={s.id}
                            className={`bg-[#161616] border ${
                                level === "danger"
                                    ? "border-red-500/30"
                                    : level === "warning"
                                    ? "border-amber-500/30"
                                    : "border-[#262626]"
                            } overflow-hidden`}
                        >
                            <CardBody className="p-5">
                                <div className="flex items-start justify-between mb-3">
                                    <div>
                                        <div className="text-white font-bold text-base">{s.name}</div>
                                        <Chip
                                            size="sm"
                                            variant="flat"
                                            className="bg-white/5 text-slate-400 text-[10px] mt-1 h-5"
                                        >
                                            {s.providerKind ?? "—"}
                                        </Chip>
                                    </div>
                                    {level === "danger" && (
                                        <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                                    )}
                                    {level === "warning" && (
                                        <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                                    )}
                                    {level === "ok" && (
                                        <CheckCircle2 className="w-5 h-5 text-emerald-500/70 shrink-0" />
                                    )}
                                </div>

                                <div className="text-2xl font-black text-white mb-1">
                                    {fmtBalance(s.balance, s.currency)}
                                </div>
                                {s.alertThreshold && (
                                    <div className="text-[10px] text-slate-500 mb-3">
                                        seuil alerte: {fmtBalance(s.alertThreshold, s.currency)}
                                    </div>
                                )}

                                <div className="flex items-center justify-between gap-2 mt-3">
                                    <span className="text-[10px] text-slate-500">
                                        Maj {timeAgo(s.lastBalanceAt)}
                                    </span>
                                    <Button
                                        size="sm"
                                        variant="flat"
                                        className="bg-white/5 text-white text-[11px] min-w-0 h-7 px-3"
                                        onClick={() => handleRefresh(s.id)}
                                        isDisabled={isRefreshing}
                                        startContent={
                                            <RefreshCw
                                                className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`}
                                            />
                                        }
                                    >
                                        {isRefreshing ? "..." : "Refresh"}
                                    </Button>
                                </div>
                            </CardBody>
                        </Card>
                    );
                })}
            </div>
        </section>
    );
}

function SectionHeader() {
    return (
        <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500" />
                <h2 className="text-lg font-black uppercase tracking-wider text-white">
                    Services externes
                </h2>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                    soldes API
                </span>
            </div>
        </div>
    );
}
