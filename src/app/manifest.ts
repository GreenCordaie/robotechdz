import { MetadataRoute } from "next";
import { SystemQueries } from "@/services/queries/system.queries";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
    const settings = await SystemQueries.getPublicSettings();

    const iconSrc = settings.logoUrl || settings.faviconUrl || "/logo.png";

    return {
        name: settings.shopName ? `${settings.shopName} — Admin` : "Admin Panel",
        short_name: settings.shopName || "Admin",
        description: `Espace administrateur — ${settings.shopName}`,
        start_url: "/admin/login",
        display: "standalone",
        background_color: "#0a0a0a",
        theme_color: settings.accentColor || "#ec5b13",
        icons: [
            {
                src: iconSrc,
                sizes: "192x192",
                type: "image/png",
                purpose: "maskable",
            },
            {
                src: iconSrc,
                sizes: "512x512",
                type: "image/png",
                purpose: "maskable",
            },
        ],
    };
}
