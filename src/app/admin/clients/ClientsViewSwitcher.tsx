"use client";

import React from "react";
import ClientsContent from "@/components/admin/ClientsContent";
import ClientsMobile from "./ClientsMobile";
import { useIsMobile } from "@/hooks/useIsMobile";

export default function ClientsViewSwitcher(props: any) {
    const isMobile = useIsMobile();
    return isMobile ? <ClientsMobile {...props} /> : <ClientsContent {...props} />;
}
