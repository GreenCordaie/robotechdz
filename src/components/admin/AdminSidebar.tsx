"use client";

import React from "react";
import {
    LayoutDashboard,
    Wallet,
    Settings,
    Package,
    User,
    LogOut,
    Eye,
    Users,
    RefreshCw,
    LayoutGrid,
    Contact,
    TruckIcon,
    Building2,
    Headset,
    Settings2,
    BarChart3
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@heroui/react";
import { useAuthStore } from "@/store/useAuthStore";
import { logoutAction } from "@/app/admin/login/actions";
import { useSettingsStore } from "@/store/useSettingsStore";
import Image from "next/image";
import { getSupportCounts } from "@/app/admin/support/actions";
import { getPendingOrdersCount, getPaidOrdersCount } from "@/app/admin/caisse/actions";

export const AdminSidebar = () => {
    const pathname = usePathname();
    const router = useRouter();
    const clearAuth = useAuthStore((state) => state.clearAuth);
    const user = useAuthStore((state) => state.user);
    const { shopName, dashboardLogoUrl, isB2bEnabled, fetchSettings } = useSettingsStore();

    const [openTickets, setOpenTickets] = React.useState(0);
    const [pendingOrders, setPendingOrders] = React.useState(0);
    const [paidOrders, setPaidOrders] = React.useState(0);

    const refreshCounts = React.useCallback(async () => {
        try {
            const [ticketsRes, ordersRes, paidRes] = await Promise.all([
                getSupportCounts({}),
                getPendingOrdersCount({}),
                getPaidOrdersCount({})
            ]);

            if ('success' in ticketsRes && ticketsRes.success && typeof ticketsRes.count === 'number') {
                setOpenTickets(ticketsRes.count);
            }
            if ('success' in ordersRes && ordersRes.success && typeof ordersRes.count === 'number') {
                setPendingOrders(ordersRes.count);
            }
            if ('success' in paidRes && paidRes.success && typeof paidRes.count === 'number') {
                setPaidOrders(paidRes.count);
            }
        } catch (error) {
            console.error("Error refreshing sidebar counts:", error);
        }
    }, []);

    React.useEffect(() => {
        fetchSettings();
        refreshCounts();
        const interval = setInterval(refreshCounts, 10000); // Pulse every 10s
        return () => clearInterval(interval);
    }, [fetchSettings, refreshCounts]);

    const handleLogout = async () => {
        await logoutAction();
        clearAuth();
    };

    const navItems = [
        { name: "Dashboard", icon: LayoutDashboard, href: "/admin", roles: ["ADMIN", "CAISSIER", "TRAITEUR"] },
        { name: "Catalogue", icon: Package, href: "/admin/catalogue", roles: ["ADMIN", "CAISSIER"] },
        { name: "Caisse", icon: Wallet, href: "/admin/caisse", badge: pendingOrders, roles: ["ADMIN", "CAISSIER"] },
        { name: "Comptes Partagés", icon: LayoutGrid, href: "/admin/comptes-partages", roles: ["ADMIN", "CAISSIER"] },
        { name: "Traitement", icon: RefreshCw, href: "/admin/traitement", badge: paidOrders, roles: ["ADMIN", "CAISSIER", "TRAITEUR"] },
        { name: "Clients & Crédits", icon: Contact, href: "/admin/clients", roles: ["ADMIN", "CAISSIER"] },
        { name: "Fournisseurs", icon: Users, href: "/admin/fournisseurs", roles: ["ADMIN"] },
        ...(isB2bEnabled ? [{ name: "B2B & Revendeurs", icon: Building2, href: "/admin/b2b", roles: ["ADMIN"] }] : []),
        { name: "Tickets Support", icon: Headset, href: "/admin/support", badge: openTickets, roles: ["ADMIN", "CAISSIER", "TRAITEUR"] },
        { name: "Paramètres", icon: Settings2, href: "/admin/settings", roles: ["ADMIN"] },
        { name: "Analytics", icon: BarChart3, href: "/admin/analytics", roles: ["ADMIN"] },
    ];

    const visibleItems = navItems.filter(item => {
        if (!user) return false;
        return (item.roles as string[]).includes(user.role);
    });

    return (
        <aside className="w-64 flex flex-col border-r border-[#2d2622] h-screen sticky top-0 bg-[#1a1614] shrink-0 shadow-2xl">
            <div className="p-6 flex items-center gap-3">
                <div className="size-10 rounded-lg bg-[#ec5b13] flex items-center justify-center text-white shadow-lg shadow-[#ec5b13]/20 overflow-hidden relative">
                    {dashboardLogoUrl ? (
                        <Image src={dashboardLogoUrl} alt="Logo" className="object-contain p-1" fill sizes="40px" priority />
                    ) : (
                        <span className="material-symbols-outlined text-[24px]">package_2</span>
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    <h1 className="text-base font-bold leading-tight text-white truncate">{shopName}</h1>
                    <div className="flex flex-col gap-0.5 mt-0.5">
                        <p className="text-[11px] text-[#ec5b13]/60 font-medium tracking-widest uppercase">Digital SaaS Admin</p>
                        <Link
                            href="/kiosk"
                            target="_blank"
                            className="text-[11px] text-slate-500 hover:text-[#ec5b13] flex items-center gap-1.5 font-bold transition-colors w-fit mt-1.5 px-0.5"
                        >
                            <Eye className="size-3.5" />
                            Ouvrir le Kiosque
                        </Link>
                    </div>
                </div>
            </div>

            <nav className="flex-1 px-4 space-y-1 mt-2">
                {visibleItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group ${isActive
                                ? "bg-[#ec5b13] text-white shadow-lg shadow-[#ec5b13]/20"
                                : "text-slate-400 hover:bg-white/5 hover:text-white"
                                }`}
                        >
                            <item.icon
                                className={`size-5 shrink-0 transition-transform group-hover:scale-110 ${isActive ? "text-white" : "text-slate-400"}`}
                            />
                            <span className={`text-sm tracking-wide flex-1 ${isActive ? "font-bold" : "font-medium"}`}>
                                {item.name}
                            </span>
                            {(item as any).badge > 0 && (
                                <span className="bg-[#ec5b13] text-white text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[20px] text-center shadow-lg border border-white/10 group-hover:scale-110 transition-transform">
                                    {(item as any).badge}
                                </span>
                            )}
                        </Link>
                    );
                })}
            </nav>

            <div className="p-4 border-t border-[#2d2622]">
                <div className="flex items-center gap-3 p-2">
                    <div className="size-8 rounded-full bg-[#2d2622] flex items-center justify-center overflow-hidden border border-white/10 shrink-0 relative">
                        <Image
                            alt="Profile"
                            className="object-cover"
                            src={user?.avatarUrl || "https://lh3.googleusercontent.com/aida-public/AB6AXuCZzSogzgSYWL4sV8cYS-i9sYM5fwva6Q0n4I55293IQmD03umRiums_O9xTBdasBU1_angHiWiAckgyWwn6UB9MBLipWMhFehIUd_Qc0NUCfkXrUB7xtX-66jetAhnxQNxVTRztumuzjGfV4latkz0g53wc7eiJUn89bYwLuPezAenuEtVe-t4k1298Xg1AQqPP6l314oAlSj3m3UMutiTNXAv4ywmJUO7cWO3xprkiMgliBjEdbhP9gqPQREeem3Jv00wZuEZHdbM"}
                            fill
                            sizes="32px"
                        />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold truncate text-slate-100">{user?.nom || 'Admin'}</p>
                        <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">{user?.role || 'SYSTEM'}</p>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="text-slate-400 hover:text-[#ec5b13] transition-colors p-1.5 rounded-lg hover:bg-white/5 flex items-center justify-center transition-transform active:scale-95"
                        title="Déconnexion"
                    >
                        <LogOut className="size-5" />
                    </button>
                </div>
            </div>
        </aside>
    );
};
