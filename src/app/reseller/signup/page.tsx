"use client";

import React, { useState } from "react";
import { Card, Input, Textarea, Button, Spinner } from "@heroui/react";
import { Building2, Mail, Phone, FileText, Send, CheckCircle2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { toast } from "react-hot-toast";
import { createSignupRequestAction } from "./actions";

export default function ResellerSignupPage() {
    const [email, setEmail] = useState("");
    const [companyName, setCompanyName] = useState("");
    const [contactPhone, setContactPhone] = useState("");
    const [nif, setNif] = useState("");
    const [rcNumber, setRcNumber] = useState("");
    const [message, setMessage] = useState("");
    const [websiteUrl, setWebsiteUrl] = useState(""); // honeypot

    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;
        setSubmitting(true);

        try {
            const res = await createSignupRequestAction({
                email,
                companyName,
                contactPhone,
                nif: nif || undefined,
                rcNumber: rcNumber || undefined,
                message: message || undefined,
                websiteUrl,
            });
            if (res.success) {
                setSubmitted(true);
            } else {
                toast.error(res.error || "Échec de l'envoi");
            }
        } catch {
            toast.error("Erreur réseau");
        } finally {
            setSubmitting(false);
        }
    };

    if (submitted) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
                <Card className="bg-[#161616] border border-[#262626] rounded-[32px] p-10 max-w-lg w-full text-center space-y-6">
                    <div
                        className="size-20 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto"
                        data-testid="signup-success"
                    >
                        <CheckCircle2 className="text-emerald-500" size={40} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-white">Demande envoyée</h1>
                        <p className="text-slate-500 mt-2 text-sm leading-relaxed">
                            Notre équipe revient vers vous sous 24-48h pour valider votre compte
                            partenaire. Vous recevrez les identifiants par email à{" "}
                            <strong className="text-white">{email}</strong>.
                        </p>
                    </div>
                    <Link
                        href="/b2b"
                        className="inline-flex items-center gap-2 text-[var(--primary)] font-bold text-sm hover:underline"
                    >
                        <ArrowLeft size={14} /> Retour à la page B2B
                    </Link>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4 py-12">
            <Card className="bg-[#161616] border border-[#262626] rounded-[32px] p-8 md:p-10 max-w-2xl w-full space-y-8">
                <header>
                    <h1 className="text-3xl font-black text-white tracking-tight">
                        Devenir partenaire B2B
                    </h1>
                    <p className="text-sm text-slate-500 font-medium mt-2">
                        Remplissez ce formulaire pour demander un accès grossiste à notre catalogue.
                        Notre équipe valide chaque demande sous 24-48h.
                    </p>
                </header>

                <form onSubmit={onSubmit} className="space-y-5" noValidate>
                    {/* Honeypot — caché aux humains, rempli par bots */}
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

                    <Input
                        type="email"
                        label="Email professionnel"
                        placeholder="contact@votre-entreprise.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        startContent={<Mail size={16} className="text-slate-500" />}
                        variant="flat"
                        isRequired
                        data-testid="signup-email"
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <Input
                            label="Raison sociale"
                            placeholder="ACME SARL"
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                            startContent={<Building2 size={16} className="text-slate-500" />}
                            variant="flat"
                            isRequired
                            data-testid="signup-company"
                        />
                        <Input
                            type="tel"
                            label="Téléphone WhatsApp"
                            placeholder="+213 555 000 000"
                            value={contactPhone}
                            onChange={(e) => setContactPhone(e.target.value)}
                            startContent={<Phone size={16} className="text-slate-500" />}
                            variant="flat"
                            isRequired
                            data-testid="signup-phone"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <Input
                            label="NIF (optionnel)"
                            placeholder="000099000000000"
                            value={nif}
                            onChange={(e) => setNif(e.target.value)}
                            startContent={<FileText size={16} className="text-slate-500" />}
                            variant="flat"
                        />
                        <Input
                            label="N° RC (optionnel)"
                            placeholder="00 B 0123456"
                            value={rcNumber}
                            onChange={(e) => setRcNumber(e.target.value)}
                            startContent={<FileText size={16} className="text-slate-500" />}
                            variant="flat"
                        />
                    </div>

                    <Textarea
                        label="Message (optionnel)"
                        placeholder="Décrivez brièvement votre activité, votre volume estimé, vos canaux de vente..."
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        variant="flat"
                        maxLength={500}
                        description={`${message.length}/500`}
                    />

                    <div className="flex flex-col-reverse md:flex-row md:justify-between md:items-center gap-3 pt-2">
                        <Link
                            href="/b2b"
                            className="text-sm text-slate-500 hover:text-white font-bold flex items-center gap-2"
                        >
                            <ArrowLeft size={14} /> Annuler
                        </Link>
                        <Button
                            type="submit"
                            isLoading={submitting}
                            disabled={submitting}
                            className="bg-[var(--primary)] text-white font-black h-14 rounded-2xl shadow-xl shadow-orange-950/20 px-8"
                            endContent={!submitting && <Send size={16} />}
                            data-testid="signup-submit"
                        >
                            {submitting ? <Spinner size="sm" color="white" /> : "Envoyer ma demande"}
                        </Button>
                    </div>

                    <p className="text-[10px] text-slate-600 italic font-medium pt-4 border-t border-white/5">
                        En soumettant ce formulaire vous acceptez d&apos;être contacté par notre équipe partenaires.
                        Vos informations restent strictement internes et ne sont jamais partagées.
                    </p>
                </form>
            </Card>
        </div>
    );
}
