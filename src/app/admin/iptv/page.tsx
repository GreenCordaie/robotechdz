"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Tv, RefreshCw, CheckCircle, XCircle, Clock, Copy, ExternalLink, User, Phone, Hash, Calendar, AlertTriangle, Loader2, Wifi } from "lucide-react";
import { toast } from "react-hot-toast";
import { getIptvProvisions, retryIptvProvisionAction, resendWebhookAction, cancelIptvOrderAction, manualCredentialEntryAction, renewIptvAction } from "./actions";

interface Screen {
    screenNumber: number;
    username: string;
    password: string;
    m3uUrl?: string;
    epgUrl?: string;
    expiresAt?: string;
}

interface Provision {
    id: number;
    taskId: string;
    loadbrainSlug: string;
    status: string;
    error?: string | null;
    errorCode?: string | null;
    credentials?: { screens: Screen[] } | null;
    completedAt?: string | null;
    createdAt: string;
    order: {
        id: number;
        orderNumber: string;
        status: string;
        customerPhone?: string;
        client?: { nomComplet: string; telephone?: string } | null;
    };
    variant: { name: string; product: string };
}

function StatusBadge({ status }: { status: string }) {
    const map: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
        queued: { color: "bg-amber-500/10 text-amber-400 border-amber-500/20", icon: <Clock className="w-3 h-3" />, label: "En attente" },
        processing: { color: "bg-blue-500/10 text-blue-400 border-blue-500/20", icon: <Loader2 className="w-3 h-3 animate-spin" />, label: "En cours" },
        completed: { color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: <CheckCircle className="w-3 h-3" />, label: "Actif" },
        failed: { color: "bg-red-500/10 text-red-400 border-red-500/20", icon: <XCircle className="w-3 h-3" />, label: "Échoué" },
        cancelled: { color: "bg-slate-500/10 text-slate-400 border-slate-500/20", icon: <XCircle className="w-3 h-3" />, label: "Annulé" },
    };
    const s = map[status] || map.queued;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${s.color}`}>
            {s.icon} {s.label}
        </span>
    );
}

function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Copié !");
}

function CredentialCard({ screen, expiresAt }: { screen: Screen; expiresAt?: string | null }) {
    const [showPass, setShowPass] = useState(false);

    return (
        <div className="bg-black/30 border border-white/5 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Écran {screen.screenNumber}</span>
                {(expiresAt || screen.expiresAt) && (
                    <span className="text-[10px] text-slate-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Expire: {new Date(expiresAt || screen.expiresAt!).toLocaleDateString('fr-FR')}
                    </span>
                )}
            </div>

            <div className="grid grid-cols-2 gap-2">
                <div>
                    <span className="text-[9px] text-slate-600 uppercase">Utilisateur</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <code className="text-xs text-emerald-400 font-mono">{screen.username}</code>
                        <button onClick={() => copyToClipboard(screen.username)} className="text-slate-600 hover:text-white"><Copy className="w-3 h-3" /></button>
                    </div>
                </div>
                <div>
                    <span className="text-[9px] text-slate-600 uppercase">Mot de passe</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <code className="text-xs text-amber-400 font-mono cursor-pointer" onClick={() => setShowPass(!showPass)}>
                            {showPass ? screen.password : "••••••"}
                        </code>
                        <button onClick={() => copyToClipboard(screen.password)} className="text-slate-600 hover:text-white"><Copy className="w-3 h-3" /></button>
                    </div>
                </div>
            </div>

            {screen.m3uUrl && (
                <div>
                    <span className="text-[9px] text-slate-600 uppercase">M3U URL</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <code className="text-[10px] text-blue-400 font-mono truncate max-w-[300px]">{screen.m3uUrl}</code>
                        <button onClick={() => copyToClipboard(screen.m3uUrl!)} className="text-slate-600 hover:text-white shrink-0"><Copy className="w-3 h-3" /></button>
                        <a href={screen.m3uUrl} target="_blank" rel="noopener" className="text-slate-600 hover:text-white shrink-0"><ExternalLink className="w-3 h-3" /></a>
                    </div>
                </div>
            )}

            {screen.epgUrl && (
                <div>
                    <span className="text-[9px] text-slate-600 uppercase">EPG URL</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <code className="text-[10px] text-violet-400 font-mono truncate max-w-[300px]">{screen.epgUrl}</code>
                        <button onClick={() => copyToClipboard(screen.epgUrl!)} className="text-slate-600 hover:text-white shrink-0"><Copy className="w-3 h-3" /></button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function IptvPage() {
    const [provisions, setProvisions] = useState<Provision[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<"all" | "completed" | "pending" | "failed">("all");

    const refresh = useCallback(async () => {
        setLoading(true);
        const res: any = await getIptvProvisions({});
        if (res.success) setProvisions(res.provisions);
        setLoading(false);
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const [manualEntry, setManualEntry] = useState<number | null>(null);
    const [manualForm, setManualForm] = useState({ username: "", password: "", m3uUrl: "", epgUrl: "" });

    const handleRetry = async (provisionId: number) => {
        const res: any = await retryIptvProvisionAction({ provisionId });
        if (res.success) { toast.success("Provisioning relancé"); refresh(); }
        else toast.error(res.error || "Erreur");
    };

    const handleResendWebhook = async (taskId: string) => {
        const res: any = await resendWebhookAction({ taskId });
        if (res.success) { toast.success("Webhook renvoyé"); refresh(); }
        else toast.error(res.error || "Erreur");
    };

    const handleCancel = async (orderNumber: string, provisionId: number) => {
        if (!confirm("Annuler cette provision IPTV ?")) return;
        const res: any = await cancelIptvOrderAction({ orderNumber, provisionId });
        if (res.success) { toast.success("Provision annulée"); refresh(); }
        else toast.error(res.error || "Erreur");
    };

    const handleManualEntry = async (provisionId: number) => {
        if (!manualForm.username || !manualForm.password) { toast.error("Username et password requis"); return; }
        const res: any = await manualCredentialEntryAction({ provisionId, ...manualForm });
        if (res.success) { toast.success("Credentials enregistrées"); setManualEntry(null); setManualForm({ username: "", password: "", m3uUrl: "", epgUrl: "" }); refresh(); }
        else toast.error(res.error || "Erreur");
    };

    const handleRenew = async (taskId: string, provisionId: number) => {
        if (!confirm("Renouveler cet abonnement IPTV ?")) return;
        const res: any = await renewIptvAction({ taskId, provisionId });
        if (res.success) { toast.success("Renouvellement lancé"); refresh(); }
        else toast.error(res.error || "Erreur");
    };

    const filtered = provisions.filter(p => {
        if (filter === "all") return true;
        if (filter === "completed") return p.status === "completed";
        if (filter === "pending") return p.status === "queued" || p.status === "processing";
        if (filter === "failed") return p.status === "failed";
        return true;
    });

    const counts = {
        all: provisions.length,
        completed: provisions.filter(p => p.status === "completed").length,
        pending: provisions.filter(p => p.status === "queued" || p.status === "processing").length,
        failed: provisions.filter(p => p.status === "failed").length,
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
                        <div className="p-2.5 bg-cyan-500/10 rounded-2xl">
                            <Tv className="w-6 h-6 text-cyan-400" />
                        </div>
                        IPTV
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">{provisions.length} ligne(s) provisionnée(s)</p>
                </div>
                <button onClick={refresh} className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-2 rounded-xl transition-colors">
                    <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                    Actualiser
                </button>
            </div>

            {/* Filters */}
            <div className="flex gap-2">
                {(["all", "completed", "pending", "failed"] as const).map((f) => {
                    const labels = { all: "Tout", completed: "Actifs", pending: "En attente", failed: "Échoués" };
                    const isActive = filter === f;
                    return (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${isActive ? "bg-[var(--primary)] text-white" : "bg-white/5 text-slate-400 hover:bg-white/10"}`}
                        >
                            {labels[f]} ({counts[f]})
                        </button>
                    );
                })}
            </div>

            {/* Cards */}
            {loading ? (
                <div className="text-center py-12 text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Chargement...
                </div>
            ) : filtered.length === 0 ? (
                <div className="bg-[#161616] border border-white/5 rounded-2xl p-12 text-center">
                    <Wifi className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                    <p className="text-sm text-slate-500">Aucune ligne IPTV {filter !== "all" ? `(${filter})` : ""}</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {filtered.map((p) => (
                        <div key={p.id} className="bg-[#161616] border border-white/5 rounded-2xl overflow-hidden">
                            {/* Header */}
                            <div className="p-4 flex items-center justify-between border-b border-white/5">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className={`p-2 rounded-xl shrink-0 ${p.status === "completed" ? "bg-emerald-500/10" : p.status === "failed" ? "bg-red-500/10" : "bg-amber-500/10"}`}>
                                        <Tv className={`w-4 h-4 ${p.status === "completed" ? "text-emerald-400" : p.status === "failed" ? "text-red-400" : "text-amber-400"}`} />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-bold text-white">{p.variant.product}</span>
                                            <span className="text-xs text-slate-500">—</span>
                                            <span className="text-xs text-slate-400">{p.variant.name}</span>
                                            <StatusBadge status={p.status} />
                                        </div>
                                        <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500">
                                            <span className="flex items-center gap-1"><Hash className="w-3 h-3" />{p.order.orderNumber}</span>
                                            {p.order.client && <span className="flex items-center gap-1"><User className="w-3 h-3" />{p.order.client.nomComplet}</span>}
                                            {(p.order.customerPhone || p.order.client?.telephone) && (
                                                <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{p.order.customerPhone || p.order.client?.telephone}</span>
                                            )}
                                            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(p.createdAt).toLocaleString('fr-FR')}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    {p.status === "failed" && (
                                        <>
                                            <button onClick={() => handleRetry(p.id)} className="flex items-center gap-1 text-[10px] font-bold text-violet-400 bg-violet-500/10 hover:bg-violet-500/20 px-2.5 py-1.5 rounded-lg border border-violet-500/20 transition-colors">
                                                <RefreshCw className="w-3 h-3" /> Relancer
                                            </button>
                                            <button onClick={() => setManualEntry(manualEntry === p.id ? null : p.id)} className="flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 px-2.5 py-1.5 rounded-lg border border-amber-500/20 transition-colors">
                                                <span className="material-symbols-outlined !text-[12px]">edit</span> Manuel
                                            </button>
                                        </>
                                    )}
                                    {p.status === "completed" && !p.taskId.startsWith("dispatch-failed") && (
                                        <>
                                            <button onClick={() => handleResendWebhook(p.taskId)} className="flex items-center gap-1 text-[10px] font-bold text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 px-2.5 py-1.5 rounded-lg border border-blue-500/20 transition-colors">
                                                <Wifi className="w-3 h-3" /> Webhook
                                            </button>
                                            <button onClick={() => handleRenew(p.taskId, p.id)} className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1.5 rounded-lg border border-emerald-500/20 transition-colors">
                                                <RefreshCw className="w-3 h-3" /> Renouveler
                                            </button>
                                        </>
                                    )}
                                    {(p.status === "queued" || p.status === "processing") && (
                                        <button onClick={() => handleCancel(p.order.orderNumber, p.id)} className="flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-500/10 hover:bg-red-500/20 px-2.5 py-1.5 rounded-lg border border-red-500/20 transition-colors">
                                            <XCircle className="w-3 h-3" /> Annuler
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Error */}
                            {p.status === "failed" && p.error && (
                                <div className="px-4 py-2 bg-red-500/5 border-b border-white/5 flex items-center gap-2">
                                    <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                    <span className="text-xs text-red-400">{p.error}</span>
                                    {p.errorCode && <code className="text-[10px] text-red-500/60 font-mono">({p.errorCode})</code>}
                                </div>
                            )}

                            {/* Manual Entry Form */}
                            {manualEntry === p.id && (
                                <div className="px-4 py-3 bg-amber-500/5 border-b border-white/5 space-y-3">
                                    <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Saisie manuelle des credentials</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        <input className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white font-mono" placeholder="Username *" value={manualForm.username} onChange={e => setManualForm(f => ({ ...f, username: e.target.value }))} />
                                        <input className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white font-mono" placeholder="Password *" value={manualForm.password} onChange={e => setManualForm(f => ({ ...f, password: e.target.value }))} />
                                        <input className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white font-mono" placeholder="M3U URL" value={manualForm.m3uUrl} onChange={e => setManualForm(f => ({ ...f, m3uUrl: e.target.value }))} />
                                        <input className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white font-mono" placeholder="EPG URL" value={manualForm.epgUrl} onChange={e => setManualForm(f => ({ ...f, epgUrl: e.target.value }))} />
                                    </div>
                                    <div className="flex gap-2 justify-end">
                                        <button onClick={() => setManualEntry(null)} className="text-[10px] text-slate-400 px-3 py-1.5">Annuler</button>
                                        <button onClick={() => handleManualEntry(p.id)} className="text-[10px] font-bold text-white bg-amber-500 hover:bg-amber-600 px-4 py-1.5 rounded-lg transition-colors">Enregistrer</button>
                                    </div>
                                </div>
                            )}

                            {/* Credentials */}
                            {p.status === "completed" && p.credentials?.screens && (
                                <div className="p-4 space-y-3">
                                    {p.credentials.screens.map((screen, i) => (
                                        <CredentialCard key={i} screen={screen} expiresAt={p.completedAt} />
                                    ))}
                                </div>
                            )}

                            {/* Pending */}
                            {(p.status === "queued" || p.status === "processing") && (
                                <div className="p-4 flex items-center gap-3 text-amber-400 text-xs">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Provisioning en cours... Les credentials apparaîtront automatiquement.
                                </div>
                            )}

                            {/* Footer */}
                            <div className="px-4 py-2 bg-black/20 border-t border-white/5 flex items-center justify-between">
                                <span className="text-[10px] text-slate-600 font-mono">Task: {p.taskId.slice(0, 8)}...</span>
                                <span className="text-[10px] text-slate-600 font-mono">{p.loadbrainSlug}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
