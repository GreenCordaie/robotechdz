"use client";

import { useState } from "react";
import { approveReturn, rejectReturn } from "@/app/admin/caisse/actions";
import { ReturnRequest } from "@/lib/constants";

interface Order {
    id: number;
    orderNumber: string;
    returnRequest: ReturnRequest;
    clientName?: string;
}

interface ApproveReturnModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: Order;
}

export function ApproveReturnModal({ isOpen, onClose, order }: ApproveReturnModalProps) {
    const [action, setAction] = useState<"approve" | "reject" | null>(null);
    const [motifRejet, setMotifRejet] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const rr = order.returnRequest;

    const handleApprove = async () => {
        setError(null);
        setLoading(true);
        const result = await approveReturn({ orderId: order.id });
        setLoading(false);
        if (result && "success" in result && result.success) {
            onClose();
        } else {
            setError((result as any)?.error || "Une erreur est survenue");
        }
    };

    const handleReject = async () => {
        setError(null);
        if (motifRejet.trim().length < 5) {
            setError("Le motif de rejet doit contenir au moins 5 caractères");
            return;
        }
        setLoading(true);
        const result = await rejectReturn({ orderId: order.id, motifRejet });
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

                <div className="px-6 py-5 space-y-4">
                    {/* Summary */}
                    <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-gray-500">Montant</span>
                            <span className="font-bold text-gray-900">{rr.montant.toLocaleString("fr-DZ")} DA</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Type</span>
                            <span className="font-semibold">{rr.typeRemboursement === "ESPECES" ? "💵 Espèces" : "💳 Crédit Wallet"}</span>
                        </div>
                        {order.clientName && (
                            <div className="flex justify-between">
                                <span className="text-gray-500">Client</span>
                                <span className="font-semibold">{order.clientName}</span>
                            </div>
                        )}
                        <div className="pt-1 border-t border-gray-200">
                            <span className="text-gray-500 text-xs">Motif</span>
                            <p className="text-gray-800 text-xs mt-0.5">{rr.motif}</p>
                        </div>
                    </div>

                    {/* Irreversible warning */}
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        ⚠️ Cette action est <strong>irréversible</strong>. L'approbation déclenchera le remboursement et la remise en stock des codes.
                    </p>

                    {/* Reject reason */}
                    {action === "reject" && (
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Motif du rejet *</label>
                            <textarea
                                value={motifRejet}
                                onChange={e => setMotifRejet(e.target.value)}
                                placeholder="Expliquez la raison du rejet..."
                                rows={3}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                            />
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-600">
                            {error}
                        </div>
                    )}

                    {/* Actions */}
                    {action === null && (
                        <div className="flex gap-3">
                            <button
                                onClick={() => setAction("reject")}
                                className="flex-1 border border-red-200 text-red-600 rounded-xl py-2.5 text-sm font-semibold hover:bg-red-50 transition-colors"
                            >
                                ✗ Rejeter
                            </button>
                            <button
                                onClick={handleApprove}
                                disabled={loading}
                                className="flex-1 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors"
                            >
                                {loading ? "Traitement..." : "✓ Approuver"}
                            </button>
                        </div>
                    )}

                    {action === "reject" && (
                        <div className="flex gap-3">
                            <button
                                onClick={() => { setAction(null); setMotifRejet(""); setError(null); }}
                                className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-semibold hover:bg-gray-50 transition-colors"
                            >
                                Retour
                            </button>
                            <button
                                onClick={handleReject}
                                disabled={loading}
                                className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors"
                            >
                                {loading ? "Rejet..." : "Confirmer le rejet"}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
