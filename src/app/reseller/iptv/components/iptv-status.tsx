"use client";

import React from "react";

export type IptvStatus =
    | "PENDING_LOADBRAIN"
    | "ACTIVE"
    | "FROZEN"
    | "EXPIRED"
    | "CANCELLED"
    | "FAILED"
    | "REFUNDED";

export type IptvProvider = "panelking365" | "atlaspro" | "ironmax" | "ibosol";

export const STATUS_LABELS: Record<IptvStatus, string> = {
    PENDING_LOADBRAIN: "En attente",
    ACTIVE: "Actif",
    FROZEN: "Gelé",
    EXPIRED: "Expiré",
    CANCELLED: "Annulé",
    FAILED: "Échec",
    REFUNDED: "Remboursé",
};

export const STATUS_COLOR_CLASS: Record<IptvStatus, string> = {
    PENDING_LOADBRAIN:
        "bg-amber-500/15 text-amber-300 border-amber-500/30",
    ACTIVE: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    FROZEN: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    EXPIRED: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
    CANCELLED: "bg-zinc-700/30 text-zinc-400 border-zinc-600/40",
    FAILED: "bg-red-500/15 text-red-400 border-red-500/30",
    REFUNDED: "bg-violet-500/15 text-violet-300 border-violet-500/30",
};

interface StatusPillProps {
    readonly status: IptvStatus | string;
}

export const StatusPill: React.FC<StatusPillProps> = ({ status }) => {
    const key = (status as IptvStatus) in STATUS_LABELS
        ? (status as IptvStatus)
        : "PENDING_LOADBRAIN";
    const label = STATUS_LABELS[key] ?? String(status);
    const cls = STATUS_COLOR_CLASS[key] ?? STATUS_COLOR_CLASS.PENDING_LOADBRAIN;
    return (
        <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wider ${cls}`}
        >
            <span className="size-1.5 rounded-full bg-current" />
            {label}
        </span>
    );
};

export function formatExpiryCountdown(
    expiresAt: Date | string | null | undefined,
): string {
    if (!expiresAt) return "—";
    const d = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
    if (Number.isNaN(d.getTime())) return "—";
    const now = Date.now();
    const diffMs = d.getTime() - now;
    const day = 24 * 60 * 60 * 1000;
    const days = Math.round(Math.abs(diffMs) / day);
    if (diffMs >= 0) {
        if (days === 0) return "Expire aujourd'hui";
        if (days === 1) return "Expire demain";
        return `Expire dans ${days} jours`;
    }
    if (days === 0) return "Expiré aujourd'hui";
    if (days === 1) return "Expiré hier";
    return `Expiré il y a ${days} jours`;
}

export interface ProviderBadge {
    readonly label: string;
    readonly colorClass: string;
}

export const PROVIDER_BADGES: Record<IptvProvider, ProviderBadge> = {
    panelking365: {
        label: "PanelKing 365",
        colorClass: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
    },
    atlaspro: {
        label: "Atlas Pro",
        colorClass: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    },
    ironmax: {
        label: "IronMax",
        colorClass: "bg-orange-500/15 text-orange-300 border-orange-500/30",
    },
    ibosol: {
        label: "IBOSol",
        colorClass: "bg-teal-500/15 text-teal-300 border-teal-500/30",
    },
};

interface ProviderBadgeChipProps {
    readonly provider: IptvProvider | string;
}

export const ProviderBadgeChip: React.FC<ProviderBadgeChipProps> = ({
    provider,
}) => {
    const cfg =
        (PROVIDER_BADGES as Record<string, ProviderBadge | undefined>)[
            provider as string
        ] ?? {
            label: String(provider),
            colorClass: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
        };
    return (
        <span
            className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-black uppercase tracking-wider ${cfg.colorClass}`}
        >
            {cfg.label}
        </span>
    );
};

export function asErrorString(err: unknown, fallback: string): string {
    if (typeof err === "string" && err.length > 0) return err;
    if (err instanceof Error && typeof err.message === "string" && err.message)
        return err.message;
    if (err && typeof err === "object") {
        const m = (err as { message?: unknown }).message;
        if (typeof m === "string" && m) return m;
        try {
            const s = JSON.stringify(err);
            if (s && s !== "{}") return s;
        } catch {
            /* circular */
        }
    }
    return fallback;
}

/**
 * "DD-MM-YYYY HH:mm" — admin-panel compact format used in the lines table.
 * Returns "—" for null/invalid.
 */
export function formatExpiresShort(
    value: Date | string | null | undefined,
): string {
    if (!value) return "—";
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Compact remaining-time label used in the LEFT column of the admin lines table.
 * Returns "5d left" / "3h left" / "Expired" / "—".
 */
export function formatDaysLeft(
    value: Date | string | null | undefined,
): string {
    if (!value) return "—";
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    const diffMs = d.getTime() - Date.now();
    if (diffMs <= 0) return "Expired";
    const hours = Math.floor(diffMs / (60 * 60 * 1000));
    if (hours < 24) return `${hours}h left`;
    const days = Math.floor(hours / 24);
    return `${days}d left`;
}

export function parseDurationFromName(name: string): string | null {
    if (!name) return null;
    const m = name.match(
        /(\d+)\s*(mois|months?|jours?|days?|ans?|years?|an)/i,
    );
    if (!m) return null;
    const n = parseInt(m[1], 10);
    const unit = m[2].toLowerCase();
    if (unit.startsWith("mo") || unit.startsWith("mont"))
        return `${n} mois`;
    if (unit.startsWith("jour") || unit.startsWith("day"))
        return `${n} jours`;
    if (unit.startsWith("an") || unit.startsWith("year"))
        return n > 1 ? `${n} ans` : `${n} an`;
    return null;
}
