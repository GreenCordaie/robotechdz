import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/security";
import { UserRole } from "@/lib/constants";
import {
    getAllPricingRulesAction,
    getUsdRateAction,
    getTiersForSimulatorAction,
} from "./actions";
import BsvPricingClient from "./BsvPricingClient";

export const dynamic = "force-dynamic";

export default async function BsvPricingPage() {
    const user = await getCurrentUser();
    if (!user || user.role !== UserRole.ADMIN) {
        redirect("/admin/login");
    }

    const [rulesRes, rateRes, tiersRes] = await Promise.all([
        getAllPricingRulesAction({} as any),
        getUsdRateAction({} as any),
        getTiersForSimulatorAction({} as any),
    ]);

    const rules = rulesRes && "success" in rulesRes && rulesRes.success ? rulesRes.data : [];
    const rate = rateRes && "success" in rateRes && rateRes.success ? rateRes.data.rate : 270;
    const tiers = tiersRes && "success" in tiersRes && tiersRes.success ? tiersRes.data : [];

    return <BsvPricingClient initialRules={rules as any} initialRate={rate} tiers={tiers as any} />;
}
