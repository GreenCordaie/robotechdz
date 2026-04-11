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

const AdminSidebar = dynamic(() => import("@/components/admin/AdminSidebar").then(mod => mod.AdminSidebar), {
    ssr: false,
    loading: () => <div className="w-64 h-screen bg-background-dark shrink-0 border-r border-white/5" />
});
const MobileNavbar = dynamic(() => import("@/components/admin/MobileNavbar").then(mod => mod.MobileNavbar), {
    ssr: false,
    loading: () => null
});

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

        // Inject admin manifest
        let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
        if (link) {
            link.href = "/api/admin-manifest";
        } else {
            link = document.createElement("link");
            link.rel = "manifest";
            link.href = "/api/admin-manifest";
            document.head.appendChild(link);
        }
    }, [fetchSettings]);

    // Auto-subscribe push notifications + clear badge on app open
    useEffect(() => {
        if (!isAuthenticated || pathname === "/admin/login") return;

        // Clear badge when user opens the app
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(reg => {
                reg.active?.postMessage('CLEAR_BADGE');
            });
            if ('clearAppBadge' in navigator) {
                (navigator as any).clearAppBadge().catch(() => {});
            }
        }

        // Auto-subscribe if permission already granted but not subscribed
        (async () => {
            try {
                if (!('Notification' in window) || Notification.permission !== 'granted') return;
                const reg = await navigator.serviceWorker.ready;
                const existingSub = await reg.pushManager.getSubscription();
                if (existingSub) return; // already subscribed

                const { getPushPublicKeyAction, subscribeToPushAction } = await import("./push/actions");
                const keyRes = await getPushPublicKeyAction({});
                if (!keyRes.success || !keyRes.publicKey) return;

                const padding = "=".repeat((4 - (keyRes.publicKey.length % 4)) % 4);
                const base64 = (keyRes.publicKey + padding).replace(/-/g, "+").replace(/_/g, "/");
                const rawData = window.atob(base64);
                const appServerKey = new Uint8Array(rawData.length);
                for (let i = 0; i < rawData.length; ++i) appServerKey[i] = rawData.charCodeAt(i);

                const subscription = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: appServerKey,
                });
                await subscribeToPushAction({ subscription });
            } catch { /* silent */ }
        })();
    }, [isAuthenticated, pathname]);

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
            <main className="flex-1 h-screen overflow-y-auto scroll-smooth scrollbar-hide bg-background-dark text-slate-100 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
                <div className={`${pathname === "/admin/caisse" ? 'w-full px-2 py-2' : (isMobile ? 'p-4' : 'p-8') + ' max-w-7xl mx-auto'} min-h-full`}>
                    {children}
                </div>
            </main>
            {isMobile && <MobileNavbar />}
        </div>
    );
}


