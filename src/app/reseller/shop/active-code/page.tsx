"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search, KeyRound, Sparkles, Globe2 } from "lucide-react";

import { ALL_REGION, RegionPills } from "../components/Denomination";

/**
 * Active Code — Phase 2a listing.
 *
 * Layout matches `/reseller/shop/all` (Tout le catalogue) row style for
 * consistency. The data shown here is a curated demo set that reflects
 * the shape of the upcoming live feed coming from LoadBrain
 * (`/admin/reseller-catalog/active-code`). Phase 2b decides the auth
 * path (X-API-Key public reseller route vs admin token bridge) and
 * swaps the in-page sample array for a server-action fetch.
 *
 * Source-hiding contract: brand always renders as "Code Premium", the
 * upstream provider name MUST never appear in the surface.
 */

interface ActiveCodeRow {
    readonly id: string;
    readonly title: string;
    readonly category: "iptv" | "test" | "vod" | "mango" | "server" | "internet" | "legacy";
    readonly region: "GLOBAL";
    readonly stock: number;
    readonly priceDzd: number;
}

const SAMPLE_ROWS: ReadonlyArray<ActiveCodeRow> = [
    { id: "ac-atlas-3m",      title: "Atlas Pro · 3 mois",   category: "iptv",     region: "GLOBAL", stock: 42,  priceDzd: 2_400 },
    { id: "ac-atlas-6m",      title: "Atlas Pro · 6 mois",   category: "iptv",     region: "GLOBAL", stock: 28,  priceDzd: 4_300 },
    { id: "ac-atlas-12m",     title: "Atlas Pro · 12 mois",  category: "iptv",     region: "GLOBAL", stock: 17,  priceDzd: 7_900 },
    { id: "ac-atlas-test",    title: "Atlas Pro · Test 24h", category: "test",     region: "GLOBAL", stock: 99,  priceDzd: 100 },
    { id: "ac-forever-12m",   title: "Forever IPTV · 12 mois", category: "iptv",   region: "GLOBAL", stock: 12,  priceDzd: 8_200 },
    { id: "ac-myhd-6m",       title: "MyHD · 6 mois",        category: "legacy",   region: "GLOBAL", stock: 8,   priceDzd: 5_100 },
    { id: "ac-iron-1m",       title: "IRON · 1 mois",        category: "iptv",     region: "GLOBAL", stock: 64,  priceDzd: 1_300 },
    { id: "ac-mango-adult",   title: "Mango · Adulte 12 mois", category: "mango",  region: "GLOBAL", stock: 5,   priceDzd: 9_500 },
];

const CATEGORY_CHIPS: ReadonlyArray<{ value: ActiveCodeRow["category"] | ""; label: string }> = [
    { value: "",          label: "Tous" },
    { value: "iptv",      label: "IPTV" },
    { value: "test",      label: "Test" },
    { value: "vod",       label: "VOD" },
    { value: "mango",     label: "Adulte" },
    { value: "server",    label: "Serveur" },
    { value: "internet",  label: "Internet" },
    { value: "legacy",    label: "Legacy" },
];

function formatDzd(amount: number): string {
    return new Intl.NumberFormat("fr-FR").format(amount);
}

export default function ResellerShopActiveCodePage() {
    const router = useRouter();
    const [rawQuery, setRawQuery] = useState("");
    const [region, setRegion] = useState<string>(ALL_REGION);
    const [subCategory, setSubCategory] = useState<ActiveCodeRow["category"] | "">("");

    const filtered = useMemo(() => {
        const q = rawQuery.trim().toLowerCase();
        return SAMPLE_ROWS.filter((row) => {
            if (subCategory && row.category !== subCategory) return false;
            if (region !== ALL_REGION && row.region !== region) return false;
            if (q && !row.title.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [rawQuery, region, subCategory]);

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
                    {filtered.length} résultat{filtered.length > 1 ? "s" : ""}
                    {rawQuery ? ` pour « ${rawQuery} »` : ""}
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

                {/* ─── Type chips (sub-category) ───────────────────────── */}
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

                {/* ─── Rows ──────────────────────────────────────────── */}
                {filtered.length === 0 ? (
                    <div className="mt-12 flex flex-col items-center justify-center text-center px-6 py-16 rounded-2xl border border-dashed border-neutral-800 bg-neutral-950">
                        <div className="w-16 h-16 rounded-full bg-[#FACC15]/10 flex items-center justify-center mb-4">
                            <Sparkles size={28} className="text-[#FACC15]" />
                        </div>
                        <h2 className="text-xl font-semibold mb-2">
                            Aucun résultat
                        </h2>
                        <p className="text-sm text-neutral-400 max-w-md">
                            Aucun code premium ne correspond à votre recherche.
                            Essayez un autre filtre ou supprimez la recherche.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filtered.map((row) => (
                            <button
                                key={row.id}
                                type="button"
                                onClick={() => {
                                    // Phase 3 will route to a purchase modal.
                                    // For now the row stays informative-only.
                                }}
                                className="w-full flex items-center justify-between gap-4 px-5 py-4 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-[#FACC15]/40 hover:bg-neutral-900/80 transition text-left"
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
                                    <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                                        {row.stock} en stock
                                    </span>
                                    <span className="text-lg font-bold text-white">
                                        {formatDzd(row.priceDzd)} DZD
                                    </span>
                                </div>
                            </button>
                        ))}
                    </div>
                )}

                {/* ─── Phase 2b notice ────────────────────────────────── */}
                <p className="mt-8 text-[11px] text-center text-neutral-600">
                    Catalogue de démonstration — les codes réels seront disponibles
                    une fois l&apos;intégration finalisée.
                </p>
            </div>
        </main>
    );
}
