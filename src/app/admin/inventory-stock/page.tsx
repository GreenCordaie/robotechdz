import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/security";
import { UserRole } from "@/lib/constants";
import { getInventoryStockAction, type InventoryStockData } from "./actions";
import InventoryStockClient from "./InventoryStockClient";

export const dynamic = "force-dynamic";

const EMPTY: InventoryStockData = { summary: [], units: [], disabled: false };

export default async function InventoryStockPage() {
    const user = await getCurrentUser();
    if (!user || (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN)) {
        redirect("/admin/login");
    }

    const res = await getInventoryStockAction({});
    const data: InventoryStockData =
        res && "success" in res && res.success ? res.data : EMPTY;
    const error =
        res && "success" in res && !res.success ? res.error : null;

    return <InventoryStockClient data={data} error={error} />;
}
