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
            switch (topTab) {
                case "ACTIVE":
                    return r.status === "ACTIVE";
                case "EXPIRED":
                    return r.status === "EXPIRED";
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

            {/* Table ──────────────────────────────────────────────── */}
            <div className="bg-[#0a0a0a] border border-[#262626] rounded-xl overflow-hidden">
                {isFetchingLive && liveRows.length === 0 ? (
                    <div className="py-16 flex justify-center">
                        <Spinner color="warning" size="sm" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="py-16 text-center text-slate-500 text-xs italic">
                        Aucune ligne pour ce filtre.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead className="bg-[#0f0f0f] border-b border-[#262626]">
                                <tr className="text-slate-500 text-[10px] uppercase font-black tracking-wider">
                                    <Th>ID</Th>
                                    <Th>Username</Th>
                                    <Th>Password</Th>
                                    <Th>Expires</Th>
                                    <Th>Left</Th>
                                    <Th>Status</Th>
                                    <Th>Trial</Th>
                                    <Th>Online</Th>
                                    <Th>Conn</Th>
                                    <Th>ISP Lock</Th>
                                    <Th>Country</Th>
                                    <Th>Speed</Th>
                                    <Th>Owner</Th>
                                    <Th>Notes</Th>
                                    <Th>Created</Th>
                                    <Th>M3U</Th>
                                    <Th>{""}</Th>
                                    <Th>Actions</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((row) => {
                                    const trial = isTrial(row);
                                    const pwd = revealed[row.id];
                                    return (
                                        <tr
                                            key={row.id}
                                            className="border-b border-[#1a1a1a] last:border-0 hover:bg-[#101010] transition-colors"
                                        >
                                            <Td>
                                                <span className="font-mono text-slate-300">
                                                    {row.displayId}
                                                </span>
                                            </Td>
                                            <Td>
                                                <span
                                                    title={row.username ?? ""}
                                                    className="font-mono text-white tabular-nums"
                                                >
                                                    {row.username ?? "—"}
                                                </span>
                                            </Td>
                                            <Td>
                                                <div className="flex items-center gap-1">
                                                    <span className="font-mono text-slate-300 tabular-nums">
                                                        {pwd ?? "******"}
                                                    </span>
                                                    {row.hasPassword && (
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                handleReveal(row.id)
                                                            }
                                                            disabled={busyReveal === row.id}
                                                            aria-label={
                                                                pwd ? "Masquer" : "Afficher"
                                                            }
                                                            className="size-6 rounded hover:bg-[#1a1a1a] flex items-center justify-center text-slate-500 hover:text-white disabled:opacity-50"
                                                        >
                                                            {pwd ? (
                                                                <EyeOff size={11} />
                                                            ) : (
                                                                <Eye size={11} />
                                                            )}
                                                        </button>
                                                    )}
                                                    {pwd && (
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                copyText(pwd, "Password")
                                                            }
                                                            aria-label="Copier"
                                                            className="size-6 rounded hover:bg-[#1a1a1a] flex items-center justify-center text-slate-500 hover:text-[#FACC15]"
                                                        >
                                                            <Copy size={11} />
                                                        </button>
                                                    )}
                                                </div>
                                            </Td>
                                            <Td>
                                                <span className="text-slate-300 whitespace-nowrap">
                                                    {formatExpiresShort(row.expiresAt)}
                                                </span>
                                            </Td>
                                            <Td>
                                                <span
                                                    className={
                                                        formatDaysLeft(row.expiresAt) ===
                                                        "Expired"
                                                            ? "text-red-400 font-bold"
                                                            : "text-slate-300"
                                                    }
                                                >
                                                    {formatDaysLeft(row.expiresAt)}
                                                </span>
                                            </Td>
                                            <Td>
                                                <StatusPill status={row.status} />
                                            </Td>
                                            <Td>
                                                {trial ? (
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                                        Trial
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-600">—</span>
                                                )}
                                            </Td>
                                            <Td>
                                                <span className="text-slate-600">—</span>
                                            </Td>
                                            <Td>
                                                <span className="text-slate-600 font-mono">
                                                    —
                                                </span>
                                            </Td>
                                            <Td>
                                                <span className="text-slate-600">—</span>
                                            </Td>
                                            <Td>
                                                <span className="text-slate-600">—</span>
                                            </Td>
                                            <Td>
                                                <span className="text-slate-600">—</span>
                                            </Td>
                                            <Td>
                                                <span className="text-slate-300 truncate max-w-[120px] inline-block">
                                                    {row.customerLabel ??
                                                        "karimrobot"}
                                                </span>
                                            </Td>
                                            <Td>
                                                <span
                                                    title={row.notes ?? ""}
                                                    className="text-slate-400 truncate max-w-[140px] inline-block"
                                                >
                                                    {row.notes ?? "—"}
                                                </span>
                                            </Td>
                                            <Td>
                                                <span className="text-slate-400 whitespace-nowrap">
                                                    {formatExpiresShort(row.createdAt)}
                                                </span>
                                            </Td>
                                            <Td>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        copyText(row.m3uUrl, "M3U")
                                                    }
                                                    disabled={!row.m3uUrl}
                                                    aria-label="Copier M3U"
                                                    className="size-7 rounded-md bg-[#161616] border border-[#262626] hover:border-[#FACC15]/40 text-slate-400 hover:text-[#FACC15] flex items-center justify-center disabled:opacity-40"
                                                >
                                                    <Copy size={12} />
                                                </button>
                                            </Td>
                                            <Td>
                                                <Button
                                                    isIconOnly
                                                    size="sm"
                                                    onPress={() => onManage(row.id)}
                                                    className="bg-[#FACC15]/10 border border-[#FACC15]/30 text-[#FACC15] h-7 w-7 min-w-7"
                                                    aria-label="Gérer"
                                                >
                                                    <Settings2 size={12} />
                                                </Button>
                                            </Td>
                                            <Td>
                                                <IptvLineActionsMenu
                                                    row={{
                                                        id: row.id,
                                                        provider: row.provider,
                                                        status: row.status,
                                                        productName: row.productName,
                                                        pricePaidDzd: row.pricePaidDzd,
                                                        customerLabel:
                                                            row.customerLabel,
                                                        customerPhone:
                                                            row.customerPhone,
                                                        expiresAt: row.expiresAt,
                                                        createdAt: row.createdAt,
                                                    }}
                                                    capabilities={capabilities}
                                                    onChanged={fetchLive}
                                                    onShowHistory={onManage}
                                                />
                                            </Td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
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

const Th: React.FC<{ readonly children: React.ReactNode }> = ({ children }) => (
    <th className="px-3 py-2.5 text-left whitespace-nowrap">{children}</th>
);

const Td: React.FC<{ readonly children: React.ReactNode }> = ({ children }) => (
    <td className="px-3 py-2 whitespace-nowrap">{children}</td>
);

export default IptvLinesTable;
