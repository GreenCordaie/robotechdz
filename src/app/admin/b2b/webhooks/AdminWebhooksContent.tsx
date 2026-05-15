"use client";

import React, { useEffect, useState } from "react";
import {
    Spinner,
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Button,
    Textarea,
    Chip,
    useDisclosure,
} from "@heroui/react";
import {
    Webhook,
    Search,
    AlertTriangle,
    PowerOff,
    Power,
    Activity,
    Building2,
    Mail,
} from "lucide-react";
import { toast } from "react-hot-toast";
import {
    listAllWebhooksForAdminAction,
    forceDisableWebhookAction,
    reactivateWebhookAction,
    getWebhookKpisAction,
} from "./actions";
import { formatDate } from "@/lib/formatters";

interface AdminWebhookRow {
    id: number;
    resellerId: number;
    resellerCompanyName: string;
    resellerContactPhone: string | null;
    url: string;
    events: string;
    isActive: boolean;
    lastFiredAt: Date | string | null;
    lastStatusCode: number | null;
    lastError: string | null;
    deliveriesOk: number;
    deliveriesFailed: number;
    createdAt: Date | string;
}

interface Kpis {
    total: number;
    active: number;
    inactive: number;
    failingActive: number;
    totalDeliveriesOk: number;
    totalDeliveriesFailed: number;
}

type Filter = "ALL" | "ACTIVE" | "INACTIVE" | "FAILING";

export default function AdminWebhooksContent() {
    const [hooks, setHooks] = useState<AdminWebhookRow[]>([]);
    const [kpis, setKpis] = useState<Kpis | null>(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<Filter>("ALL");
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");

    const disableModal = useDisclosure();
    const [activeWebhook, setActiveWebhook] = useState<AdminWebhookRow | null>(null);
    const [reason, setReason] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search), 300);
        return () => clearTimeout(t);
    }, [search]);

    const load = async () => {
        setLoading(true);
        const [listRes, kpisRes] = await Promise.all([
            listAllWebhooksForAdminAction({ filter, search: debouncedSearch || undefined }),
            getWebhookKpisAction({}),
        ]);
        if (listRes.success) setHooks(listRes.data as AdminWebhookRow[]);
        if (kpisRes.success) setKpis(kpisRes.data as Kpis);
        setLoading(false);
    };

    useEffect(() => {
        load();
    }, [filter, debouncedSearch]);

    const startDisable = (h: AdminWebhookRow) => {
        setActiveWebhook(h);
        setReason("");
        disableModal.onOpen();
    };

    const submitDisable = async () => {
        if (!activeWebhook || reason.length < 3) return;
        setSubmitting(true);
        try {
            const res = await forceDisableWebhookAction({ id: activeWebhook.id, reason });
            if (res.success) {
                toast.success("Webhook désactivé");
                disableModal.onClose();
                await load();
            } else {
                toast.error(res.error || "Échec");
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleReactivate = async (id: number) => {
        if (!confirm("Réactiver ce webhook ? Les compteurs d'erreur seront reset.")) return;
        const res = await reactivateWebhookAction({ id });
        if (res.success) {
            toast.success("Webhook réactivé");
            await load();
        } else {
            toast.error(res.error || "Échec");
        }
    };

    return (
        <div className="p-8 space-y-6 max-w-7xl">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
                        <Webhook className="text-[var(--primary)]" />
                        Webhooks resellers (admin)
                    </h1>
                    <p className="text-sm text-slate-500 font-medium mt-1">
                        Vue globale tous resellers — surveillance + désactivation forcée pour SAV.
                    </p>
                </div>

                <div className="relative w-full md:w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input
                        type="text"
                        placeholder="Rechercher reseller / URL"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-[#161616] border border-[#262626] rounded-2xl pl-11 pr-4 py-3 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-[var(--primary)]/50"
                    />
                </div>
            </header>

            {kpis && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <KpiCard label="Total" value={kpis.total} />
                    <KpiCard label="Actifs" value={kpis.active} accent="emerald" />
                    <KpiCard label="Inactifs" value={kpis.inactive} accent="slate" />
                    <KpiCard label="Failing" value={kpis.failingActive} accent={kpis.failingActive > 0 ? "amber" : "slate"} />
                    <KpiCard
                        label="Livraisons OK / KO"
                        value={`${kpis.totalDeliveriesOk} / ${kpis.totalDeliveriesFailed}`}
                    />
                </div>
            )}

            <div className="flex gap-2 bg-[#161616] p-1.5 rounded-xl border border-[#262626] w-fit">
                {(
                    [
                        ["ALL", "Tous"],
                        ["ACTIVE", "Actifs"],
                        ["INACTIVE", "Inactifs"],
                        ["FAILING", "Failing"],
                    ] as const
                ).map(([key, label]) => (
                    <button
                        key={key}
                        onClick={() => setFilter(key)}
                        className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                            filter === key ? "bg-[var(--primary)] text-white" : "text-slate-500 hover:text-white"
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="py-20 flex justify-center">
                    <Spinner color="warning" />
                </div>
            ) : hooks.length === 0 ? (
                <div className="py-20 text-center text-slate-500 italic">
                    Aucun webhook {filter === "ALL" ? "" : "dans ce filtre"}.
                </div>
            ) : (
                <ul className="space-y-3">
                    {hooks.map((h) => {
                        const totalDel = h.deliveriesOk + h.deliveriesFailed;
                        const failureRate = totalDel > 0 ? (h.deliveriesFailed / totalDel) * 100 : 0;
                        const isFailing = h.isActive && failureRate > 30;
                        return (
                            <li
                                key={h.id}
                                data-testid="admin-webhook-row"
                                className={`bg-[#161616] border ${
                                    isFailing ? "border-amber-500/30" : "border-[#262626]"
                                } rounded-2xl p-5 space-y-3`}
                            >
                                <div className="flex flex-col md:flex-row md:items-start gap-3">
                                    <div className="flex-1 min-w-0 space-y-1.5">
                                        <div className="flex items-center gap-2 flex-wrap text-sm">
                                            <Building2 size={14} className="text-slate-500" />
                                            <span className="font-bold text-white">{h.resellerCompanyName}</span>
                                            {h.resellerContactPhone && (
                                                <span className="text-xs text-slate-500 font-mono">
                                                    {h.resellerContactPhone}
                                                </span>
                                            )}
                                            <Chip
                                                size="sm"
                                                className={
                                                    h.isActive
                                                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold text-[10px] uppercase"
                                                        : "bg-slate-500/15 text-slate-400 border border-slate-500/30 font-bold text-[10px] uppercase"
                                                }
                                            >
                                                {h.isActive ? "Actif" : "Inactif"}
                                            </Chip>
                                            {isFailing && (
                                                <Chip
                                                    size="sm"
                                                    className="bg-amber-500/15 text-amber-400 border border-amber-500/30 font-bold text-[10px] uppercase"
                                                    startContent={<AlertTriangle size={10} />}
                                                >
                                                    Failing {failureRate.toFixed(0)}%
                                                </Chip>
                                            )}
                                        </div>
                                        <code className="text-xs text-slate-300 break-all block">{h.url}</code>
                                        <div className="flex flex-wrap gap-1.5">
                                            {h.events.split(",").map((e) => (
                                                <Chip
                                                    key={e}
                                                    size="sm"
                                                    className="bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/20 font-bold text-[10px] uppercase"
                                                >
                                                    {e.trim()}
                                                </Chip>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {h.isActive ? (
                                            <Button
                                                size="sm"
                                                onPress={() => startDisable(h)}
                                                data-testid="admin-disable-btn"
                                                className="bg-red-500/15 text-red-400 font-bold border border-red-500/30"
                                                startContent={<PowerOff size={14} />}
                                            >
                                                Désactiver
                                            </Button>
                                        ) : (
                                            <Button
                                                size="sm"
                                                onPress={() => handleReactivate(h.id)}
                                                className="bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/30"
                                                startContent={<Power size={14} />}
                                            >
                                                Réactiver
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-white/5">
                                    <Stat label="✓ OK" value={h.deliveriesOk} color="emerald" />
                                    <Stat label="× KO" value={h.deliveriesFailed} color={isFailing ? "amber" : "red"} />
                                    <Stat label="Dernier code" value={h.lastStatusCode ?? "—"} />
                                    <Stat
                                        label="Dernier envoi"
                                        value={h.lastFiredAt ? formatDate(new Date(h.lastFiredAt)) : "—"}
                                    />
                                </div>

                                {h.lastError && (
                                    <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                                        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                                        <span className="break-all">{h.lastError}</span>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {/* Disable modal */}
            <Modal isOpen={disableModal.isOpen} onClose={disableModal.onClose} size="md">
                <ModalContent>
                    {(close) => (
                        <>
                            <ModalHeader className="text-red-500 flex items-center gap-2">
                                <PowerOff /> Désactiver webhook
                            </ModalHeader>
                            <ModalBody className="space-y-3">
                                {activeWebhook && (
                                    <p className="text-xs text-slate-500">
                                        Reseller : <strong className="text-white">{activeWebhook.resellerCompanyName}</strong>
                                        <br />
                                        URL : <code className="text-white">{activeWebhook.url}</code>
                                    </p>
                                )}
                                <Textarea
                                    label="Motif (audit log)"
                                    placeholder="Receiver app down, abus, demande reseller..."
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    isRequired
                                    minRows={3}
                                    maxLength={500}
                                />
                                <p className="text-[11px] text-amber-400 italic">
                                    Le webhook sera désactivé immédiatement et les futures livraisons seront skippées.
                                    Le reseller pourra le réactiver depuis son dashboard.
                                </p>
                            </ModalBody>
                            <ModalFooter>
                                <Button variant="light" onPress={close} className="font-bold">
                                    Annuler
                                </Button>
                                <Button
                                    onPress={submitDisable}
                                    disabled={submitting || reason.length < 3}
                                    className="bg-red-500 text-white font-black"
                                    data-testid="admin-disable-submit"
                                >
                                    {submitting ? <Spinner size="sm" color="white" /> : "Désactiver"}
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>
        </div>
    );
}

function KpiCard({
    label,
    value,
    accent,
}: {
    label: string;
    value: string | number;
    accent?: "emerald" | "amber" | "red" | "slate";
}) {
    const colorClass =
        accent === "emerald"
            ? "text-emerald-400"
            : accent === "amber"
                ? "text-amber-400"
                : accent === "red"
                    ? "text-red-400"
                    : accent === "slate"
                        ? "text-slate-400"
                        : "text-white";
    return (
        <div className="bg-[#161616] border border-[#262626] rounded-2xl p-4">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</p>
            <p className={`mt-1 text-xl font-black ${colorClass}`}>{value}</p>
        </div>
    );
}

function Stat({
    label,
    value,
    color,
}: {
    label: string;
    value: string | number;
    color?: "emerald" | "red" | "amber";
}) {
    const colorClass =
        color === "emerald"
            ? "text-emerald-400"
            : color === "red"
                ? "text-red-400"
                : color === "amber"
                    ? "text-amber-400"
                    : "text-white";
    return (
        <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</p>
            <p className={`text-sm font-bold ${colorClass}`}>{value}</p>
        </div>
    );
}
