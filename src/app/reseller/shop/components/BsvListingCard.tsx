"use client";

import React from "react";
import { Card, CardBody, Button } from "@heroui/react";
import {
    Zap,
    Clock,
    ThumbsUp,
    ThumbsDown,
    Package,
    Trophy,
    Plus,
    Check,
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import type { EnrichedBsvListing } from "@/types/bsv-listings";

export interface BsvListingCardProps {
    listing: EnrichedBsvListing;
    onAddToCart: () => void;
    isInCart: boolean;
    /** CTA label (default "Panier"). Marketplace uses "Acheter" for direct buy. */
    ctaLabel?: string;
}

/**
 * BSV mirror listing card. Shows seller, rank, reviews, delivery type, stock,
 * computed DZD price, and discount label.
 *
 * Mobile-first, designed to fit the existing reseller shop grid
 * (grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5).
 */
export function BsvListingCard({
    listing,
    onAddToCart,
    isInCart,
    ctaLabel = "Panier",
}: BsvListingCardProps) {
    const {
        product,
        seller,
        deliveryType,
        stockQty,
        pricing,
        rawTitle,
    } = listing;

    const hasDiscount = pricing.discountPct > 0;

    return (
        <Card
            data-testid="bsv-listing-card"
            className="bg-[#161616] border border-[#262626] hover:border-[var(--primary)]/40 transition-all rounded-[24px] overflow-hidden"
        >
            <CardBody className="p-0 flex flex-col">
                {/* Header strip: badges */}
                <div className="flex items-center justify-between px-4 pt-4">
                    <div className="flex gap-1.5 flex-wrap">
                        <DeliveryBadge type={deliveryType} />
                        {(stockQty ?? 0) > 0 ? (
                            <span className="px-2 py-1 rounded-md bg-emerald-500/15 text-[9px] font-black text-emerald-400 uppercase border border-emerald-500/25 flex items-center gap-1">
                                <Package size={10} /> {stockQty ?? 0}
                            </span>
                        ) : (
                            <span className="px-2 py-1 rounded-md bg-red-500/15 text-[9px] font-black text-red-400 uppercase border border-red-500/25">
                                Rupture
                            </span>
                        )}
                    </div>
                    <RankPill rank={seller.rank} />
                </div>

                {/* Title block */}
                <div className="px-4 pt-3 pb-2">
                    <h4 className="font-bold text-white text-sm leading-snug line-clamp-2 min-h-[40px]">
                        {product.displayName}
                    </h4>
                    <p
                        className="text-[10px] text-slate-500 font-medium mt-1 line-clamp-2"
                        title={rawTitle ?? undefined}
                    >
                        {rawTitle}
                    </p>
                    <p className="text-[10px] text-slate-600 mt-0.5 uppercase tracking-wider">
                        {product.region}
                    </p>
                </div>

                {/* Seller block */}
                <div className="px-4 py-3 bg-[#0f0f0f] border-t border-[#262626]">
                    <p className="text-[10px] text-slate-400 font-bold flex items-center gap-1.5 truncate">
                        <span className="text-slate-500">Vendeur:</span>
                        <span className="text-white truncate" title={seller.slug}>
                            {seller.slug}
                        </span>
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 text-[10px]">
                        <span className="flex items-center gap-1 text-emerald-500 font-bold">
                            <ThumbsUp size={10} />
                            {seller.positiveReviews}
                        </span>
                        <span className="flex items-center gap-1 text-red-500 font-bold">
                            <ThumbsDown size={10} />
                            {seller.negativeReviews}
                        </span>
                    </div>
                </div>

                {/* Price + action */}
                <div className="px-4 py-3 border-t border-[#262626] flex items-center justify-between gap-2">
                    <div className="flex flex-col">
                        {hasDiscount && (
                            <span className="text-[10px] text-slate-500 font-bold line-through opacity-60">
                                {formatCurrency(pricing.listPriceDzd, "DZD")}
                            </span>
                        )}
                        <span className="text-base font-black text-white leading-tight">
                            {formatCurrency(pricing.finalPriceDzd, "DZD")}
                        </span>
                        {hasDiscount && (
                            <span className="text-[9px] text-emerald-500 font-bold uppercase tracking-wider">
                                −{pricing.discountPct.toFixed(0)}% partenaire
                            </span>
                        )}
                    </div>

                    <Button
                        data-testid="bsv-add-to-cart"
                        onPress={onAddToCart}
                        isDisabled={(stockQty ?? 0) <= 0}
                        size="sm"
                        className={`font-black uppercase text-[10px] tracking-wider rounded-xl px-3 h-9 ${
                            isInCart
                                ? "bg-emerald-500 text-white"
                                : "bg-[var(--primary)] text-white"
                        }`}
                        startContent={
                            isInCart ? <Check size={14} /> : <Plus size={14} />
                        }
                    >
                        {isInCart ? "Ajouté" : ctaLabel}
                    </Button>
                </div>
            </CardBody>
        </Card>
    );
}

function DeliveryBadge({ type }: { type: "auto" | "manual" }) {
    if (type === "auto") {
        return (
            <span className="px-2 py-1 rounded-md bg-cyan-500/15 text-[9px] font-black text-cyan-400 uppercase border border-cyan-500/30 flex items-center gap-1">
                <Zap size={10} /> Instant
            </span>
        );
    }
    return (
        <span className="px-2 py-1 rounded-md bg-amber-500/15 text-[9px] font-black text-amber-400 uppercase border border-amber-500/30 flex items-center gap-1">
            <Clock size={10} /> Sous 24h
        </span>
    );
}

function RankPill({ rank }: { rank: string | null }) {
    if (!rank) return null;
    const isHigh = rank === "L8" || rank === "L9";
    return (
        <span
            className={`px-2 py-1 rounded-md text-[9px] font-black uppercase border flex items-center gap-1 ${
                isHigh
                    ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
                    : "bg-slate-500/15 text-slate-300 border-slate-500/30"
            }`}
            title={`Rang vendeur ${rank}`}
        >
            <Trophy size={10} /> {rank}
        </span>
    );
}
