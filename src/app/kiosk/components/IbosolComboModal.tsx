"use client";

import React, { useEffect, useState } from "react";
import { Modal, ModalContent, ModalBody, Button } from "@heroui/react";
import { formatCurrency } from "@/lib/formatters";
import { Tv, Check } from "lucide-react";

export interface IptvPlan {
    variantId: number;
    providerId: string;
    providerName: string;
    planId: string;
    productName: string;
    durationDays: number;
    price: string;
}

interface IbosolComboModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (combo: IptvPlan | null) => void;
    iboPrice: string;       // prix Activation IBO (DZD string)
    iboName: string;        // ex: "Activation 1 an"
    availablePlans: IptvPlan[];
}

export default function IbosolComboModal({
    isOpen,
    onClose,
    onConfirm,
    iboPrice,
    iboName,
    availablePlans,
}: IbosolComboModalProps) {
    const [mode, setMode] = useState<"none" | "skip" | "combo">("none");
    const [activeProvider, setActiveProvider] = useState<string>("");
    const [selectedPlan, setSelectedPlan] = useState<IptvPlan | null>(null);

    useEffect(() => {
        if (isOpen) {
            setMode("none");
            setSelectedPlan(null);
            const firstProvider = availablePlans[0]?.providerName || "";
            setActiveProvider(firstProvider);
        }
    }, [isOpen, availablePlans]);

    const providers = Array.from(new Set(availablePlans.map(p => p.providerName)));
    const plansByProvider = availablePlans
        .filter(p => p.providerName === activeProvider)
        .sort((a, b) => b.durationDays - a.durationDays);

    const total = parseFloat(iboPrice) + (selectedPlan ? parseFloat(selectedPlan.price) : 0);
    const canConfirm = mode === "skip" || (mode === "combo" && selectedPlan !== null);

    const handleConfirm = () => {
        if (!canConfirm) return;
        onConfirm(mode === "combo" ? selectedPlan : null);
    };

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={onClose}
            size="2xl"
            placement="center"
            backdrop="blur"
            hideCloseButton
            classNames={{
                base: "bg-white rounded-[24px] shadow-2xl",
                backdrop: "bg-slate-900/40 backdrop-blur-xl",
            }}
        >
            <ModalContent>
                {(closeFn) => (
                    <ModalBody className="p-6">
                        <header className="text-center mb-5">
                            <div className="inline-block p-3 bg-cyan-50 rounded-2xl mb-3">
                                <Tv className="w-6 h-6 text-cyan-600" />
                            </div>
                            <h2 className="text-lg font-black uppercase tracking-tight text-black">
                                Souhaitez-vous aussi un abonnement IPTV ?
                            </h2>
                            <p className="text-xs text-slate-500 mt-1 font-bold uppercase tracking-wider">
                                Bundle activation + IPTV → injection automatique sur votre device
                            </p>
                            <div className="mt-2 px-2.5 py-0.5 bg-cyan-50 rounded-md border border-cyan-100/50 inline-block">
                                <p className="text-cyan-700 font-black uppercase tracking-widest text-[9px]">{iboName}</p>
                            </div>
                        </header>

                        {/* Choix mode */}
                        <div className="grid grid-cols-2 gap-3 mb-5">
                            <button
                                onClick={() => { setMode("skip"); setSelectedPlan(null); }}
                                className={`p-4 border-2 rounded-2xl text-left transition-all ${
                                    mode === "skip"
                                        ? "border-slate-800 bg-slate-50"
                                        : "border-slate-200 bg-white hover:border-slate-300"
                                }`}
                            >
                                <div className="font-black text-black mb-1">Non, IBO seul</div>
                                <div className="text-sm font-bold text-slate-500">{formatCurrency(parseFloat(iboPrice), "DZD")}</div>
                            </button>

                            <button
                                onClick={() => setMode("combo")}
                                className={`p-4 border-2 rounded-2xl text-left transition-all ${
                                    mode === "combo"
                                        ? "border-cyan-500 bg-cyan-50"
                                        : "border-slate-200 bg-white hover:border-slate-300"
                                }`}
                            >
                                <div className="font-black text-black mb-1">Oui, ajouter un IPTV</div>
                                <div className="text-sm font-bold text-cyan-600">Choisir un plan ↓</div>
                            </button>
                        </div>

                        {/* Picker IPTV */}
                        {mode === "combo" && (
                            <div className="mb-5 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                <div className="flex gap-2 overflow-x-auto pb-1">
                                    {providers.map(p => (
                                        <button
                                            key={p}
                                            onClick={() => setActiveProvider(p)}
                                            className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider whitespace-nowrap transition-colors ${
                                                activeProvider === p
                                                    ? "bg-cyan-600 text-white"
                                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                            }`}
                                        >
                                            {p}
                                        </button>
                                    ))}
                                </div>

                                <div className="space-y-2">
                                    {plansByProvider.map(plan => {
                                        const isSelected = selectedPlan?.planId === plan.planId;
                                        return (
                                            <button
                                                key={plan.planId}
                                                onClick={() => setSelectedPlan(plan)}
                                                className={`w-full p-3 border-2 rounded-xl flex items-center justify-between transition-all ${
                                                    isSelected
                                                        ? "border-cyan-500 bg-cyan-50"
                                                        : "border-slate-200 bg-white hover:border-slate-300"
                                                }`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    {isSelected && <Check className="w-4 h-4 text-cyan-600" />}
                                                    <span className="font-bold text-black text-sm">{plan.productName}</span>
                                                </div>
                                                <span className="font-black text-black text-sm">
                                                    {formatCurrency(parseFloat(plan.price), "DZD")}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Total */}
                        <div className="mb-4 p-4 bg-slate-50 rounded-xl flex justify-between items-center">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-500">Total</span>
                            <span className="text-lg font-black text-black">
                                {formatCurrency(total, "DZD")}
                            </span>
                        </div>

                        <footer className="grid grid-cols-2 gap-3">
                            <Button
                                size="lg"
                                className="bg-white border-2 border-slate-200 text-black font-black"
                                onPress={closeFn}
                            >
                                Retour
                            </Button>
                            <Button
                                size="lg"
                                className="bg-cyan-600 text-white font-black"
                                onPress={handleConfirm}
                                isDisabled={!canConfirm}
                            >
                                Ajouter au panier
                            </Button>
                        </footer>
                    </ModalBody>
                )}
            </ModalContent>
        </Modal>
    );
}
