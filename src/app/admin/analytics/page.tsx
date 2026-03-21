import { getAnalyticsOverview, getAnalyticsRankings } from "./actions";
import AnalyticsContent from "./AnalyticsContent";

export const metadata = {
    title: "Tableau de Bord Analytique | Flexbox Admin",
    description: "Analyse des ventes, marges et performances clients.",
};

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
