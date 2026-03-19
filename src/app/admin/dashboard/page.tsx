"use client";

import React from "react";
import DashboardContent from "@/components/admin/DashboardContent";
import DashboardMobile from "../../../components/admin/DashboardMobile";
import { useIsMobile } from "@/hooks/useIsMobile";
import { getDashboardStats } from "./actions";
import { redirect } from "next/navigation";

export default function DashboardPage() {
    const isMobile = useIsMobile();
    const [stats, setStats] = React.useState<any>(null);
    const [isLoading, setIsLoading] = React.useState(true);

    React.useEffect(() => {
        const loadStats = async () => {
            const data = await getDashboardStats({ period: "week" });
            if (data && (data as any).success === false) {
                if ((data as any).error?.includes("Session")) {
                    window.location.href = "/admin/login";
                    return;
                }
            }
            setStats(data);
            setIsLoading(false);
        };
        loadStats();
    }, []);

    if (isLoading) return <div className="p-8 text-center text-slate-500 font-bold uppercase tracking-widest animate-pulse">Chargement Dashboard...</div>;

    if (!stats || stats.success === false) return <div className="p-8 text-red-500">Erreur de chargement des statistiques.</div>;

    return isMobile ? <DashboardMobile stats={stats} /> : <DashboardContent stats={stats} />;
}
