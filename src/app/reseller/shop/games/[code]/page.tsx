"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button, Spinner } from "@heroui/react";
import { ArrowLeft, Check, Minus, Plus, AlertTriangle } from "lucide-react";
import { toast } from "react-hot-toast";

import {
    getG2BulkGameCatalogueAction,
    getG2BulkGameFieldsAction,
    createG2BulkGameOrderAction,
    type EnrichedGamePackage,
    type GameCatalogueMeta,
    type G2BulkGame,
    type G2BulkGameField,
} from "../../g2bulk-games-actions";
import { formatCurrency } from "@/lib/formatters";

/**
 * Coerce any thrown / returned error shape into a human-readable string for
 * toast rendering. Server actions occasionally surface non-Error shapes
 * (drizzle, pg, upstream JSON), and `toast.error(obj)` collapses to the
 * literal "[object Object]" — this helper avoids that footgun everywhere.
 */
function asErrorString(err: unknown, fallback: string): string {
    if (typeof err === "string" && err.length > 0) return err;
    if (err instanceof Error && typeof err.message === "string" && err.message) return err.message;
    if (err && typeof err === "object") {
        const m = (err as { message?: unknown }).message;
        if (typeof m === "string" && m) return m;
        try {
            const s = JSON.stringify(err);
            if (s && s !== "{}") return s;
        } catch {
            /* circular — fall through */
        }
    }
    return fallback;
}

export default function ResellerGameCataloguePage() {
    const router = useRouter();
    const params = useParams<{ code: string }>();
    const code = decodeURIComponent(params?.code || "");

    const [game, setGame] = useState<G2BulkGame | null>(null);
    const [items, setItems] = useState<ReadonlyArray<EnrichedGamePackage>>([]);
    const [meta, setMeta] = useState<GameCatalogueMeta | null>(null);
    const [fields, setFields] = useState<ReadonlyArray<G2BulkGameField>>([]);
    const [notes, setNotes] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [quantity, setQuantity] = useState(1);
    const [player, setPlayer] = useState<Record<string, string>>({});
    const [isBuying, setIsBuying] = useState(false);

    useEffect(() => {
        let active = true;
        setIsLoading(true);
        Promise.all([
            getG2BulkGameCatalogueAction({ code }),
            getG2BulkGameFieldsAction({ code }),
        ])
            .then(([cat, fld]) => {
                if (!active) return;
                if (cat.success) {
                    setGame(cat.data.game);
                    setItems([...cat.data.items].sort((a, b) => a.unitPriceCents - b.unitPriceCents));
                    setMeta(cat.data.meta);
                } else {
                    setError(cat.error);
                }
                if (fld.success) {
                    setFields(fld.data.fields);
                    setNotes(fld.data.notes ?? null);
                }
            })
            .catch(() => active && setError("Catalogue indisponible"))
            .finally(() => active && setIsLoading(false));
        return () => {
            active = false;
        };
    }, [code]);

    const selected = useMemo(
        () => items.find((p) => p.catalogueId === selectedId) || null,
        [items, selectedId],
    );

    const missingField = useMemo(
        () => fields.find((f) => f.required && !player[f.key]?.trim())?.label ?? null,
        [fields, player],
    );

    const handleBuy = useCallback(async () => {
        if (!selected) return;
        if (missingField) {
            toast.error(`Champ requis : ${missingField}`);
            return;
        }
        setIsBuying(true);
        try {
            const res = await createG2BulkGameOrderAction({
                gameCode: code,
                catalogueId: selected.catalogueId,
                quantity,
                player,
            });
            if (res.success) {
                toast.success("Top-up envoyé à LoadBrain", { duration: 4000 });
                setSelectedId(null);
                router.push("/reseller/orders");
            } else {
                toast.error(asErrorString(res.error, "Échec de la commande"));
            }
        } catch (err) {
            toast.error(asErrorString(err, "Erreur technique lors du paiement"));
        } finally {
            setIsBuying(false);
        }
    }, [selected, missingField, code, quantity, player, router]);

    const total = selected ? selected.pricing.finalPriceDzd * quantity : 0;

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <button
                onClick={() => router.push("/reseller/shop/games")}
                className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
                <ArrowLeft size={14} />
                Retour aux jeux
            </button>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
                {/* LEFT: packages */}
                <div className="space-y-5 min-w-0">
                    <div className="space-y-1">
                        <h1 className="text-4xl lg:text-5xl font-black text-[#FACC15] tracking-tight">
                            {game?.name ?? code}
                        </h1>
                        <p className="text-sm text-slate-400">Choisissez un montant à recharger</p>
                        {meta && (meta.tierDiscountPct > 0 || meta.customDiscountPct > 0) && (
                            <p className="text-[11px] font-black uppercase tracking-widest text-emerald-400">
                                Remise : {(meta.tierDiscountPct + meta.customDiscountPct).toFixed(0)}%
                                {meta.tierName ? ` · Tier ${meta.tierName}` : ""}
                            </p>
                        )}
                    </div>

                    {isLoading ? (
                        <div className="py-20 flex justify-center">
                            <Spinner color="warning" />
                        </div>
                    ) : error ? (
                        <p className="text-center text-amber-400 italic py-12">{error}</p>
                    ) : items.length === 0 ? (
                        <p className="text-center text-slate-500 italic py-12">
                            Aucun package disponible pour ce jeu.
                        </p>
                    ) : (
                        <ul className="space-y-2" data-testid="package-list">
                            {items.map((p) => {
                                const sel = selectedId === p.catalogueId;
                                return (
                                    <li key={p.catalogueId}>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedId(p.catalogueId)}
                                            data-testid="package-row"
                                            data-selected={sel}
                                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                                                sel
                                                    ? "bg-[#FACC15]/10 border-[#FACC15] ring-1 ring-[#FACC15]/60"
                                                    : "bg-[#161616] border-[#262626] hover:border-[#FACC15]/40 hover:bg-[#1c1c1c]"
                                            }`}
                                        >
                                            <span
                                                className={`size-5 shrink-0 rounded-md border flex items-center justify-center ${
                                                    sel ? "bg-[#FACC15] border-[#FACC15]" : "bg-transparent border-[#3a3a3a]"
                                                }`}
                                            >
                                                {sel && <Check size={14} className="text-black" />}
                                            </span>
                                            <span className="flex-1 min-w-0 truncate text-sm font-semibold text-white">
                                                {p.name}
                                            </span>
                                            <span className="shrink-0 text-sm font-black text-white min-w-[110px] text-right">
                                                {formatCurrency(p.pricing.finalPriceDzd, "DZD")}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                {/* RIGHT: sticky purchase panel + player form */}
                <aside className="lg:sticky lg:top-24">
                    {!selected ? (
                        <div className="bg-[#161616] border border-[#262626] rounded-2xl p-6 text-center text-slate-500 text-sm">
                            Choisissez un montant dans la liste pour recharger.
                        </div>
                    ) : (
                        <div className="bg-[#161616] border border-[#262626] rounded-2xl p-5 space-y-4">
                            <div>
                                <p className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-1">
                                    Sélection
                                </p>
                                <h3 className="text-base font-black text-white leading-snug">
                                    {selected.name}
                                </h3>
                                <div className="flex items-baseline gap-2 mt-2">
                                    <span className="text-lg font-black text-[#FACC15]">
                                        {formatCurrency(selected.pricing.finalPriceDzd, "DZD")}
                                    </span>
                                    <span className="text-xs text-slate-500">/ unité</span>
                                </div>
                            </div>

                            {/* Dynamic player fields */}
                            <div className="border-t border-[#262626] pt-4 space-y-3">
                                {fields.map((f) => (
                                    <div key={f.key} className="space-y-1">
                                        <label className="text-[10px] uppercase font-black tracking-widest text-slate-500">
                                            {f.label}
                                            {f.required && <span className="text-red-400"> *</span>}
                                        </label>
                                        {f.type === "enum" && f.options ? (
                                            <select
                                                value={player[f.key] ?? ""}
                                                onChange={(e) =>
                                                    setPlayer((prev) => ({ ...prev, [f.key]: e.target.value }))
                                                }
                                                className="w-full h-10 bg-[#0a0a0a] border border-[#262626] rounded-lg px-3 text-white text-sm focus:outline-none focus:border-[#FACC15]"
                                            >
                                                <option value="">— choisir —</option>
                                                {Object.entries(f.options).map(([val, lbl]) => (
                                                    <option key={val} value={val}>
                                                        {lbl}
                                                    </option>
                                                ))}
                                            </select>
                                        ) : (
                                            <input
                                                type="text"
                                                value={player[f.key] ?? ""}
                                                onChange={(e) =>
                                                    setPlayer((prev) => ({ ...prev, [f.key]: e.target.value }))
                                                }
                                                placeholder={f.label}
                                                className="w-full h-10 bg-[#0a0a0a] border border-[#262626] rounded-lg px-3 text-white text-sm focus:outline-none focus:border-[#FACC15]"
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Quantity */}
                            <div className="border-t border-[#262626] pt-4 space-y-2">
                                <label className="text-[10px] uppercase font-black tracking-widest text-slate-500">
                                    Quantité
                                </label>
                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                                        className="size-9 rounded-lg border border-[#262626] flex items-center justify-center hover:border-[#FACC15]/40 text-white"
                                        aria-label="Diminuer"
                                    >
                                        <Minus size={14} />
                                    </button>
                                    <input
                                        type="number"
                                        min={1}
                                        max={50}
                                        value={quantity}
                                        onChange={(e) => {
                                            const n = parseInt(e.target.value, 10);
                                            if (Number.isFinite(n)) setQuantity(Math.min(50, Math.max(1, n)));
                                        }}
                                        className="flex-1 h-9 bg-[#0a0a0a] border border-[#262626] rounded-lg text-center text-white font-black focus:outline-none focus:border-[#FACC15]"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setQuantity((q) => Math.min(50, q + 1))}
                                        className="size-9 rounded-lg border border-[#262626] flex items-center justify-center hover:border-[#FACC15]/40 text-white"
                                        aria-label="Augmenter"
                                    >
                                        <Plus size={14} />
                                    </button>
                                </div>
                            </div>

                            {notes && (
                                <p className="flex items-start gap-1.5 text-[10px] text-amber-400/90 leading-relaxed">
                                    <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                                    <span>{notes}</span>
                                </p>
                            )}

                            <div className="border-t border-[#262626] pt-4 flex items-baseline justify-between">
                                <span className="text-[11px] uppercase font-black tracking-widest text-slate-500">
                                    Total
                                </span>
                                <span className="text-xl font-black text-[#FACC15]">
                                    {formatCurrency(total, "DZD")}
                                </span>
                            </div>

                            <Button
                                onPress={handleBuy}
                                isLoading={isBuying}
                                isDisabled={isBuying || !!missingField}
                                data-testid="game-buy-btn"
                                className="w-full h-12 bg-[#FACC15] text-black font-black text-base rounded-xl hover:bg-[#FACC15]/90 transition-colors disabled:opacity-50"
                            >
                                {missingField ? "Renseignez le Player ID" : "Recharger maintenant"}
                            </Button>
                        </div>
                    )}
                </aside>
            </div>
        </div>
    );
}
