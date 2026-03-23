"use client";

import React, { useState } from "react";
import { useKioskStore } from "@/store/useKioskStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import SupportModal from "../components/SupportModal";
import { LifeBuoy, PackageSearch } from "lucide-react";
import Link from "next/link";

export default function IdleView() {
    const { setStep } = useKioskStore();
    const { shopName } = useSettingsStore();
    const [isSupportOpen, setIsSupportOpen] = useState(false);

    const handleScreenTouch = () => {
        // If clicking support, don't start order
        if (isSupportOpen) return;
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
        <div className="h-screen w-screen bg-[#fafafa] text-black flex items-center justify-center overflow-hidden font-['Inter',_sans-serif] select-none touch-none relative">
            {/* BEGIN: Background Pattern/Gradient */}
            <div className="absolute inset-0 z-0">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(236,91,19,0.05),transparent_50%)]" />
                <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` }} />
            </div>

            <style jsx global>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
                
                @keyframes float {
                    0%, 100% { transform: translateY(0px); }
                    50% { transform: translateY(-15px); }
                }

                @keyframes softBlink {
                    0%, 100% { 
                        box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.15);
                        transform: scale(1);
                    }
                    50% { 
                        box-shadow: 0 20px 50px -5px rgba(0, 0, 0, 0.25);
                        transform: scale(1.02);
                    }
                }

                .animate-float {
                    animation: float 6s ease-in-out infinite;
                }

                .animate-soft-glow {
                    animation: softBlink 4s ease-in-out infinite;
                }
            `}</style>

            {/* BEGIN: Main Content Container */}
            <div
                id="idle-screen-overlay"
                onClick={handleScreenTouch}
                className="relative z-10 cursor-pointer flex flex-col items-center justify-center max-w-6xl w-full px-12 text-center transition-all duration-700"
            >
                {/* Logo & Visual */}
                <div className="mb-6 animate-float">
                    <div className="size-32 bg-black rounded-[2rem] flex items-center justify-center shadow-xl relative">
                        <svg className="text-white drop-shadow-md" fill="none" height="60" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="60" xmlns="http://www.w3.org/2000/svg">
                            <line x1="6" x2="10" y1="11" y2="11"></line>
                            <line x1="8" x2="8" y1="9" y2="13"></line>
                            <line x1="15" x2="15.01" y1="12" y2="12"></line>
                            <line x1="18" x2="18.01" y1="10" y2="10"></line>
                            <path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152L2 17a1 1 0 0 0 1 1h2.2a1 1 0 0 0 .95-.683L7 15h10l.85 2.317a1 1 0 0 0 .95.683H21a1 1 0 0 0 1-1l-.685-8.258c-.007-.051-.011-.1-.017-.152A4 4 0 0 0 17.32 5z"></path>
                        </svg>
                        {/* Decorative HUD Corner */}
                        <div className="absolute -top-3 -right-3 size-8 border-t-4 border-r-4 border-[#ec5b13] rounded-tr-lg opacity-40" />
                    </div>
                </div>

                {/* Text Content */}
                <div className="mb-10">
                    <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tighter text-black leading-[0.9] uppercase">
                        Bienvenue chez <br />
                        <span className="text-[#ec5b13] inline-block mt-1 relative">
                            {shopName}
                            <div className="absolute -bottom-1 left-0 w-full h-1 bg-black/5 rounded-full" />
                        </span>
                    </h1>
                    <p className="text-lg md:text-xl text-black/50 mt-6 font-black max-w-xl mx-auto uppercase tracking-[0.2em]">
                        Votre espace gaming & digital premium.
                    </p>
                </div>

                {/* Call to Action */}
                <div className="flex flex-col items-center gap-6">
                    <button className="group relative">
                        <div className="absolute -inset-2 bg-[#ec5b13]/20 blur-xl rounded-full group-hover:bg-[#ec5b13]/30 transition-all opacity-0 group-hover:opacity-100" />
                        <div className="relative bg-black text-white px-10 py-5 rounded-full text-xl font-black flex items-center gap-3 animate-soft-glow hover:scale-105 active:scale-95 transition-all uppercase tracking-wider">
                            Commencer
                            <svg className="transition-transform group-hover:translate-x-1" fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" viewBox="0 0 24 24" width="20" xmlns="http://www.w3.org/2000/svg">
                                <line x1="5" x2="19" y1="12" y2="12"></line>
                                <polyline points="12 5 19 12 12 19"></polyline>
                            </svg>
                        </div>
                    </button>

                    {/* Secondary Actions */}
                    <div className="flex items-center gap-4 mt-4">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsSupportOpen(true);
                            }}
                            className="bg-black/5 hover:bg-black/10 text-black px-6 py-3 rounded-2xl text-sm font-bold flex items-center gap-2 transition-all uppercase tracking-tight"
                        >
                            <LifeBuoy size={16} />
                            Besoin d'aide ?
                        </button>
                        <Link
                            href="/tracking"
                            onClick={(e) => e.stopPropagation()}
                            className="bg-black/5 hover:bg-black/10 text-black px-6 py-3 rounded-2xl text-sm font-bold flex items-center gap-2 transition-all uppercase tracking-tight"
                        >
                            <PackageSearch size={16} />
                            Suivre Commande
                        </Link>
                    </div>
                </div>
            </div>

            {/* BEGIN: Status Indicator (Floating) */}
            <div className="absolute bottom-10 left-10 z-20 flex items-center gap-4">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsSupportOpen(true);
                    }}
                    className="flex items-center gap-3 px-6 py-3 bg-black/5 hover:bg-black/10 backdrop-blur-xl rounded-2xl border border-black/5 transition-all active:scale-95 group"
                >
                    <LifeBuoy className="w-4 h-4 text-black/40 group-hover:text-[#ec5b13] transition-colors" />
                    <span className="text-black/40 font-black tracking-widest text-[10px] uppercase group-hover:text-black transition-colors">Besoin d&apos;aide ?</span>
                </button>
                <Link
                    href="/suivi"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-3 px-6 py-3 bg-black/5 hover:bg-black/10 backdrop-blur-xl rounded-2xl border border-black/5 transition-all active:scale-95 group"
                >
                    <PackageSearch className="w-4 h-4 text-black/40 group-hover:text-[#ec5b13] transition-colors" />
                    <span className="text-black/40 font-black tracking-widest text-[10px] uppercase group-hover:text-black transition-colors">Suivre ma commande</span>
                </Link>
            </div>

            <div className="absolute bottom-10 right-10 z-20">
                <div className="flex items-center gap-3 px-6 py-3 bg-white/80 backdrop-blur-xl rounded-2xl border border-black/5 shadow-xl">
                    <span className="flex h-3 w-3 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </span>
                    <span className="text-black/80 font-black tracking-widest text-xs uppercase">ONLINE</span>
                </div>
            </div>

            <SupportModal isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />
        </div>
    );
}
