"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
    LayoutDashboard,
    Gift,
    Gamepad2,
    Layers,
    LayoutGrid,
    Wallet,
    Trophy,
    PartyPopper,
    Menu,
    X,
    UserCircle,
    LogOut,
    History,
    LifeBuoy,
    Settings as SettingsIcon,
    Bell,
    Webhook,
    Receipt,
} from "lucide-react";
import {
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownTrigger,
} from "@heroui/react";
import { useSettingsStore } from "@/store/useSettingsStore";
import { getCurrentResellerAction } from "../../actions";
import { formatCurrency } from "@/lib/formatters";

interface NavItem {
    readonly href: string;
    readonly label: string;
    readonly icon: LucideIcon;
}

const NAV_ITEMS: ReadonlyArray<NavItem> = [
    { href: "/reseller/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/reseller/shop/all", label: "Tout le catalogue", icon: LayoutGrid },
    { href: "/reseller/shop?type=giftcard", label: "Gift Cards & Vouchers", icon: Gift },
    { href: "/reseller/shop?type=topup", label: "Game Top Up", icon: Gamepad2 },
    { href: "/reseller/shop?type=bulk", label: "Bulk Game TopUp", icon: Layers },
    { href: "/reseller/wallet", label: "Wallet", icon: Wallet },
    { href: "/reseller/dashboard?tab=leaderboard", label: "LeaderBoard", icon: Trophy },
    { href: "/reseller/dashboard?tab=giveaway", label: "Giveaway", icon: PartyPopper },
];

interface ShopTopNavProps {
    readonly shopName?: string;
}

export const ShopTopNav: React.FC<ShopTopNavProps> = ({ shopName: shopNameProp }) => {
    const router = useRouter();
    const pathname = usePathname();
    const { shopName: shopNameStore, fetchSettings } = useSettingsStore();
    const [balance, setBalance] = useState<number>(0);
    const [companyName, setCompanyName] = useState<string>("Partenaire");
    const [mobileOpen, setMobileOpen] = useState(false);

    const shopName = shopNameProp || shopNameStore;

    useEffect(() => {
        if (!shopNameStore || shopNameStore === "Ma Boutique") {
            fetchSettings();
        }
    }, [shopNameStore, fetchSettings]);

    useEffect(() => {
        let active = true;
        getCurrentResellerAction({}).then((res) => {
            if (!active || !res?.success || !res.data) return;
            const r = res.data as {
                companyName?: string;
                wallet?: { balance?: string | number };
            };
            setCompanyName(r.companyName ?? "Partenaire");
            setBalance(Number(r.wallet?.balance ?? 0));
        });
        return () => {
            active = false;
        };
    }, []);

    const handleLogout = () => router.push("/reseller/login");

    const searchParams = useSearchParams();
    const currentType = searchParams.get("type");

    const isActive = (href: string) => {
        const [base, query = ""] = href.split("?");
        // Same base path? If the link carries a ?type=… discriminator, the
        // active tab is the one whose `type` matches the current URL.
        if (base === "/reseller/shop") {
            const linkType = new URLSearchParams(query).get("type");
            if (!pathname.startsWith("/reseller/shop")) return false;
            // Brand-detail pages (/reseller/shop/[brand]) keep the "Gift Cards"
            // tab highlighted by default so the operator has a clear "back to
            // catalog" anchor. The flat catalog (/reseller/shop/all) has its
            // own nav entry, so it must NOT highlight the Gift Cards tab.
            const onAllCatalog = pathname.startsWith("/reseller/shop/all");
            const onBrandDetail = pathname !== "/reseller/shop" && !onAllCatalog;
            if (onBrandDetail) return linkType === "giftcard";
            return linkType === currentType || (!linkType && !currentType);
        }
        return pathname === base;
    };

    return (
        <header
            className="sticky top-0 z-40 border-b border-[#262626] bg-[#0a0a0a]/95 backdrop-blur-xl"
            data-testid="shop-top-nav"
        >
            <div className="max-w-[1400px] mx-auto px-4 lg:px-6 h-16 flex items-center justify-between gap-4">
                {/* Brand */}
                <Link href="/reseller/dashboard" className="flex items-center gap-2 shrink-0">
                    <span className="text-lg font-black tracking-tight text-white">
                        {shopName}
                    </span>
                    <span className="size-1.5 rounded-full bg-[#FACC15] shadow-[0_0_8px_#FACC15]" />
                </Link>

                {/* Desktop nav */}
                <nav className="hidden lg:flex items-center gap-1 flex-1 justify-center">
                    {NAV_ITEMS.map((it) => {
                        const active = isActive(it.href);
                        const Icon = it.icon;
                        return (
                            <Link
                                key={it.href}
                                href={it.href}
                                className={`flex items-center gap-2 px-3 py-2 rounded-full text-xs font-bold tracking-tight transition-all ${
                                    active
                                        ? "bg-[#FACC15] text-black"
                                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                                }`}
                            >
                                <Icon size={14} />
                                <span>{it.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                {/* Right side */}
                <div className="flex items-center gap-2 shrink-0">
                    <div
                        className="hidden md:flex items-center gap-2 bg-[#161616] border border-[#262626] rounded-full px-4 py-1.5"
                        data-testid="shop-balance-pill"
                    >
                        <Wallet size={14} className="text-[#FACC15]" />
                        <span className="text-xs font-black text-white">
                            {formatCurrency(balance, "DZD")}
                        </span>
                    </div>

                    <Dropdown placement="bottom-end">
                        <DropdownTrigger>
                            <button
                                className="size-9 rounded-full bg-[#161616] border border-[#262626] flex items-center justify-center hover:border-[#FACC15]/40 transition-colors"
                                aria-label="Profil"
                            >
                                <UserCircle className="size-6 text-slate-300" />
                            </button>
                        </DropdownTrigger>
                        <DropdownMenu
                            aria-label="Menu utilisateur"
                            className="bg-[#161616]"
                            itemClasses={{ base: "text-slate-300" }}
                        >
                            <DropdownItem key="header" isReadOnly className="opacity-70">
                                <span className="text-xs font-bold">{companyName}</span>
                            </DropdownItem>
                            <DropdownItem
                                key="orders"
                                startContent={<Receipt size={14} />}
                                onPress={() => router.push("/reseller/orders")}
                            >
                                Mes Achats
                            </DropdownItem>
                            <DropdownItem
                                key="wallet"
                                startContent={<History size={14} />}
                                onPress={() => router.push("/reseller/wallet")}
                            >
                                Historique Wallet
                            </DropdownItem>
                            <DropdownItem
                                key="support"
                                startContent={<LifeBuoy size={14} />}
                                onPress={() => router.push("/reseller/support")}
                            >
                                Support
                            </DropdownItem>
                            <DropdownItem
                                key="settings"
                                startContent={<SettingsIcon size={14} />}
                                onPress={() => router.push("/reseller/settings")}
                            >
                                Paramètres
                            </DropdownItem>
                            <DropdownItem
                                key="notifications"
                                startContent={<Bell size={14} />}
                                onPress={() => router.push("/reseller/settings/notifications")}
                            >
                                Notifications
                            </DropdownItem>
                            <DropdownItem
                                key="api"
                                startContent={<Webhook size={14} />}
                                onPress={() => router.push("/reseller/webhooks")}
                            >
                                API
                            </DropdownItem>
                            <DropdownItem
                                key="logout"
                                startContent={<LogOut size={14} />}
                                className="text-red-400"
                                color="danger"
                                onPress={handleLogout}
                            >
                                Déconnexion
                            </DropdownItem>
                        </DropdownMenu>
                    </Dropdown>

                    {/* Mobile burger */}
                    <button
                        type="button"
                        onClick={() => setMobileOpen((v) => !v)}
                        className="lg:hidden size-9 rounded-full bg-[#161616] border border-[#262626] flex items-center justify-center"
                        aria-label="Menu"
                    >
                        {mobileOpen ? <X size={16} /> : <Menu size={16} />}
                    </button>
                </div>
            </div>

            {mobileOpen && (
                <div className="lg:hidden border-t border-[#262626] bg-[#0a0a0a] px-4 py-3 space-y-1">
                    {NAV_ITEMS.map((it) => {
                        const active = isActive(it.href);
                        const Icon = it.icon;
                        return (
                            <Link
                                key={it.href}
                                href={it.href}
                                onClick={() => setMobileOpen(false)}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold ${
                                    active
                                        ? "bg-[#FACC15] text-black"
                                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                                }`}
                            >
                                <Icon size={16} />
                                <span>{it.label}</span>
                            </Link>
                        );
                    })}
                </div>
            )}
        </header>
    );
};
