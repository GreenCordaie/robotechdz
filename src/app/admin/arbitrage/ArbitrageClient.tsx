"use client";

import React, { useState, useTransition } from "react";
import { toast } from "react-hot-toast";
import { addBsvTrackedLinkAction, removeBsvTrackedLinkAction } from "./actions";

export default function ArbitrageClient({ initialLinks }: { initialLinks: any[] }) {
    const [isPending, startTransition] = useTransition();
    const [url, setUrl] = useState("");
    const [title, setTitle] = useState("");

    const handleAdd = () => {
        if (!url.trim()) {
            toast.error("Veuillez entrer une URL valide.");
            return;
        }

        startTransition(async () => {
            const res = await addBsvTrackedLinkAction({ url, title });
            if (res.success) {
                toast.success("Lien ajouté avec succès !");
                setUrl("");
                setTitle("");
            } else {
                toast.error(res.error || "Erreur lors de l'ajout.");
            }
        });
    };

    const handleRemove = (id: string) => {
        if (!confirm("Voulez-vous vraiment supprimer ce lien de la surveillance ?")) return;

        startTransition(async () => {
            const res = await removeBsvTrackedLinkAction({ id });
            if (res.success) {
                toast.success("Lien supprimé !");
            } else {
                toast.error(res.error || "Erreur lors de la suppression.");
            }
        });
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-8">
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Arbitrage Curatif (BSV)
                </h1>
                <p className="text-gray-500 text-sm">
                    Surveillez spécifiquement certains produits BuySellVoucher. LoadBrain vérifiera automatiquement le stock et mettra à jour le catalogue Robotech toutes les 5 minutes.
                </p>
            </div>

            {/* Ajouter un lien */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Ajouter un nouveau produit</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">URL BuySellVoucher</label>
                        <input
                            type="text"
                            placeholder="https://www.buysellvoucher.com/en/products/view/123456/"
                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-900 dark:border-gray-700 dark:text-white"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            disabled={isPending}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Nom (Optionnel)</label>
                        <input
                            type="text"
                            placeholder="Netflix FR 50€"
                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-900 dark:border-gray-700 dark:text-white"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            disabled={isPending}
                        />
                    </div>
                </div>
                <button
                    onClick={handleAdd}
                    disabled={isPending || !url.trim()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg disabled:opacity-50 transition-colors"
                >
                    {isPending ? "Ajout..." : "Ajouter au Tracking"}
                </button>
            </div>

            {/* Liste des liens */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Produits Surveillés</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-600 dark:text-gray-400">
                        <thead className="text-xs text-gray-500 uppercase bg-gray-50 dark:bg-gray-900 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                            <tr>
                                <th className="px-6 py-3 font-medium">Nom / ID BSV</th>
                                <th className="px-6 py-3 font-medium">Lien Original</th>
                                <th className="px-6 py-3 font-medium">Prix (Frais Inclus)</th>
                                <th className="px-6 py-3 font-medium">Statut</th>
                                <th className="px-6 py-3 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {initialLinks.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                                        Aucun produit surveillé. Ajoutez-en un ci-dessus.
                                    </td>
                                </tr>
                            ) : (
                                initialLinks.map((link) => (
                                    <tr key={link.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-gray-900 dark:text-white">{link.title}</div>
                                            <div className="text-xs text-gray-500">ID: {link.bsvProductId}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <a href={link.url} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline max-w-[200px] truncate block">
                                                {link.url}
                                            </a>
                                        </td>
                                        <td className="px-6 py-4 font-mono">
                                            {link.finalPriceCents ? `$${(link.finalPriceCents / 100).toFixed(2)}` : "En attente"}
                                        </td>
                                        <td className="px-6 py-4">
                                            {link.status === "IN_STOCK" && (
                                                <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                                                    En Stock
                                                </span>
                                            )}
                                            {link.status === "OUT_OF_STOCK" && (
                                                <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 rounded-full">
                                                    Rupture
                                                </span>
                                            )}
                                            {link.status === "REMOVED" && (
                                                <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 rounded-full">
                                                    Retiré
                                                </span>
                                            )}
                                            {link.status === "PENDING" && (
                                                <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 rounded-full">
                                                    En Attente
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => handleRemove(link.id)}
                                                disabled={isPending}
                                                className="text-red-500 hover:text-red-700 font-medium text-sm transition-colors"
                                            >
                                                Supprimer
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
