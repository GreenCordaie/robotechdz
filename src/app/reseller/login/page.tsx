"use client";

import React, { useState } from "react";
import { Button, Input, Card, CardBody } from "@heroui/react";
import { Lock, Mail, ArrowRight, ShieldCheck, Store } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { loginResellerAction } from "./actions";

export default function ResellerLoginPage() {
    const [email, setEmail] = useState("");
    const [pin, setPin] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const res = await loginResellerAction(email, pin);
            if (res.success) {
                toast.success("Bienvenue sur votre portail partenaire");
                router.push("/reseller/dashboard");
            } else {
                toast.error(res.error || "Identifiants invalides");
            }
        } catch (error) {
            toast.error("Erreur de connexion au serveur");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6 relative overflow-hidden">
            {/* Background elements */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
                <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#ec5b13]/5 blur-[120px] rounded-full"></div>
                <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#ec5b13]/5 blur-[120px] rounded-full"></div>
            </div>

            <div className="w-full max-w-[440px] z-10">
                <div className="flex flex-col items-center mb-10">
                    <div className="size-20 rounded-3xl bg-[#161616] border border-[#262626] flex items-center justify-center mb-6 shadow-2xl overflow-hidden group">
                        <div className="size-full bg-gradient-to-br from-[#ec5b13]/10 to-transparent absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <Store className="size-10 text-[#ec5b13]" />
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-tight mb-2">Espace Revendeur</h1>
                    <p className="text-slate-500 font-medium">FLEXBOX DIRECT • Business Solution</p>
                </div>

                <Card className="bg-[#161616] border border-[#262626] shadow-2xl rounded-[32px]">
                    <CardBody className="p-8">
                        <form onSubmit={handleLogin} className="space-y-6">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Email Partenaire</label>
                                    <Input
                                        type="email"
                                        placeholder="votre@email.com"
                                        variant="flat"
                                        classNames={{
                                            inputWrapper: "bg-[#0a0a0a] border border-[#262626] hover:border-[#ec5b13]/50 focus-within:border-[#ec5b13] transition-all h-14 rounded-2xl px-5",
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
                                            inputWrapper: "bg-[#0a0a0a] border border-[#262626] hover:border-[#ec5b13]/50 focus-within:border-[#ec5b13] transition-all h-14 rounded-2xl px-5",
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
                                className="w-full h-14 bg-[#ec5b13] text-white font-black text-base rounded-2xl shadow-xl shadow-orange-950/20 active:scale-[0.98] transition-all"
                                isLoading={isLoading}
                                endContent={!isLoading && <ArrowRight className="size-5" />}
                            >
                                Accéder au portail
                            </Button>

                            <div className="pt-4 flex flex-col gap-4">
                                <div className="h-px bg-[#262626] w-full"></div>
                                <div className="flex items-center gap-3 text-[#ec5b13]/80 bg-[#ec5b13]/5 p-4 rounded-2xl border border-[#ec5b13]/10">
                                    <ShieldCheck className="size-5 shrink-0" />
                                    <p className="text-[10px] leading-relaxed font-bold uppercase tracking-wider">
                                        Accès réservé aux partenaires agréés.
                                        Contactez l&apos;administrateur pour créer votre compte.
                                    </p>
                                </div>
                            </div>
                        </form>
                    </CardBody>
                </Card>

                <p className="text-center mt-8 text-slate-600 text-xs font-semibold uppercase tracking-widest">
                    &copy; 2026 FLEXBOX DIRECT • ALGERIA
                </p>
            </div>
        </div>
    );
}
