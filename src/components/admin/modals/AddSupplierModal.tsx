"use client";

import React, { useState } from "react";
import {
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    Button,
    Input
} from "@heroui/react";

import { addSupplierAction } from "@/app/admin/fournisseurs/actions";
import { toast } from "react-hot-toast";
import { formatCurrency } from "@/lib/formatters";

interface AddSupplierModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const AddSupplierModal = ({ isOpen, onClose }: AddSupplierModalProps) => {
    const [name, setName] = useState("");
    const [initialBalance, setInitialBalance] = useState("0.00");
    const [currency, setCurrency] = useState<'USD' | 'DZD'>('DZD');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name) {
            setError("Le nom est obligatoire");
            return;
        }

        setIsSaving(true);
        setError(null);

        try {
            const res = await addSupplierAction({
                name,
                balance: initialBalance,
                currency
            });

            if (res.success) {
                toast.success("Fournisseur ajouté avec succès");
                onClose();
                setName("");
                setInitialBalance("0.00");
                setCurrency('DZD');
                window.location.reload();
            } else {
                const msg = res.error || "Une erreur est survenue";
                setError(msg);
                toast.error(msg);
            }
        } catch (err) {
            const msg = "Erreur de connexion";
            setError(msg);
            toast.error(msg);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            backdrop="blur"
            size="lg"
            classNames={{
                base: "bg-[#2a1a12] border border-[#3d261c] rounded-3xl shadow-2xl overflow-hidden",
                header: "p-6 border-b border-[#3d261c]",
                closeButton: "hover:bg-white/10 text-slate-400 size-8 top-6 right-6 font-bold",
            }}
        >
            <ModalContent>
                {(onClose) => (
                    <>
                        <ModalHeader>
                            <div className="flex flex-col">
                                <div className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-[#ec5b13] text-2xl font-bold">person_add</span>
                                    <h3 className="text-xl font-bold text-white tracking-tight">Ajouter un Nouveau Fournisseur</h3>
                                </div>
                                {error && (
                                    <p className="mt-2 text-red-500 text-xs font-bold uppercase tracking-wider">{error}</p>
                                )}
                            </div>
                        </ModalHeader>
                        <ModalBody className="p-8 space-y-6">
                            <form className="space-y-6" onSubmit={handleSubmit}>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nom du Fournisseur</label>
                                    <input
                                        className="w-full bg-black/30 border border-[#3d261c] rounded-xl h-12 px-4 text-white focus:ring-2 focus:ring-[#ec5b13]/50 focus:border-[#ec5b13] transition-all outline-none"
                                        placeholder="ex: G2A, PrepaidForge, etc."
                                        type="text"
                                        required
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Devise de Base</label>
                                    <div className="flex bg-black/30 border border-[#3d261c] rounded-xl p-1">
                                        <button
                                            type="button"
                                            onClick={() => setCurrency('USD')}
                                            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${currency === 'USD' ? 'bg-[#ec5b13] text-white' : 'text-slate-500 hover:text-slate-300'}`}
                                        >
                                            USD
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setCurrency('DZD')}
                                            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${currency === 'DZD' ? 'bg-[#ec5b13] text-white' : 'text-slate-500 hover:text-slate-300'}`}
                                        >
                                            DZD
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                        Solde Initial ({currency})
                                    </label>
                                    <div className="relative group">
                                        <input
                                            className="w-full bg-black/30 border border-[#3d261c] rounded-xl h-12 px-4 text-white focus:ring-2 focus:ring-[#ec5b13]/50 focus:border-[#ec5b13] transition-all outline-none"
                                            placeholder="0.00"
                                            type="number"
                                            step="0.01"
                                            value={initialBalance}
                                            onChange={(e) => setInitialBalance(e.target.value)}
                                        />
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">
                                            {currency}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex gap-4 pt-4">
                                    <button
                                        className="flex-1 h-12 rounded-xl border border-[#3d261c] text-slate-300 font-bold text-sm hover:bg-white/5 transition-colors disabled:opacity-50"
                                        type="button"
                                        onClick={onClose}
                                        disabled={isSaving}
                                    >
                                        Annuler
                                    </button>
                                    <button
                                        className="flex-[2] h-12 rounded-xl bg-[#ec5b13] text-white font-bold text-sm shadow-lg shadow-[#ec5b13]/20 hover:bg-orange-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                        type="submit"
                                        disabled={isSaving}
                                    >
                                        {isSaving ? "Création..." : (
                                            <>
                                                <span className="material-symbols-outlined text-xl">person_add</span>
                                                Créer le Fournisseur
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </ModalBody>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
};
