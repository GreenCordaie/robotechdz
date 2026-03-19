"use client";

import React from "react";
import TraitementContent from "./TraitementContent";
import TraitementMobile from "./TraitementMobile";
import { useIsMobile } from "@/hooks/useIsMobile";

export default function TraitementPage() {
    const isMobile = useIsMobile();
    return isMobile ? <TraitementMobile /> : <TraitementContent />;
}
