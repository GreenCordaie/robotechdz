"use client";

import React from "react";
import { Button } from "@heroui/react";
import { ShoppingCart } from "lucide-react";

import { formatCurrency } from "@/lib/formatters";
import { parseDurationFromName } from "./iptv-status";

export interface IptvProductLike {
    readonly id: string;
    readonly name: string;
    readonly priceDzd: number;
}

interface IptvCatalogCardProps {
    readonly product: IptvProductLike;
    readonly onBuy: (product: IptvProductLike) => void;
}

export const IptvCatalogCard: React.FC<IptvCatalogCardProps> = ({
    product,
    onBuy,
}) => {
    const duration = parseDurationFromName(product.name);
    return (
        <div className="group flex flex-col gap-3 bg-[#161616] border border-[#262626] rounded-2xl p-4 hover:border-[#FACC15]/40 hover:bg-[#1a1a1a] transition-all">
            <div className="flex items-start justify-between gap-2 min-h-[3rem]">
                <h3 className="text-sm font-black text-white leading-snug line-clamp-3">
                    {product.name}
                </h3>
                {duration && (
                    <span className="shrink-0 px-2 py-0.5 rounded-md bg-[#FACC15]/10 border border-[#FACC15]/30 text-[10px] font-black uppercase tracking-wider text-[#FACC15]">
                        {duration}
                    </span>
                )}
            </div>

            <div className="mt-auto flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-[#FACC15]">
                    {formatCurrency(product.priceDzd, "DZD")}
                </span>
            </div>

            <Button
                onPress={() => onBuy(product)}
                className="w-full h-10 bg-[#FACC15] text-black font-black text-sm rounded-xl hover:bg-[#FACC15]/90 transition-colors"
                startContent={<ShoppingCart size={14} />}
            >
                Acheter
            </Button>
        </div>
    );
};

export default IptvCatalogCard;
