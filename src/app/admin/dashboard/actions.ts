"use server";

import { withAuth } from "@/lib/security";
import { z } from "zod";
import { DashboardQueries } from "@/services/queries/dashboard.queries";
import { UserRole } from "@/lib/constants";

export const getDashboardStats = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.CAISSIER, UserRole.TRAITEUR],
        schema: z.object({
            period: z.enum(["today", "yesterday", "week", "month", "all"]),
        })
    },
    async ({ period }) => {
        try {
            return await DashboardQueries.getStats(period);
        } catch (error) {
            console.error("Dashboard stats error:", error);
            // Return safe default object on error
            return {
                totalTurnover: 0,
                turnoverChange: 0,
                totalProfit: 0,
                profitChange: 0,
                ordersToday: 0,
                ordersChange: 0,
                pendingOrdersCount: 0,
                latestOrders: [],
                stockAlerts: 0,
                openTicketsCount: 0,
                isMaintenanceMode: false,
                revenueData: [],
                notifications: []
            };
        }
    }
);

export const getRealtimeOrders = withAuth(
    { roles: [UserRole.ADMIN, UserRole.CAISSIER, UserRole.TRAITEUR] },
    async () => {
        return await DashboardQueries.getRecentOrders(10);
    }
);

export const getLowStockAlerts = withAuth(
    { roles: [UserRole.ADMIN, UserRole.CAISSIER] },
    async () => {
        return await DashboardQueries.getLowStockList();
    }
);
