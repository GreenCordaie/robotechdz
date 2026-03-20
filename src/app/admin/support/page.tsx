import { SupportContainer } from "./SupportContainer";
import { SupportQueries } from "@/services/queries/support.queries";
import { getCurrentUser } from "@/lib/security";
import { redirect } from "next/navigation";
import { UserRole } from "@/lib/constants";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Support Tickets | Robotech Admin",
};

export default async function SupportPage() {
    const user = await getCurrentUser();
    if (!user || (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.TRAITEUR)) {
        redirect("/auth/login");
    }

    const initialTickets = await SupportQueries.getTickets("OUVERT");

    return <SupportContainer initialTickets={initialTickets} />;
}
