"use client";

import React, { useState, useEffect } from "react";

interface PlayerIdModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (id: string) => void;
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
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setIsVisible(true);
            setPlayerId("");
        } else {
            const timer = setTimeout(() => setIsVisible(false), 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    if (!isVisible && !isOpen) return null;

    const handleConfirm = () => {
        if (playerId.trim()) {
            onConfirm(playerId.trim());
            onClose();
        }
    };

    return (
        <section className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-md transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`} id="modal-overlay">
            {/* BEGIN: Product Info Modal Card */}
            <article className={`bg-white w-full max-w-xl shadow-2xl rounded-[32px] overflow-hidden mx-4 transition-all duration-400 ${isOpen ? 'translate-y-0 scale-100' : 'translate-y-10 scale-95'}`} data-purpose="modal-content-card">
                {/* Modal Content Padding */}
                <div className="p-8 md:p-10">
                    {/* BEGIN: Modal Header */}
                    <header className="flex flex-col items-center mb-8">
                        {/* Product Thumbnail */}
                        <div className="w-24 h-24 mb-6 bg-slate-50 border border-slate-100 rounded-2xl shadow-sm flex items-center justify-center overflow-hidden">
                            {productImage ? (
                                <img alt={productName} className="object-cover w-full h-full" src={productImage} />
                            ) : (
                                <div className="w-full h-full bg-slate-200 flex items-center justify-center">
                                    <span className="material-symbols-rounded text-slate-400 text-4xl">package</span>
                                </div>
                            )}
                        </div>
                        <h1 className="text-slate-900 text-3xl font-bold text-center leading-tight mb-2">
                            Informations requises
                        </h1>
                        <p className="text-slate-500 text-lg text-center max-w-sm">
                            Ce produit nécessite votre ID Joueur ou un lien pour être livré.
                        </p>
                        <p className="text-flexbox-orange font-bold mt-2 uppercase tracking-wide text-sm">{productName}</p>
                    </header>
                    {/* END: Modal Header */}

                    {/* BEGIN: Input Section */}
                    <section className="space-y-4" data-purpose="user-input-area">
                        <div>
                            <label className="block text-slate-700 font-semibold text-lg mb-3 ml-1" htmlFor="player-id">
                                Entrez votre Player ID / Identifiant
                            </label>
                            {/* Kiosk Optimized Input: High height, large font */}
                            <input
                                className="w-full h-16 px-6 text-2xl rounded-2xl border-2 border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-300 focus:border-[#ec5b13] focus:ring-0 transition-colors duration-200 outline-none"
                                id="player-id"
                                name="player-id"
                                placeholder="Ex: 1234567890"
                                type="text"
                                value={playerId}
                                onChange={(e) => setPlayerId(e.target.value)}
                                autoFocus
                            />
                        </div>
                        {/* Visual Alert Box */}
                        <div className="flex items-start gap-3 p-4 bg-red-50 rounded-2xl border border-red-100" data-purpose="input-warning-notice">
                            <svg className="h-6 w-6 text-red-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                            </svg>
                            <p className="text-sm font-medium text-red-800 leading-snug">
                                Veuillez vérifier attentivement votre ID. Les erreurs de saisie ne sont pas remboursables.
                            </p>
                        </div>
                    </section>
                    {/* END: Input Section */}

                    {/* BEGIN: Modal Footer Actions */}
                    <footer className="grid grid-cols-2 gap-4 mt-10">
                        {/* Cancel Button */}
                        <button
                            className="h-16 rounded-2xl bg-slate-100 text-slate-600 font-bold text-lg active:scale-95 transition-transform duration-100 flex items-center justify-center"
                            data-purpose="action-cancel"
                            type="button"
                            onClick={onClose}
                        >
                            Annuler
                        </button>
                        {/* Submit Button */}
                        <button
                            className={`h-16 rounded-2xl bg-[#ec5b13] text-white font-bold text-lg shadow-lg shadow-orange-200 active:scale-95 transition-all duration-100 flex items-center justify-center disabled:opacity-50 disabled:grayscale`}
                            data-purpose="action-validate"
                            type="button"
                            onClick={handleConfirm}
                            disabled={!playerId.trim()}
                        >
                            Ajouter au panier
                        </button>
                    </footer>
                    {/* END: Modal Footer Actions */}
                </div>
            </article>
            {/* END: Product Info Modal Card */}
        </section>
    );
}
