"use client";

import React, { useState } from "react";
import {
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Button,
    Input,
    Select,
    SelectItem,
    Textarea,
    Switch
} from "@heroui/react";

import { createProductAction } from "@/app/admin/catalogue/actions";
import { uploadImage } from "@/app/admin/actions/upload";

import { toast } from "react-hot-toast";

interface LinkedSupplier {
    id: string;
    supplierId: string;
    purchasePrice: string;
}

interface Variant {
    id: string;
    name: string;
    purchasePrice: string;
    salePrice: string;
    linkedSuppliers: LinkedSupplier[];
}

interface AddProductModalProps {
    isOpen: boolean;
    onClose: () => void;
    categories: any[];
    suppliers: any[];
}

export const AddProductModal = ({ isOpen, onClose, categories, suppliers }: AddProductModalProps) => {
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [categoryId, setCategoryId] = useState("");
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [requiresPlayerId, setRequiresPlayerId] = useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const [variants, setVariants] = useState<Variant[]>([
        {
            id: Math.random().toString(),
            name: "Standard Edition",
            purchasePrice: "0.00",
            salePrice: "0.00",
            linkedSuppliers: []
        }
    ]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);
        }
    };

    const handleSubmit = async () => {
        if (!name || !categoryId) {
            const msg = "Veuillez remplir les champs obligatoires (Nom et Catégorie)";
            setError(msg);
            toast.error(msg);
            return;
        }

        setIsSaving(true);
        setError(null);

        let finalImageUrl = imageUrl;

        try {
            // Upload image if selected
            if (selectedFile) {
                const formData = new FormData();
                formData.append("file", selectedFile);
                const uploadRes = await uploadImage(formData);
                if (uploadRes.success && uploadRes.url) {
                    finalImageUrl = uploadRes.url;
                } else {
                    const msg = "Échec de l'upload de l'image: " + (uploadRes.error || "Erreur inconnue");
                    setError(msg);
                    toast.error(msg);
                    setIsSaving(false);
                    return;
                }
            }

            const res = await createProductAction({
                name,
                description,
                categoryId: parseInt(categoryId),
                imageUrl: finalImageUrl,
                requiresPlayerId,
                variants: variants.map(v => ({
                    name: v.name,
                    purchasePriceUsd: v.purchasePrice,
                    salePriceDzd: v.salePrice,
                    linkedSuppliers: v.linkedSuppliers.map(ls => ({
                        supplierId: parseInt(ls.supplierId),
                        purchasePriceUsd: ls.purchasePrice
                    }))
                }))
            });

            if (res.success) {
                toast.success("Produit ajouté avec succès");
                onClose();
                // Reset form
                setName("");
                setDescription("");
                setCategoryId("");
                setVariants([
                    {
                        id: Math.random().toString(),
                        name: "Standard Edition",
                        purchasePrice: "0.00",
                        salePrice: "0.00",
                        linkedSuppliers: []
                    }
                ]);
                setSelectedFile(null);
                setPreviewUrl(null);
                setRequiresPlayerId(false);
            } else {
                const msg = res.error || "Une erreur est survenue";
                setError(msg);
                toast.error(msg);
            }
        } catch (err) {
            const msg = "Erreur de connexion au serveur";
            setError(msg);
            toast.error(msg);
        } finally {
            setIsSaving(false);
        }
    };

    const addVariant = () => {
        setVariants([...variants, {
            id: Math.random().toString(),
            name: "",
            purchasePrice: "",
            salePrice: "",
            linkedSuppliers: []
        }]);
    };

    const removeVariant = (id: string) => {
        if (variants.length > 1) {
            setVariants(variants.filter(v => v.id !== id));
        }
    };

    const updateVariant = (id: string, field: keyof Variant, value: any) => {
        setVariants(variants.map(v => v.id === id ? { ...v, [field]: value } : v));
    };

    const addLinkedSupplier = (variantId: string) => {
        const variant = variants.find(v => v.id === variantId);
        if (variant) {
            const newSuppliers = [
                ...variant.linkedSuppliers,
                { id: Math.random().toString(), supplierId: "", purchasePrice: "0.00" }
            ];
            updateVariant(variantId, "linkedSuppliers", newSuppliers);
        }
    };

    const removeLinkedSupplier = (variantId: string, supplierEntryId: string) => {
        const variant = variants.find(v => v.id === variantId);
        if (variant) {
            const newSuppliers = variant.linkedSuppliers.filter(s => s.id !== supplierEntryId);
            updateVariant(variantId, "linkedSuppliers", newSuppliers);
        }
    };

    const updateLinkedSupplier = (variantId: string, supplierEntryId: string, field: keyof LinkedSupplier, value: string) => {
        const variant = variants.find(v => v.id === variantId);
        if (variant) {
            const newSuppliers = variant.linkedSuppliers.map(s =>
                s.id === supplierEntryId ? { ...s, [field]: value } : s
            );
            updateVariant(variantId, "linkedSuppliers", newSuppliers);
        }
    };

    return (
        <>
            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #262626;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #333333;
                }
            `}</style>

            <Modal
                isOpen={isOpen}
                onClose={onClose}
                backdrop="blur"
                size="4xl"
                classNames={{
                    base: "bg-[#161616] border border-[#262626] rounded-2xl shadow-2xl overflow-hidden",
                    header: "border-b border-[#262626] px-8 py-5",
                    footer: "border-t border-[#262626] px-8 py-6 bg-[#161616]/80 backdrop-blur-md",
                    closeButton: "hover:bg-white/5 active:bg-white/10 transition-colors top-4 right-4 rounded-full size-10",
                }}
            >
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader>
                                <div className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-[#ec5b13] text-2xl">add_box</span>
                                    <h2 className="text-slate-100 text-lg font-bold leading-tight tracking-tight">Ajouter un Nouveau Produit</h2>
                                </div>
                                {error && (
                                    <p className="mt-2 text-red-500 text-xs font-bold uppercase tracking-wider">{error}</p>
                                )}
                            </ModalHeader>

                            <ModalBody className="p-8 custom-scrollbar">
                                <div className="flex flex-col gap-10">
                                    {/* Section 1: General Info */}
                                    <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        {/* Left Column: Image Upload */}
                                        <div className="flex flex-col gap-3">
                                            <p className="text-slate-400 text-sm font-medium">Image du Produit</p>
                                            <input
                                                type="file"
                                                ref={fileInputRef}
                                                className="hidden"
                                                accept="image/*"
                                                onChange={handleFileChange}
                                            />
                                            <div
                                                onClick={() => fileInputRef.current?.click()}
                                                className="flex-1 min-h-[240px] border-2 border-dashed border-[#262626] bg-[#0a0a0a] rounded-xl flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-[#ec5b13]/50 transition-all group p-6 relative overflow-hidden"
                                            >
                                                {previewUrl ? (
                                                    <img src={previewUrl} className="absolute inset-0 w-full h-full object-cover" alt="Preview" />
                                                ) : (
                                                    <>
                                                        <div className="size-16 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                                                            <span className="material-symbols-outlined text-slate-400 text-3xl group-hover:text-[#ec5b13]">image</span>
                                                        </div>
                                                        <div className="text-center">
                                                            <p className="text-slate-100 text-sm font-semibold">Glissez l'image ou cliquez pour parcourir</p>
                                                            <p className="text-slate-500 text-xs mt-1">PNG, JPG jusqu'à 10MB</p>
                                                        </div>
                                                    </>
                                                )}
                                                {previewUrl && (
                                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                        <span className="text-white font-bold text-sm">Changer l'image</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Right Column: Form Fields */}
                                        <div className="flex flex-col gap-5">
                                            <div className="flex flex-col gap-2">
                                                <label className="text-slate-400 text-sm font-medium">Nom du Produit</label>
                                                <input
                                                    className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-600 focus:ring-1 focus:ring-[#ec5b13] focus:border-[#ec5b13] outline-none transition-all"
                                                    placeholder="ex: Dashboard UI Kit"
                                                    type="text"
                                                    value={name}
                                                    onChange={(e) => setName(e.target.value)}
                                                />
                                            </div>

                                            <div className="flex flex-col gap-2">
                                                <label className="text-slate-400 text-sm font-medium">Catégorie</label>
                                                <div className="relative group">
                                                    <select
                                                        className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl px-4 py-3 text-slate-100 appearance-none focus:ring-1 focus:ring-[#ec5b13] focus:border-[#ec5b13] outline-none transition-all cursor-pointer"
                                                        value={categoryId}
                                                        onChange={(e) => setCategoryId(e.target.value)}
                                                    >
                                                        <option disabled value="">Sélectionner une catégorie</option>
                                                        {categories.map(cat => (
                                                            <option key={cat.id} value={String(cat.id)}>{cat.name}</option>
                                                        ))}
                                                    </select>
                                                    <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none group-focus-within:text-[#ec5b13] transition-colors">expand_more</span>
                                                </div>
                                            </div>

                                            <div className="flex flex-col gap-2">
                                                <label className="text-slate-400 text-sm font-medium">Description</label>
                                                <textarea
                                                    className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-600 focus:ring-1 focus:ring-[#ec5b13] focus:border-[#ec5b13] outline-none transition-all resize-none h-[115px]"
                                                    placeholder="Décrivez les fonctionnalités clés du produit..."
                                                    value={description}
                                                    onChange={(e) => setDescription(e.target.value)}
                                                ></textarea>
                                            </div>

                                            <div className="flex items-center justify-between p-4 bg-[#0a0a0a] border border-[#262626] rounded-xl">
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-slate-100 text-sm font-bold uppercase tracking-tight">Direct Top-up</span>
                                                    <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Nécessite un ID Joueur / Lien</span>
                                                </div>
                                                <Switch
                                                    isSelected={requiresPlayerId}
                                                    onValueChange={setRequiresPlayerId}
                                                    color="primary"
                                                />
                                            </div>
                                        </div>
                                    </section>

                                    {/* Section 2: Variants & Pricing */}
                                    <section className="flex flex-col gap-6">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-slate-100 font-bold flex items-center gap-2">
                                                <span className="material-symbols-outlined text-[#ec5b13]">layers</span>
                                                Variantes du Produit
                                            </h3>
                                        </div>

                                        <div className="space-y-6">
                                            {variants.map((v) => (
                                                <div key={v.id} className="bg-[#0a0a0a] border border-[#262626] rounded-xl p-6 flex flex-col gap-6 group relative shadow-lg">
                                                    {/* Variant Main Info Row */}
                                                    <div className="flex flex-col md:flex-row items-end gap-4 w-full">
                                                        <div className="flex-1 w-full flex flex-col gap-2">
                                                            <label className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Nom de la variante</label>
                                                            <input
                                                                className="w-full bg-black/40 border border-[#262626] rounded-lg px-4 py-2.5 text-slate-100 focus:ring-1 focus:ring-[#ec5b13] outline-none"
                                                                placeholder="Standard Edition"
                                                                type="text"
                                                                value={v.name}
                                                                onChange={(e) => updateVariant(v.id, "name", e.target.value)}
                                                            />
                                                        </div>
                                                        <div className="w-full md:w-48 flex flex-col gap-2">
                                                            <label className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Prix d'achat (USD)</label>
                                                            <div className="relative">
                                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium">$</span>
                                                                <input
                                                                    className="w-full bg-black/40 border border-[#262626] rounded-lg pl-8 pr-4 py-2.5 text-slate-100 focus:ring-1 focus:ring-[#ec5b13] outline-none"
                                                                    placeholder="0.00"
                                                                    type="number"
                                                                    value={v.purchasePrice}
                                                                    onChange={(e) => updateVariant(v.id, "purchasePrice", e.target.value)}
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="w-full md:w-48 flex flex-col gap-2">
                                                            <label className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Prix de vente (DZD)</label>
                                                            <div className="relative">
                                                                <input
                                                                    className="w-full bg-black/40 border border-[#262626] rounded-lg pl-4 pr-16 py-2.5 text-slate-100 focus:ring-1 focus:ring-[#ec5b13] outline-none"
                                                                    placeholder="0.00"
                                                                    type="number"
                                                                    value={v.salePrice}
                                                                    onChange={(e) => updateVariant(v.id, "salePrice", e.target.value)}
                                                                />
                                                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium text-xs whitespace-nowrap">DZD</span>
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => removeVariant(v.id)}
                                                            className="size-11 flex items-center justify-center rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all shrink-0 active:scale-90"
                                                        >
                                                            <span className="material-symbols-outlined text-xl">delete</span>
                                                        </button>
                                                    </div>

                                                    {/* Linked Suppliers Sub-section */}
                                                    <div className="flex flex-col gap-4 pt-4 border-t border-[#262626]/50">
                                                        <div className="flex items-center justify-between">
                                                            <h4 className="text-slate-400 text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                                                                <span className="material-symbols-outlined text-sm">link</span>
                                                                Fournisseurs Liés
                                                            </h4>
                                                        </div>

                                                        <div className="flex flex-col gap-3">
                                                            {v.linkedSuppliers.map((ls) => (
                                                                <div key={ls.id} className="flex flex-col md:flex-row items-center gap-3 bg-black/20 p-3 rounded-lg border border-[#262626]/30">
                                                                    <div className="flex-1 w-full relative">
                                                                        <select
                                                                            value={ls.supplierId}
                                                                            onChange={(e) => updateLinkedSupplier(v.id, ls.id, "supplierId", e.target.value)}
                                                                            className="w-full bg-black/40 border border-[#262626] rounded-lg px-3 py-2 text-slate-100 text-sm appearance-none focus:ring-1 focus:ring-[#ec5b13] outline-none transition-all cursor-pointer"
                                                                        >
                                                                            <option value="" disabled>Choisir un fournisseur</option>
                                                                            {suppliers.map(s => (
                                                                                <option key={s.id} value={s.id}>{s.name}</option>
                                                                            ))}
                                                                        </select>
                                                                        <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-lg pointer-events-none">expand_more</span>
                                                                    </div>
                                                                    <div className="w-full md:w-40 relative">
                                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">$</span>
                                                                        <input
                                                                            className="w-full bg-black/40 border border-[#262626] rounded-lg pl-6 pr-3 py-2 text-slate-100 text-sm focus:ring-1 focus:ring-[#ec5b13] outline-none"
                                                                            placeholder="Prix d'achat"
                                                                            type="number"
                                                                            value={ls.purchasePrice}
                                                                            onChange={(e) => updateLinkedSupplier(v.id, ls.id, "purchasePrice", e.target.value)}
                                                                        />
                                                                    </div>
                                                                    <button
                                                                        onClick={() => removeLinkedSupplier(v.id, ls.id)}
                                                                        className="text-slate-500 hover:text-red-400 transition-colors px-1"
                                                                    >
                                                                        <span className="material-symbols-outlined text-lg">close</span>
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>

                                                        {/* Add Supplier Button */}
                                                        <button
                                                            onClick={() => addLinkedSupplier(v.id)}
                                                            className="flex items-center gap-2 text-xs font-bold text-[#ec5b13]/80 hover:text-[#ec5b13] transition-colors w-fit group/add"
                                                        >
                                                            <span className="material-symbols-outlined text-sm group-hover/add:scale-110 transition-transform">add_circle</span>
                                                            Lier un fournisseur
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Add Variant Ghost Button */}
                                        <button
                                            onClick={addVariant}
                                            className="flex items-center justify-center gap-2 py-4 border-2 border-dashed border-[#ec5b13]/20 rounded-xl text-[#ec5b13] font-bold hover:bg-[#ec5b13]/5 hover:border-[#ec5b13]/40 transition-all active:scale-[0.99]"
                                        >
                                            <span className="material-symbols-outlined">add_circle</span>
                                            Ajouter une autre variante
                                        </button>
                                    </section>
                                </div>
                            </ModalBody>

                            <ModalFooter>
                                <button
                                    className="px-6 py-3 rounded-xl text-slate-400 font-semibold hover:text-white hover:bg-white/5 transition-all"
                                    onClick={onClose}
                                >
                                    Annuler
                                </button>
                                <button
                                    className="px-10 py-3 bg-[#ec5b13] text-white font-bold rounded-xl shadow-lg shadow-[#ec5b13]/20 hover:bg-[#ec5b13]/90 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
                                    onClick={handleSubmit}
                                    disabled={isSaving}
                                >
                                    {isSaving ? "Création..." : (
                                        <>
                                            Créer le Produit
                                            <span className="material-symbols-outlined text-xl">rocket_launch</span>
                                        </>
                                    )}
                                </button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>
        </>
    );
};
