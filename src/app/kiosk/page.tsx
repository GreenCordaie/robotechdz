import { db } from "@/db";
import { redirect } from "next/navigation";
import KioskContent from "./KioskContent";

export default async function KioskPage() {
    const settings = await db.query.shopSettings.findFirst();
    if (settings?.isMaintenanceMode) {
        redirect("/?error=maintenance");
    }

    return <KioskContent />;
}
