import { getClientStats, getIndebtedClients } from "./actions";
import { redirect } from "next/navigation";
import ClientsViewSwitcher from "./ClientsViewSwitcher";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
    const stats: any = await getClientStats({});
    const indebtedClients: any = await getIndebtedClients({});

    if (stats.success === false || indebtedClients.success === false) {
        if (stats.error?.includes("Session") || indebtedClients.error?.includes("Session")) {
            return redirect("/admin/login");
        }
        return (
            <div className="p-8 text-white bg-red-900/20 rounded-xl border border-red-500/50">
                Une erreur de sécurité est survenue : {stats.error || indebtedClients.error}
            </div>
        );
    }

    return (
        <ClientsViewSwitcher
            initialStats={stats}
            initialClients={indebtedClients}
        />
    );
}
