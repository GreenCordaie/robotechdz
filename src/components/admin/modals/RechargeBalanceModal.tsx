"use client";

import React, { useState, useEffect } from "react";
import {
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    Button,
    Switch
} from "@heroui/react";

import { rechargeSupplier } from "@/app/admin/fournisseurs/actions";
import { toast } from "react-hot-toast";
import { formatCurrency } from "@/lib/formatters";

interface RechargeBalanceModalProps {
    isOpen: boolean;
    onClose: () => void;
    supplierId: number;
    supplierName: string;
    currentBalance: string | number;
    exchangeRate: string | number;
    baseCurrency: 'USD' | 'DZD';
}

export const RechargeBalanceModal = ({
    isOpen,
    onClose,
    supplierId,
    supplierName,
    currentBalance,
    exchangeRate,
    baseCurrency
}: RechargeBalanceModalProps) => {
    const [amount, setAmount] = useState<string>("");
    const [currency, setCurrency] = useState<'USD' | 'DZD'>(baseCurrency || 'USD');
    const [paymentMethod, setPaymentMethod] = useState<string>("usdt");
    const [estimatedOther, setEstimatedOther] = useState<number>(0);
    const [projectedNewBalance, setProjectedNewBalance] = useState<number>(0);
    const [isSaving, setIsSaving] = useState(false);
    const [isPaid, setIsPaid] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const rateValue = parseFloat(String(exchangeRate)) || 245;
    const [manualRate, setManualRate] = useState<string>(rateValue.toString());
    const currentBalanceNum = parseFloat(String(currentBalance)) || 0;

    const rate = parseFloat(manualRate) || rateValue;

    useEffect(() => {
        const val = parseFloat(amount) || 0;

        if (baseCurrency === 'DZD') {
            setEstimatedOther(0);
            setProjectedNewBalance(currentBalanceNum + val);
            return;
        }

        if (currency === 'USD') {
            setEstimatedOther(val * rate);
            setProjectedNewBalance(currentBalanceNum + val);
        } else {
            setEstimatedOther(val / rate);
            // Recharging a USD supplier with DZD
            setProjectedNewBalance(currentBalanceNum + (val / rate));
        }
    }, [amount, currency, rate, currentBalanceNum, baseCurrency]);

    const handleRecharge = async () => {
        if (!amount || parseFloat(amount) <= 0) {
            const msg = "Veuillez saisir un montant valide";
            setError(msg);
            toast.error(msg);
            return;
        }

        setIsSaving(true);
        setError(null);

        try {
            let amountToSubmit = amount;
            if (baseCurrency === 'USD' && currency === 'DZD') {
                amountToSubmit = (parseFloat(amount) / rate).toFixed(2);
            } else if (baseCurrency === 'DZD' && currency === 'USD') {
                amountToSubmit = (parseFloat(amount) * rate).toFixed(2);
            }

            const res = await rechargeSupplier({
                supplierId,
                amount: amountToSubmit,
                currency: baseCurrency,
                note: `Recharge via ${paymentMethod}`,
                paymentStatus: isPaid ? "PAID" : "UNPAID",
                exchangeRate: manualRate
            });
            if (res.success) {
                toast.success(`Solde rechargé (${amountToSubmit} ${baseCurrency})${isPaid ? '' : ' - MARQUÉ COMME DETTE'}`);
                onClose();
                setAmount("");
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
                                    <h2 className="text-white text-lg font-bold leading-tight tracking-tight">Recharger le Solde</h2>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="size-2 rounded-full bg-[var(--primary)] animate-pulse"></span>
                                        <p className="text-[var(--primary)]/80 text-xs font-medium uppercase tracking-wider">Fournisseur : {supplierName}</p>
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
                                {/* Section 1: Current Balance */}
                                <div className="bg-[#0a0a0a] border border-[#262626] rounded-xl p-5 mb-4 text-center">
                                    <p className="text-slate-400 text-sm font-medium mb-1">Solde actuel</p>
                                    <div className="flex items-center justify-center gap-2">
                                        <span className="material-symbols-outlined text-[var(--primary)] text-xl">account_balance_wallet</span>
                                        <h3 className="text-white text-3xl font-bold tracking-tight">
                                            {formatCurrency(currentBalance, baseCurrency)}
                                        </h3>
                                    </div>
                                </div>

                                {/* Currency Toggle */}
                                {baseCurrency !== 'DZD' && (
                                    <div className="flex bg-[#0a0a0a] border border-[#262626] rounded-xl p-1 mb-6">
                                        <button
                                            onClick={() => setCurrency('USD')}
                                            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${currency === 'USD' ? 'bg-[var(--primary)] text-white' : 'text-slate-500 hover:text-slate-300'}`}
                                        >
                                            USD
                                        </button>
                                        <button
                                            onClick={() => setCurrency('DZD')}
                                            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${currency === 'DZD' ? 'bg-[var(--primary)] text-white' : 'text-slate-500 hover:text-slate-300'}`}
                                        >
                                            DZD
                                        </button>
                                    </div>
                                )}

                                {/* Section 2: Recharge Form */}
                                <div className="space-y-6">
                                    {/* Manual Rate Input */}
                                    {baseCurrency !== 'DZD' && (
                                        <div className="bg-[#0a0a0a] border border-[#262626] rounded-xl p-4">
                                            <label className="block text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2 px-1">
                                                Taux de change personnalisé (1 USD = ? DZD)
                                            </label>
                                            <div className="relative group">
                                                <input
                                                    className="w-full bg-black/40 border border-[#262626] focus:border-[var(--primary)] rounded-xl py-3 px-4 text-white font-mono text-sm outline-none transition-all"
                                                    type="number"
                                                    step="0.01"
                                                    value={manualRate}
                                                    onChange={(e) => setManualRate(e.target.value)}
                                                />
                                                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                                    <span className="text-slate-600 text-[10px] font-bold uppercase tracking-widest">DZD / $</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div>
                                        <label htmlFor="rechargeAmount" className="block text-slate-400 text-xs font-semibold uppercase tracking-widest mb-3 px-1">
                                            Montant de la recharge ({baseCurrency === 'DZD' ? 'DZD' : currency})
                                        </label>
                                        <div className="relative group">
                                            <input
                                                id="rechargeAmount"
                                                name="rechargeAmount"
                                                className="w-full bg-[#0a0a0a] border border-[#262626] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] rounded-xl py-5 px-6 text-3xl font-bold text-white text-center transition-all placeholder:text-slate-700 outline-none"
                                                placeholder="0.00"
                                                type="number"
                                                step="0.01"
                                                value={amount}
                                                onChange={(e) => setAmount(e.target.value)}
                                            />
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 bg-[#262626] px-3 py-1 rounded-lg">
                                                <span className="text-slate-100 text-sm font-bold">{baseCurrency === 'DZD' ? 'DZD' : currency}</span>
                                            </div>
                                        </div>
                                        <div className="mt-3 flex justify-between items-center px-1">
                                            {baseCurrency !== 'DZD' && (
                                                <>
                                                    <p className="text-slate-500 text-xs italic">
                                                        Équivalent : ~ {formatCurrency(estimatedOther, currency === 'USD' ? 'DZD' : 'USD')}
                                                    </p>
                                                    <p className="text-[var(--primary)]/60 text-xs font-medium">Taux: {formatCurrency(rate, 'DZD')}</p>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <label htmlFor="paymentMethod" className="block text-slate-400 text-xs font-semibold uppercase tracking-widest mb-3 px-1">
                                            Méthode de paiement
                                        </label>
                                        <div className="relative">
                                            <select
                                                id="paymentMethod"
                                                name="paymentMethod"
                                                className="w-full appearance-none bg-[#0a0a0a] border border-[#262626] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] rounded-xl py-3.5 px-4 text-slate-100 text-sm transition-all cursor-pointer outline-none"
                                                value={paymentMethod}
                                                onChange={(e) => setPaymentMethod(e.target.value)}
                                            >
                                                <option value="cash">Espèces (Caisse Béjaïa)</option>
                                                <option value="paysera">Virement Paysera</option>
                                                <option value="usdt">USDT Binance</option>
                                            </select>
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                                                <span className="material-symbols-outlined text-[20px]">expand_more</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between bg-[#0a0a0a] border border-[#262626] rounded-xl p-4">
                                        <div className="flex flex-col">
                                            <span className="text-white text-xs font-bold uppercase tracking-tight">Paiement effectué ?</span>
                                            <span className="text-slate-500 text-[10px]">Si désactivé, sera compté comme dette.</span>
                                        </div>
                                        <Switch
                                            isSelected={isPaid}
                                            onValueChange={setIsPaid}
                                            color="warning"
                                            size="sm"
                                        />
                                    </div>
                                </div>

                                {/* Section 3: Projected Balance */}
                                <div className="mt-10 pt-6 border-t border-[#262626]/50 flex items-center justify-between">
                                    <span className="text-slate-400 text-sm">Nouveau solde estimé :</span>
                                    <span className="text-[var(--primary)] text-xl font-bold">
                                        {formatCurrency(projectedNewBalance, baseCurrency)}
                                    </span>
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
                                    onClick={handleRecharge}
                                    disabled={isSaving}
                                    className="flex items-center gap-2 bg-[var(--primary)] hover:bg-orange-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-[var(--primary)]/20 transition-all active:scale-[0.98] disabled:opacity-50"
                                >
                                    {isSaving ? "Crédit en cours..." : (
                                        <>
                                            <span className="material-symbols-outlined text-[20px]">account_balance_wallet</span>
                                            Créditer le Wallet
                                        </>
                                    )}
                                </button>
                            </div>
                        </footer>
                    </div>
                )}
            </ModalContent>
        </Modal>
    );
};
