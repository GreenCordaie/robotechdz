"use client";

import React, { useEffect, useState } from "react";
import { Pencil, Plus, Trash2, Power, PowerOff, Package, Inbox, CheckCircle2 } from "lucide-react";
import { toast } from "react-hot-toast";

import {
    deleteManualProductAction,
    listManualProductsAdminAction,
    listManualOrdersAdminAction,
    markManualOrderDeliveredAction,
    refundManualOrderAction,
    upsertManualProductAction,
    type ManualOrderRow,
    type ManualProductAdminRow,
} from "./actions";

function formatDzd(n: number): string {
    return new Intl.NumberFormat("fr-FR").format(n);
}

type Tab = "products" | "orders";

export default function AdminManualProductsPage() {
    const [tab, setTab] = useState<Tab>("orders");

    return (
        <main className="min-h-screen bg-[#0b0b0c] text-white">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <h1 className="text-3xl font-bold mb-1 flex items-center gap-3">
                    <Package size={28} />
                    Manual Delivery
                </h1>
                <p className="text-sm text-neutral-500 mb-6">
                    Catalogue de produits livrés manuellement par l&apos;équipe.
                </p>

                <div className="flex items-center gap-2 mb-6 border-b border-neutral-800">
                    <button
                        type="button"
                        onClick={() => setTab("orders")}
                        className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
                            tab === "orders"
                                ? "border-[#FACC15] text-white"
                                : "border-transparent text-neutral-500 hover:text-neutral-300"
                        }`}
                    >
                        <Inbox size={14} className="inline -mt-0.5 mr-1" />
                        Commandes
                    </button>
                    <button
                        type="button"
                        onClick={() => setTab("products")}
                        className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
                            tab === "products"
                                ? "border-[#FACC15] text-white"
                                : "border-transparent text-neutral-500 hover:text-neutral-300"
                        }`}
                    >
                        <Package size={14} className="inline -mt-0.5 mr-1" />
                        Produits
                    </button>
                </div>

                {tab === "orders" ? <OrdersTab /> : <ProductsTab />}
            </div>
        </main>
    );
}

// ─── Products tab ───────────────────────────────────────────────────────

function ProductsTab() {
    const [rows, setRows] = useState<ReadonlyArray<ManualProductAdminRow>>([]);
    const [editing, setEditing] = useState<ManualProductAdminRow | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const load = async () => {
        setIsLoading(true);
        const res = await listManualProductsAdminAction(undefined as never);
        if ("success" in res && res.success) setRows(res.data);
        setIsLoading(false);
    };

    useEffect(() => {
        void load();
    }, []);

    return (
        <>
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">{rows.length} produits</h2>
                <button
                    type="button"
                    onClick={() => setCreateOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#FACC15] hover:bg-[#FBD138] text-black rounded-lg font-semibold transition"
                >
                    <Plus size={16} />
                    Nouveau produit
                </button>
            </div>

            {isLoading ? (
                <div className="text-center text-sm text-neutral-500 py-12">
                    Chargement…
                </div>
            ) : rows.length === 0 ? (
                <div className="text-center text-sm text-neutral-500 py-12">
                    Aucun produit. Clique « Nouveau produit » pour démarrer.
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="text-left text-xs uppercase text-neutral-500 border-b border-neutral-800">
                            <tr>
                                <th className="px-4 py-3">Titre</th>
                                <th className="px-4 py-3">Catégorie</th>
                                <th className="px-4 py-3 text-right">Prix DZD</th>
                                <th className="px-4 py-3 text-center">Tri</th>
                                <th className="px-4 py-3 text-center">Actif</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.id} className="border-b border-neutral-900 hover:bg-neutral-900/50">
                                    <td className="px-4 py-3">
                                        <div className="font-semibold">{r.title}</div>
                                        {r.description && (
                                            <div className="text-[11px] text-neutral-500 truncate max-w-md">
                                                {r.description}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-neutral-400">{r.category ?? "—"}</td>
                                    <td className="px-4 py-3 text-right font-mono font-bold">
                                        {formatDzd(r.priceDzd)}
                                    </td>
                                    <td className="px-4 py-3 text-center text-neutral-500">{r.sortOrder}</td>
                                    <td className="px-4 py-3 text-center">
                                        {r.isActive ? (
                                            <Power size={14} className="inline text-emerald-400" />
                                        ) : (
                                            <PowerOff size={14} className="inline text-neutral-600" />
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <button
                                            type="button"
                                            onClick={() => setEditing(r)}
                                            className="px-2 py-1 text-neutral-400 hover:text-white"
                                            aria-label="Modifier"
                                        >
                                            <Pencil size={14} />
                                        </button>
                                        {r.isActive && (
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    if (!confirm(`Désactiver "${r.title}" ?`)) return;
                                                    const res = await deleteManualProductAction({ id: r.id });
                                                    if ("success" in res && res.success) {
                                                        toast.success("Désactivé");
                                                        await load();
                                                    } else {
                                                        toast.error("error" in res ? res.error : "Erreur");
                                                    }
                                                }}
                                                className="px-2 py-1 text-neutral-400 hover:text-red-400"
                                                aria-label="Désactiver"
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

            {(editing || createOpen) && (
                <ProductEditor
                    seed={editing}
                    onClose={() => {
                        setEditing(null);
                        setCreateOpen(false);
                    }}
                    onSaved={async () => {
                        setEditing(null);
                        setCreateOpen(false);
                        await load();
                    }}
                />
            )}
        </>
    );
}

function ProductEditor({
    seed,
    onClose,
    onSaved,
}: {
    seed: ManualProductAdminRow | null;
    onClose: () => void;
    onSaved: () => void | Promise<void>;
}) {
    const [title, setTitle] = useState(seed?.title ?? "");
    const [description, setDescription] = useState(seed?.description ?? "");
    const [category, setCategory] = useState(seed?.category ?? "");
    const [priceDzd, setPriceDzd] = useState(String(seed?.priceDzd ?? ""));
    const [imageUrl, setImageUrl] = useState(seed?.imageUrl ?? "");
    const [isActive, setIsActive] = useState(seed?.isActive ?? true);
    const [sortOrder, setSortOrder] = useState(String(seed?.sortOrder ?? 100));
    const [submitting, setSubmitting] = useState(false);

    return (
        <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            onClick={onClose}
        >
            <div
                className="w-full max-w-lg rounded-2xl bg-neutral-950 border border-neutral-800 p-6"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-lg font-semibold mb-4">
                    {seed ? "Modifier le produit" : "Nouveau produit"}
                </h2>

                <div className="space-y-3">
                    <Field label="Titre">
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-sm focus:outline-none focus:border-[#FACC15]"
                        />
                    </Field>
                    <Field label="Description (optionnel)">
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-sm focus:outline-none focus:border-[#FACC15] resize-none"
                        />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Catégorie (optionnel)">
                            <input
                                type="text"
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                className="w-full px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-sm focus:outline-none focus:border-[#FACC15]"
                            />
                        </Field>
                        <Field label="Prix DZD">
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={priceDzd}
                                onChange={(e) => setPriceDzd(e.target.value)}
                                className="w-full px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-sm focus:outline-none focus:border-[#FACC15]"
                            />
                        </Field>
                    </div>
                    <Field label="Image URL (optionnel)">
                        <input
                            type="url"
                            value={imageUrl}
                            onChange={(e) => setImageUrl(e.target.value)}
                            className="w-full px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-sm focus:outline-none focus:border-[#FACC15]"
                        />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Tri (0-9999)">
                            <input
                                type="number"
                                min="0"
                                max="10000"
                                value={sortOrder}
                                onChange={(e) => setSortOrder(e.target.value)}
                                className="w-full px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-sm focus:outline-none focus:border-[#FACC15]"
                            />
                        </Field>
                        <Field label="Actif">
                            <label className="inline-flex items-center gap-2 cursor-pointer mt-2">
                                <input
                                    type="checkbox"
                                    checked={isActive}
                                    onChange={(e) => setIsActive(e.target.checked)}
                                    className="w-4 h-4 accent-[#FACC15]"
                                />
                                <span className="text-sm">{isActive ? "Visible" : "Masqué"}</span>
                            </label>
                        </Field>
                    </div>
                </div>

                <div className="flex gap-3 justify-end mt-6">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-neutral-300 hover:text-white transition"
                    >
                        Annuler
                    </button>
                    <button
                        type="button"
                        disabled={submitting}
                        onClick={async () => {
                            const priceNum = parseFloat(priceDzd);
                            if (!title.trim() || !Number.isFinite(priceNum) || priceNum < 0) {
                                toast.error("Titre + prix valide requis");
                                return;
                            }
                            setSubmitting(true);
                            const res = await upsertManualProductAction({
                                id: seed?.id,
                                title: title.trim(),
                                description,
                                category,
                                priceDzd: priceNum,
                                imageUrl,
                                isActive,
                                sortOrder: parseInt(sortOrder, 10) || 100,
                            });
                            setSubmitting(false);
                            if ("success" in res && res.success) {
                                toast.success(seed ? "Mis à jour" : "Créé");
                                await onSaved();
                            } else {
                                toast.error("error" in res ? res.error : "Erreur");
                            }
                        }}
                        className="px-5 py-2 rounded-lg bg-[#FACC15] hover:bg-[#FBD138] text-black font-semibold transition disabled:opacity-60"
                    >
                        {submitting ? "Enregistrement…" : "Enregistrer"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="block text-xs text-neutral-500 mb-1">{label}</label>
            {children}
        </div>
    );
}

// ─── Orders tab ─────────────────────────────────────────────────────────

function OrdersTab() {
    const [filter, setFilter] = useState<"PENDING_DELIVERY" | "ALL">("PENDING_DELIVERY");
    const [rows, setRows] = useState<ReadonlyArray<ManualOrderRow>>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [delivering, setDelivering] = useState<ManualOrderRow | null>(null);

    const load = async () => {
        setIsLoading(true);
        const res = await listManualOrdersAdminAction({ status: filter, limit: 100 });
        if ("success" in res && res.success) setRows(res.data);
        setIsLoading(false);
    };

    useEffect(() => {
        void load();
    }, [filter]);

    return (
        <>
            <div className="flex items-center justify-between mb-4">
                <div className="inline-flex rounded-lg border border-neutral-800 overflow-hidden">
                    {(["PENDING_DELIVERY", "ALL"] as const).map((s) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => setFilter(s)}
                            className={`px-3 py-1.5 text-xs ${
                                filter === s ? "bg-[#FACC15] text-black font-semibold" : "text-neutral-300 hover:bg-neutral-900"
                            }`}
                        >
                            {s === "PENDING_DELIVERY" ? "En attente" : "Toutes"}
                        </button>
                    ))}
                </div>
                <button
                    type="button"
                    onClick={load}
                    className="text-xs text-neutral-400 hover:text-white"
                >
                    🔄 Rafraîchir
                </button>
            </div>

            {isLoading ? (
                <div className="text-center text-sm text-neutral-500 py-12">Chargement…</div>
            ) : rows.length === 0 ? (
                <div className="text-center text-sm text-neutral-500 py-12">Aucune commande.</div>
            ) : (
                <div className="space-y-3">
                    {rows.map((r) => (
                        <div
                            key={r.id}
                            className="rounded-xl bg-neutral-900 border border-neutral-800 p-4"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-semibold">{r.productTitle}</span>
                                        <StatusPill status={r.status} />
                                    </div>
                                    <div className="text-[11px] text-neutral-500 mb-2">
                                        {r.orderNumber} · {r.resellerName ?? "Reseller inconnu"}{" "}
                                        {r.resellerPhone && `(${r.resellerPhone})`} ·{" "}
                                        {new Date(r.createdAt).toLocaleString("fr-FR")}
                                    </div>
                                    {r.customerPhone && (
                                        <div className="text-sm">
                                            <span className="text-neutral-500">Client :</span>{" "}
                                            <span className="font-mono">{r.customerPhone}</span>
                                        </div>
                                    )}
                                    {r.customerNote && (
                                        <div className="text-sm mt-1 text-neutral-300">
                                            <span className="text-neutral-500">Note :</span>{" "}
                                            {r.customerNote}
                                        </div>
                                    )}
                                    {r.deliveryNote && (
                                        <div className="text-sm mt-1 text-emerald-300">
                                            <span className="text-emerald-500">Livraison :</span>{" "}
                                            {r.deliveryNote}
                                        </div>
                                    )}
                                </div>
                                <div className="text-right">
                                    <div className="text-lg font-bold mb-2">
                                        {formatDzd(r.pricePaidDzd)} DZD
                                    </div>
                                    {r.status === "PENDING_DELIVERY" && (
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setDelivering(r)}
                                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition"
                                            >
                                                <CheckCircle2 size={12} />
                                                Livrer
                                            </button>
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    const reason = prompt("Raison du remboursement ?");
                                                    if (reason == null) return;
                                                    const res = await refundManualOrderAction({
                                                        id: r.id,
                                                        reason,
                                                    });
                                                    if ("success" in res && res.success) {
                                                        toast.success("Remboursé");
                                                        await load();
                                                    } else {
                                                        toast.error("error" in res ? res.error : "Erreur");
                                                    }
                                                }}
                                                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs font-semibold transition"
                                            >
                                                Rembourser
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {delivering && (
                <DeliverModal
                    row={delivering}
                    onClose={() => setDelivering(null)}
                    onDone={async () => {
                        setDelivering(null);
                        await load();
                    }}
                />
            )}
        </>
    );
}

function StatusPill({ status }: { status: ManualOrderRow["status"] }) {
    const map: Record<ManualOrderRow["status"], { label: string; cls: string }> = {
        PENDING_DELIVERY: { label: "En attente", cls: "bg-amber-500/10 text-amber-300 border-amber-500/30" },
        DELIVERED: { label: "Livré", cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" },
        CANCELLED: { label: "Annulé", cls: "bg-neutral-700/30 text-neutral-400 border-neutral-700" },
        REFUNDED: { label: "Remboursé", cls: "bg-red-500/10 text-red-300 border-red-500/30" },
    };
    const { label, cls } = map[status];
    return (
        <span className={`text-[10px] uppercase font-bold tracking-wider border px-2 py-0.5 rounded ${cls}`}>
            {label}
        </span>
    );
}

function DeliverModal({
    row,
    onClose,
    onDone,
}: {
    row: ManualOrderRow;
    onClose: () => void;
    onDone: () => void | Promise<void>;
}) {
    const [note, setNote] = useState("");
    const [submitting, setSubmitting] = useState(false);
    return (
        <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            onClick={onClose}
        >
            <div
                className="w-full max-w-md rounded-2xl bg-neutral-950 border border-neutral-800 p-6"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 className="text-lg font-semibold mb-1">Marquer livré</h3>
                <p className="text-sm text-neutral-500 mb-4">
                    {row.productTitle} — {formatDzd(row.pricePaidDzd)} DZD
                </p>
                <Field label="Note de livraison (code, identifiant, lien, message…)">
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={4}
                        className="w-full px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-sm focus:outline-none focus:border-[#FACC15] resize-none"
                        placeholder="Saisis ici ce que tu viens d&apos;envoyer au reseller / client"
                    />
                </Field>
                <div className="flex gap-3 justify-end mt-6">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-neutral-300 hover:text-white transition"
                    >
                        Annuler
                    </button>
                    <button
                        type="button"
                        disabled={submitting}
                        onClick={async () => {
                            setSubmitting(true);
                            const res = await markManualOrderDeliveredAction({
                                id: row.id,
                                deliveryNote: note,
                            });
                            setSubmitting(false);
                            if ("success" in res && res.success) {
                                toast.success("Livré");
                                await onDone();
                            } else {
                                toast.error("error" in res ? res.error : "Erreur");
                            }
                        }}
                        className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition disabled:opacity-60"
                    >
                        {submitting ? "Enregistrement…" : "Confirmer livraison"}
                    </button>
                </div>
            </div>
        </div>
    );
}
