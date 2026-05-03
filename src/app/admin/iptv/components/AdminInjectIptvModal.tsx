"use client";

import React, { useState, useEffect } from "react";
import { Modal, ModalContent, ModalBody, Button, Input, Select, SelectItem } from "@heroui/react";
import { toast } from "react-hot-toast";
import { manualInjectIptvAction } from "../actions";
import type { IptvPlan } from "@/app/kiosk/components/IbosolComboModal";

const APP_OPTIONS = [
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
            classNames={{ base: "bg-white rounded-[24px]", backdrop: "bg-slate-900/40 backdrop-blur-xl" }}
        >
            <ModalContent>
                {(closeFn) => (
                    <ModalBody className="p-6">
                        <header className="text-center mb-5">
                            <h2 className="text-lg font-black uppercase tracking-tight text-black">
                                Injecter IPTV manuellement
                            </h2>
                            <p className="text-xs text-slate-500 mt-1 font-bold uppercase tracking-wider">
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
                            />

                            <Select
                                label="Application"
                                selectedKeys={[appId]}
                                onChange={(e) => setAppId(e.target.value)}
                                variant="bordered"
                                popoverProps={{
                                    classNames: {
                                        content: "z-[100000]",
                                        base: "z-[100000]",
                                    },
                                }}
                            >
                                {APP_OPTIONS.map((opt) => (
                                    <SelectItem key={opt.id}>{opt.label}</SelectItem>
                                ))}
                            </Select>

                            <div>
                                <label className="text-[10px] font-black uppercase tracking-wider text-black mb-2 block">
                                    Provider IPTV
                                </label>
                                <div className="flex gap-2 mb-2 overflow-x-auto">
                                    {providers.map((p) => (
                                        <button
                                            key={p}
                                            type="button"
                                            onClick={() => setActiveProvider(p)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase whitespace-nowrap ${activeProvider === p ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-600"
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
                                            className={`w-full p-2 border-2 rounded-lg flex justify-between text-sm ${selectedPlanId === p.planId ? "border-cyan-500 bg-cyan-50" : "border-slate-200"
                                                }`}
                                        >
                                            <span className="font-bold text-black">{p.productName}</span>
                                            <span className="font-black text-black">{p.price} DZD</span>
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
                            />

                            <Input
                                label="Téléphone client (optionnel pour WhatsApp)"
                                value={phone}
                                onValueChange={setPhone}
                                variant="bordered"
                                placeholder="+213..."
                            />
                        </div>

                        <footer className="grid grid-cols-2 gap-3 mt-6">
                            <Button
                                onPress={closeFn}
                                className="bg-white border-2 border-slate-200 text-black font-black"
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
