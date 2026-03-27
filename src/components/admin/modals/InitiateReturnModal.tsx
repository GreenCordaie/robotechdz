"use client";

import { useState } from "react";
import { initiateReturn } from "@/app/admin/caisse/actions";
import { RemboursementType } from "@/lib/constants";

interface Order {
    id: number;
    orderNumber: string;
    totalAmount: string | number;
    remise?: string | number | null;
    montantPaye?: string | number | null;
    clientId: number | null;
    status: string;
}

interface InitiateReturnModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: Order;
}

export function InitiateReturnModal({ isOpen, onClose, order }: InitiateReturnModalProps) {
    const totalAmount = parseFloat(String(order.totalAmount));
    const remise = parseFloat(String(order.remise || 0));
    const montantPaye = parseFloat(String(order.montantPaye || 0));
    const netTotal = totalAmount - remise;

    // The cash refund is capped by what was actually paid
    const maxRefundable = montantPaye;

    const [motif, setMotif] = useState("");
    const [typeRemboursement, setTypeRemboursement] = useState<RemboursementType>("ESPECES");
    const [montant, setMontant] = useState(maxRefundable);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (motif.trim().length < 5) {
            setError("Le motif doit contenir au moins 5 caractères");
            return;
        }
        if (montant <= 0 || montant > maxRefundable) {
            setError(`Le montant doit être entre 1 et ${maxRefundable.toLocaleString("fr-DZ")} DA`);
            return;
        }

        setLoading(true);
        const result = await initiateReturn({ orderId: order.id, motif, typeRemboursement, montant });
        setLoading(false);

        if (result && "success" in result && result.success) {
            onClose();
        } else {
            setError((result as any)?.error || "Une erreur est survenue");
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-bold text-gray-900">Demande de Retour</h2>
                        <p className="text-xs text-gray-500 mt-0.5">Commande #{order.orderNumber}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
                </div>

                <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
                    {/* Summary Info */}
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 grid grid-cols-2 gap-3 mb-2">
                        <div>
                            <span className="block text-[10px] uppercase font-bold text-slate-400">Total Net</span>
                            <span className="text-sm font-bold text-slate-700">{netTotal.toLocaleString("fr-DZ")} DA</span>
                        </div>
                        <div>
                            <span className="block text-[10px] uppercase font-bold text-slate-400">Déjà Payé</span>
                            <span className="text-sm font-bold text-emerald-600">{montantPaye.toLocaleString("fr-DZ")} DA</span>
                        </div>
                    </div>

                    {/* Motif */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Motif du retour *</label>
                        <textarea
                            value={motif}
                            onChange={e => setMotif(e.target.value)}
                            placeholder="Expliquez la raison du retour..."
                            rows={3}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
                            required
                        />
                    </div>

                    {/* Type de remboursement */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Type de remboursement *</label>
                        <div className="flex gap-3">
                            {(["ESPECES", "CREDIT_WALLET"] as RemboursementType[]).map((type) => {
                                const isDisabled = type === "CREDIT_WALLET" && !order.clientId;
                                return (
                                    <label
                                        key={type}
                                        className={`flex-1 flex items-center gap-2 border rounded-xl px-3 py-2.5 cursor-pointer text-sm transition-colors ${isDisabled
                                            ? "opacity-40 cursor-not-allowed border-gray-200 bg-gray-50"
                                            : typeRemboursement === type
                                                ? "border-orange-400 bg-orange-50 text-orange-700"
                                                : "border-gray-200 hover:border-gray-300"
                                            }`}
                                    >
                                        <input
                                            type="radio"
                                            name="typeRemboursement"
                                            value={type}
                                            checked={typeRemboursement === type}
                                            disabled={isDisabled}
                                            onChange={() => setTypeRemboursement(type)}
                                            className="accent-orange-500"
                                        />
                                        <span className="font-medium">
                                            {type === "ESPECES" ? "💵 Espèces" : "💳 Crédit Wallet"}
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                        {!order.clientId && (
                            <p className="text-xs text-gray-400 mt-1">Crédit wallet indisponible — commande anonyme</p>
                        )}
                    </div>

                    {/* Montant */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                            Montant à rembourser * <span className="text-gray-400 font-normal">(max {maxRefundable.toLocaleString("fr-DZ")} DA)</span>
                        </label>
                        <div className="relative">
                            <input
                                type="number"
                                value={montant}
                                onChange={e => setMontant(parseFloat(e.target.value) || 0)}
                                min={1}
                                max={maxRefundable}
                                step={1}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-semibold">DA</span>
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-600">
                            {error}
                        </div>
                    )}

                    <div className="flex gap-3 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-semibold hover:bg-gray-50 transition-colors"
                        >
                            Annuler
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors"
                        >
                            {loading ? "Envoi..." : "Soumettre la demande"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
