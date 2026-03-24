import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/security";
import { UserRole } from "@/lib/constants";
import { getMonitoringLogs } from "./actions";
import MonitoringContent from "./MonitoringContent";

export const metadata = {
    title: "Monitoring | Admin",
    description: "Statut des services et logs système.",
};

export default async function MonitoringPage() {
    const user = await getCurrentUser();

    if (!user || (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN)) {
        redirect("/admin/login");
    }

    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

    const [healthResponse, logsResponse] = await Promise.all([
        fetch(`${baseUrl}/api/health`, { cache: "no-store" })
            .then((res) => res.json())
            .catch(() => ({ status: "degraded", uptime: 0, timestamp: new Date().toISOString(), services: [] })),
        getMonitoringLogs({}),
    ]);

    const logsData = "logs" in logsResponse
        ? logsResponse
        : { logs: [], counts: { info: 0, warn: 0, error: 0, critical: 0 }, uptime: process.uptime() };

    return (
        <MonitoringContent
            initialLogs={(logsData as any).logs ?? []}
            initialCounts={(logsData as any).counts ?? { info: 0, warn: 0, error: 0, critical: 0 }}
            initialUptime={(logsData as any).uptime ?? process.uptime()}
            initialServices={healthResponse.services ?? []}
        />
    );
}
