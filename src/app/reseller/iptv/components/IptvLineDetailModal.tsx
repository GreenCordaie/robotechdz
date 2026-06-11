"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Button,
    Spinner,
    Tab,
    Tabs,
} from "@heroui/react";
import IptvLineEventsTab from "./IptvLineEventsTab";
import {
    Copy,
    Eye,
    EyeOff,
    ExternalLink,
    RefreshCw,
    Webhook,
    XCircle,
    AlertTriangle,
} from "lucide-react";
import { toast } from "react-hot-toast";

import {
    getMyIptvOrderDetailAction,
    retryIptvProvisionAction,
    resendIptvWebhookAction,
    cancelIptvOrderAction,
} from "@/app/reseller/iptv/actions";
import { formatCurrency } from "@/lib/formatters";
import {
    asErrorString,
    formatExpiryCountdown,
    PROVIDER_BADGES,
    ProviderBadgeChip,
    StatusPill,
    type IptvProvider,
    type IptvStatus,
} from "./iptv-status";

interface IptvLineDetailModalProps {
    readonly iptvOrderId: number | null;
    readonly isOpen: boolean;
    readonly onClose: () => void;
    readonly onChanged: () => void;
}

interface LocalRow {
    readonly id: number;
    readonly provider: string;
    readonly status: string;
    readonly productName: string;
    readonly pricePaidDzd: string;
    readonly customerLabel: string | null;
    readonly customerPhone: string | null;
    readonly providerAccountId: string | null;
    readonly upstreamLineId: string | null;
    readonly lbTaskId: string | null;
    readonly lbOrderId: string | null;
    readonly expiresAt: string | Date | null;
    readonly lastSyncedAt: string | Date | null;
    readonly lastError: string | null;
    readonly createdAt: string | Date;
    readonly productSnapshot: unknown;
}

interface DetailPayload {
    readonly local: LocalRow;
    readonly upstream: unknown;
}

function copyToClipboard(value: string, label: string) {
    if (!value) return;
    try {
        void navigator.clipboard.writeText(value);
        toast.success(`${label} copié`);
    } catch {
        toast.error("Impossible de copier");
    }
}

function pickString(obj: unknown, keys: ReadonlyArray<string>): string | null {
    if (!obj || typeof obj !== "object") return null;
    const o = obj as Record<string, unknown>;
    for (const k of keys) {
        const v = o[k];
        if (typeof v === "string" && v.trim().length > 0) return v;
        if (typeof v === "number" && Number.isFinite(v)) return String(v);
    }
    return null;
}

function extractCredentials(detail: DetailPayload | null) {
    if (!detail) return null;
    const up = detail.upstream as Record<string, unknown> | null;
    const fromUp = up ?? {};
    const username =
        pickString(fromUp, ["username", "xtreamUsername", "user", "login"]) ??
        detail.local.providerAccountId;
    const password = pickString(fromUp, [
        "password",
        "xtreamPassword",
        "pass",
    ]);
    const m3u =
        pickString(fromUp, ["m3u", "m3uUrl", "playlist", "playlistUrl"]) ??
        null;
    const server = pickString(fromUp, [
        "server",
        "serverUrl",
        "host",
        "dnsUrl",
        "url",
    ]);
    const port = pickString(fromUp, ["port"]);
    const hasAny = !!(username || password || m3u || server);
    return hasAny ? { username, password, m3u, server, port } : null;
}

export const IptvLineDetailModal: React.FC<IptvLineDetailModalProps> = ({
    iptvOrderId,
    isOpen,
    onClose,
    onChanged,
}) => {
    const [detail, setDetail] = useState<DetailPayload | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [busyAction, setBusyAction] = useState<string | null>(null);

    const reload = useCallback(() => {
        if (!iptvOrderId) return;
        setIsLoading(true);
        getMyIptvOrderDetailAction({ id: iptvOrderId })
            .then((res) => {
                if (res.success) {
                    setDetail(res.data as DetailPayload);
                } else {
                    toast.error(asErrorString(res.error, "Erreur de chargement"));
                }
            })
            .catch((err) =>
                toast.error(asErrorString(err, "Erreur de chargement")),
            )
            .finally(() => setIsLoading(false));
    }, [iptvOrderId]);

    useEffect(() => {
        if (!isOpen || !iptvOrderId) {
            setDetail(null);
            setShowPassword(false);
            return;
        }
        reload();
    }, [isOpen, iptvOrderId, reload]);

    const local = detail?.local;
    const status = (local?.status as IptvStatus) ?? "PENDING_LOADBRAIN";
    const provider = (local?.provider as IptvProvider) ?? "panelking365";
    const creds = extractCredentials(detail);

    const canCancel =
        status === "PENDING_LOADBRAIN" ||
        status === "ACTIVE" ||
        status === "FROZEN";
    const canRetry = status === "FAILED";
    const canResend = status === "ACTIVE" || status === "FAILED";

    const handleCancel = async () => {
        if (!local) return;
        if (!confirm("Confirmer l'annulation de cette ligne IPTV ?")) return;
        setBusyAction("cancel");
        try {
            const res = await cancelIptvOrderAction({ id: local.id });
            if (res.success) {
                toast.success("Ligne annulée");
                onChanged();
                reload();
            } else {
                toast.error(asErrorString(res.error, "Échec annulation"));
            }
        } catch (err) {
            toast.error(asErrorString(err, "Erreur technique"));
        } finally {
            setBusyAction(null);
        }
    };

    const handleRetry = async () => {
        if (!local) return;
        if (!confirm("Relancer le provisioning ?")) return;
        setBusyAction("retry");
        try {
            const res = await retryIptvProvisionAction({ id: local.id });
            if (res.success) {
                toast.success("Provisioning relancé");
                onChanged();
                reload();
            } else {
                toast.error(asErrorString(res.error, "Échec relance"));
            }
        } catch (err) {
            toast.error(asErrorString(err, "Erreur technique"));
        } finally {
            setBusyAction(null);
        }
    };

    const handleResend = async () => {
        if (!local) return;
        if (!confirm("Renvoyer le webhook ?")) return;
        setBusyAction("resend");
        try {
            const res = await resendIptvWebhookAction({ id: local.id });
            if (res.success) {
                toast.success("Webhook renvoyé");
            } else {
                toast.error(asErrorString(res.error, "Échec renvoi"));
            }
        } catch (err) {
            toast.error(asErrorString(err, "Erreur technique"));
        } finally {
            setBusyAction(null);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="2xl"
            backdrop="blur"
            scrollBehavior="inside"
            classNames={{
                base: "bg-[#0f0f0f] border border-[#262626]",
                header: "border-b border-[#262626]",
                footer: "border-t border-[#262626]",
            }}
        >
            <ModalContent>
                <ModalHeader className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <ProviderBadgeChip provider={provider} />
                        <StatusPill status={status} expiresAt={local?.expiresAt ?? null} />
                    </div>
                    <span className="text-base font-black text-white">
                        {local?.productName ?? "Ligne IPTV"}
                    </span>
                </ModalHeader>

                <ModalBody className="space-y-5 py-5">
                    {isLoading && !detail && (
                        <div className="py-10 flex justify-center">
                            <Spinner color="warning" />
                        </div>
                    )}

                    {local && (
                        <Tabs
                            aria-label="Détails de la ligne"
                            variant="underlined"
                            classNames={{
                                tabList:
                                    "gap-4 border-b border-[#262626] p-0",
                                tab: "px-0 h-9 data-[selected=true]:text-[#FACC15]",
                                cursor: "bg-[#FACC15]",
                                tabContent: "text-slate-400 text-xs font-black uppercase tracking-wider",
                            }}
                        >
                            <Tab key="details" title="Détails">
                                <div className="space-y-5 pt-4">
                            {/* En-tête infos client */}
                            <div className="bg-[#161616] border border-[#262626] rounded-xl p-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                <DetailField
                                    label="Client"
                                    value={local.customerLabel || "—"}
                                />
                                <DetailField
                                    label="Téléphone"
                                    value={local.customerPhone || "—"}
                                />
                                <DetailField
                                    label="Expiration"
                                    value={formatExpiryCountdown(
                                        local.expiresAt,
                                    )}
                                />
                                <DetailField
                                    label="Prix payé"
                                    value={formatCurrency(
                                        parseFloat(local.pricePaidDzd),
                                        "DZD",
                                    )}
                                />
                            </div>

                            {/* Identifiants */}
                            {creds && (
                                <div className="bg-[#161616] border border-[#262626] rounded-xl p-4 space-y-3">
                                    <p className="text-[10px] uppercase font-black tracking-widest text-slate-500">
                                        Identifiants
                                    </p>
                                    {creds.username && (
                                        <CopyRow
                                            label="Username"
                                            value={creds.username}
                                        />
                                    )}
                                    {creds.password && (
                                        <CopyRow
                                            label="Password"
                                            value={creds.password}
                                            secret
                                            visible={showPassword}
                                            onToggle={() =>
                                                setShowPassword((s) => !s)
                                            }
                                        />
                                    )}
                                    {creds.server && (
                                        <CopyRow
                                            label={
                                                creds.port
                                                    ? "Serveur:port"
                                                    : "Serveur"
                                            }
                                            value={
                                                creds.port
                                                    ? `${creds.server}:${creds.port}`
                                                    : creds.server
                                            }
                                        />
                                    )}
                                    {creds.m3u && (
                                        <div className="flex items-center gap-2">
                                            <CopyRow
                                                label="M3U URL"
                                                value={creds.m3u}
                                            />
                                            <a
                                                href={creds.m3u}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="shrink-0 inline-flex items-center gap-1 px-2.5 h-8 rounded-lg bg-[#FACC15]/10 border border-[#FACC15]/30 text-[#FACC15] text-xs font-black hover:bg-[#FACC15]/20"
                                            >
                                                <ExternalLink size={12} />
                                                Ouvrir
                                            </a>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Audit */}
                            <div className="bg-[#161616] border border-[#262626] rounded-xl p-4 space-y-2 text-xs">
                                <p className="text-[10px] uppercase font-black tracking-widest text-slate-500">
                                    Audit
                                </p>
                                <p className="text-slate-400">
                                    Créée le{" "}
                                    <span className="text-slate-200">
                                        {formatDate(local.createdAt)}
                                    </span>
                                </p>
                                <p className="text-slate-400">
                                    Dernière sync :{" "}
                                    <span className="text-slate-200">
                                        {local.lastSyncedAt
                                            ? formatDate(local.lastSyncedAt)
                                            : "—"}
                                    </span>
                                </p>
                                {local.lbTaskId && (
                                    <p className="text-slate-400 font-mono">
                                        Task LB : {local.lbTaskId}
                                    </p>
                                )}
                                {local.lbOrderId && (
                                    <p className="text-slate-400 font-mono">
                                        Order LB : {local.lbOrderId}
                                    </p>
                                )}
                                {local.lastError && (
                                    <div className="mt-2 flex items-start gap-1.5 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300">
                                        <AlertTriangle
                                            size={12}
                                            className="mt-0.5 shrink-0"
                                        />
                                        <span className="leading-relaxed">
                                            {local.lastError}
                                        </span>
                                    </div>
                                )}
                            </div>
                                </div>
                            </Tab>
                            <Tab key="history" title="Historique">
                                <div className="pt-4">
                                    <IptvLineEventsTab id={local.id} />
                                </div>
                            </Tab>
                        </Tabs>
                    )}
                </ModalBody>

                <ModalFooter className="flex flex-wrap gap-2">
                    {canCancel && (
                        <Button
                            onPress={handleCancel}
                            isLoading={busyAction === "cancel"}
                            isDisabled={busyAction !== null}
                            startContent={<XCircle size={14} />}
                            className="bg-red-500/10 border border-red-500/30 text-red-300 font-black"
                        >
                            Annuler
                        </Button>
                    )}
                    {canRetry && (
                        <Button
                            onPress={handleRetry}
                            isLoading={busyAction === "retry"}
                            isDisabled={busyAction !== null}
                            startContent={<RefreshCw size={14} />}
                            className="bg-[#FACC15]/10 border border-[#FACC15]/30 text-[#FACC15] font-black"
                        >
                            Relancer
                        </Button>
                    )}
                    {canResend && (
                        <Button
                            onPress={handleResend}
                            isLoading={busyAction === "resend"}
                            isDisabled={busyAction !== null}
                            startContent={<Webhook size={14} />}
                            className="bg-sky-500/10 border border-sky-500/30 text-sky-300 font-black"
                        >
                            Renvoyer webhook
                        </Button>
                    )}
                    <div className="ml-auto">
                        <Button
                            variant="flat"
                            onPress={onClose}
                            className="bg-[#1a1a1a] text-slate-300"
                        >
                            Fermer
                        </Button>
                    </div>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
};

interface DetailFieldProps {
    readonly label: string;
    readonly value: string;
}

const DetailField: React.FC<DetailFieldProps> = ({ label, value }) => (
    <div className="space-y-0.5">
        <p className="text-[10px] uppercase font-black tracking-widest text-slate-500">
            {label}
        </p>
        <p className="text-slate-200 font-semibold truncate">{value}</p>
    </div>
);

interface CopyRowProps {
    readonly label: string;
    readonly value: string;
    readonly secret?: boolean;
    readonly visible?: boolean;
    readonly onToggle?: () => void;
}

const CopyRow: React.FC<CopyRowProps> = ({
    label,
    value,
    secret,
    visible,
    onToggle,
}) => {
    const display = secret && !visible ? "•".repeat(Math.min(value.length, 12)) : value;
    return (
        <div className="flex-1 min-w-0 flex items-center gap-2 bg-[#0a0a0a] border border-[#262626] rounded-lg px-3 py-2">
            <div className="flex-1 min-w-0">
                <p className="text-[9px] uppercase font-black tracking-widest text-slate-500">
                    {label}
                </p>
                <p className="text-white text-sm font-mono truncate">
                    {display}
                </p>
            </div>
            {secret && onToggle && (
                <button
                    type="button"
                    onClick={onToggle}
                    className="shrink-0 size-8 rounded-md hover:bg-[#1a1a1a] flex items-center justify-center text-slate-400 hover:text-white"
                    aria-label={visible ? "Masquer" : "Afficher"}
                >
                    {visible ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
            )}
            <button
                type="button"
                onClick={() => copyToClipboard(value, label)}
                className="shrink-0 size-8 rounded-md hover:bg-[#1a1a1a] flex items-center justify-center text-slate-400 hover:text-[#FACC15]"
                aria-label="Copier"
            >
                <Copy size={14} />
            </button>
        </div>
    );
};

function formatDate(value: string | Date): string {
    try {
        const d = value instanceof Date ? value : new Date(value);
        return d.toLocaleString("fr-FR", {
            dateStyle: "short",
            timeStyle: "short",
        });
    } catch {
        return String(value);
    }
}

export default IptvLineDetailModal;
