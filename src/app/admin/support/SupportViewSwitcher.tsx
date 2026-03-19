"use client";

import React from "react";
import SupportContent from "./SupportContent";
import SupportMobile from "./SupportMobile";
import { useIsMobile } from "@/hooks/useIsMobile";

export default function SupportViewSwitcher() {
    const isMobile = useIsMobile();
    return isMobile ? <SupportMobile /> : <SupportContent />;
}
