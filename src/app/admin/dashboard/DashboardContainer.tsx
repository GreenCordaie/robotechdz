"use client";

import React from "react";
import DashboardContent from "@/components/admin/DashboardContent";
import DashboardMobile from "@/components/admin/DashboardMobile";
import { useIsMobile } from "@/hooks/useIsMobile";
import { getDashboardStats } from "./actions";

interface DashboardContainerProps {
    initialStats: any;
}

export function DashboardContainer({ initialStats }: DashboardContainerProps) {
    const isMobile = useIsMobile();
    const [stats, setStats] = React.useState(initialStats);
    const [isLoading, setIsLoading] = React.useState(false);

    // This allows manual refresh or period change if needed from children
    const refreshStats = async (period: any = "week") => {
        setIsLoading(true);
        try {
            const data = await getDashboardStats({ period });
            if (data) setStats(data);
        } finally {
            setIsLoading(false);
        }
    };

    if (isMobile) return <DashboardMobile key="dashboard-mobile" stats={stats} />;
    return <DashboardContent key="dashboard-desktop" stats={stats} />;
}
