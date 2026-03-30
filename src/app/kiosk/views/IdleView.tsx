"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { LifeBuoy, PackageSearch } from "lucide-react";
import { useKioskStore } from "@/store/useKioskStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import SupportModal from "../components/SupportModal";

interface Product {
    id: number;
    name: string;
    price: number;
    imageUrl?: string | null;
    category?: string;
}

interface IdleViewProps {
    products?: Product[];
}

const FLOAT_DELAYS = ["0s", "1.5s", "0.8s", "2.2s"];
const FLOAT_DURATIONS = ["6s", "7s", "5.5s", "6.5s"];

export default function IdleView({ products = [] }: IdleViewProps) {
    const { setStep } = useKioskStore();
    const { shopName, logoUrl } = useSettingsStore();
    const [isSupportOpen, setIsSupportOpen] = useState(false);

    const featuredProducts = products.slice(0, 4);

    const handleScreenTouch = () => {
        if (isSupportOpen) return;
        setStep("CATALOGUE");
    };

    return (
        <div
            className="h-screen w-screen bg-[#f8f6f4] text-black flex flex-col overflow-hidden select-none touch-none relative cursor-pointer"
            onClick={handleScreenTouch}
        >
            {/* ── Background ── */}
            <div className="absolute inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(236,91,19,0.08),transparent_55%)]" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_85%_90%,rgba(236,91,19,0.05),transparent_45%)]" />
                {/* Grid lines */}
                <div
                    className="absolute inset-0 opacity-[0.05]"
                    style={{
                        backgroundImage:
                            "linear-gradient(rgba(0,0,0,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.4) 1px, transparent 1px)",
                        backgroundSize: "80px 80px",
                    }}
                />
            </div>

            {/* ── Header ── */}
            <header className="relative z-10 flex items-center justify-between px-12 pt-10 pointer-events-none">
                {/* Logo */}
                <div className="flex items-center gap-4">
                    {logoUrl ? (
                        <img src={logoUrl} alt={shopName} className="h-12 w-12 object-contain rounded-xl" />
                    ) : (
                        <div className="size-12 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/30">
                            <svg className="text-white" fill="none" height="24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="24">
                                <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                        </div>
                    )}
                    <div>
                        <p className="text-[10px] font-bold tracking-[0.3em] text-black/30 uppercase">Bienvenue chez</p>
                        <h2 className="text-lg font-black tracking-tight text-black leading-none">{shopName}</h2>
                    </div>
                </div>

                {/* ONLINE Badge */}
                <div className="flex items-center gap-3 px-5 py-2.5 bg-white/70 backdrop-blur-xl rounded-2xl border border-black/8 shadow-sm">
                    <span className="flex h-2.5 w-2.5 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                    </span>
                    <span className="text-black/50 font-black tracking-[0.2em] text-[10px] uppercase">ONLINE</span>
                </div>
            </header>

            {/* ── Main Layout ── */}
            <main className="relative z-10 flex flex-1 items-center px-12 gap-16 overflow-hidden">

                {/* LEFT — Hero Text + CTA */}
                <div className="flex flex-col flex-1 min-w-0">
                    {/* Eyebrow */}
                    <div className="flex items-center gap-3 mb-6">
                        <div className="h-px flex-1 max-w-[48px] bg-primary/60" />
                        <span className="text-[10px] font-black tracking-[0.4em] text-primary/80 uppercase">Services Digitaux</span>
                    </div>

                    {/* Main Headline */}
                    <h1 className="text-5xl xl:text-6xl font-black leading-[0.95] uppercase tracking-tighter mb-6">
                        <span className="text-black">Vos Services</span>
                        <br />
                        <span className="text-black">Digitaux En</span>
                        <br />
                        <span
                            className="inline-block"
                            style={{
                                background: `linear-gradient(135deg, var(--primary) 0%, #ff9a4a 60%, #ffb347 100%)`,
                                WebkitBackgroundClip: "text",
                                WebkitTextFillColor: "transparent",
                                backgroundClip: "text",
                            }}
                        >
                            Un Instant.
                        </span>
                    </h1>

                    {/* Sub */}
                    <p className="text-black/40 text-sm font-semibold tracking-widest uppercase mb-10 max-w-sm">
                        Recharges · Gaming · Abonnements · Cartes Cadeaux
                    </p>

                    {/* CTA Button */}
                    <div className="flex flex-col items-start gap-4">
                        <button
                            className="pulse-subtle group relative bg-primary hover:bg-[#ff6a20] active:scale-95 text-white px-10 py-5 rounded-2xl text-base font-black uppercase tracking-[0.15em] flex items-center gap-4 shadow-2xl shadow-primary/30 transition-all duration-200"
                            onClick={(e) => { e.stopPropagation(); handleScreenTouch(); }}
                        >
                            <span className="flex h-2.5 w-2.5 relative mr-1">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-50" />
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
                            </span>
                            Touchez l&apos;écran pour commencer
                            <svg className="transition-transform group-hover:translate-x-1" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" viewBox="0 0 24 24" width="18">
                                <line x1="5" x2="19" y1="12" y2="12" />
                                <polyline points="12 5 19 12 12 19" />
                            </svg>
                        </button>

                        {/* Secondary Actions */}
                        <div className="flex items-center gap-3 mt-4">
                            <button
                                onClick={(e) => { e.stopPropagation(); setIsSupportOpen(true); }}
                                className="flex items-center gap-2 px-6 h-11 bg-black/5 hover:bg-black/10 rounded-xl text-black/60 hover:text-black text-xs font-bold tracking-widest uppercase transition-all border border-black/5"
                            >
                                <LifeBuoy size={16} />
                                Besoin d&apos;aide ?
                            </button>
                            <Link
                                href="/suivi"
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-2 px-6 h-11 bg-black/5 hover:bg-black/10 rounded-xl text-black/60 hover:text-black text-xs font-bold tracking-widest uppercase transition-all border border-black/5"
                            >
                                <PackageSearch size={16} />
                                Suivre ma commande
                            </Link>
                        </div>
                    </div>
                </div>

                {/* RIGHT — Product Cards */}
                {featuredProducts.length > 0 && (
                    <div className="hidden lg:grid grid-cols-2 gap-4 w-[420px] xl:w-[480px] shrink-0">
                        {featuredProducts.map((product, i) => (
                            <div
                                key={product.id}
                                className="floating bg-white border border-black/8 rounded-2xl overflow-hidden shadow-md hover:border-primary/30 hover:shadow-lg transition-all duration-300"
                                style={{
                                    animationDelay: FLOAT_DELAYS[i],
                                    animationDuration: FLOAT_DURATIONS[i],
                                }}
                            >
                                {/* Product Image */}
                                <div className="relative aspect-square w-full bg-black/5">
                                    {product.imageUrl ? (
                                        <Image
                                            src={product.imageUrl}
                                            alt={product.name}
                                            fill
                                            className="object-cover"
                                            sizes="240px"
                                        />
                                    ) : (
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <svg className="text-black/20" fill="none" height="40" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" width="40">
                                                <rect height="20" rx="2" ry="2" width="20" x="2" y="2" />
                                                <circle cx="8.5" cy="8.5" r="1.5" />
                                                <polyline points="21 15 16 10 5 21" />
                                            </svg>
                                        </div>
                                    )}
                                </div>
                                {/* Info */}
                                <div className="p-3">
                                    <p className="text-black/80 font-bold text-xs truncate leading-tight">{product.name}</p>
                                    <p className="text-black font-black text-sm mt-0.5">{product.price != null ? product.price.toLocaleString("fr-DZ") : "—"} DA</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* ── Marquee — Products from catalogue ── */}
            {products.length > 0 && (() => {
                const marqueeItems = [...products, ...products];
                return (
                    <div className="relative z-10 w-full overflow-hidden py-3 border-y border-black/6 bg-white/50 backdrop-blur-sm pointer-events-none">
                        <div className="marquee-track gap-5 px-5">
                            {marqueeItems.map((p, i) => (
                                <span
                                    key={i}
                                    className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-black tracking-wider uppercase whitespace-nowrap border border-primary/20 bg-primary/5 text-primary/80"
                                >
                                    <span className="inline-block size-1.5 rounded-full bg-primary/60" />
                                    {p.name}
                                    {p.price != null && (
                                        <span className="text-black/40 font-bold">— {p.price.toLocaleString("fr-DZ")} DA</span>
                                    )}
                                </span>
                            ))}
                        </div>
                    </div>
                );
            })()}

            {/* ── Footer — Payment Badges ── */}
            <footer className="relative z-10 flex items-center justify-between px-12 pb-8 pointer-events-none">
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold tracking-[0.3em] text-black/30 uppercase">Paiement sécurisé</span>
                    <div className="h-px w-8 bg-black/10" />
                    <div className="flex items-center gap-2">
                        {[
                            { icon: "payments", label: "Espèces" },
                            { icon: "credit_card", label: "Carte" },
                            { icon: "contactless", label: "Sans contact" },
                            { icon: "receipt_long", label: "Reçu" },
                        ].map(({ icon, label }) => (
                            <div
                                key={icon}
                                title={label}
                                className="size-9 bg-white border border-black/8 rounded-xl flex items-center justify-center shadow-sm"
                            >
                                <span className="material-symbols-outlined text-black/30 !text-[18px]">{icon}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <p className="text-[10px] font-bold tracking-[0.2em] text-black/20 uppercase">
                    © {new Date().getFullYear()} {shopName} — Borne Interactive
                </p>
            </footer>

            <SupportModal isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />
        </div>
    );
}
