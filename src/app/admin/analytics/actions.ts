"use server";

import { withAuth } from "@/lib/security";
import { UserRole } from "@/lib/constants";
import { AnalyticsService } from "@/services/analytics.service";
import { z } from "zod";
import { getGeminiResponse } from "@/lib/gemini";
import { db } from "@/db";
import { shopSettings, supportTickets } from "@/db/schema";
import { eq, count } from "drizzle-orm";

export const getAnalyticsOverview = withAuth(
    { roles: [UserRole.ADMIN], schema: z.object({}) },
    async ({ }, user) => {
        try {
            const [overview, chartData, ticketsResult] = await Promise.all([
                AnalyticsService.getFinancialOverview(),
                AnalyticsService.getProfitTrend(),
                db.select({ count: count() }).from(supportTickets).where(eq(supportTickets.status, 'OUVERT'))
            ]);

            return {
                success: true,
                data: {
                    overview,
                    chartData,
                    openTicketsCount: ticketsResult[0]?.count ?? 0
                }
            };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const getAnalyticsRankings = withAuth(
    { roles: [UserRole.ADMIN], schema: z.object({}) },
    async ({ }, user) => {
        try {
            const [topClients, topProducts] = await Promise.all([
                AnalyticsService.getTopClients(10),
                AnalyticsService.getTopProducts(10)
            ]);

            return {
                success: true,
                data: {
                    topClients,
                    topProducts
                }
            };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const getMarketingRecommendations = withAuth(
    { roles: [UserRole.ADMIN], schema: z.object({}) },
    async ({ }, user) => {
        try {
            const insights = await AnalyticsService.getMarketingInsights();

            // Fetch Gemini API key from settings
            const settings = await db.select().from(shopSettings).limit(1);
            const apiKey = settings[0]?.geminiApiKey;

            if (!apiKey) {
                return { success: false, error: "Clé API Gemini non configurée dans les paramètres." };
            }

            const prompt = `
                Analyse les données suivantes du magasin et propose 3 stratégies concrètes de Relances Cross-Selling pour fidéliser les clients :

                DONNÉES :
                - Clients Top : ${JSON.stringify(insights.topClients.map(c => ({ name: c.name, spent: c.totalSpent })))}
                - Produits Top : ${JSON.stringify(insights.topProducts.map(p => ({ product: p.productName, variant: p.variantName, sales: p.volume })))}
                - Résumé : ${insights.statsSummary.totalActiveClients} clients actifs, Meilleur vendeur: ${insights.statsSummary.bestSeller}.

                FORMAT : Produit une réponse courte, professionnelle et orientée action (3 points max).
            `;

            const recommendation = await getGeminiResponse(
                prompt,
                "ADMIN",
                apiKey,
                "Tu es un expert en marketing digital pour une boutique e-commerce de comptes premiums et services digitaux."
            );

            return {
                success: true,
                data: recommendation
            };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const getLowStockItemsAction = withAuth(
    { roles: [UserRole.ADMIN], schema: z.object({}) },
    async () => {
        try {
            const { DashboardQueries } = await import("@/services/queries/dashboard.queries");
            const data = await DashboardQueries.getLowStockList();
            return { success: true, data };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);
