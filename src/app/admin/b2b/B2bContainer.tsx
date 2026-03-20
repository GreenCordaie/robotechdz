"use client";

import React from "react";
import B2bManagementContent from "@/components/admin/B2bManagementContent";
import B2bMobile from "./B2bMobile";
import { useIsMobile } from "@/hooks/useIsMobile";

interface B2bContainerProps {
    initialResellers: any[];
}

export function B2bContainer({ initialResellers }: B2bContainerProps) {
    const isMobile = useIsMobile();

    if (isMobile) {
        return <B2bMobile initialResellers={initialResellers} />;
    }

    return <B2bManagementContent initialResellers={initialResellers} />;
}
