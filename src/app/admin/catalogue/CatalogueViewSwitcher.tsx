"use client";

import React from "react";
import CatalogueContent from "@/components/admin/CatalogueContent";
import CatalogueMobile from "./CatalogueMobile";
import { useIsMobile } from "@/hooks/useIsMobile";

export default function CatalogueViewSwitcher(props: any) {
    const isMobile = useIsMobile();
    return isMobile ? <CatalogueMobile {...props} /> : <CatalogueContent {...props} />;
}
