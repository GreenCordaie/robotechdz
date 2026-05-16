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
    Lock,
    Store,
    Package,
    ShieldCheck,
    UserPlus,
    Grid3X3 as Keypad,
    Camera
} from "lucide-react";
import { uploadImage } from "@/app/admin/actions/upload";
import toast from "react-hot-toast";
import Image from "next/image";

interface AddMemberModalProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
}

type Role = "cashier" | "traiteur" | "admin";

import { addUserAction } from "@/app/admin/settings/actions";

export const AddMemberModal = ({ isOpen, onOpenChange }: AddMemberModalProps) => {
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [pinCode, setPinCode] = useState("");
    const [role, setRole] = useState<Role>("cashier");
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const [error, setError] = useState<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        setIsLoading(true);
        setError(null);

        let finalAvatarUrl = avatarUrl;
        if (selectedFile) {
            const formData = new FormData();
            formData.append("file", selectedFile);
            const uploadRes = await uploadImage(formData);
            if (uploadRes.success && uploadRes.url) {
                finalAvatarUrl = uploadRes.url;
            } else {
                setError("Échec de l'upload de l'avatar: " + (uploadRes.error || "Erreur inconnue"));
                setIsLoading(false);
                return;
            }
        }

        const result = await addUserAction({
            nom: fullName,
            email,
            password, // will be hashed on server
            pinCode,
            role: role.toUpperCase() as "ADMIN" | "CAISSIER" | "TRAITEUR",
            avatarUrl: finalAvatarUrl
        } as any);

        if (result.success) {
            setIsLoading(false);
            onOpenChange(false);
            toast.success(`${fullName} ajouté à l&apos;équipe`);
            // Reset form
            setFullName("");
            setEmail("");
            setPassword("");
            setPinCode("");
            setRole("cashier");
            setSelectedFile(null);
            setPreviewUrl(null);
        } else {
            setError(result.error || "Une erreur est survenue");
            setIsLoading(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={onOpenChange}
            size="4xl"
            classNames={{
                base: "bg-[#161616] border border-[#262626] rounded-[24px]",
                header: "border-b border-[#262626] p-6",
                body: "p-6",
                footer: "border-t border-[#262626] p-6",
                closeButton: "hover:bg-[#262626] active:bg-[#262626]/50 transition-colors top-4 right-4"
            }}
            backdrop="blur"
            motionProps={{
                variants: {
                    enter: {
                        y: 0,
                        opacity: 1,
                        transition: {
                            duration: 0.3,
                            ease: "easeOut",
                        },
                    },
                    exit: {
                        y: 20,
                        opacity: 0,
                        transition: {
                            duration: 0.2,
                            ease: "easeIn",
                        },
                    },
                }
            }}
        >
            <ModalContent>
                {(onClose) => (
                    <>
                        <ModalHeader className="flex flex-col gap-1">
                            <h2 className="text-xl font-bold text-slate-100">Nouveau Membre de l&apos;Équipe</h2>
                            <p className="text-sm text-slate-400 font-normal">Créez un accès sécurisé pour votre collaborateur.</p>
                            {error && (
                                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm font-medium">
                                    {error}
                                </div>
                            )}
                        </ModalHeader>
                        <form onSubmit={handleSubmit}>
                            <ModalBody className="gap-6">
                                {/* Avatar Section */}
                                <div className="flex flex-col items-center gap-4 mb-2">
                                    <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                                        <div className="size-24 rounded-full overflow-hidden border-2 border-[#262626] bg-[#0a0a0a] flex items-center justify-center relative">
                                            {previewUrl ? (
                                                <Image src={previewUrl} className="object-cover" alt="Avatar" fill sizes="80px" />
                                            ) : (
                                                <Camera className="w-10 h-10 text-slate-700 group-hover:text-[var(--primary)] transition-colors" />
                                            )}
                                        </div>
                                        <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <span className="text-white text-[10px] font-bold uppercase">Changer</span>
                                        </div>
                                    </div>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        className="hidden"
                                        accept="image/*"
                                        onChange={handleFileChange}
                                    />
                                    <p className="text-xs text-slate-500 font-medium">Photo de profil du collaborateur (optionnel)</p>
                                </div>

                                {/* Personal Info Section */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-400" htmlFor="full_name">Nom complet</label>
                                        <input
                                            className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl text-slate-100 placeholder:text-slate-600 focus:ring-[var(--primary)] focus:border-[var(--primary)] transition-all p-3 outline-none"
                                            id="full_name"
                                            placeholder="Ex: Amine Caissier"
                                            type="text"
                                            value={fullName}
                                            onChange={(e) => setFullName(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-400" htmlFor="email">Adresse Email</label>
                                        <input
                                            className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl text-slate-100 placeholder:text-slate-600 focus:ring-[var(--primary)] focus:border-[var(--primary)] transition-all p-3 outline-none"
                                            id="email"
                                            placeholder="amine@flexbox-direct.com"
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            required
                                        />
                                    </div>
                                </div>

                                {/* Security Section */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-400" htmlFor="password">Mot de passe</label>
                                        <div className="relative">
                                            <input
                                                className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl text-slate-100 placeholder:text-slate-600 focus:ring-[var(--primary)] focus:border-[var(--primary)] transition-all pl-10 p-3 outline-none"
                                                id="password"
                                                placeholder="••••••••"
                                                type="password"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                required
                                            />
                                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-400" htmlFor="pin_code">Code PIN Rapide (4 chiffres)</label>
                                        <div className="relative">
                                            <input
                                                className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl text-slate-100 placeholder:text-slate-600 focus:ring-[var(--primary)] focus:border-[var(--primary)] transition-all pl-10 p-3 outline-none tracking-[0.5em]"
                                                id="pin_code"
                                                maxLength={4}
                                                placeholder="0000"
                                                type="text"
                                                value={pinCode}
                                                onChange={(e) => setPinCode(e.target.value)}
                                                required
                                            />
                                            <Keypad className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                        </div>
                                    </div>
                                </div>

                                {/* Role Selection Section */}
                                <div>
                                    <h3 className="text-sm font-medium text-slate-400 mb-3">Niveau d&apos;accès</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {/* Role: Cashier */}
                                        <button
                                            type="button"
                                            onClick={() => setRole("cashier")}
                                            className={`relative flex flex-col p-4 text-left rounded-xl transition-all group border-2 ${role === "cashier"
                                                ? "border-[var(--primary)] bg-[var(--primary)]/10"
                                                : "border-[#262626] bg-[#0a0a0a] hover:border-slate-700"
                                                }`}
                                        >
                                            <div className="flex items-center justify-between mb-3 w-full">
                                                <div className={`p-2 rounded-lg shrink-0 ${role === "cashier" ? "bg-[var(--primary)]/20 text-[var(--primary)]" : "bg-zinc-800 text-slate-400 group-hover:text-slate-100"
                                                    }`}>
                                                    <Store className="w-6 h-6" />
                                                </div>
                                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${role === "cashier" ? "border-[var(--primary)]" : "border-slate-700"
                                                    }`}>
                                                    {role === "cashier" && <div className="w-2 h-2 rounded-full bg-[var(--primary)]"></div>}
                                                </div>
                                            </div>
                                            <span className="text-slate-100 font-bold block">Caissier</span>
                                            <span className="text-xs text-slate-500 mt-2 leading-relaxed">
                                                Accès limité à la Borne, la Caisse et le Traitement. Ne voit pas les bénéfices ni les fournisseurs.
                                            </span>
                                        </button>

                                        {/* Role: Traiteur */}
                                        <button
                                            type="button"
                                            onClick={() => setRole("traiteur")}
                                            className={`relative flex flex-col p-4 text-left rounded-xl transition-all group border-2 ${role === "traiteur"
                                                ? "border-[var(--primary)] bg-[var(--primary)]/10"
                                                : "border-[#262626] bg-[#0a0a0a] hover:border-slate-700"
                                                }`}
                                        >
                                            <div className="flex items-center justify-between mb-3 w-full">
                                                <div className={`p-2 rounded-lg shrink-0 ${role === "traiteur" ? "bg-[var(--primary)]/20 text-[var(--primary)]" : "bg-zinc-800 text-slate-400 group-hover:text-slate-100"
                                                    }`}>
                                                    <Package className="w-6 h-6" />
                                                </div>
                                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${role === "traiteur" ? "border-[var(--primary)]" : "border-slate-700"
                                                    }`}>
                                                    {role === "traiteur" && <div className="w-2 h-2 rounded-full bg-[var(--primary)]"></div>}
                                                </div>
                                            </div>
                                            <span className="text-slate-100 font-bold block">Traiteur de commande</span>
                                            <span className="text-xs text-slate-500 mt-2 leading-relaxed">
                                                Accès au catalogue et au traitement des commandes uniquement. Ne voit pas la caisse ni les finances.
                                            </span>
                                        </button>

                                        {/* Role: Administrator */}
                                        <button
                                            type="button"
                                            onClick={() => setRole("admin")}
                                            className={`relative flex flex-col p-4 text-left rounded-xl transition-all group border-2 ${role === "admin"
                                                ? "border-[var(--primary)] bg-[var(--primary)]/10"
                                                : "border-[#262626] bg-[#0a0a0a] hover:border-slate-700"
                                                }`}
                                        >
                                            <div className="flex items-center justify-between mb-3 w-full">
                                                <div className={`p-2 rounded-lg shrink-0 ${role === "admin" ? "bg-[var(--primary)]/20 text-[var(--primary)]" : "bg-zinc-800 text-slate-400 group-hover:text-slate-100"
                                                    }`}>
                                                    <ShieldCheck className="w-6 h-6" />
                                                </div>
                                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${role === "admin" ? "border-[var(--primary)]" : "border-slate-700"
                                                    }`}>
                                                    {role === "admin" && <div className="w-2 h-2 rounded-full bg-[var(--primary)]"></div>}
                                                </div>
                                            </div>
                                            <span className="text-slate-100 font-bold block">Administrateur</span>
                                            <span className="text-xs text-slate-500 mt-2 leading-relaxed">
                                                Contrôle total du système, accès aux finances et aux réglages.
                                            </span>
                                        </button>
                                    </div>
                                </div>
                            </ModalBody>
                            <ModalFooter>
                                <Button
                                    variant="light"
                                    onPress={onClose}
                                    className="text-slate-400 hover:text-white font-medium"
                                >
                                    Annuler
                                </Button>
                                <Button
                                    className="bg-[var(--primary)] hover:bg-[#ff6d24] text-white px-8 rounded-xl font-bold shadow-lg shadow-orange-900/20 active:scale-95 transition-all"
                                    type="submit"
                                    isLoading={isLoading}
                                    startContent={!isLoading && <UserPlus className="w-5 h-5" />}
                                >
                                    Créer le compte
                                </Button>
                            </ModalFooter>
                        </form>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
};
