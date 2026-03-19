import { db } from "@/db";
import { redirect } from "next/navigation";
import KioskContent from "./KioskContent";

export const dynamic = 'force-dynamic';

export default async function KioskPage() {
    const settings = await db.query.shopSettings.findFirst();
    if (settings?.isMaintenanceMode) {
        redirect("/?error=maintenance");
    }

    return <KioskContent />;
}
