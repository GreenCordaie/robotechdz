"use client";

import React, { useState } from "react";
import { Search, Syringe } from "lucide-react";
import AdminCheckDeviceModal from "./AdminCheckDeviceModal";
import AdminInjectIptvModal from "./AdminInjectIptvModal";
import type { IptvPlan } from "@/app/kiosk/components/IbosolComboModal";

interface IbosolToolsBarProps {
    iptvPlans: IptvPlan[];
    onActionDone: () => void;
}

export default function IbosolToolsBar({ iptvPlans, onActionDone }: IbosolToolsBarProps) {
    const [checkOpen, setCheckOpen] = useState(false);
    const [injectOpen, setInjectOpen] = useState(false);

    return (
        <>
            <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-2xl p-4 flex items-center gap-3 flex-wrap">
                <span className="text-[11px] font-black uppercase tracking-widest text-cyan-700">
                    Outils Ibosol
                </span>
                <button
                    type="button"
                    onClick={() => setCheckOpen(true)}
                    className="flex items-center gap-2 text-xs font-black px-3 py-2 bg-white text-cyan-700 border border-cyan-200 rounded-lg hover:bg-cyan-50 transition-colors"
                >
                    <Search className="w-3.5 h-3.5" />
                    Vérifier device
                </button>
                <button
                    type="button"
                    onClick={() => setInjectOpen(true)}
                    className="flex items-center gap-2 text-xs font-black px-3 py-2 bg-white text-cyan-700 border border-cyan-200 rounded-lg hover:bg-cyan-50 transition-colors"
                >
                    <Syringe className="w-3.5 h-3.5" />
                    Injecter IPTV manuel
                </button>
            </div>

            <AdminCheckDeviceModal isOpen={checkOpen} onClose={() => setCheckOpen(false)} />

            <AdminInjectIptvModal
                isOpen={injectOpen}
                onClose={() => setInjectOpen(false)}
                iptvPlans={iptvPlans}
                onSuccess={() => {
                    setInjectOpen(false);
                    onActionDone();
                }}
            />
        </>
    );
}
