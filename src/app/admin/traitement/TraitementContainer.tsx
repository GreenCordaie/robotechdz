"use client";

import React from "react";
import TraitementContent from "./TraitementContent";
import TraitementMobile from "./TraitementMobile";
import { useIsMobile } from "@/hooks/useIsMobile";

interface TraitementContainerProps {
    initialPending: any[];
    initialFinished: any[];
}

export function TraitementContainer({ initialPending, initialFinished }: TraitementContainerProps) {
    const isMobile = useIsMobile();

    // We pass initial data to children which will manage their own periodic refreshes
    if (isMobile) {
        return <TraitementMobile initialOrders={initialPending} initialFinished={initialFinished} />;
    }

    return <TraitementContent initialOrders={initialPending} initialFinished={initialFinished} />;
}
