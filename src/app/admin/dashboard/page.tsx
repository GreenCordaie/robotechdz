import React from "react";
import { DashboardQueries } from "@/services/queries/dashboard.queries";
import { DashboardContainer } from "./DashboardContainer";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/security";

export default async function DashboardPage() {
    const user = await getCurrentUser();
    if (!user) {
        redirect("/admin/login");
    }

    try {
        const stats = await DashboardQueries.getStats("week");
        return <DashboardContainer initialStats={stats} />;
    } catch (error) {
        console.error("Dashboard page error:", error);
        return <div className="p-8 text-red-500 font-bold uppercase tracking-widest">Erreur critique de chargement.</div>;
    }
}
