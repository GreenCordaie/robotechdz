"use client";

import React from "react";
import SharedAccountsContent from "./SharedAccountsContent";
import SharedAccountsMobile from "./SharedAccountsMobile";
import { useIsMobile } from "@/hooks/useIsMobile";

export default function SharedAccountsViewSwitcher() {
    const isMobile = useIsMobile();
    return isMobile ? <SharedAccountsMobile /> : <SharedAccountsContent />;
}
