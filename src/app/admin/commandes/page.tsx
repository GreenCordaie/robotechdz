import React from "react";
import { OrderQueries } from "@/services/queries/order.queries";
import { CommandesContent } from "./CommandesContent";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/security";

export const dynamic = "force-dynamic";

export default async function CommandesPage({
    searchParams,
}: {
    searchParams: { page?: string; search?: string };
}) {
    const user = await getCurrentUser();
    if (!user) redirect("/admin/login");

    const page = Math.max(1, parseInt(searchParams.page || "1", 10));
    const search = searchParams.search || "";

    try {
        const { data, total, totalPages } = await OrderQueries.getHistoryPaginated(page, 20, search);

        return (
            <CommandesContent
                initialOrders={data}
                total={total}
                page={page}
                totalPages={totalPages}
                search={search}
            />
        );
    } catch (error) {
        console.error("Commandes page error:", error);
        return <div className="p-8 text-red-500 font-bold uppercase tracking-widest text-center">Erreur de chargement de l&apos;historique.</div>;
    }
}
