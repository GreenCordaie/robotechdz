"use client";

import { useEffect, useState, useCallback } from "react";
import type {
    LoadbrainProviderSnapshot,
    ProvidersApiResponse,
} from "@/lib/loadbrain-providers-registry";

const REFRESH_MS = 5 * 60 * 1000;

function fmtBalance(b: LoadbrainProviderSnapshot["balance"]): string {
    if (!b) return "—";
    const amount = (b.balanceCents / 100).toFixed(2);
    return `${amount} ${b.currency}`;
}

function statusBadgeClass(s: string): string {
    if (s === "ok") return "bg-green-900/30 text-green-300 border-green-800";
    if (s === "degraded") return "bg-yellow-900/30 text-yellow-300 border-yellow-800";
    return "bg-red-900/30 text-red-300 border-red-800";
}

export function ProvidersTable({ initial }: { initial: ProvidersApiResponse }) {
    const [snapshot, setSnapshot] = useState<ProvidersApiResponse>(initial);
    const [refreshing, setRefreshing] = useState(false);
    const [lastRefreshAt, setLastRefreshAt] = useState<Date>(new Date());

    const refresh = useCallback(async () => {
        setRefreshing(true);
        try {
            const res = await fetch("/api/superadmin/providers", { cache: "no-store" });
            const body = (await res.json()) as ProvidersApiResponse;
            setSnapshot(body);
            setLastRefreshAt(new Date());
        } finally {
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        const id = setInterval(refresh, REFRESH_MS);
        return () => clearInterval(id);
    }, [refresh]);

    if (!snapshot.success) {
        return (
            <div className="rounded-lg border border-red-500/30 bg-red-950/20 p-4 text-red-300">
                <p className="font-semibold mb-1">Impossible de joindre LoadBrain</p>
                <p className="text-sm text-red-400">{snapshot.error ?? "Erreur inconnue"}</p>
                <button
                    onClick={refresh}
                    disabled={refreshing}
                    className="mt-3 px-3 py-1.5 rounded bg-red-800/30 hover:bg-red-800/50 text-red-100 text-sm disabled:opacity-50"
                >
                    {refreshing ? "Tentative…" : "Réessayer"}
                </button>
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-neutral-400">
                    <span className="font-medium text-neutral-200">{snapshot.totalCount}</span>{" "}
                    provider(s) ·{" "}
                    <span
                        className={
                            snapshot.downCount > 0
                                ? "text-red-400 font-medium"
                                : "text-neutral-400"
                        }
                    >
                        {snapshot.downCount} down
                    </span>{" "}
                    · dernier check {lastRefreshAt.toLocaleTimeString()}
                </div>
                <button
                    onClick={refresh}
                    disabled={refreshing}
                    className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-white text-sm disabled:opacity-50 border border-neutral-700"
                >
                    {refreshing ? "Refresh…" : "Refresh"}
                </button>
            </div>

            {snapshot.data.length === 0 ? (
                <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-8 text-center text-neutral-400 text-sm">
                    Aucun provider enregistré dans LoadBrain.
                </div>
            ) : (
                <div className="overflow-hidden rounded-lg border border-neutral-800">
                    <table className="w-full text-sm">
                        <thead className="bg-neutral-900/80 text-neutral-400 text-xs uppercase tracking-wide">
                            <tr>
                                <th className="text-left py-3 px-4">Slug</th>
                                <th className="text-left py-3 px-4">Statut</th>
                                <th className="text-right py-3 px-4">Latence</th>
                                <th className="text-right py-3 px-4">Balance</th>
                                <th className="text-left py-3 px-4">Erreur</th>
                            </tr>
                        </thead>
                        <tbody>
                            {snapshot.data.map((p) => (
                                <tr
                                    key={p.slug}
                                    className="border-t border-neutral-800 hover:bg-neutral-900/30"
                                >
                                    <td className="py-3 px-4 font-mono font-medium text-white">
                                        {p.slug}
                                    </td>
                                    <td className="py-3 px-4">
                                        <span
                                            className={`inline-block px-2 py-0.5 rounded text-xs font-semibold border ${statusBadgeClass(p.status)}`}
                                        >
                                            {p.status.toUpperCase()}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 text-right text-neutral-300 font-mono">
                                        {p.latencyMs} ms
                                    </td>
                                    <td className="py-3 px-4 text-right text-white font-mono">
                                        {fmtBalance(p.balance)}
                                    </td>
                                    <td className="py-3 px-4 text-xs text-red-400">
                                        {p.error ?? ""}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
