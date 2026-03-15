"use client";

import React, { useState, useEffect } from "react";
import {
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    Button
} from "@heroui/react";

import { adjustSupplierAction, deleteSupplierAction } from "@/app/admin/fournisseurs/actions";

interface SupplierSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    supplier: {
        id: number;
        name: string;
        balanceUsd: string | number;
        exchangeRate: string | number;
    } | null;
}

export const SupplierSettingsModal = ({
    isOpen,
    onClose,
    supplier
}: SupplierSettingsModalProps) => {
    const [name, setName] = useState("");
    const [rate, setRate] = useState("");
    const [forcedBalance, setForcedBalance] = useState("");
    const [reason, setReason] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (supplier) {
            setName(supplier.name);
            setRate(String(supplier.exchangeRate));
            setForcedBalance("");
            setReason("");
            setError(null);
        }
    }, [supplier, isOpen]);

    if (!supplier) return null;

    const handleSave = async () => {
        // Validation: motif is mandatory for rate or balance changes
        const isRateChanged = rate !== String(supplier.exchangeRate);
        const isBalanceChanged = forcedBalance !== "" && forcedBalance !== String(supplier.balanceUsd);

        if ((isRateChanged || isBalanceChanged) && !reason.trim()) {
            setError("Un motif est obligatoire pour modifier le solde ou le taux");
            return;
        }

        setIsSaving(true);
        setError(null);
        try {
            const res = await adjustSupplierAction(supplier.id, {
                name,
                forcedRate: rate,
                forcedBalance: forcedBalance || undefined,
                reason: reason || "Mise à jour des informations générales"
            });

            if (res.success) {
                onClose();
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
            const res = await deleteSupplierAction(supplier.id);
            if (res.success) {
                onClose();
            } else {
                setError(res.error || "Erreur lors de la suppression");
            }
        } catch (err) {
            setError("Erreur de connexion");
        } finally {
            setIsDeleting(false);
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
                        <ModalBody className="p-6 space-y-6 overflow-y-auto max-h-[70vh] custom-scrollbar">
                            {/* Section 1 - Basic Configuration */}
                            <section className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Nom du Fournisseur</label>
                                    <input
                                        className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl px-4 py-3 text-slate-100 focus:ring-1 focus:ring-[#ec5b13] focus:border-[#ec5b13] transition-all outline-none"
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Taux de change par défaut (DZD/USD)</label>
                                    <input
                                        className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl px-4 py-3 text-slate-100 focus:ring-1 focus:ring-[#ec5b13] focus:border-[#ec5b13] transition-all outline-none"
                                        type="number"
                                        step="0.01"
                                        value={rate}
                                        onChange={(e) => setRate(e.target.value)}
                                    />
                                </div>
                            </section>

                            {/* Section 2 - Sensitive Zone (Balance Adjustment) */}
                            <section className="bg-[#0a0a0a] border border-[#262626] rounded-xl p-5 space-y-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <svg className="text-[#ec5b13] shrink-0" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="18" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M12 20h9"></path>
                                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
                                    </svg>
                                    <h2 className="text-sm font-bold text-slate-100">Correction du Solde</h2>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-[#262626]/50">
                                    <span className="text-sm text-slate-400">Solde actuel</span>
                                    <span className="text-lg font-mono font-medium text-slate-400 whitespace-nowrap">{Number(supplier.balanceUsd).toLocaleString(undefined, { minimumFractionDigits: 2 })} $</span>
                                </div>
                                <div className="space-y-4 pt-2">
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-slate-400">Nouveau solde (Forçage)</label>
                                        <div className="relative">
                                            <input
                                                className="w-full bg-black/40 border border-[#262626] rounded-xl h-14 px-4 text-2xl font-semibold text-slate-100 focus:ring-2 focus:ring-[#ec5b13]/50 focus:border-[#ec5b13] transition-all outline-none placeholder:text-slate-700"
                                                placeholder={String(supplier.balanceUsd)}
                                                type="number"
                                                step="0.01"
                                                value={forcedBalance}
                                                onChange={(e) => setForcedBalance(e.target.value)}
                                            />
                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">$</span>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-slate-400">Motif de la modification</label>
                                        <input
                                            className="w-full bg-black/40 border border-[#262626] rounded-xl px-4 py-3 text-sm text-slate-100 focus:ring-1 focus:ring-[#ec5b13] focus:border-[#ec5b13] transition-all outline-none"
                                            placeholder="Ex: Frais de réseau imprévus..."
                                            type="text"
                                            value={reason}
                                            onChange={(e) => setReason(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </section>

                            {/* Section 3 - Danger Zone */}
                            <section className="pt-2">
                                <div className="flex flex-wrap gap-3">
                                    <button
                                        onClick={handleResetBalance}
                                        className="flex items-center gap-2 text-red-500 hover:bg-red-500/10 px-4 py-2 rounded-lg transition-colors font-semibold text-sm"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">restart_alt</span>
                                        Réinitialiser le solde à zéro
                                    </button>

                                    <button
                                        onClick={handleDelete}
                                        disabled={isDeleting}
                                        className="flex items-center gap-2 text-red-500 hover:bg-red-500/10 px-4 py-2 rounded-lg transition-colors font-semibold text-sm ml-auto disabled:opacity-50"
                                    >
                                        {isDeleting ? "Suppression..." : (
                                            <>
                                                <span className="material-symbols-outlined text-[18px]">delete</span>
                                                Supprimer le fournisseur
                                            </>
                                        )}
                                    </button>
                                </div>
                            </section>
                        </ModalBody>

                        {/* Footer */}
                        <footer className="p-6 border-t border-[#262626] flex flex-col sm:flex-row gap-3 sm:justify-end bg-[#161616]">
                            <button
                                onClick={onClose}
                                disabled={isSaving}
                                className="px-6 py-3 rounded-xl font-semibold text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-all order-2 sm:order-1 shrink-0 disabled:opacity-50"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="px-6 py-3 rounded-xl font-semibold bg-[#ec5b13] text-white hover:bg-orange-600 shadow-lg shadow-[#ec5b13]/20 transition-all order-1 sm:order-2 shrink-0 disabled:opacity-50"
                            >
                                {isSaving ? "Enregistrement..." : "Enregistrer les modifications"}
                            </button>
                        </footer>
                    </div>
                )}
            </ModalContent>
        </Modal>
    );
};
