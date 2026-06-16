import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/security";
import { UserRole } from "@/lib/constants";
import { listActiveCodeRefundRequestsAction } from "./actions";
import RefundRequestsClient, { type RefundRequestRow } from "./RefundRequestsClient";

export const dynamic = "force-dynamic";

export default async function RefundRequestsPage() {
    const user = await getCurrentUser();
    if (!user || (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN)) {
        redirect("/admin/login");
    }

    const res = await listActiveCodeRefundRequestsAction({});
    const rows: RefundRequestRow[] =
        res && "success" in res && res.success ? (res.data as RefundRequestRow[]) : [];

    return <RefundRequestsClient initialRows={rows} />;
}
