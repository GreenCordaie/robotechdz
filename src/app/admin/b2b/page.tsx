import { B2bContainer } from "./B2bContainer";
import { ResellerQueries } from "@/services/queries/reseller.queries";

export const revalidate = 60;

export default async function AdminB2bPage() {
    const initialResellers = await ResellerQueries.getAll();

    return <B2bContainer initialResellers={initialResellers} />;
}
