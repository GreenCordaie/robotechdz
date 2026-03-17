"use client";

import React from "react";
import { Button, Card, CardBody } from "@heroui/react";
import {
    Store,
    ArrowRight,
    ShieldCheck,
    Zap,
    BarChart3,
    Wallet,
    CheckCircle2,
    Building2,
    Users
} from "lucide-react";
import Link from "next/link";

export default function B2BLandingPage() {
    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white selection:bg-[#ec5b13]/30">
            {/* Background Effects */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] bg-[#ec5b13]/5 blur-[120px] rounded-full animate-pulse"></div>
                <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[60%] bg-[#ec5b13]/5 blur-[120px] rounded-full animate-pulse" style={{ animationDelay: '2s' }}></div>
            </div>

            {/* Content Wrapper */}
            <div className="relative z-10">
                {/* Hero Section */}
                <header className="pt-24 pb-16 px-6 max-w-7xl mx-auto text-center">
                    <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-[#161616] border border-[#262626] mb-8 animate-in fade-in slide-in-from-top-4 duration-700">
                        <span className="flex h-2 w-2 rounded-full bg-[#ec5b13] animate-ping"></span>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ec5b13]">Programme Partenaire 2026</span>
                    </div>

                    <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-6 leading-[0.9] uppercase animate-in fade-in slide-in-from-top-6 duration-1000 delay-100 italic">
                        Boostez votre <br />
                        <span className="text-[#ec5b13]">Business Digital</span>
                    </h1>

                    <p className="max-w-2xl mx-auto text-slate-400 text-lg md:text-xl font-medium leading-relaxed mb-12 animate-in fade-in slide-in-from-top-8 duration-1000 delay-200">
                        Accédez aux tarifs grossistes, gérez votre propre stock virtuel et développez votre clientèle avec la solution B2B de <b>FLEXBOX DIRECT</b>.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-in fade-in slide-in-from-top-10 duration-1000 delay-300">
                        <Button
                            as={Link}
                            href="/reseller/login"
                            className="h-16 px-10 bg-[#ec5b13] text-white font-black text-lg rounded-2xl shadow-2xl shadow-orange-950/40 hover:scale-105 active:scale-95 transition-all uppercase tracking-tight"
                            endContent={<ArrowRight size={20} />}
                        >
                            Accéder au Portail
                        </Button>
                        <Button
                            as={Link}
                            href="/admin/support"
                            variant="bordered"
                            className="h-16 px-10 border-[#262626] bg-[#161616]/50 text-slate-300 font-black text-lg rounded-2xl hover:bg-[#262626] hover:text-white transition-all uppercase tracking-tight"
                        >
                            Devenir Partenaire
                        </Button>
                    </div>
                </header>

                {/* Features Grid */}
                <section className="px-6 max-w-7xl mx-auto py-24 border-t border-white/5">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {[
                            {
                                icon: Zap,
                                title: "Tarifs Grossistes",
                                desc: "Bénéficiez de remises exclusives sur tout le catalogue pour maximiser vos marges bénéficiaires."
                            },
                            {
                                icon: Wallet,
                                title: "Wallet Prépayé",
                                desc: "Gérez votre solde en toute autonomie. Rechargez et commandez instantanément 24h/24."
                            },
                            {
                                icon: BarChart3,
                                title: "Suivi en Temps Réel",
                                desc: "Analysez vos ventes, vos transactions et l'historique complet de vos activités partenaires."
                            }
                        ].map((feat, i) => (
                            <Card key={i} className="bg-[#161616] border border-[#262626] rounded-[32px] overflow-hidden group hover:border-[#ec5b13]/50 transition-all duration-500">
                                <CardBody className="p-10">
                                    <div className="size-16 rounded-2xl bg-[#0a0a0a] border border-[#262626] flex items-center justify-center mb-8 group-hover:scale-110 group-hover:bg-[#ec5b13] transition-all duration-500">
                                        <feat.icon className="size-8 text-[#ec5b13] group-hover:text-white transition-colors" />
                                    </div>
                                    <h3 className="text-2xl font-black uppercase tracking-tight mb-4 group-hover:text-[#ec5b13] transition-colors">{feat.title}</h3>
                                    <p className="text-slate-500 font-medium leading-relaxed">{feat.desc}</p>
                                </CardBody>
                            </Card>
                        ))}
                    </div>
                </section>

                {/* Secondary Features / Trust */}
                <section className="bg-gradient-to-b from-transparent to-[#161616]/30 py-24 border-t border-white/5">
                    <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
                        <div className="space-y-8">
                            <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tighter leading-none italic">
                                Pourquoi choisir <br />
                                <span className="text-[#ec5b13]">FLEXBOX B2B ?</span>
                            </h2>
                            <div className="space-y-6">
                                {[
                                    { title: "Sécurité Maximale", desc: "Authentification à deux facteurs et PIN sécurisé pour chaque transaction." },
                                    { title: "API Professionnelle", desc: "Intégrez nos services directement dans vos propres solutions (sur demande)." },
                                    { title: "Support Dédié", desc: "Une assistance technique prioritaire pour tous nos partenaires officiels." }
                                ].map((item, i) => (
                                    <div key={i} className="flex gap-4">
                                        <div className="mt-1">
                                            <CheckCircle2 className="text-emerald-500 size-6" />
                                        </div>
                                        <div>
                                            <h4 className="font-black text-lg uppercase tracking-tight">{item.title}</h4>
                                            <p className="text-slate-500 font-medium">{item.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="relative">
                            <div className="absolute inset-0 bg-[#ec5b13]/20 blur-[80px] rounded-full"></div>
                            <Card className="bg-[#111] border border-[#262626] rounded-[40px] shadow-2xl relative z-10 overflow-hidden transform lg:rotate-2">
                                <CardBody className="p-0">
                                    <div className="bg-[#1a1614] border-b border-[#2d2622] p-6 flex justify-between items-center">
                                        <div className="flex items-center gap-3">
                                            <div className="size-10 rounded-xl bg-[#ec5b13] flex items-center justify-center shadow-lg">
                                                <Store className="text-white size-6" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-black text-white">Interface Partenaire</span>
                                                <span className="text-[10px] font-bold text-slate-500 uppercase">Version 2.0.4</span>
                                            </div>
                                        </div>
                                        <div className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase border border-emerald-500/20">Connecté</div>
                                    </div>
                                    <div className="p-8 space-y-6">
                                        <div className="h-32 rounded-3xl bg-[#0a0a0a] border border-[#262626] p-6 flex flex-col justify-center">
                                            <span className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1">Votre Solde</span>
                                            <span className="text-4xl font-black text-white tracking-tighter">84,500.00 DZD</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="h-20 rounded-2xl bg-[#0a0a0a] border border-[#262626] p-4 flex flex-col justify-center">
                                                <span className="text-[9px] font-black text-slate-600 uppercase">Remise Or</span>
                                                <span className="text-xl font-black text-[#ec5b13]">-15%</span>
                                            </div>
                                            <div className="h-20 rounded-2xl bg-[#0a0a0a] border border-[#262626] p-4 flex flex-col justify-center">
                                                <span className="text-[9px] font-black text-slate-600 uppercase">Ventes</span>
                                                <span className="text-xl font-black text-white">452</span>
                                            </div>
                                        </div>
                                    </div>
                                </CardBody>
                            </Card>
                        </div>
                    </div>
                </section>

                {/* CTA Area */}
                <section className="px-6 py-32 text-center">
                    <Card className="max-w-4xl mx-auto bg-[#161616] border border-[#262626] rounded-[48px] overflow-hidden p-12 md:p-20 relative">
                        <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
                            <Building2 size={300} />
                        </div>
                        <div className="relative z-10 space-y-10">
                            <h2 className="text-4xl md:text-6xl font-black tracking-tighter uppercase italic leading-[0.85]">
                                Prêt à passer à <br />
                                la vitesse supérieure ?
                            </h2>
                            <p className="text-slate-400 text-lg font-medium max-w-xl mx-auto">
                                Rejoignez plus de 150 commerçants qui utilisent déjà notre plateforme pour automatiser leur flux de travail.
                            </p>
                            <Button
                                as={Link}
                                href="/reseller/login"
                                className="h-16 px-12 bg-white text-black font-black text-lg rounded-2xl hover:bg-[#ec5b13] hover:text-white transition-all uppercase tracking-tight"
                            >
                                Commencer maintenant
                            </Button>
                        </div>
                    </Card>
                </section>

                {/* Footer */}
                <footer className="px-6 py-12 border-t border-white/5 text-center text-slate-600">
                    <div className="flex items-center justify-center gap-3 mb-6">
                        <Store className="size-5" />
                        <span className="font-black tracking-widest text-xs uppercase">FLEXBOX BUSINESS SOLUTION</span>
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.4em]">© 2026 Tous droits réservés • ALGERIA</p>
                </footer>
            </div>
        </div>
    );
}
