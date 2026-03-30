import React from "react";
export const revalidate = 120;
import { OrderQueries } from "@/services/queries/order.queries";
import { CommandesContent } from "./CommandesContent";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/security";

export default async function CommandesPage() {
    const user = await getCurrentUser();
    if (!user) {
        redirect("/admin/login");
    }

    try {
        const initialOrders = await OrderQueries.getHistory(50);

        return (
            <CommandesContent
                initialOrders={initialOrders}
            />
        );
    } catch (error) {
        console.error("Commandes page error:", error);
        return <div className="p-8 text-red-500 font-bold uppercase tracking-widest text-center">Erreur de chargement de l&apos;historique.</div>;
    }
}
