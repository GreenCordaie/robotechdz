"use client";

import React from "react";
import {
    LayoutDashboard,
    ShoppingBag,
    History,
    Wallet,
    MessageSquare,
    LogOut,
    Store,
    LayoutGrid,
    ChevronRight,
    UserCircle
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { useSettingsStore } from "@/store/useSettingsStore";

const MENU_ITEMS = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/reseller/dashboard" },
    { icon: LayoutGrid, label: "Boutique B2B", href: "/reseller/shop" },
    { icon: History, label: "Mes Commandes", href: "/reseller/orders" },
    { icon: Wallet, label: "Mon Wallet", href: "/reseller/wallet" },
];

const SECONDARY_ITEMS = [
    { icon: MessageSquare, label: "Support Technique", href: "/reseller/support" },
];

export const ResellerSidebar = () => {
    const pathname = usePathname();
    const router = useRouter();
    const { shopName } = useSettingsStore();

    const handleLogout = () => {
        // Logic for logout
        router.push("/reseller/login");
    };

    return (
        <aside className="w-80 h-screen bg-[#0f0d0c] border-r border-[#2d2622] flex flex-col shrink-0 sticky top-0">
            {/* Logo Section */}
            <div className="p-8 pb-10">
                <div className="flex items-center gap-4 group">
                    <div className="size-12 rounded-2xl bg-[var(--primary)] flex items-center justify-center shadow-lg shadow-orange-950/20 group-hover:scale-105 transition-transform">
                        <Store className="size-7 text-white" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xl font-black text-white tracking-tighter">{shopName}</span>
                        <span className="text-[10px] font-black text-[var(--primary)] uppercase tracking-[0.3em] leading-none">B2B Portal</span>
                    </div>
                </div>
            </div>

            {/* Menu Sections */}
            <div className="flex-1 px-4 space-y-8 overflow-y-auto custom-scrollbar">
                <div className="space-y-1.5">
                    <p className="px-4 text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] mb-4">Menu Principal</p>
                    {MENU_ITEMS.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center justify-between px-4 py-3.5 rounded-xl transition-all group ${isActive
                                        ? "bg-[var(--primary)]/10 text-[var(--primary)]"
                                        : "text-slate-500 hover:bg-white/5 hover:text-slate-200"
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <item.icon className={`size-5 transition-transform group-hover:scale-110 ${isActive ? "text-[var(--primary)]" : "text-slate-500 group-hover:text-slate-300"}`} />
                                    <span className="text-sm font-bold tracking-tight">{item.label}</span>
                                </div>
                                {isActive && <div className="size-1.5 rounded-full bg-[var(--primary)] shadow-[0_0_8px_var(--primary)]"></div>}
                                {!isActive && <ChevronRight className="size-4 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all text-slate-600" />}
                            </Link>
                        );
                    })}
                </div>

                <div className="space-y-1.5 pt-4 border-t border-[#2d2622]/50">
                    <p className="px-4 text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] mb-4">Assistance</p>
                    {SECONDARY_ITEMS.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all group ${isActive
                                        ? "bg-[var(--primary)]/10 text-[var(--primary)]"
                                        : "text-slate-500 hover:bg-white/5 hover:text-slate-200"
                                    }`}
                            >
                                <item.icon className={`size-5 ${isActive ? "text-[var(--primary)]" : "text-slate-500 group-hover:text-slate-300"}`} />
                                <span className="text-sm font-bold tracking-tight">{item.label}</span>
                            </Link>
                        );
                    })}
                </div>
            </div>

            {/* Footer / User Profile */}
            <div className="p-4 mt-auto">
                <div className="bg-[#1a1614] border border-[#2d2622] rounded-2xl p-4 mb-4">
                    <div className="flex items-center gap-3">
                        <div className="size-10 rounded-xl bg-[#2d2622] flex items-center justify-center text-slate-400">
                            <UserCircle className="size-7" />
                        </div>
                        <div className="flex flex-col min-w-0">
                            <span className="text-sm font-bold text-white truncate">Partenaire Demo</span>
                            <span className="text-[10px] font-medium text-slate-500 truncate italic">ID #B2B-1024</span>
                        </div>
                    </div>
                </div>

                <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-red-500 hover:bg-red-500/10 transition-all font-bold text-sm group"
                >
                    <LogOut className="size-5 group-hover:-translate-x-1 transition-transform" />
                    <span>Déconnexion</span>
                </button>
            </div>

            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #2d2622; border-radius: 10px; }
            `}</style>
        </aside>
    );
};
