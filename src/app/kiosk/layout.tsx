"use client";

import React, { useEffect } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

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

    return (
        <div className="min-h-screen bg-white text-black font-sans selection:bg-[#FF8000]/20 select-none cursor-default">
            <style jsx global>{`
                /* Tactile optimizations */
                * {
                    -webkit-tap-highlight-color: transparent;
                    touch-action: manipulation;
                }
                
                /* Ensure large tap targets */
                button, [role="button"], a {
                    min-height: 60px;
                    min-width: 60px;
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
                <main className="h-screen w-screen overflow-hidden relative">
                    {children}
                </main>
            </NextThemesProvider>
        </div>
    );
}
