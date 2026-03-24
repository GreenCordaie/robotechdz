"use client";

import React, { useState } from "react";
import { getMonitoringLogs } from "./actions";
import { LogEntry, LogLevel } from "@/lib/logger";

interface ServiceStatus {
    name: string;
    status: "ok" | "degraded";
    responseTimeMs: number;
    errorMessage?: string;
}

interface Props {
    initialLogs: LogEntry[];
    initialCounts: { info: number; warn: number; error: number; critical: number };
    initialUptime: number;
    initialServices: ServiceStatus[];
}

function formatUptime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}h ${m}m ${s}s`;
}

function formatTimestamp(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
}

const LEVEL_COLORS: Record<LogLevel, string> = {
    info: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    warn: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    error: "bg-red-500/20 text-red-300 border-red-500/30",
    critical: "bg-purple-500/20 text-purple-300 border-purple-500/30",
};

const FILTER_BUTTONS: Array<{ label: string; value: LogLevel | undefined }> = [
    { label: "Tous", value: undefined },
    { label: "Info", value: "info" },
    { label: "Warn", value: "warn" },
    { label: "Error", value: "error" },
    { label: "Critical", value: "critical" },
];

export default function MonitoringContent({
    initialLogs,
    initialCounts,
    initialUptime,
    initialServices,
}: Props) {
    const [logs, setLogs] = useState<LogEntry[]>(initialLogs);
    const [counts, setCounts] = useState(initialCounts);
    const [uptime, setUptime] = useState(initialUptime);
    const [services] = useState<ServiceStatus[]>(initialServices);
    const [selectedLevel, setSelectedLevel] = useState<LogLevel | undefined>(undefined);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleFilterChange = async (level: LogLevel | undefined) => {
        setSelectedLevel(level);
        setIsRefreshing(true);
        try {
            const response = await getMonitoringLogs({ level, limit: 50 });
            if ("logs" in response) {
                setLogs((response as any).logs);
                setCounts((response as any).counts);
                setUptime((response as any).uptime);
            }
        } catch (err) {
            console.error("Failed to fetch logs:", err);
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            const response = await getMonitoringLogs({ level: selectedLevel, limit: 50 });
            if ("logs" in response) {
                setLogs((response as any).logs);
                setCounts((response as any).counts);
                setUptime((response as any).uptime);
            }
        } catch (err) {
            console.error("Failed to refresh logs:", err);
        } finally {
            setIsRefreshing(false);
        }
    };

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Monitoring</h1>
                    <p className="text-slate-400 text-sm mt-1">Statut des services et logs système</p>
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="flex items-center gap-2 px-4 py-2 bg-[#ec5b13] text-white rounded-lg font-medium text-sm hover:bg-[#d44f0f] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isRefreshing ? (
                        <span className="animate-spin text-base">⟳</span>
                    ) : (
                        <span className="text-base">⟳</span>
                    )}
                    Actualiser
                </button>
            </div>

            {/* Uptime */}
            <div className="bg-[#1a1614] border border-[#2d2622] rounded-xl p-4">
                <p className="text-slate-400 text-xs uppercase tracking-widest font-semibold mb-1">Uptime Serveur</p>
                <p className="text-white text-3xl font-mono font-bold">{formatUptime(uptime)}</p>
            </div>

            {/* Log Counts */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(["info", "warn", "error", "critical"] as LogLevel[]).map((level) => (
                    <div
                        key={level}
                        className={`rounded-xl p-4 border ${LEVEL_COLORS[level]} bg-opacity-10`}
                    >
                        <p className="text-xs uppercase tracking-widest font-semibold mb-1 opacity-70">{level}</p>
                        <p className="text-2xl font-bold font-mono">{counts[level]}</p>
                    </div>
                ))}
            </div>

            {/* Service Cards */}
            <div>
                <h2 className="text-lg font-bold text-white mb-3">Services</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {services.map((service) => (
                        <div
                            key={service.name}
                            className="bg-[#1a1614] border border-[#2d2622] rounded-xl p-4 space-y-2"
                        >
                            <div className="flex items-center justify-between">
                                <p className="text-white font-semibold text-sm">{service.name}</p>
                                <span
                                    className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                                        service.status === "ok"
                                            ? "bg-green-500/20 text-green-300 border-green-500/30"
                                            : "bg-red-500/20 text-red-300 border-red-500/30"
                                    }`}
                                >
                                    {service.status === "ok" ? "OK" : "Dégradé"}
                                </span>
                            </div>
                            <p className="text-slate-400 text-xs font-mono">
                                {service.responseTimeMs}ms
                            </p>
                            {service.errorMessage && (
                                <p className="text-red-400 text-xs truncate" title={service.errorMessage}>
                                    {service.errorMessage}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Logs Section */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-bold text-white">Logs</h2>
                    <div className="flex gap-2 flex-wrap">
                        {FILTER_BUTTONS.map(({ label, value }) => (
                            <button
                                key={label}
                                onClick={() => handleFilterChange(value)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                    selectedLevel === value
                                        ? "bg-[#ec5b13] text-white border-[#ec5b13]"
                                        : "bg-[#1a1614] text-slate-400 border-[#2d2622] hover:text-white hover:border-slate-500"
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="bg-[#1a1614] border border-[#2d2622] rounded-xl overflow-hidden">
                    {logs.length === 0 ? (
                        <div className="p-8 text-center text-slate-500 text-sm">
                            Aucun log pour ce niveau.
                        </div>
                    ) : (
                        <div className="divide-y divide-[#2d2622]">
                            {logs.map((log) => (
                                <div key={log.id} className="p-4 hover:bg-white/5 transition-colors">
                                    <div className="flex items-start gap-3">
                                        <span
                                            className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border mt-0.5 ${LEVEL_COLORS[log.level]}`}
                                        >
                                            {log.level}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white text-sm font-medium">{log.message}</p>
                                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                                                <span className="text-slate-500 text-xs font-mono">
                                                    {formatTimestamp(log.timestamp)}
                                                </span>
                                                {log.action && (
                                                    <span className="text-slate-400 text-xs font-mono">
                                                        action: <span className="text-[#ec5b13]">{log.action}</span>
                                                    </span>
                                                )}
                                                {log.userId && (
                                                    <span className="text-slate-400 text-xs font-mono">
                                                        user: <span className="text-slate-300">{log.userId}</span>
                                                    </span>
                                                )}
                                            </div>
                                            {log.metadata && Object.keys(log.metadata).length > 0 && (
                                                <p className="text-slate-500 text-xs font-mono mt-1 truncate">
                                                    {JSON.stringify(log.metadata)}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
