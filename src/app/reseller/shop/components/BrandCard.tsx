"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { BrandCategory } from "../brand-utils";

interface BrandCardProps {
    readonly category: BrandCategory;
}

/**
 * 1:1 brand tile that links to the per-brand catalog page. Falls back to a
 * deterministic initial-on-gradient when no artwork is available so the grid
 * never looks broken in dev.
 */
export const BrandCard: React.FC<BrandCardProps> = ({ category }) => {
    const [imgFailed, setImgFailed] = useState(false);
    const initial = (category.label[0] || "?").toUpperCase();

    return (
        <Link
            href={`/reseller/shop/${encodeURIComponent(category.slug)}`}
            data-testid="brand-card"
            data-brand-slug={category.slug}
            className="group relative aspect-square overflow-hidden rounded-2xl bg-[#161616] border border-[#262626] hover:border-[#FACC15] hover:ring-2 hover:ring-[#FACC15]/30 transition-all"
        >
            {!imgFailed ? (
                <Image
                    src={category.imageUrl}
                    alt={category.label}
                    fill
                    sizes="(max-width: 768px) 50vw, 25vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    onError={() => setImgFailed(true)}
                />
            ) : (
                <div
                    className="absolute inset-0 flex items-center justify-center text-white"
                    style={{
                        background: `linear-gradient(135deg, hsl(${hashHue(category.slug)} 70% 35%), hsl(${hashHue(category.slug) + 40} 70% 20%))`,
                    }}
                >
                    <span className="text-6xl font-black tracking-tight opacity-90">
                        {initial}
                    </span>
                </div>
            )}

            {/* Top-left type badge (Gift Card / Top-Up / Mixed). */}
            <span
                data-testid="brand-type-badge"
                className={`absolute top-2 left-2 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md border backdrop-blur-sm ${
                    category.type === "topup"
                        ? "text-cyan-300 bg-cyan-500/15 border-cyan-400/40"
                        : category.type === "mixed"
                          ? "text-purple-300 bg-purple-500/15 border-purple-400/40"
                          : "text-emerald-300 bg-emerald-500/15 border-emerald-400/40"
                }`}
            >
                {category.type === "topup"
                    ? "Top-Up"
                    : category.type === "mixed"
                      ? "Mixed"
                      : "Gift Card"}
            </span>

            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-3">
                <div className="flex items-end justify-between gap-2">
                    <h3 className="text-sm font-black text-white tracking-tight line-clamp-1">
                        {category.label}
                    </h3>
                    {category.count > 0 && (
                        <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-[#FACC15] bg-black/40 border border-[#FACC15]/30 rounded-md px-1.5 py-0.5">
                            {category.count}
                        </span>
                    )}
                </div>
            </div>
        </Link>
    );
};

const HUE_MOD = 360;
function hashHue(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h) % HUE_MOD;
}
