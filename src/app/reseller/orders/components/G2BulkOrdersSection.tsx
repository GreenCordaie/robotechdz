"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardBody, Chip, Spinner, Button } from "@heroui/react";
import { Eye, Copy, ShoppingBag, CheckCircle2, AlertTriangle, Clock, RefreshCw } from "lucide-react";
import { toast } from "react-hot-toast";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { getG2BulkOrdersAction, type G2BulkOrderRow } from "../g2bulk-actions";

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

export function G2BulkOrdersSection() {
    const [rows, setRows] = useState<G2BulkOrderRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [revealed, setRevealed] = useState<Set<number>>(new Set());
    const [limit, setLimit] = useState(50);
    const loadSeq = useRef(0);

    const load = useCallback(() => {
        setIsLoading(true);
        const seq = ++loadSeq.current;
        getG2BulkOrdersAction({ limit }).then((res) => {
            if (seq !== loadSeq.current) return; // ignore stale response (double refresh / fast limit change)
            if (res.success) {
                setRows(res.data);
                setHasMore(res.hasMore ?? false);
            }
            setHasLoaded(true);
            setIsLoading(false);
        });
    }, [limit]);

    useEffect(() => {
        load();
    }, [load]);

    // Full-card spinner only on the very first load; refreshes keep the list
    // visible (the Rafraîchir button shows its own disabled state instead).
    if (!hasLoaded) {
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
            data-testid="g2bulk-orders-section"
            className="space-y-4 mt-8"
        >
            <div className="flex items-center gap-3">
                <ShoppingBag className="text-cyan-400" size={20} />
                <h2 className="text-lg font-black uppercase tracking-widest text-white">
                    Commandes G2Bulk ({rows.length})
                </h2>
                <span className="text-[9px] uppercase font-black tracking-widest text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 px-1.5 py-0.5 rounded">
                    G2Bulk
                </span>
                <Button
                    size="sm"
                    variant="flat"
                    onPress={load}
                    isDisabled={isLoading}
                    startContent={<RefreshCw size={14} />}
                    className="ml-auto bg-[#161616] text-slate-200 font-bold text-[10px] uppercase tracking-wider"
                >
                    Rafraîchir
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {rows.map((row) => {
                    const meta =
                        STATUS_META[row.status] ?? STATUS_META.PENDING_LOADBRAIN;
                    const snap = (row.wonSnapshot ?? null) as
                        | {
                              providerOrderId?: string;
                              exactPriceCents?: number;
                              provider?: string;
                              title?: string;
                              gameCode?: string;
                              playerName?: string;
                          }
                        | null;
                    const isRevealed = revealed.has(row.id);
                    // Prefer the human-readable upstream title captured at
                    // delivery time over the raw G2Bulk product id (which is
                    // either a numeric SKU or a `game:NNNN` reference).
                    const productLabel = snap?.title
                        ? snap.title
                        : `Produit ${row.productId}`;

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
                                            {productLabel} × {row.quantity}
                                        </p>
                                        {snap?.playerName && (
                                            <p className="text-[11px] text-slate-500 truncate">
                                                Joueur : {snap.playerName}
                                            </p>
                                        )}
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
                                        {snap.provider && (
                                            <p>
                                                <span className="text-slate-500">Fournisseur:</span>{" "}
                                                <span className="text-white font-bold">
                                                    {snap.provider}
                                                </span>
                                            </p>
                                        )}
                                        {snap.providerOrderId && (
                                            <p>
                                                <span className="text-slate-500">ID fournisseur:</span>{" "}
                                                <span className="text-white font-mono">
                                                    {snap.providerOrderId}
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
                                    </div>
                                )}

                                {(row.status === "REFUNDED" || row.status === "FAILED") && (
                                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs space-y-1">
                                        <p className="font-black uppercase tracking-wider text-red-300">
                                            Remboursé sur votre wallet
                                            {row.refundAmount
                                                ? ` · ${formatCurrency(parseFloat(row.refundAmount), "DZD")}`
                                                : ""}
                                        </p>
                                        {row.refundReason && (
                                            <p className="text-red-200/80 italic">{row.refundReason}</p>
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

            {hasMore && (
                <div className="flex justify-center pt-2">
                    <Button
                        size="sm"
                        variant="flat"
                        onPress={() => setLimit((l) => l + 50)}
                        isDisabled={isLoading}
                        className="bg-[#161616] text-slate-200 font-bold text-[10px] uppercase tracking-wider"
                    >
                        Charger plus
                    </Button>
                </div>
            )}
        </section>
    );
}
