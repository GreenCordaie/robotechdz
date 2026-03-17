"use client";

import React, { useEffect, useState } from "react";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { LockScreen } from "@/components/admin/LockScreen";
import { useAuthStore } from "@/store/useAuthStore";
import { usePathname, useRouter } from "next/navigation";
import { useSettingsStore } from "@/store/useSettingsStore";

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
        <div className="flex bg-black text-white min-h-screen dark">
            {/* {isAuthenticated && <LockScreen />} */}
            <AdminSidebar />
            <main className="flex-1 h-screen overflow-y-auto scrollbar-hide bg-background-dark text-slate-100">
                <div className="p-8 max-w-7xl mx-auto min-h-full">
                    {children}
                </div>
            </main>
        </div>
    );
}
