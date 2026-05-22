"use client";

import React, { useEffect, useState } from "react";
import { Modal, ModalContent, ModalBody, Button, Input, Select, SelectItem } from "@heroui/react";

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

interface IbosolCheckModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (mac: string, appId: number) => void;
    theme?: "light" | "dark";
}

export default function IbosolCheckModal({ isOpen, onClose, onSubmit, theme = "light" }: IbosolCheckModalProps) {
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
    const isDark = theme === "dark";

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={onClose}
            size="md"
            placement="center"
            backdrop="blur"
            hideCloseButton
            classNames={{
                base: isDark
                    ? "bg-[#161616] border border-white/10 rounded-[24px]"
                    : "bg-white rounded-[24px]",
                backdrop: "bg-slate-900/60 backdrop-blur-xl",
            }}
        >
            <ModalContent>
                {(closeFn) => (
                    <ModalBody className="p-6">
                        <header className="text-center mb-5">
                            <div className={`inline-block p-3 rounded-2xl mb-3 ${isDark ? "bg-cyan-500/10" : "bg-cyan-50"}`}>
                                <span className="material-symbols-outlined !text-3xl text-cyan-500">search</span>
                            </div>
                            <h2 className={`text-lg font-black uppercase tracking-tight ${isDark ? "text-white" : "text-black"}`}>
                                Vérifier mon device
                            </h2>
                            <p className={`text-xs mt-1 font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
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
                                classNames={{
                                    input: `font-mono uppercase font-black ${isDark ? "text-white" : "text-black"}`,
                                    label: isDark ? "text-slate-300" : "text-black",
                                    inputWrapper: isDark ? "bg-zinc-900/40 border-white/10 group-data-[focus=true]:border-cyan-500" : "",
                                }}
                                autoFocus
                            />

                            <div className="space-y-1.5">
                                <label className={`block text-[10px] font-black uppercase tracking-wider ${isDark ? "text-slate-300" : "text-black"}`}>
                                    Application
                                </label>
                                <Select
                                    aria-label="Application"
                                    selectedKeys={[appId]}
                                    onChange={(e) => e.target.value && setAppId(e.target.value)}
                                    classNames={{
                                        trigger: `h-12 border-2 rounded-lg shadow-sm ${
                                            isDark
                                                ? "bg-zinc-900/40 border-white/10 data-[hover=true]:bg-zinc-900/60"
                                                : "bg-white border-slate-200 data-[hover=true]:bg-white"
                                        }`,
                                        value: `text-sm font-black ${isDark ? "text-white" : "text-black"}`,
                                        listbox: isDark ? "bg-[#161616]" : "bg-white",
                                        popoverContent: isDark ? "bg-[#161616] border border-white/10" : "bg-white",
                                    }}
                                    renderValue={(items) => {
                                        const selected = items[0];
                                        if (!selected) return null;
                                        const opt = appOptions.find((o) => o.id === selected.key);
                                        if (!opt) return null;
                                        return (
                                            <div className="flex items-center gap-2">
                                                {opt.icon && opt.icon.startsWith("http") && (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={opt.icon} alt="" className="w-6 h-6 rounded object-cover" />
                                                )}
                                                <span>{opt.label}</span>
                                            </div>
                                        );
                                    }}
                                >
                                    {appOptions.map((opt) => (
                                        <SelectItem
                                            key={opt.id}
                                            textValue={opt.label}
                                            startContent={
                                                opt.icon && opt.icon.startsWith("http") ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={opt.icon} alt="" className="w-6 h-6 rounded object-cover flex-shrink-0" />
                                                ) : null
                                            }
                                            className={isDark ? "text-white" : "text-black"}
                                        >
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </Select>
                            </div>
                        </div>

                        <footer className="grid grid-cols-2 gap-3 mt-6">
                            <Button
                                className={isDark ? "bg-white/5 border border-white/10 text-white font-black" : "bg-white border-2 border-slate-200 text-black font-black"}
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
