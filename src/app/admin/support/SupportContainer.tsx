"use client";

import React from "react";
import SupportContent from "./SupportContent";
import SupportMobile from "./SupportMobile";
import { useIsMobile } from "@/hooks/useIsMobile";

interface SupportContainerProps {
    initialTickets: any[];
}

export function SupportContainer({ initialTickets }: SupportContainerProps) {
    const isMobile = useIsMobile();

    if (isMobile) {
        return <SupportMobile initialTickets={initialTickets} />;
    }

    return <SupportContent initialTickets={initialTickets} />;
}
