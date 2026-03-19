"use client";

import React from "react";
import CaisseContent from "./CaisseContent";
import CaisseMobile from "./CaisseMobile";
import { useIsMobile } from "@/hooks/useIsMobile";

export default function CaissePage() {
    const isMobile = useIsMobile();
    return isMobile ? <CaisseMobile /> : <CaisseContent />;
}
