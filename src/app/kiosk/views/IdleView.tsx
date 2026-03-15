"use client";

import React from "react";
import { useKioskStore } from "@/store/useKioskStore";
import { useSettingsStore } from "@/store/useSettingsStore";

export default function IdleView() {
    const { setStep } = useKioskStore();
    const { shopName } = useSettingsStore();

    const handleScreenTouch = () => {
        // Visual feedback before navigation
        const overlay = document.getElementById('idle-screen-overlay');
        if (overlay) {
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.5s ease-out';
        }

        // Short delay for the transition effect
        setTimeout(() => {
            setStep("CATALOGUE");
        }, 300);
    };

    return (
        <div className="h-screen w-screen bg-white text-slate-900 flex items-center justify-center overflow-hidden font-['Inter',_sans-serif] select-none touch-none">
            <style jsx global>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
                
                @keyframes float {
                    0%, 100% { transform: translateY(0px); }
                    50% { transform: translateY(-20px); }
                }

                @keyframes softBlink {
                    0%, 100% { 
                        box-shadow: 0 25px 50px -12px rgba(236, 91, 19, 0.3);
                        transform: scale(1);
                    }
                    50% { 
                        box-shadow: 0 35px 60px -10px rgba(236, 91, 19, 0.5);
                        transform: scale(1.02);
                    }
                }

                .animate-float {
                    animation: float 4s ease-in-out infinite;
                }

                .animate-soft-glow {
                    animation: softBlink 3s ease-in-out infinite;
                }
            `}</style>

            {/* BEGIN: Interactive Backdrop */}
            <div
                id="idle-screen-overlay"
                onClick={handleScreenTouch}
                className="absolute inset-0 z-0 cursor-pointer flex flex-col items-center justify-center p-8 text-center transition-opacity"
            >
                {/* BEGIN: Central Visual */}
                <div className="relative mb-12 animate-float">
                    <svg className="drop-shadow-sm" fill="none" height="180" stroke="#ec5b13" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" viewBox="0 0 24 24" width="180" xmlns="http://www.w3.org/2000/svg">
                        <line x1="6" x2="10" y1="11" y2="11"></line>
                        <line x1="8" x2="8" y1="9" y2="13"></line>
                        <line x1="15" x2="15.01" y1="12" y2="12"></line>
                        <line x1="18" x2="18.01" y1="10" y2="10"></line>
                        <path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152L2 17a1 1 0 0 0 1 1h2.2a1 1 0 0 0 .95-.683L7 15h10l.85 2.317a1 1 0 0 0 .95.683H21a1 1 0 0 0 1-1l-.685-8.258c-.007-.051-.011-.1-.017-.152A4 4 0 0 0 17.32 5z"></path>
                    </svg>
                </div>

                {/* BEGIN: Text Content */}
                <div className="max-w-4xl">
                    <h1 className="text-7xl md:text-8xl font-extrabold tracking-tight text-slate-900 leading-tight">
                        Bienvenue chez <span className="text-[#ec5b13]">{shopName}</span>
                    </h1>
                    <p className="text-2xl md:text-3xl text-slate-500 mt-8 font-medium max-w-2xl mx-auto">
                        Achetez vos cartes cadeaux et abonnements en quelques secondes.
                    </p>
                </div>

                {/* BEGIN: CTA Button */}
                <div className="mt-20">
                    <button
                        className="bg-[#ec5b13] text-white text-3xl md:text-4xl font-bold px-20 py-10 rounded-full shadow-2xl animate-soft-glow transition-transform active:scale-95 flex items-center gap-4"
                        type="button"
                    >
                        <span>Touchez l&apos;écran pour commencer</span>
                        <svg className="ml-2" fill="none" height="36" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3" viewBox="0 0 24 24" width="36" xmlns="http://www.w3.org/2000/svg">
                            <path d="M5 12h14"></path>
                            <path d="m12 5 7 7-7 7"></path>
                        </svg>
                    </button>
                </div>
            </div>

            {/* BEGIN: Bottom Branding / Status */}
            <footer className="absolute bottom-12 w-full text-center pointer-events-none">
                <div className="inline-flex items-center gap-2 px-6 py-3 bg-slate-50 rounded-full border border-slate-100 shadow-sm">
                    <span className="flex h-3 w-3 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </span>
                    <span className="text-slate-400 font-semibold tracking-wider text-sm uppercase">Système Prêt</span>
                </div>
            </footer>
        </div>
    );
}
