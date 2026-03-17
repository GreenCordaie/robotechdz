"use client";

import React, { useState } from "react";
import {
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Button,
    Switch
} from "@heroui/react";

import { createProductAction, updateProductAction } from "@/app/admin/catalogue/actions";
import { uploadImage } from "@/app/admin/actions/upload";

import { toast } from "react-hot-toast";
import Image from "next/image";
import { formatCurrency } from "@/lib/formatters";
import { X, Gamepad2, Layers, Link as LinkIcon, Trash2, PlusCircle, Rocket, Save, Image as ImageIcon, ChevronDown } from "lucide-react";

interface LinkedSupplier {
    id: string;
    supplierId: string;
    purchasePrice: string;
    currency: string;
}

interface Variant {
    id: string;
    name: string;
    salePrice: string;
    isSharing: boolean;
    totalSlots: number;
    linkedSuppliers: LinkedSupplier[];
}

interface AddProductModalProps {
    isOpen: boolean;
    onClose: () => void;
    categories: any[];
    suppliers: any[];
    productToEdit?: any | null;
}

export const AddProductModal = ({ isOpen, onClose, categories, suppliers, productToEdit }: AddProductModalProps) => {
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [categoryId, setCategoryId] = useState("");
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [requiresPlayerId, setRequiresPlayerId] = useState(false);
    const [isManualDelivery, setIsManualDelivery] = useState(true);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const [variants, setVariants] = useState<Variant[]>([
        { id: Math.random().toString(), name: "", salePrice: "", isSharing: false, totalSlots: 5, linkedSuppliers: [] }
    ]);

    // Initialize state when modal opens or productToEdit changes
    React.useEffect(() => {
        if (productToEdit && isOpen) {
            setName(productToEdit.name || "");
            setDescription(productToEdit.description || "");
            setCategoryId(productToEdit.categoryId?.toString() || "");
            setImageUrl(productToEdit.imageUrl);
            setPreviewUrl(productToEdit.imageUrl);
            setRequiresPlayerId(productToEdit.requiresPlayerId || false);
            setIsManualDelivery(productToEdit.isManualDelivery ?? true);
            setSelectedFile(null);

            if (productToEdit.variants && productToEdit.variants.length > 0) {
                setVariants(productToEdit.variants.map((v: any) => ({
                    id: v.id?.toString() || Math.random().toString(),
                    name: v.name,
                    salePrice: v.salePriceDzd,
                    isSharing: v.isSharing || false,
                    totalSlots: v.totalSlots || 5,
                    linkedSuppliers: (v.variantSuppliers || []).map((vs: any) => ({
                        id: Math.random().toString(),
                        supplierId: vs.supplierId?.toString() || "",
                        purchasePrice: vs.purchasePrice || "0.00",
                        currency: vs.currency || "USD"
                    }))
                })));
            } else {
                setVariants([{
                    id: Math.random().toString(),
                    name: "",
                    salePrice: "",
                    isSharing: false,
                    totalSlots: 5,
                    linkedSuppliers: []
                }]);
            }
        } else if (!productToEdit && isOpen) {
            resetForm();
        }
    }, [productToEdit, isOpen]);

    const resetForm = () => {
        setName("");
        setDescription("");
        setCategoryId("");
        setImageUrl(null);
        setPreviewUrl(null);
        setSelectedFile(null);
        setRequiresPlayerId(false);
        setIsManualDelivery(true);
        setVariants([{ id: Math.random().toString(), name: "", salePrice: "", isSharing: false, totalSlots: 5, linkedSuppliers: [] }]);
        setError(null);
    };

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

            const productData = {
                name,
                description,
                categoryId: parseInt(categoryId),
                imageUrl: finalImageUrl,
                requiresPlayerId,
                isManualDelivery,
                variants: variants.map(v => ({
                    id: v.id.includes('.') ? null : parseInt(v.id), // Only send real numeric IDs for updates
                    name: v.name,
                    salePriceDzd: v.salePrice,
                    isSharing: v.isSharing,
                    totalSlots: v.totalSlots,
                    linkedSuppliers: (v.linkedSuppliers || []).map(ls => ({
                        supplierId: Number(ls.supplierId),
                        purchasePrice: ls.purchasePrice,
                        currency: ls.currency
                    }))
                }))
            };

            const res = productToEdit
                ? await updateProductAction({ id: productToEdit.id, formData: productData })
                : await createProductAction(productData);

            if (res.success) {
                toast.success(productToEdit ? "Produit modifié avec succès" : "Produit ajouté avec succès");
                onClose();
                if (!productToEdit) resetForm();
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
            salePrice: "",
            isSharing: false,
            totalSlots: 5,
            linkedSuppliers: []
        }]);
    };

    const removeVariant = (id: string) => {
        if (variants.length > 1) {
            setVariants(variants.filter(v => v.id !== id));
        }
    };

    const updateVariant = (id: string, field: keyof Variant, value: any) => {
        const nextVariants = variants.map(v => v.id === id ? { ...v, [field]: value } : v);
        setVariants(nextVariants);

        // If any variant becomes sharing, force auto-delivery (isManualDelivery = false)
        if (field === "isSharing" && value === true) {
            setIsManualDelivery(false);
        }
    };

    const addLinkedSupplier = (variantId: string) => {
        const variant = variants.find(v => v.id === variantId);
        if (variant) {
            const newSuppliers = [
                ...variant.linkedSuppliers,
                { id: Math.random().toString(), supplierId: "", purchasePrice: "0.00", currency: "USD" }
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
            const newSuppliers = variant.linkedSuppliers.map(s => {
                if (s.id === supplierEntryId) {
                    const update: any = { ...s, [field]: value };
                    if (field === "supplierId") {
                        const selectedSup = suppliers.find(sup => sup.id.toString() === value);
                        if (selectedSup) {
                            update.currency = selectedSup.currency || "USD";
                        } else {
                            update.currency = "USD";
                        }
                    }
                    return update;
                }
                return s;
            });
            updateVariant(variantId, "linkedSuppliers", newSuppliers);
        }
    };

    return (
        <>
            <style jsx global>{`
                @import url('https://fonts.googleapis.com/css2?family=Public+Sans:wght@300;400;500;600;700;900&display=swap');
                
                .font-display {
                    font-family: 'Public Sans', sans-serif;
                }

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
                    base: "bg-[#161616] border border-[#262626] rounded-2xl shadow-2xl overflow-hidden font-display",
                    header: "border-b border-white/5 px-8 py-5",
                    footer: "border-t border-white/5 px-8 py-6 bg-[#161616]/80 backdrop-blur-md",
                    closeButton: "hover:bg-white/5 active:bg-white/10 transition-colors top-4 right-4 rounded-full size-10 text-slate-400 hover:text-white",
                }}
            >
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader>
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-3">
                                        <PlusCircle className="text-[#ec5b13] size-6" />
                                        <h2 className="text-slate-100 text-lg font-black leading-tight tracking-tight uppercase">
                                            {productToEdit ? "Modifier le Produit" : "Ajouter un Nouveau Produit"}
                                        </h2>
                                    </div>
                                    {error && (
                                        <p className="text-red-500 text-[10px] font-black uppercase tracking-widest">{error}</p>
                                    )}
                                </div>
                            </ModalHeader>

                            <ModalBody className="p-8 custom-scrollbar max-h-[75vh] overflow-y-auto">
                                <div className="flex flex-col gap-10">
                                    {/* Section 1: General Info */}
                                    <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        {/* Left Column: Image Upload */}
                                        <div className="flex flex-col gap-3">
                                            <p className="text-slate-400 text-xs font-black uppercase tracking-widest">Image du Produit</p>
                                            <input
                                                type="file"
                                                ref={fileInputRef}
                                                className="hidden"
                                                accept="image/*"
                                                onChange={handleFileChange}
                                            />
                                            <div
                                                onClick={() => fileInputRef.current?.click()}
                                                className="flex-1 min-h-[260px] border-2 border-dashed border-[#262626] bg-[#0a0a0a] rounded-xl flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-[#ec5b13]/50 transition-all group p-6 relative overflow-hidden"
                                            >
                                                {previewUrl ? (
                                                    <Image src={previewUrl} className="object-cover" alt="Preview" fill sizes="(max-width: 768px) 100vw, 400px" />
                                                ) : (
                                                    <>
                                                        <div className="size-16 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                                                            <ImageIcon className="text-slate-400 size-8 group-hover:text-[#ec5b13]" />
                                                        </div>
                                                        <div className="text-center">
                                                            <p className="text-slate-100 text-sm font-black uppercase tracking-tight">Glissez l&apos;image ou cliquez</p>
                                                            <p className="text-slate-500 text-[10px] mt-1 font-bold uppercase tracking-wider">PNG, JPG jusqu&apos;à 10MB</p>
                                                        </div>
                                                    </>
                                                )}
                                                {previewUrl && (
                                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                                                        <span className="text-white font-black text-xs uppercase tracking-widest">Changer l&apos;image</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Right Column: Form Fields */}
                                        <div className="flex flex-col gap-5">
                                            <div className="flex flex-col gap-2">
                                                <label className="text-slate-400 text-xs font-black uppercase tracking-widest">Nom du Produit</label>
                                                <input
                                                    className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl px-4 py-3.5 text-slate-100 placeholder:text-slate-600 focus:ring-1 focus:ring-[#ec5b13] focus:border-[#ec5b13] outline-none transition-all font-bold text-sm"
                                                    placeholder="ex: Netflix Premium"
                                                    type="text"
                                                    value={name}
                                                    onChange={(e) => setName(e.target.value)}
                                                />
                                            </div>

                                            <div className="flex flex-col gap-2">
                                                <label className="text-slate-400 text-xs font-black uppercase tracking-widest">Catégorie</label>
                                                <div className="relative group">
                                                    <select
                                                        className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl px-4 py-3.5 text-slate-100 appearance-none focus:ring-1 focus:ring-[#ec5b13] focus:border-[#ec5b13] outline-none transition-all cursor-pointer font-bold text-sm"
                                                        value={categoryId}
                                                        onChange={(e) => setCategoryId(e.target.value)}
                                                    >
                                                        <option disabled value="">Sélectionner une catégorie</option>
                                                        {categories.map(cat => (
                                                            <option key={cat.id} value={String(cat.id)}>{cat.name}</option>
                                                        ))}
                                                    </select>
                                                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none group-focus-within:text-[#ec5b13] transition-colors size-5" />
                                                </div>
                                            </div>

                                            <div className="flex flex-col gap-2">
                                                <label className="text-slate-400 text-xs font-black uppercase tracking-widest">Description</label>
                                                <textarea
                                                    className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl px-4 py-3.5 text-slate-100 placeholder:text-slate-600 focus:ring-1 focus:ring-[#ec5b13] focus:border-[#ec5b13] outline-none transition-all resize-none h-[115px] font-bold text-sm"
                                                    placeholder="Décrivez les fonctionnalités..."
                                                    value={description}
                                                    onChange={(e) => setDescription(e.target.value)}
                                                ></textarea>
                                            </div>
                                        </div>
                                    </section>

                                    {/* Settings Switches */}
                                    <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="flex items-center justify-between p-4 bg-[#0a0a0a] border border-[#262626] rounded-xl group hover:border-[#ec5b13]/30 transition-colors">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-slate-100 text-xs font-black uppercase tracking-tight">Direct Top-up</span>
                                                <span className="text-slate-500 text-[9px] font-black uppercase tracking-wider">Nécessite ID / Lien Client</span>
                                            </div>
                                            <Switch
                                                isSelected={requiresPlayerId}
                                                onValueChange={setRequiresPlayerId}
                                                color="primary"
                                                size="sm"
                                            />
                                        </div>

                                        <div className="flex items-center justify-between p-4 bg-[#0a0a0a] border border-[#262626] rounded-xl group hover:border-[#ec5b13]/30 transition-colors">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-slate-100 text-xs font-black uppercase tracking-tight">Livraison Manuelle</span>
                                                <span className="text-slate-500 text-[9px] font-black uppercase tracking-wider">{isManualDelivery ? "Stock Infini" : "Code Numérique"}</span>
                                            </div>
                                            <Switch
                                                isSelected={isManualDelivery}
                                                onValueChange={setIsManualDelivery}
                                                color="warning"
                                                size="sm"
                                                isDisabled={variants.some(v => v.isSharing)}
                                            />
                                        </div>
                                    </section>

                                    {/* Section 2: Variants & Pricing */}
                                    <section className="flex flex-col gap-6">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-slate-100 font-black flex items-center gap-2 uppercase tracking-tight">
                                                <Layers className="text-[#ec5b13] size-5" />
                                                Variantes du Produit
                                            </h3>
                                        </div>

                                        <div className="space-y-6">
                                            {variants.map((v) => (
                                                <div key={v.id} className="bg-[#0a0a0a] border border-[#262626] rounded-xl p-6 flex flex-col gap-6 group relative shadow-lg hover:border-[#ec5b13]/20 transition-colors">
                                                    {/* Variant Main Info Row */}
                                                    <div className="flex flex-col md:flex-row items-end gap-4 w-full">
                                                        <div className="flex-1 w-full flex flex-col gap-2">
                                                            <label className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Nom de la variante</label>
                                                            <input
                                                                className="w-full bg-black/40 border border-[#262626] rounded-lg px-4 py-2.5 text-slate-100 focus:ring-1 focus:ring-[#ec5b13] outline-none font-bold text-sm"
                                                                placeholder="Standard Edition"
                                                                type="text"
                                                                value={v.name}
                                                                onChange={(e) => updateVariant(v.id, "name", e.target.value)}
                                                            />
                                                        </div>
                                                        <div className="w-full md:w-48 flex flex-col gap-2">
                                                            <label className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Prix de vente (DZD)</label>
                                                            <div className="relative">
                                                                <input
                                                                    className="w-full bg-black/40 border border-[#262626] rounded-lg pl-4 pr-16 py-2.5 text-slate-100 focus:ring-1 focus:ring-[#ec5b13] outline-none font-black text-sm"
                                                                    placeholder="0.00"
                                                                    type="number"
                                                                    value={v.salePrice}
                                                                    onChange={(e) => updateVariant(v.id, "salePrice", e.target.value)}
                                                                />
                                                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-black text-[10px] uppercase whitespace-nowrap">DZD</span>
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => removeVariant(v.id)}
                                                            className="size-11 flex items-center justify-center rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all shrink-0 active:scale-90"
                                                        >
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </div>

                                                    {/* SHARING Row */}
                                                    <div className="flex flex-col md:flex-row items-center gap-6 p-4 bg-black/20 rounded-lg border border-white/5">
                                                        <div className="flex items-center gap-4 flex-1">
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className="text-slate-200 text-xs font-black uppercase tracking-tight">Mode Partagé (Sharing)</span>
                                                                <span className="text-slate-500 text-[9px] font-bold tracking-wide uppercase">Divise le compte en profils</span>
                                                            </div>
                                                            <Switch
                                                                isSelected={v.isSharing}
                                                                onValueChange={(val) => updateVariant(v.id, "isSharing", val)}
                                                                size="sm"
                                                                color="secondary"
                                                            />
                                                        </div>

                                                        {v.isSharing && (
                                                            <div className="w-48 flex flex-col gap-2">
                                                                <label className="text-slate-500 text-[9px] font-black uppercase tracking-widest px-1">Profils par Compte</label>
                                                                <input
                                                                    className="w-full bg-black/40 border border-[#262626] rounded-lg px-4 py-2 text-sm text-slate-100 focus:ring-1 focus:ring-[#ec5b13] outline-none font-black"
                                                                    type="number"
                                                                    min="1"
                                                                    max="10"
                                                                    value={v.totalSlots}
                                                                    onChange={(e) => updateVariant(v.id, "totalSlots", parseInt(e.target.value) || 1)}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Linked Suppliers Sub-section */}
                                                    <div className="flex flex-col gap-4 pt-4 border-t border-white/5">
                                                        <div className="flex items-center justify-between">
                                                            <h4 className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
                                                                <LinkIcon size={12} className="text-[#ec5b13]" />
                                                                Fournisseurs Liés
                                                            </h4>
                                                        </div>

                                                        <div className="flex flex-col gap-3">
                                                            {v.linkedSuppliers.map((ls) => (
                                                                <div key={ls.id} className="flex flex-col md:flex-row items-center gap-3 bg-black/20 p-3 rounded-lg border border-white/5">
                                                                    <div className="flex-1 w-full relative group">
                                                                        <select
                                                                            value={ls.supplierId}
                                                                            onChange={(e) => updateLinkedSupplier(v.id, ls.id, "supplierId", e.target.value)}
                                                                            className="w-full bg-black/40 border border-[#262626] rounded-lg px-3 py-2 text-slate-100 text-sm appearance-none focus:ring-1 focus:ring-[#ec5b13] outline-none transition-all cursor-pointer font-bold"
                                                                        >
                                                                            <option value="" disabled>Choisir un fournisseur</option>
                                                                            {suppliers.map(s => (
                                                                                <option key={s.id} value={s.id}>{s.name}</option>
                                                                            ))}
                                                                        </select>
                                                                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none group-focus-within:text-[#ec5b13] size-4" />
                                                                    </div>
                                                                    <div className="w-full md:w-40 relative">
                                                                        {ls.currency === "USD" ? (
                                                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-black">$</span>
                                                                        ) : null}
                                                                        <input
                                                                            className={`w-full bg-black/40 border border-[#262626] rounded-lg ${ls.currency === "USD" ? "pl-6 pr-12" : "pl-3 pr-12"} py-2 text-slate-100 text-sm focus:ring-1 focus:ring-[#ec5b13] outline-none transition-all font-black`}
                                                                            placeholder="Achat"
                                                                            type="number"
                                                                            step="0.01"
                                                                            value={ls.purchasePrice}
                                                                            onChange={(e) => updateLinkedSupplier(v.id, ls.id, "purchasePrice", e.target.value)}
                                                                        />
                                                                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                                            <span className={`text-[9px] font-black tracking-tighter ${ls.currency === 'USD' ? 'text-emerald-500' : 'text-blue-400'}`}>
                                                                                {ls.currency}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                    <button
                                                                        onClick={() => removeLinkedSupplier(v.id, ls.id)}
                                                                        className="text-slate-500 hover:text-red-400 transition-colors px-1"
                                                                    >
                                                                        <X size={16} />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>

                                                        {/* Add Supplier Button */}
                                                        <button
                                                            onClick={() => addLinkedSupplier(v.id)}
                                                            className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#ec5b13]/80 hover:text-[#ec5b13] transition-colors w-fit group/add"
                                                        >
                                                            <PlusCircle size={14} className="group-hover/add:scale-110 transition-transform" />
                                                            Lier un fournisseur
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Add Variant Ghost Button */}
                                        <button
                                            onClick={addVariant}
                                            className="flex items-center justify-center gap-2 py-5 border-2 border-dashed border-[#ec5b13]/20 rounded-xl text-[#ec5b13] font-black text-xs uppercase tracking-[0.2em] hover:bg-[#ec5b13]/5 hover:border-[#ec5b13]/40 transition-all active:scale-[0.99]"
                                        >
                                            <PlusCircle size={18} />
                                            Ajouter une autre variante
                                        </button>
                                    </section>
                                </div>
                            </ModalBody>

                            <ModalFooter>
                                <button
                                    className="px-6 py-3 rounded-xl text-slate-400 font-black text-xs uppercase tracking-widest hover:text-white hover:bg-white/5 transition-all"
                                    onClick={onClose}
                                >
                                    Annuler
                                </button>
                                <button
                                    className="px-10 py-3 bg-[#ec5b13] text-white font-black text-xs uppercase tracking-[0.2em] rounded-xl shadow-lg shadow-[#ec5b13]/20 hover:bg-[#ec5b13]/90 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2.5"
                                    onClick={handleSubmit}
                                    disabled={isSaving}
                                >
                                    {isSaving ? (productToEdit ? "Mise à jour..." : "Création...") : (
                                        <>
                                            {productToEdit ? "Enregistrer" : "Créer le Produit"}
                                            {productToEdit ? <Save size={18} /> : <Rocket size={18} />}
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
