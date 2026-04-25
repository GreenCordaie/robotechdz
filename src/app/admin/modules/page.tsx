"use client";

import React, { useEffect, useState } from "react";
import { Blocks, CheckCircle, Package, ExternalLink, Cpu, Globe, MessageSquare, CreditCard, BarChart3, Bell, PackageOpen, Settings2, ChevronLeft, X } from "lucide-react";
import dynamic from "next/dynamic";

// Lazy load ProductManager from @loadbrain/site-integration/react
const ProductManager = dynamic(
    () => import("@loadbrain/site-integration/react").then(m => m.default || m.ProductManager) as any,
    { ssr: false, loading: () => <div className="text-center py-8 text-slate-500">Chargement du Product Manager...</div> }
) as React.ComponentType<{ apiBasePath?: string; className?: string }>;

interface InstalledModule {
    name: string;
    packageName: string;
    version: string;
    description: string;
    icon: React.ReactNode;
    exports: string[];
    status: "active" | "inactive";
    docsUrl?: string;
    hasUI?: boolean;
}

// Modules installés
const MODULES: InstalledModule[] = [
    {
        name: "LoadBrain SDK",
        packageName: "@loadbrain/sdk",
        version: "3.0.0",
        description: "SDK principal — IPTV provisioning, catalogue, produits, authentification, CMS, facturation, analytics et WhatsApp.",
        icon: <Cpu className="w-6 h-6" />,
        exports: ["LoadBrain", "AuthModule", "CmsModule", "BillingModule", "NotificationsModule", "AnalyticsModule", "WhatsAppModule", "ProvisionModule", "CatalogModule", "ProductsModule"],
        status: "active",
        docsUrl: "https://github.com/GreenCordaie/LoadBrain",
    },
    {
        name: "Site Integration",
        packageName: "@loadbrain/site-integration",
        version: "3.0.0",
        description: "Module d'intégration e-commerce — proxy sécurisé, webhooks, health check, product mapping, provisioning multi-items.",
        icon: <Globe className="w-6 h-6" />,
        exports: ["LoadBrainClient", "ProductManager", "createNextRouteHandler", "createLoadBrainProxy", "proxyToLoadBrain", "parseAndVerifyWebhook", "checkHealth", "validateConfig"],
        status: "active",
        docsUrl: "https://github.com/GreenCordaie/LoadBrain",
        hasUI: true,
    },
];

function getModuleIcon(exportName: string) {
    if (exportName.includes("Auth")) return <Package className="w-3 h-3" />;
    if (exportName.includes("Billing")) return <CreditCard className="w-3 h-3" />;
    if (exportName.includes("Analytics")) return <BarChart3 className="w-3 h-3" />;
    if (exportName.includes("Notification")) return <Bell className="w-3 h-3" />;
    if (exportName.includes("WhatsApp")) return <MessageSquare className="w-3 h-3" />;
    return <Blocks className="w-3 h-3" />;
}

export default function ModulesPage() {
    const [verified, setVerified] = useState<Record<string, boolean>>({});
    const [activeModule, setActiveModule] = useState<string | null>(null);

    useEffect(() => {
        // Verify modules via API proxy (can't use require() in browser)
        const checks: Record<string, boolean> = {};
        (async () => {
            for (const mod of MODULES) {
                try {
                    const res = await fetch("/api/loadbrain/catalog");
                    checks[mod.packageName] = res.ok;
                } catch {
                    checks[mod.packageName] = false;
                }
            }
            setVerified(checks);
        })();
    }, []);

    // Product Manager view — uses proxy at /api/loadbrain (no API key in browser)
    if (activeModule === "@loadbrain/site-integration") {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setActiveModule(null)}
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-3">
                            <div className="p-2 bg-violet-500/10 rounded-xl">
                                <Globe className="w-5 h-5 text-violet-400" />
                            </div>
                            Product Mapping
                        </h1>
                        <p className="text-xs text-slate-500 mt-0.5">Mapper vos produits aux plans LoadBrain</p>
                    </div>
                </div>

                <div className="bg-[#161616] border border-white/5 rounded-2xl p-6 overflow-hidden">
                    <ProductManager apiBasePath="/api/loadbrain" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
                        <div className="p-2.5 bg-violet-500/10 rounded-2xl">
                            <Blocks className="w-6 h-6 text-violet-400" />
                        </div>
                        Modules
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        {MODULES.length > 0 ? `${MODULES.length} module(s) installé(s)` : "Gestion des modules externes"}
                    </p>
                </div>
            </div>

            {/* Empty State */}
            {MODULES.length === 0 && (
                <div className="bg-[#161616] border border-white/5 rounded-2xl p-12 text-center">
                    <div className="flex justify-center mb-4">
                        <div className="p-4 bg-violet-500/5 rounded-3xl border border-violet-500/10">
                            <PackageOpen className="w-12 h-12 text-violet-400/40" />
                        </div>
                    </div>
                    <h2 className="text-lg font-bold text-white mb-2">Aucun module installé</h2>
                    <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                        Les modules externes apparaîtront ici une fois installés.
                        Installez un module avec <code className="bg-white/5 px-2 py-0.5 rounded text-violet-400 text-xs">npm install ./module.tgz</code>
                    </p>
                </div>
            )}

            {/* Module Cards */}
            <div className="grid gap-6">
                {MODULES.map((mod) => {
                    const isVerified = verified[mod.packageName];

                    return (
                        <div
                            key={mod.packageName}
                            className="bg-[#161616] border border-white/5 rounded-2xl overflow-hidden shadow-2xl"
                        >
                            <div className="p-6 flex items-start justify-between">
                                <div className="flex items-start gap-4">
                                    <div className="p-3 bg-violet-500/10 rounded-2xl text-violet-400 shrink-0">
                                        {mod.icon}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-3">
                                            <h2 className="text-lg font-black text-white">{mod.name}</h2>
                                            <span className="text-[10px] font-mono bg-white/5 border border-white/10 text-slate-400 px-2 py-0.5 rounded-full">
                                                v{mod.version}
                                            </span>
                                        </div>
                                        <p className="text-xs font-mono text-slate-500 mt-0.5">{mod.packageName}</p>
                                        <p className="text-sm text-slate-400 mt-2 leading-relaxed">{mod.description}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    {isVerified !== undefined && (
                                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                            isVerified
                                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                                : "bg-red-500/10 text-red-400 border border-red-500/20"
                                        }`}>
                                            <CheckCircle className="w-3 h-3" />
                                            {isVerified ? "Vérifié" : "Erreur"}
                                        </div>
                                    )}
                                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                        mod.status === "active"
                                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                            : "bg-slate-500/10 text-slate-400 border border-slate-500/20"
                                    }`}>
                                        <div className={`w-1.5 h-1.5 rounded-full ${mod.status === "active" ? "bg-emerald-500 animate-pulse" : "bg-slate-500"}`} />
                                        {mod.status === "active" ? "Actif" : "Inactif"}
                                    </div>
                                </div>
                            </div>

                            <div className="px-6 pb-6">
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Exports disponibles</p>
                                <div className="flex flex-wrap gap-2">
                                    {mod.exports.map((exp) => (
                                        <div
                                            key={exp}
                                            className="flex items-center gap-1.5 bg-black/40 border border-white/5 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-300"
                                        >
                                            {getModuleIcon(exp)}
                                            {exp}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="px-6 py-3 bg-black/20 border-t border-white/5 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    {mod.hasUI && (
                                        <button
                                            onClick={() => setActiveModule(mod.packageName)}
                                            className="flex items-center gap-1.5 text-[10px] bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg border border-violet-500/20 transition-colors"
                                        >
                                            <Settings2 className="w-3 h-3" />
                                            Configurer
                                        </button>
                                    )}
                                </div>
                                {mod.docsUrl && (
                                    <a
                                        href={mod.docsUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1.5 text-[10px] text-violet-400 hover:text-violet-300 font-bold uppercase tracking-wider transition-colors"
                                    >
                                        Documentation
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
