import React from "react";
import { SupplierQueries } from "@/services/queries/supplier.queries";
import { SystemQueries } from "@/services/queries/system.queries";
import SuppliersViewSwitcher from "./SuppliersViewSwitcher";
import { getCurrentUser } from "@/lib/security";
import { redirect } from "next/navigation";
import { UserRole } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function FournisseursPage() {
    const user = await getCurrentUser();
    if (!user || user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
        redirect("/admin/login");
    }

    const [suppliers, history, settings, stats] = await Promise.all([
        SupplierQueries.getAll(),
        SupplierQueries.getHistory(0),
        SystemQueries.getSettings(),
        SupplierQueries.getFinancialStats()
    ]);

    return (
        <SuppliersViewSwitcher
            initialSuppliers={suppliers}
            initialHistory={history}
            shopSettings={settings}
            initialStats={stats}
        />
    );
}
