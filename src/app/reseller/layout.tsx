"use client";

import React, { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { getPublicSettingsAction } from "@/app/admin/settings/actions";
import { Spinner } from "@heroui/react";
import { ShieldAlert, Store, Hammer, WifiOff } from "lucide-react";
import { ShopTopNav } from "./shop/components/ShopTopNav";

// Safety net: the settings server action should answer in well under a
// second. If it hangs (e.g. a broken/recompiling server), never leave the
// operator on an eternal spinner — surface a retry screen after this delay.
const SETTINGS_TIMEOUT_MS = 12000;

export default function ResellerLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isLoginPage = pathname === "/reseller/login";
    const [isEnabled, setIsEnabled] = useState<boolean | null>(null);
    const [isMaintenance, setIsMaintenance] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [shopName, setShopName] = useState("Ma Boutique");

    const loadSettings = useCallback(async () => {
        setIsLoading(true);
        setLoadError(false);
        try {
            const res = await Promise.race([
                getPublicSettingsAction(),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error("timeout")), SETTINGS_TIMEOUT_MS),
                ),
            ]);
            if (res.success && res.data) {
                setIsEnabled(res.data.isB2bEnabled);
                setIsMaintenance(res.data.isMaintenanceMode);
                if (res.data.shopName) setShopName(res.data.shopName);
            } else {
                setIsEnabled(false);
                setIsMaintenance(false);
            }
        } catch {
            // Action hung or rejected — show a recoverable error, not a spinner.
            setLoadError(true);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadSettings();
    }, [loadSettings]);

    if (isLoginPage) return <>{children}</>;

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center gap-6">
                <Spinner color="warning" size="lg" />
                <p className="text-slate-500 font-bold uppercase tracking-[0.3em] animate-pulse text-sm">
                    Sécurisation du portail B2B...
                </p>
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
                <div className="max-w-md w-full text-center space-y-8 animate-in fade-in zoom-in duration-500">
                    <div className="size-24 rounded-[40px] bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto shadow-2xl">
                        <WifiOff className="size-12 text-amber-500" />
                    </div>
                    <div className="space-y-4">
                        <h1 className="text-3xl font-black text-white tracking-tight">
                            Connexion impossible
                        </h1>
                        <p className="text-slate-500 font-medium leading-relaxed">
                            Le portail n&apos;a pas répondu à temps. Vérifiez votre connexion puis réessayez.
                        </p>
                    </div>
                    <div className="pt-4">
                        <button
                            onClick={() => void loadSettings()}
                            className="bg-[#161616] border border-[#262626] text-slate-300 hover:text-white px-8 py-3 rounded-2xl font-bold transition-all flex items-center gap-2 mx-auto active:scale-95"
                        >
                            <Store className="size-5 text-[var(--primary)]" />
                            <span>Réessayer</span>
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (isMaintenance) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
                <div className="max-w-md w-full text-center space-y-8 animate-in fade-in zoom-in duration-500">
                    <div className="size-24 rounded-[40px] bg-[var(--primary)]/10 border border-[var(--primary)]/20 flex items-center justify-center mx-auto shadow-2xl">
                        <Hammer className="size-12 text-[var(--primary)]" />
                    </div>
                    <div className="space-y-4">
                        <h1 className="text-3xl font-black text-white tracking-tight uppercase">
                            Maintenance en cours
                        </h1>
                        <p className="text-slate-500 font-medium leading-relaxed">
                            Nous effectuons des mises à jour pour améliorer votre expérience. Le portail reviendra dans quelques instants.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    if (isEnabled === false) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6 bg-gradient-to-b from-[#0a0a0a] to-[#1a0f0a]">
                <div className="max-w-md w-full text-center space-y-8 animate-in fade-in zoom-in duration-500">
                    <div className="size-24 rounded-[40px] bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto shadow-2xl">
                        <ShieldAlert className="size-12 text-red-500" />
                    </div>
                    <div className="space-y-4">
                        <h1 className="text-3xl font-black text-white tracking-tight">
                            Accès B2B Restreint
                        </h1>
                        <p className="text-slate-500 font-medium leading-relaxed">
                            Le portail partenaire est actuellement désactivé. Veuillez contacter l&apos;administrateur de <b>{shopName}</b> pour plus d&apos;informations.
                        </p>
                    </div>
                    <div className="pt-4">
                        <button
                            onClick={() => window.location.reload()}
                            className="bg-[#161616] border border-[#262626] text-slate-300 hover:text-white px-8 py-3 rounded-2xl font-bold transition-all flex items-center gap-2 mx-auto active:scale-95"
                        >
                            <Store className="size-5 text-[var(--primary)]" />
                            <span>Retour à l&apos;accueil</span>
                        </button>
                    </div>
                    <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest pt-10">
                        &copy; {new Date().getFullYear()} {shopName} BUSINESS SOLUTION
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-slate-200 flex flex-col">
            <ShopTopNav shopName={shopName} />
            <main className="flex-1 max-w-[1400px] mx-auto w-full px-4 lg:px-6 py-8 lg:py-12">
                {children}
            </main>
        </div>
    );
}
