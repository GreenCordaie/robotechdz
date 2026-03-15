import React, { useState, useEffect } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button } from "@heroui/react";

interface DeliveryMethodModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (method: "TICKET" | "WHATSAPP", phone?: string) => void;
    isSubmitting?: boolean;
}

export default function DeliveryMethodModal({ isOpen, onClose, onConfirm, isSubmitting }: DeliveryMethodModalProps) {
    const [method, setMethod] = useState<"TICKET" | "WHATSAPP">("TICKET");
    const [phone, setPhone] = useState("");
    const [error, setError] = useState("");

    const handleConfirm = () => {
        if (method === "WHATSAPP") {
            if (!phone || phone.length < 8) {
                setError("Veuillez saisir un numéro de téléphone valide");
                return;
            }
        }
        onConfirm(method, method === "WHATSAPP" ? phone : undefined);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="2xl"
            backdrop="blur"
            classNames={{
                base: "bg-white text-slate-900 rounded-[32px] p-0 overflow-hidden",
                wrapper: "z-[100]",
                backdrop: "bg-black/40 backdrop-blur-md"
            }}
            hideCloseButton
        >
            <ModalContent>
                {(onClose) => (
                    <main className="flex flex-col p-8 md:p-12">
                        {/* Header */}
                        <header className="text-center mb-10">
                            <h1 className="text-3xl font-bold text-slate-900 mb-3 tracking-tight">
                                Comment souhaitez-vous récupérer vos codes ?
                            </h1>
                            <p className="text-xl text-slate-500 font-medium">
                                Choisissez votre méthode de réception préférée.
                            </p>
                        </header>

                        {/* Options */}
                        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                            {/* Ticket */}
                            <button
                                onClick={() => setMethod("TICKET")}
                                className={`flex flex-col items-center justify-center p-8 border-2 rounded-3xl transition-all duration-200 hover:shadow-lg active:scale-[0.98] group ${method === "TICKET"
                                        ? "border-[#25D366] bg-[#25D366]/5 ring-2 ring-[#25D366]/20"
                                        : "border-slate-200 bg-white"
                                    }`}
                            >
                                <div className="bg-slate-50 w-20 h-20 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-slate-100">
                                    <span className="material-symbols-rounded text-slate-600 text-5xl">receipt_long</span>
                                </div>
                                <span className="text-2xl font-bold text-slate-900 mb-2">Ticket Imprimé</span>
                                <span className="text-slate-500 text-center leading-tight">Rapide et anonyme à la caisse.</span>
                            </button>

                            {/* WhatsApp */}
                            <button
                                onClick={() => setMethod("WHATSAPP")}
                                className={`flex flex-col items-center justify-center p-8 border-2 rounded-3xl transition-all duration-200 hover:shadow-lg active:scale-[0.98] group ${method === "WHATSAPP"
                                        ? "border-[#25D366] bg-[#25D366]/5 ring-2 ring-[#25D366]/20"
                                        : "border-slate-200 bg-white"
                                    }`}
                            >
                                <div className="bg-white w-20 h-20 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
                                    <svg className="w-12 h-12 text-[#25D366]" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.438 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"></path>
                                    </svg>
                                </div>
                                <span className="text-2xl font-bold text-slate-900 mb-2">Message WhatsApp</span>
                                <span className="text-slate-500 text-center leading-tight">Recevez vos codes directement sur votre téléphone.</span>
                            </button>
                        </section>

                        {/* Input WhatsApp Number */}
                        {method === "WHATSAPP" && (
                            <section className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 flex items-center pl-6 pointer-events-none">
                                        <span className="text-2xl font-semibold text-slate-400">+213</span>
                                        <div className="h-8 w-[1px] bg-slate-200 ml-4"></div>
                                    </div>
                                    <input
                                        type="tel"
                                        value={phone}
                                        onChange={(e) => {
                                            setPhone(e.target.value);
                                            if (error) setError("");
                                        }}
                                        className={`block w-full h-20 pl-28 pr-6 text-2xl font-medium tracking-widest bg-slate-50 border-2 rounded-2xl focus:ring-4 transition-all placeholder:text-slate-300 ${error ? "border-red-500 focus:ring-red-500/20" : "border-slate-200 focus:ring-[#25D366]/20 focus:border-[#25D366]"
                                            }`}
                                        placeholder="00 00 00 00"
                                        autoFocus
                                    />
                                </div>
                                {error && <p className="text-red-500 font-medium text-center">{error}</p>}
                            </section>
                        )}

                        {/* Confirmation Button */}
                        <div className="mt-10">
                            <button
                                onClick={handleConfirm}
                                disabled={isSubmitting}
                                className="w-full h-20 bg-[#25D366] text-white rounded-full text-2xl font-bold shadow-lg shadow-[#25D366]/30 hover:bg-[#22c35e] active:scale-[0.98] transition-all flex items-center justify-center space-x-3 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <span>{isSubmitting ? "Création en cours..." : method === "WHATSAPP" ? "Confirmer mon numéro" : "Confirmer la commande"}</span>
                                {!isSubmitting && <span className="material-symbols-rounded text-3xl">chevron_right</span>}
                            </button>
                        </div>

                        {/* Footer */}
                        <footer className="mt-8 text-center">
                            <button
                                onClick={onClose}
                                className="text-slate-400 font-semibold text-lg hover:text-slate-600 transition-colors py-2 px-4 rounded-xl"
                            >
                                Annuler et revenir
                            </button>
                        </footer>
                    </main>
                )}
            </ModalContent>
        </Modal>
    );
}
