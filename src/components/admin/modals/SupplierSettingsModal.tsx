"use client";

import React, { useState, useEffect } from "react";
import {
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Button,
    Input
} from "@heroui/react";
import { Settings, Trash2, RotateCcw, Save, X } from "lucide-react";


import { adjustSupplierAction, deleteSupplierAction, archiveSupplierAction } from "@/app/admin/fournisseurs/actions";
import { formatCurrency } from "@/lib/formatters";

interface SupplierSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    supplier: {
        id: number;
        name: string;
        balance: string | number;
        currency: 'USD' | 'DZD';
        status: string;
    } | null;
}

export const SupplierSettingsModal = ({
    isOpen,
    onClose,
    supplier
}: SupplierSettingsModalProps) => {
    const [name, setName] = useState("");
    const [forcedBalance, setForcedBalance] = useState("");
    const [reason, setReason] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isArchiving, setIsArchiving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const EXCHANGE_RATE_USD_DZD = 245;

    useEffect(() => {
        if (supplier) {
            setName(supplier.name);
            setForcedBalance("");
            setReason("");
            setError(null);
        }
    }, [supplier, isOpen]);

    if (!supplier) return null;

    const handleSave = async () => {
        const isBalanceChanged = forcedBalance !== "" && parseFloat(forcedBalance) !== parseFloat(String(supplier.balance));

        if (isBalanceChanged && !reason.trim()) {
            setError("Un motif est obligatoire pour modifier le solde");
            return;
        }

        setIsSaving(true);
        setError(null);
        try {
            const res = await adjustSupplierAction({
                id: supplier.id,
                data: {
                    name,
                    forcedBalance: forcedBalance || undefined,
                    reason: reason || "Mise à jour des informations générales"
                }
            });

            if (res.success) {
                onClose();
                window.location.reload();
            } else {
                setError(res.error || "Erreur lors de la sauvegarde");
            }
        } catch (err) {
            setError("Erreur de connexion");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm(`Êtes-vous sûr de vouloir supprimer le fournisseur ${supplier.name} ? Cette action est irréversible.`)) {
            return;
        }

        setIsDeleting(true);
        setError(null);
        try {
            const res = await deleteSupplierAction({ id: supplier.id });
            if (res.success) {
                onClose();
                window.location.reload();
            } else {
                setError((res as any).error || "Erreur lors de la suppression");
            }
        } catch (err) {
            setError("Erreur de connexion");
        } finally {
            setIsDeleting(false);
        }
    };

    const handleArchive = async () => {
        if (!window.confirm(`Êtes-vous sûr de vouloir archiver le fournisseur ${supplier.name} ? Il ne sera plus visible dans la liste active.`)) {
            return;
        }

        setIsArchiving(true);
        setError(null);
        try {
            const res = await archiveSupplierAction({ id: supplier.id });
            if (res.success) {
                onClose();
                window.location.reload();
            } else {
                setError((res as any).error || "Erreur lors de l'archivage");
            }
        } catch (err) {
            setError("Erreur de connexion");
        } finally {
            setIsArchiving(false);
        }
    };

    const handleResetBalance = async () => {
        if (!window.confirm("Voulez-vous vraiment remettre le solde à zéro ?")) return;
        setForcedBalance("0.00");
        setReason("Réinitialisation manuelle");
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            backdrop="blur"
            size="lg"
            hideCloseButton
            classNames={{
                wrapper: "z-[9999]",
                backdrop: "bg-black/70 backdrop-blur-sm",
                base: "bg-[#161616] border border-[#262626] rounded-[24px] shadow-2xl overflow-hidden",
            }}
        >
            <ModalContent>
                {(onClose) => (
                    <div className="flex flex-col">
                        {/* Header */}
                        <header className="p-6 flex items-center justify-between border-b border-[#262626]">
                            <div className="flex flex-col">
                                <h1 className="text-xl font-semibold text-slate-100">Paramètres du Fournisseur</h1>
                                <span className="text-sm font-medium text-[#ec5b13]/80 uppercase tracking-wide">{supplier.name}</span>
                                {error && (
                                    <p className="mt-1 text-red-500 text-[10px] font-bold uppercase tracking-wider">{error}</p>
                                )}
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-white/5 rounded-full transition-colors shrink-0 text-slate-400 hover:text-slate-100"
                            >
                                <svg fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="20" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M18 6 6 18"></path>
                                    <path d="m6 6 12 12"></path>
                                </svg>
                            </button>
                        </header>

                        {/* Modal Body */}
                        <ModalBody className="p-6 gap-6">
                            {/* Section 1 - Basic Configuration */}
                            <div className="space-y-4">
                                <Input
                                    id="supplierNameInput"
                                    name="supplierNameInput"
                                    label="Nom du Fournisseur"
                                    labelPlacement="outside"
                                    placeholder="Nom..."
                                    variant="bordered"
                                    classNames={{
                                        inputWrapper: "h-12 bg-[#0a0a0a] border-[#262626]"
                                    }}
                                    value={name}
                                    onValueChange={setName}
                                />
                            </div>


                            {/* Section 2 - Sensitive Zone (Balance Adjustment) */}
                            <div className="bg-[#0a0a0a] border border-[#262626] rounded-2xl p-5 space-y-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <Settings className="text-[#ec5b13] w-4 h-4" />
                                    <h2 className="text-sm font-bold text-slate-100">Correction du Solde</h2>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-[#262626]/50">
                                    <span className="text-sm text-slate-400">Solde actuel</span>
                                    <span className="text-lg font-mono font-medium text-[#ec5b13] whitespace-nowrap">
                                        {formatCurrency(supplier.balance, supplier.currency)}
                                    </span>
                                </div>
                                <div className="space-y-4 pt-2">
                                    <Input
                                        id="forcedBalance"
                                        name="forcedBalance"
                                        label={`Nouveau solde (Forçage en ${supplier.currency})`}
                                        placeholder={String(supplier.balance)}
                                        type="number"
                                        endContent={<span className="text-slate-500 font-bold">{supplier.currency}</span>}
                                        variant="bordered"
                                        classNames={{
                                            inputWrapper: "h-14 bg-black/40 border-[#262626] text-xl font-semibold",
                                        }}
                                        value={forcedBalance}
                                        onValueChange={setForcedBalance}
                                    />
                                    <Input
                                        id="adjustmentReason"
                                        name="adjustmentReason"
                                        label="Motif de la modification"
                                        placeholder="Ex: Frais de réseau imprévus..."
                                        variant="bordered"
                                        classNames={{
                                            inputWrapper: "bg-black/40 border-[#262626]",
                                        }}
                                        value={reason}
                                        onValueChange={setReason}
                                    />
                                </div>
                            </div>

                            {/* Section 3 - Danger Zone */}
                            <div className="flex flex-col sm:flex-row gap-3 pt-2">
                                <Button
                                    variant="light"
                                    color="danger"
                                    startContent={<RotateCcw className="w-4 h-4" />}
                                    className="font-semibold"
                                    onPress={handleResetBalance}
                                >
                                    Réinitialiser le solde
                                </Button>

                                <Button
                                    variant="flat"
                                    color="warning"
                                    className="font-semibold"
                                    isLoading={isArchiving}
                                    onPress={handleArchive}
                                >
                                    Archiver le fournisseur
                                </Button>

                                <Button
                                    variant="flat"
                                    color="danger"
                                    className="sm:ml-auto font-semibold"
                                    isLoading={isDeleting}
                                    startContent={!isDeleting && <Trash2 className="w-4 h-4" />}
                                    onPress={handleDelete}
                                >
                                    Supprimer le fournisseur
                                </Button>
                            </div>
                        </ModalBody>

                        {/* Footer */}
                        <ModalFooter className="border-t border-[#262626] p-6 bg-[#161616]">
                            <Button
                                variant="light"
                                className="text-slate-400 hover:text-white font-semibold"
                                onPress={onClose}
                                disabled={isSaving}
                            >
                                Annuler
                            </Button>
                            <Button
                                className="bg-[#ec5b13] text-white font-bold h-12 px-8 rounded-xl shadow-lg shadow-[#ec5b13]/20"
                                isLoading={isSaving}
                                startContent={!isSaving && <Save className="w-4 h-4" />}
                                onPress={handleSave}
                            >
                                Enregistrer les modifications
                            </Button>
                        </ModalFooter>

                    </div>
                )}
            </ModalContent>
        </Modal>
    );
};
