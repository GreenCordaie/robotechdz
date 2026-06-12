"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Spinner } from "@heroui/react";
import { Search, Store, Zap, Clock, ShoppingCart, PackageX, RefreshCw } from "lucide-react";
import { toast } from "react-hot-toast";

import { getMarketplaceTrackedAction, resolveTrackedListingAction } from "../actions";
import { checkoutResellerAction, getCurrentResellerAction } from "../../actions";
import PurchaseSuccessModal from "../components/PurchaseSuccessModal";
import type { EnrichedBsvListing } from "@/types/bsv-listings";

/* ──────────────────────────────────────────────────────────────────────────
 * Marketplace — CURATED B2B list.
 *
 * Source: getMarketplaceTrackedAction — only the products the operator hand-adds
 * in Admin → Arbitrage (BSV tracked links). No auto-crawl noise. Dense list
 * tuned for a reseller who buys fast: one compact row per product, prices
 * aligned in DZD (tier/markup applied server-side), instant/on-demand badge,
 * one-tap buy. Supplier fully hidden (rows read "ROBOTECHDZ" upstream).
 * Buy: tracked id → resolveTrackedListingAction → checkoutResellerAction.
 * ────────────────────────────────────────────────────────────────────────── */

const fmtDzd = (n: number) =>
    new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 0 }).format(Math.round(n || 0));

interface Row {
    trackedId: string;
    name: string;
    priceDzd: number;
    delivery: "auto" | "manual";
    stock: number;
}

export default function ResellerMarketplacePage() {
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [rawQuery, setRawQuery] = useState("");
    const [query, setQuery] = useState("");
    const [resellerId, setResellerId] = useState<number | null>(null);
    const [tierName, setTierName] = useState<string | null>(null);
    const [buyingId, setBuyingId] = useState<string | null>(null);
    const [confirmRow, setConfirmRow] = useState<Row | null>(null);
    const [modalOrderId, setModalOrderId] = useState<number | null>(null);
    const [boughtLabel, setBoughtLabel] = useState<string | undefined>(undefined);

    /* reseller identity */
    useEffect(() => {
        getCurrentResellerAction({}).then((res) => {
            if (res.success && res.data) setResellerId((res.data as { id: number }).id);
        });
    }, []);

    /* curated catalog */
    const load = useCallback(() => {
        let active = true;
        setLoading(true);
        setError(null);
        getMarketplaceTrackedAction({})
            .then((res) => {
                if (!active) return;
                if (!res.success) {
                    setError(res.error);
                    return;
                }
                const items = res.data.items as ReadonlyArray<EnrichedBsvListing>;
                setTierName(res.data.pricing?.tierName ?? null);
                setRows(
                    items.map((it) => ({
                        trackedId: it.listingId,
                        name: it.product.displayName,
                        priceDzd: it.pricing.finalPriceDzd,
                        delivery: it.deliveryType === "auto" ? "auto" : "manual",
                        stock: it.stockQty ?? 0,
                    })),
                );
            })
            .catch(() => {
                if (active) setError("Catalogue indisponible");
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        const cleanup = load();
        return cleanup;
    }, [load]);

    /* debounced search */
    useEffect(() => {
        const t = setTimeout(() => setQuery(rawQuery.trim().toLowerCase()), 200);
        return () => clearTimeout(t);
    }, [rawQuery]);

    const filtered = useMemo(() => {
        if (!query) return rows;
        return rows.filter((r) => r.name.toLowerCase().includes(query));
    }, [rows, query]);

    async function buy(r: Row) {
        if (!resellerId) {
            toast.error("Compte revendeur introuvable");
            return;
        }
        if (buyingId) return;
        setBuyingId(r.trackedId);
        try {
            const resolved = await resolveTrackedListingAction({ trackedId: r.trackedId });
            if (!resolved.success) {
                toast.error(resolved.error);
                return;
            }
            // Unique per buy intent, stable across a transparent retry → the
            // server returns the original order instead of a second debit (#3).
            const idemKey =
                typeof crypto !== "undefined" && crypto.randomUUID
                    ? crypto.randomUUID()
                    : `${resellerId}-${r.trackedId}-${Math.random().toString(36).slice(2)}`;
            const res = await checkoutResellerAction({
                resellerId,
                cart: [{ listingId: resolved.listingId, quantity: 1 }],
                idempotencyKey: idemKey,
                // The price the reseller just confirmed — reject a higher live
                // charge instead of silently over-debiting (#4).
                maxPriceDzd: r.priceDzd,
            });
            if (!res.success) {
                toast.error((res as { error?: string }).error ?? "Échec de l'achat");
                return;
            }
            const warning = (res as { warning?: string }).warning;
            if (warning) toast(warning, { icon: "⚠️", duration: 7000 });
            setBoughtLabel(r.name);
            setModalOrderId((res as { orderId?: number }).orderId ?? null);
            load();
        } catch (e) {
            toast.error((e as Error).message);
        } finally {
            setBuyingId(null);
            setConfirmRow(null);
        }
    }

    return (
        <div className="min-h-screen bg-[#0f0f0f] text-white">
            {/* sticky header + search */}
            <div className="sticky top-0 z-10 border-b border-[#262626] bg-[#0f0f0f]/95 backdrop-blur">
                <div className="mx-auto max-w-5xl px-4 py-4">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#FACC15] text-black">
                                <Store size={20} />
                            </div>
                            <div>
                                <h1 className="text-xl font-black leading-none">Marketplace</h1>
                                <p className="mt-1 text-[11px] uppercase tracking-widest text-slate-500">
                                    {rows.length} produit{rows.length > 1 ? "s" : ""}
                                    {tierName ? ` · palier ${tierName}` : ""}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => load()}
                            title="Rafraîchir"
                            className="grid h-9 w-9 place-items-center rounded-lg border border-[#262626] text-slate-400 transition hover:bg-[#161616] hover:text-white"
                        >
                            <RefreshCw size={16} />
                        </button>
                    </div>
                    <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#262626] bg-[#161616] px-3">
                        <Search size={16} className="text-slate-500" />
                        <input
                            value={rawQuery}
                            onChange={(e) => setRawQuery(e.target.value)}
                            placeholder="Rechercher un produit…"
                            className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-slate-600"
                        />
                    </div>
                </div>
            </div>

            <div className="mx-auto max-w-5xl px-4 py-5">
                {loading ? (
                    <div className="grid place-items-center py-24">
                        <Spinner color="warning" />
                    </div>
                ) : error ? (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-center text-sm text-red-300">
                        {error}
                    </div>
                ) : filtered.length === 0 ? (
                    <EmptyState hasRows={rows.length > 0} />
                ) : (
                    <div className="overflow-hidden rounded-xl border border-[#262626]">
                        <div className="hidden grid-cols-[1fr_7rem_7rem_8rem] gap-4 border-b border-[#262626] bg-[#161616] px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 sm:grid">
                            <span>Produit</span>
                            <span className="text-center">Livraison</span>
                            <span className="text-right">Prix</span>
                            <span className="text-right">Action</span>
                        </div>
                        {filtered.map((r, i) => (
                            <RowItem
                                key={r.trackedId}
                                r={r}
                                busy={buyingId === r.trackedId}
                                onBuy={() => setConfirmRow(r)}
                                striped={i % 2 === 1}
                            />
                        ))}
                    </div>
                )}
            </div>

            <PurchaseSuccessModal
                isOpen={modalOrderId !== null}
                onClose={() => setModalOrderId(null)}
                orderId={modalOrderId}
                productLabel={boughtLabel}
            />

            {confirmRow && (
                <ConfirmBuyModal
                    row={confirmRow}
                    busy={buyingId === confirmRow.trackedId}
                    onConfirm={() => buy(confirmRow)}
                    onCancel={() => setConfirmRow(null)}
                />
            )}
        </div>
    );
}

function ConfirmBuyModal({
    row,
    busy,
    onConfirm,
    onCancel,
}: {
    row: Row;
    busy: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    return (
        <div
            className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
            onClick={busy ? undefined : onCancel}
        >
            <div
                className="w-full max-w-sm rounded-2xl border border-[#262626] bg-[#161616] p-5 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-lg font-black">Confirmer l&apos;achat</h2>
                <p className="mt-1 text-xs text-slate-500">
                    Vérifie le produit — ton solde sera débité immédiatement.
                </p>
                <div className="mt-4 rounded-xl border border-[#262626] bg-[#0f0f0f] p-4">
                    <p className="text-sm font-semibold text-white">{row.name}</p>
                    <div className="mt-3 flex items-center justify-between">
                        {row.delivery === "auto" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                                <Zap size={11} /> Instant
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                                <Clock size={11} /> Sur demande
                            </span>
                        )}
                        <span className="text-lg font-black text-[#FACC15]">
                            {fmtDzd(row.priceDzd)}{" "}
                            <span className="text-[10px] text-slate-500">DZD</span>
                        </span>
                    </div>
                </div>
                <div className="mt-5 flex gap-3">
                    <button
                        onClick={onCancel}
                        disabled={busy}
                        className="flex-1 rounded-lg border border-[#262626] py-2.5 text-sm font-bold text-slate-300 transition hover:bg-[#0f0f0f] disabled:opacity-50"
                    >
                        Annuler
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={busy}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#FACC15] py-2.5 text-sm font-black text-black transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                        {busy ? <Spinner size="sm" color="default" /> : "Confirmer l'achat"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function RowItem({
    r,
    busy,
    onBuy,
    striped,
}: {
    r: Row;
    busy: boolean;
    onBuy: () => void;
    striped: boolean;
}) {
    const out = r.stock <= 0;
    return (
        <div
            className={`grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-[#161616] sm:grid-cols-[1fr_7rem_7rem_8rem] ${
                striped ? "bg-[#121212]" : ""
            }`}
        >
            <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{r.name}</p>
                <p className="mt-0.5 text-[11px] text-slate-500 sm:hidden">
                    {r.delivery === "auto" ? "Instant" : "Sur demande"} · {fmtDzd(r.priceDzd)} DZD
                </p>
            </div>

            <div className="hidden justify-center sm:flex">
                {r.delivery === "auto" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                        <Zap size={11} /> Instant
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                        <Clock size={11} /> Sur demande
                    </span>
                )}
            </div>

            <div className="hidden items-baseline justify-end gap-1 sm:flex">
                <span className="text-sm font-black text-[#FACC15]">{fmtDzd(r.priceDzd)}</span>
                <span className="text-[10px] text-slate-500">DZD</span>
            </div>

            <div className="flex justify-end">
                <button
                    onClick={onBuy}
                    disabled={busy || out}
                    className="inline-flex h-8 min-w-[6.5rem] items-center justify-center gap-1.5 rounded-lg bg-[#FACC15] px-3 text-xs font-bold text-black transition hover:brightness-95 disabled:cursor-not-allowed disabled:bg-[#262626] disabled:text-slate-500"
                >
                    {busy ? (
                        <Spinner size="sm" color="default" />
                    ) : out ? (
                        <>
                            <PackageX size={13} /> Rupture
                        </>
                    ) : (
                        <>
                            <ShoppingCart size={13} /> Acheter
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}

function EmptyState({ hasRows }: { hasRows: boolean }) {
    return (
        <div className="rounded-xl border border-dashed border-[#262626] bg-[#121212] px-6 py-16 text-center">
            <Store size={32} className="mx-auto text-slate-700" />
            <p className="mt-3 font-semibold text-slate-300">
                {hasRows ? "Aucun produit ne correspond" : "Catalogue vide"}
            </p>
            <p className="mt-1 text-sm text-slate-500">
                {hasRows
                    ? "Essaie un autre terme de recherche."
                    : "Ajoute tes produits dans Admin → Arbitrage (liens BSV)."}
            </p>
        </div>
    );
}
