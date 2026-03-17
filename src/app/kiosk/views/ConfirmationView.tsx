"use client";

import React, { useEffect, useState } from "react";
import { useKioskStore } from "@/store/useKioskStore";

export default function ConfirmationView() {
    const { lastOrderNumber, resetKiosk } = useKioskStore();
    const [secondsLeft, setSecondsLeft] = useState(30);

    useEffect(() => {
        const timer = setInterval(() => {
            setSecondsLeft((prev) => {
                if (prev <= 1) {
                    resetKiosk();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [resetKiosk]);

    return (
        <div className="bg-[#F9FAFB] min-h-screen overflow-hidden select-none font-sans">
            {/* BEGIN: SuccessMainContainer */}
            <main className="min-h-screen flex flex-col items-center justify-center p-8 text-center" data-purpose="success-screen-wrapper">
                {/* BEGIN: IconSection */}
                {/* Large success check icon in a circular container */}
                <div className="w-40 h-40 bg-green-100 rounded-full flex items-center justify-center shadow-xl shadow-green-500/20 mb-12" data-purpose="success-icon-container">
                    <svg className="h-24 w-24 text-[#10b981]" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"></path>
                    </svg>
                </div>
                {/* END: IconSection */}

                {/* BEGIN: FeedbackText */}
                <section data-purpose="status-messages">
                    <h1 className="text-6xl font-black text-black tracking-tight leading-tight uppercase">
                        Commande validée !
                    </h1>
                    <p className="text-3xl text-black font-bold mt-6 max-w-2xl mx-auto opacity-70">
                        Veuillez vous présenter à la caisse avec ce numéro :
                    </p>
                </section>
                {/* END: FeedbackText */}

                {/* BEGIN: OrderNumberBlock */}
                {/* Giant order number container for high visibility */}
                <div className="bg-white border-8 border-black rounded-[48px] py-10 px-24 shadow-2xl mt-12 mb-16" data-purpose="order-id-display">
                    <span className="text-[10rem] font-black text-black tracking-[0.1em] leading-none uppercase">
                        {lastOrderNumber || "#---"}
                    </span>
                </div>
                {/* END: OrderNumberBlock */}

                {/* BEGIN: ActionButtons */}
                <div className="flex flex-col items-center gap-6" data-purpose="navigation-actions">
                    {/* High visibility CTA button for kiosk interaction */}
                    <button
                        className="bg-black hover:bg-slate-900 active:scale-95 transition-all text-white text-3xl font-black rounded-full px-16 py-8 shadow-xl uppercase tracking-wider"
                        onClick={resetKiosk}
                    >
                        Terminer mon achat
                    </button>
                    {/* Subtle automatic countdown message or hint */}
                    <p className="text-black/40 text-xl font-black uppercase tracking-widest">
                        Retour automatique dans <span id="countdown">{secondsLeft}</span>s
                    </p>
                </div>
                {/* END: ActionButtons */}
            </main>
            {/* END: SuccessMainContainer */}
        </div>
    );
}
