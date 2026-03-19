"use client";

import React from "react";
import B2bManagementContent from "@/components/admin/B2bManagementContent";
import B2bMobile from "./B2bMobile";
import { useIsMobile } from "@/hooks/useIsMobile";

export default function B2bViewSwitcher() {
    const isMobile = useIsMobile();
    return isMobile ? <B2bMobile /> : <B2bManagementContent />;
}
