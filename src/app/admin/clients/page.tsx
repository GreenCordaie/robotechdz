import React from "react";
import ClientsContent from "@/components/admin/ClientsContent";
import { getClientStats, getIndebtedClients } from "./actions";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
    const stats: any = await getClientStats({});
    const indebtedClients: any = await getIndebtedClients({});

    if (stats.success === false || indebtedClients.success === false) {
        return (
            <div className="p-8 text-white bg-red-900/20 rounded-xl border border-red-500/50">
                Une erreur de sécurité est survenue : {stats.error || indebtedClients.error}
            </div>
        );
    }

    return (
        <ClientsContent
            initialStats={stats}
            initialClients={indebtedClients}
        />
    );
}
