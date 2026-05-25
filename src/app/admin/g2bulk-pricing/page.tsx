import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/security";
import { UserRole } from "@/lib/constants";
import {
    getAllG2BulkPricingRulesAction,
    getG2BulkUsdRateAction,
    getG2BulkTiersForSimulatorAction,
} from "./actions";
import G2BulkPricingClient from "./G2BulkPricingClient";

export const dynamic = "force-dynamic";

export default async function G2BulkPricingPage() {
    const user = await getCurrentUser();
    if (!user || user.role !== UserRole.ADMIN) {
        redirect("/admin/login");
    }

    const [rulesRes, rateRes, tiersRes] = await Promise.all([
        getAllG2BulkPricingRulesAction({} as never),
        getG2BulkUsdRateAction({} as never),
        getG2BulkTiersForSimulatorAction({} as never),
    ]);

    const rules = rulesRes && "success" in rulesRes && rulesRes.success ? rulesRes.data : [];
    const rate = rateRes && "success" in rateRes && rateRes.success ? rateRes.data.rate : 270;
    const tiers = tiersRes && "success" in tiersRes && tiersRes.success ? tiersRes.data : [];

    return <G2BulkPricingClient initialRules={rules as never} initialRate={rate} tiers={tiers as never} />;
}
