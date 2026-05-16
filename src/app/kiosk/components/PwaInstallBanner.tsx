"use client";

import React, { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { useSettingsStore } from "@/store/useSettingsStore";

export default function PwaInstallBanner() {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [dismissed, setDismissed] = useState(false);
    const [isInstalled, setIsInstalled] = useState(false);
    const { shopName } = useSettingsStore();

    useEffect(() => {
        // Check if already installed
        if (window.matchMedia("(display-mode: standalone)").matches) {
            setIsInstalled(true);
            return;
        }

        const handler = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e);
        };

        window.addEventListener("beforeinstallprompt", handler);
        return () => window.removeEventListener("beforeinstallprompt", handler);
    }, []);

    const handleInstall = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const result = await deferredPrompt.userChoice;
        if (result.outcome === "accepted") {
            setIsInstalled(true);
        }
        setDeferredPrompt(null);
    };

    if (isInstalled || dismissed || !deferredPrompt) return null;

    return (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-gradient-to-r from-orange-500 to-orange-600 text-white px-4 py-3 flex items-center justify-between gap-3 shadow-lg animate-in slide-in-from-top duration-300">
            <div className="flex items-center gap-3 min-w-0">
                <Download className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm font-medium truncate">
                    Installez <strong>{shopName || "la boutique"}</strong> sur votre appareil
                </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
                <button
                    onClick={handleInstall}
                    className="bg-white text-orange-600 font-semibold text-sm px-4 py-1.5 rounded-full hover:bg-orange-50 transition-colors"
                >
                    Installer
                </button>
                <button
                    onClick={() => setDismissed(true)}
                    className="text-white/80 hover:text-white p-1"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
