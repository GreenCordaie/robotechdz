"use client";

import React, { useState } from "react";
import {
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Button,
    Input
} from "@heroui/react";
import {
    X,
    Building2,
    Phone,
    Mail,
    User,
    Percent,
    KeyRound,
    UserPlus
} from "lucide-react";
import { createResellerAction } from "@/app/admin/settings/actions";
import toast from "react-hot-toast";

interface AddResellerModalProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    onSuccess: () => void;
}

export const AddResellerModal = ({ isOpen, onOpenChange, onSuccess }: AddResellerModalProps) => {
    const [companyName, setCompanyName] = useState("");
    const [contactPhone, setContactPhone] = useState("");
    const [email, setEmail] = useState("");
    const [fullName, setFullName] = useState("");
    const [pinCode, setPinCode] = useState("");
    const [customDiscount, setCustomDiscount] = useState("5.00");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        const result = await createResellerAction({
            companyName,
            contactPhone,
            email,
            nom: fullName,
            pinCode,
            customDiscount
        });

        if (result.success) {
            toast.success(`Revendeur ${companyName} créé avec succès`);
            onSuccess();
            onOpenChange(false);
            // Reset
            setCompanyName("");
            setContactPhone("");
            setEmail("");
            setFullName("");
            setPinCode("");
        } else {
            setError(result.error || "Une erreur est survenue");
        }
        setIsLoading(false);
    };

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={onOpenChange}
            size="3xl"
            classNames={{
                base: "bg-[#161616] border border-[#262626] rounded-[24px]",
                header: "border-b border-[#262626] p-6",
                body: "p-6",
                footer: "border-t border-[#262626] p-6",
            }}
            backdrop="blur"
        >
            <ModalContent>
                {(onClose) => (
                    <>
                        <ModalHeader className="flex flex-col gap-1">
                            <h2 className="text-xl font-bold text-slate-100">Nouveau Partenaire Revendeur</h2>
                            <p className="text-sm text-slate-400 font-normal">Créez un compte B2B avec accès privilégié.</p>
                            {error && (
                                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm font-medium">
                                    {error}
                                </div>
                            )}
                        </ModalHeader>
                        <form onSubmit={handleSubmit}>
                            <ModalBody className="gap-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-400">Nom de l'entreprise</label>
                                        <div className="relative">
                                            <Input
                                                variant="flat"
                                                placeholder="Ex: Tech Solutions DZ"
                                                value={companyName}
                                                onChange={(e) => setCompanyName(e.target.value)}
                                                startContent={<Building2 className="size-4 text-slate-500" />}
                                                required
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-400">Téléphone Contact</label>
                                        <Input
                                            variant="flat"
                                            placeholder="05..."
                                            value={contactPhone}
                                            onChange={(e) => setContactPhone(e.target.value)}
                                            startContent={<Phone className="size-4 text-slate-500" />}
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-white/5">
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-400">Nom du gestionnaire</label>
                                        <Input
                                            variant="flat"
                                            placeholder="Nom complet"
                                            value={fullName}
                                            onChange={(e) => setFullName(e.target.value)}
                                            startContent={<User className="size-4 text-slate-500" />}
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-400">Email (Connexion)</label>
                                        <Input
                                            variant="flat"
                                            type="email"
                                            placeholder="email@partenaire.com"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            startContent={<Mail className="size-4 text-slate-500" />}
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-white/5">
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-400">Code PIN (4 chiffres)</label>
                                        <Input
                                            variant="flat"
                                            maxLength={4}
                                            placeholder="0000"
                                            value={pinCode}
                                            onChange={(e) => setPinCode(e.target.value)}
                                            startContent={<KeyRound className="size-4 text-slate-500" />}
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-400">Remise personnalisée (%)</label>
                                        <Input
                                            variant="flat"
                                            type="number"
                                            step="0.01"
                                            value={customDiscount}
                                            onChange={(e) => setCustomDiscount(e.target.value)}
                                            startContent={<Percent className="size-4 text-slate-500" />}
                                            required
                                        />
                                    </div>
                                </div>
                            </ModalBody>
                            <ModalFooter>
                                <Button variant="light" onPress={onClose} className="text-slate-400">
                                    Annuler
                                </Button>
                                <Button
                                    className="bg-[#ec5b13] text-white font-bold rounded-xl shadow-lg shadow-orange-900/20"
                                    type="submit"
                                    isLoading={isLoading}
                                    startContent={!isLoading && <UserPlus className="size-4" />}
                                >
                                    Créer le partenaire
                                </Button>
                            </ModalFooter>
                        </form>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
};
