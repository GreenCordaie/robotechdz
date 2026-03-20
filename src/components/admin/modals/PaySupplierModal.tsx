"use client";

import React, { useState, useEffect } from "react";
import {
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    Button
} from "@heroui/react";

import { paySupplierAction } from "@/app/admin/fournisseurs/actions";
import { toast } from "react-hot-toast";
import { formatCurrency } from "@/lib/formatters";

interface PaySupplierModalProps {
    isOpen: boolean;
    onClose: () => void;
    supplierId: number;
    supplierName: string;
    currentDebt: string | number;
    exchangeRate: string | number;
    baseCurrency: 'USD' | 'DZD';
}

export const PaySupplierModal = ({
    isOpen,
    onClose,
    supplierId,
    supplierName,
    currentDebt,
    exchangeRate,
    baseCurrency
}: PaySupplierModalProps) => {
    const [amount, setAmount] = useState<string>("");
    const [currency, setCurrency] = useState<'USD' | 'DZD'>(baseCurrency || 'USD');
    const [note, setNote] = useState<string>("");
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const rateValue = parseFloat(String(exchangeRate)) || 245;
    const [manualRate, setManualRate] = useState<string>(rateValue.toString());
    const currentDebtNum = parseFloat(String(currentDebt)) || 0;

    const rate = parseFloat(manualRate) || rateValue;

    const handlePay = async () => {
        if (!amount || parseFloat(amount) <= 0) {
            const msg = "Veuillez saisir un montant de paiement valide";
            setError(msg);
            toast.error(msg);
            return;
        }

        setIsSaving(true);
        setError(null);

        try {
            // Payment is always recorded in the supplier's base currency for simple reduction
            let amountToSubmit = amount;
            if (baseCurrency === 'USD' && currency === 'DZD') {
                amountToSubmit = (parseFloat(amount) / rate).toFixed(2);
            } else if (baseCurrency === 'DZD' && currency === 'USD') {
                amountToSubmit = (parseFloat(amount) * rate).toFixed(2);
            }

            const res = await paySupplierAction({
                supplierId,
                amount: amountToSubmit,
                currency: baseCurrency,
                note: note || "Paiement de dette / Virement",
                exchangeRate: manualRate
            });

            if (res.success) {
                toast.success(`Paiement enregistré (${amountToSubmit} ${baseCurrency}) - La dette a été réduite.`);
                onClose();
                setAmount("");
                setNote("");
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
            size="md"
            hideCloseButton
            classNames={{
                wrapper: "z-[9999]",
                backdrop: "bg-black/70 backdrop-blur-md",
                base: "bg-[#161616] border border-[#262626] rounded-[24px] shadow-2xl overflow-hidden",
            }}
        >
            <ModalContent>
                {(onClose) => (
                    <div className="flex flex-col">
                        {/* Header */}
                        <header className="px-6 pt-6 pb-4 border-b border-[#262626]">
                            <div className="flex items-center justify-between">
                                <div className="flex flex-col">
                                    <h2 className="text-white text-lg font-bold leading-tight tracking-tight">Payer la Dette</h2>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="size-2 rounded-full bg-blue-500 animate-pulse"></span>
                                        <p className="text-blue-400 text-xs font-medium uppercase tracking-wider">Fournisseur : {supplierName}</p>
                                    </div>
                                    {error && (
                                        <p className="mt-2 text-red-500 text-[10px] font-bold uppercase tracking-wider italic">{error}</p>
                                    )}
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 hover:bg-[#262626] rounded-full transition-colors text-slate-400 hover:text-white"
                                >
                                    <span className="material-symbols-outlined text-[20px]">close</span>
                                </button>
                            </div>
                        </header>

                        {/* Modal Body */}
                        <ModalBody className="p-0">
                            <div className="p-6 custom-scrollbar overflow-y-auto max-h-[70vh]">
                                {/* Section 1: Current Debt */}
                                <div className="bg-[#0a0a0a] border border-[#262626] rounded-xl p-5 mb-4 text-center">
                                    <p className="text-slate-400 text-sm font-medium mb-1">Dette actuelle</p>
                                    <div className="flex items-center justify-center gap-2">
                                        <h3 className="text-orange-500 text-3xl font-bold tracking-tight">
                                            {formatCurrency(currentDebt, 'DZD')}
                                        </h3>
                                    </div>
                                </div>

                                {/* Currency Toggle */}
                                {baseCurrency !== 'DZD' && (
                                    <div className="flex bg-[#0a0a0a] border border-[#262626] rounded-xl p-1 mb-6">
                                        <button
                                            onClick={() => setCurrency('USD')}
                                            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${currency === 'USD' ? 'bg-blue-500 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                                        >
                                            USD (Direct)
                                        </button>
                                        <button
                                            onClick={() => setCurrency('DZD')}
                                            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${currency === 'DZD' ? 'bg-blue-500 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                                        >
                                            DZD (Converti)
                                        </button>
                                    </div>
                                )}

                                {/* Section 2: Form */}
                                <div className="space-y-6">
                                    {baseCurrency !== 'DZD' && (
                                        <div className="bg-[#0a0a0a] border border-[#262626] rounded-xl p-4">
                                            <label className="block text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2 px-1">
                                                Taux de change (Paiement)
                                            </label>
                                            <div className="relative group">
                                                <input
                                                    className="w-full bg-black/40 border border-[#262626] focus:border-blue-500 rounded-xl py-3 px-4 text-white font-mono text-sm outline-none transition-all"
                                                    type="number"
                                                    step="0.01"
                                                    value={manualRate}
                                                    onChange={(e) => setManualRate(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <div>
                                        <label className="block text-slate-400 text-xs font-semibold uppercase tracking-widest mb-3 px-1">
                                            Montant payé ({currency})
                                        </label>
                                        <div className="relative group">
                                            <input
                                                className="w-full bg-[#0a0a0a] border border-[#262626] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl py-5 px-6 text-3xl font-bold text-white text-center transition-all placeholder:text-slate-700 outline-none"
                                                placeholder="0.00"
                                                type="number"
                                                step="0.01"
                                                value={amount}
                                                onChange={(e) => setAmount(e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-slate-400 text-xs font-semibold uppercase tracking-widest mb-3 px-1">
                                            Note / Référence
                                        </label>
                                        <input
                                            className="w-full bg-[#0a0a0a] border border-[#262626] focus:border-blue-500 rounded-xl py-3 px-4 text-white text-sm outline-none"
                                            placeholder="Ex: Virement Baridimob, Espèces..."
                                            value={note}
                                            onChange={(e) => setNote(e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div className="mt-6 p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl">
                                    <p className="text-blue-400 text-[10px] font-bold uppercase leading-relaxed">
                                        <span className="material-symbols-outlined text-[14px] align-middle mr-1">info</span>
                                        Ce paiement sera enregistré dans l&apos;historique et déduira le montant des dettes affichées. Il n&apos;affecte pas le solde des cartes.
                                    </p>
                                </div>
                            </div>
                        </ModalBody>

                        {/* Footer */}
                        <footer className="p-6 border-t border-[#262626] bg-[#0d0d0d]">
                            <div className="flex items-center justify-end gap-3">
                                <button
                                    onClick={onClose}
                                    className="px-5 py-2.5 text-slate-400 hover:text-white text-sm font-semibold transition-colors disabled:opacity-50"
                                    disabled={isSaving}
                                >
                                    Annuler
                                </button>
                                <button
                                    onClick={handlePay}
                                    disabled={isSaving}
                                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98] disabled:opacity-50"
                                >
                                    {isSaving ? "Enregistrement..." : "Valider le Paiement"}
                                </button>
                            </div>
                        </footer>
                    </div>
                )}
            </ModalContent>
        </Modal>
    );
};
