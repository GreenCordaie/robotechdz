"use client";
/**
 * Reseller IPTV lines table — admin-panel 1:1 layout.
 *
 * Mirrors the LoadBrain /admin/{provider}/lines view but scoped to the
 * authenticated reseller (server action filters by reseller_id). The bulk
 * endpoint never ships passwords; per-row reveal lazy-fetches the credential.
 *
 * Columns: ID · USERNAME · PASSWORD · EXPIRES · LEFT · STATUS · TRIAL ·
 *          ONLINE · CONN · ISP LOCK · COUNTRY · SPEED · OWNER · NOTES ·
 *          CREATED · M3U
 *
 * The parent page keeps owning pagination + provider tabs + search. This
 * component is the canonical "Mes lignes" surface — it preserves the original
 * `IptvLinesTableProps` shape so `page.tsx` is untouched, but tab filtering
 * (All / Active / Expired / Trial) and refresh now happen in-memory against
 * the LIVE feed pulled here.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Input, Spinner } from "@heroui/react";
import {
    Copy,
    Eye,
    EyeOff,
    RefreshCw,
    Search,
    Settings2,
    ChevronLeft,
    ChevronRight,
} from "lucide-react";
import { toast } from "react-hot-toast";

import {
    StatusPill,
    deriveEffectiveStatus,
    formatExpiresShort,
    formatDaysLeft,
    type IptvProvider,
    type IptvStatus,
} from "./iptv-status";
import {
    getMyIptvLinesLiveAction,
    getMyIptvLineCredentialsAction,
    getIptvCapabilitiesAction,
} from "@/app/reseller/iptv/actions";
import IptvLineActionsMenu from "./IptvLineActionsMenu";

/* ── Props compat shim ────────────────────────────────────────────────── */

export interface IptvLineRow {
    readonly id: number;
    readonly provider: string;
    readonly status: string;
    readonly productName: string;
    readonly pricePaidDzd: string;
    readonly customerLabel: string | null;
    readonly customerPhone: string | null;
    readonly expiresAt: string | Date | null;
    readonly createdAt: string | Date;
}

export type StatusFilter = "ALL" | IptvStatus;

interface IptvLinesTableProps {
    readonly provider: IptvProvider;
    /** Kept for prop compat with page.tsx (not used — we fetch live). */
    readonly items: ReadonlyArray<IptvLineRow>;
    readonly total: number;
    readonly page: number;
    readonly limit: number;
    readonly totalPages: number;
    readonly search: string;
    readonly statusFilter: StatusFilter;
    readonly isLoading: boolean;
    readonly onChange: (next: {
        readonly search?: string;
        readonly statusFilter?: StatusFilter;
        readonly page?: number;
    }) => void;
    readonly onManage: (id: number) => void;
}

/* ── Live row shape returned by getMyIptvLinesLiveAction ──────────────── */

interface LiveLineRow {
    readonly id: number;
    readonly displayId: string;
    readonly provider: string;
    readonly status: string;
    readonly productName: string;
    readonly username: string | null;
    readonly hasPassword: boolean;
    readonly m3uUrl: string | null;
    readonly epgUrl: string | null;
    readonly expiresAt: string | null;
    readonly customerLabel: string | null;
    readonly customerPhone: string | null;
    readonly notes: string | null;
    readonly pricePaidDzd: string;
    readonly createdAt: string;
    readonly lbTaskId: string | null;
}

type TopTab = "ALL" | "ACTIVE" | "EXPIRED" | "TRIAL";

const TOP_TABS: ReadonlyArray<{ key: TopTab; label: string }> = [
    { key: "ALL", label: "All" },
    { key: "ACTIVE", label: "Active" },
    { key: "EXPIRED", label: "Expired" },
    { key: "TRIAL", label: "Trial" },
];

/* ── Heuristics ───────────────────────────────────────────────────────── */

function isTrial(row: LiveLineRow): boolean {
    const n = (row.productName ?? "").toLowerCase();
    if (n.includes("trial") || n.includes("test")) return true;
    // Sub-2-day duration → treat as trial.
    if (row.expiresAt) {
        const exp = new Date(row.expiresAt).getTime();
        const created = new Date(row.createdAt).getTime();
        if (Number.isFinite(exp) && Number.isFinite(created)) {
            const days = (exp - created) / (24 * 60 * 60 * 1000);
            if (days > 0 && days < 2) return true;
        }
    }
    return false;
}

function copyText(value: string | null, label: string): void {
    if (!value) {
        toast.error(`${label} indisponible`);
        return;
    }
    try {
        void navigator.clipboard.writeText(value);
        toast.success(`${label} copié`);
    } catch {
        toast.error("Impossible de copier");
    }
}

/* ── Component ────────────────────────────────────────────────────────── */

export const IptvLinesTable: React.FC<IptvLinesTableProps> = ({
    provider,
    page,
    limit,
    totalPages,
    search,
    isLoading: parentLoading,
    onChange,
    onManage,
}) => {
    const [liveRows, setLiveRows] = useState<ReadonlyArray<LiveLineRow>>([]);
    const [isFetchingLive, setIsFetchingLive] = useState(false);
    const [topTab, setTopTab] = useState<TopTab>("ALL");
    const [localSearch, setLocalSearch] = useState(search);
    const [revealed, setRevealed] = useState<Record<number, string>>({});
    const [busyReveal, setBusyReveal] = useState<number | null>(null);
    const [capabilities, setCapabilities] = useState<ReadonlySet<string>>(
        () => new Set(),
    );

    useEffect(() => {
        let cancelled = false;
        getIptvCapabilitiesAction({ provider })
            .then((res) => {
                if (cancelled) return;
                if (res.success) {
                    const data = res.data as { actions?: ReadonlyArray<string> };
                    setCapabilities(new Set(data.actions ?? []));
                } else {
                    // Fail-open with empty set — menu items will all disable.
                    setCapabilities(new Set());
                }
            })
            .catch(() => {
                if (!cancelled) setCapabilities(new Set());
            });
        return () => {
            cancelled = true;
        };
    }, [provider]);

    useEffect(() => {
        setLocalSearch(search);
    }, [search]);

    /* Debounced search → parent state. */
    useEffect(() => {
        const t = setTimeout(() => {
            if (localSearch !== search) {
                onChange({ search: localSearch, page: 1 });
            }
        }, 300);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [localSearch]);

    const fetchLive = useCallback(() => {
        setIsFetchingLive(true);
        getMyIptvLinesLiveAction({ provider })
            .then((res) => {
                if (res.success) {
                    const data = res.data as { items: ReadonlyArray<LiveLineRow> };
                    setLiveRows(data.items);
                } else {
                    toast.error(
                        typeof res.error === "string"
                            ? res.error
                            : "Échec chargement",
                    );
                }
            })
            .catch(() => toast.error("Échec chargement"))
            .finally(() => setIsFetchingLive(false));
    }, [provider]);

    useEffect(() => {
        // Reset reveal cache on provider switch — security.
        setRevealed({});
        fetchLive();
    }, [provider, fetchLive]);

    /* In-memory tab + search filter. */
    const filtered = useMemo(() => {
        const q = localSearch.trim().toLowerCase();
        return liveRows.filter((r) => {
            if (q) {
                const hay = `${r.displayId} ${r.username ?? ""} ${r.customerLabel ?? ""} ${r.customerPhone ?? ""} ${r.productName}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            // Bug #2 — filter against the EXPIRY-AWARE derived status so a
            // line whose mirror still says ACTIVE but whose expiresAt is in
            // the past appears under the EXPIRED tab (and disappears from
            // the ACTIVE tab). Provider-agnostic.
            const effective = deriveEffectiveStatus(r.status, r.expiresAt);
            switch (topTab) {
                case "ACTIVE":
                    return effective === "ACTIVE";
                case "EXPIRED":
                    return effective === "EXPIRED";
                case "TRIAL":
                    return isTrial(r);
                case "ALL":
                default:
                    return true;
            }
        });
    }, [liveRows, topTab, localSearch]);

    const total = liveRows.length;
    const filteredCount = filtered.length;

    const handleReveal = useCallback(async (id: number) => {
        if (revealed[id]) {
            // Toggle off
            setRevealed((s) => {
                const next = { ...s };
                delete next[id];
                return next;
            });
            return;
        }
        setBusyReveal(id);
        try {
            const res = await getMyIptvLineCredentialsAction({ id });
            if (res.success) {
                const data = res.data as { password: string | null };
                if (data.password) {
                    setRevealed((s) => ({ ...s, [id]: data.password! }));
                } else {
                    toast.error("Mot de passe indisponible");
                }
            } else {
                toast.error(
                    typeof res.error === "string"
                        ? res.error
                        : "Échec récupération",
                );
            }
        } catch {
            toast.error("Erreur technique");
        } finally {
            setBusyReveal(null);
        }
    }, [revealed]);

    return (
        <div className="space-y-3">
            {/* Header strip ─────────────────────────────────────────── */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                {/* Left: counter */}
                <div className="flex items-center gap-3">
                    <h3 className="text-sm font-black text-white tracking-tight">
                        All Lines{" "}
                        <span className="text-slate-500 font-mono text-xs">
                            ({filteredCount}/{total})
                        </span>
                    </h3>
                    <div className="relative flex-1 min-w-0 max-w-xs hidden md:block">
                        <Input
                            placeholder="Search id, username, owner..."
                            value={localSearch}
                            onValueChange={setLocalSearch}
                            startContent={
                                <Search size={12} className="text-slate-500" />
                            }
                            size="sm"
                            variant="bordered"
                            classNames={{
                                inputWrapper:
                                    "h-8 min-h-8 bg-[#0a0a0a] border-[#262626]",
                                input: "text-white text-xs",
                            }}
                        />
                    </div>
                </div>

                {/* Right: top tabs + refresh */}
                <div className="flex items-center gap-1.5">
                    {TOP_TABS.map((t) => {
                        const active = topTab === t.key;
                        return (
                            <button
                                key={t.key}
                                type="button"
                                onClick={() => setTopTab(t.key)}
                                className={`h-8 px-3 rounded-md text-[11px] font-black uppercase tracking-wider border transition-colors ${
                                    active
                                        ? "bg-[#FACC15] text-black border-[#FACC15]"
                                        : "bg-[#161616] text-slate-400 border-[#262626] hover:border-[#FACC15]/40 hover:text-white"
                                }`}
                            >
                                {t.label}
                            </button>
                        );
                    })}
                    <button
                        type="button"
                        onClick={fetchLive}
                        disabled={isFetchingLive}
                        aria-label="Refresh"
                        className="h-8 w-8 ml-1 rounded-md bg-[#161616] border border-[#262626] text-slate-400 hover:text-[#FACC15] hover:border-[#FACC15]/40 flex items-center justify-center disabled:opacity-50"
                    >
                        <RefreshCw
                            size={13}
                            className={isFetchingLive ? "animate-spin" : ""}
                        />
                    </button>
                </div>
            </div>

            {/* Mobile search ───────────────────────────────────────── */}
            <div className="md:hidden">
                <Input
                    placeholder="Search id, username, owner..."
                    value={localSearch}
                    onValueChange={setLocalSearch}
                    startContent={<Search size={12} className="text-slate-500" />}
                    size="sm"
                    variant="bordered"
                    classNames={{
                        inputWrapper:
                            "h-9 min-h-9 bg-[#0a0a0a] border-[#262626]",
                        input: "text-white text-xs",
                    }}
                />
            </div>

            {/* Cards grid ──────────────────────────────────────────
                Bug #3 — previously a 16-column table forced a horizontal
                scrollbar even on 1440px. Replaced with a responsive card
                grid: 1 col on mobile, 2 on md, 3 on xl. Every meaningful
                field is visible per card; long values (username, M3U URL)
                wrap with `break-all` instead of clipping. No `overflow-x`. */}
            <div className="bg-[#0a0a0a] border border-[#262626] rounded-xl">
                {isFetchingLive && liveRows.length === 0 ? (
                    <div className="py-16 flex justify-center">
                        <Spinner color="warning" size="sm" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="py-16 text-center text-slate-500 text-xs italic">
                        Aucune ligne pour ce filtre.
                    </div>
                ) : (
                    <div className="p-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {filtered.map((row) => (
                            <IptvLineCard
                                key={row.id}
                                row={row}
                                trial={isTrial(row)}
                                pwd={revealed[row.id]}
                                isRevealing={busyReveal === row.id}
                                capabilities={capabilities}
                                onReveal={handleReveal}
                                onCopy={copyText}
                                onManage={onManage}
                                onChanged={fetchLive}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Pagination (kept for parent-driven mode) */}
            {totalPages > 1 && (
                <div className="flex items-center justify-end gap-2 pt-1">
                    <Button
                        isIconOnly
                        size="sm"
                        isDisabled={page <= 1 || parentLoading}
                        onPress={() => onChange({ page: Math.max(1, page - 1) })}
                        className="bg-[#161616] border border-[#262626] text-slate-300 h-7 w-7 min-w-7"
                        aria-label="Précédent"
                    >
                        <ChevronLeft size={12} />
                    </Button>
                    <span className="text-[11px] text-slate-500 font-mono">
                        {page} / {totalPages}
                    </span>
                    <Button
                        isIconOnly
                        size="sm"
                        isDisabled={page >= totalPages || parentLoading}
                        onPress={() =>
                            onChange({ page: Math.min(totalPages, page + 1) })
                        }
                        className="bg-[#161616] border border-[#262626] text-slate-300 h-7 w-7 min-w-7"
                        aria-label="Suivant"
                    >
                        <ChevronRight size={12} />
                    </Button>
                    <span className="sr-only">limit {limit}</span>
                </div>
            )}
        </div>
    );
};

/* ── Card sub-component ────────────────────────────────────────────────
   Self-contained per-line card. All fields are visible in a
   responsive 2-column micro-grid; long values (M3U URL, codes)
   wrap with `break-all`. No fixed widths → never overflows the
   viewport, so the parent grid never needs horizontal scroll. */
interface IptvLineCardProps {
    readonly row: LiveLineRow;
    readonly trial: boolean;
    readonly pwd: string | undefined;
    readonly isRevealing: boolean;
    readonly capabilities: ReadonlySet<string>;
    readonly onReveal: (id: number) => void;
    readonly onCopy: (value: string | null, label: string) => void;
    readonly onManage: (id: number) => void;
    readonly onChanged: () => void;
}

const IptvLineCard: React.FC<IptvLineCardProps> = ({
    row,
    trial,
    pwd,
    isRevealing,
    capabilities,
    onReveal,
    onCopy,
    onManage,
    onChanged,
}) => {
    const expiredLabel = formatDaysLeft(row.expiresAt) === "Expired";
    return (
        <article className="bg-[#0f0f0f] border border-[#1f1f1f] rounded-lg p-3 hover:border-[#FACC15]/30 transition-colors flex flex-col gap-2.5">
            {/* Header — ID + status pill + trial badge */}
            <header className="flex items-start justify-between gap-2">
                <div className="flex flex-col min-w-0">
                    <span className="text-[10px] text-slate-500 uppercase font-black tracking-wider">
                        Ligne
                    </span>
                    <span className="font-mono text-white text-xs break-all">
                        {row.displayId}
                    </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {trial && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            Trial
                        </span>
                    )}
                    <StatusPill status={row.status} expiresAt={row.expiresAt} />
                </div>
            </header>

            {/* Credentials block */}
            <dl className="grid grid-cols-[auto,1fr] gap-x-2 gap-y-1.5 text-[11px]">
                <dt className="text-slate-500 uppercase text-[10px] font-black tracking-wider self-center">
                    Username
                </dt>
                <dd className="flex items-center gap-1 min-w-0">
                    <span className="font-mono text-white tabular-nums break-all">
                        {row.username ?? "—"}
                    </span>
                    {row.username && (
                        <button
                            type="button"
                            onClick={() => onCopy(row.username, "Username")}
                            aria-label="Copier username"
                            className="size-5 shrink-0 rounded hover:bg-[#1a1a1a] flex items-center justify-center text-slate-500 hover:text-[#FACC15]"
                        >
                            <Copy size={10} />
                        </button>
                    )}
                </dd>

                <dt className="text-slate-500 uppercase text-[10px] font-black tracking-wider self-center">
                    Password
                </dt>
                <dd className="flex items-center gap-1 min-w-0">
                    <span className="font-mono text-slate-300 tabular-nums break-all">
                        {pwd ?? "••••••"}
                    </span>
                    {row.hasPassword && (
                        <button
                            type="button"
                            onClick={() => onReveal(row.id)}
                            disabled={isRevealing}
                            aria-label={pwd ? "Masquer mot de passe" : "Afficher mot de passe"}
                            className="size-5 shrink-0 rounded hover:bg-[#1a1a1a] flex items-center justify-center text-slate-500 hover:text-white disabled:opacity-50"
                        >
                            {pwd ? <EyeOff size={10} /> : <Eye size={10} />}
                        </button>
                    )}
                    {pwd && (
                        <button
                            type="button"
                            onClick={() => onCopy(pwd, "Password")}
                            aria-label="Copier mot de passe"
                            className="size-5 shrink-0 rounded hover:bg-[#1a1a1a] flex items-center justify-center text-slate-500 hover:text-[#FACC15]"
                        >
                            <Copy size={10} />
                        </button>
                    )}
                </dd>

                <dt className="text-slate-500 uppercase text-[10px] font-black tracking-wider self-center">
                    Expire
                </dt>
                <dd className="flex items-center gap-2 flex-wrap">
                    <span className="text-slate-300">
                        {formatExpiresShort(row.expiresAt)}
                    </span>
                    <span
                        className={
                            expiredLabel
                                ? "text-red-400 font-bold text-[10px]"
                                : "text-slate-500 text-[10px]"
                        }
                    >
                        {formatDaysLeft(row.expiresAt)}
                    </span>
                </dd>

                <dt className="text-slate-500 uppercase text-[10px] font-black tracking-wider self-center">
                    Créé
                </dt>
                <dd className="text-slate-400">
                    {formatExpiresShort(row.createdAt)}
                </dd>

                <dt className="text-slate-500 uppercase text-[10px] font-black tracking-wider self-center">
                    Client
                </dt>
                <dd className="text-slate-300 break-words">
                    {row.customerLabel ?? "—"}
                    {row.customerPhone ? (
                        <span className="text-slate-500"> · {row.customerPhone}</span>
                    ) : null}
                </dd>

                {row.notes && (
                    <>
                        <dt className="text-slate-500 uppercase text-[10px] font-black tracking-wider self-start">
                            Notes
                        </dt>
                        <dd className="text-slate-400 break-words">{row.notes}</dd>
                    </>
                )}
            </dl>

            {/* Footer — actions row */}
            <footer className="flex items-center justify-between gap-2 pt-1 border-t border-[#1a1a1a]">
                <button
                    type="button"
                    onClick={() => onCopy(row.m3uUrl, "M3U")}
                    disabled={!row.m3uUrl}
                    aria-label="Copier M3U"
                    className="h-7 px-2 rounded-md bg-[#161616] border border-[#262626] hover:border-[#FACC15]/40 text-slate-400 hover:text-[#FACC15] flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider disabled:opacity-40"
                >
                    <Copy size={11} /> M3U
                </button>
                <div className="flex items-center gap-1.5">
                    <Button
                        isIconOnly
                        size="sm"
                        onPress={() => onManage(row.id)}
                        className="bg-[#FACC15]/10 border border-[#FACC15]/30 text-[#FACC15] h-7 w-7 min-w-7"
                        aria-label="Gérer"
                    >
                        <Settings2 size={12} />
                    </Button>
                    <IptvLineActionsMenu
                        row={{
                            id: row.id,
                            provider: row.provider,
                            status: row.status,
                            productName: row.productName,
                            pricePaidDzd: row.pricePaidDzd,
                            customerLabel: row.customerLabel,
                            customerPhone: row.customerPhone,
                            expiresAt: row.expiresAt,
                            createdAt: row.createdAt,
                        }}
                        capabilities={capabilities}
                        onChanged={onChanged}
                        onShowHistory={onManage}
                    />
                </div>
            </footer>
        </article>
    );
};

export default IptvLinesTable;
