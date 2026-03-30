"use client";

import React, { useState } from "react";
import { Eye, EyeOff, Package, ShieldCheck } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useRouter } from "next/navigation";
import { loginAction, verifyMfaAction } from "./actions";
import { useSettingsStore } from "@/store/useSettingsStore";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [websiteUrl, setWebsiteUrl] = useState(""); // Honeypot
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [mfaRequired, setMfaRequired] = useState(false);
    const [tempUserId, setTempUserId] = useState<number | null>(null);
    const [mfaCode, setMfaCode] = useState("");

    const setUser = useAuthStore((state) => state.setUser);
    const router = useRouter();
    const { shopName } = useSettingsStore();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        const formData = new FormData();
        formData.append("email", email);
        formData.append("password", password);
        formData.append("website_url", websiteUrl);

        try {
            const result = await loginAction(formData);
            if (!result.success) {
                setError(result.error || "Identifiants invalides");
                setIsLoading(false);
            } else if (result.mfaRequired) {
                setMfaRequired(true);
                setTempUserId(result.tempUserId!);
                setIsLoading(false);
            } else {
                if (result.user) {
                    setUser(result.user as any);
                }
                router.push("/admin");
            }
        } catch (err: any) {
            setError("Une erreur est survenue");
            setIsLoading(false);
        }
    };

    const handleMfaSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!tempUserId) return;
        setIsLoading(true);
        setError(null);

        try {
            const result = await verifyMfaAction(tempUserId, mfaCode);
            if (result.success) {
                if (result.user) setUser(result.user as any);
                router.push("/admin");
            } else {
                setError(result.error || "Code invalide");
                setIsLoading(false);
            }
        } catch (err) {
            setError("Erreur de validation");
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-[#0a0a0a] text-slate-100 min-h-screen flex items-center justify-center p-4 selection:bg-[var(--primary)]/30">
            {/* BEGIN: Login Container */}
            <main className="w-full max-w-md">
                {/* BEGIN: Central Card */}
                <div className="bg-[#161616] border border-[#262626] rounded-[24px] p-8 shadow-2xl shadow-black/50 overflow-hidden relative">
                    {/* Decorative accent */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[var(--primary)]/50 to-transparent"></div>

                    {/* BEGIN: Header Section */}
                    <div className="flex flex-col items-center mb-8">
                        {/* Logo Icon */}
                        <div className="w-16 h-16 bg-[var(--primary)]/10 rounded-full flex items-center justify-center mb-4 ring-1 ring-[var(--primary)]/20">
                            <svg className="h-8 w-8 text-[var(--primary)]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" strokeLinecap="round" strokeLinejoin="round"></path>
                            </svg>
                        </div>
                        <h1 className="text-2xl font-bold text-white text-center tracking-tight">Bienvenue sur {shopName}</h1>
                        <p className="text-sm text-slate-400 text-center mt-2 font-medium">Connectez-vous à votre espace administrateur</p>
                    </div>
                    {/* END: Header Section */}

                    {/* BEGIN: LoginForm */}
                    {!mfaRequired ? (
                        <form onSubmit={handleSubmit} className="space-y-5">
                            {/* Honeypot Field (Visualy hidden) */}
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

                            {/* Email Field */}
                            <div className="flex flex-col">
                                <label className="text-sm font-medium text-slate-400 mb-2 ml-1" htmlFor="email">Adresse Email</label>
                                <input
                                    className="w-full bg-[#0a0a0a] border-[#262626] rounded-xl p-4 text-white focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/10 transition-all placeholder:text-slate-600 outline-none"
                                    id="email"
                                    name="email"
                                    placeholder="admin@flexbox.dz"
                                    required
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>

                            {/* Password Field */}
                            <div className="flex flex-col relative">
                                <label className="text-sm font-medium text-slate-400 mb-2 ml-1" htmlFor="password">Mot de passe</label>
                                <div className="relative">
                                    <input
                                        className="w-full bg-[#0a0a0a] border-[#262626] rounded-xl p-4 text-white focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/10 transition-all placeholder:text-slate-600 pr-12 outline-none"
                                        id="password"
                                        name="password"
                                        placeholder="••••••••"
                                        required
                                        type={showPassword ? "text" : "password"}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                    />
                                    {/* Password Visibility Toggle */}
                                    <button
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors p-1"
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                    >
                                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                    </button>
                                </div>
                            </div>

                            {/* Options Section */}
                            <div className="flex items-center justify-between mt-2 px-1">
                                <div className="flex items-center">
                                    <input
                                        className="h-4 w-4 rounded border-[#262626] bg-[#0a0a0a] text-[var(--primary)] focus:ring-[var(--primary)] focus:ring-offset-0 transition-all cursor-pointer"
                                        id="remember-me"
                                        name="remember-me"
                                        type="checkbox"
                                    />
                                    <label className="ml-2 block text-sm text-slate-400 cursor-pointer hover:text-slate-300 transition-colors" htmlFor="remember-me">Se souvenir de moi</label>
                                </div>
                                <div className="text-sm font-semibold">
                                    <a className="text-[var(--primary)] hover:text-[#ff742d] transition-colors" href="#">Mot de passe oublié ?</a>
                                </div>
                            </div>

                            {error && <p className="text-red-500 text-xs text-center font-bold">{error}</p>}

                            {/* Submit Button */}
                            <button
                                className={`w-full flex justify-center py-4 px-4 border border-transparent rounded-xl shadow-lg text-base font-bold text-white bg-[var(--primary)] hover:bg-[#ff742d] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#161616] focus:ring-[var(--primary)] transition-all duration-200 mt-4 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${isLoading ? "animate-pulse" : ""}`}
                                type="submit"
                                disabled={isLoading}
                            >
                                {isLoading ? "Connexion en cours..." : "Se Connecter"}
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={handleMfaSubmit} className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="text-center space-y-2">
                                <div className="size-12 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
                                    <ShieldCheck className="text-emerald-500 size-6" />
                                </div>
                                <h2 className="text-lg font-bold text-white uppercase tracking-widest">Vérification 2FA</h2>
                                <p className="text-xs text-slate-400">Entrez le code généré par votre application d&apos;authentification.</p>
                            </div>

                            <div className="flex flex-col">
                                <input
                                    className="w-full bg-[#0a0a0a] border-[#262626] rounded-xl p-4 text-center font-mono text-2xl tracking-[0.5em] text-[var(--primary)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/10 transition-all outline-none"
                                    type="text"
                                    maxLength={6}
                                    placeholder="000000"
                                    required
                                    autoFocus
                                    value={mfaCode}
                                    onChange={(e) => setMfaCode(e.target.value)}
                                />
                            </div>

                            {error && <p className="text-red-500 text-xs text-center font-bold">{error}</p>}

                            <button
                                className={`w-full flex justify-center py-4 px-4 border border-transparent rounded-xl shadow-lg text-base font-bold text-white bg-[var(--primary)] hover:bg-[#ff742d] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#161616] focus:ring-[var(--primary)] transition-all duration-200 disabled:opacity-50 ${isLoading ? "animate-pulse" : ""}`}
                                type="submit"
                                disabled={isLoading || mfaCode.length !== 6}
                            >
                                {isLoading ? "Vérification..." : "Vérifier le code"}
                            </button>

                            <button
                                type="button"
                                onClick={() => setMfaRequired(false)}
                                className="w-full text-[10px] text-slate-500 hover:text-slate-300 font-bold uppercase tracking-widest transition-colors"
                            >
                                Retour à la connexion
                            </button>
                        </form>
                    )}
                    {/* END: LoginForm */}
                </div>
                {/* END: Central Card */}

                {/* Footer Copyright or Additional Links */}
                <p className="mt-8 text-center text-xs text-slate-500 uppercase tracking-widest font-semibold opacity-70">
                    © {new Date().getFullYear()} {shopName} — Espace Administrateur
                </p>
            </main>
            {/* END: Login Container */}
        </div>
    );
}
