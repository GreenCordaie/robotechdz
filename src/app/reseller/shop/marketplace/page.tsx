"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search, Store } from "lucide-react";
import { toast } from "react-hot-toast";

import { getMarketplaceTrackedAction } from "../actions";
import { BsvListingGrid } from "../components/BsvListingGrid";
import type { EnrichedBsvListing, BsvListingsPagination } from "@/types/bsv-listings";

type DeliveryFilter = "all" | "auto" | "manual";

const DELIVERY_PILLS: ReadonlyArray<{ value: DeliveryFilter; label: string }> = [
    { value: "all", label: "Tous" },
    { value: "auto", label: "⚡ Instantané" },
    { value: "manual", label: "⏳ Sous 24h" },
];

/**
 * Curated Marketplace (Phase 1 — display) — shows ONLY the products the
 * operator hand-tracked in /admin/arbitrage (giftcards.bsv_tracked_links),
 * synced with live BSV price/stock/seller/delivery. Buying is wired in Phase 2.
 */
export default function ResellerMarketplacePage() {
    const router = useRouter();

    const [allItems, setAllItems] = useState<ReadonlyArray<EnrichedBsvListing>>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [rawQuery, setRawQuery] = useState("");
    const [query, setQuery] = useState("");
    const [delivery, setDelivery] = useState<DeliveryFilter>("all");

    /* ───── Load curated tracked products once ───── */
    useEffect(() => {
        let active = true;
        setIsLoading(true);
        setError(null);
        getMarketplaceTrackedAction({})
            .then((res) => {
                if (!active) return;
                if (res.success) setAllItems(res.data.items);
                else setError(res.error);
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });
        return () => {
            active = false;
        };
    }, []);

    /* ───── Debounce search (250ms) ───── */
    useEffect(() => {
        const t = setTimeout(() => setQuery(rawQuery.trim().toLowerCase()), 250);
        return () => clearTimeout(t);
    }, [rawQuery]);

    const filtered = useMemo(() => {
        return allItems.filter((it) => {
            if (delivery !== "all" && it.deliveryType !== delivery) return false;
            if (query) {
                const hay = `${it.product.displayName} ${it.seller.slug}`.toLowerCase();
                if (!hay.includes(query)) return false;
            }
            return true;
        });
    }, [allItems, query, delivery]);

    const pagination: BsvListingsPagination = {
        page: 1,
        limit: filtered.length || 1,
        total: filtered.length,
        totalPages: 1,
    };

    const countLabel = isLoading
        ? "Chargement…"
        : error
          ? "Catalogue indisponible"
          : `${filtered.length} produit${filtered.length === 1 ? "" : "s"} suivi${filtered.length === 1 ? "" : "s"}`;

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <button
                onClick={() => router.push("/reseller/shop")}
                className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
                <ArrowLeft size={14} />
                Retour aux catégories
            </button>

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
                    placeholder="Rechercher (produit, vendeur…)"
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

            {error ? (
                <div className="text-center text-slate-500 italic py-12">
                    Réessayez dans un instant. ({error})
                </div>
            ) : (
                <BsvListingGrid
                    items={filtered as EnrichedBsvListing[]}
                    pagination={pagination}
                    isLoading={isLoading}
                    cartListingIds={new Set()}
                    onAddToCart={() =>
                        toast("Achat des produits suivis : bientôt disponible.", { icon: "🛒" })
                    }
                    onPageChange={() => undefined}
                    ctaLabel="Acheter"
                />
            )}
        </div>
    );
}
