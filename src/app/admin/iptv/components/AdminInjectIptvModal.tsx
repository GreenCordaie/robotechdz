"use client";

import React, { useState, useEffect } from "react";
import { Modal, ModalContent, ModalBody, Button, Input } from "@heroui/react";
import { toast } from "react-hot-toast";
import { manualInjectIptvAction } from "../actions";
import type { IptvPlan } from "@/app/kiosk/components/IbosolComboModal";

interface AppOption {
    id: string;
    label: string;
    icon?: string;
}

const FALLBACK_APP_OPTIONS: AppOption[] = [
    { id: "1", label: "IBO Player" },
    { id: "2", label: "SmartOne" },
    { id: "3", label: "BOB Player" },
    { id: "4", label: "IBO Pro" },
];

const MAC_REGEX = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;

interface AdminInjectIptvModalProps {
    isOpen: boolean;
    onClose: () => void;
    iptvPlans: IptvPlan[];
    onSuccess: () => void;
}

export default function AdminInjectIptvModal({ isOpen, onClose, iptvPlans, onSuccess }: AdminInjectIptvModalProps) {
    const [mac, setMac] = useState("");
    const [appId, setAppId] = useState("1");
    const [appOptions, setAppOptions] = useState<AppOption[]>(FALLBACK_APP_OPTIONS);
    const [activeProvider, setActiveProvider] = useState("");
    const [selectedPlanId, setSelectedPlanId] = useState<string>("");
    const [customPrice, setCustomPrice] = useState("");
    const [phone, setPhone] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setMac("");
            setAppId("1");
            setSelectedPlanId("");
            setCustomPrice("");
            setPhone("");
            const firstProvider = iptvPlans[0]?.providerName || "";
            setActiveProvider(firstProvider);
        }
    }, [isOpen, iptvPlans]);

    useEffect(() => {
        if (!isOpen) return;
        fetch("/api/ibosol/apps")
            .then((r) => r.json())
            .then((body) => {
                if (Array.isArray(body?.data) && body.data.length > 0) {
                    setAppOptions(body.data.map((a: { id: number; name: string; icon?: string }) => ({
                        id: String(a.id),
                        label: a.name,
                        icon: a.icon,
                    })));
                }
            })
            .catch(() => {
                // keep fallback
            });
    }, [isOpen]);

    const providers = Array.from(new Set(iptvPlans.map((p) => p.providerName)));
    const filtered = iptvPlans
        .filter((p) => p.providerName === activeProvider)
        .sort((a, b) => b.durationDays - a.durationDays);
    const planObj = iptvPlans.find((p) => p.planId === selectedPlanId) || null;

    const isValid = MAC_REGEX.test(mac.trim()) && !!planObj;

    const handleSubmit = async () => {
        if (!isValid || !planObj) return;
        setSubmitting(true);
        try {
            const res: any = await manualInjectIptvAction({
                mac: mac.trim().toUpperCase(),
                appId: parseInt(appId, 10),
                iptvVariantId: planObj.variantId,
                iptvProviderId: planObj.providerId,
                iptvPlanId: planObj.planId,
                iptvProductName: planObj.productName,
                iptvPrice: planObj.price,
                customPrice: customPrice || planObj.price,
                customerPhone: phone || undefined,
            });
            if (res.success) {
                toast.success("Inject lancé");
                onSuccess();
            } else {
                toast.error(res.error || "Erreur");
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={onClose}
            size="lg"
            placement="center"
            backdrop="blur"
            hideCloseButton
            classNames={{
                base: "bg-[#161616] border border-white/10 rounded-[24px]",
                backdrop: "bg-slate-900/60 backdrop-blur-xl",
            }}
        >
            <ModalContent>
                {(closeFn) => (
                    <ModalBody className="p-6">
                        <header className="text-center mb-5">
                            <h2 className="text-lg font-black uppercase tracking-tight text-white">
                                Injecter IPTV manuellement
                            </h2>
                            <p className="text-xs text-slate-400 mt-1 font-bold uppercase tracking-wider">
                                SAV — device IBO déjà activé
                            </p>
                        </header>

                        <div className="space-y-3">
                            <Input
                                label="Adresse MAC"
                                value={mac}
                                onValueChange={setMac}
                                variant="bordered"
                                placeholder="AA:BB:CC:DD:EE:FF"
                                isInvalid={mac.length > 0 && !MAC_REGEX.test(mac.trim())}
                                classNames={{
                                    input: "text-white font-mono uppercase",
                                    label: "text-slate-300",
                                    inputWrapper: "bg-zinc-900/40 border-white/10 group-data-[focus=true]:border-cyan-500",
                                }}
                            />

                            <div className="space-y-1.5">
                                <label className="block text-[10px] font-black text-slate-300 uppercase tracking-wider">
                                    Application
                                </label>
                                <div className="relative">
                                    <select
                                        value={appId}
                                        onChange={(e) => setAppId(e.target.value)}
                                        className="w-full h-12 border-2 border-white/10 bg-zinc-900/40 rounded-lg shadow-sm px-3 pr-10 text-sm font-black text-white focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 outline-none appearance-none cursor-pointer transition-colors"
                                    >
                                        {appOptions.map((opt) => (
                                            <option key={opt.id} value={opt.id} className="bg-[#161616] text-white">
                                                {opt.label}
                                            </option>
                                        ))}
                                    </select>
                                    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none !text-lg">expand_more</span>
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-black uppercase tracking-wider text-slate-300 mb-2 block">
                                    Provider IPTV
                                </label>
                                <div className="flex gap-2 mb-2 overflow-x-auto">
                                    {providers.map((p) => (
                                        <button
                                            key={p}
                                            type="button"
                                            onClick={() => setActiveProvider(p)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase whitespace-nowrap transition-colors ${
                                                activeProvider === p
                                                    ? "bg-cyan-600 text-white"
                                                    : "bg-white/5 text-slate-300 hover:bg-white/10"
                                            }`}
                                        >
                                            {p}
                                        </button>
                                    ))}
                                </div>
                                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                    {filtered.map((p) => (
                                        <button
                                            key={p.planId}
                                            type="button"
                                            onClick={() => setSelectedPlanId(p.planId)}
                                            className={`w-full p-2.5 border-2 rounded-lg flex justify-between text-sm transition-colors ${
                                                selectedPlanId === p.planId
                                                    ? "border-cyan-500 bg-cyan-500/10"
                                                    : "border-white/10 bg-zinc-900/40 hover:border-white/20"
                                            }`}
                                        >
                                            <span className="font-bold text-white">{p.productName}</span>
                                            <span className="font-black text-white">{p.price} DZD</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <Input
                                label="Prix négocié (DZD, vide = prix catalogue)"
                                value={customPrice}
                                onValueChange={setCustomPrice}
                                placeholder={planObj?.price || ""}
                                variant="bordered"
                                type="number"
                                classNames={{
                                    input: "text-white",
                                    label: "text-slate-300",
                                    inputWrapper: "bg-zinc-900/40 border-white/10 group-data-[focus=true]:border-cyan-500",
                                }}
                            />

                            <Input
                                label="Téléphone client (optionnel pour WhatsApp)"
                                value={phone}
                                onValueChange={setPhone}
                                variant="bordered"
                                placeholder="+213..."
                                classNames={{
                                    input: "text-white",
                                    label: "text-slate-300",
                                    inputWrapper: "bg-zinc-900/40 border-white/10 group-data-[focus=true]:border-cyan-500",
                                }}
                            />
                        </div>

                        <footer className="grid grid-cols-2 gap-3 mt-6">
                            <Button
                                onPress={closeFn}
                                className="bg-white/5 border border-white/10 text-white font-black"
                            >
                                Annuler
                            </Button>
                            <Button
                                onPress={handleSubmit}
                                isDisabled={!isValid || submitting}
                                className="bg-cyan-600 text-white font-black"
                            >
                                {submitting ? "En cours..." : "Injecter"}
                            </Button>
                        </footer>
                    </ModalBody>
                )}
            </ModalContent>
        </Modal>
    );
}
