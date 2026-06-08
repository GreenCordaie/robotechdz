import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/security";
import { UserRole } from "@/lib/constants";
import ArbitrageClient from "./ArbitrageClient";
import { getBsvTrackedLinksAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Arbitrage (BSV) - Admin",
};

export default async function ArbitragePage() {
    const user = await getCurrentUser();
    if (!user || user.role !== UserRole.ADMIN) {
        redirect("/admin/login");
    }

    const res = await getBsvTrackedLinksAction({} as any);
    const links = res.success ? res.data : [];

    return <ArbitrageClient initialLinks={links as any} />;
}
