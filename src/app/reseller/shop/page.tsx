"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Spinner } from "@heroui/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { CategoryGrid } from "./components/CategoryGrid";
import { getBrandCategoriesAction } from "./aggregate-brands";
import type { BrandCategory, BrandType } from "./brand-utils";

type Tab = "all" | "giftcard" | "topup";

const TAB_META: Record<
    Tab,
    {
        label: string;
        title: string;
        subtitle: string;
        keep: (t: BrandType) => boolean;
    }
> = {
    all: {
        label: "Tout le catalogue",
        title: "Catalogue partenaire",
        subtitle:
            "Cartes cadeaux régionales et top-ups in-game — prix DZD négociés, livraison automatique.",
        keep: () => true,
    },
    giftcard: {
        label: "Gift Cards & Vouchers",
        title: "Gift Cards & Vouchers",
        subtitle:
            "Crédit régional pour les wallets : Steam, PSN, Apple iTunes, Amazon, Razer Gold…",
        keep: (t) => t === "giftcard" || t === "mixed",
    },
    topup: {
        label: "Game Top-Up",
        title: "Game Top-Up",
        subtitle:
            "Recharge directe in-game : PUBG UC, Free Fire Diamonds, Yalla Gold, Robux…",
        keep: (t) => t === "topup" || t === "mixed",
    },
};

function parseTab(raw: string | null): Tab {
    if (raw === "giftcard" || raw === "topup") return raw;
    return "all";
}

export default function ResellerShopLanding() {
    const searchParams = useSearchParams();
    const tab = parseTab(searchParams.get("type"));
    const meta = TAB_META[tab];

    const [categories, setCategories] = useState<ReadonlyArray<BrandCategory>>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let active = true;
        getBrandCategoriesAction()
            .then((res) => {
                if (!active) return;
                if (res.success) setCategories(res.data);
            })
            .catch(() => {
                if (active) setCategories([]);
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });
        return () => {
            active = false;
        };
    }, []);

    const filtered = useMemo(
        () => categories.filter((c) => meta.keep(c.type)),
        [categories, meta],
    );

    return (
        <div className="space-y-10 animate-in fade-in duration-500">
            <header className="text-center space-y-3">
                <h1 className="text-3xl lg:text-5xl font-black text-white tracking-tight">
                    {meta.title.includes("&") ? (
                        <>
                            {meta.title.split("&")[0]}
                            <span className="text-[#FACC15]">&amp;</span>
                            {meta.title.split("&")[1]}
                        </>
                    ) : (
                        meta.title
                    )}
                </h1>
                <p className="text-sm lg:text-base text-slate-400 max-w-2xl mx-auto">
                    {meta.subtitle}
                </p>
                <div className="pt-2">
                    <Link
                        href="/reseller/shop/all"
                        data-testid="view-all-catalog"
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#161616] border border-[#262626] text-sm font-black tracking-tight text-white hover:border-[#FACC15] hover:text-[#FACC15] transition-all"
                    >
                        <LayoutGrid size={15} />
                        Voir tout le catalogue
                    </Link>
                </div>
            </header>

            {isLoading ? (
                <div className="py-20 flex justify-center">
                    <Spinner color="warning" />
                </div>
            ) : (
                <CategoryGrid categories={filtered} />
            )}
        </div>
    );
}
