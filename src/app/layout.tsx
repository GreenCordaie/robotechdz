import type { Metadata } from "next";
import { Inter, Public_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/shared/Providers";
import { BrandingInjector } from "@/components/shared/BrandingInjector";
import { SystemQueries } from "@/services/queries/system.queries";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const publicSans = Public_Sans({ subsets: ["latin"], variable: "--font-public-sans" });

export async function generateViewport() {
    const settings = await SystemQueries.getPublicSettings();
    return {
        themeColor: settings.accentColor || "#ec5b13",
    };
}

export async function generateMetadata(): Promise<Metadata> {
    const settings = await SystemQueries.getPublicSettings();
    return {
        title: settings.shopName,
        description: `Espace administration — ${settings.shopName}`,
        manifest: "/manifest.json",
        icons: settings.faviconUrl ? { icon: settings.faviconUrl } : undefined,
        appleWebApp: {
            capable: true,
            statusBarStyle: "default",
            title: settings.shopName,
        },
    };
}

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="fr" className="dark" suppressHydrationWarning>
            <head>
                <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
                <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet" />
            </head>
            <body className={`${inter.variable} ${publicSans.variable} font-sans antialiased`}>
                <BrandingInjector />
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
