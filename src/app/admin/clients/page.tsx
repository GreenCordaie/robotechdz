import React from "react";
import ClientsContent from "@/components/admin/ClientsContent";
import { getClientsStats, getIndebtedClients } from "./actions";

export default async function ClientsPage() {
    const stats = await getClientsStats();
    const indebtedClients = await getIndebtedClients();

    return (
        <ClientsContent
            initialStats={stats}
            initialClients={indebtedClients}
        />
    );
}
