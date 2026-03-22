"use client";

import React, { useState } from "react";
import {
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Button,
    Textarea,
    Input
} from "@heroui/react";
import { bulkInsertCodes, getVariantStockCounts } from "@/app/admin/catalogue/actions";
import { toast } from "react-hot-toast";
import { Hash, Loader2, Save } from "lucide-react";

interface MassImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    product: {
        id: number;
        name: string;
        variants: any[];
    } | null;
}

export const MassImportModal = ({ isOpen, onClose, product }: MassImportModalProps) => {
    const [selectedVariantId, setSelectedVariantId] = useState<string>("");
    const [codesInput, setCodesInput] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [stockCounts, setStockCounts] = useState<Record<number, number>>({});

    const [sharingAccounts, setSharingAccounts] = useState([{
        email: "",
        password: "",
        slots: [] as { name: string, code: string }[]
    }]);

    const selectedVariant = product?.variants?.find(v => v.id.toString() === selectedVariantId);

    React.useEffect(() => {
        if (product?.variants?.length === 1) {
            setSelectedVariantId(product.variants[0].id.toString());
        } else {
            setSelectedVariantId("");
        }
        if (product?.variants?.length) {
            const ids = product.variants.map((v: any) => v.id);
            getVariantStockCounts({ variantIds: ids }).then(res => {
                if (res.success) setStockCounts(res.counts);
            });
        }
    }, [product]);

    // Update slots when variant changes - only for first empty account or reset
    React.useEffect(() => {
        if (selectedVariant?.isSharing && sharingAccounts.length === 1 && sharingAccounts[0].slots.length === 0) {
            const count = selectedVariant.totalSlots || 0;
            setSharingAccounts([{
                email: "",
                password: "",
                slots: Array.from({ length: count }, (_, i) => ({ name: `Profil ${i + 1}`, code: "" }))
            }]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedVariantId, selectedVariant?.isSharing, selectedVariant?.totalSlots]);

    const addAccount = () => {
        const count = selectedVariant?.totalSlots || 0;
        setSharingAccounts([
            ...sharingAccounts,
            {
                email: "",
                password: "",
                slots: Array.from({ length: count }, (_, i) => ({ name: `Profil ${i + 1}`, code: "" }))
            }
        ]);
    };

    const removeAccount = (index: number) => {
        if (sharingAccounts.length > 1) {
            setSharingAccounts(sharingAccounts.filter((_, i) => i !== index));
        }
    };

    const updateAccount = (index: number, field: string, value: any) => {
        setSharingAccounts(prev => prev.map((acc, i) => i === index ? { ...acc, [field]: value } : acc));
    };

    const updateSlot = (accIndex: number, slotIndex: number, field: string, value: string) => {
        setSharingAccounts(prev => prev.map((acc, i) => {
            if (i !== accIndex) return acc;
            const newSlots = [...acc.slots];
            newSlots[slotIndex] = { ...newSlots[slotIndex], [field]: value };
            return { ...acc, slots: newSlots };
        }));
    };

    const handleSave = async () => {
        if (!selectedVariantId) {
            toast.error("Veuillez sélectionner une variante");
            return;
        }

        let data: any;
        if (selectedVariant?.isSharing) {
            const validAccounts = sharingAccounts.filter(acc => acc.email && acc.password);
            if (validAccounts.length === 0) {
                toast.error("Veuillez remplir au moins un compte (Email et Mot de passe)");
                return;
            }
            data = {
                type: "SHARING",
                accounts: validAccounts
            };
        } else {
            const codes = codesInput.split("\n").map(c => c.trim()).filter(c => c.length > 0);
            if (codes.length === 0) {
                toast.error("Veuillez entrer au moins un code");
                return;
            }
            data = {
                type: "STANDARD",
                codes
            };
        }

        setIsSaving(true);
        try {
            const res = await bulkInsertCodes({ variantId: parseInt(selectedVariantId), ...data });
            if (res.success) {
                toast.success(selectedVariant?.isSharing ? `${res.count} comptes partagés importés` : `${res.count} codes importés`);
                setCodesInput("");
                setSharingAccounts([{ email: "", password: "", slots: [] }]);
                // Refresh stock counts
                if (product?.variants?.length) {
                    const ids = product.variants.map((v: any) => v.id);
                    getVariantStockCounts({ variantIds: ids }).then(r => { if (r.success) setStockCounts(r.counts); });
                }
                onClose();
            } else {
                toast.error(res.error || "Erreur lors de l'importation");
            }
        } catch (error) {
            toast.error("Erreur de connexion au serveur");
        } finally {
            setIsSaving(false);
        }
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
                <>
                    <>
                        <ModalHeader>
                            <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-[#ec5b13] text-2xl">database_upload</span>
                                <div>
                                    <h2 className="text-slate-100 text-lg font-bold leading-tight">Importation de Stock</h2>
                                    <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">{product?.name}</p>
                                </div>
                                {selectedVariant && (
                                    <span className={`ml-auto text-xs font-black px-3 py-1 rounded-full ${(stockCounts[selectedVariant.id] ?? 0) > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                        {stockCounts[selectedVariant.id] ?? 0} en stock
                                    </span>
                                )}
                            </div>
                        </ModalHeader>
                        <ModalBody className="p-8">
                            <div className="space-y-4">
                                {product?.variants && product.variants.length > 1 && (
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-bold text-slate-400">Variante</label>
                                        <select
                                            value={selectedVariantId}
                                            onChange={(e) => setSelectedVariantId(e.target.value)}
                                            className="w-full bg-black/40 border border-[#262626] rounded-xl px-4 py-3 text-slate-100 appearance-none focus:ring-1 focus:ring-[#ec5b13] outline-none"
                                        >
                                            <option value="" disabled>Sélectionner une variante</option>
                                            {product.variants.map((v: any) => (
                                                <option key={v.id} value={v.id.toString()}>
                                                    {v.name} — {stockCounts[v.id] ?? 0} en stock
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {selectedVariant?.isSharing ? (
                                    <div className="space-y-8">
                                        {sharingAccounts.map((account, accIndex) => (
                                            <div key={accIndex} className="p-6 bg-black/30 border border-[#262626] rounded-2xl space-y-6 relative group/acc">
                                                {sharingAccounts.length > 1 && (
                                                    <button
                                                        onClick={() => removeAccount(accIndex)}
                                                        className="absolute top-4 right-4 text-slate-500 hover:text-red-500 transition-colors"
                                                    >
                                                        <span className="material-symbols-outlined text-sm">close</span>
                                                    </button>
                                                )}

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <Input
                                                        label="Email / ID du Compte"
                                                        placeholder="exemple@email.com"
                                                        variant="bordered"
                                                        value={account.email}
                                                        onValueChange={(v) => updateAccount(accIndex, "email", v)}
                                                        classNames={{ inputWrapper: "bg-black/40 border-[#262626]" }}
                                                    />
                                                    <Input
                                                        label="Mot de passe"
                                                        placeholder="••••••••"
                                                        variant="bordered"
                                                        value={account.password}
                                                        onValueChange={(v) => updateAccount(accIndex, "password", v)}
                                                        classNames={{ inputWrapper: "bg-black/40 border-[#262626]" }}
                                                    />
                                                </div>

                                                <div className="space-y-4">
                                                    <div className="flex items-center justify-between">
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Configuration des Profils ({selectedVariant.totalSlots})</label>
                                                        <div className="flex items-center gap-4 text-[9px] font-bold text-slate-500 uppercase tracking-widest px-2">
                                                            <span className="w-1/2">Nom</span>
                                                            <span className="w-1/2">PIN</span>
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                                                        {account.slots.map((slot, slotIndex) => (
                                                            <div key={slotIndex} className="flex items-center gap-3 p-2 bg-black/20 border border-[#262626] rounded-xl">
                                                                <div className="size-6 rounded bg-orange-500/10 text-[#ec5b13] flex items-center justify-center text-[10px] font-black shrink-0">
                                                                    {slotIndex + 1}
                                                                </div>
                                                                <Input
                                                                    size="sm"
                                                                    placeholder={`Nom`}
                                                                    variant="underlined"
                                                                    value={slot.name}
                                                                    onValueChange={(v) => updateSlot(accIndex, slotIndex, "name", v)}
                                                                    className="flex-1"
                                                                />
                                                                <Input
                                                                    size="sm"
                                                                    placeholder={`Code / PIN`}
                                                                    variant="underlined"
                                                                    value={slot.code}
                                                                    onValueChange={(v) => updateSlot(accIndex, slotIndex, "code", v)}
                                                                    className="flex-1"
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}

                                        <Button
                                            variant="bordered"
                                            className="w-full border-2 border-dashed border-[#262626] text-slate-400 font-bold py-8 hover:border-[#ec5b13]/40 hover:text-[#ec5b13] transition-all bg-transparent"
                                            onClick={addAccount}
                                            startContent={<span className="material-symbols-outlined">person_add</span>}
                                        >
                                            Ajouter un autre compte à importer
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-bold text-slate-400 flex items-center gap-2">
                                            <Hash className="size-4" />
                                            Codes Numériques (Un par ligne)
                                        </label>
                                        <Textarea
                                            placeholder="Exemple:&#10;ABC1-DEF2-GHI3&#10;JKL4-MNO5-PQR6"
                                            minRows={10}
                                            value={codesInput}
                                            onValueChange={setCodesInput}
                                            classNames={{
                                                input: "font-mono text-sm tracking-widest",
                                                inputWrapper: "bg-black/40 border-[#262626] hover:border-[#ec5b13]/50 focus-within:!border-[#ec5b13]"
                                            }}
                                        />
                                    </div>
                                )}
                                <div className="p-4 bg-orange-500/5 border border-orange-500/20 rounded-xl">
                                    <p className="text-[11px] text-orange-200/60 leading-relaxed italic">
                                        {selectedVariant?.isSharing
                                            ? "Note : Les comptes partagés seront importés avec leurs profils spécifiques. Le débit fournisseur de la totalité de la carte se fera à la vente du premier profil."
                                            : "Note : Les codes importés seront immédiatement marqués comme disponible et pourront être vendus sur la borne."
                                        }
                                    </p>
                                </div>
                            </div>
                        </ModalBody>
                        <ModalFooter>
                            <Button
                                variant="flat"
                                className="font-bold text-slate-400 hover:text-white"
                                onPress={onClose}
                            >
                                Annuler
                            </Button>
                            <Button
                                color="primary"
                                className="bg-[#ec5b13] font-bold shadow-lg shadow-[#ec5b13]/20"
                                onPress={handleSave}
                                isLoading={isSaving}
                                startContent={!isSaving && <Save className="size-4" />}
                            >
                                {isSaving ? "Importation..." : selectedVariant?.isSharing
                                    ? `Importer ${sharingAccounts.filter(a => a.email).length} Comptes`
                                    : `Importer ${codesInput.split("\n").filter(c => c.trim().length > 0).length} Codes`
                                }
                            </Button>
                        </ModalFooter>
                    </>
                </>
            </ModalContent>
        </Modal>
    );
};
