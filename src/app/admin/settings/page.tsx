"use client";

import React from "react";
import SettingsContent from "./SettingsContent";
import SettingsMobile from "./SettingsMobile";
import { useIsMobile } from "@/hooks/useIsMobile";

export default function SettingsPage() {
    const isMobile = useIsMobile();
    return isMobile ? <SettingsMobile /> : <SettingsContent />;
}
