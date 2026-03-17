"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import {
    Modal,
    ModalContent,
    ModalBody,
    Button,
    Input
} from "@heroui/react";

interface PlayerIdModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (id: string, pseudo: string) => void;
    productName: string;
    productImage?: string;
}

export default function PlayerIdModal({
    isOpen,
    onClose,
    onConfirm,
    productName,
    productImage
}: PlayerIdModalProps) {
    const [playerId, setPlayerId] = useState("");
    const [playerNickname, setPlayerNickname] = useState("");

    useEffect(() => {
        if (isOpen) {
            setPlayerId("");
            setPlayerNickname("");
        }
    }, [isOpen]);

    const handleConfirm = () => {
        if (playerId.trim()) {
            onConfirm(playerId.trim(), playerNickname.trim());
            onClose();
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
                base: "bg-white/95 backdrop-blur-xl rounded-[32px] shadow-2xl p-0 overflow-hidden border border-white/20",
                backdrop: "bg-slate-900/40 backdrop-blur-md",
                body: "p-0"
            }}
        >
            <ModalContent>
                {(onClose) => (
                    <ModalBody className="relative flex flex-col p-0">
                        {/* Modal Content Padding */}
                        <div className="p-6 md:p-8">
                            {/* BEGIN: Modal Header */}
                            <header className="flex flex-col items-center mb-6">
                                {/* Product Thumbnail */}
                                <div className="w-20 h-20 mb-4 bg-slate-50 border border-slate-100 rounded-2xl shadow-sm flex items-center justify-center overflow-hidden relative">
                                    {productImage ? (
                                        <Image alt={productName} className="object-contain p-2" src={productImage} fill sizes="100px" />
                                    ) : (
                                        <div className="w-full h-full bg-slate-200 flex items-center justify-center">
                                            <span className="material-symbols-rounded text-slate-400 text-3xl">package</span>
                                        </div>
                                    )}
                                </div>
                                <h1 className="text-black text-2xl font-black text-center leading-tight mb-1 uppercase tracking-tight">
                                    Informations requises
                                </h1>
                                <p className="text-black/50 text-sm text-center max-w-xs font-bold">
                                    Veuillez fournir les détails pour la livraison.
                                </p>
                                <div className="mt-2 px-3 py-1 bg-orange-50 rounded-lg">
                                    <p className="text-[#ec5b13] font-black uppercase tracking-widest text-[10px]">{productName}</p>
                                </div>
                            </header>

                            {/* BEGIN: Input Section */}
                            <section className="space-y-4">
                                <div className="space-y-3">
                                    <Input
                                        label="Player ID / Identifiant"
                                        placeholder="Ex: 1234567890"
                                        variant="bordered"
                                        size="md"
                                        value={playerId}
                                        onValueChange={setPlayerId}
                                        classNames={{
                                            input: "text-lg h-8 text-black font-black",
                                            label: "text-xs font-black text-black uppercase tracking-wider",
                                            inputWrapper: "h-16 border-2 border-slate-200 bg-white rounded-xl group-data-[focus=true]:border-[#ec5b13] shadow-sm transition-all"
                                        }}
                                        autoFocus
                                    />

                                    <Input
                                        label="Pseudo / Surnom (Optionnel)"
                                        placeholder="Votre nom de joueur"
                                        variant="bordered"
                                        size="md"
                                        value={playerNickname}
                                        onValueChange={setPlayerNickname}
                                        classNames={{
                                            input: "text-lg h-8 text-black font-black",
                                            label: "text-xs font-black text-black uppercase tracking-wider",
                                            inputWrapper: "h-16 border-2 border-slate-200 bg-white rounded-xl group-data-[focus=true]:border-[#ec5b13] shadow-sm transition-all"
                                        }}
                                    />
                                </div>

                                {/* Visual Alert Box */}
                                <div className="flex items-start gap-2.5 p-3.5 bg-orange-50/50 rounded-xl border border-orange-100">
                                    <span className="material-symbols-outlined text-[#ec5b13] !text-lg mt-0.5">warning</span>
                                    <p className="text-[11px] font-black text-black/80 leading-snug">
                                        Vérifiez attentivement vos informations. <br />
                                        Les erreurs de saisie ne sont pas remboursables.
                                    </p>
                                </div>
                            </section>

                            {/* BEGIN: Modal Footer Actions */}
                            <footer className="grid grid-cols-2 gap-3 mt-8">
                                <Button
                                    size="lg"
                                    className="h-14 rounded-xl bg-white border-2 border-slate-200 text-black font-black text-base active:scale-95 transition-transform"
                                    onPress={onClose}
                                >
                                    Annuler
                                </Button>
                                <Button
                                    size="lg"
                                    className="h-14 rounded-xl bg-[#ec5b13] text-white font-black text-base shadow-lg active:scale-95 transition-all uppercase tracking-tight"
                                    onPress={handleConfirm}
                                    isDisabled={!playerId.trim()}
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
