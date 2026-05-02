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
}

export default function IbosolCheckResultModal({
    isOpen,
    onClose,
    onActivate,
    result,
    loading,
    inputMac,
    inputAppId,
}: IbosolCheckResultModalProps) {
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
                        {loading ? (
                            <div className="text-center py-10">
                                <div className="inline-block w-10 h-10 border-4 border-cyan-200 border-t-cyan-600 rounded-full animate-spin mb-4" />
                                <p className="text-sm font-black uppercase tracking-wider text-slate-600">
                                    Vérification en cours...
                                </p>
                            </div>
                        ) : result?.success && result.data ? (
                            <>
                                <header className="text-center mb-5">
                                    {result.data.isActivated ? (
                                        <div className="inline-block p-3 bg-emerald-50 rounded-2xl mb-3">
                                            <CheckCircle className="w-8 h-8 text-emerald-600" />
                                        </div>
                                    ) : (
                                        <div className="inline-block p-3 bg-amber-50 rounded-2xl mb-3">
                                            <XCircle className="w-8 h-8 text-amber-600" />
                                        </div>
                                    )}
                                    <h2 className="text-lg font-black uppercase tracking-tight text-black">
                                        {result.data.isActivated ? "Device activé" : "Device non activé"}
                                    </h2>
                                </header>

                                <div className="space-y-2 text-sm">
                                    <Row label="MAC" value={result.data.mac} mono />
                                    <Row label="Application" value={result.data.appName} />
                                    <Row label="Activé" value={result.data.isActivated ? "Oui" : "Non"} />
                                    {result.data.expiresAt && (
                                        <Row
                                            label="Expire le"
                                            value={new Date(result.data.expiresAt).toLocaleDateString("fr-FR")}
                                        />
                                    )}
                                    {result.data.ip && <Row label="IP" value={result.data.ip} mono />}
                                    <Row
                                        label="Playlist injectée"
                                        value={result.data.playlistInjected ? "Oui" : "Non"}
                                    />
                                </div>

                                <footer className="grid grid-cols-2 gap-3 mt-6">
                                    <Button
                                        className="bg-white border-2 border-slate-200 text-black font-black"
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
                                <p className="text-sm font-black text-black mb-1">Erreur</p>
                                <p className="text-xs text-slate-500">{result?.error || "Vérification impossible"}</p>
                                <Button className="mt-5 bg-slate-100 text-black font-black" onPress={closeFn}>
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

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex justify-between py-1.5 border-b border-slate-100">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</span>
            <span className={`font-black text-black ${mono ? "font-mono" : ""}`}>{value}</span>
        </div>
    );
}
