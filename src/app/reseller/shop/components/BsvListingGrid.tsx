"use client";

import React from "react";
import { Button, Spinner } from "@heroui/react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { BsvListingCard } from "./BsvListingCard";
import type { EnrichedBsvListing } from "@/types/bsv-listings";

interface PaginationMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export interface BsvListingGridProps {
    items: EnrichedBsvListing[];
    pagination: PaginationMeta;
    isLoading: boolean;
    cartListingIds: Set<string>;
    onAddToCart: (listing: EnrichedBsvListing) => void;
    onPageChange: (page: number) => void;
    ctaLabel?: string;
}

export function BsvListingGrid({
    items,
    pagination,
    isLoading,
    cartListingIds,
    onAddToCart,
    onPageChange,
    ctaLabel,
}: BsvListingGridProps) {
    if (isLoading) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center py-40 gap-4">
                <Spinner color="warning" size="lg" />
                <p className="text-slate-500 font-bold uppercase tracking-[0.3em] animate-pulse">
                    Chargement du catalogue BSV...
                </p>
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center py-40 space-y-6 opacity-40">
                <div className="size-32 rounded-[40px] bg-[#161616] border border-[#262626] flex items-center justify-center">
                    <Search size={48} className="text-slate-500" />
                </div>
                <p className="text-xl font-bold text-slate-500 italic">
                    Aucune annonce ne correspond à vos filtres
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div
                data-testid="bsv-listing-grid"
                className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 max-w-7xl mx-auto"
            >
                {items.map((listing) => (
                    <BsvListingCard
                        key={listing.listingId}
                        listing={listing}
                        onAddToCart={() => onAddToCart(listing)}
                        isInCart={cartListingIds.has(listing.listingId)}
                        ctaLabel={ctaLabel}
                    />
                ))}
            </div>

            {pagination.totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pb-20">
                    <Button
                        size="sm"
                        variant="flat"
                        isDisabled={pagination.page <= 1}
                        onPress={() => onPageChange(pagination.page - 1)}
                        startContent={<ChevronLeft size={16} />}
                        className="bg-[#161616] text-slate-300 font-bold"
                    >
                        Précédent
                    </Button>
                    <span className="text-xs text-slate-500 font-black uppercase tracking-widest">
                        Page {pagination.page} / {pagination.totalPages}
                        <span className="ml-2 text-slate-600 normal-case font-medium">
                            ({pagination.total} annonces)
                        </span>
                    </span>
                    <Button
                        size="sm"
                        variant="flat"
                        isDisabled={pagination.page >= pagination.totalPages}
                        onPress={() => onPageChange(pagination.page + 1)}
                        endContent={<ChevronRight size={16} />}
                        className="bg-[#161616] text-slate-300 font-bold"
                    >
                        Suivant
                    </Button>
                </div>
            )}
        </div>
    );
}
