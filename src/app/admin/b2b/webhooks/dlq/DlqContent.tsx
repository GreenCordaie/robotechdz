"use client";

import React, { useEffect, useState } from "react";
import { Spinner, Button, Chip } from "@heroui/react";
import { Inbox, RefreshCw, Trash2, AlertTriangle, Clock, CheckCircle } from "lucide-react";
import { toast } from "react-hot-toast";
import {
    listDlqAttemptsAction,
    replayDlqAttemptAction,
    dismissDlqAttemptAction,
    getDlqStatsAction,
} from "./actions";
import { formatDate } from "@/lib/formatters";

type DlqStatus = "ALL" | "RETRYING" | "DEAD" | "RESOLVED";

interface DlqRow {
    id: number;
    webhookId: number;
    event: string;
    attempts: number;
    nextAttemptAt: Date | string | null;
    status: string;
    lastError: string | null;
    lastStatusCode: number | null;
    createdAt: Date | string;
    updatedAt: Date | string;
    webhookUrl: string;
    resellerId: number;
    resellerCompanyName: string;
}

interface Stats {
    retrying: number;
    dead: number;
    resolved: number;
}

export default function DlqContent() {
    const [rows, setRows] = useState<DlqRow[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<DlqStatus>("DEAD");

    const load = async () => {
        setLoading(true);
        const [listRes, statsRes] = await Promise.all([
            listDlqAttemptsAction({ status: filter }),
            getDlqStatsAction({}),
        ]);
        if (listRes.success) setRows(listRes.data as DlqRow[]);
        if (statsRes.success) setStats(statsRes.data as Stats);
        setLoading(false);
    };

    useEffect(() => {
        load();
    }, [filter]);

    const handleReplay = async (id: number) => {
        if (!confirm("Replayer cette livraison ? Elle sera retentée immédiatement.")) return;
        const res = await replayDlqAttemptAction({ id });
        if (res.success) {
            toast.success("Replay programmé");
            await load();
        } else {
            toast.error(res.error || "Échec");
        }
    };

    const handleDismiss = async (id: number) => {
        if (!confirm("Supprimer définitivement cette livraison DEAD ?")) return;
        const res = await dismissDlqAttemptAction({ id });
        if (res.success) {
            toast.success("Supprimée");
            await load();
        } else {
            toast.error(res.error || "Échec");
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <Inbox className="w-8 h-8 text-orange-500" />
                    <div>
                        <h1 className="text-2xl font-bold">Webhooks DLQ</h1>
                        <p className="text-sm text-gray-500">
                            Tentatives de livraison ratées (retry exp backoff 1m → 6h, max 5).
                        </p>
                    </div>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border">
                    <div className="flex items-center gap-2 text-gray-500 text-sm">
                        <Clock className="w-4 h-4" />
                        <span>Retrying</span>
                    </div>
                    <div className="text-3xl font-bold mt-1">{stats?.retrying ?? "—"}</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border">
                    <div className="flex items-center gap-2 text-red-500 text-sm">
                        <AlertTriangle className="w-4 h-4" />
                        <span>Dead</span>
                    </div>
                    <div className="text-3xl font-bold mt-1 text-red-500">{stats?.dead ?? "—"}</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border">
                    <div className="flex items-center gap-2 text-green-600 text-sm">
                        <CheckCircle className="w-4 h-4" />
                        <span>Resolved</span>
                    </div>
                    <div className="text-3xl font-bold mt-1 text-green-600">{stats?.resolved ?? "—"}</div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-2 mb-4">
                {(["DEAD", "RETRYING", "RESOLVED", "ALL"] as DlqStatus[]).map((f) => (
                    <Button
                        key={f}
                        size="sm"
                        variant={filter === f ? "solid" : "bordered"}
                        color={filter === f ? "primary" : "default"}
                        onPress={() => setFilter(f)}
                    >
                        {f === "ALL" ? "Tous" : f.charAt(0) + f.slice(1).toLowerCase()}
                    </Button>
                ))}
            </div>

            {loading ? (
                <div className="flex justify-center py-12">
                    <Spinner />
                </div>
            ) : rows.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                    Aucune tentative dans cet état.
                </div>
            ) : (
                <div className="space-y-2">
                    {rows.map((r) => (
                        <div
                            key={r.id}
                            data-testid="dlq-row"
                            className="bg-white dark:bg-gray-800 rounded-lg p-4 border flex items-start justify-between gap-4"
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <Chip
                                        size="sm"
                                        color={
                                            r.status === "DEAD"
                                                ? "danger"
                                                : r.status === "RESOLVED"
                                                    ? "success"
                                                    : "warning"
                                        }
                                    >
                                        {r.status}
                                    </Chip>
                                    <Chip size="sm" variant="bordered">
                                        {r.event}
                                    </Chip>
                                    <span className="text-sm font-medium">
                                        {r.resellerCompanyName}
                                    </span>
                                    <span className="text-xs text-gray-400">
                                        #{r.id} · {r.attempts}/5 tentatives
                                    </span>
                                </div>
                                <div className="text-xs text-gray-500 truncate">
                                    {r.webhookUrl}
                                </div>
                                {r.lastError && (
                                    <div className="text-xs text-red-500 mt-1">
                                        {r.lastStatusCode ? `[${r.lastStatusCode}] ` : ""}
                                        {r.lastError}
                                    </div>
                                )}
                                <div className="text-xs text-gray-400 mt-1">
                                    Créée {formatDate(r.createdAt)}
                                    {r.nextAttemptAt && r.status === "RETRYING"
                                        ? ` · prochain essai ${formatDate(r.nextAttemptAt)}`
                                        : ""}
                                </div>
                            </div>
                            {r.status === "DEAD" && (
                                <div className="flex gap-2 shrink-0">
                                    <Button
                                        size="sm"
                                        color="primary"
                                        variant="flat"
                                        startContent={<RefreshCw className="w-4 h-4" />}
                                        onPress={() => handleReplay(r.id)}
                                        data-testid={`dlq-replay-${r.id}`}
                                    >
                                        Replay
                                    </Button>
                                    <Button
                                        size="sm"
                                        color="danger"
                                        variant="flat"
                                        startContent={<Trash2 className="w-4 h-4" />}
                                        onPress={() => handleDismiss(r.id)}
                                        data-testid={`dlq-dismiss-${r.id}`}
                                    >
                                        Supprimer
                                    </Button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
