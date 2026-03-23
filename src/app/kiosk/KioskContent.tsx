"use client";

import React, { useEffect, useState } from "react";
import { useKioskStore } from "@/store/useKioskStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import IdleView from "./views/IdleView";
import CatalogueView from "./views/CatalogueView";
import CartView from "./views/CartView";
import ConfirmationView from "./views/ConfirmationView";
import { getKioskData } from "./actions";

export default function KioskContent() {
    const { step, resetKiosk } = useKioskStore();
    const [data, setData] = useState<{ products: any[], categories: any[] } | null>(null);

    const { fetchSettings } = useSettingsStore();

    // Initial data fetch
    useEffect(() => {
        getKioskData().then(setData).catch(console.error);
        fetchSettings();
    }, [fetchSettings]);

    // Inactivity timeout: 60s
    useEffect(() => {
        if (step === "IDLE") return;

        let timeoutId: NodeJS.Timeout;

        const resetTimer = () => {
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                resetKiosk();
            }, 60000); // 60 seconds
        };

        // Listen for user activity
        const activities = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
        activities.forEach(name => document.addEventListener(name, resetTimer, true));

        // Initial start
        resetTimer();

        return () => {
            if (timeoutId) clearTimeout(timeoutId);
            activities.forEach(name => document.removeEventListener(name, resetTimer, true));
        };
    }, [step, resetKiosk]);

    if (!data) return null; // Or a simple loader

    return (
        <div className="h-full w-full relative overflow-hidden bg-white">
            {step === "IDLE" && <IdleView products={data.products.slice(0, 4)} />}
            {step === "CATALOGUE" && <CatalogueView products={data.products} categories={data.categories} />}
            {step === "CART" && <CartView />}
            {step === "CONFIRMATION" && <ConfirmationView />}
        </div>
    );
}
