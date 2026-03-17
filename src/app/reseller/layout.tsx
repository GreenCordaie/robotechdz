"use client";

import React, { useState, useEffect } from "react";
import { ResellerSidebar } from "@/components/reseller/ResellerSidebar";
import { usePathname } from "next/navigation";
import { getPublicSettingsAction } from "@/app/admin/settings/actions";
import { Spinner } from "@heroui/react";
import { ShieldAlert, Store, Hammer } from "lucide-react";

export default function ResellerLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isLoginPage = pathname === "/reseller/login";
    const [isEnabled, setIsEnabled] = useState<boolean | null>(null);
    const [isMaintenance, setIsMaintenance] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const checkB2b = async () => {
            const res = await getPublicSettingsAction();
            if (res.success && res.data) {
                setIsEnabled(res.data.isB2bEnabled);
                setIsMaintenance(res.data.isMaintenanceMode);
            } else {
                setIsEnabled(false);
                setIsMaintenance(false);
            }
            setIsLoading(false);
        };
        checkB2b();
    }, []);

    if (isLoginPage) return <>{children}</>;

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center gap-6">
                <Spinner color="warning" size="lg" />
                <p className="text-slate-500 font-bold uppercase tracking-[0.3em] animate-pulse text-sm">Sécurisation du portail B2B...</p>
            </div>
        );
    }

    if (isMaintenance) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
                <div className="max-w-md w-full text-center space-y-8 animate-in fade-in zoom-in duration-500">
                    <div className="size-24 rounded-[40px] bg-[#ec5b13]/10 border border-[#ec5b13]/20 flex items-center justify-center mx-auto shadow-2xl relative overflow-hidden group">
                        <div className="absolute inset-0 bg-[#ec5b13]/5 group-hover:opacity-100 opacity-0 transition-opacity"></div>
                        <Hammer className="size-12 text-[#ec5b13] relative z-10" />
                    </div>
                    <div className="space-y-4">
                        <h1 className="text-3xl font-black text-white tracking-tight uppercase">Maintenance en cours</h1>
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
                    <div className="size-24 rounded-[40px] bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto shadow-2xl relative overflow-hidden group">
                        <div className="absolute inset-0 bg-red-500/5 group-hover:opacity-100 opacity-0 transition-opacity"></div>
                        <ShieldAlert className="size-12 text-red-500 relative z-10" />
                    </div>
                    <div className="space-y-4">
                        <h1 className="text-3xl font-black text-white tracking-tight">Accès B2B Restreint</h1>
                        <p className="text-slate-500 font-medium leading-relaxed">
                            Le portail partenaire est actuellement désactivé. Veuillez contacter l&apos;administrateur de <b>FLEXBOX DIRECT</b> pour plus d&apos;informations.
                        </p>
                    </div>
                    <div className="pt-4">
                        <button
                            onClick={() => window.location.reload()}
                            className="bg-[#161616] border border-[#262626] text-slate-300 hover:text-white px-8 py-3 rounded-2xl font-bold transition-all flex items-center gap-2 mx-auto active:scale-95"
                        >
                            <Store className="size-5 text-[#ec5b13]" />
                            <span>Retour à l&apos;accueil</span>
                        </button>
                    </div>
                    <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest pt-10">
                        &copy; 2026 FLEXBOX BUSINESS SOLUTION
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen bg-[#0a0a0a] text-slate-200">
            <ResellerSidebar />
            <div className="flex-1 flex flex-col min-w-0">
                <main className="flex-1 p-8 lg:p-12 overflow-y-auto custom-scrollbar">
                    {children}
                </main>
            </div>
        </div>
    );
}
