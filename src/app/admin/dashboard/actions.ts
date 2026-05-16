"use server";

import { withAuth } from "@/lib/security";
import { z } from "zod";
import { UserRole } from "@/lib/constants";
import { cacheGet, cacheSet, CACHE_KEYS, CACHE_TTL } from "@/lib/redis";

export const getDashboardStats = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.CAISSIER, UserRole.TRAITEUR],
        schema: z.object({
            period: z.enum(["today", "yesterday", "week", "month", "all"]),
        })
    },
    async ({ period }) => {
        try {
            const cacheKey = CACHE_KEYS.DASHBOARD(period);
            const cached = await cacheGet<unknown>(cacheKey);
            if (cached) return cached;

            const { DashboardQueries } = await import("@/services/queries/dashboard.queries");
            const result = await DashboardQueries.getStats(period);
            cacheSet(cacheKey, result, CACHE_TTL.DASHBOARD).catch(() => {});
            return result;
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
        const { DashboardQueries } = await import("@/services/queries/dashboard.queries");
        return await DashboardQueries.getRecentOrders(10);
    }
);

export const getLowStockAlerts = withAuth(
    { roles: [UserRole.ADMIN, UserRole.CAISSIER] },
    async () => {
        const { DashboardQueries } = await import("@/services/queries/dashboard.queries");
        return await DashboardQueries.getLowStockList();
    }
);
