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
        { name: "Dash", icon: "dashboard", href: "/admin/dashboard", activeColor: "text-blue-500", roles: ["ADMIN", "CAISSIER"] },
        { name: "Caisse", icon: "account_balance_wallet", href: "/admin/caisse", badge: pendingOrders, activeColor: "text-[var(--primary)]", roles: ["ADMIN", "CAISSIER"] },
        { name: "Traiter", icon: "sync_alt", href: "/admin/traitement", activeColor: "text-emerald-500", roles: ["ADMIN", "CAISSIER", "TRAITEUR"] },
        { name: "Stock", icon: "inventory_2", href: "/admin/catalogue", activeColor: "text-amber-500", roles: ["ADMIN", "CAISSIER", "TRAITEUR"] },
        { name: "Menu", icon: "menu", href: "/admin/settings", activeColor: "text-purple-500", roles: ["ADMIN", "CAISSIER", "TRAITEUR"] },
    ];

    const visibleItems = navItems.filter(item => {
        if (!user) return false;
        return item.roles.includes(user.role as any);
    });

    return (
        <nav
            className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-[#140e0b]/95 backdrop-blur-xl border-t border-slate-200 dark:border-white/5 px-4 flex items-end justify-around z-50 shadow-xl dark:shadow-[0_-10px_40px_rgba(0,0,0,0.5)] transition-colors"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)', paddingTop: '10px' }}
        >
            {visibleItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`flex flex-col items-center gap-1 min-w-0 flex-1 pb-1 transition-all duration-200 relative ${isActive ? item.activeColor : "text-slate-400"}`}
                    >
                        {isActive && (
                            <div className={`absolute -top-2.5 w-6 h-[3px] rounded-full ${item.activeColor.replace('text-', 'bg-')}`} />
                        )}
                        <div className="relative">
                            <span
                                className="material-symbols-outlined text-[26px]"
                                style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}
                            >
                                {item.icon}
                            </span>
                            {item.badge && item.badge > 0 ? (
                                <span className="absolute -top-1 -right-1.5 bg-[var(--primary)] text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full border border-white dark:border-black">
                                    {item.badge}
                                </span>
                            ) : null}
                        </div>
                        <span className="text-[10px] font-medium truncate max-w-full">
                            {item.name}
                        </span>
                    </Link>
                );
            })}
        </nav>
    );
};
