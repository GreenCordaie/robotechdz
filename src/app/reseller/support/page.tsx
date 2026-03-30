"use client";

import React from "react";
import {
    Card,
    CardBody,
    Button,
    Input,
    Textarea,
    Accordion,
    AccordionItem
} from "@heroui/react";
import {
    MessageSquare,
    Send,
    FileText,
    Phone,
    Clock,
    HelpCircle,
    BadgeCheck
} from "lucide-react";
import { toast } from "react-hot-toast";

export default function ResellerSupport() {
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        toast.success("Votre message a été envoyé à l'équipe support B2B.");
    };

    const faqs = [
        {
            q: "Comment recharger mon crédit ?",
            a: "Contactez votre gestionnaire de compte ou envoyez un virement. Une fois validé, votre solde sera mis à jour instantanément."
        },
        {
            q: "Puis-je obtenir une remise plus élevée ?",
            a: "Oui, les remises sont basées sur votre volume mensuel. Atteignez 200,000 DZD pour passer au niveau GOLD (7%)."
        },
        {
            q: "Comment recevoir mes codes ?",
            a: "Les codes sont disponibles immédiatement après paiement dans l'historique de vos commandes."
        }
    ];

    return (
        <div className="space-y-10 animate-in fade-in duration-500 max-w-5xl mx-auto">
            <div className="text-center space-y-4">
                <div className="size-20 rounded-[32px] bg-[var(--primary)]/10 border border-[var(--primary)]/20 flex items-center justify-center mx-auto shadow-2xl">
                    <MessageSquare className="text-[var(--primary)] size-10" />
                </div>
                <h1 className="text-4xl font-black text-white tracking-tight">Centre d&apos;Assistance Partenaire</h1>
                <p className="text-slate-500 font-medium max-w-xl mx-auto leading-relaxed">
                    Besoin d&apos;aide avec une commande ou une recharge ? Notre équipe dédiée aux revendeurs est à votre écoute.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <Card className="bg-[#161616] border border-[#262626] rounded-[28px] p-2 hover:border-[var(--primary)]/30 transition-all group">
                    <CardBody className="p-6 space-y-6 text-center">
                        <div className="size-12 rounded-xl bg-[#0a0a0a] flex items-center justify-center mx-auto text-[var(--primary)]">
                            <Phone size={24} />
                        </div>
                        <div>
                            <h3 className="font-bold text-white mb-1">Ligne Prioritaire</h3>
                            <p className="text-xs text-slate-500 font-medium tracking-wide">0555 12 34 56</p>
                        </div>
                    </CardBody>
                </Card>

                <Card className="bg-[#161616] border border-[#262626] rounded-[28px] p-2 hover:border-[var(--primary)]/30 transition-all group">
                    <CardBody className="p-6 space-y-6 text-center">
                        <div className="size-12 rounded-xl bg-[#0a0a0a] flex items-center justify-center mx-auto text-[var(--primary)]">
                            <Clock size={24} />
                        </div>
                        <div>
                            <h3 className="font-bold text-white mb-1">Disponibilité</h3>
                            <p className="text-xs text-slate-500 font-medium tracking-wide">7j/7 • 09:00 - 22:00</p>
                        </div>
                    </CardBody>
                </Card>

                <Card className="bg-[#161616] border border-[#262626] rounded-[28px] p-2 hover:border-[var(--primary)]/30 transition-all group">
                    <CardBody className="p-6 space-y-6 text-center">
                        <div className="size-12 rounded-xl bg-[#0a0a0a] flex items-center justify-center mx-auto text-[var(--primary)]">
                            <BadgeCheck size={24} />
                        </div>
                        <div>
                            <h3 className="font-bold text-white mb-1">Support Dédié</h3>
                            <p className="text-xs text-slate-500 font-medium tracking-wide">Gestionnaire Attitré</p>
                        </div>
                    </CardBody>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 pt-10">
                {/* Contact Form */}
                <div className="space-y-8">
                    <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
                        <Send size={24} className="text-[var(--primary)]" />
                        Envoyer un Ticket
                    </h2>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <Input
                                label="Objet"
                                variant="bordered"
                                classNames={{ inputWrapper: "bg-[#161616] border-[#262626] rounded-2xl h-14" }}
                            />
                            <Input
                                label="N° Commande (Optionnel)"
                                variant="bordered"
                                classNames={{ inputWrapper: "bg-[#161616] border-[#262626] rounded-2xl h-14" }}
                            />
                        </div>
                        <Textarea
                            label="Votre message"
                            variant="bordered"
                            minRows={6}
                            classNames={{ inputWrapper: "bg-[#161616] border-[#262626] rounded-2xl" }}
                        />
                        <Button
                            type="submit"
                            className="w-full bg-[var(--primary)] text-white font-black h-14 rounded-2xl shadow-xl shadow-orange-950/20"
                        >
                            Soumettre le Ticket
                        </Button>
                    </form>
                </div>

                {/* FAQ Style Accordion */}
                <div className="space-y-8">
                    <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
                        <HelpCircle size={24} className="text-[var(--primary)]" />
                        Questions Fréquentes
                    </h2>

                    <Accordion
                        variant="splitted"
                        className="p-0 gap-4"
                        itemClasses={{
                            base: "bg-[#161616] border border-[#262626] rounded-[24px] px-4",
                            title: "text-white font-bold text-sm",
                            content: "text-slate-400 text-sm leading-relaxed pb-6",
                            trigger: "py-6"
                        }}
                    >
                        {faqs.map((faq, i) => (
                            <AccordionItem key={i} aria-label={faq.q} title={faq.q}>
                                {faq.a}
                            </AccordionItem>
                        ))}
                    </Accordion>

                    <div className="p-8 rounded-[32px] bg-emerald-500/5 border border-emerald-500/10 flex items-start gap-5">
                        <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-500">
                            <FileText size={24} />
                        </div>
                        <div>
                            <h4 className="font-bold text-white mb-2 underline decoraton-emerald-500/30">Guide d&apos;utilisation</h4>
                            <p className="text-sm text-slate-500 font-medium leading-relaxed">
                                Consultez notre documentation complète sur le fonctionnement de l&apos;API revendeur et les paliers de remises.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
