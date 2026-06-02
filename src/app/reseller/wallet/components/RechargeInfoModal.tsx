"use client";

import React from "react";
import {
    Button,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
} from "@heroui/react";
import {
    CreditCard,
    HandCoins,
    Landmark,
    MessageCircle,
    Plus,
} from "lucide-react";

export function RechargeInfoModal({
    isOpen,
    onClose,
    shopName,
    shopTel,
    shopAddress,
}: {
    isOpen: boolean;
    onClose: () => void;
    shopName?: string;
    shopTel?: string;
    shopAddress?: string;
}) {
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="lg"
            classNames={{
                base: "bg-[#0f0d0c] border border-[#2d2622] rounded-[32px]",
                header: "border-b border-[#2d2622]",
                footer: "border-t border-[#2d2622]",
            }}
        >
            <ModalContent>
                {(close) => (
                    <>
                        <ModalHeader>
                            <div className="flex items-center gap-3">
                                <Plus className="text-[var(--primary)]" />
                                <div>
                                    <h2 className="text-xl font-black text-white">
                                        Recharger votre wallet
                                    </h2>
                                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                                        La recharge se fait directement avec {shopName || "l'admin"}.
                                    </p>
                                </div>
                            </div>
                        </ModalHeader>
                        <ModalBody className="space-y-5">
                            <p className="text-sm text-slate-300 leading-relaxed">
                                Pour créditer votre wallet, contactez l&apos;équipe avec le
                                montant souhaité et le moyen de paiement parmi&nbsp;:
                            </p>
                            <ul className="space-y-2">
                                <PaymentRow icon={<HandCoins size={16} />} label="Espèces en boutique" />
                                <PaymentRow icon={<CreditCard size={16} />} label="Carte CIB" />
                                <PaymentRow icon={<CreditCard size={16} />} label="Carte Edahabia" />
                                <PaymentRow icon={<Landmark size={16} />} label="Virement bancaire" />
                            </ul>

                            {(shopTel || shopAddress) && (
                                <div className="pt-4 border-t border-white/5 space-y-2">
                                    <h3 className="text-[10px] uppercase font-black tracking-widest text-slate-500">
                                        Coordonnées
                                    </h3>
                                    {shopTel && (
                                        <div className="bg-[#161616] border border-[#262626] rounded-xl p-3 flex items-center justify-between">
                                            <div>
                                                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">
                                                    Téléphone / WhatsApp
                                                </p>
                                                <p className="text-white font-bold">{shopTel}</p>
                                            </div>
                                            <a
                                                href={`https://wa.me/${shopTel.replace(/\D/g, "")}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 font-bold text-xs px-3 py-2 rounded-lg border border-emerald-500/30 flex items-center gap-1.5"
                                                data-testid="recharge-wa-link"
                                            >
                                                <MessageCircle size={14} />
                                                WhatsApp
                                            </a>
                                        </div>
                                    )}
                                    {shopAddress && (
                                        <div className="bg-[#161616] border border-[#262626] rounded-xl p-3">
                                            <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">
                                                Adresse boutique
                                            </p>
                                            <p className="text-white font-bold text-sm leading-snug">
                                                {shopAddress}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}

                            <p className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 italic">
                                Une fois le paiement reçu, votre wallet sera crédité et vous
                                recevrez une confirmation WhatsApp.
                            </p>
                        </ModalBody>
                        <ModalFooter>
                            <Button onPress={close} className="bg-[var(--primary)] text-white font-black">
                                Compris
                            </Button>
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
}

function PaymentRow({ icon, label }: { icon: React.ReactNode; label: string }) {
    return (
        <li className="flex items-center gap-3 bg-[#161616] border border-[#262626] rounded-xl px-3 py-2">
            <span className="text-[var(--primary)]">{icon}</span>
            <span className="text-sm text-slate-200 font-medium">{label}</span>
        </li>
    );
}
