"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useAuthStore } from "@/store/useAuthStore";
import { usePathname, useRouter } from "next/navigation";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useIsMobile } from "@/hooks/useIsMobile";

const AdminSidebar = dynamic(() => import("@/components/admin/AdminSidebar").then(mod => mod.AdminSidebar), { ssr: false });
const MobileNavbar = dynamic(() => import("@/components/admin/MobileNavbar").then(mod => mod.MobileNavbar), { ssr: false });

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    const pathname = usePathname();
    const router = useRouter();
    const [isMounted, setIsMounted] = useState(false);
    const { shopName, faviconUrl, fetchSettings } = useSettingsStore();
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
        }
    }, [shopName, faviconUrl]);

    useEffect(() => {
        if (isMounted && !isAuthenticated && pathname !== "/admin/login") {
            router.push("/admin/login");
        }
    }, [isMounted, isAuthenticated, pathname, router]);

    // Prevent hydration flicker
    if (!isMounted) return <div className="min-h-screen bg-[#0a0a0a]" />;

    // Login page shouldn't have the sidebar
    if (pathname === "/admin/login") {
        return <div className="dark text-foreground bg-background">{children}</div>;
    }

    return (
        <div className="flex flex-col md:flex-row bg-black text-white min-h-screen dark overflow-hidden">
            {!isMobile && <AdminSidebar />}
            {isMobile && (
                <header className="h-14 border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-md flex items-center justify-between px-6 shrink-0 z-50">
                    <div className="font-black text-[#ec5b13] uppercase tracking-tighter text-sm">{shopName}</div>
                    <div className="flex items-center gap-3">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Live</span>
                    </div>
                </header>
            )}
            <main className="flex-1 h-screen overflow-y-auto scrollbar-hide bg-background-dark text-slate-100 pb-20 md:pb-0">
                <div className={`${isMobile ? 'p-4' : 'p-8'} max-w-7xl mx-auto min-h-full`}>
                    {children}
                </div>
            </main>
            {isMobile && <MobileNavbar />}
        </div>
    );
}
