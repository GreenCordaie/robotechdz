"use client";

import React, { useState, useRef } from "react";
import {
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Button
} from "@heroui/react";
import { uploadImage } from "@/app/admin/actions/upload";
import { createCategoryAction, updateCategoryAction } from "@/app/admin/catalogue/actions";
import { toast } from "react-hot-toast";
import Image from "next/image";

interface AddCategoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    categoryToEdit?: {
        id: number;
        name: string;
        imageUrl: string | null;
    } | null;
}

export const AddCategoryModal = ({ isOpen, onClose, categoryToEdit }: AddCategoryModalProps) => {
    const [isSaving, setIsSaving] = useState(false);
    const [name, setName] = useState("");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Initialize state when modal opens or categoryToEdit changes
    React.useEffect(() => {
        if (categoryToEdit) {
            setName(categoryToEdit.name);
            setPreviewUrl(categoryToEdit.imageUrl);
            setSelectedFile(null);
        } else {
            resetForm();
        }
    }, [categoryToEdit, isOpen]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);
        }
    };

    const handleSubmit = async () => {
        if (!name) {
            toast.error("Veuillez saisir un nom pour la catégorie");
            return;
        }

        setIsSaving(true);
        let imageUrl: string | null = categoryToEdit?.imageUrl || null;

        try {
            if (selectedFile) {
                const formData = new FormData();
                formData.append("file", selectedFile);
                const uploadRes = await uploadImage(formData);
                if (uploadRes.success && uploadRes.url) {
                    imageUrl = uploadRes.url;
                } else {
                    toast.error("Échec de l'upload de l'image");
                    setIsSaving(false);
                    return;
                }
            }

            const res = categoryToEdit
                ? await updateCategoryAction({ id: categoryToEdit.id, name, imageUrl })
                : await createCategoryAction({ name, imageUrl });

            if (res.success) {
                toast.success(categoryToEdit ? "Catégorie modifiée avec succès" : "Catégorie créée avec succès");
                resetForm();
                onClose();
            } else {
                toast.error(res.error || "Une erreur est survenue");
            }
        } catch (err) {
            toast.error("Erreur de connexion au serveur");
        } finally {
            setIsSaving(false);
        }
    };

    const resetForm = () => {
        setName("");
        setSelectedFile(null);
        setPreviewUrl(null);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            backdrop="blur"
            classNames={{
                base: "bg-[#161616] border border-[#262626] rounded-2xl shadow-2xl",
                header: "border-b border-[#262626] px-8 py-5",
                footer: "border-t border-[#262626] px-8 py-6",
            }}
        >
            <ModalContent>
                {(onClose) => (
                    <>
                        <ModalHeader className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-[#ec5b13]">
                                {categoryToEdit ? "edit_note" : "category"}
                            </span>
                            <h2 className="text-slate-100 text-lg font-bold">
                                {categoryToEdit ? "Modifier la Catégorie" : "Nouvelle Catégorie"}
                            </h2>
                        </ModalHeader>
                        <ModalBody className="p-8 space-y-6">
                            <div className="flex flex-col gap-2">
                                <label className="text-slate-400 text-xs font-bold uppercase tracking-widest">Nom de la catégorie</label>
                                <input
                                    className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl px-4 py-3 text-slate-100 focus:ring-1 focus:ring-[#ec5b13] outline-none transition-all"
                                    placeholder="ex: Cartes Cadeaux"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="text-slate-400 text-xs font-bold uppercase tracking-widest">Image</label>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept="image/*"
                                    onChange={handleFileChange}
                                />
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="aspect-video border-2 border-dashed border-[#262626] bg-[#0a0a0a] rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-[#ec5b13]/50 transition-all group overflow-hidden relative"
                                >
                                    {previewUrl ? (
                                        <Image src={previewUrl} className="object-cover" alt="Preview" fill sizes="(max-width: 768px) 100vw, 400px" />
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined text-slate-500 text-3xl group-hover:scale-110 transition-transform">add_photo_alternate</span>
                                            <p className="text-slate-500 text-xs font-medium">Cliquer pour uploader</p>
                                        </>
                                    )}
                                </div>
                            </div>
                        </ModalBody>
                        <ModalFooter>
                            <Button variant="light" onPress={onClose} className="text-slate-400 font-bold">Annuler</Button>
                            <Button
                                className="bg-[#ec5b13] text-white font-bold px-8 shadow-lg shadow-[#ec5b13]/20"
                                onClick={handleSubmit}
                                isLoading={isSaving}
                            >
                                {categoryToEdit ? "Enregistrer" : "Créer la catégorie"}
                            </Button>
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
};
