"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search, HandCoins, Sparkles, AlertTriangle, CheckCircle2 } from "lucide-react";

import {
    listManualProductsAction,
    purchaseManualProductAction,
    type ManualProductRow,
} from "./actions";

function formatDzd(amount: number): string {
    return new Intl.NumberFormat("fr-FR").format(amount);
}

export default function ResellerManualDeliveryPage() {
    const router = useRouter();
    const [rawQuery, setRawQuery] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");
    const [items, setItems] = useState<ReadonlyArray<ManualProductRow>>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Purchase modal state
    const [selected, setSelected] = useState<ManualProductRow | null>(null);
    const [customerPhone, setCustomerPhone] = useState("");
    const [customerNote, setCustomerNote] = useState("");
    const [isBuying, setIsBuying] = useState(false);
    const [purchaseResult, setPurchaseResult] = useState<
        | { kind: "success"; orderNumber: string }
        | { kind: "error"; message: string }
        | null
    >(null);

    useEffect(() => {
        const t = setTimeout(() => setDebouncedQuery(rawQuery.trim().toLowerCase()), 200);
        return () => clearTimeout(t);
    }, [rawQuery]);

    useEffect(() => {
        let active = true;
        setIsLoading(true);
        listManualProductsAction().then((res) => {
            if (!active) return;
            if (res.ok) setItems(res.items);
            setIsLoading(false);
        });
        return () => {
            active = false;
        };
    }, []);

    const filtered = items.filter((row) => {
        if (!debouncedQuery) return true;
        const q = debouncedQuery;
        return (
            row.title.toLowerCase().includes(q) ||
            (row.description ?? "").toLowerCase().includes(q) ||
            (row.category ?? "").toLowerCase().includes(q)
        );
    });

    return (
        <main className="min-h-screen bg-black text-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* ─── Header ─────────────────────────────────────────── */}
                <button
                    type="button"
                    onClick={() => router.push("/reseller/shop")}
                    className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition mb-6"
                >
                    <ArrowLeft size={16} />
                    Retour aux catégories
                </button>

                <div className="flex items-center gap-3 mb-2">
                    <HandCoins size={28} className="text-[#FACC15]" />
                    <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                        Manual Delivery
                    </h1>
                </div>
                <p className="text-sm text-neutral-400 mb-1">
                    {isLoading
                        ? "Chargement…"
                        : `${filtered.length} produit${filtered.length > 1 ? "s" : ""}${debouncedQuery ? ` pour « ${debouncedQuery} »` : ""}`}
                </p>
                <p className="text-xs text-neutral-500 mb-8">
                    Commandes traitées manuellement par notre équipe — réponse
                    dans les minutes qui suivent.
                </p>

                {/* ─── Search ─────────────────────────────────────────── */}
                <div className="relative mb-6">
                    <Search
                        size={18}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none"
                    />
                    <input
                        type="text"
                        value={rawQuery}
                        onChange={(e) => setRawQuery(e.target.value)}
                        placeholder="Rechercher un produit…"
                        className="w-full pl-12 pr-4 py-3 bg-neutral-900 border border-neutral-800 rounded-xl text-white placeholder:text-neutral-500 focus:outline-none focus:border-[#FACC15] transition"
                    />
                </div>

                {/* ─── Rows ──────────────────────────────────────────── */}
                {isLoading ? (
                    <div className="mt-12 text-center text-sm text-neutral-500">
                        Chargement du catalogue…
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="mt-12 flex flex-col items-center justify-center text-center px-6 py-16 rounded-2xl border border-dashed border-neutral-800 bg-neutral-950">
                        <div className="w-16 h-16 rounded-full bg-[#FACC15]/10 flex items-center justify-center mb-4">
                            <Sparkles size={28} className="text-[#FACC15]" />
                        </div>
                        <h2 className="text-xl font-semibold mb-2">
                            {debouncedQuery
                                ? "Aucun résultat"
                                : "Aucun produit disponible"}
                        </h2>
                        <p className="text-sm text-neutral-400 max-w-md">
                            {debouncedQuery
                                ? "Essayez une autre recherche."
                                : "Le chef ajoute régulièrement de nouveaux produits ici. Revenez plus tard."}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filtered.map((row) => (
                            <button
                                key={row.id}
                                type="button"
                                onClick={() => {
                                    setSelected(row);
                                    setCustomerPhone("");
                                    setCustomerNote("");
                                    setPurchaseResult(null);
                                }}
                                className="w-full flex items-center justify-between gap-4 px-5 py-4 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-[#FACC15]/40 hover:bg-neutral-900/80 transition text-left"
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[#FACC15] font-semibold">Manual</span>
                                        <span className="text-neutral-500">·</span>
                                        <span className="font-semibold truncate">{row.title}</span>
                                    </div>
                                    <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-500">
                                        <span className="font-mono uppercase text-cyan-400/80">ROBOTECHDZ</span>
                                        {row.category && (
                                            <>
                                                <span>·</span>
                                                <span>{row.category}</span>
                                            </>
                                        )}
                                        {row.description && (
                                            <>
                                                <span>·</span>
                                                <span className="truncate max-w-md">{row.description}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-1 shrink-0">
                                    <span className="text-lg font-bold text-white">
                                        {formatDzd(row.priceDzd)} DZD
                                    </span>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* ─── Purchase modal ─────────────────────────────────── */}
            {selected && (
                <div
                    role="dialog"
                    aria-modal="true"
                    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4"
                    onClick={() => {
                        if (isBuying) return;
                        setSelected(null);
                        setPurchaseResult(null);
                    }}
                >
                    <div
                        className="w-full max-w-md rounded-2xl bg-neutral-950 border border-neutral-800 p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 className="text-lg font-semibold mb-1">
                            {purchaseResult?.kind === "success"
                                ? "Commande enregistrée"
                                : purchaseResult?.kind === "error"
                                    ? "Échec de la commande"
                                    : `Acheter ${selected.title} ?`}
                        </h2>

                        {!purchaseResult && (
                            <>
                                <p className="text-sm text-neutral-400 mb-4">
                                    {formatDzd(selected.priceDzd)} DZD — livraison
                                    manuelle par notre équipe (quelques minutes).
                                </p>

                                <div className="space-y-3 mb-4">
                                    <div>
                                        <label className="block text-xs text-neutral-500 mb-1">
                                            Téléphone du client (optionnel)
                                        </label>
                                        <input
                                            type="tel"
                                            value={customerPhone}
                                            onChange={(e) => setCustomerPhone(e.target.value)}
                                            placeholder="+213…"
                                            className="w-full px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-sm focus:outline-none focus:border-[#FACC15]"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-neutral-500 mb-1">
                                            Note (optionnel)
                                        </label>
                                        <textarea
                                            value={customerNote}
                                            onChange={(e) => setCustomerNote(e.target.value)}
                                            placeholder="Précisions pour l&apos;équipe…"
                                            rows={3}
                                            className="w-full px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-sm focus:outline-none focus:border-[#FACC15] resize-none"
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-3 justify-end">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelected(null);
                                            setPurchaseResult(null);
                                        }}
                                        className="px-4 py-2 rounded-lg text-neutral-300 hover:text-white transition"
                                    >
                                        Annuler
                                    </button>
                                    <button
                                        type="button"
                                        disabled={isBuying}
                                        onClick={async () => {
                                            setIsBuying(true);
                                            const res = await purchaseManualProductAction({
                                                productId: selected.id,
                                                customerPhone,
                                                customerNote,
                                            });
                                            setIsBuying(false);
                                            if (res.ok) {
                                                setPurchaseResult({
                                                    kind: "success",
                                                    orderNumber: res.orderNumber,
                                                });
                                            } else {
                                                setPurchaseResult({
                                                    kind: "error",
                                                    message: res.error,
                                                });
                                            }
                                        }}
                                        className="px-5 py-2 rounded-lg bg-[#FACC15] hover:bg-[#FBD138] text-black font-semibold transition disabled:opacity-60"
                                    >
                                        {isBuying ? "Achat en cours…" : "Confirmer"}
                                    </button>
                                </div>
                            </>
                        )}

                        {purchaseResult?.kind === "success" && (
                            <div className="mt-2">
                                <div className="flex items-center gap-2 text-emerald-400 mb-3">
                                    <CheckCircle2 size={20} />
                                    <span className="font-semibold">Paiement confirmé</span>
                                </div>
                                <p className="text-sm text-neutral-300">
                                    Notre équipe a été notifiée et te recontacte
                                    dans les minutes qui suivent.
                                </p>
                                <p className="text-[11px] text-neutral-500 mt-3">
                                    Commande : {purchaseResult.orderNumber}
                                </p>
                                <div className="flex gap-3 justify-end mt-5">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelected(null);
                                            setPurchaseResult(null);
                                        }}
                                        className="px-4 py-2 rounded-lg bg-neutral-800 text-white hover:bg-neutral-700 transition"
                                    >
                                        Fermer
                                    </button>
                                </div>
                            </div>
                        )}

                        {purchaseResult?.kind === "error" && (
                            <div className="mt-2">
                                <div className="flex items-center gap-2 text-red-300 mb-3">
                                    <AlertTriangle size={20} />
                                    <span className="font-semibold">Erreur</span>
                                </div>
                                <p className="text-sm text-red-300">
                                    {purchaseResult.message}
                                </p>
                                <div className="flex gap-3 justify-end mt-5">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelected(null);
                                            setPurchaseResult(null);
                                        }}
                                        className="px-4 py-2 rounded-lg bg-neutral-800 text-white hover:bg-neutral-700 transition"
                                    >
                                        Fermer
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </main>
    );
}
