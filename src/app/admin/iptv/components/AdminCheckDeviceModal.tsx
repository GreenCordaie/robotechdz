"use client";

import React, { useState } from "react";
import IbosolCheckModal from "@/app/kiosk/components/IbosolCheckModal";
import IbosolCheckResultModal from "@/app/kiosk/components/IbosolCheckResultModal";
import { checkIbosolDevice, type CheckDeviceResult } from "@/app/kiosk/actions/check-device";

interface AdminCheckDeviceModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function AdminCheckDeviceModal({ isOpen, onClose }: AdminCheckDeviceModalProps) {
    const [resultOpen, setResultOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<CheckDeviceResult | null>(null);

    return (
        <>
            <IbosolCheckModal
                isOpen={isOpen}
                onClose={onClose}
                onSubmit={async (mac, appId) => {
                    onClose();
                    setLoading(true);
                    setResultOpen(true);
                    const r = await checkIbosolDevice({ mac, appId });
                    setResult(r);
                    setLoading(false);
                }}
            />
            <IbosolCheckResultModal
                isOpen={resultOpen}
                onClose={() => {
                    setResultOpen(false);
                    setResult(null);
                }}
                result={result}
                loading={loading}
            />
        </>
    );
}
