"use client";

import React from "react";
import SuppliersContent from "./SuppliersContent";
import SuppliersMobile from "./SuppliersMobile";
import { useIsMobile } from "@/hooks/useIsMobile";

export default function SuppliersViewSwitcher(props: any) {
    const isMobile = useIsMobile();
    return isMobile ? <SuppliersMobile {...props} /> : <SuppliersContent {...props} />;
}
