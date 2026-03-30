"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    Wallet,
    RefreshCw,
    Settings,
    Package,
    Users
} from "lucide-react";
import { getPendingOrdersCount } from "@/app/admin/caisse/actions";
import { useAuthStore } from "@/store/useAuthStore";

export const MobileNavbar = () => {
    const pathname = usePathname();
    const [pendingOrders, setPendingOrders] = React.useState(0);

    const refreshCounts = React.useCallback(async () => {
        try {
            const ordersRes = await getPendingOrdersCount({});
            if (ordersRes && 'success' in ordersRes && ordersRes.success && typeof ordersRes.count === 'number') {
                setPendingOrders(ordersRes.count);
            }
        } catch (error) {
            console.error("Error refreshing mobile counts:", error);
        }
    }, []);

    React.useEffect(() => {
        refreshCounts();
        const interval = setInterval(refreshCounts, 10000);
        return () => clearInterval(interval);
    }, [refreshCounts]);

    const { user } = useAuthStore();
    const navItems = [
        { name: "Dash", icon: "dashboard", href: "/admin", activeColor: "text-blue-500", roles: ["ADMIN", "CAISSIER"] },
        { name: "Caisse", icon: "account_balance_wallet", href: "/admin/caisse", badge: pendingOrders, activeColor: "text-[var(--primary)]", roles: ["ADMIN", "CAISSIER"] },
        { name: "Validation", icon: "sync_alt", href: "/admin/traitement", activeColor: "text-emerald-500", roles: ["ADMIN", "CAISSIER", "TRAITEUR"] },
        { name: "Stock", icon: "inventory_2", href: "/admin/catalogue", activeColor: "text-amber-500", roles: ["ADMIN", "CAISSIER", "TRAITEUR"] },
        { name: "Menu", icon: "menu", href: "/admin/settings", activeColor: "text-purple-500", roles: ["ADMIN", "CAISSIER", "TRAITEUR"] },
    ];

    const visibleItems = navItems.filter(item => {
        if (!user) return false;
        return item.roles.includes(user.role as any);
    });

    return (
        <nav className="fixed bottom-0 left-0 right-0 h-20 bg-white/95 dark:bg-[#140e0b]/95 backdrop-blur-xl border-t border-slate-200 dark:border-white/5 px-4 flex items-center justify-around z-50 shadow-xl dark:shadow-[0_-10px_40px_rgba(0,0,0,0.5)] transition-colors">
            {visibleItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`flex flex-col items-center gap-1.5 min-w-[54px] transition-all duration-300 relative ${isActive ? item.activeColor : "text-slate-500"
                            }`}
                    >
                        {isActive && (
                            <div className={`absolute -top-3 w-8 h-1 rounded-full ${item.activeColor.replace('text-', 'bg-')} animate-pulse`} />
                        )}
                        <div className="relative">
                            <span
                                className="material-symbols-outlined text-[26px]"
                                style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}
                            >
                                {item.icon}
                            </span>
                            {item.badge && item.badge > 0 ? (
                                <span className="absolute -top-1 -right-1.5 bg-[var(--primary)] text-white text-[9px] font-black w-4 h-4 flex items-center justify-center rounded-full border border-white dark:border-black animate-bounce">
                                    {item.badge}
                                </span>
                            ) : null}
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-tighter">
                            {item.name}
                        </span>
                    </Link>
                );
            })}
        </nav>
    );
};
