import React from "react";
import DashboardContent from "@/components/admin/DashboardContent";
import { getDashboardStats } from "./actions";

export default async function DashboardPage() {
    const stats = await getDashboardStats();

    return <DashboardContent stats={stats} />;
}
