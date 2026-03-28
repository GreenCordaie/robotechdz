"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
    getSharedAccountsInventory,
    addSharedAccount,
    addSharedAccountQuick,
    updateSharedAccount,
    deleteSharedAccount,
    getSharingVariants,
    getAvailableVariantsForLinking,
    linkProductToSharing,
    getSharedAccountsHistory
} from "./actions";
import {
    Users, Mail, LayoutGrid, CheckCircle2, Search, User, Calendar,
    Activity, ShieldCheck, AlertCircle, Copy, Plus, Edit3, Trash2,
    Key, ExternalLink, Clock
} from "lucide-react";
import toast from "react-hot-toast";
import {
    Input, Button, Chip, Card, CardBody, Tooltip, Spinner,
    Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
    useDisclosure, Select, SelectItem, Progress, Textarea, Tabs, Tab,
    Table, TableHeader, TableColumn, TableBody, TableRow, TableCell
} from "@heroui/react";
import React from "react";

export default function SharedAccountsContent() {
    // ── Data ─────────────────────────────────────────────────────────────────
    const [inventory, setInventory] = useState<any[]>([]);
    const [history, setHistory] = useState<any[]>([]);
    const [sharingVariants, setSharingVariants] = useState<any[]>([]);
    const [linkableVariants, setLinkableVariants] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [activeProduct, setActiveProduct] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");

    // ── Inline add form (single account) ─────────────────────────────────────
    const [addVariantId, setAddVariantId] = useState("");
    const [addEmail, setAddEmail] = useState("");
    const [addPassword, setAddPassword] = useState("");
    const [addPurchasePrice, setAddPurchasePrice] = useState("");
    const [addPurchaseCurrency, setAddPurchaseCurrency] = useState("DZD");
    const [addSlotsData, setAddSlotsData] = useState<{ profileName: string; pinCode: string }[]>([]);
    const [isAdding, setIsAdding] = useState(false);
    const lastAddVariantId = React.useRef("");

    // ── Multi-line quick insert ───────────────────────────────────────────────
    const [quickVariantId, setQuickVariantId] = useState("");
    const [quickRawInput, setQuickRawInput] = useState("");
    const [quickPurchasePrice, setQuickPurchasePrice] = useState("");
    const [quickPurchaseCurrency, setQuickPurchaseCurrency] = useState("DZD");
    const [isQuickSubmitting, setIsQuickSubmitting] = useState(false);
    const [quickErrors, setQuickErrors] = useState<string[]>([]);

    // ── Edit modal ────────────────────────────────────────────────────────────
    const accountModal = useDisclosure();
    const deleteModal = useDisclosure();
    const linkModal = useDisclosure();

    const [editingAccount, setEditingAccount] = useState<any>(null);
    const [editVariantId, setEditVariantId] = useState("");
    const [editEmail, setEditEmail] = useState("");
    const [editPassword, setEditPassword] = useState("");
    const [editPurchasePrice, setEditPurchasePrice] = useState("");
    const [editPurchaseCurrency, setEditPurchaseCurrency] = useState("DZD");
    const [editSlotsData, setEditSlotsData] = useState<{ id?: number; profileName: string; pinCode: string }[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // ── Delete ────────────────────────────────────────────────────────────────
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // ── Link modal ────────────────────────────────────────────────────────────
    const [selectedLinkVariantId, setSelectedLinkVariantId] = useState("");
    const [linkTotalSlots, setLinkTotalSlots] = useState("5");
    const [isLinking, setIsLinking] = useState(false);

    // ── Load ──────────────────────────────────────────────────────────────────
    const loadInventory = useCallback(async () => {
        try {
            const [invData, varData, linkData] = await Promise.all([
                getSharedAccountsInventory(),
                getSharingVariants({}),
                getAvailableVariantsForLinking({})
            ]);
            if (Array.isArray(invData)) setInventory(invData);
            if (Array.isArray(varData)) setSharingVariants(varData);
            if (Array.isArray(linkData)) setLinkableVariants(linkData);
        } catch {
            toast.error("Échec du chargement de l'inventaire");
        } finally {
            setIsLoading(false);
        }
    }, []);

    const loadHistory = useCallback(async () => {
        setIsLoadingHistory(true);
        try {
            const res = await getSharedAccountsHistory();
            if (Array.isArray(res)) setHistory(res);
        } catch {
            toast.error("Échec du chargement de l'historique");
        } finally {
            setIsLoadingHistory(false);
        }
    }, []);

    useEffect(() => {
        loadInventory();
        const interval = setInterval(loadInventory, 30_000);
        return () => clearInterval(interval);
    }, [loadInventory]);

    // ── Slot auto-fill on add variant change ──────────────────────────────────
    useEffect(() => {
        if (!addVariantId || !sharingVariants.length) return;
        if (addVariantId === lastAddVariantId.current) return; // Prevent wipe on polling

        const variant = sharingVariants.find(v => v.id.toString() === addVariantId);
        if (!variant) return;

        setAddSlotsData(Array.from({ length: variant.totalSlots || 0 }, (_, i) => ({
            profileName: `Profil ${i + 1}`, pinCode: ""
        })));
        lastAddVariantId.current = addVariantId;
    }, [addVariantId, sharingVariants]);

    // ── Computed ──────────────────────────────────────────────────────────────
    const groupedInventory = useMemo(() => {
        const groups: Record<string, any[]> = {};
        inventory.forEach(v => {
            const name = v.product.name;
            if (!groups[name]) groups[name] = [];
            groups[name].push(v);
        });
        return groups;
    }, [inventory]);

    const productNames = useMemo(() => Object.keys(groupedInventory), [groupedInventory]);

    useEffect(() => {
        if (productNames.length > 0 && !activeProduct) setActiveProduct(productNames[0]);
    }, [productNames, activeProduct]);

    const filteredInventory = useMemo(() => {
        const base = activeProduct ? { [activeProduct]: groupedInventory[activeProduct] ?? [] } : groupedInventory;
        if (!searchTerm) return base;
        const low = searchTerm.toLowerCase();
        const result: Record<string, any[]> = {};
        Object.entries(base).forEach(([product, variants]) => {
            const matches = variants.filter(v =>
                v.digitalCodes?.some((acc: any) =>
                    acc.code.toLowerCase().includes(low) ||
                    acc.slots?.some((s: any) => s.profileName?.toLowerCase().includes(low))
                )
            );
            if (matches.length > 0) result[product] = matches;
        });
        return result;
    }, [groupedInventory, activeProduct, searchTerm]);

    const globalStats = useMemo(() => {
        let totalAccounts = 0, totalSlots = 0, soldSlots = 0;
        inventory.forEach(v => v.digitalCodes?.forEach((acc: any) => {
            totalAccounts++;
            acc.slots?.forEach((s: any) => { totalSlots++; if (s.status === "VENDU") soldSlots++; });
        }));
        return { totalAccounts, totalSlots, soldSlots, availableSlots: totalSlots - soldSlots };
    }, [inventory]);

    // Count valid lines for multi-line tab
    const validLineCount = useMemo(() => {
        return quickRawInput.split("\n").filter(l => l.trim().includes("|") && l.trim().length > 0).length;
    }, [quickRawInput]);

    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleEditClick = (account: any, variant: any) => {
        setEditingAccount(account);
        setEditVariantId(variant.id.toString());
        const parts = account.code.split(" | ");
        setEditEmail(parts[0] || account.code);
        setEditPassword(parts[1] || "");
        setEditPurchasePrice(account.purchasePrice || "");
        setEditPurchaseCurrency(account.purchaseCurrency || "DZD");
        setEditSlotsData(account.slots.map((s: any) => ({
            id: s.id, profileName: s.profileName || "", pinCode: s.code || ""
        })));
        accountModal.onOpen();
    };

    const handleDeleteClick = (id: number) => {
        setDeletingId(id); deleteModal.onOpen();
    };

    const handleDeleteConfirm = async () => {
        if (!deletingId) return;
        setIsDeleting(true);
        try {
            const res = await deleteSharedAccount({ id: deletingId });
            if (res.success) {
                toast.success("Compte supprimé");
                deleteModal.onClose();
                loadInventory();
            } else {
                toast.error(res.error || "Erreur lors de la suppression");
            }
        } catch {
            toast.error("Erreur technique");
        } finally {
            setIsDeleting(false);
            setDeletingId(null);
        }
    };

    const handleInlineAdd = async () => {
        if (!addVariantId) { toast.error("Sélectionnez un produit"); return; }
        if (!addEmail || !addPassword) { toast.error("Email et mot de passe requis"); return; }
        setIsAdding(true);
        try {
            const res = await addSharedAccount({
                variantId: parseInt(addVariantId),
                email: addEmail,
                password: addPassword,
                purchasePrice: addPurchasePrice,
                purchaseCurrency: addPurchaseCurrency,
                slots: addSlotsData
            });
            if (res.success) {
                toast.success("Compte ajouté ✓");
                setAddEmail("");
                setAddPassword("");
                setAddPurchasePrice("");
                setAddSlotsData([]);
                setAddVariantId("");
                loadInventory();
            } else {
                toast.error(res.error || "Erreur");
            }
        } catch {
            toast.error("Erreur serveur");
        } finally {
            setIsAdding(false);
        }
    };

    const handleQuickSubmit = async () => {
        if (!quickVariantId) { toast.error("Sélectionnez un produit"); return; }
        if (!quickRawInput.trim()) { toast.error("Collez des identifiants"); return; }
        setIsQuickSubmitting(true);
        setQuickErrors([]);
        try {
            const res = await addSharedAccountQuick({
                variantId: parseInt(quickVariantId),
                rawInput: quickRawInput,
                purchasePrice: quickPurchasePrice,
                purchaseCurrency: quickPurchaseCurrency,
                autoClassify: false
            });
            if (res.success) {
                toast.success("Comptes importés ✓");
                if (res.errors?.length) setQuickErrors(res.errors);
                setQuickRawInput("");
                setQuickPurchasePrice("");
                setQuickPurchaseCurrency("DZD");
                loadInventory();
            } else {
                toast.error(res.error || "Erreur d'insertion");
            }
        } catch {
            toast.error("Erreur technique");
        } finally {
            setIsQuickSubmitting(false);
        }
    };

    const handleEditSubmit = async () => {
        if (!editEmail || !editPassword) { toast.error("Email et mot de passe requis"); return; }
        setIsSubmitting(true);
        try {
            const res = await updateSharedAccount({
                id: editingAccount.id,
                email: editEmail,
                password: editPassword,
                purchasePrice: editPurchasePrice,
                purchaseCurrency: editPurchaseCurrency,
                slots: editSlotsData.map(s => ({ id: s.id!, profileName: s.profileName, pinCode: s.pinCode }))
            });
            if (res.success) {
                toast.success("Compte mis à jour ✓");
                accountModal.onClose();
                loadInventory();
            } else {
                toast.error(res.error || "Erreur");
            }
        } catch {
            toast.error("Erreur serveur");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleLinkSubmit = async () => {
        if (!selectedLinkVariantId) { toast.error("Sélectionnez un produit"); return; }
        setIsLinking(true);
        try {
            const res = await linkProductToSharing({
                variantId: parseInt(selectedLinkVariantId),
                totalSlots: parseInt(linkTotalSlots) || 5
            });
            if (res.success) {
                toast.success("Produit converti ✓");
                linkModal.onClose();
                loadInventory();
            } else {
                toast.error(res.error || "Erreur");
            }
        } catch {
            toast.error("Erreur technique");
        } finally {
            setIsLinking(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success("Copié ✓");
    };

    const updateAddSlot = (index: number, field: "profileName" | "pinCode", value: string) => {
        setAddSlotsData(prev => { const d = [...prev]; d[index] = { ...d[index], [field]: value }; return d; });
    };

    const updateEditSlot = (index: number, field: "profileName" | "pinCode", value: string) => {
        setEditSlotsData(prev => { const d = [...prev]; d[index] = { ...d[index], [field]: value }; return d; });
    };

    // ── Progress bar color ────────────────────────────────────────────────────
    const progressColor = (rate: number) => {
        if (rate >= 90) return "bg-red-500";
        if (rate >= 60) return "bg-orange-400";
        return "bg-gradient-to-r from-emerald-500 to-emerald-400";
    };

    // ── Loading ───────────────────────────────────────────────────────────────
    if (isLoading) {
        return (
            <div className="flex h-[80vh] items-center justify-center bg-[#0a0a0a]">
                <Spinner color="primary" size="lg" label="Chargement inventaire..." classNames={{ label: "text-primary font-bold" }} />
            </div>
        );
    }

    const noVariants = sharingVariants.length === 0;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6 p-4 md:p-8 bg-[#0a0a0a] min-h-full">

            {/* ── Header ── */}
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-primary/10 rounded-xl border border-primary/20">
                        <Users className="text-primary w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-white tracking-tighter uppercase italic">Comptes Partagés</h1>
                        <p className="text-slate-500 text-xs">Gestion des abonnements multi-profils</p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
                        <Input
                            placeholder="Rechercher..."
                            value={searchTerm}
                            onValueChange={setSearchTerm}
                            classNames={{
                                input: "pl-8 text-white text-sm",
                                inputWrapper: "bg-[#161616] border border-[#262626] rounded-xl h-10 w-48"
                            }}
                        />
                    </div>
                    <Button variant="flat" startContent={<ExternalLink size={15} />}
                        className="h-10 px-4 text-sm font-bold rounded-xl bg-white/5 border border-white/10"
                        onClick={linkModal.onOpen}>
                        Lier SKU
                    </Button>
                </div>
            </header>

            {/* ── Stats ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: "Comptes", value: globalStats.totalAccounts, icon: ShieldCheck, color: "text-blue-400" },
                    { label: "Capacité", value: globalStats.totalSlots, icon: LayoutGrid, color: "text-purple-400" },
                    { label: "Occupés", value: globalStats.soldSlots, icon: User, color: "text-orange-400" },
                    { label: "Libres", value: globalStats.availableSlots, icon: CheckCircle2, color: "text-emerald-400" }
                ].map((s, i) => (
                    <Card key={i} className="bg-[#161616] border border-[#262626]" shadow="none">
                        <CardBody className="p-4 flex flex-row items-center gap-3">
                            <div className="p-2 rounded-xl bg-white/5">
                                <s.icon className={`w-5 h-5 ${s.color}`} />
                            </div>
                            <div>
                                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{s.label}</p>
                                <span className="text-xl font-black text-white">{s.value}</span>
                            </div>
                        </CardBody>
                    </Card>
                ))}
            </div>

            {/* ── Zone d'ajout unifiée ── */}
            <Card className="bg-[#111] border border-primary/20" shadow="none">
                <CardBody className="p-5">
                    {noVariants ? (
                        <div className="py-6 text-center space-y-2">
                            <AlertCircle className="w-8 h-8 text-slate-600 mx-auto" />
                            <p className="text-slate-400 text-sm font-bold">Aucun SKU partagé configuré.</p>
                            <p className="text-slate-600 text-xs">Utilisez le bouton <span className="text-primary font-bold">Lier SKU</span> pour commencer.</p>
                        </div>
                    ) : (
                        <Tabs
                            aria-label="Mode d'ajout"
                            color="primary"
                            variant="underlined"
                            classNames={{
                                tabList: "gap-6 border-b border-white/5 pb-0 mb-5",
                                cursor: "bg-primary",
                                tab: "font-black uppercase text-xs tracking-wider",
                            }}
                        >
                            {/* ── Onglet Compte unique ── */}
                            <Tab key="single" title="Compte unique">
                                <div className="space-y-4">
                                    {/* Product select */}
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] text-slate-500 font-black uppercase tracking-wider">Produit</label>
                                        <Select
                                            items={sharingVariants}
                                            placeholder="Sélectionner un produit..."
                                            selectedKeys={addVariantId ? [addVariantId] : []}
                                            onChange={(e) => setAddVariantId(e.target.value)}
                                            classNames={{ trigger: "bg-[#1a1a1a] border border-white/5 h-12 rounded-xl" }}
                                        >
                                            {(v) => (
                                                <SelectItem key={v.id.toString()} textValue={`${v.product.name} - ${v.name}`}>
                                                    <div className="flex flex-col py-1">
                                                        <span className="text-[10px] text-slate-500 font-bold uppercase">{v.product.name}</span>
                                                        <span className="text-sm text-white font-black">
                                                            {v.name}
                                                            <span className="text-primary text-xs font-bold"> · {v.totalSlots} slots</span>
                                                        </span>
                                                    </div>
                                                </SelectItem>
                                            )}
                                        </Select>
                                    </div>

                                    {/* Fields — shown only after variant selected */}
                                    {addVariantId && (
                                        <>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                <div className="space-y-1.5">
                                                    <label className="text-[10px] text-slate-500 uppercase font-black">Email</label>
                                                    <Input
                                                        placeholder="email@example.com"
                                                        value={addEmail}
                                                        onValueChange={setAddEmail}
                                                        startContent={<Mail size={14} className="text-primary/70" />}
                                                        classNames={{ inputWrapper: "bg-[#1a1a1a] border border-white/5 h-12 rounded-xl", input: "text-white font-bold" }}
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-[10px] text-slate-500 uppercase font-black">Mot de passe</label>
                                                    <Input
                                                        placeholder="••••••••"
                                                        value={addPassword}
                                                        onValueChange={setAddPassword}
                                                        startContent={<Key size={14} className="text-primary/70" />}
                                                        classNames={{ inputWrapper: "bg-[#1a1a1a] border border-white/5 h-12 rounded-xl", input: "text-white font-bold" }}
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-1.5">
                                                <label className="text-[10px] text-slate-500 uppercase font-black">Prix d'achat (Total Compte)</label>
                                                <div className="flex gap-2">
                                                    <Input
                                                        placeholder="0.00"
                                                        value={addPurchasePrice}
                                                        onValueChange={setAddPurchasePrice}
                                                        classNames={{ inputWrapper: "bg-[#1a1a1a] border border-white/5 h-12 rounded-xl flex-1", input: "text-white font-bold" }}
                                                    />
                                                    <div className="flex bg-[#1a1a1a] border border-white/5 rounded-xl p-1 gap-1 h-12 items-center">
                                                        {['DZD', '$'].map(curr => (
                                                            <Button
                                                                key={curr}
                                                                size="sm"
                                                                variant={addPurchaseCurrency === curr ? "solid" : "light"}
                                                                color={addPurchaseCurrency === curr ? "primary" : "default"}
                                                                className={`min-w-[40px] h-10 font-black rounded-lg ${addPurchaseCurrency === curr ? 'bg-primary text-black' : 'text-slate-500'}`}
                                                                onClick={() => setAddPurchaseCurrency(curr)}
                                                            >
                                                                {curr}
                                                            </Button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            {addSlotsData.length > 0 && (
                                                <div className="space-y-2">
                                                    <label className="text-[10px] text-slate-500 font-black uppercase">
                                                        Profils ({addSlotsData.length})
                                                    </label>
                                                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                                        {addSlotsData.map((slot, index) => (
                                                            <div key={index} className="flex items-center gap-3 bg-[#1a1a1a] p-3 rounded-xl border border-white/5">
                                                                <div className="size-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
                                                                    <span className="text-xs font-black text-purple-400">{index + 1}</span>
                                                                </div>
                                                                <Input
                                                                    placeholder="Nom du profil"
                                                                    size="sm"
                                                                    value={slot.profileName}
                                                                    onValueChange={(v) => updateAddSlot(index, "profileName", v)}
                                                                    classNames={{ inputWrapper: "bg-[#222] h-9 border border-white/5 flex-1", input: "text-xs text-white" }}
                                                                />
                                                                <Input
                                                                    placeholder="PIN"
                                                                    size="sm"
                                                                    value={slot.pinCode}
                                                                    onValueChange={(v) => updateAddSlot(index, "pinCode", v)}
                                                                    startContent={<Key size={11} className="text-slate-600" />}
                                                                    classNames={{ inputWrapper: "bg-[#222] h-9 border border-white/5 w-28", input: "text-xs font-mono text-purple-400" }}
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            <Button
                                                color="primary"
                                                className="w-full font-black uppercase h-11 rounded-xl bg-gradient-to-tr from-primary to-orange-600"
                                                onClick={handleInlineAdd}
                                                isLoading={isAdding}
                                                startContent={!isAdding && <Plus size={16} />}
                                            >
                                                Ajouter le compte
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </Tab>

                            {/* ── Onglet Multi-lignes ── */}
                            <Tab key="multi" title="Multi-lignes">
                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] text-slate-500 font-black uppercase tracking-wider">Produit cible</label>
                                        <Select
                                            items={sharingVariants}
                                            placeholder="Sélectionner un produit..."
                                            selectedKeys={quickVariantId ? [quickVariantId] : []}
                                            onChange={(e) => setQuickVariantId(e.target.value)}
                                            classNames={{ trigger: "bg-[#1a1a1a] border border-white/5 h-12 rounded-xl" }}
                                        >
                                            {(v) => (
                                                <SelectItem key={v.id.toString()} textValue={`${v.product.name} (${v.totalSlots}P)`}>
                                                    <span className="text-sm font-bold text-white">{v.product.name}
                                                        <span className="text-slate-500"> · {v.totalSlots}P</span>
                                                    </span>
                                                </SelectItem>
                                            )}
                                        </Select>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[10px] text-slate-500 font-black uppercase tracking-wider">
                                            Comptes — format : <span className="text-primary font-mono">email | password</span> (un par ligne)
                                        </label>
                                        <div className="flex flex-col md:flex-row gap-3 items-start">
                                            <div className="flex-1 w-full space-y-3">
                                                <Textarea
                                                    placeholder={"email1@exemple.com | motdepasse1\nemail2@exemple.com | motdepasse2"}
                                                    value={quickRawInput}
                                                    onValueChange={setQuickRawInput}
                                                    minRows={3}
                                                    maxRows={8}
                                                    classNames={{
                                                        inputWrapper: "bg-[#1a1a1a] border border-white/10 w-full",
                                                        input: "font-mono text-primary text-sm"
                                                    }}
                                                />
                                                <div className="flex gap-2 items-end">
                                                    <Input
                                                        label="Prix d'achat (par compte)"
                                                        placeholder="0.00"
                                                        value={quickPurchasePrice}
                                                        onValueChange={setQuickPurchasePrice}
                                                        classNames={{ inputWrapper: "bg-[#1a1a1a] border border-white/5 h-12 rounded-xl flex-1", input: "text-white font-bold" }}
                                                    />
                                                    <div className="flex bg-[#1a1a1a] border border-white/5 rounded-xl p-1 gap-1 h-12 items-center">
                                                        {['DZD', '$'].map(curr => (
                                                            <Button
                                                                key={curr}
                                                                size="sm"
                                                                variant={quickPurchaseCurrency === curr ? "solid" : "light"}
                                                                color={quickPurchaseCurrency === curr ? "primary" : "default"}
                                                                className={`min-w-[40px] h-10 font-black rounded-lg ${quickPurchaseCurrency === curr ? 'bg-primary text-black' : 'text-slate-500'}`}
                                                                onClick={() => setQuickPurchaseCurrency(curr)}
                                                            >
                                                                {curr}
                                                            </Button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                            <Button
                                                color="primary"
                                                className="h-auto min-h-[88px] px-6 font-black uppercase rounded-xl"
                                                onClick={handleQuickSubmit}
                                                isLoading={isQuickSubmitting}
                                                isDisabled={validLineCount === 0 || !quickVariantId}
                                                startContent={!isQuickSubmitting && <Plus size={18} />}
                                            >
                                                Importer{validLineCount > 0 ? ` ${validLineCount}` : ""}
                                            </Button>
                                        </div>
                                    </div>

                                    {quickErrors.length > 0 && (
                                        <div className="bg-danger/5 border border-danger/20 rounded-xl p-3 space-y-1">
                                            <div className="flex items-center justify-between">
                                                <p className="text-[10px] font-black text-danger uppercase flex items-center gap-1.5">
                                                    <AlertCircle size={11} /> {quickErrors.length} ligne(s) ignorée(s)
                                                </p>
                                                <button onClick={() => setQuickErrors([])} className="text-[9px] text-slate-500 hover:text-white">Fermer</button>
                                            </div>
                                            <div className="space-y-0.5 max-h-24 overflow-y-auto">
                                                {quickErrors.map((e, i) => (
                                                    <p key={i} className="text-[10px] text-slate-400 font-mono pl-3 border-l border-danger/20">{e}</p>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </Tab>
                        </Tabs>
                    )}
                </CardBody>
            </Card>

            {/* ── Main Tabs ── */}
            <Tabs
                aria-label="Main View"
                variant="bordered"
                classNames={{
                    tabList: "bg-[#111] p-1 rounded-2xl border border-white/5 w-full sm:w-auto",
                    cursor: "bg-primary",
                    tab: "font-black uppercase text-xs tracking-wider h-10 px-8",
                }}
                onSelectionChange={(key) => {
                    if (key === "history") loadHistory();
                }}
            >
                <Tab key="inventory" title="Inventaire">
                    <div className="space-y-10 mt-6">
                        {/* ── Product Tabs ── */}
                        {productNames.length > 1 && (
                            <div className="flex gap-2 flex-wrap">
                                <button
                                    onClick={() => setActiveProduct(null)}
                                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase transition-all border ${!activeProduct
                                        ? 'bg-primary text-white border-primary'
                                        : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10'}`}
                                >
                                    Tous ({inventory.length})
                                </button>
                                {productNames.map(name => {
                                    const count = groupedInventory[name]?.length || 0;
                                    return (
                                        <button key={name}
                                            onClick={() => setActiveProduct(name)}
                                            className={`px-4 py-2 rounded-xl text-xs font-black uppercase transition-all border ${activeProduct === name
                                                ? 'bg-primary text-white border-primary'
                                                : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10'}`}
                                        >
                                            {name} ({count})
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {Object.keys(filteredInventory).length === 0 ? (
                            <div className="py-24 text-center border-2 border-dashed border-white/5 rounded-3xl bg-[#111]">
                                <AlertCircle className="w-10 h-10 text-slate-700 mx-auto mb-4" />
                                <h3 className="text-lg font-bold text-white mb-1">Aucun compte trouvé</h3>
                                <p className="text-slate-500 text-sm">Modifiez votre recherche ou ajoutez un compte.</p>
                            </div>
                        ) : (
                            Object.entries(filteredInventory).map(([productName, variants]) => {
                                let pAccounts = 0, pSlots = 0, pSold = 0;
                                variants.forEach(v => v.digitalCodes?.forEach((acc: any) => {
                                    pAccounts++;
                                    acc.slots?.forEach((s: any) => { pSlots++; if (s.status === "VENDU") pSold++; });
                                }));

                                return (
                                    <section key={productName} className="space-y-4">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#262626] pb-3">
                                            <div className="flex items-center gap-3">
                                                <div className="size-2.5 rounded-full bg-primary shadow-[0_0_8px_rgba(236,91,19,0.4)]" />
                                                <h2 className="text-lg font-black text-white uppercase tracking-tighter italic">{productName}</h2>
                                                <Chip size="sm" variant="flat" color="primary" className="font-black bg-primary/10 text-[9px]">
                                                    {pAccounts} comptes
                                                </Chip>
                                            </div>
                                            <div className="flex items-center gap-3 text-[10px] font-bold">
                                                <span className="text-emerald-400">{pSlots - pSold} libres</span>
                                                <span className="text-slate-600">·</span>
                                                <span className="text-orange-400">{pSold} occupés</span>
                                                <span className="text-slate-600">·</span>
                                                <span className="text-slate-500">{pSlots} total</span>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                            {variants.map(variant => variant.digitalCodes?.map((account: any, accIndex: number) => {
                                                const soldCount = account.slots?.filter((s: any) => s.status === "VENDU").length ?? 0;
                                                const total = account.slots?.length ?? 0;
                                                const rate = total > 0 ? (soldCount / total) * 100 : 0;
                                                const isFull = total > 0 && soldCount === total;
                                                const hasExpiry = !!account.expiresAt;
                                                const isExpired = hasExpiry && new Date(account.expiresAt) < new Date();

                                                return (
                                                    <Card key={account.id}
                                                        className={`bg-[#121212] border group hover:border-primary/40 transition-all duration-200 ${isFull ? 'border-red-500/30' : 'border-[#222]'}`}
                                                        shadow="none">
                                                        <CardBody className="p-5 space-y-4">
                                                            {/* Card header */}
                                                            <div className="flex justify-between items-center">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <span className="text-base font-black text-primary italic">#{accIndex + 1}</span>
                                                                    <Chip size="sm" className="h-4 text-[9px] font-black bg-white/5 text-slate-400">{variant.name}</Chip>
                                                                    {isFull && <Chip size="sm" className="h-4 text-[9px] font-black bg-red-500/10 text-red-400">Complet</Chip>}
                                                                    {isExpired && <Chip size="sm" className="h-4 text-[9px] font-black bg-yellow-500/10 text-yellow-400">Expiré</Chip>}
                                                                </div>

                                                                <div className="flex flex-col items-end gap-1">
                                                                    <div className="flex gap-1 bg-[#1a1a1a] p-1 rounded-xl border border-white/5">
                                                                        <Button isIconOnly size="sm" variant="light"
                                                                            className="h-7 w-7 text-slate-400 hover:text-primary hover:bg-primary/10"
                                                                            onClick={() => handleEditClick(account, variant)}>
                                                                            <Edit3 size={13} />
                                                                        </Button>
                                                                        <Button isIconOnly size="sm" variant="light"
                                                                            isDisabled={soldCount > 0}
                                                                            className={`h-7 w-7 ${soldCount > 0 ? 'opacity-20 cursor-not-allowed text-slate-600' : 'text-slate-400 hover:text-danger hover:bg-danger/10'}`}
                                                                            onClick={() => soldCount === 0 && handleDeleteClick(account.id)}>
                                                                            <Trash2 size={13} />
                                                                        </Button>
                                                                    </div>
                                                                    {account.purchasePrice && (
                                                                        <span className="text-[10px] font-black text-slate-500 tabular-nums">
                                                                            COST: {account.purchasePrice} {account.purchaseCurrency}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Occupation */}
                                                            <div className="space-y-1.5">
                                                                <div className="flex justify-between items-center">
                                                                    <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Profils</span>
                                                                    <span className="text-base font-black text-white tabular-nums">
                                                                        {soldCount}<span className="text-slate-600 text-xs">/{total}</span>
                                                                    </span>
                                                                </div>
                                                                <Progress
                                                                    value={rate}
                                                                    size="sm"
                                                                    radius="full"
                                                                    classNames={{
                                                                        base: "bg-white/5 h-1.5",
                                                                        indicator: progressColor(rate)
                                                                    }}
                                                                />
                                                            </div>

                                                            {/* Slots list */}
                                                            <div className="space-y-1.5">
                                                                {account.slots?.map((slot: any) => {
                                                                    const occupied = slot.status === "VENDU";
                                                                    return (
                                                                        <div key={slot.id}
                                                                            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-[11px] font-bold
                                                                                ${occupied
                                                                                    ? 'bg-orange-500/5 border-orange-500/20 text-orange-300'
                                                                                    : 'bg-white/[0.02] border-white/5 text-slate-500'}`}
                                                                        >
                                                                            <div className={`size-1.5 rounded-full shrink-0 ${occupied ? 'bg-orange-400' : 'bg-emerald-500'}`} />
                                                                            <span className="text-slate-400 text-[10px] w-14 shrink-0 font-black">
                                                                                {slot.profileName || `Profil ${slot.slotNumber}`}
                                                                            </span>
                                                                            {occupied ? (
                                                                                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                                                                    <span className="truncate text-orange-300">
                                                                                        {slot.orderItem?.order?.client?.nomComplet || "Client"}
                                                                                    </span>
                                                                                    <span className="text-slate-600 shrink-0">
                                                                                        #{slot.orderItem?.order?.orderNumber}
                                                                                    </span>
                                                                                </div>
                                                                            ) : (
                                                                                <span className="text-emerald-600 text-[10px]">Disponible</span>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>

                                                            {/* Footer */}
                                                            <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                                                                <div className="flex items-center gap-1.5 text-slate-500">
                                                                    <Calendar size={10} className="text-primary/40" />
                                                                    <span className="text-[9px] font-bold uppercase">
                                                                        {new Date(account.createdAt).toLocaleDateString("fr-FR")}
                                                                    </span>
                                                                </div>
                                                                {hasExpiry && (
                                                                    <span className={`text-[9px] font-bold uppercase flex items-center gap-1 ${isExpired ? 'text-yellow-400' : 'text-slate-500'}`}>
                                                                        <Clock size={9} />
                                                                        {new Date(account.expiresAt).toLocaleDateString("fr-FR")}
                                                                    </span>
                                                                )}
                                                                <div className={`h-2 w-2 rounded-full ${isFull
                                                                    ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                                                                    : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'}`} />
                                                            </div>
                                                        </CardBody>
                                                    </Card>
                                                );
                                            }))}
                                        </div>
                                    </section>
                                );
                            })
                        )}
                    </div>
                </Tab>

                <Tab key="history" title="Historique">
                    <div className="mt-6">
                        {isLoadingHistory ? (
                            <div className="flex justify-center py-24">
                                <Spinner label="Chargement de l'historique..." />
                            </div>
                        ) : history.length === 0 ? (
                            <div className="py-24 text-center border-2 border-dashed border-white/5 rounded-3xl bg-[#111]">
                                <Clock className="w-10 h-10 text-slate-700 mx-auto mb-4" />
                                <h3 className="text-lg font-bold text-white mb-1">Historique vide</h3>
                                <p className="text-slate-500 text-sm">Les comptes entièrement vendus apparaîtront ici.</p>
                            </div>
                        ) : (
                            <Table
                                aria-label="Historique des ventes"
                                className="dark"
                                removeWrapper
                                classNames={{
                                    th: "bg-[#111] text-slate-500 font-black uppercase text-[10px] border-b border-white/5",
                                    td: "py-4 border-b border-white/5 text-sm font-bold"
                                }}
                            >
                                <TableHeader>
                                    <TableColumn>COMPTE / PRODUIT</TableColumn>
                                    <TableColumn>VENDU LE</TableColumn>
                                    <TableColumn>CLIENTS / COMMANDES</TableColumn>
                                </TableHeader>
                                <TableBody>
                                    {history.map((account) => (
                                        <TableRow key={account.id}>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="text-white font-black">{account.code}</span>
                                                    <span className="text-[10px] text-primary font-bold uppercase">{account.variant?.product?.name} - {account.variant?.name}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="text-slate-400">
                                                    {new Date(account.updatedAt || account.createdAt).toLocaleDateString("fr-FR", {
                                                        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
                                                    })}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-2">
                                                    {account.slots.filter((s: any) => s.status === "VENDU").map((s: any) => (
                                                        <div key={s.id} className="flex items-center gap-2 bg-white/5 p-1 px-2 rounded-lg border border-white/5">
                                                            <div className="flex-1">
                                                                <span className="text-white text-xs">{s.profileName}: </span>
                                                                <span className="text-orange-400 text-xs">{s.orderItem?.order?.client?.nomComplet}</span>
                                                                {s.orderItem?.order?.client?.phoneNumber && (
                                                                    <span className="text-slate-500 text-[10px] ml-2">({s.orderItem?.order?.client?.phoneNumber})</span>
                                                                )}
                                                            </div>
                                                            <Chip size="sm" variant="flat" className="h-5 text-[9px] font-black bg-white/5">
                                                                #{s.orderItem?.order?.orderNumber}
                                                            </Chip>
                                                        </div>
                                                    ))}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                </Tab>
            </Tabs>

            {/* ── Edit Modal ── */}
            <Modal isOpen={accountModal.isOpen} onClose={accountModal.onClose}
                className="dark bg-[#111] border border-white/10" backdrop="blur" size="2xl" scrollBehavior="inside">
                <ModalContent>
                    {(close) => (
                        <>
                            <ModalHeader className="pb-4">
                                <div>
                                    <h2 className="text-xl font-black text-white uppercase italic">Modifier le compte</h2>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">
                                        Données chiffrées — niveau 2
                                    </p>
                                </div>
                            </ModalHeader>
                            <ModalBody className="space-y-6 py-6 border-y border-white/5">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white/[0.02] p-4 rounded-2xl border border-white/5">
                                    <div className="space-y-2">
                                        <label className="text-[10px] text-slate-500 uppercase font-black ml-1">Email</label>
                                        <Input placeholder="email@example.com" value={editEmail} onValueChange={setEditEmail}
                                            startContent={<Mail size={14} className="text-primary/70" />}
                                            classNames={{ inputWrapper: "bg-[#1a1a1a] border border-white/5 h-12 rounded-xl", input: "text-white font-bold" }} />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] text-slate-500 uppercase font-black ml-1">Mot de passe</label>
                                        <Input placeholder="••••••••" type="text" value={editPassword} onValueChange={setEditPassword}
                                            startContent={<Key size={14} className="text-primary/70" />}
                                            classNames={{ inputWrapper: "bg-[#1a1a1a] border border-white/5 h-12 rounded-xl", input: "text-white font-bold" }} />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] text-slate-500 uppercase font-black ml-1">Prix d'achat</label>
                                        <div className="flex gap-2">
                                            <Input
                                                placeholder="0.00"
                                                value={editPurchasePrice}
                                                onValueChange={setEditPurchasePrice}
                                                classNames={{ inputWrapper: "bg-[#1a1a1a] border border-white/5 h-12 rounded-xl flex-1", input: "text-white font-bold" }}
                                            />
                                            <div className="flex bg-[#1a1a1a] border border-white/5 rounded-xl p-1 gap-1 h-12 items-center">
                                                {['DZD', '$'].map(curr => (
                                                    <Button
                                                        key={curr}
                                                        size="sm"
                                                        variant={editPurchaseCurrency === curr ? "solid" : "light"}
                                                        color={editPurchaseCurrency === curr ? "primary" : "default"}
                                                        className={`min-w-[40px] h-10 font-black rounded-lg ${editPurchaseCurrency === curr ? 'bg-primary text-black' : 'text-slate-500'}`}
                                                        onClick={() => setEditPurchaseCurrency(curr)}
                                                    >
                                                        {curr}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {editSlotsData.length > 0 && (
                                    <div className="space-y-3">
                                        <label className="text-[10px] text-slate-500 font-black uppercase ml-1">
                                            Profils ({editSlotsData.length})
                                        </label>
                                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                            {editSlotsData.map((slot, index) => (
                                                <div key={index} className="flex items-center gap-3 bg-[#1a1a1a] p-3 rounded-xl border border-white/5">
                                                    <div className="size-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
                                                        <span className="text-xs font-black text-purple-400">{index + 1}</span>
                                                    </div>
                                                    <Input placeholder="Nom du profil" size="sm" value={slot.profileName}
                                                        onValueChange={(v) => updateEditSlot(index, "profileName", v)}
                                                        classNames={{ inputWrapper: "bg-[#222] h-10 border border-white/5 flex-1", input: "text-xs text-white" }} />
                                                    <Input placeholder="PIN" size="sm" value={slot.pinCode}
                                                        onValueChange={(v) => updateEditSlot(index, "pinCode", v)}
                                                        startContent={<Key size={11} className="text-slate-600" />}
                                                        classNames={{ inputWrapper: "bg-[#222] h-10 border border-white/5 w-28", input: "text-xs font-mono text-purple-400" }} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </ModalBody>
                            <ModalFooter className="p-4 bg-[#0c0c0c]">
                                <Button variant="light" onPress={close} className="font-bold text-slate-500 h-11">Annuler</Button>
                                <Button color="primary" onPress={handleEditSubmit} isLoading={isSubmitting}
                                    className="font-black uppercase px-10 h-11 rounded-xl bg-gradient-to-tr from-primary to-orange-600">
                                    Enregistrer
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>

            {/* ── Delete Confirmation Modal ── */}
            <Modal isOpen={deleteModal.isOpen} onClose={deleteModal.onClose}
                className="dark bg-[#111] border border-danger/20" backdrop="blur" size="sm">
                <ModalContent>
                    {(close) => (
                        <>
                            <ModalHeader>
                                <h2 className="text-lg font-black text-white uppercase italic">Supprimer ce compte ?</h2>
                            </ModalHeader>
                            <ModalBody className="py-4">
                                <div className="flex items-start gap-3 p-4 bg-danger/5 rounded-xl border border-danger/20">
                                    <AlertCircle className="text-danger size-5 shrink-0 mt-0.5" />
                                    <p className="text-sm text-slate-300">
                                        Action <strong className="text-danger">irréversible</strong>. Le compte et tous ses profils seront définitivement supprimés.
                                    </p>
                                </div>
                            </ModalBody>
                            <ModalFooter className="p-4 bg-[#0c0c0c]">
                                <Button variant="light" onPress={close} className="font-bold text-slate-500 h-11">Annuler</Button>
                                <Button color="danger" onPress={handleDeleteConfirm} isLoading={isDeleting}
                                    className="font-black uppercase px-8 h-11 rounded-xl">
                                    Supprimer définitivement
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>

            {/* ── Link SKU Modal ── */}
            <Modal isOpen={linkModal.isOpen} onClose={linkModal.onClose}
                className="dark bg-[#111] border border-white/10" backdrop="blur">
                <ModalContent>
                    {(close) => (
                        <>
                            <ModalHeader>
                                <div>
                                    <h2 className="text-lg font-black text-white uppercase italic">Activer le mode partagé</h2>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">Convertir un SKU en abonnement multi-profils</p>
                                </div>
                            </ModalHeader>
                            <ModalBody className="space-y-5 py-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] text-slate-500 font-black uppercase ml-1">Variante à convertir</label>
                                    <Select items={linkableVariants} placeholder="Sélectionner un SKU..." className="dark"
                                        selectedKeys={selectedLinkVariantId ? [selectedLinkVariantId] : []}
                                        onChange={(e) => setSelectedLinkVariantId(e.target.value)}
                                        classNames={{ trigger: "bg-[#1a1a1a] border border-white/5 h-14 rounded-xl" }}>
                                        {(v) => (
                                            <SelectItem key={v.id.toString()} textValue={`${v.product.name} - ${v.name}`}>
                                                <div className="flex flex-col py-1">
                                                    <span className="text-[10px] text-slate-500 font-bold uppercase">{v.product.name}</span>
                                                    <span className="text-sm text-white font-black">{v.name}</span>
                                                </div>
                                            </SelectItem>
                                        )}
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] text-slate-500 font-black uppercase ml-1">Nombre de profils par compte</label>
                                    <Input type="number" placeholder="5" value={linkTotalSlots} onValueChange={setLinkTotalSlots}
                                        min={1} max={20}
                                        startContent={<LayoutGrid size={16} className="text-slate-600" />}
                                        classNames={{ inputWrapper: "bg-[#1a1a1a] border border-white/5 h-14 rounded-xl", input: "text-xl font-black text-white" }} />
                                    <p className="text-[10px] text-slate-500 ml-1">Ex: Netflix → 5 profils, Spotify → 6 places</p>
                                </div>
                            </ModalBody>
                            <ModalFooter className="p-4 bg-[#0c0c0c]">
                                <Button variant="light" onPress={close} className="font-bold text-slate-500 h-11">Annuler</Button>
                                <Button color="primary" onPress={handleLinkSubmit} isLoading={isLinking}
                                    className="font-black uppercase px-8 h-11 rounded-xl bg-gradient-to-tr from-primary to-orange-500">
                                    Convertir en partagé
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>
        </div>
    );
}
