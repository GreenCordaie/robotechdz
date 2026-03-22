"use client";

import React from "react";
import DashboardContent from "@/components/admin/DashboardContent";
import DashboardMobile from "@/components/admin/DashboardMobile";
import { useIsMobile } from "@/hooks/useIsMobile";

interface DashboardContainerProps {
    initialStats: any;
}

export function DashboardContainer({ initialStats }: DashboardContainerProps) {
    const isMobile = useIsMobile();
    const [stats] = React.useState(initialStats);

    if (isMobile) return <DashboardMobile key="dashboard-mobile" stats={stats} />;
    return <DashboardContent key="dashboard-desktop" stats={stats} />;
}
