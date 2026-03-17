"use client";

import React, { useState, useEffect } from "react";
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
    Save,
    Grid3X3 as Keypad,
    Camera,
    Loader2
} from "lucide-react";
import { uploadImage } from "@/app/admin/actions/upload";
import toast from "react-hot-toast";
import Image from "next/image";
import { updateUserAction } from "@/app/admin/settings/actions";

interface EditMemberModalProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    member: any;
    onSuccess: () => void;
}

type Role = "cashier" | "traiteur" | "admin";

export const EditMemberModal = ({ isOpen, onOpenChange, member, onSuccess }: EditMemberModalProps) => {
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

    useEffect(() => {
        if (member && isOpen) {
            setFullName(member.nom || "");
            setEmail(member.email || "");
            setPinCode(member.pinCode || "");
            setRole(member.role?.toLowerCase() as Role || "cashier");
            setAvatarUrl(member.avatarUrl || null);
            setPreviewUrl(member.avatarUrl || null);
            setPassword(""); // Don't pre-fill password
            setError(null);
        }
    }, [member, isOpen]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            let finalAvatarUrl = avatarUrl;
            if (selectedFile) {
                const formData = new FormData();
                formData.append("file", selectedFile);
                const uploadRes = await uploadImage(formData);
                if (uploadRes.success && uploadRes.url) {
                    finalAvatarUrl = uploadRes.url;
                } else {
                    setError("Échec de l'upload de l'avatar");
                    setIsLoading(false);
                    return;
                }
            }

            const updateData: any = {
                nom: fullName,
                email: email,
                pinCode: pinCode,
                role: role.toUpperCase(),
                avatarUrl: finalAvatarUrl
            };

            if (password.trim()) {
                updateData.password = password;
            }

            const result: any = await updateUserAction({ id: member.id, data: updateData });

            if (result.success) {
                toast.success("Membre mis à jour");
                onSuccess();
                onOpenChange(false);
            } else {
                setError(result.error || "Erreur lors de la mise à jour");
            }
        } catch (err) {
            setError("Une erreur est survenue");
        } finally {
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
        >
            <ModalContent>
                {(onClose) => (
                    <>
                        <ModalHeader className="flex flex-col gap-1">
                            <h2 className="text-xl font-bold text-slate-100">Modifier le Membre</h2>
                            <p className="text-sm text-slate-400 font-normal">Mettez à jour les informations et permissions de {fullName}.</p>
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
                                                <Image src={previewUrl} className="object-cover" alt="Avatar" fill sizes="40px" />
                                            ) : (
                                                <div className="bg-zinc-800 w-full h-full flex items-center justify-center text-2xl font-bold text-slate-500">
                                                    {fullName.substring(0, 2).toUpperCase()}
                                                </div>
                                            )}
                                            {isLoading && (
                                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10">
                                                    <Loader2 className="animate-spin text-white size-6" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <Camera className="text-white w-6 h-6" />
                                        </div>
                                    </div>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        className="hidden"
                                        accept="image/*"
                                        onChange={handleFileChange}
                                    />
                                    <p className="text-xs text-slate-500 font-medium">Cliquer pour changer la photo</p>
                                </div>

                                {/* Personal Info Section */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-400">Nom complet</label>
                                        <input
                                            className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl text-slate-100 placeholder:text-slate-600 focus:ring-[#ec5b13] focus:border-[#ec5b13] transition-all p-3 outline-none"
                                            placeholder="Ex: Amine Caissier"
                                            type="text"
                                            value={fullName}
                                            onChange={(e) => setFullName(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-400">Adresse Email</label>
                                        <input
                                            className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl text-slate-100 placeholder:text-slate-600 focus:ring-[#ec5b13] focus:border-[#ec5b13] transition-all p-3 outline-none"
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
                                        <label className="block text-sm font-medium text-slate-400">Nouveau mot de passe (optionnel)</label>
                                        <div className="relative">
                                            <input
                                                className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl text-slate-100 placeholder:text-slate-600 focus:ring-[#ec5b13] focus:border-[#ec5b13] transition-all pl-10 p-3 outline-none"
                                                placeholder="Laisser vide pour ne pas changer"
                                                type="password"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                            />
                                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-400">Code PIN Rapide</label>
                                        <div className="relative">
                                            <input
                                                className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl text-slate-100 placeholder:text-slate-600 focus:ring-[#ec5b13] focus:border-[#ec5b13] transition-all pl-10 p-3 outline-none tracking-[0.5em]"
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
                                        <button
                                            type="button"
                                            onClick={() => setRole("cashier")}
                                            className={`relative flex flex-col p-4 text-left rounded-xl transition-all border-2 ${role === "cashier" ? "border-[#ec5b13] bg-[#ec5b13]/10" : "border-[#262626] bg-[#0a0a0a] hover:border-slate-700"}`}
                                        >
                                            <div className="flex items-center justify-between mb-3 w-full">
                                                <div className={`p-2 rounded-lg ${role === "cashier" ? "bg-[#ec5b13]/20 text-[#ec5b13]" : "bg-zinc-800 text-slate-400"}`}>
                                                    <Store className="w-6 h-6" />
                                                </div>
                                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${role === "cashier" ? "border-[#ec5b13]" : "border-slate-700"}`}>
                                                    {role === "cashier" && <div className="w-2 h-2 rounded-full bg-[#ec5b13]"></div>}
                                                </div>
                                            </div>
                                            <span className="text-slate-100 font-bold block">Caissier</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setRole("traiteur")}
                                            className={`relative flex flex-col p-4 text-left rounded-xl transition-all border-2 ${role === "traiteur" ? "border-[#ec5b13] bg-[#ec5b13]/10" : "border-[#262626] bg-[#0a0a0a] hover:border-slate-700"}`}
                                        >
                                            <div className="flex items-center justify-between mb-3 w-full">
                                                <div className={`p-2 rounded-lg ${role === "traiteur" ? "bg-[#ec5b13]/20 text-[#ec5b13]" : "bg-zinc-800 text-slate-400"}`}>
                                                    <Package className="w-6 h-6" />
                                                </div>
                                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${role === "traiteur" ? "border-[#ec5b13]" : "border-slate-700"}`}>
                                                    {role === "traiteur" && <div className="w-2 h-2 rounded-full bg-[#ec5b13]"></div>}
                                                </div>
                                            </div>
                                            <span className="text-slate-100 font-bold block">Traiteur</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setRole("admin")}
                                            className={`relative flex flex-col p-4 text-left rounded-xl transition-all border-2 ${role === "admin" ? "border-[#ec5b13] bg-[#ec5b13]/10" : "border-[#262626] bg-[#0a0a0a] hover:border-slate-700"}`}
                                        >
                                            <div className="flex items-center justify-between mb-3 w-full">
                                                <div className={`p-2 rounded-lg ${role === "admin" ? "bg-[#ec5b13]/20 text-[#ec5b13]" : "bg-zinc-800 text-slate-400"}`}>
                                                    <ShieldCheck className="w-6 h-6" />
                                                </div>
                                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${role === "admin" ? "border-[#ec5b13]" : "border-slate-700"}`}>
                                                    {role === "admin" && <div className="w-2 h-2 rounded-full bg-[#ec5b13]"></div>}
                                                </div>
                                            </div>
                                            <span className="text-slate-100 font-bold block">Admin</span>
                                        </button>
                                    </div>
                                </div>
                            </ModalBody>
                            <ModalFooter>
                                <Button variant="light" onPress={onClose} className="text-slate-400">Annuler</Button>
                                <Button
                                    className="bg-[#ec5b13] text-white px-8 rounded-xl font-bold shadow-lg shadow-orange-900/20"
                                    type="submit"
                                    isLoading={isLoading}
                                    startContent={!isLoading && <Save className="w-5 h-5" />}
                                >
                                    Sauvegarder
                                </Button>
                            </ModalFooter>
                        </form>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
};
