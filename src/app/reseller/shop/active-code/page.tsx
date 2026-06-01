"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search, KeyRound, Sparkles } from "lucide-react";

import { ALL_REGION, RegionPills } from "../components/Denomination";

/**
 * Active Code — Phase 1 visual MVP.
 *
 * Surface placeholder for the "Active Code" category that mirrors the layout
 * of `/reseller/shop/all` (Tout le catalogue) so the topnav structure feels
 * consistent. Wiring of the real backend (LoadBrain dedicated reseller
 * catalog route) is deferred to Phase 2.
 *
 * Source-hiding rule: never mention the upstream provider name here.
 */
export default function ResellerShopActiveCodePage() {
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [region, setRegion] = useState<string>(ALL_REGION);

    // Empty catalog — Phase 2 wires LoadBrain `/admin/reseller-catalog/active-code`.
    const items: ReadonlyArray<{ region: string }> = [];
    const regions: ReadonlyArray<string> = ["GLOBAL"];

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
                <p className="text-sm text-neutral-400 mb-8">
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
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Rechercher un code, une durée…"
                        className="w-full pl-12 pr-4 py-3 bg-neutral-900 border border-neutral-800 rounded-xl text-white placeholder:text-neutral-500 focus:outline-none focus:border-[#FACC15] transition"
                    />
                </div>

                {/* ─── Region pills (visual continuity with /shop/all) ── */}
                <RegionPills
                    regions={regions}
                    value={region}
                    onChange={setRegion}
                />

                {/* ─── Empty state — Phase 2 wires real catalog ────── */}
                <div className="mt-12 flex flex-col items-center justify-center text-center px-6 py-16 rounded-2xl border border-dashed border-neutral-800 bg-neutral-950">
                    <div className="w-16 h-16 rounded-full bg-[#FACC15]/10 flex items-center justify-center mb-4">
                        <Sparkles size={28} className="text-[#FACC15]" />
                    </div>
                    <h2 className="text-xl font-semibold mb-2">
                        Catalogue en préparation
                    </h2>
                    <p className="text-sm text-neutral-400 max-w-md">
                        Les codes premium sont en cours d&apos;activation. Ils
                        apparaîtront ici dès qu&apos;ils seront disponibles à
                        l&apos;achat.
                    </p>
                </div>

                {items.length === 0 ? null : null /* reserved for Phase 2 listing */}
            </div>
        </main>
    );
}
