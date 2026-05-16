"use client";

import React, { useEffect } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import PwaInstallBanner from "./components/PwaInstallBanner";

export default function KioskLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Disable right-click and selection globally for kiosk
    useEffect(() => {
        const handleContextMenu = (e: MouseEvent) => e.preventDefault();
        document.addEventListener("contextmenu", handleContextMenu);
        return () => document.removeEventListener("contextmenu", handleContextMenu);
    }, []);

    // Inject kiosk manifest (overrides the admin one)
    useEffect(() => {
        let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
        if (link) {
            link.href = "/api/kiosk-manifest";
        } else {
            link = document.createElement("link");
            link.rel = "manifest";
            link.href = "/api/kiosk-manifest";
            document.head.appendChild(link);
        }
    }, []);

    return (
        <div className="min-h-screen bg-white text-black font-sans selection:bg-primary/20 select-none cursor-default">
            <style jsx global>{`
                /* Tactile optimizations */
                * {
                    -webkit-tap-highlight-color: transparent;
                    touch-action: manipulation;
                }

                /* Ensure accessible tap targets */
                button, [role="button"], a {
                    min-height: 44px;
                }

                /* Scrollbar hiding for kiosk feel */
                ::-webkit-scrollbar {
                    display: none;
                }
                body {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                    overflow: hidden; /* Lock the viewport */
                }
            `}</style>

            {/* Force Light Mode for Kiosk */}
            <NextThemesProvider attribute="class" defaultTheme="light" forcedTheme="light">
                <PwaInstallBanner />
                <main className="h-screen w-screen overflow-hidden relative">
                    {children}
                </main>
            </NextThemesProvider>
        </div>
    );
}
