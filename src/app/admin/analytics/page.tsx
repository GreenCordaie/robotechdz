export const revalidate = 300;

import { getAnalyticsOverview, getAnalyticsRankings } from "./actions";
import AnalyticsContent from "./AnalyticsContent";
import { SystemQueries } from "@/services/queries/system.queries";

export async function generateMetadata() {
    const settings = await SystemQueries.getPublicSettings();
    return {
        title: `Analytique | ${settings.shopName}`,
        description: "Analyse des ventes, marges et performances clients.",
    };
}

export default async function AnalyticsPage() {
    // Initial fetch for the dashboard
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
}
