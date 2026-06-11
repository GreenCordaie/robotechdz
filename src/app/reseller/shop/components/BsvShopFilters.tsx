"use client";

import React from "react";
import { Select, SelectItem, Input } from "@heroui/react";
import { Search } from "lucide-react";

export type DeliveryFilter = "all" | "auto" | "manual";
export type SellerRankFilter = "all" | "L4" | "L7" | "L9";
export type SortFilter = "score" | "price_asc" | "price_desc" | "newest";

export interface BsvShopFiltersValue {
    q: string;
    brand: string;
    category: string;
    region: string;
    deliveryType: DeliveryFilter;
    sellerRankMin: SellerRankFilter;
    priceMinDzd?: number;
    priceMaxDzd?: number;
    sortBy: SortFilter;
}

export interface BsvShopFiltersProps {
    value: BsvShopFiltersValue;
    onChange: (next: BsvShopFiltersValue) => void;
}

const BRAND_OPTIONS = [
    { key: "", label: "Toutes marques" },
    { key: "free-fire", label: "Free Fire" },
    { key: "pubg-mobile", label: "PUBG Mobile" },
    { key: "netflix", label: "Netflix" },
    { key: "spotify", label: "Spotify" },
    { key: "amazon", label: "Amazon" },
    { key: "steam", label: "Steam" },
    { key: "google-play", label: "Google Play" },
    { key: "itunes", label: "iTunes" },
];

const CATEGORY_OPTIONS = [
    { key: "", label: "Toutes catégories" },
    { key: "gaming", label: "Gaming" },
    { key: "streaming", label: "Streaming" },
    { key: "retail", label: "Retail" },
    { key: "mobile", label: "Mobile" },
    { key: "other", label: "Autre" },
];

const REGION_OPTIONS = [
    { key: "", label: "Toutes régions" },
    { key: "GLOBAL", label: "Global" },
    { key: "MENA", label: "MENA" },
    { key: "US", label: "USA" },
    { key: "EU", label: "Europe" },
    { key: "TR", label: "Turquie" },
];

const SORT_OPTIONS: { key: SortFilter; label: string }[] = [
    { key: "score", label: "Pertinence (Score)" },
    { key: "price_asc", label: "Prix ↑" },
    { key: "price_desc", label: "Prix ↓" },
    { key: "newest", label: "Plus récents" },
];

const DELIVERY_PILLS: { key: DeliveryFilter; label: string }[] = [
    { key: "all", label: "Tout" },
    { key: "auto", label: "⚡ Instant" },
    { key: "manual", label: "🕓 Sous 24h" },
];

const RANK_PILLS: { key: SellerRankFilter; label: string }[] = [
    { key: "all", label: "Tous" },
    { key: "L4", label: "L4+" },
    { key: "L7", label: "L7+" },
    { key: "L9", label: "L9 uniquement" },
];

export function BsvShopFilters({ value, onChange }: BsvShopFiltersProps) {
    const update = <K extends keyof BsvShopFiltersValue>(
        key: K,
        v: BsvShopFiltersValue[K]
    ) => {
        onChange({ ...value, [key]: v });
    };

    return (
        <div
            data-testid="bsv-shop-filters"
            className="space-y-4 bg-[#0f0f0f] border border-[#262626] rounded-3xl p-5"
        >
            {/* Search bar */}
            <div className="relative">
                <Search
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 z-10"
                    size={18}
                />
                <Input
                    data-testid="bsv-search-input"
                    value={value.q}
                    onValueChange={(v) => update("q", v)}
                    placeholder="Rechercher (Free Fire, Netflix, ...)"
                    classNames={{
                        input: "pl-10 text-sm",
                        inputWrapper:
                            "bg-[#161616] border border-[#262626] rounded-2xl h-12",
                    }}
                />
            </div>

            {/* Dropdowns */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Select
                    label="Marque"
                    size="sm"
                    selectedKeys={[value.brand]}
                    onSelectionChange={(keys) =>
                        update("brand", Array.from(keys)[0]?.toString() ?? "")
                    }
                    classNames={{ trigger: "bg-[#161616] border border-[#262626]" }}
                >
                    {BRAND_OPTIONS.map((opt) => (
                        <SelectItem key={opt.key}>{opt.label}</SelectItem>
                    ))}
                </Select>

                <Select
                    label="Catégorie"
                    size="sm"
                    selectedKeys={[value.category]}
                    onSelectionChange={(keys) =>
                        update("category", Array.from(keys)[0]?.toString() ?? "")
                    }
                    classNames={{ trigger: "bg-[#161616] border border-[#262626]" }}
                >
                    {CATEGORY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.key}>{opt.label}</SelectItem>
                    ))}
                </Select>

                <Select
                    label="Région"
                    size="sm"
                    selectedKeys={[value.region]}
                    onSelectionChange={(keys) =>
                        update("region", Array.from(keys)[0]?.toString() ?? "")
                    }
                    classNames={{ trigger: "bg-[#161616] border border-[#262626]" }}
                >
                    {REGION_OPTIONS.map((opt) => (
                        <SelectItem key={opt.key}>{opt.label}</SelectItem>
                    ))}
                </Select>

                <Select
                    label="Trier par"
                    size="sm"
                    selectedKeys={[value.sortBy]}
                    onSelectionChange={(keys) =>
                        update(
                            "sortBy",
                            (Array.from(keys)[0]?.toString() ??
                                "score") as SortFilter
                        )
                    }
                    classNames={{ trigger: "bg-[#161616] border border-[#262626]" }}
                >
                    {SORT_OPTIONS.map((opt) => (
                        <SelectItem key={opt.key}>{opt.label}</SelectItem>
                    ))}
                </Select>
            </div>

            {/* Pills row */}
            <div className="flex flex-col md:flex-row gap-3">
                <FilterPills
                    label="Livraison"
                    options={DELIVERY_PILLS}
                    selected={value.deliveryType}
                    onSelect={(k) => update("deliveryType", k)}
                />
                <FilterPills
                    label="Rang vendeur"
                    options={RANK_PILLS}
                    selected={value.sellerRankMin}
                    onSelect={(k) => update("sellerRankMin", k)}
                />
            </div>

            {/* Price range */}
            <div className="grid grid-cols-2 gap-3">
                <Input
                    type="number"
                    label="Prix min (DZD)"
                    size="sm"
                    value={value.priceMinDzd?.toString() ?? ""}
                    onValueChange={(v) =>
                        update(
                            "priceMinDzd",
                            v === "" ? undefined : Number(v)
                        )
                    }
                    classNames={{
                        inputWrapper: "bg-[#161616] border border-[#262626]",
                    }}
                />
                <Input
                    type="number"
                    label="Prix max (DZD)"
                    size="sm"
                    value={value.priceMaxDzd?.toString() ?? ""}
                    onValueChange={(v) =>
                        update(
                            "priceMaxDzd",
                            v === "" ? undefined : Number(v)
                        )
                    }
                    classNames={{
                        inputWrapper: "bg-[#161616] border border-[#262626]",
                    }}
                />
            </div>
        </div>
    );
}

function FilterPills<T extends string>({
    label,
    options,
    selected,
    onSelect,
}: {
    label: string;
    options: { key: T; label: string }[];
    selected: T;
    onSelect: (k: T) => void;
}) {
    return (
        <div className="flex-1">
            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2">
                {label}
            </p>
            <div className="flex gap-1.5 bg-[#161616] p-1.5 rounded-2xl border border-[#262626] flex-wrap">
                {options.map((opt) => (
                    <button
                        key={opt.key}
                        type="button"
                        onClick={() => onSelect(opt.key)}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                            selected === opt.key
                                ? "bg-[var(--primary)] text-white shadow-lg shadow-orange-950/20"
                                : "text-slate-500 hover:text-white"
                        }`}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
