"use client";

import React, { useState, useEffect } from "react";
import { Plus, Trash2, Copy, Eye, EyeOff, Key } from "lucide-react";
import { toast } from "react-hot-toast";
import { createApiKeyAction, revokeApiKeyAction, listApiKeysAction } from "@/app/admin/settings/actions";

interface ApiKeyRecord {
    id: number;
    name: string;
    permissions: string;
    isActive: boolean;
    createdAt: string | Date;
    lastUsedAt: string | Date | null;
    callsThisMonth: number;
    keyPrefix: string;
}

export default function ApiKeysSection() {
    const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [showForm, setShowForm] = useState(false);

    // Form state
    const [newKeyName, setNewKeyName] = useState("");
    const [newKeyPermissions, setNewKeyPermissions] = useState<"READ" | "READ_WRITE">("READ");

    // Generated key modal
    const [generatedKey, setGeneratedKey] = useState<string | null>(null);
    const [showKey, setShowKey] = useState(false);

    useEffect(() => {
        loadKeys();
    }, []);

    async function loadKeys() {
        setIsLoading(true);
        try {
            const res = await listApiKeysAction({});
            if (res && "success" in res && res.success && "data" in res) {
                setKeys((res.data as ApiKeyRecord[]) || []);
            }
        } catch {
            toast.error("Erreur lors du chargement des clés API");
        } finally {
            setIsLoading(false);
        }
    }

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        if (!newKeyName.trim()) {
            toast.error("Le nom est requis");
            return;
        }
        setIsCreating(true);
        try {
            const res = await createApiKeyAction({ name: newKeyName.trim(), permissions: newKeyPermissions });
            if (res && "success" in res && res.success && "data" in res) {
                const rawData = res.data as { key: string; record: Omit<ApiKeyRecord, "keyPrefix"> & { keyHash?: string } };
                const data = {
                    key: rawData.key,
                    record: { ...rawData.record, keyPrefix: (rawData.record.keyHash?.slice(0, 8) ?? "rbt_????") + "..." } as ApiKeyRecord,
                };
                setGeneratedKey(data.key);
                setShowKey(false);
                setShowForm(false);
                setNewKeyName("");
                setNewKeyPermissions("READ");
                await loadKeys();
                toast.success("Clé API créée avec succès");
            } else {
                toast.error("error" in res ? String(res.error) : "Erreur lors de la création");
            }
        } catch {
            toast.error("Erreur lors de la création de la clé API");
        } finally {
            setIsCreating(false);
        }
    }

    async function handleRevoke(id: number) {
        if (!confirm("Révoquer cette clé API ? Cette action est irréversible.")) return;
        try {
            const res = await revokeApiKeyAction({ id });
            if (res && "success" in res && res.success) {
                toast.success("Clé API révoquée");
                await loadKeys();
            } else {
                toast.error("Erreur lors de la révocation");
            }
        } catch {
            toast.error("Erreur lors de la révocation de la clé API");
        }
    }

    function copyToClipboard(text: string) {
        navigator.clipboard.writeText(text).then(() => {
            toast.success("Clé copiée dans le presse-papiers");
        }).catch(() => {
            toast.error("Impossible de copier");
        });
    }

    function formatDate(d: string | Date | null) {
        if (!d) return "Jamais";
        return new Date(d).toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-[var(--primary)]/10 rounded-xl">
                        <Key className="text-[var(--primary)] w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-base font-black text-white uppercase tracking-tight">Clés API Partenaires</h3>
                        <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                            Gestion des accès API externes
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] hover:bg-[#d4510f] text-white text-xs font-black uppercase rounded-xl transition-colors"
                >
                    <Plus size={14} />
                    Créer une clé
                </button>
            </div>

            {/* Create form */}
            {showForm && (
                <div className="p-6 bg-black/40 rounded-3xl border border-white/10 space-y-4">
                    <h4 className="text-sm font-black text-white uppercase tracking-widest">Nouvelle clé API</h4>
                    <form onSubmit={handleCreate} className="space-y-4">
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">
                                Nom du partenaire
                            </label>
                            <input
                                type="text"
                                value={newKeyName}
                                onChange={(e) => setNewKeyName(e.target.value)}
                                placeholder="ex: Partenaire XYZ"
                                maxLength={100}
                                required
                                className="w-full bg-black/60 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-[var(--primary)]/50 transition-all placeholder:text-slate-700"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">
                                Permissions
                            </label>
                            <select
                                value={newKeyPermissions}
                                onChange={(e) => setNewKeyPermissions(e.target.value as "READ" | "READ_WRITE")}
                                className="w-full bg-black/60 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-[var(--primary)]/50 transition-all"
                            >
                                <option value="READ">READ — Lecture seule (catalogue)</option>
                                <option value="READ_WRITE">READ_WRITE — Lecture + Commandes</option>
                            </select>
                        </div>
                        <div className="flex gap-3">
                            <button
                                type="submit"
                                disabled={isCreating}
                                className="flex-1 py-3 bg-[var(--primary)] hover:bg-[#d4510f] disabled:opacity-50 text-white text-xs font-black uppercase rounded-2xl transition-colors"
                            >
                                {isCreating ? "Création..." : "Créer la clé"}
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowForm(false)}
                                className="px-6 py-3 bg-white/5 hover:bg-white/10 text-white text-xs font-black uppercase rounded-2xl transition-colors"
                            >
                                Annuler
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Generated key modal */}
            {generatedKey && (
                <div className="p-6 bg-amber-950/30 rounded-3xl border border-amber-500/30 space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-500/10 rounded-xl">
                            <Key className="text-amber-400 w-5 h-5" />
                        </div>
                        <div>
                            <h4 className="text-sm font-black text-amber-400 uppercase">Clé générée — Copiez-la maintenant !</h4>
                            <p className="text-amber-600/80 text-[10px] font-bold uppercase tracking-wider mt-0.5">
                                Cette clé ne sera plus visible après fermeture de cet encadré
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 p-4 bg-black/60 rounded-2xl border border-amber-500/20">
                        <code className="flex-1 text-amber-300 text-xs font-mono break-all">
                            {showKey ? generatedKey : "rbt_" + "•".repeat(generatedKey.length - 4)}
                        </code>
                        <button
                            onClick={() => setShowKey(!showKey)}
                            className="p-2 text-slate-400 hover:text-white transition-colors"
                        >
                            {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                        <button
                            onClick={() => copyToClipboard(generatedKey)}
                            className="p-2 text-slate-400 hover:text-amber-400 transition-colors"
                        >
                            <Copy size={16} />
                        </button>
                    </div>
                    <button
                        onClick={() => setGeneratedKey(null)}
                        className="w-full py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-black uppercase rounded-2xl transition-colors border border-amber-500/20"
                    >
                        J&apos;ai copié la clé — Fermer
                    </button>
                </div>
            )}

            {/* Keys table */}
            {isLoading ? (
                <div className="text-center py-8 text-slate-500 text-sm">Chargement...</div>
            ) : keys.length === 0 ? (
                <div className="text-center py-8 text-slate-600 text-sm font-bold">
                    Aucune clé API créée.
                </div>
            ) : (
                <div className="overflow-x-auto rounded-3xl border border-white/5">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-white/5">
                                <th className="text-left py-4 px-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Nom</th>
                                <th className="text-left py-4 px-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Permissions</th>
                                <th className="text-left py-4 px-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Statut</th>
                                <th className="text-left py-4 px-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Dernière utilisation</th>
                                <th className="text-left py-4 px-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Appels (mois)</th>
                                <th className="text-right py-4 px-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {keys.map((k) => (
                                <tr key={k.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                                    <td className="py-4 px-5">
                                        <div className="font-bold text-white text-xs">{k.name}</div>
                                        <div className="text-[10px] text-slate-600 font-mono mt-0.5">{k.keyPrefix}</div>
                                    </td>
                                    <td className="py-4 px-5">
                                        <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${k.permissions === "READ_WRITE" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" : "bg-slate-500/10 text-slate-400 border border-slate-500/20"}`}>
                                            {k.permissions}
                                        </span>
                                    </td>
                                    <td className="py-4 px-5">
                                        <span className={`flex items-center gap-1.5 w-fit px-2 py-1 rounded-full text-[10px] font-black uppercase ${k.isActive ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${k.isActive ? "bg-emerald-400 animate-pulse" : "bg-red-500"}`} />
                                            {k.isActive ? "Active" : "Révoquée"}
                                        </span>
                                    </td>
                                    <td className="py-4 px-5 text-xs text-slate-400">{formatDate(k.lastUsedAt)}</td>
                                    <td className="py-4 px-5 text-xs text-slate-400 font-mono">{k.callsThisMonth}</td>
                                    <td className="py-4 px-5 text-right">
                                        {k.isActive && (
                                            <button
                                                onClick={() => handleRevoke(k.id)}
                                                className="p-2 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
                                                title="Révoquer cette clé"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
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
