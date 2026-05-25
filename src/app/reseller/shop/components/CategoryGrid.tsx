"use client";

import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { BrandCard } from "./BrandCard";
import type { BrandCategory } from "../brand-utils";

interface CategoryGridProps {
    readonly categories: ReadonlyArray<BrandCategory>;
}

export const CategoryGrid: React.FC<CategoryGridProps> = ({ categories }) => {
    const [query, setQuery] = useState("");

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return categories;
        return categories.filter(
            (c) => c.label.toLowerCase().includes(q) || c.slug.includes(q)
        );
    }, [categories, query]);

    return (
        <div className="space-y-6">
            <div className="relative max-w-xl mx-auto w-full">
                <Search
                    size={16}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                    type="search"
                    placeholder="Rechercher une catégorie…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    data-testid="category-search"
                    className="w-full h-12 pl-11 pr-4 rounded-full bg-[#161616] border border-[#262626] text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FACC15]/60 focus:ring-2 focus:ring-[#FACC15]/20 transition-all"
                />
            </div>

            <p className="text-center text-xs font-black uppercase tracking-widest text-slate-500">
                {filtered.length} catégorie{filtered.length === 1 ? "" : "s"} disponible
                {filtered.length === 1 ? "" : "s"}
            </p>

            {filtered.length === 0 ? (
                <p className="text-center text-slate-500 italic py-12">
                    Aucune catégorie ne correspond à « {query} ».
                </p>
            ) : (
                <div
                    data-testid="category-grid"
                    className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4"
                >
                    {filtered.map((c) => (
                        <BrandCard key={c.slug} category={c} />
                    ))}
                </div>
            )}
        </div>
    );
};
