"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import {
    getSharedAccountsInventory,
    addSharedAccount,
    addSharedAccountQuick,
    updateSharedAccount,
    deleteSharedAccount,
    getSharingVariants,
    getAvailableVariantsForLinking,
    linkProductToSharing,
    syncWithNotion
} from "./actions";
import {
    Users, Mail, LayoutGrid, CheckCircle2, Search, User, Calendar,
    Activity, ShieldCheck, AlertCircle, Copy, Plus, Edit3, Trash2,
    Key, ExternalLink, Zap, RefreshCw, Clock
} from "lucide-react";
import toast from "react-hot-toast";
import {
    Input, Button, Chip, Card, CardBody, Tooltip, Spinner,
    Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
    useDisclosure, Select, SelectItem, Progress, Textarea, Switch
} from "@heroui/react";

export default function SharedAccountsContent() {
    // ── Data ─────────────────────────────────────────────────────────────────
    const [inventory, setInventory] = useState<any[]>([]);
    const [sharingVariants, setSharingVariants] = useState<any[]>([]);
    const [linkableVariants, setLinkableVariants] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeProduct, setActiveProduct] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");

    // ── Quick entry ───────────────────────────────────────────────────────────
    const [quickVariantId, setQuickVariantId] = useState("");
    const [quickRawInput, setQuickRawInput] = useState("");
    const [isQuickSubmitting, setIsQuickSubmitting] = useState(false);
    const [quickErrors, setQuickErrors] = useState<string[]>([]);
    const [autoClassify, setAutoClassify] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);

    // ── Modals ────────────────────────────────────────────────────────────────
    const accountModal = useDisclosure();
    const deleteModal = useDisclosure();
    const linkModal = useDisclosure();

    // ── Account form ──────────────────────────────────────────────────────────
    const [modalMode, setModalMode] = useState<"ADD" | "EDIT">("ADD");
    const [editingAccount, setEditingAccount] = useState<any>(null);
    const [selectedVariantId, setSelectedVariantId] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [slotsData, setSlotsData] = useState<{ id?: number; profileName: string; pinCode: string }[]>([]);
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

    useEffect(() => {
        loadInventory();
        const interval = setInterval(loadInventory, 30_000);
        return () => clearInterval(interval);
    }, [loadInventory]);

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

    // ── Slot auto-fill on variant select ─────────────────────────────────────
    useEffect(() => {
        if (modalMode !== "ADD" || !selectedVariantId || !sharingVariants.length) return;
        const variant = sharingVariants.find(v => v.id.toString() === selectedVariantId);
        if (!variant) return;
        setSlotsData(Array.from({ length: variant.totalSlots || 0 }, (_, i) => ({
            profileName: `Profil ${i + 1}`, pinCode: ""
        })));
    }, [selectedVariantId, modalMode, sharingVariants]);

    // ── Handlers ──────────────────────────────────────────────────────────────
    const resetForm = () => {
        setSelectedVariantId(""); setEmail(""); setPassword("");
        setSlotsData([]); setEditingAccount(null);
    };

    const handleAddClick = () => {
        setModalMode("ADD"); resetForm(); accountModal.onOpen();
    };

    const handleEditClick = (account: any, variant: any) => {
        setModalMode("EDIT");
        setEditingAccount(account);
        setSelectedVariantId(variant.id.toString());
        const parts = account.code.split(" | ");
        setEmail(parts[0] || account.code);
        setPassword(parts[1] || "");
        setSlotsData(account.slots.map((s: any) => ({
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

    const handleSubmit = async () => {
        if (modalMode === "ADD" && !selectedVariantId) { toast.error("Sélectionnez une variante"); return; }
        if (!email || !password) { toast.error("Email et mot de passe requis"); return; }
        setIsSubmitting(true);
        try {
            const res = modalMode === "ADD"
                ? await addSharedAccount({ variantId: parseInt(selectedVariantId), email, password, slots: slotsData })
                : await updateSharedAccount({
                    id: editingAccount.id, email, password,
                    slots: slotsData.map(s => ({ id: s.id!, profileName: s.profileName, pinCode: s.pinCode }))
                });
            if (res.success) {
                toast.success(modalMode === "ADD" ? "Compte ajouté ✓" : "Compte mis à jour ✓");
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

    const handleQuickSubmit = async () => {
        if (!autoClassify && !quickVariantId) { toast.error("Sélectionnez un SKU ou activez l'Auto-Détection"); return; }
        if (!quickRawInput.trim()) { toast.error("Collez des identifiants"); return; }
        setIsQuickSubmitting(true);
        setQuickErrors([]);
        try {
            const res = await addSharedAccountQuick({
                variantId: quickVariantId ? parseInt(quickVariantId) : undefined,
                rawInput: quickRawInput,
                autoClassify
            });
            if (res.success) {
                toast.success(res.message || "Insertion terminée");
                if (res.errors?.length) setQuickErrors(res.errors);
                setQuickRawInput("");
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

    const handleNotionSync = async () => {
        setIsSyncing(true);
        const tid = toast.loading("Synchronisation Notion...");
        try {
            const res = await syncWithNotion({});
            if (res.success) {
                toast.success("Sync terminée ✓", { id: tid });
                loadInventory();
            } else {
                toast.error(res.error || "Erreur", { id: tid });
            }
        } catch {
            toast.error("Erreur serveur", { id: tid });
        } finally {
            setIsSyncing(false);
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

    const updateSlot = (index: number, field: "profileName" | "pinCode", value: string) => {
        setSlotsData(prev => { const d = [...prev]; d[index] = { ...d[index], [field]: value }; return d; });
    };

    // ── Loading ───────────────────────────────────────────────────────────────
    if (isLoading) {
        return (
            <div className="flex h-[80vh] items-center justify-center bg-[#0a0a0a]">
                <Spinner color="primary" size="lg" label="Chargement inventaire..." classNames={{ label: "text-primary font-bold" }} />
            </div>
        );
    }

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
                    <Button variant="flat" isLoading={isSyncing} startContent={!isSyncing && <RefreshCw size={15} />}
                        className="h-10 px-4 text-sm font-bold rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20"
                        onClick={handleNotionSync}>
                        Notion
                    </Button>
                    <Button variant="flat" startContent={<ExternalLink size={15} />}
                        className="h-10 px-4 text-sm font-bold rounded-xl bg-white/5 border border-white/10"
                        onClick={linkModal.onOpen}>
                        Lier SKU
                    </Button>
                    <Button color="primary" startContent={<Plus size={15} />}
                        className="h-10 px-4 text-sm font-bold rounded-xl"
                        onClick={handleAddClick}>
                        Nouveau
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

            {/* ── Quick Entry ── */}
            <Card className="bg-[#111] border border-primary/20" shadow="none">
                <CardBody className="p-0">
                    <div className="flex flex-col md:flex-row">
                        {/* Left config panel */}
                        <div className="p-5 md:w-64 bg-primary/5 border-b md:border-b-0 md:border-r border-white/5 space-y-3 shrink-0">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Zap className="text-primary size-4" />
                                    <span className="font-black text-white text-sm uppercase italic">Insertion rapide</span>
                                </div>
                                <Tooltip content="Détecter le produit automatiquement via le texte">
                                    <Switch size="sm" color="primary" isSelected={autoClassify} onValueChange={setAutoClassify} />
                                </Tooltip>
                            </div>
                            <p className="text-[10px] text-slate-500 leading-relaxed">
                                {autoClassify
                                    ? "Format : [Produit] | [Email] | [Pass]"
                                    : "Format : [Email] | [Pass] — sélectionnez le SKU cible"}
                            </p>
                            {!autoClassify && (
                                <Select items={sharingVariants} placeholder="SKU cible..." size="sm"
                                    selectedKeys={quickVariantId ? [quickVariantId] : []}
                                    onChange={(e) => setQuickVariantId(e.target.value)}
                                    classNames={{ trigger: "bg-[#1a1a1a] border border-white/10 h-10" }}>
                                    {(v) => (
                                        <SelectItem key={v.id.toString()} textValue={`${v.product.name} (${v.totalSlots}P)`}>
                                            <span className="text-xs font-bold">{v.product.name}
                                                <span className="text-slate-500"> · {v.totalSlots}P</span>
                                            </span>
                                        </SelectItem>
                                    )}
                                </Select>
                            )}
                            {autoClassify && (
                                <div className="p-2 rounded-lg bg-primary/5 border border-primary/20">
                                    <p className="text-[10px] font-black text-primary uppercase">Auto-détection active</p>
                                </div>
                            )}
                        </div>

                        {/* Right input area */}
                        <div className="flex-1 p-5 flex flex-col gap-3">
                            <div className="flex gap-3 items-start">
                                <Textarea
                                    placeholder={autoClassify
                                        ? "Netflix | user@mail.com | password\nSpotify | user2@mail.com | pass123"
                                        : "email@exemple.com | motdepasse"}
                                    value={quickRawInput}
                                    onValueChange={setQuickRawInput}
                                    minRows={2}
                                    maxRows={6}
                                    classNames={{
                                        inputWrapper: "bg-[#1a1a1a] border border-white/10 flex-1",
                                        input: "font-mono text-primary text-sm"
                                    }}
                                />
                                <Button color="primary"
                                    className="h-auto min-h-[72px] px-6 font-black uppercase rounded-xl"
                                    onClick={handleQuickSubmit}
                                    isLoading={isQuickSubmitting}
                                    startContent={!isQuickSubmitting && <Plus size={18} />}>
                                    Injecter
                                </Button>
                            </div>

                            {/* Inline errors */}
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
                    </div>
                </CardBody>
            </Card>

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

            {/* ── Inventory ── */}
            <div className="space-y-10">
                {Object.keys(filteredInventory).length === 0 ? (
                    <div className="py-24 text-center border-2 border-dashed border-white/5 rounded-3xl bg-[#111]">
                        <AlertCircle className="w-10 h-10 text-slate-700 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-white mb-1">Aucun compte trouvé</h3>
                        <p className="text-slate-500 text-sm">Modifiez votre recherche ou ajoutez un compte.</p>
                    </div>
                ) : (
                    Object.entries(filteredInventory).map(([productName, variants]) => {
                        // Per-product stats
                        let pAccounts = 0, pSlots = 0, pSold = 0;
                        variants.forEach(v => v.digitalCodes?.forEach((acc: any) => {
                            pAccounts++;
                            acc.slots?.forEach((s: any) => { pSlots++; if (s.status === "VENDU") pSold++; });
                        }));

                        return (
                            <section key={productName} className="space-y-4">
                                {/* Group header */}
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

                                {/* Cards grid */}
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
                                                    <div className="flex justify-between items-start gap-2">
                                                        <div className="space-y-1.5 min-w-0 flex-1">
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <span className="text-[10px] font-black text-primary uppercase italic">#{accIndex + 1}</span>
                                                                <Chip size="sm" className="h-4 text-[9px] font-black bg-white/5 text-slate-400">{variant.name}</Chip>
                                                                {isFull && <Chip size="sm" className="h-4 text-[9px] font-black bg-red-500/10 text-red-400">Complet</Chip>}
                                                                {isExpired && <Chip size="sm" className="h-4 text-[9px] font-black bg-yellow-500/10 text-yellow-400">Expiré</Chip>}
                                                            </div>
                                                            <button onClick={() => copyToClipboard(account.code)}
                                                                className="flex items-center gap-2 font-mono text-xs text-slate-300 hover:text-white bg-white/5 px-2.5 py-1.5 rounded-lg border border-white/5 transition-colors w-full text-left group/copy">
                                                                <Mail size={11} className="text-primary shrink-0" />
                                                                <span className="truncate">{account.code}</span>
                                                                <Copy size={11} className="opacity-0 group-hover/copy:opacity-100 transition-opacity ml-auto shrink-0" />
                                                            </button>
                                                        </div>

                                                        <div className="flex gap-1 bg-[#1a1a1a] p-1 rounded-xl border border-white/5 shrink-0">
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
                                                    </div>

                                                    {/* Occupation */}
                                                    <div className="space-y-1.5">
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Profils</span>
                                                            <span className="text-base font-black text-white tabular-nums">
                                                                {soldCount}<span className="text-slate-600 text-xs">/{total}</span>
                                                            </span>
                                                        </div>
                                                        <Progress value={rate} size="sm" radius="full"
                                                            classNames={{
                                                                base: "bg-white/5 h-1.5",
                                                                indicator: rate === 100 ? "bg-red-500" : "bg-gradient-to-r from-emerald-500 to-primary"
                                                            }} />
                                                    </div>

                                                    {/* Slots visualization */}
                                                    <div className="flex gap-1.5 h-10">
                                                        {account.slots?.map((slot: any) => {
                                                            const occupied = slot.status === "VENDU";
                                                            return (
                                                                <Tooltip key={slot.id}
                                                                    content={
                                                                        <div className="p-3 space-y-2 min-w-[140px]">
                                                                            <p className="text-[10px] font-black text-primary uppercase pb-1.5 border-b border-white/5">
                                                                                {slot.profileName || `Profil ${slot.slotNumber}`}
                                                                            </p>
                                                                            {slot.code && (
                                                                                <p className="text-[10px] font-mono text-slate-300 flex items-center gap-1.5">
                                                                                    <Key size={9} className="text-primary" /> {slot.code}
                                                                                </p>
                                                                            )}
                                                                            {occupied ? (
                                                                                <div className="pt-1 border-t border-white/5 space-y-0.5">
                                                                                    <p className="text-[10px] font-black text-orange-400">
                                                                                        {slot.orderItem?.order?.client?.nomComplet || "Client"}
                                                                                    </p>
                                                                                    <p className="text-[9px] text-slate-500">
                                                                                        #{slot.orderItem?.order?.orderNumber}
                                                                                    </p>
                                                                                </div>
                                                                            ) : (
                                                                                <p className="text-[10px] text-emerald-400 font-black">Disponible</p>
                                                                            )}
                                                                        </div>
                                                                    }
                                                                    className="bg-[#1a1a1a] border border-white/10 rounded-xl">
                                                                    <div className={`flex-1 rounded-lg border flex items-center justify-center h-full transition-all cursor-default
                                                                        ${occupied
                                                                            ? 'bg-orange-500/10 border-orange-500/30'
                                                                            : 'bg-white/5 border-white/5 hover:border-primary/30'}`}>
                                                                        {occupied
                                                                            ? <User className="size-4 text-orange-400" />
                                                                            : <Activity className="size-3.5 text-white/20" />}
                                                                    </div>
                                                                </Tooltip>
                                                            );
                                                        })}
                                                    </div>

                                                    {/* Footer */}
                                                    <div className="pt-3 border-t border-white/5 flex items-center justify-between">
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

            {/* ── Account Modal (ADD / EDIT) ── */}
            <Modal isOpen={accountModal.isOpen} onClose={accountModal.onClose}
                className="dark bg-[#111] border border-white/10" backdrop="blur" size="2xl" scrollBehavior="inside">
                <ModalContent>
                    {(close) => (
                        <>
                            <ModalHeader className="pb-4">
                                <div>
                                    <h2 className="text-xl font-black text-white uppercase italic">
                                        {modalMode === "ADD" ? "Nouveau compte partagé" : "Modifier le compte"}
                                    </h2>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">
                                        Données chiffrées — niveau 2
                                    </p>
                                </div>
                            </ModalHeader>
                            <ModalBody className="space-y-6 py-6 border-y border-white/5">
                                {modalMode === "ADD" && (
                                    <div className="space-y-2">
                                        <label className="text-[10px] text-slate-500 font-black uppercase ml-1">Produit</label>
                                        <Select items={sharingVariants} placeholder="Sélectionner un produit..." className="dark"
                                            selectedKeys={selectedVariantId ? [selectedVariantId] : []}
                                            onChange={(e) => setSelectedVariantId(e.target.value)}
                                            classNames={{ trigger: "bg-[#161616] border border-white/5 h-14 rounded-xl" }}>
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
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white/[0.02] p-4 rounded-2xl border border-white/5">
                                    <div className="space-y-2">
                                        <label className="text-[10px] text-slate-500 uppercase font-black ml-1">Email</label>
                                        <Input placeholder="email@example.com" value={email} onValueChange={setEmail}
                                            startContent={<Mail size={14} className="text-primary/70" />}
                                            classNames={{ inputWrapper: "bg-[#1a1a1a] border border-white/5 h-12 rounded-xl", input: "text-white font-bold" }} />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] text-slate-500 uppercase font-black ml-1">Mot de passe</label>
                                        <Input placeholder="••••••••" type="text" value={password} onValueChange={setPassword}
                                            startContent={<Key size={14} className="text-primary/70" />}
                                            classNames={{ inputWrapper: "bg-[#1a1a1a] border border-white/5 h-12 rounded-xl", input: "text-white font-bold" }} />
                                    </div>
                                </div>

                                {slotsData.length > 0 && (
                                    <div className="space-y-3">
                                        <label className="text-[10px] text-slate-500 font-black uppercase ml-1">
                                            Profils ({slotsData.length})
                                        </label>
                                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                            {slotsData.map((slot, index) => (
                                                <div key={index} className="flex items-center gap-3 bg-[#1a1a1a] p-3 rounded-xl border border-white/5">
                                                    <div className="size-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
                                                        <span className="text-xs font-black text-purple-400">{index + 1}</span>
                                                    </div>
                                                    <Input placeholder="Nom du profil" size="sm" value={slot.profileName}
                                                        onValueChange={(v) => updateSlot(index, "profileName", v)}
                                                        classNames={{ inputWrapper: "bg-[#222] h-10 border border-white/5 flex-1", input: "text-xs text-white" }} />
                                                    <Input placeholder="PIN" size="sm" value={slot.pinCode}
                                                        onValueChange={(v) => updateSlot(index, "pinCode", v)}
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
                                <Button color="primary" onPress={handleSubmit} isLoading={isSubmitting}
                                    className="font-black uppercase px-10 h-11 rounded-xl bg-gradient-to-tr from-primary to-orange-600">
                                    {modalMode === "ADD" ? "Créer le compte" : "Enregistrer"}
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
