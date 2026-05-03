"use client";

import React, { useEffect, useState } from "react";
import { Modal, ModalContent, ModalBody, Button, Input, Select, SelectItem } from "@heroui/react";

const APP_OPTIONS = [
    { id: "1", label: "IBO Player" },
    { id: "2", label: "SmartOne" },
    { id: "3", label: "BOB Player" },
    { id: "4", label: "IBO Pro" },
];

const MAC_REGEX = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;

interface IbosolCheckModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (mac: string, appId: number) => void;
}

export default function IbosolCheckModal({ isOpen, onClose, onSubmit }: IbosolCheckModalProps) {
    const [mac, setMac] = useState("");
    const [appId, setAppId] = useState("1");

    useEffect(() => {
        if (isOpen) {
            setMac("");
            setAppId("1");
        }
    }, [isOpen]);

    const isValidMac = MAC_REGEX.test(mac.trim());

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={onClose}
            size="md"
            placement="center"
            backdrop="blur"
            hideCloseButton
            classNames={{ base: "bg-white rounded-[24px]", backdrop: "bg-slate-900/40 backdrop-blur-xl" }}
        >
            <ModalContent>
                {(closeFn) => (
                    <ModalBody className="p-6">
                        <header className="text-center mb-5">
                            <div className="inline-block p-3 bg-cyan-50 rounded-2xl mb-3">
                                <span className="material-symbols-outlined !text-3xl text-cyan-600">search</span>
                            </div>
                            <h2 className="text-lg font-black uppercase tracking-tight text-black">
                                Vérifier mon device
                            </h2>
                            <p className="text-xs text-slate-500 mt-1 font-bold uppercase tracking-wider">
                                Service gratuit · Résultat affiché à l&apos;écran
                            </p>
                        </header>

                        <div className="space-y-3">
                            <Input
                                label="Adresse MAC"
                                placeholder="AA:BB:CC:DD:EE:FF"
                                variant="bordered"
                                value={mac}
                                onValueChange={setMac}
                                isInvalid={mac.length > 0 && !isValidMac}
                                errorMessage={mac.length > 0 && !isValidMac ? "Format invalide" : ""}
                                classNames={{ input: "font-mono uppercase font-black" }}
                                autoFocus
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
                        </div>

                        <footer className="grid grid-cols-2 gap-3 mt-6">
                            <Button
                                className="bg-white border-2 border-slate-200 text-black font-black"
                                onPress={closeFn}
                            >
                                Annuler
                            </Button>
                            <Button
                                className="bg-cyan-600 text-white font-black"
                                onPress={() => {
                                    if (!isValidMac) return;
                                    onSubmit(mac.trim().toUpperCase(), parseInt(appId, 10));
                                }}
                                isDisabled={!isValidMac}
                            >
                                Vérifier
                            </Button>
                        </footer>
                    </ModalBody>
                )}
            </ModalContent>
        </Modal>
    );
}
