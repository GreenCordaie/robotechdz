"use client";

import React from "react";
import { Modal, ModalContent, ModalBody, Button } from "@heroui/react";
import { CheckCircle, XCircle } from "lucide-react";
import type { CheckDeviceResult } from "../actions/check-device";

interface IbosolCheckResultModalProps {
    isOpen: boolean;
    onClose: () => void;
    onActivate?: (mac: string, appId: number) => void;
    result: CheckDeviceResult | null;
    loading: boolean;
    inputMac?: string;
    inputAppId?: number;
    theme?: "light" | "dark";
}

export default function IbosolCheckResultModal({
    isOpen,
    onClose,
    onActivate,
    result,
    loading,
    inputMac,
    inputAppId,
    theme = "light",
}: IbosolCheckResultModalProps) {
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
                        {loading ? (
                            <div className="text-center py-10">
                                <div className="inline-block w-10 h-10 border-4 border-cyan-200 border-t-cyan-600 rounded-full animate-spin mb-4" />
                                <p className={`text-sm font-black uppercase tracking-wider ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                                    Vérification en cours...
                                </p>
                            </div>
                        ) : result?.success && result.data ? (
                            <>
                                <header className="text-center mb-5">
                                    {result.data.isActivated ? (
                                        <div className={`inline-block p-3 rounded-2xl mb-3 ${isDark ? "bg-emerald-500/10" : "bg-emerald-50"}`}>
                                            <CheckCircle className={`w-8 h-8 ${isDark ? "text-emerald-400" : "text-emerald-600"}`} />
                                        </div>
                                    ) : (
                                        <div className={`inline-block p-3 rounded-2xl mb-3 ${isDark ? "bg-amber-500/10" : "bg-amber-50"}`}>
                                            <XCircle className={`w-8 h-8 ${isDark ? "text-amber-400" : "text-amber-600"}`} />
                                        </div>
                                    )}
                                    <h2 className={`text-lg font-black uppercase tracking-tight ${isDark ? "text-white" : "text-black"}`}>
                                        {result.data.isActivated ? "Device activé" : "Device non activé"}
                                    </h2>
                                </header>

                                <div className="space-y-2 text-sm">
                                    <Row label="MAC" value={result.data.mac} mono isDark={isDark} />
                                    <Row label="Application" value={result.data.appName} isDark={isDark} />
                                    <Row label="Activé" value={result.data.isActivated ? "Oui" : "Non"} isDark={isDark} />
                                    {result.data.expiresAt && (
                                        <Row
                                            label="Expire le"
                                            value={new Date(result.data.expiresAt).toLocaleDateString("fr-FR")}
                                            isDark={isDark}
                                        />
                                    )}
                                    {result.data.ip && <Row label="IP" value={result.data.ip} mono isDark={isDark} />}
                                    <Row
                                        label="Playlist injectée"
                                        value={result.data.playlistInjected ? "Oui" : "Non"}
                                        isDark={isDark}
                                    />
                                </div>

                                <footer className="grid grid-cols-2 gap-3 mt-6">
                                    <Button
                                        className={isDark ? "bg-white/5 border border-white/10 text-white font-black" : "bg-white border-2 border-slate-200 text-black font-black"}
                                        onPress={closeFn}
                                    >
                                        Fermer
                                    </Button>
                                    {!result.data.isActivated && onActivate && inputMac && inputAppId && (
                                        <Button
                                            className="bg-cyan-600 text-white font-black"
                                            onPress={() => {
                                                onActivate(inputMac, inputAppId);
                                                closeFn();
                                            }}
                                        >
                                            Activer ce device →
                                        </Button>
                                    )}
                                </footer>
                            </>
                        ) : (
                            <div className="text-center py-6">
                                <XCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
                                <p className={`text-sm font-black mb-1 ${isDark ? "text-white" : "text-black"}`}>Erreur</p>
                                <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>{result?.error || "Vérification impossible"}</p>
                                <Button
                                    className={`mt-5 font-black ${isDark ? "bg-white/5 border border-white/10 text-white" : "bg-slate-100 text-black"}`}
                                    onPress={closeFn}
                                >
                                    Fermer
                                </Button>
                            </div>
                        )}
                    </ModalBody>
                )}
            </ModalContent>
        </Modal>
    );
}

function Row({ label, value, mono = false, isDark = false }: { label: string; value: string; mono?: boolean; isDark?: boolean }) {
    return (
        <div className={`flex justify-between py-1.5 border-b ${isDark ? "border-white/5" : "border-slate-100"}`}>
            <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>{label}</span>
            <span className={`font-black ${isDark ? "text-white" : "text-black"} ${mono ? "font-mono" : ""}`}>{value}</span>
        </div>
    );
}
