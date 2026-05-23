"use client";

import React, { useEffect, useState } from "react";
import { Card, CardBody, Chip, Spinner, Button } from "@heroui/react";
import { Eye, Copy, Zap, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { toast } from "react-hot-toast";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { getBsvOrdersAction, type BsvOrderRow } from "../bsv-actions";

const STATUS_META: Record<
    string,
    { label: string; color: "default" | "warning" | "success" | "danger"; icon: React.ReactNode }
> = {
    PENDING_LOADBRAIN: {
        label: "En cours",
        color: "warning",
        icon: <Clock size={12} />,
    },
    COMPLETED: {
        label: "Livré",
        color: "success",
        icon: <CheckCircle2 size={12} />,
    },
    FAILED: {
        label: "Échec",
        color: "danger",
        icon: <AlertTriangle size={12} />,
    },
    REFUNDED: {
        label: "Remboursé",
        color: "default",
        icon: <AlertTriangle size={12} />,
    },
};

export function BsvOrdersSection() {
    const [rows, setRows] = useState<BsvOrderRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [revealed, setRevealed] = useState<Set<number>>(new Set());

    useEffect(() => {
        let cancelled = false;
        getBsvOrdersAction({}).then((res) => {
            if (cancelled) return;
            if (res.success) {
                setRows(res.data);
            }
            setIsLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    if (isLoading) {
        return (
            <Card className="bg-[#0f0f0f] border border-[#262626]">
                <CardBody className="flex items-center justify-center py-8">
                    <Spinner color="warning" size="sm" />
                </CardBody>
            </Card>
        );
    }

    if (rows.length === 0) {
        return null;
    }

    const toggleReveal = (id: number) => {
        setRevealed((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const copy = (text: string) => {
        navigator.clipboard.writeText(text).then(() => toast.success("Copié"));
    };

    return (
        <section
            data-testid="bsv-orders-section"
            className="space-y-4 mt-8"
        >
            <div className="flex items-center gap-3">
                <Zap className="text-cyan-400" size={20} />
                <h2 className="text-lg font-black uppercase tracking-widest text-white">
                    Commandes BSV ({rows.length})
                </h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {rows.map((row) => {
                    const meta =
                        STATUS_META[row.status] ?? STATUS_META.PENDING_LOADBRAIN;
                    const snap = (row.wonSnapshot ?? null) as
                        | {
                              sellerSlug?: string;
                              exactPriceCents?: number;
                              bsvTxId?: string;
                          }
                        | null;
                    const isRevealed = revealed.has(row.id);

                    return (
                        <Card
                            key={row.id}
                            className="bg-[#0f0f0f] border border-[#262626]"
                        >
                            <CardBody className="p-5 space-y-3">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                                            {row.localOrderNumber ?? `Commande #${row.localOrderId}`}
                                        </p>
                                        <p className="text-sm font-bold text-white truncate">
                                            Listing {row.listingId} × {row.quantity}
                                        </p>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            {row.createdAt
                                                ? formatDate(row.createdAt as string | Date)
                                                : "—"}
                                        </p>
                                    </div>
                                    <Chip
                                        color={meta.color}
                                        size="sm"
                                        variant="flat"
                                        startContent={meta.icon}
                                        className="font-black text-[10px] uppercase"
                                    >
                                        {meta.label}
                                    </Chip>
                                </div>

                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-500 font-bold uppercase tracking-wider">
                                        Prix payé
                                    </span>
                                    <span className="text-[var(--primary)] font-black">
                                        {formatCurrency(row.pricePaidDzd, "DZD")}
                                    </span>
                                </div>

                                {snap && (
                                    <div className="text-[10px] text-slate-400 space-y-0.5 bg-[#161616] rounded-xl border border-[#262626] p-3">
                                        {snap.sellerSlug && (
                                            <p>
                                                <span className="text-slate-500">Vendeur:</span>{" "}
                                                <span className="text-white font-bold">
                                                    {snap.sellerSlug}
                                                </span>
                                            </p>
                                        )}
                                        {typeof snap.exactPriceCents === "number" && (
                                            <p>
                                                <span className="text-slate-500">Prix exact:</span>{" "}
                                                <span className="text-white font-bold">
                                                    ${(snap.exactPriceCents / 100).toFixed(2)} USD
                                                </span>
                                            </p>
                                        )}
                                        {snap.bsvTxId && (
                                            <p>
                                                <span className="text-slate-500">Tx BSV:</span>{" "}
                                                <span className="text-white font-mono">
                                                    {snap.bsvTxId}
                                                </span>
                                            </p>
                                        )}
                                    </div>
                                )}

                                {row.status === "COMPLETED" && row.codes.length > 0 && (
                                    <div className="space-y-2">
                                        <Button
                                            size="sm"
                                            variant="flat"
                                            onPress={() => toggleReveal(row.id)}
                                            startContent={<Eye size={14} />}
                                            className="bg-[#161616] text-slate-200 font-bold text-[10px] uppercase tracking-wider"
                                        >
                                            {isRevealed
                                                ? `Masquer ${row.codes.length} code(s)`
                                                : `Voir le(s) code(s) (${row.codes.length})`}
                                        </Button>
                                        {isRevealed && (
                                            <div className="space-y-2">
                                                {row.codes.map((c) => (
                                                    <div
                                                        key={c.id}
                                                        className="flex items-center gap-2 bg-[#161616] rounded-xl border border-[#262626] p-3"
                                                    >
                                                        <code className="flex-1 text-xs text-emerald-400 font-mono truncate">
                                                            {c.code ?? "(déchiffrement échoué)"}
                                                        </code>
                                                        {c.code && (
                                                            <button
                                                                onClick={() => copy(c.code!)}
                                                                className="p-1.5 text-slate-500 hover:text-white"
                                                                aria-label="Copier"
                                                            >
                                                                <Copy size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </CardBody>
                        </Card>
                    );
                })}
            </div>
        </section>
    );
}
