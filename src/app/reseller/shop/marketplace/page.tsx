"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@heroui/react";
import { ArrowLeft, Search, Store } from "lucide-react";
import { toast } from "react-hot-toast";

import { getMarketplaceTrackedAction } from "../actions";
import {
    DenominationRow,
    PurchasePanel,
    bsvToDenomination,
    type Denomination,
} from "../components/Denomination";
import type { EnrichedBsvListing } from "@/types/bsv-listings";

type DeliveryFilter = "all" | "auto" | "manual";

const DELIVERY_PILLS: ReadonlyArray<{ value: DeliveryFilter; label: string }> = [
    { value: "all", label: "Tous" },
    { value: "auto", label: "⚡ Instantané" },
    { value: "manual", label: "⏳ Sous 24h" },
];

const deliveryOf = (d: Denomination): "auto" | "manual" =>
    (d.raw as EnrichedBsvListing).deliveryType === "auto" ? "auto" : "manual";

/**
 * Curated Marketplace (Phase 1 — display) — lists ONLY the products the
 * operator hand-tracked in /admin/arbitrage, synced with live BSV
 * price/stock/delivery. Supplier + seller are fully hidden (rows show
 * "ROBOTECHDZ"). Buying is wired in Phase 2.
 */
export default function ResellerMarketplacePage() {
    const router = useRouter();

    const [items, setItems] = useState<ReadonlyArray<Denomination>>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [rawQuery, setRawQuery] = useState("");
    const [query, setQuery] = useState("");
    const [delivery, setDelivery] = useState<DeliveryFilter>("all");
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [quantity, setQuantity] = useState(1);

    /* ───── Load curated tracked products once ───── */
    useEffect(() => {
        let active = true;
        setIsLoading(true);
        setError(null);
        getMarketplaceTrackedAction({})
            .then((res) => {
                if (!active) return;
                if (res.success) {
                    setItems(res.data.items.map((l) => bsvToDenomination(l)));
                } else {
                    setError(res.error);
                }
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });
        return () => {
            active = false;
        };
    }, []);

    /* ───── Debounce search ───── */
    useEffect(() => {
        const t = setTimeout(() => setQuery(rawQuery.trim().toLowerCase()), 250);
        return () => clearTimeout(t);
    }, [rawQuery]);

    const filtered = useMemo(() => {
        return items.filter((it) => {
            if (delivery !== "all" && deliveryOf(it) !== delivery) return false;
            if (query && !it.title.toLowerCase().includes(query)) return false;
            return true;
        });
    }, [items, query, delivery]);

    const selected = useMemo(
        () => items.find((it) => it.key === selectedKey) ?? null,
        [items, selectedKey],
    );

    const countLabel = isLoading
        ? "Chargement…"
        : error
          ? "Catalogue indisponible"
          : `${filtered.length} produit${filtered.length === 1 ? "" : "s"}`;

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <button
                onClick={() => router.push("/reseller/shop")}
                className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
                <ArrowLeft size={14} />
                Retour aux catégories
            </button>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
                {/* LEFT: header + search + filters + list */}
                <div className="space-y-5 min-w-0">
                    <div className="space-y-1">
                        <h1 className="text-4xl lg:text-5xl font-black text-white tracking-tight flex items-center gap-3">
                            <Store className="text-[#FACC15]" size={36} />
                            Marketplace
                        </h1>
                        <p className="text-sm text-slate-400">{countLabel}</p>
                    </div>

                    <div className="relative">
                        <Search
                            size={16}
                            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
                        />
                        <input
                            type="search"
                            placeholder="Rechercher un produit…"
                            value={rawQuery}
                            onChange={(e) => setRawQuery(e.target.value)}
                            data-testid="marketplace-search"
                            className="w-full h-12 pl-11 pr-4 rounded-full bg-[#161616] border border-[#262626] text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FACC15]/60 focus:ring-2 focus:ring-[#FACC15]/20 transition-all"
                        />
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {DELIVERY_PILLS.map((pill) => (
                            <button
                                key={pill.value}
                                type="button"
                                onClick={() => setDelivery(pill.value)}
                                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                                    delivery === pill.value
                                        ? "bg-[#FACC15] text-black border-[#FACC15]"
                                        : "bg-[#161616] text-slate-300 border-[#262626] hover:border-[#FACC15]/40"
                                }`}
                            >
                                {pill.label}
                            </button>
                        ))}
                    </div>

                    {isLoading ? (
                        <div className="py-20 flex justify-center">
                            <Spinner color="warning" />
                        </div>
                    ) : error ? (
                        <p className="text-center text-slate-500 italic py-12">
                            Réessayez dans un instant. ({error})
                        </p>
                    ) : filtered.length === 0 ? (
                        <p className="text-center text-slate-500 italic py-12">
                            Aucun produit pour le moment.
                        </p>
                    ) : (
                        <ul className="space-y-2" data-testid="marketplace-list">
                            {filtered.map((it) => (
                                <DenominationRow
                                    key={it.key}
                                    item={it}
                                    selected={selectedKey === it.key}
                                    onSelect={(d) => {
                                        setSelectedKey(d.key);
                                        setQuantity(1);
                                    }}
                                    deliveryType={deliveryOf(it)}
                                />
                            ))}
                        </ul>
                    )}
                </div>

                {/* RIGHT: sticky purchase panel (Phase 2 wires the real buy) */}
                <aside className="lg:sticky lg:top-24">
                    <PurchasePanel
                        item={selected}
                        quantity={quantity}
                        onQuantity={setQuantity}
                        isCheckingOut={false}
                        onPurchase={() =>
                            toast("Achat des produits suivis : bientôt disponible.", {
                                icon: "🛒",
                            })
                        }
                    />
                </aside>
            </div>
        </div>
    );
}
