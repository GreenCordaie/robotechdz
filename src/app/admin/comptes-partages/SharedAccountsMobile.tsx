"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
    Users,
    Search,
    Plus,
    ShieldCheck,
    LayoutGrid,
    User,
    CheckCircle2,
    Mail,
    Copy,
    ChevronRight,
    Edit3,
    Trash2,
    Calendar,
    AlertCircle,
    ExternalLink
} from "lucide-react";
import {
    Button,
    Card,
    CardBody,
    Chip,
    Spinner,
    Input,
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    useDisclosure,
    Select,
    SelectItem
} from "@heroui/react";
import {
    getSharedAccountsInventory,
    getSharingVariants,
    addSharedAccount,
    updateSharedAccount,
    deleteSharedAccount,
    getAvailableVariantsForLinking,
    linkProductToSharing
} from "./actions";
import { formatCurrency } from "@/lib/formatters";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

export default function SharedAccountsMobile() {
    const router = useRouter();
    const [inventory, setInventory] = useState<any[]>([]);
    const [sharingVariants, setSharingVariants] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const { isOpen, onOpen, onClose } = useDisclosure();
    const [modalMode, setModalMode] = useState<"ADD" | "EDIT" | "VIEW">("ADD");
    const [editingAccount, setEditingAccount] = useState<any>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form state
    const [selectedVariantId, setSelectedVariantId] = useState<string>("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [slotsData, setSlotsData] = useState<{ id?: number, profileName: string, pinCode: string }[]>([]);

    const { isOpen: isLinkOpen, onOpen: onLinkOpen, onClose: onLinkClose } = useDisclosure();
    const [linkableVariants, setLinkableVariants] = useState<any[]>([]);
    const [selectedLinkVariantId, setSelectedLinkVariantId] = useState<string>("");
    const [linkTotalSlots, setLinkTotalSlots] = useState<string>("5");
    const [isLinking, setIsLinking] = useState(false);

    const loadInventory = async (silent = false) => {
        if (!silent) setIsLoading(true);
        try {
            const [invData, varData, linkData] = await Promise.all([
                getSharedAccountsInventory() as Promise<any>,
                getSharingVariants({}) as Promise<any>,
                getAvailableVariantsForLinking({}) as Promise<any>
            ]);

            if (Array.isArray(invData)) {
                setInventory(invData);
            } else if (invData && typeof invData === 'object' && 'error' in invData) {
                toast.error((invData as any).error || "Erreur de chargement");
            }

            if (Array.isArray(varData)) {
                setSharingVariants(varData);
            }

            if (Array.isArray(linkData)) {
                setLinkableVariants(linkData);
            }
        } catch (error) {
            toast.error("Erreur de chargement");
        } finally {
            if (!silent) setIsLoading(false);
        }
    };

    useEffect(() => {
        loadInventory();
        const interval = setInterval(() => loadInventory(true), 30000);
        return () => clearInterval(interval);
    }, []);

    const resetForm = () => {
        setSelectedVariantId("");
        setEmail("");
        setPassword("");
        setSlotsData([]);
        setEditingAccount(null);
    };

    const handleAddClick = () => {
        setModalMode("ADD");
        resetForm();
        onOpen();
    };

    const handleEditClick = (account: any, variant: any) => {
        setModalMode("EDIT");
        setEditingAccount(account);
        setSelectedVariantId(variant.id.toString());
        const parts = account.code.split(" | ");
        setEmail(parts[0] || account.code);
        setPassword(parts[1] || "");
        setSlotsData(account.slots.map((s: any) => ({
            id: s.id,
            profileName: s.profileName || "",
            pinCode: s.code || ""
        })));
        onOpen();
    };

    useEffect(() => {
        if (modalMode === "ADD" && selectedVariantId) {
            const v = sharingVariants.find(v => v.id.toString() === selectedVariantId);
            if (v) {
                setSlotsData(Array.from({ length: v.totalSlots || 0 }).map((_, i) => ({
                    profileName: `Profil ${i + 1}`,
                    pinCode: ""
                })));
            }
        }
    }, [selectedVariantId, modalMode, sharingVariants]);

    const handleSlotChange = (index: number, field: string, value: string) => {
        const newData = [...slotsData];
        newData[index] = { ...newData[index], [field]: value };
        setSlotsData(newData);
    };

    const handleDeleteClick = async (id: number) => {
        if (confirm("Supprimer ce compte ?")) {
            const res = await deleteSharedAccount({ id }) as { success: boolean; error?: string };
            if (res.success) {
                toast.success("Supprimé");
                loadInventory();
            }
        }
    };

    const handleLinkClick = async () => {
        try {
            const data = await getAvailableVariantsForLinking({}) as any[];
            if (Array.isArray(data)) {
                setLinkableVariants(data);
                onLinkOpen();
            }
        } catch (error) {
            toast.error("Erreur de chargement");
        }
    };

    const handleLinkSubmit = async () => {
        if (!selectedLinkVariantId) return toast.error("Sélectionnez un produit");
        setIsLinking(true);
        try {
            const res = await linkProductToSharing({
                variantId: parseInt(selectedLinkVariantId),
                totalSlots: parseInt(linkTotalSlots)
            }) as { success: boolean; error?: string };
            if (res.success) {
                toast.success("Succès");
                onLinkClose();
                loadInventory();
            } else toast.error(res.error || "Erreur");
        } catch (e) { toast.error("Erreur technique"); }
        finally { setIsLinking(false); }
    };

    const handleSubmit = async () => {
        if (!email || !password) return toast.error("Identifiants requis");
        setIsSubmitting(true);
        try {
            let res: { success: boolean; error?: string };
            if (modalMode === "ADD") {
                res = await addSharedAccount({ variantId: parseInt(selectedVariantId), email, password, slots: slotsData }) as { success: boolean; error?: string };
            } else {
                res = await updateSharedAccount({
                    id: editingAccount.id, email, password,
                    slots: slotsData.map((s: any) => ({ id: s.id!, profileName: s.profileName, pinCode: s.pinCode }))
                }) as { success: boolean; error?: string };
            }
            if (res.success) {
                toast.success("Succès");
                onClose();
                loadInventory();
            } else toast.error(res.error || "Erreur");
        } catch (e) { toast.error("Erreur technique"); }
        finally { setIsSubmitting(false); }
    };

    const filteredInventory = useMemo(() => {
        if (!searchTerm) return inventory;
        const lowSearch = searchTerm.toLowerCase();
        return inventory.filter(v =>
            v.product.name.toLowerCase().includes(lowSearch) ||
            v.digitalCodes?.some((acc: any) => acc.code.toLowerCase().includes(lowSearch))
        );
    }, [inventory, searchTerm]);

    const stats = useMemo(() => {
        let totalSlots = 0;
        let soldSlots = 0;
        inventory.forEach(v => {
            v.digitalCodes?.forEach((acc: any) => {
                acc.slots?.forEach((s: any) => {
                    totalSlots++;
                    if (s.status === "VENDU") soldSlots++;
                });
            });
        });
        return { totalSlots, soldSlots, available: totalSlots - soldSlots };
    }, [inventory]);

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-[#0a0a0a]">
                <Spinner color="primary" />
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen bg-[#0a0a0a] text-white pb-32">
            <header className="p-4 border-b border-white/5 space-y-4">
                <div className="flex justify-between items-center">
                    <h1 className="text-xl font-black italic uppercase tracking-tighter">Flux Partagé</h1>
                    <div className="flex gap-2">
                        <Button
                            isIconOnly
                            size="sm"
                            variant="flat"
                            className="rounded-full bg-white/5 border border-white/10"
                            onPress={handleLinkClick}
                        >
                            <ExternalLink size={18} className="text-secondary" />
                        </Button>
                        <Button isIconOnly size="sm" color="primary" className="rounded-full" onPress={handleAddClick}>
                            <Plus size={18} />
                        </Button>
                    </div>
                </div>

                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input
                        type="text"
                        placeholder="Chercher email/produit..."
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 outline-none focus:border-primary/50 transition-all font-bold placeholder:text-slate-600"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </header>

            {/* Quick Stats Horizontal */}
            <div className="flex gap-3 overflow-x-auto p-4 no-scrollbar">
                {[
                    { label: "Capacité", value: stats.totalSlots, icon: LayoutGrid, color: "text-purple-500" },
                    { label: "Occupés", value: stats.soldSlots, icon: User, color: "text-orange-500" },
                    { label: "Libres", value: stats.available, icon: CheckCircle2, color: "text-emerald-500" }
                ].map((s, i) => (
                    <div key={i} className="min-w-[120px] p-3 bg-white/5 border border-white/5 rounded-2xl flex flex-col gap-1">
                        <s.icon size={14} className={s.color} />
                        <p className="text-[9px] font-black uppercase text-slate-500">{s.label}</p>
                        <p className="text-lg font-black">{s.value}</p>
                    </div>
                ))}
            </div>

            <main className="px-4 space-y-6 mt-4">
                {filteredInventory.map((variant) => (
                    <section key={variant.id} className="space-y-3">
                        <div className="flex items-center gap-2 px-1">
                            <div className="size-1.5 rounded-full bg-primary" />
                            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">{variant.product.name}</h3>
                        </div>

                        <div className="space-y-3">
                            {variant.digitalCodes?.map((acc: any) => {
                                const sold = acc.slots?.filter((s: any) => s.status === "VENDU").length || 0;
                                const total = acc.slots?.length || 0;
                                return (
                                    <div key={acc.id} className="p-4 bg-[#161616] border border-white/5 rounded-[2rem] space-y-4">
                                        <div className="flex justify-between items-start">
                                            <div className="min-w-0">
                                                <p className="text-[10px] font-black text-slate-500 uppercase mb-1">{variant.name}</p>
                                                <p className="text-sm font-bold truncate text-white">{acc.code.split(' | ')[0]}</p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-lg font-black leading-none">{sold}<span className="text-slate-600 text-xs">/{total}</span></p>
                                                <p className="text-[8px] font-black uppercase text-slate-500">Slots</p>
                                            </div>
                                        </div>

                                        <div className="flex gap-1 h-2">
                                            {acc.slots?.map((s: any) => (
                                                <div
                                                    key={s.id}
                                                    className={`flex-1 rounded-full ${s.status === "VENDU" ? 'bg-orange-500 animate-pulse' : 'bg-white/10'}`}
                                                />
                                            ))}
                                        </div>

                                        <div className="flex justify-between items-center pt-2 border-t border-white/5">
                                            <div className="flex items-center gap-1 text-slate-500">
                                                <Calendar size={10} />
                                                <span className="text-[8px] font-black uppercase">{new Date(acc.createdAt).toLocaleDateString()}</span>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button
                                                    isIconOnly
                                                    size="sm"
                                                    variant="light"
                                                    className="text-slate-600"
                                                    onPress={() => handleEditClick(acc, variant)}
                                                >
                                                    <Edit3 size={14} />
                                                </Button>
                                                {sold === 0 && (
                                                    <Button
                                                        isIconOnly
                                                        size="sm"
                                                        variant="light"
                                                        className="text-red-500/50"
                                                        onPress={() => handleDeleteClick(acc.id)}
                                                    >
                                                        <Trash2 size={14} />
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                ))}
            </main>

            <Modal
                isOpen={isOpen}
                onClose={onClose}
                className="dark bg-[#161616] text-white border border-white/5"
                size="full"
                scrollBehavior="inside"
            >
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader className="flex flex-col gap-1">
                                <h2 className="text-xl font-black uppercase italic">{modalMode === "ADD" ? "Nouveau Flux" : "Édit Flux"}</h2>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-none">Administration Sécurisée</p>
                            </ModalHeader>
                            <ModalBody className="space-y-6">
                                {modalMode === "ADD" && (
                                    <div className="space-y-2">
                                        <p className="text-[10px] font-black text-slate-500 uppercase ml-1">Produit Cible</p>
                                        <Select
                                            placeholder="Choisir SKU..."
                                            selectedKeys={selectedVariantId ? [selectedVariantId] : []}
                                            onChange={(e) => setSelectedVariantId(e.target.value)}
                                            classNames={{ trigger: "bg-white/5 border border-white/10 rounded-2xl h-14" }}
                                        >
                                            {sharingVariants.map(v => (
                                                <SelectItem key={v.id.toString()} textValue={`${v.product.name} - ${v.name}`}>
                                                    <div className="text-left font-bold">
                                                        <p className="text-xs text-white">{v.product.name}</p>
                                                        <p className="text-[10px] text-primary">{v.name}</p>
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </Select>
                                    </div>
                                )}

                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 px-1">
                                        <ShieldCheck size={14} className="text-primary" />
                                        <span className="text-[10px] font-black text-slate-500 uppercase">Identifiants</span>
                                    </div>
                                    <div className="space-y-2 bg-black/20 p-4 rounded-3xl border border-white/5">
                                        <Input
                                            label="Email Admin"
                                            variant="bordered"
                                            value={email}
                                            onValueChange={setEmail}
                                            classNames={{ inputWrapper: "border-white/5" }}
                                        />
                                        <Input
                                            label="Mot de passe"
                                            variant="bordered"
                                            value={password}
                                            onValueChange={setPassword}
                                            classNames={{ inputWrapper: "border-white/5" }}
                                        />
                                    </div>
                                </div>

                                {slotsData.length > 0 && (
                                    <div className="space-y-4 pb-10">
                                        <div className="flex items-center gap-2 px-1">
                                            <LayoutGrid size={14} className="text-orange-500" />
                                            <span className="text-[10px] font-black text-slate-500 uppercase">Configuration Profils ({slotsData.length})</span>
                                        </div>
                                        <div className="space-y-3">
                                            {slotsData.map((s, idx) => (
                                                <div key={idx} className="p-3 bg-white/5 rounded-2xl border border-white/5 space-y-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="size-5 rounded-full bg-orange-500/20 text-orange-500 flex items-center justify-center text-[10px] font-black">{idx + 1}</div>
                                                        <Input
                                                            placeholder="Nom Profil"
                                                            size="sm"
                                                            variant="underlined"
                                                            value={s.profileName}
                                                            onValueChange={(v) => handleSlotChange(idx, 'profileName', v)}
                                                            className="flex-1"
                                                        />
                                                    </div>
                                                    <Input
                                                        placeholder="PIN"
                                                        size="sm"
                                                        variant="underlined"
                                                        startContent={<Users size={12} className="text-slate-600" />}
                                                        value={s.pinCode}
                                                        onValueChange={(v) => handleSlotChange(idx, 'pinCode', v)}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </ModalBody>
                            <ModalFooter className="bg-black/50 backdrop-blur-xl border-t border-white/5">
                                <Button variant="flat" onPress={onClose} className="rounded-xl font-bold uppercase text-[10px]">Ignorer</Button>
                                <Button
                                    className="bg-primary text-white font-black uppercase text-[10px] rounded-xl px-10 h-12 shadow-xl shadow-primary/20"
                                    onPress={handleSubmit}
                                    isLoading={isSubmitting}
                                >
                                    Confirmer
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>

            {/* Link Product Modal */}
            <Modal
                isOpen={isLinkOpen}
                onClose={onLinkClose}
                className="dark bg-[#161616] text-white border border-white/5"
                size="full"
                scrollBehavior="inside"
            >
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader className="flex flex-col gap-1">
                                <h2 className="text-xl font-black uppercase italic">Lier Produit</h2>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-none">Activer Mode Partagé</p>
                            </ModalHeader>
                            <ModalBody className="space-y-6">
                                <div className="space-y-2">
                                    <p className="text-[10px] font-black text-slate-500 uppercase ml-1">Variante Catalogue</p>
                                    <Select
                                        placeholder="Choisir SKU..."
                                        selectedKeys={selectedLinkVariantId ? [selectedLinkVariantId] : []}
                                        onChange={(e) => setSelectedLinkVariantId(e.target.value)}
                                        classNames={{ trigger: "bg-white/5 border border-white/10 rounded-2xl h-14" }}
                                    >
                                        {linkableVariants.map(v => (
                                            <SelectItem key={v.id.toString()} textValue={`${v.product.name} - ${v.name}`}>
                                                <div className="text-left font-bold">
                                                    <p className="text-xs text-white">{v.product.name}</p>
                                                    <p className="text-[10px] text-primary">{v.name}</p>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <p className="text-[10px] font-black text-slate-500 uppercase ml-1">Nombre de Slots</p>
                                    <Input
                                        type="number"
                                        placeholder="Ex: 5"
                                        value={linkTotalSlots}
                                        onValueChange={setLinkTotalSlots}
                                        classNames={{ inputWrapper: "bg-white/5 border border-white/10 rounded-2xl h-14" }}
                                    />
                                </div>
                            </ModalBody>
                            <ModalFooter className="bg-black/50 backdrop-blur-xl border-t border-white/5">
                                <Button variant="flat" onPress={onClose} className="rounded-xl font-bold uppercase text-[10px]">Annuler</Button>
                                <Button
                                    className="bg-secondary text-white font-black uppercase text-[10px] rounded-xl px-10 h-12 shadow-xl shadow-secondary/20"
                                    onPress={handleLinkSubmit}
                                    isLoading={isLinking}
                                >
                                    Activer Partage
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>
        </div>
    );
}
