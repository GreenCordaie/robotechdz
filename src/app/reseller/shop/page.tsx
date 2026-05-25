"use client";

import React, { useEffect, useState } from "react";
import { Spinner } from "@heroui/react";
import { CategoryGrid } from "./components/CategoryGrid";
import { getBrandCategoriesAction } from "./aggregate-brands";
import type { BrandCategory } from "./brand-utils";

export default function ResellerShopLanding() {
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

    return (
        <div className="space-y-10 animate-in fade-in duration-500">
            <header className="text-center space-y-3">
                <h1 className="text-3xl lg:text-5xl font-black text-white tracking-tight">
                    Gift Cards <span className="text-[#FACC15]">&amp;</span> Vouchers
                </h1>
                <p className="text-sm lg:text-base text-slate-400 max-w-2xl mx-auto">
                    Catalogue partenaire unifié — BSV &amp; G2Bulk, prix DZD négociés,
                    livraison automatique.
                </p>
            </header>

            {isLoading ? (
                <div className="py-20 flex justify-center">
                    <Spinner color="warning" />
                </div>
            ) : (
                <CategoryGrid categories={categories} />
            )}
        </div>
    );
}
