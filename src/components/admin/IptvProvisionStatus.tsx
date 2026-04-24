"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Loader2, CheckCircle, XCircle, RefreshCw, Wifi } from "lucide-react";

interface Provision {
    id: number;
    taskId: string;
    loadbrainSlug: string;
    status: string;
    error?: string | null;
    errorCode?: string | null;
    completedAt?: string | null;
}

interface Props {
    orderId: number;
    onRetry?: (provisionId: number) => void;
}

export default function IptvProvisionStatus({ orderId, onRetry }: Props) {
    const [provisions, setProvisions] = useState<Provision[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch(`/api/loadbrain/provision-status?orderId=${orderId}`);
            if (res.ok) {
                const data = await res.json();
                setProvisions(data.provisions || []);
            }
        } catch { }
        setLoading(false);
    }, [orderId]);

    useEffect(() => {
        fetchStatus();
        const hasPending = provisions.some(p => p.status === "queued" || p.status === "processing");
        if (hasPending) {
            const interval = setInterval(fetchStatus, 3000);
            return () => clearInterval(interval);
        }
    }, [fetchStatus, provisions.length]);

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-slate-500 text-xs py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Chargement...
            </div>
        );
    }

    if (provisions.length === 0) {
        return (
            <div className="flex items-center gap-2 text-amber-400 text-xs py-2">
                <Wifi className="w-3.5 h-3.5" />
                IPTV — En attente de provisioning...
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {provisions.map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-xs">
                    {p.status === "queued" || p.status === "processing" ? (
                        <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                            <span className="text-amber-400 font-medium">
                                {p.status === "queued" ? "En file d'attente..." : "Provisioning en cours..."}
                            </span>
                            <span className="text-slate-600 font-mono">{p.loadbrainSlug}</span>
                        </>
                    ) : p.status === "completed" ? (
                        <>
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                            <span className="text-emerald-400 font-medium">Provisionné</span>
                            <span className="text-slate-600 font-mono">{p.loadbrainSlug}</span>
                        </>
                    ) : (
                        <>
                            <XCircle className="w-3.5 h-3.5 text-red-500" />
                            <span className="text-red-400 font-medium">Échoué</span>
                            <span className="text-slate-600 text-[10px]">{p.error || p.errorCode}</span>
                            {onRetry && (
                                <button
                                    onClick={() => onRetry(p.id)}
                                    className="ml-auto flex items-center gap-1 text-[10px] text-violet-400 hover:text-violet-300 bg-violet-500/10 px-2 py-1 rounded"
                                >
                                    <RefreshCw className="w-3 h-3" />
                                    Relancer
                                </button>
                            )}
                        </>
                    )}
                </div>
            ))}
        </div>
    );
}
