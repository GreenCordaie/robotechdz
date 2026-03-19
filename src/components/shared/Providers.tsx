"use client";

import React from "react";

import { HeroUIProvider } from "@heroui/react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { Toaster } from "react-hot-toast";

export function Providers({ children }: { children: React.ReactNode }) {
    React.useEffect(() => {
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker
                .register("/sw.js")
                .then((registration) => console.log("SW registered"))
                .catch((error) => console.log("SW registration failed", error));
        }
    }, []);

    return (
        <HeroUIProvider>
            <NextThemesProvider attribute="class" defaultTheme="dark">
                <Toaster position="top-right" />
                {children}
            </NextThemesProvider>
        </HeroUIProvider>
    );
}
