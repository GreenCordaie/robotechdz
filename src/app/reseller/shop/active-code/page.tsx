"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search, KeyRound, Sparkles, Globe2, AlertTriangle, Send } from "lucide-react";
import { toast } from "react-hot-toast";

import { ALL_REGION, RegionPills } from "../components/Denomination";
import {
    getActiveCodeCatalogAction,
    purchaseActiveCodeAction,
    type ActiveCodeListResult,
} from "./actions";

/**
 * Active Code — Phase 2b live listing.
 *
 * Layout mirrors `/reseller/shop/all`. Data is fetched server-side from
 * LoadBrain (`/api/v1/giftcards/reseller-catalog/active-code`) using
 * the site's X-API-Key — the upstream siteId is derived from the key,
 * never from a client-controlled param.
 *
 * Source-hiding contract: brand is hard-pinned to "Code Premium" by
 * the LoadBrain projection. The upstream provider name must never
 * appear in this surface.
 */

type SubCategoryValue = "" | "iptv" | "test" | "vod" | "server" | "internet" | "legacy";

const CATEGORY_CHIPS: ReadonlyArray<{ value: SubCategoryValue; label: string }> = [
    { value: "",          label: "Tous" },
    { value: "iptv",      label: "IPTV" },
    { value: "test",      label: "Test" },
    { value: "vod",       label: "VOD" },
    { value: "server",    label: "Serveur" },
    { value: "internet",  label: "Internet" },
    { value: "legacy",    label: "Legacy" },
];

// Categories explicitly hidden from the reseller storefront. The server
// route returns them but we filter client-side so the resulting list
// stays in sync with the chip strip (no orphan rows from a removed
// chip). Easier to evolve than touching the SQL filter.
const HIDDEN_SUB_CATEGORIES: ReadonlySet<string> = new Set(["mango"]);

function formatDzd(amount: number): string {
    return new Intl.NumberFormat("fr-FR").format(amount);
}

export default function ResellerShopActiveCodePage() {
    const router = useRouter();
    const [rawQuery, setRawQuery] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");
    const [region, setRegion] = useState<string>(ALL_REGION);
    const [subCategory, setSubCategory] = useState<SubCategoryValue>("");

    const [items, setItems] = useState<ActiveCodeListResult["items"]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Purchase modal state — one mounted row at a time, no concurrent
    // checkouts since the action polls for up to 60s.
    const [selected, setSelected] =
        useState<ActiveCodeListResult["items"][number] | null>(null);
    const [isBuying, setIsBuying] = useState(false);
    const [purchaseResult, setPurchaseResult] = useState<
        | { kind: "success"; code: string; orderId: string }
        | { kind: "pending"; orderId: string }
        | { kind: "error"; message: string }
        | null
    >(null);

    // Reseller shop name — signs the WhatsApp share message to the customer.
    const [resellerName, setResellerName] = useState<string | undefined>(undefined);
    useEffect(() => {
        import("@/app/reseller/actions").then(({ getCurrentResellerAction }) =>
            getCurrentResellerAction({}).then((res) => {
                if (res.success && res.data) {
                    setResellerName((res.data as { companyName?: string }).companyName);
                }
            }),
        );
    }, []);

    // Debounce the search input by 250ms — same UX as /reseller/shop/all.
    useEffect(() => {
        const t = setTimeout(() => setDebouncedQuery(rawQuery.trim()), 250);
        return () => clearTimeout(t);
    }, [rawQuery]);

    // Fetch on subCategory / search change.
    useEffect(() => {
        let active = true;
        setIsLoading(true);
        setError(null);
        getActiveCodeCatalogAction({
            subCategory: subCategory || undefined,
            search: debouncedQuery || undefined,
            limit: 200,
            offset: 0,
        }).then((res) => {
            if (!active) return;
            if (res.ok) {
                setItems(res.data.items);
            } else {
                setItems([]);
                setError(res.error);
            }
            setIsLoading(false);
        });
        return () => {
            active = false;
        };
    }, [subCategory, debouncedQuery]);

    const filteredByRegion = items
        .filter((row) => !HIDDEN_SUB_CATEGORIES.has(row.subCategory))
        .filter((row) =>
            region === ALL_REGION ? true : row.region === region,
        );

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
                    <KeyRound size={28} className="text-[#FACC15]" />
                    <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                        Active Code
                    </h1>
                </div>
                <p className="text-sm text-neutral-400 mb-1">
                    {isLoading
                        ? "Chargement…"
                        : `${filteredByRegion.length} résultat${filteredByRegion.length > 1 ? "s" : ""}${debouncedQuery ? ` pour « ${debouncedQuery} »` : ""}`}
                </p>
                <p className="text-xs text-neutral-500 mb-8">
                    Codes premium à activation instantanée — abonnements IPTV, VOD,
                    serveurs et tests gratuits.
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
                        placeholder="Rechercher un code, une durée…"
                        className="w-full pl-12 pr-4 py-3 bg-neutral-900 border border-neutral-800 rounded-xl text-white placeholder:text-neutral-500 focus:outline-none focus:border-[#FACC15] transition"
                    />
                </div>

                {/* ─── Region pills (visual continuity) ───────────────── */}
                <RegionPills
                    regions={["GLOBAL"]}
                    value={region}
                    onChange={setRegion}
                />

                {/* ─── Type chips (sub-category, server-side filter) ─── */}
                <div className="flex flex-wrap gap-2 mt-4 mb-6">
                    {CATEGORY_CHIPS.map((chip) => (
                        <button
                            key={chip.value || "all"}
                            type="button"
                            onClick={() => setSubCategory(chip.value)}
                            className={[
                                "px-3 py-1.5 rounded-full text-xs font-medium border transition",
                                subCategory === chip.value
                                    ? "bg-[#FACC15] text-black border-[#FACC15]"
                                    : "bg-neutral-900 text-neutral-300 border-neutral-800 hover:border-neutral-700",
                            ].join(" ")}
                        >
                            {chip.label}
                        </button>
                    ))}
                </div>

                {/* ─── States ────────────────────────────────────────── */}
                {error ? (
                    <div className="mt-8 flex items-start gap-3 px-5 py-4 rounded-xl border border-red-900/40 bg-red-950/30 text-red-200">
                        <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                        <div className="text-sm">
                            <p className="font-medium mb-1">Catalogue temporairement indisponible</p>
                            <p className="text-red-300/80 text-xs">
                                Réessayez dans un instant. Si le problème persiste,
                                contactez le support. ({error})
                            </p>
                        </div>
                    </div>
                ) : isLoading ? (
                    <div className="mt-12 text-center text-sm text-neutral-500">
                        Chargement du catalogue…
                    </div>
                ) : filteredByRegion.length === 0 ? (
                    <div className="mt-12 flex flex-col items-center justify-center text-center px-6 py-16 rounded-2xl border border-dashed border-neutral-800 bg-neutral-950">
                        <div className="w-16 h-16 rounded-full bg-[#FACC15]/10 flex items-center justify-center mb-4">
                            <Sparkles size={28} className="text-[#FACC15]" />
                        </div>
                        <h2 className="text-xl font-semibold mb-2">
                            {debouncedQuery || subCategory
                                ? "Aucun résultat"
                                : "Catalogue en préparation"}
                        </h2>
                        <p className="text-sm text-neutral-400 max-w-md">
                            {debouncedQuery || subCategory
                                ? "Aucun code premium ne correspond à votre filtre. Essayez un autre type ou supprimez la recherche."
                                : "Les codes premium seront disponibles dès que l'opérateur les aura activés."}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filteredByRegion.map((row) => (
                            <button
                                key={row.id}
                                type="button"
                                onClick={() => {
                                    if (row.priceDzd === null) return;
                                    setSelected(row);
                                    setPurchaseResult(null);
                                }}
                                disabled={row.priceDzd === null}
                                className={[
                                    "w-full flex items-center justify-between gap-4 px-5 py-4 rounded-xl bg-neutral-900 border border-neutral-800 transition text-left",
                                    row.priceDzd === null
                                        ? "opacity-60 cursor-not-allowed"
                                        : "hover:border-[#FACC15]/40 hover:bg-neutral-900/80",
                                ].join(" ")}
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[#FACC15] font-semibold">Code Premium</span>
                                        <span className="text-neutral-500">·</span>
                                        <span className="font-semibold truncate">{row.title}</span>
                                    </div>
                                    <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-500">
                                        <span className="font-mono uppercase text-cyan-400/80">ROBOTECHDZ</span>
                                        <span>·</span>
                                        <span>Activation instantanée</span>
                                        <span>·</span>
                                        <span className="inline-flex items-center gap-1">
                                            <Globe2 size={11} />
                                            {row.region}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-1 shrink-0">
                                    {row.priceDzd !== null ? (
                                        <span className="text-lg font-bold text-white">
                                            {formatDzd(row.priceDzd)} DZD
                                        </span>
                                    ) : (
                                        <span className="text-xs text-neutral-500 italic">
                                            Prix à venir
                                        </span>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* ─── Purchase modal ─────────────────────────────────────── */}
            {selected && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="active-code-purchase-title"
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
                        <h2
                            id="active-code-purchase-title"
                            className="text-lg font-semibold mb-1"
                        >
                            {purchaseResult?.kind === "success"
                                ? "Code livré"
                                : purchaseResult?.kind === "pending"
                                    ? "Provisioning en cours"
                                    : purchaseResult?.kind === "error"
                                        ? "Échec de la commande"
                                        : `Acheter ${selected.title} ?`}
                        </h2>
                        {!purchaseResult && (
                            <>
                                <p className="text-sm text-neutral-400">
                                    Confirmer l&apos;achat à{" "}
                                    <span className="text-white font-bold">
                                        {selected.priceDzd !== null
                                            ? `${formatDzd(selected.priceDzd)} DZD`
                                            : ""}
                                    </span>{" "}
                                    ?
                                </p>
                                <p className="text-[11px] text-neutral-600 mt-2 mb-6">
                                    Le code est livré instantanément. Aucun
                                    remboursement après livraison.
                                </p>
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
                                            const res = await purchaseActiveCodeAction({
                                                planId: selected.id,
                                            });
                                            setIsBuying(false);
                                            if (res.ok && res.status === "completed") {
                                                setPurchaseResult({
                                                    kind: "success",
                                                    code: res.code,
                                                    orderId: res.orderId,
                                                });
                                            } else if (res.ok && res.status === "pending") {
                                                setPurchaseResult({
                                                    kind: "pending",
                                                    orderId: res.orderId,
                                                });
                                            } else {
                                                setPurchaseResult({
                                                    kind: "error",
                                                    message: res.ok
                                                        ? "unknown"
                                                        : res.error,
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
                                <p className="text-xs text-neutral-400 mb-2">
                                    Code :
                                </p>
                                <button
                                    type="button"
                                    title="Cliquer pour copier"
                                    onClick={() => {
                                        navigator.clipboard
                                            .writeText(purchaseResult.code)
                                            .then(() => toast.success("Code copié"))
                                            .catch(() => toast.error("Impossible de copier"));
                                    }}
                                    className="w-full text-2xl font-mono font-bold tracking-wider text-[#FACC15] bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-center break-all cursor-pointer hover:border-[#FACC15]/60 transition"
                                >
                                    {purchaseResult.code}
                                </button>
                                <p className="text-[11px] text-neutral-500 mt-3">
                                    Commande : {purchaseResult.orderId}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const who = resellerName?.trim()
                                            ? ` — ${resellerName.trim()}`
                                            : "";
                                        const msg =
                                            `🛍️ *Votre code*${who}\n\n` +
                                            `*Code :* ${purchaseResult.code}\n\n` +
                                            `Merci de votre confiance ! 🙏`;
                                        window.open(
                                            `https://wa.me/?text=${encodeURIComponent(msg)}`,
                                            "_blank",
                                            "noopener,noreferrer",
                                        );
                                    }}
                                    className="w-full flex items-center justify-center gap-2 mt-4 px-4 py-2.5 rounded-lg bg-[#25D366] text-black font-bold hover:bg-[#25D366]/90 transition"
                                >
                                    <Send className="w-4 h-4" /> Partager sur WhatsApp
                                </button>
                                <div className="flex gap-3 justify-end mt-3">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            navigator.clipboard
                                                .writeText(purchaseResult.code)
                                                .then(() => toast.success("Code copié"))
                                                .catch(() => toast.error("Impossible de copier"));
                                        }}
                                        className="px-4 py-2 rounded-lg bg-[#FACC15] text-black font-bold hover:bg-[#FACC15]/90 transition"
                                    >
                                        Copier le code
                                    </button>
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

                        {purchaseResult?.kind === "pending" && (
                            <div className="mt-2">
                                <p className="text-sm text-neutral-300">
                                    Le panel met plus de temps que prévu. La
                                    commande est en cours. Vérifie l&apos;onglet
                                    Commandes dans quelques minutes.
                                </p>
                                <p className="text-[11px] text-neutral-500 mt-3">
                                    Commande : {purchaseResult.orderId}
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
                                        OK
                                    </button>
                                </div>
                            </div>
                        )}

                        {purchaseResult?.kind === "error" && (
                            <div className="mt-2">
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
