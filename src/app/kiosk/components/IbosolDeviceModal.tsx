"use client";

import React, { useState, useEffect } from "react";
import {
    Modal,
    ModalContent,
    ModalBody,
    Button,
    Input,
    Select,
    SelectItem,
} from "@heroui/react";

const APP_OPTIONS = [
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

    useEffect(() => {
        if (isOpen) {
            setMac("");
            setAppId("1");
        }
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

                                <Select
                                    label="Application"
                                    selectedKeys={[appId]}
                                    onChange={(e) => setAppId(e.target.value)}
                                    size="sm"
                                    variant="bordered"
                                    classNames={{
                                        label: "text-[10px] font-black text-black uppercase tracking-wider",
                                        trigger: "h-12 border-2 border-slate-200 bg-white rounded-lg shadow-sm",
                                        value: "text-sm font-black text-black",
                                    }}
                                >
                                    {APP_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.id}>{opt.label}</SelectItem>
                                    ))}
                                </Select>

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
