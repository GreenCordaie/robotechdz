import { getClientStats, getAllClients } from "./actions";
import { redirect } from "next/navigation";
import ClientsViewSwitcher from "./ClientsViewSwitcher";

export const revalidate = 60;

export default async function ClientsPage() {
    const stats: any = await getClientStats({});
    const clientsData: any = await getAllClients({});

    if (stats.success === false || clientsData.success === false) {
        if (stats.error?.includes("Session") || clientsData.error?.includes("Session")) {
            return redirect("/admin/login");
        }
        return (
            <div className="p-8 text-white bg-red-900/20 rounded-xl border border-red-500/50">
                Une erreur de sécurité est survenue : {stats.error || clientsData.error}
            </div>
        );
    }

    return (
        <ClientsViewSwitcher
            initialStats={stats}
            initialClients={clientsData.clients || []}
        />
    );
}
