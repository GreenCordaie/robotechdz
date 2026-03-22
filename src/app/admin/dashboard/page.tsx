import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/security";
import { getAnalyticsOverview, getAnalyticsRankings } from "@/app/admin/analytics/actions";
import AnalyticsContent from "@/app/admin/analytics/AnalyticsContent";

export default async function DashboardPage() {
    const user = await getCurrentUser();
    if (!user) {
        redirect("/admin/login");
    }

    try {
        const [overviewResponse, rankingsResponse] = await Promise.all([
            getAnalyticsOverview({}),
            getAnalyticsRankings({})
        ]);

        return (
            <AnalyticsContent
                initialOverview={overviewResponse.success ? overviewResponse.data : null}
                initialRankings={rankingsResponse.success ? rankingsResponse.data : null}
            />
        );
    } catch (error) {
        console.error("Dashboard page error:", error);
        return <div className="p-8 text-red-500 font-bold uppercase tracking-widest">Erreur critique de chargement.</div>;
    }
}
