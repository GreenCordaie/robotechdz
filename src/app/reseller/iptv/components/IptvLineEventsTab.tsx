"use client";
/**
 * Audit feed for a single IPTV line — renders the upstream event history
 * (provisioning attempts, webhooks, lifecycle mutations) returned by the
 * LoadBrain v2 gateway.
 *
 * Defensive against the upstream payload shape: each event might expose any
 * subset of `timestamp/createdAt/at`, `type/event`, `status/statusCode`, and
 * `response/body`. Unknown fields fall back to "—".
 */

import React, { useEffect, useState } from "react";
import { Spinner } from "@heroui/react";
import { toast } from "react-hot-toast";

import { getIptvLineEventsAction } from "@/app/reseller/iptv/actions";
import { asErrorString } from "./iptv-status";

interface IptvLineEventsTabProps {
    readonly id: number;
}

interface UpstreamEvent {
    readonly timestamp?: unknown;
    readonly createdAt?: unknown;
    readonly at?: unknown;
    readonly type?: unknown;
    readonly event?: unknown;
    readonly status?: unknown;
    readonly statusCode?: unknown;
    readonly response?: unknown;
    readonly body?: unknown;
    readonly message?: unknown;
}

function pickString(value: unknown): string | null {
    if (typeof value === "string" && value.trim().length > 0) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return null;
}

function formatTimestamp(value: unknown): string {
    const s = pickString(value);
    if (!s) return "—";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleString("fr-FR", {
        dateStyle: "short",
        timeStyle: "medium",
    });
}

function formatExcerpt(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value.slice(0, 300);
    try {
        const s = JSON.stringify(value);
        return s.slice(0, 300);
    } catch {
        return String(value).slice(0, 300);
    }
}

export const IptvLineEventsTab: React.FC<IptvLineEventsTabProps> = ({ id }) => {
    const [events, setEvents] = useState<ReadonlyArray<UpstreamEvent>>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setIsLoading(true);
        setError(null);
        getIptvLineEventsAction({ id })
            .then((res) => {
                if (cancelled) return;
                if (res.success) {
                    const data = res.data as { events?: ReadonlyArray<UpstreamEvent> };
                    setEvents(Array.isArray(data.events) ? data.events : []);
                } else {
                    const msg = asErrorString(res.error, "Erreur de chargement");
                    setError(msg);
                    toast.error(msg);
                }
            })
            .catch((err) => {
                if (cancelled) return;
                const msg = asErrorString(err, "Erreur de chargement");
                setError(msg);
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [id]);

    if (isLoading) {
        return (
            <div className="py-10 flex justify-center">
                <Spinner color="warning" size="sm" />
            </div>
        );
    }
    if (error) {
        return (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
                {error}
            </div>
        );
    }
    if (events.length === 0) {
        return (
            <div className="py-10 text-center text-slate-500 text-xs italic">
                Aucun événement enregistré pour cette ligne.
            </div>
        );
    }

    return (
        <ul className="space-y-2">
            {events.map((ev, idx) => {
                const ts = formatTimestamp(
                    ev.timestamp ?? ev.createdAt ?? ev.at,
                );
                const type =
                    pickString(ev.type) ??
                    pickString(ev.event) ??
                    "événement";
                const statusCode =
                    pickString(ev.statusCode) ?? pickString(ev.status);
                const excerpt = formatExcerpt(
                    ev.response ?? ev.body ?? ev.message,
                );
                return (
                    <li
                        key={idx}
                        className="bg-[#0a0a0a] border border-[#262626] rounded-lg p-3 space-y-1.5"
                    >
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] uppercase font-black tracking-widest text-[#FACC15]">
                                {type}
                            </span>
                            <span className="text-[10px] font-mono text-slate-500">
                                {ts}
                            </span>
                        </div>
                        {statusCode && (
                            <p className="text-xs text-slate-400">
                                Statut :{" "}
                                <span className="text-slate-200 font-mono">
                                    {statusCode}
                                </span>
                            </p>
                        )}
                        {excerpt && (
                            <pre className="text-[11px] text-slate-400 font-mono whitespace-pre-wrap break-words bg-[#070707] border border-[#1a1a1a] rounded p-2 max-h-40 overflow-auto">
                                {excerpt}
                            </pre>
                        )}
                    </li>
                );
            })}
        </ul>
    );
};

export default IptvLineEventsTab;
