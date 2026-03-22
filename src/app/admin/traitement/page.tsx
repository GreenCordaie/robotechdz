import React from "react";
import { OrderQueries } from "@/services/queries/order.queries";
import { TraitementContainer } from "./TraitementContainer";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/security";

export default async function TraitementPage() {
    const user = await getCurrentUser();
    if (!user) {
        redirect("/admin/login");
    }

    try {
        // Pre-fetch both pending and a subset of finished for initial load
        const initialPending = await OrderQueries.getPaid();
        const initialFinished = await OrderQueries.getFinished();

        return (
            <TraitementContainer
                initialPending={initialPending}
                initialFinished={initialFinished}
            />
        );
    } catch (error) {
        console.error("Traitement page error:", error);
        return <div className="p-8 text-red-500 font-bold uppercase tracking-widest text-center">Erreur de chargement des commandes.</div>;
    }
}
