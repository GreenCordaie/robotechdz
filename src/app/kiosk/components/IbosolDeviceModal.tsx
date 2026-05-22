"use client";

import React, { useState, useEffect } from "react";
import {
    Modal,
    ModalContent,
    ModalBody,
    Button,
    Input,
} from "@heroui/react";

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

interface IbosolDeviceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (mac: string, appId: number) => void;
    productName: string;
}

export default function IbosolDeviceModal({
    isOpen,
    onClose,
    onConfirm,
    productName,
}: IbosolDeviceModalProps) {
    const [mac, setMac] = useState("");
    const [appId, setAppId] = useState("1");
    const [appOptions, setAppOptions] = useState<AppOption[]>(FALLBACK_APP_OPTIONS);

    useEffect(() => {
        if (isOpen) {
            setMac("");
            setAppId("1");
        }
    }, [isOpen]);

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

    const isValidMac = MAC_REGEX.test(mac.trim());

    const handleConfirm = () => {
        if (!isValidMac) return;
        onConfirm(mac.trim().toUpperCase(), parseInt(appId, 10));
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={onClose}
            size="md"
            placement="center"
            backdrop="blur"
            hideCloseButton
            classNames={{
                base: "bg-white rounded-[24px] shadow-2xl p-0 overflow-hidden",
                backdrop: "bg-slate-900/40 backdrop-blur-xl",
                body: "p-0",
            }}
        >
            <ModalContent>
                {(closeFn) => (
                    <ModalBody className="relative flex flex-col p-0">
                        <div className="p-5 md:p-6">
                            <header className="flex flex-col items-center mb-5">
                                <div className="w-14 h-14 mb-3 bg-cyan-50 border border-cyan-100 rounded-xl shadow-sm flex items-center justify-center">
                                    <span className="material-symbols-outlined text-cyan-600 !text-3xl">devices</span>
                                </div>
                                <h1 className="text-black text-lg font-black text-center leading-tight mb-0.5 uppercase tracking-tight">
                                    Adresse MAC du device
                                </h1>
                                <p className="text-black/50 text-[10px] text-center max-w-xs font-bold uppercase tracking-wider">
                                    Récupérable dans les paramètres de votre IBO Player
                                </p>
                                <div className="mt-2 px-2.5 py-0.5 bg-cyan-50 rounded-md border border-cyan-100/50">
                                    <p className="text-cyan-700 font-black uppercase tracking-widest text-[9px]">{productName}</p>
                                </div>
                            </header>

                            <section className="space-y-3">
                                <Input
                                    label="Adresse MAC"
                                    placeholder="AA:BB:CC:DD:EE:FF"
                                    variant="bordered"
                                    size="sm"
                                    value={mac}
                                    onValueChange={setMac}
                                    isInvalid={mac.length > 0 && !isValidMac}
                                    errorMessage={mac.length > 0 && !isValidMac ? "Format MAC invalide" : ""}
                                    classNames={{
                                        input: "text-sm h-6 text-black font-black font-mono uppercase",
                                        label: "text-[10px] font-black text-black uppercase tracking-wider",
                                        inputWrapper: "h-12 border-2 border-slate-200 bg-white rounded-lg group-data-[focus=true]:border-cyan-500 shadow-sm transition-all",
                                    }}
                                    autoFocus
                                />

                                <div className="space-y-1.5">
                                    <label className="block text-[10px] font-black text-black uppercase tracking-wider">
                                        Application
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={appId}
                                            onChange={(e) => setAppId(e.target.value)}
                                            className="w-full h-12 border-2 border-slate-200 bg-white rounded-lg shadow-sm px-3 pr-10 text-sm font-black text-black focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 outline-none appearance-none cursor-pointer transition-colors"
                                        >
                                            {appOptions.map((opt) => (
                                                <option key={opt.id} value={opt.id}>
                                                    {opt.label}
                                                </option>
                                            ))}
                                        </select>
                                        <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none !text-lg">expand_more</span>
                                    </div>
                                </div>

                                <div className="flex items-start gap-2.5 p-3.5 bg-cyan-50/50 rounded-xl border border-cyan-100">
                                    <span className="material-symbols-outlined text-cyan-600 !text-lg mt-0.5">info</span>
                                    <p className="text-[11px] font-black text-black/80 leading-snug">
                                        Format : 6 paires hex séparées par <code className="font-mono">:</code> ou <code className="font-mono">-</code>.<br />
                                        Une erreur de MAC bloque l&apos;activation — pas de remboursement.
                                    </p>
                                </div>
                            </section>

                            <footer className="grid grid-cols-2 gap-3 mt-6">
                                <Button
                                    size="md"
                                    className="h-11 rounded-lg bg-white border-2 border-slate-200 text-black font-black text-xs active:scale-95 transition-transform"
                                    onPress={closeFn}
                                >
                                    Annuler
                                </Button>
                                <Button
                                    size="md"
                                    className="h-11 rounded-lg bg-cyan-600 text-white font-black text-xs shadow-lg active:scale-95 transition-all uppercase tracking-tight"
                                    onPress={handleConfirm}
                                    isDisabled={!isValidMac}
                                >
                                    Confirmer
                                </Button>
                            </footer>
                        </div>
                    </ModalBody>
                )}
            </ModalContent>
        </Modal>
    );
}
