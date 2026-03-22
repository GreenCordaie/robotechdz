"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ShoppingBag } from "lucide-react";

export default function TrackOrderPage() {
    const [orderNumber, setOrderNumber] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (orderNumber.trim()) {
            setIsLoading(true);
            router.push(`/suivi/${encodeURIComponent(orderNumber.trim())}`);
        }
    };

    return (
        <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center pt-24 px-4">
            <div className="w-full max-w-md bg-[#161616] rounded-2xl shadow-xl overflow-hidden border border-white/5">
                <div className="bg-[#ec5b13] px-6 py-8 text-center">
                    <div className="mx-auto bg-white/20 h-16 w-16 rounded-full flex items-center justify-center mb-4 ring-4 ring-white/30">
                        <ShoppingBag className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-white">Suivi de Commande</h1>
                    <p className="text-white/80 mt-2 text-sm">Entrez votre numéro de commande pour voir son statut actuel.</p>
                </div>

                <div className="px-6 py-8">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label htmlFor="orderNumber" className="block text-sm font-medium text-slate-400">
                                Numéro de commande
                            </label>
                            <div className="mt-2 relative rounded-md shadow-sm">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <span className="text-slate-500 sm:text-sm font-bold">#</span>
                                </div>
                                <input
                                    type="text"
                                    id="orderNumber"
                                    className="block w-full pl-8 pr-12 sm:text-lg border border-white/10 rounded-xl py-3 bg-[#1a1a1a] text-white uppercase placeholder:text-slate-600 placeholder:normal-case font-mono focus:outline-none focus:border-[#ec5b13]/50 transition-all"
                                    placeholder="Ex: C5-842"
                                    value={orderNumber.replace('#', '')}
                                    onChange={(e) => setOrderNumber('#' + e.target.value.replace('#', ''))}
                                    required
                                    autoFocus
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading || !orderNumber.trim()}
                            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-[#ec5b13] hover:bg-[#d44f0f] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#ec5b13] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {isLoading ? (
                                <span className="flex items-center">
                                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Recherche en cours...
                                </span>
                            ) : (
                                <span className="flex items-center">
                                    <Search className="w-5 h-5 mr-2" />
                                    Suivre ma commande
                                </span>
                            )}
                        </button>
                    </form>
                </div>
            </div>

            <div className="mt-8 text-center text-sm text-slate-600">
                <p>Besoin d&apos;aide ? Contactez notre support.</p>
            </div>
        </div>
    );
}
