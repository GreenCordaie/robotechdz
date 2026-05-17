"use client";

import React, { useEffect, useState } from "react";
import { Spinner, Button, Chip, Select, SelectItem } from "@heroui/react";
import { Inbox, CheckCircle, XCircle, BarChart3 } from "lucide-react";
import {
    listNotificationLogsAction,
    getNotificationLogsStatsAction,
} from "./actions";
import { RESELLER_NOTIF_EVENTS } from "@/lib/notification-events";
import { formatDate } from "@/lib/formatters";

interface LogRow {
    id: number;
    eventKey: string;
    channel: string;
    resellerId: number | null;
    contactPhone: string | null;
    delivered: boolean;
    reason: string | null;
    createdAt: Date | string;
    resellerCompanyName: string | null;
}

interface Stats {
    total: number;
    delivered: number;
    failed: number;
    successRate: number;
    sinceDays: number;
}

type StatusFilter = "ALL" | "DELIVERED" | "FAILED";

const EVENT_OPTIONS = Object.values(RESELLER_NOTIF_EVENTS);

export default function LogsContent() {
    const [rows, setRows] = useState<LogRow[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [eventFilter, setEventFilter] = useState<string>("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
    const [sinceDays, setSinceDays] = useState(7);

    const load = async () => {
        setLoading(true);
        const [listRes, statsRes] = await Promise.all([
            listNotificationLogsAction({
                eventKey: eventFilter || undefined,
                status: statusFilter,
                sinceDays,
            }),
            getNotificationLogsStatsAction({ sinceDays }),
        ]);
        if (listRes.success) setRows(listRes.data as LogRow[]);
        if (statsRes.success) setStats(statsRes.data as Stats);
        setLoading(false);
    };

    useEffect(() => {
        load();
    }, [eventFilter, statusFilter, sinceDays]);

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex items-center gap-3 mb-2">
                <Inbox className="w-7 h-7 text-[var(--primary)]" />
                <h1 className="text-2xl font-bold">Notification Logs</h1>
            </div>
            <p className="text-sm text-gray-500 mb-6">
                Audit des envois WhatsApp aux resellers. Tous les <code className="bg-[#161616] px-1 rounded">safeSend</code> sont logués
                (success, fail, skip via opt-out).
            </p>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-[#161616] border border-[#262626] rounded-2xl p-4">
                    <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wider">
                        <BarChart3 className="w-4 h-4" /> Total {stats ? `(${stats.sinceDays}j)` : ""}
                    </div>
                    <div className="text-3xl font-black text-white mt-1">{stats?.total ?? "—"}</div>
                </div>
                <div className="bg-[#161616] border border-[#262626] rounded-2xl p-4">
                    <div className="flex items-center gap-2 text-emerald-500 text-xs uppercase tracking-wider">
                        <CheckCircle className="w-4 h-4" /> Délivrés
                    </div>
                    <div className="text-3xl font-black text-emerald-500 mt-1">{stats?.delivered ?? "—"}</div>
                </div>
                <div className="bg-[#161616] border border-[#262626] rounded-2xl p-4">
                    <div className="flex items-center gap-2 text-red-500 text-xs uppercase tracking-wider">
                        <XCircle className="w-4 h-4" /> Échecs / skip
                    </div>
                    <div className="text-3xl font-black text-red-500 mt-1">{stats?.failed ?? "—"}</div>
                </div>
                <div className="bg-[#161616] border border-[#262626] rounded-2xl p-4">
                    <div className="text-slate-400 text-xs uppercase tracking-wider">Taux de succès</div>
                    <div className="text-3xl font-black text-white mt-1">{stats?.successRate ?? "—"}%</div>
                </div>
            </div>

            <div className="flex gap-3 mb-4 flex-wrap items-center">
                <Select
                    size="sm"
                    label="Event"
                    selectedKeys={eventFilter ? new Set([eventFilter]) : new Set()}
                    onSelectionChange={(keys) => {
                        const k = Array.from(keys)[0] as string | undefined;
                        setEventFilter(k ?? "");
                    }}
                    className="w-64"
                    data-testid="logs-event-filter"
                >
                    <>
                        <SelectItem key="">Tous les events</SelectItem>
                        <>
                            {EVENT_OPTIONS.map((ev) => (
                                <SelectItem key={ev}>{ev}</SelectItem>
                            ))}
                        </>
                    </>
                </Select>

                {(["ALL", "DELIVERED", "FAILED"] as StatusFilter[]).map((s) => (
                    <Button
                        key={s}
                        size="sm"
                        variant={statusFilter === s ? "solid" : "bordered"}
                        color={statusFilter === s ? "primary" : "default"}
                        onPress={() => setStatusFilter(s)}
                        data-testid={`logs-status-${s}`}
                    >
                        {s === "ALL" ? "Tous" : s === "DELIVERED" ? "Délivrés" : "Échecs"}
                    </Button>
                ))}

                <Select
                    size="sm"
                    label="Période"
                    selectedKeys={new Set([String(sinceDays)])}
                    onSelectionChange={(keys) => {
                        const k = Number(Array.from(keys)[0]);
                        if (k > 0) setSinceDays(k);
                    }}
                    className="w-40"
                >
                    {([1, 7, 30, 90]).map((d) => (
                        <SelectItem key={String(d)}>{d}j</SelectItem>
                    ))}
                </Select>
            </div>

            {loading ? (
                <div className="flex justify-center py-12"><Spinner /></div>
            ) : rows.length === 0 ? (
                <div className="text-center py-12 text-gray-500">Aucun log sur cette période.</div>
            ) : (
                <div className="space-y-1">
                    {rows.map((r) => (
                        <div
                            key={r.id}
                            data-testid="log-row"
                            className="bg-[#161616] border border-[#262626] rounded-xl p-3 flex items-center gap-3 text-sm"
                        >
                            {r.delivered ? (
                                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                            ) : (
                                <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                            )}
                            <Chip size="sm" variant="bordered" className="font-mono">{r.eventKey}</Chip>
                            <div className="min-w-0 flex-1 truncate">
                                <span className="text-slate-200">{r.resellerCompanyName ?? "—"}</span>
                                {r.contactPhone && (
                                    <span className="text-slate-500 ml-2 font-mono text-xs">{r.contactPhone}</span>
                                )}
                                {r.reason && (
                                    <span className="text-red-400 ml-2 text-xs">{r.reason}</span>
                                )}
                            </div>
                            <span className="text-xs text-slate-500 shrink-0">{formatDate(r.createdAt)}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
