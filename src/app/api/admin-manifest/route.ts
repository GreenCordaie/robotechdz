import { NextResponse } from "next/server";
import { SystemQueries } from "@/services/queries/system.queries";

export async function GET() {
    const settings = await SystemQueries.getPublicSettings();

    const manifest = {
        name: settings.shopName ? `${settings.shopName} — Admin` : "Admin Panel",
        short_name: settings.shopName || "Admin",
        description: `Espace administrateur — ${settings.shopName}`,
        start_url: "/admin/dashboard",
        scope: "/admin",
        id: "/admin",
        display: "standalone",
        background_color: "#0a0a0a",
        theme_color: settings.accentColor || "#ec5b13",
        icons: [
            { src: "/icon-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
            { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
            { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        ],
    };

    return NextResponse.json(manifest, {
        headers: { "Content-Type": "application/manifest+json" },
    });
}
