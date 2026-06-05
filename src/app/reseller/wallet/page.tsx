"use client";

/**
 * /reseller/wallet — unified finance hub.
 *
 * Single page split into 5 logical blocks:
 *   1. Hero (sticky on desktop): balance + tier + mini-stats
 *   2. Tabs: Activité | Commandes | Statistiques | Paramètres
 *   3. Activity — paged tx timeline w/ type+source+date+search filters
 *   4. Orders — tabs per kind (BSV / G2Bulk / IPTV / Active / Manual / Legacy / Toutes)
 *   5. Settings — low-balance threshold + 2 wallet WhatsApp toggles
 *
 * The recharge flow stays the "appelez-nous" modal — no self-service.
 */

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Spinner, useDisclosure } from "@heroui/react";
import {
    History,
    Plus,
    RefreshCw,
    ShoppingBag,
    Sliders,
    TrendingUp,
    Wallet,
    WifiOff,
} from "lucide-react";
import { getResellerWalletOverviewAction } from "./actions";
import { useSettingsStore } from "@/store/useSettingsStore";
import { HeroCard, MiniStatsCard } from "./components/HeroCard";
import { ActivityPanel } from "./components/ActivityPanel";
import { OrdersPanel } from "./components/OrdersPanel";
import { StatsPanel } from "./components/StatsPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { RechargeInfoModal } from "./components/RechargeInfoModal";
import { isTabKey, TAB_KEYS, type OverviewData, type TabKey } from "./components/types";

// Never leave the operator on an eternal spinner if the overview action hangs.
const OVERVIEW_TIMEOUT_MS = 12000;

const TAB_LABELS: Record<TabKey, { label: string; icon: React.ReactNode }> = {
    activity: { label: "Activité", icon: <History size={14} /> },
    orders: { label: "Commandes", icon: <ShoppingBag size={14} /> },
    stats: { label: "Statistiques", icon: <TrendingUp size={14} /> },
    settings: { label: "Paramètres", icon: <Sliders size={14} /> },
};

export default function ResellerWalletPage() {
    return (
        <Suspense fallback={<div className="py-40 flex justify-center"><Spinner color="warning" /></div>}>
            <ResellerWalletInner />
        </Suspense>
    );
}

function ResellerWalletInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const tabParam = searchParams.get("tab");
    const initialTab: TabKey = isTabKey(tabParam) ? tabParam : "activity";

    const [tab, setTab] = useState<TabKey>(initialTab);
    const [overview, setOverview] = useState<OverviewData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const rechargeInfoModal = useDisclosure();

    const shopName = useSettingsStore((s) => s.shopName);
    const shopTel = useSettingsStore((s) => s.shopTel);
    const shopAddress = useSettingsStore((s) => s.shopAddress);

    // Resilient load: a server action that rejects OR hangs (e.g. the first
    // call right after a deploy, a transient transport error) must NOT leave
    // the page on an eternal spinner — race it against a timeout and surface a
    // recoverable retry screen instead. (The old code had no try/catch and
    // gated content on `!overview`, so any failure span the spinner forever.)
    const refreshOverview = useCallback(async () => {
        setIsLoading(true);
        setLoadError(false);
        try {
            const res = await Promise.race([
                getResellerWalletOverviewAction({}),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error("timeout")), OVERVIEW_TIMEOUT_MS),
                ),
            ]);
            if (res.success) {
                setOverview(res.data as OverviewData);
            } else {
                setLoadError(true);
            }
        } catch {
            setLoadError(true);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshOverview();
    }, [refreshOverview]);

    // Sync active tab → URL ?tab=…, without history spam
    useEffect(() => {
        const current = searchParams.get("tab");
        if (current !== tab) {
            const params = new URLSearchParams(Array.from(searchParams.entries()));
            params.set("tab", tab);
            router.replace(`/reseller/wallet?${params.toString()}`, { scroll: false });
        }
    }, [tab, router, searchParams]);

    return (
        <div className="space-y-8 animate-in fade-in duration-500 max-w-7xl">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-4">
                        <Wallet className="text-[var(--primary)] size-8" />
                        Mon Portefeuille
                    </h1>
                    <p className="text-slate-500 font-medium mt-1 uppercase tracking-widest text-[10px]">
                        Solde, transactions, commandes et paramètres finance
                    </p>
                </div>
                <Button
                    onPress={rechargeInfoModal.onOpen}
                    className="bg-[var(--primary)] text-white font-black px-6 h-14 rounded-2xl shadow-xl shadow-orange-950/20"
                    startContent={<Plus size={18} />}
                    data-testid="recharge-info-btn"
                >
                    Recharger le compte
                </Button>
            </header>

            {isLoading ? (
                <div className="py-40 flex justify-center"><Spinner color="warning" /></div>
            ) : !overview ? (
                <div className="py-24 flex flex-col items-center text-center gap-5">
                    <div className="size-20 rounded-[32px] bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                        <WifiOff className="size-10 text-amber-500" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-2xl font-black text-white tracking-tight">
                            Portefeuille indisponible
                        </h2>
                        <p className="text-slate-500 font-medium max-w-sm">
                            {loadError
                                ? "Le chargement a échoué. Vérifiez votre connexion puis réessayez."
                                : "Données indisponibles pour le moment."}
                        </p>
                    </div>
                    <button
                        onClick={() => void refreshOverview()}
                        className="bg-[#161616] border border-[#262626] text-slate-300 hover:text-white px-7 py-3 rounded-2xl font-bold transition-all flex items-center gap-2 active:scale-95"
                    >
                        <RefreshCw className="size-5 text-[var(--primary)]" />
                        <span>Réessayer</span>
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <aside className="lg:col-span-1 space-y-6 lg:sticky lg:top-24 self-start">
                        <HeroCard data={overview} />
                        <MiniStatsCard data={overview} />
                    </aside>

                    <section className="lg:col-span-2 space-y-6">
                        <TabBar tab={tab} onChange={setTab} />
                        {tab === "activity" && (
                            <ActivityPanel walletId={overview.wallet?.id ?? null} />
                        )}
                        {tab === "orders" && <OrdersPanel />}
                        {tab === "stats" && <StatsPanel data={overview} />}
                        {tab === "settings" && (
                            <SettingsPanel data={overview} onChanged={refreshOverview} />
                        )}
                    </section>
                </div>
            )}

            <RechargeInfoModal
                isOpen={rechargeInfoModal.isOpen}
                onClose={rechargeInfoModal.onClose}
                shopName={shopName}
                shopTel={shopTel}
                shopAddress={shopAddress}
            />
        </div>
    );
}

function TabBar({ tab, onChange }: { tab: TabKey; onChange: (t: TabKey) => void }) {
    return (
        <div
            className="flex items-center gap-1 bg-[#161616] border border-[#262626] rounded-2xl p-1 overflow-x-auto"
            data-testid="wallet-tabs"
        >
            {TAB_KEYS.map((k) => {
                const meta = TAB_LABELS[k];
                const active = tab === k;
                return (
                    <button
                        type="button"
                        key={k}
                        data-testid={`wallet-tab-${k}`}
                        onClick={() => onChange(k)}
                        className={`flex items-center gap-2 px-4 h-10 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                            active
                                ? "bg-[var(--primary)] text-white"
                                : "text-slate-400 hover:bg-white/5 hover:text-white"
                        }`}
                    >
                        {meta.icon}
                        <span>{meta.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
