import React from "react";
import DashboardContent from "@/components/admin/DashboardContent";
import { getDashboardStats } from "./actions";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
    const stats = await getDashboardStats({ period: "week" });

    // Fallback if auth fails or error occurs
    if ((stats as any).success === false) {
        return <div className="p-8 text-white bg-red-900/20 rounded-xl border border-red-500/50">
            Une erreur de sécurité est survenue : {(stats as any).error}
        </div>;
    }

    return <DashboardContent stats={stats as any} />;
}
