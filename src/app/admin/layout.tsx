"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useAuthStore } from "@/store/useAuthStore";
import { usePathname, useRouter } from "next/navigation";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Avatar, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from "@heroui/react";
import { logoutAction } from "./login/actions";
import { LogOut, User as UserIcon } from "lucide-react";

const AdminSidebar = dynamic(() => import("@/components/admin/AdminSidebar").then(mod => mod.AdminSidebar), { ssr: false });
const MobileNavbar = dynamic(() => import("@/components/admin/MobileNavbar").then(mod => mod.MobileNavbar), { ssr: false });

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    const user = useAuthStore((state) => state.user);
    const pathname = usePathname();
    const router = useRouter();
    const [isMounted, setIsMounted] = useState(false);
    const { shopName, faviconUrl, accentColor, fetchSettings } = useSettingsStore();
    const isMobile = useIsMobile();

    useEffect(() => {
        setIsMounted(true);
        fetchSettings();
    }, [fetchSettings]);

    useEffect(() => {
        if (typeof document !== "undefined") {
            // Update Title
            document.title = `${shopName} | Dashboard Admin`;

            // Update Favicon
            if (faviconUrl) {
                let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
                if (!link) {
                    link = document.createElement('link');
                    link.rel = 'icon';
                    document.getElementsByTagName('head')[0].appendChild(link);
                }
                link.href = faviconUrl;
            }

            // Apply primary color CSS variable
            document.documentElement.style.setProperty("--primary", accentColor || "#ec5b13");
        }
    }, [shopName, faviconUrl, accentColor]);

    useEffect(() => {
        // Only redirect if fully mounted and we are certain bout session state
        // This avoids "Router" component update conflict during hydration
        if (isMounted && !isAuthenticated && pathname !== "/admin/login") {
            const timer = setTimeout(() => {
                router.push("/admin/login");
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [isMounted, isAuthenticated, pathname, router]);

    // Prevent hydration flicker
    if (!isMounted) return <div className="min-h-screen bg-background-dark" />;

    // Login page shouldn't have the sidebar
    if (pathname === "/admin/login") {
        return <div className="dark text-foreground bg-background">{children}</div>;
    }

    return (
        <div className="flex flex-col md:flex-row bg-background-dark text-white min-h-screen dark overflow-hidden">
            {!isMobile && <AdminSidebar />}
            {isMobile && (
                <header className="h-14 border-b border-white/5 bg-background-dark/80 backdrop-blur-md flex items-center justify-between px-6 shrink-0 z-50">
                    <div className="font-black text-[var(--primary)] uppercase tracking-tighter text-sm">{shopName}</div>
                    <div className="flex items-center gap-4">
                        <div className="hidden sm:flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span className="text-[10px] font-bold text-slate-500 uppercase">Live</span>
                        </div>

                        <Dropdown placement="bottom-end" classNames={{ content: "bg-[#161616] border border-[#262626]" }}>
                            <DropdownTrigger>
                                <div className="size-8 rounded-full border border-white/10 overflow-hidden relative cursor-pointer active:scale-95 transition-transform">
                                    <Avatar
                                        src={user?.avatarUrl || ""}
                                        className="size-full"
                                        showFallback
                                        name={user?.nom || "A"}
                                    />
                                </div>
                            </DropdownTrigger>
                            <DropdownMenu aria-label="Menu profil mobile" variant="flat">
                                <DropdownItem
                                    key="profile"
                                    startContent={<UserIcon size={14} />}
                                    className="text-slate-300"
                                    onPress={() => router.push("/admin/settings")}
                                >
                                    Mon Profil
                                </DropdownItem>
                                <DropdownItem
                                    key="logout"
                                    className="text-danger"
                                    color="danger"
                                    startContent={<LogOut size={14} />}
                                    onPress={async () => {
                                        useAuthStore.getState().clearAuth();
                                        await logoutAction();
                                    }}
                                >
                                    Se déconnecter
                                </DropdownItem>
                            </DropdownMenu>
                        </Dropdown>
                    </div>
                </header>
            )}
            <main className="flex-1 h-screen overflow-y-auto scrollbar-hide bg-background-dark text-slate-100 pb-20 md:pb-0">
                <div className={`${pathname === "/admin/caisse" ? 'w-full px-2 py-2' : (isMobile ? 'p-4' : 'p-8') + ' max-w-7xl mx-auto'} min-h-full`}>
                    {children}
                </div>
            </main>
            {isMobile && <MobileNavbar />}
        </div>
    );
}


