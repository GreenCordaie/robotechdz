"use client";

import React, { useState } from "react";
import { Button, Input, Card, CardBody } from "@heroui/react";
import { Lock, Mail, ArrowRight, ShieldCheck, Store } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { loginResellerAction } from "./actions";
import { useSettingsStore } from "@/store/useSettingsStore";

export default function ResellerLoginPage() {
    const { shopName } = useSettingsStore();
    const [email, setEmail] = useState("");
    const [pin, setPin] = useState("");
    const [websiteUrl, setWebsiteUrl] = useState(""); // Honeypot
    const [isLoading, setIsLoading] = useState(false);
    const [mfaRequired, setMfaRequired] = useState(false);
    const [tempUserId, setTempUserId] = useState<number | null>(null);
    const [mfaCode, setMfaCode] = useState("");
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const res = await loginResellerAction(email, pin, websiteUrl);
            if (res.success) {
                if (res.mfaRequired) {
                    setMfaRequired(true);
                    setTempUserId(res.tempUserId!);
                } else {
                    toast.success("Bienvenue sur votre portail partenaire");
                    router.push("/reseller/dashboard");
                }
            } else {
                toast.error(res.error || "Identifiants invalides");
            }
        } catch (error) {
            toast.error("Erreur de connexion au serveur");
        } finally {
            setIsLoading(false);
        }
    };

    const handleMfaSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!tempUserId) return;
        setIsLoading(true);

        try {
            const { verifyResellerMfaAction } = await import("./actions");
            const res = await verifyResellerMfaAction(tempUserId, mfaCode);
            if (res.success) {
                toast.success("Vérification réussie");
                router.push("/reseller/dashboard");
            } else {
                toast.error(res.error || "Code invalide");
            }
        } catch (error) {
            toast.error("Erreur technique");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6 relative overflow-hidden">
            {/* Background elements */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
                <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-[var(--primary)]/5 blur-[120px] rounded-full"></div>
                <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-[var(--primary)]/5 blur-[120px] rounded-full"></div>
            </div>

            <div className="w-full max-w-[440px] z-10">
                <div className="flex flex-col items-center mb-10">
                    <div className="size-20 rounded-3xl bg-[#161616] border border-[#262626] flex items-center justify-center mb-6 shadow-2xl overflow-hidden group">
                        <div className="size-full bg-gradient-to-br from-[var(--primary)]/10 to-transparent absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <Store className="size-10 text-[var(--primary)]" />
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-tight mb-2">Espace Revendeur</h1>
                    <p className="text-slate-500 font-medium">{shopName} • Business Solution</p>
                </div>

                <Card className="bg-[#161616] border border-[#262626] shadow-2xl rounded-[32px]">
                    <CardBody className="p-8">
                        {!mfaRequired ? (
                            <form onSubmit={handleLogin} className="space-y-6">
                                {/* Honeypot Field */}
                                <div className="absolute opacity-0 -z-50 pointer-events-none h-0 w-0 overflow-hidden">
                                    <input
                                        type="text"
                                        name="website_url"
                                        tabIndex={-1}
                                        autoComplete="off"
                                        value={websiteUrl}
                                        onChange={(e) => setWebsiteUrl(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Email Partenaire</label>
                                        <Input
                                            type="email"
                                            placeholder="votre@email.com"
                                            variant="flat"
                                            classNames={{
                                                inputWrapper: "bg-[#0a0a0a] border border-[#262626] hover:border-[var(--primary)]/50 focus-within:border-[var(--primary)] transition-all h-14 rounded-2xl px-5",
                                                input: "text-base font-medium"
                                            }}
                                            startContent={<Mail className="text-slate-500 size-5 mr-2" />}
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            required
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Code PIN Sécurisé</label>
                                        <Input
                                            type="password"
                                            placeholder="••••"
                                            maxLength={4}
                                            variant="flat"
                                            classNames={{
                                                inputWrapper: "bg-[#0a0a0a] border border-[#262626] hover:border-[var(--primary)]/50 focus-within:border-[var(--primary)] transition-all h-14 rounded-2xl px-5",
                                                input: "text-xl font-black tracking-[0.5em] placeholder:tracking-normal placeholder:text-base placeholder:font-medium"
                                            }}
                                            startContent={<Lock className="text-slate-500 size-5 mr-2" />}
                                            value={pin}
                                            onChange={(e) => setPin(e.target.value)}
                                            required
                                        />
                                    </div>
                                </div>

                                <Button
                                    type="submit"
                                    className="w-full h-14 bg-[var(--primary)] text-white font-black text-base rounded-2xl shadow-xl shadow-orange-950/20 active:scale-[0.98] transition-all"
                                    isLoading={isLoading}
                                    endContent={!isLoading && <ArrowRight className="size-5" />}
                                >
                                    Accéder au portail
                                </Button>

                                <div className="pt-4 flex flex-col gap-4">
                                    <div className="h-px bg-[#262626] w-full"></div>
                                    <div className="flex items-center gap-3 text-[var(--primary)]/80 bg-[var(--primary)]/5 p-4 rounded-2xl border border-[var(--primary)]/10">
                                        <ShieldCheck className="size-5 shrink-0" />
                                        <p className="text-[10px] leading-relaxed font-bold uppercase tracking-wider">
                                            Accès réservé aux partenaires agréés.
                                            Contactez l&apos;administrateur pour créer votre compte.
                                        </p>
                                    </div>
                                </div>
                            </form>
                        ) : (
                            <form onSubmit={handleMfaSubmit} className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="text-center space-y-2">
                                    <div className="size-16 bg-emerald-500/10 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
                                        <ShieldCheck className="text-emerald-500 size-8" />
                                    </div>
                                    <h2 className="text-xl font-black text-white uppercase tracking-widest">Double Sécurité</h2>
                                    <p className="text-xs text-slate-500 font-medium px-4">
                                        Saisissez le code à 6 chiffres de votre application d&apos;authentification.
                                    </p>
                                </div>

                                <Input
                                    type="text"
                                    maxLength={6}
                                    placeholder="000000"
                                    variant="flat"
                                    autoFocus
                                    classNames={{
                                        inputWrapper: "bg-[#0a0a0a] border border-[#262626] hover:border-[var(--primary)]/50 focus-within:border-[var(--primary)] transition-all h-16 rounded-2xl px-5 text-center",
                                        input: "text-2xl font-black tracking-[0.5em] text-[var(--primary)] placeholder:text-slate-700"
                                    }}
                                    value={mfaCode}
                                    onChange={(e) => setMfaCode(e.target.value)}
                                    required
                                />

                                <Button
                                    type="submit"
                                    className="w-full h-14 bg-[var(--primary)] text-white font-black text-base rounded-2xl shadow-xl shadow-orange-950/20 active:scale-[0.98] transition-all"
                                    isLoading={isLoading}
                                    disabled={mfaCode.length !== 6}
                                >
                                    {isLoading ? "Vérification..." : "Valider le code"}
                                </Button>

                                <button
                                    type="button"
                                    onClick={() => setMfaRequired(false)}
                                    className="w-full text-[10px] text-slate-500 hover:text-slate-300 font-bold uppercase tracking-widest transition-colors py-2"
                                >
                                    Retour à la connexion
                                </button>
                            </form>
                        )}
                    </CardBody>
                </Card>

                <p className="text-center mt-8 text-slate-600 text-xs font-semibold uppercase tracking-widest">
                    &copy; {new Date().getFullYear()} {shopName} • ALGERIA
                </p>
            </div>
        </div>
    );
}
