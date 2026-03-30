"use client";

import React, { useState } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Input, Textarea } from "@heroui/react";
import { HelpCircle, Send, X, CheckCircle2 } from "lucide-react";
import { createSupportTicket } from "../actions";
import { toast } from "react-hot-toast";

interface SupportModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function SupportModal({ isOpen, onClose }: SupportModalProps) {
    const [orderNumber, setOrderNumber] = useState("");
    const [message, setMessage] = useState("");
    const [customerPhone, setCustomerPhone] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    const handleSubmit = async () => {
        if (!orderNumber || !message || !customerPhone) {
            toast.error("Veuillez remplir tous les champs.");
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await createSupportTicket({
                orderNumber: orderNumber.trim(),
                message: message.trim(),
                customerPhone: customerPhone.trim()
            });

            if (res.success) {
                setShowSuccess(true);
                setTimeout(() => {
                    handleClose();
                }, 3000);
            } else {
                toast.error(res.error || "Erreur lors de l'envoi.");
            }
        } catch (error) {
            toast.error("Une erreur inattendue est survenue.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        setOrderNumber("");
        setMessage("");
        setCustomerPhone("");
        setShowSuccess(false);
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            size="lg"
            backdrop="blur"
            classNames={{
                base: "bg-[#111111]/90 backdrop-blur-2xl border border-[#262626] rounded-[24px] shadow-2xl p-1.5",
                header: "border-b border-white/5 pb-3",
                body: "py-4",
                footer: "border-t border-white/5 pt-3",
                closeButton: "hover:bg-white/5 active:scale-95 transition-all text-slate-400 m-3"
            }}
        >
            <ModalContent>
                {() => (
                    <>
                        <ModalHeader className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-[var(--primary)]/10 rounded-xl flex items-center justify-center border border-[var(--primary)]/20">
                                <HelpCircle className="text-[var(--primary)] w-5 h-5" />
                            </div>
                            <div className="flex flex-col">
                                <h3 className="text-white text-lg font-black uppercase tracking-tight">Support Client</h3>
                                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Uniquement avec ticket</p>
                            </div>
                        </ModalHeader>
                        <ModalBody className="space-y-4">
                            {showSuccess ? (
                                <div className="flex flex-col items-center justify-center py-8 text-center animate-in fade-in zoom-in duration-300">
                                    <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mb-4 border border-emerald-500/20">
                                        <CheckCircle2 className="text-emerald-500 w-8 h-8" />
                                    </div>
                                    <h4 className="text-white text-xl font-black uppercase tracking-tight mb-2">Message Envoyé</h4>
                                    <p className="text-slate-400 text-sm font-bold max-w-sm">
                                        Votre demande a été transmise à la caisse. Un caissier vous assistera dans quelques instants.
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Numéro de Commande (Ex: #C12)</label>
                                        <Input
                                            placeholder="Entrez le numéro sur votre ticket"
                                            value={orderNumber}
                                            onChange={(e) => setOrderNumber(e.target.value)}
                                            variant="bordered"
                                            classNames={{
                                                inputWrapper: "h-10 bg-white/5 border-[#262626] group-data-[focus=true]:border-[var(--primary)] rounded-xl transition-all",
                                                input: "text-white font-black placeholder:text-slate-600 text-sm"
                                            }}
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Numéro de Téléphone (WhatsApp)</label>
                                        <Input
                                            placeholder="Ex: 0550 00 00 00"
                                            value={customerPhone}
                                            onChange={(e) => setCustomerPhone(e.target.value)}
                                            variant="bordered"
                                            classNames={{
                                                inputWrapper: "h-10 bg-white/5 border-[#262626] group-data-[focus=true]:border-[var(--primary)] rounded-xl transition-all",
                                                input: "text-white font-black placeholder:text-slate-600 text-sm"
                                            }}
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Quel est votre problème ?</label>
                                        <Textarea
                                            placeholder="Expliquez brièvement votre demande..."
                                            value={message}
                                            onChange={(e) => setMessage(e.target.value)}
                                            variant="bordered"
                                            minRows={3}
                                            classNames={{
                                                inputWrapper: "bg-white/5 border-[#262626] group-data-[focus=true]:border-[var(--primary)] rounded-xl transition-all",
                                                input: "text-white font-bold placeholder:text-slate-600 text-sm"
                                            }}
                                        />
                                    </div>
                                </>
                            )}
                        </ModalBody>
                        {!showSuccess && (
                            <ModalFooter>
                                <Button
                                    variant="light"
                                    onPress={handleClose}
                                    className="font-black text-slate-400 uppercase tracking-widest text-[10px] h-10 px-4"
                                >
                                    Annuler
                                </Button>
                                <Button
                                    className="bg-white text-black hover:bg-[var(--primary)] hover:text-white font-black uppercase tracking-widest text-[10px] h-10 px-6 rounded-xl shadow-xl transition-all active:scale-95"
                                    onPress={handleSubmit}
                                    isLoading={isSubmitting}
                                    endContent={!isSubmitting && <Send size={14} />}
                                >
                                    Envoyer le ticket
                                </Button>
                            </ModalFooter>
                        )}
                    </>
                )}
            </ModalContent>
        </Modal>
    );
}
