"use client";

import { useState, useMemo, useEffect } from "react";
import {
    getSharedAccountsInventory,
    addSharedAccount,
    updateSharedAccount,
    deleteSharedAccount,
    getSharingVariants,
    getAvailableVariantsForLinking,
    linkProductToSharing
} from "./actions";
import {
    Users,
    Mail,
    LayoutGrid,
    CheckCircle2,
    Search,
    User,
    Calendar,
    Activity,
    ShieldCheck,
    AlertCircle,
    Copy,
    Plus,
    Edit3,
    Trash2,
    Key,
    ExternalLink
} from "lucide-react";
import toast from "react-hot-toast";
import {
    Input,
    Button,
    Chip,
    Card,
    CardBody,
    Tooltip,
    Spinner,
    Link,
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    useDisclosure,
    Select,
    SelectItem
} from "@heroui/react";

export default function SharedAccountsContent() {
    const [inventory, setInventory] = useState<any[]>([]);
    const [sharingVariants, setSharingVariants] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Modal state
    const { isOpen, onOpen, onClose } = useDisclosure();
    const [modalMode, setModalMode] = useState<"ADD" | "EDIT">("ADD");
    const [editingAccount, setEditingAccount] = useState<any>(null);

    // Link Product state
    const { isOpen: isLinkOpen, onOpen: onLinkOpen, onClose: onLinkClose } = useDisclosure();
    const [linkableVariants, setLinkableVariants] = useState<any[]>([]);
    const [selectedLinkVariantId, setSelectedLinkVariantId] = useState<string>("");
    const [linkTotalSlots, setLinkTotalSlots] = useState<string>("5");
    const [isLinking, setIsLinking] = useState(false);

    // Form state
    const [selectedVariantId, setSelectedVariantId] = useState<string>("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [slotsData, setSlotsData] = useState<{ id?: number, profileName: string, pinCode: string }[]>([]);

    const loadInventory = async () => {
        try {
            const [invData, varData, linkData] = await Promise.all([
                getSharedAccountsInventory(),
                getSharingVariants({}),
                getAvailableVariantsForLinking({})
            ]);
            if (Array.isArray(invData)) setInventory(invData);
            if (Array.isArray(varData)) setSharingVariants(varData);
            if (Array.isArray(linkData)) setLinkableVariants(linkData);
        } catch (error) {
            console.error("Failed to load inventory:", error);
            toast.error("Échec du chargement de l'inventaire");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadInventory();
        const interval = setInterval(loadInventory, 30000); // 30s refresh
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

    const handleLinkClick = async () => {
        try {
            const data = await getAvailableVariantsForLinking({});
            if (Array.isArray(data)) {
                setLinkableVariants(data);
                onLinkOpen();
            }
        } catch (error) {
            toast.error("Erreur de chargement des produits");
        }
    };

    const handleLinkSubmit = async () => {
        if (!selectedLinkVariantId) {
            toast.error("Sélectionnez un produit");
            return;
        }
        setIsLinking(true);
        try {
            const res = await linkProductToSharing({
                variantId: parseInt(selectedLinkVariantId),
                totalSlots: parseInt(linkTotalSlots)
            });
            if (res.success) {
                toast.success("Produit converti en flux partagé");
                onLinkClose();
                loadInventory();
            } else {
                toast.error(res.error || "Erreur de conversion");
            }
        } catch (error) {
            toast.error("Erreur technique");
        } finally {
            setIsLinking(false);
        }
    };

    const handleEditClick = (account: any, variant: any) => {
        setModalMode("EDIT");
        setEditingAccount(account);
        setSelectedVariantId(variant.id.toString());

        // Account code is "email | password"
        const parts = account.code.split(" | ");
        setEmail(parts[0] || account.code);
        setPassword(parts[1] || "");

        // Map existing slots
        setSlotsData(account.slots.map((s: any) => ({
            id: s.id,
            profileName: s.profileName || "",
            pinCode: s.code || ""
        })));

        onOpen();
    };

    // Reactively update slots array when SKU changes in ADD mode
    useEffect(() => {
        if (modalMode === "ADD" && selectedVariantId && sharingVariants.length > 0) {
            const variant = sharingVariants.find(v => v.id.toString() === selectedVariantId);
            if (variant) {
                const count = variant.totalSlots || 0;
                setSlotsData(Array.from({ length: count }).map((_, i) => ({
                    profileName: `Profil ${i + 1}`,
                    pinCode: ""
                })));
            }
        }
    }, [selectedVariantId, modalMode, sharingVariants]);

    const handleSlotChange = (index: number, field: 'profileName' | 'pinCode', value: string) => {
        const newData = [...slotsData];
        newData[index] = { ...newData[index], [field]: value };
        setSlotsData(newData);
    };

    const handleDeleteClick = async (id: number) => {
        if (!confirm("Voulez-vous vraiment supprimer ce compte ? Cette action est irréversible.")) return;

        try {
            const res = await deleteSharedAccount({ id });
            if (res.success) {
                toast.success("Compte supprimé avec succès");
                loadInventory();
            } else {
                toast.error(res.error || "Erreur lors de la suppression");
            }
        } catch (error) {
            toast.error("Une erreur technique est survenue");
        }
    };

    const handleSubmit = async () => {
        if (modalMode === "ADD" && !selectedVariantId) {
            toast.error("Veuillez sélectionner une variante");
            return;
        }
        if (!email || !password) {
            toast.error("Veuillez saisir les identifiants");
            return;
        }

        setIsSubmitting(true);
        try {
            let res;
            if (modalMode === "ADD") {
                res = await addSharedAccount({
                    variantId: parseInt(selectedVariantId),
                    email,
                    password,
                    slots: slotsData
                });
            } else {
                res = await updateSharedAccount({
                    id: editingAccount.id,
                    email,
                    password,
                    slots: slotsData.map(s => ({
                        id: s.id!,
                        profileName: s.profileName,
                        pinCode: s.pinCode
                    }))
                });
            }

            if (res.success) {
                toast.success(modalMode === "ADD" ? "Nouveau compte ajouté" : "Compte mis à jour");
                onClose();
                loadInventory();
            } else {
                toast.error(res.error || "Une erreur est survenue");
            }
        } catch (error) {
            toast.error("Erreur de communication avec le serveur");
        } finally {
            setIsSubmitting(false);
        }
    };

    const stats = useMemo(() => {
        let totalSlots = 0;
        let soldSlots = 0;
        let totalAccounts = 0;

        inventory.forEach(variant => {
            variant.digitalCodes?.forEach((account: any) => {
                totalAccounts++;
                account.slots?.forEach((slot: any) => {
                    totalSlots++;
                    if (slot.status === "VENDU") soldSlots++;
                });
            });
        });

        return {
            totalAccounts,
            totalSlots,
            soldSlots,
            availableSlots: totalSlots - soldSlots,
            occupancyRate: totalSlots > 0 ? (soldSlots / totalSlots) * 100 : 0
        };
    }, [inventory]);

    const groupedInventory = useMemo(() => {
        const groups: Record<string, any[]> = {};
        inventory.forEach(variant => {
            const productName = variant.product.name;
            if (!groups[productName]) groups[productName] = [];
            groups[productName].push(variant);
        });
        return groups;
    }, [inventory]);

    const filteredInventory = useMemo(() => {
        if (!searchTerm) return groupedInventory;
        const lowSearch = searchTerm.toLowerCase();

        const filtered: Record<string, any[]> = {};
        Object.entries(groupedInventory).forEach(([product, variants]) => {
            const matches = variants.filter(v =>
                v.digitalCodes?.some((acc: any) =>
                    acc.code.toLowerCase().includes(lowSearch) ||
                    acc.slots?.some((s: any) => s.profileName?.toLowerCase().includes(lowSearch))
                )
            );
            if (matches.length > 0) filtered[product] = matches;
        });
        return filtered;
    }, [groupedInventory, searchTerm]);

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success("Copié dans le presse-papier");
    };

    if (isLoading && inventory.length === 0) {
        return (
            <div className="flex h-[80vh] items-center justify-center bg-[#0a0a0a]">
                <Spinner color="primary" size="lg" label="Calcul de l'inventaire partagé..." classNames={{ label: "text-primary font-bold" }} />
            </div>
        );
    }

    return (
        <div className="space-y-8 p-4 md:p-8 bg-[#0a0a0a] min-h-full">
            {/* Header Area */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20 shadow-lg shadow-primary/5">
                        <Users className="text-primary w-8 h-8" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-white tracking-tighter uppercase italic">Flux Partagé</h1>
                        <p className="text-slate-500 text-sm font-medium">Administration des comptes multi-profils et monitoring de la capacité</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative w-full md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
                        <Input
                            classNames={{
                                input: "pl-10 text-white",
                                inputWrapper: "bg-[#161616] border border-[#262626] rounded-xl h-12"
                            }}
                            placeholder="Rechercher email/profil..."
                            value={searchTerm}
                            onValueChange={setSearchTerm}
                        />
                    </div>
                    <Button
                        variant="flat"
                        color="secondary"
                        startContent={<ExternalLink size={18} />}
                        className="h-12 px-6 font-bold rounded-xl bg-white/5 border border-white/10"
                        onClick={handleLinkClick}
                    >
                        Lier Produit
                    </Button>
                    <Button
                        color="primary"
                        startContent={<Plus size={18} />}
                        className="h-12 px-6 font-bold rounded-xl"
                        onClick={handleAddClick}
                    >
                        Nouveau Compte
                    </Button>
                </div>
            </header>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { label: "Comptes Actifs", value: stats.totalAccounts, icon: ShieldCheck, color: "text-blue-500" },
                    { label: "Capacité Totale", value: stats.totalSlots, icon: LayoutGrid, color: "text-purple-500" },
                    { label: "Profils Occupés", value: stats.soldSlots, icon: User, color: "text-orange-500" },
                    { label: "Disponibilité", value: `${stats.availableSlots}`, subValue: `${Math.round(100 - stats.occupancyRate)}% Libres`, icon: CheckCircle2, color: "text-emerald-500" }
                ].map((stat, i) => (
                    <Card key={i} className="bg-[#161616] border border-[#262626] shadow-sm overflow-hidden" shadow="none">
                        <CardBody className="p-5 flex flex-row items-center gap-4 text-left">
                            <div className="p-3 rounded-xl bg-white/5">
                                <stat.icon className={`w-6 h-6 ${stat.color}`} />
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest leading-tight">{stat.label}</p>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-2xl font-black text-white">{stat.value}</span>
                                    {stat.subValue && <span className="text-[10px] font-bold text-slate-500">{stat.subValue}</span>}
                                </div>
                            </div>
                        </CardBody>
                    </Card>
                ))}
            </div>

            {/* Inventory View */}
            <div className="space-y-12">
                {Object.keys(filteredInventory).length === 0 ? (
                    <div className="py-32 text-center border-2 border-dashed border-white/5 rounded-[40px] bg-[#111] animate-in fade-in zoom-in duration-500">
                        <div className="mx-auto size-24 rounded-full bg-white/5 flex items-center justify-center mb-6">
                            <AlertCircle className="w-12 h-12 text-slate-700" />
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-2">Aucun compte trouvé</h3>
                        <p className="text-slate-500 max-w-xs mx-auto">Vérifiez vos filtres ou ajoutez une nouvelle ressource au catalogue.</p>
                        <Button
                            as={Link}
                            href="/admin/catalogue"
                            variant="light"
                            color="primary"
                            className="mt-4 font-bold uppercase text-xs tracking-widest"
                            startContent={<ExternalLink size={16} />}
                        >
                            Catalogue complet
                        </Button>
                    </div>
                ) : (
                    Object.entries(filteredInventory).map(([productName, variants]) => (
                        <section key={productName} className="space-y-6">
                            <div className="flex items-center justify-between border-b border-[#262626] pb-4">
                                <div className="flex items-center gap-3">
                                    <div className="size-2 rounded-full bg-primary" />
                                    <h2 className="text-xl font-black text-white uppercase tracking-tighter">{productName}</h2>
                                    <Chip size="sm" variant="dot" color="primary" className="font-bold border-white/5">{variants.length} SKU</Chip>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                                {variants.map(variant => (
                                    variant.digitalCodes?.map((account: any, accIndex: number) => {
                                        const soldSl = account.slots?.filter((s: any) => s.status === "VENDU") || [];
                                        const soldCount = soldSl.length;
                                        const total = account.slots?.length || 0;
                                        const rate = total > 0 ? (soldCount / total) * 100 : 0;

                                        return (
                                            <Card
                                                key={account.id}
                                                className="bg-[#161616] border border-[#262626] group hover:border-primary/40 transition-all shadow-sm"
                                                shadow="none"
                                            >
                                                <CardBody className="p-6 space-y-6">
                                                    {/* Card Header */}
                                                    <div className="flex justify-between items-start">
                                                        <div className="space-y-1 min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm font-black text-white truncate uppercase tracking-tight italic">Compte {accIndex + 1}</span>
                                                                <Chip size="sm" className="h-5 text-[9px] font-black bg-white/5 text-slate-400 uppercase">{variant.name}</Chip>
                                                            </div>
                                                            <button
                                                                onClick={() => copyToClipboard(account.code)}
                                                                className="flex items-center gap-2 text-slate-500 font-mono text-[10px] hover:text-primary transition-colors group/copy text-left"
                                                            >
                                                                <Mail size={10} className="shrink-0" />
                                                                <span className="truncate max-w-[150px]">{account.code}</span>
                                                                <Copy size={10} className="opacity-0 group-hover/copy:opacity-100 transition-opacity shrink-0" />
                                                            </button>
                                                        </div>
                                                        <div className="flex flex-col items-end gap-2 shrink-0">
                                                            <div className="flex gap-1">
                                                                <Button
                                                                    isIconOnly
                                                                    size="sm"
                                                                    variant="light"
                                                                    className="h-8 w-8 text-slate-600 hover:text-primary hover:bg-primary/10 transition-all"
                                                                    onClick={() => handleEditClick(account, variant)}
                                                                >
                                                                    <Edit3 size={14} />
                                                                </Button>
                                                                <Button
                                                                    isIconOnly
                                                                    size="sm"
                                                                    variant="light"
                                                                    className={`h-8 w-8 transition-all ${soldCount > 0 ? 'opacity-20 cursor-not-allowed text-slate-600' : 'text-slate-600 hover:text-danger hover:bg-danger/10'}`}
                                                                    onClick={() => soldCount === 0 && handleDeleteClick(account.id)}
                                                                    disabled={soldCount > 0}
                                                                >
                                                                    <Trash2 size={14} />
                                                                </Button>
                                                            </div>
                                                            <div className="text-right">
                                                                <div className={`text-2xl font-black tabular-nums ${rate === 100 ? 'text-red-500' : 'text-white'}`}>
                                                                    {soldCount}<span className="text-slate-600 text-sm">/{total}</span>
                                                                </div>
                                                                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest leading-none">Occupancy</p>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Slots Visualization */}
                                                    <div className="flex gap-1.5 h-10">
                                                        {account.slots?.map((slot: any) => {
                                                            const isOccupied = slot.status === "VENDU";
                                                            const customer = slot.orderItem?.order?.client?.nomComplet || "Inconnu";
                                                            const orderRef = slot.orderItem?.order?.orderNumber || "No Ref";
                                                            const pName = slot.profileName || "Profil";
                                                            const pCode = slot.code || "Sans PIN";

                                                            return (
                                                                <Tooltip
                                                                    key={slot.id}
                                                                    content={
                                                                        <div className="p-2 space-y-1.5 min-w-[120px]">
                                                                            <p className="text-[10px] font-black uppercase tracking-tighter text-primary">{pName}</p>
                                                                            <p className="text-[9px] font-bold text-slate-300 flex items-center gap-2">
                                                                                <Key size={10} /> PIN: {pCode}
                                                                            </p>
                                                                            {isOccupied && (
                                                                                <div className="border-t border-white/10 pt-1.5 mt-1.5">
                                                                                    <p className="text-[9px] font-black uppercase tracking-tighter text-orange-400">Client: {customer}</p>
                                                                                    <p className="text-[8px] font-bold text-slate-500">CMD: {orderRef}</p>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    }
                                                                    className="bg-[#1f1f1f] border border-white/10 shadow-2xl"
                                                                >
                                                                    <div
                                                                        className={`flex-1 rounded-md border flex items-center justify-center transition-all ${isOccupied
                                                                            ? 'bg-orange-500/10 border-orange-500/30'
                                                                            : 'bg-white/5 border-white/10 hover:border-primary/50'
                                                                            }`}
                                                                    >
                                                                        {isOccupied ? (
                                                                            <User className="size-4 text-orange-500 animate-pulse" />
                                                                        ) : (
                                                                            <div className="size-1 rounded-full bg-white/20" />
                                                                        )}
                                                                    </div>
                                                                </Tooltip>
                                                            );
                                                        })}
                                                    </div>

                                                    {/* Card Footer Detail */}
                                                    <div className="pt-4 border-t border-[#262626] flex items-center justify-between">
                                                        <div className="flex items-center gap-1.5 text-slate-500">
                                                            <Calendar size={10} />
                                                            <span className="text-[9px] font-bold uppercase tracking-wide">Initialisé le {new Date(account.createdAt).toLocaleDateString()}</span>
                                                        </div>
                                                        <div className={`h-1.5 w-1.5 rounded-full ${rate === 100 ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'}`} />
                                                    </div>
                                                </CardBody>
                                            </Card>
                                        );
                                    })
                                ))}
                            </div>
                        </section>
                    ))
                )}
            </div>

            {/* Account Management Modal */}
            <Modal
                isOpen={isOpen}
                onClose={onClose}
                className="dark bg-[#161616] border border-[#262626]"
                backdrop="blur"
                size="2xl"
                scrollBehavior="inside"
            >
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader className="flex flex-col gap-1 pb-2">
                                <h2 className="text-xl font-black text-white uppercase italic tracking-tighter">
                                    {modalMode === "ADD" ? "Génération de Flux Partagé" : "Édition des Accès"}
                                </h2>
                                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Interface de sécurité administrative</p>
                            </ModalHeader>
                            <ModalBody className="space-y-8 py-6 border-y border-[#262626] bg-[#0c0c0c]/50">
                                {modalMode === "ADD" && (
                                    <div className="space-y-3">
                                        <label className="text-[10px] text-slate-500 font-black uppercase ml-1 tracking-widest">Configuration SKU</label>
                                        <Select
                                            items={sharingVariants}
                                            placeholder="CIBLER UNE VARIANTE..."
                                            className="dark"
                                            selectedKeys={selectedVariantId ? [selectedVariantId] : []}
                                            onChange={(e) => setSelectedVariantId(e.target.value)}
                                            classNames={{
                                                trigger: "bg-[#1f1f1f] border border-white/5 h-16 rounded-2xl data-[hover=true]:border-primary transition-all",
                                                value: "text-white font-black"
                                            }}
                                            renderValue={(items) => {
                                                return items.map((item) => {
                                                    const v = sharingVariants.find(sv => sv.id.toString() === item.key);
                                                    return (
                                                        <div key={item.key} className="flex flex-col text-left">
                                                            <span className="text-[9px] text-slate-500 font-black uppercase tracking-tighter">{v?.product?.name}</span>
                                                            <span className="text-sm text-primary uppercase font-black">{v?.name}</span>
                                                        </div>
                                                    );
                                                });
                                            }}
                                        >
                                            {(v) => (
                                                <SelectItem key={v.id.toString()} textValue={`${v.product.name} - ${v.name}`}>
                                                    <div className="flex flex-col text-left py-1">
                                                        <span className="text-[9px] text-slate-500 font-bold uppercase">{v.product.name}</span>
                                                        <span className="text-sm text-white font-black uppercase tracking-tight">{v.name}</span>
                                                        <span className="text-[8px] text-primary/60 font-bold uppercase">{v.totalSlots} Slots autorisés</span>
                                                    </div>
                                                </SelectItem>
                                            )}
                                        </Select>
                                    </div>
                                )}

                                {/* Main Account Info */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <ShieldCheck size={14} className="text-primary" />
                                        <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Identifiants Maître</span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white/[0.02] p-5 rounded-[28px] border border-white/[0.03] shadow-inner">
                                        <div className="space-y-2">
                                            <Input
                                                placeholder="Email / Login"
                                                variant="flat"
                                                value={email}
                                                onValueChange={setEmail}
                                                startContent={<Mail size={16} className="text-primary/70" />}
                                                classNames={{
                                                    inputWrapper: "bg-[#1a1a1a] border border-white/5 h-14 hover:bg-[#222] transition-colors rounded-xl",
                                                    input: "text-white font-medium"
                                                }}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Input
                                                placeholder="Mot de passe"
                                                type="text"
                                                variant="flat"
                                                value={password}
                                                onValueChange={setPassword}
                                                startContent={<Key size={16} className="text-primary/70" />}
                                                classNames={{
                                                    inputWrapper: "bg-[#1a1a1a] border border-white/5 h-14 hover:bg-[#222] transition-colors rounded-xl",
                                                    input: "text-white font-medium"
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Dynamic Slots Configuration */}
                                {slotsData.length > 0 && (
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Users size={14} className="text-orange-500" />
                                            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Configuration des Profils ({slotsData.length})</span>
                                        </div>
                                        <div className="grid grid-cols-1 gap-3">
                                            {slotsData.map((slot, index) => (
                                                <div key={index} className="flex flex-col md:flex-row gap-3 items-center bg-white/[0.01] p-3 rounded-2xl border border-white/[0.02]">
                                                    <div className="size-8 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
                                                        <span className="text-[10px] font-black text-orange-500">{index + 1}</span>
                                                    </div>
                                                    <Input
                                                        placeholder="Nom du profil"
                                                        size="sm"
                                                        value={slot.profileName}
                                                        onValueChange={(v) => handleSlotChange(index, 'profileName', v)}
                                                        classNames={{
                                                            inputWrapper: "bg-[#1a1a1a] h-10 border border-white/5",
                                                            input: "text-xs font-bold"
                                                        }}
                                                    />
                                                    <Input
                                                        placeholder="Code PIN (optionnel)"
                                                        size="sm"
                                                        value={slot.pinCode}
                                                        onValueChange={(v) => handleSlotChange(index, 'pinCode', v)}
                                                        startContent={<Key size={12} className="text-slate-600" />}
                                                        classNames={{
                                                            inputWrapper: "bg-[#1a1a1a] h-10 border border-white/5",
                                                            input: "text-xs font-mono"
                                                        }}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {modalMode === "ADD" && (
                                    <div className="flex items-start gap-3 p-4 bg-primary/5 rounded-2xl border border-primary/20 backdrop-blur-sm">
                                        <ShieldCheck className="text-primary shrink-0 mt-0.5" size={20} />
                                        <p className="text-[10px] text-slate-300 leading-relaxed font-bold uppercase tracking-tight">
                                            SYSTÈME : La confirmation générera immédiatement les jetons de profils individuels basés sur l&apos;allocation de la variante choisie.
                                        </p>
                                    </div>
                                )}
                            </ModalBody>
                            <ModalFooter className="p-4 bg-[#111]">
                                <Button
                                    variant="light"
                                    onPress={onClose}
                                    className="font-black text-slate-500 uppercase text-xs tracking-widest"
                                >
                                    Annuler
                                </Button>
                                <Button
                                    color="primary"
                                    onPress={handleSubmit}
                                    isLoading={isSubmitting}
                                    className="font-black uppercase tracking-widest px-10 h-14 rounded-2xl shadow-2xl shadow-primary/40 bg-gradient-to-tr from-primary to-orange-500 transition-transform active:scale-95"
                                >
                                    {modalMode === "ADD" ? "Générer les accès" : "Mettre à jour"}
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
                className="dark bg-[#161616] border border-[#262626]"
                backdrop="blur"
            >
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader className="flex flex-col gap-1">
                                <h2 className="text-xl font-black text-white uppercase italic">Lier un Produit au Flux</h2>
                                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Activer le mode partagé pour un SKU existant</p>
                            </ModalHeader>
                            <ModalBody className="space-y-6 py-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] text-slate-500 font-black uppercase ml-1">Variante du Catalogue</label>
                                    <Select
                                        items={linkableVariants}
                                        placeholder="SÉLECTIONNER UN SKU..."
                                        className="dark"
                                        selectedKeys={selectedLinkVariantId ? [selectedLinkVariantId] : []}
                                        onChange={(e) => setSelectedLinkVariantId(e.target.value)}
                                        classNames={{
                                            trigger: "bg-[#1f1f1f] border border-white/5 h-14 rounded-xl",
                                        }}
                                        renderValue={(items) => {
                                            return items.map((item) => {
                                                const v = linkableVariants.find(lv => lv.id.toString() === item.key);
                                                return (
                                                    <div key={item.key} className="flex flex-col text-left">
                                                        <span className="text-[9px] text-slate-500 font-black uppercase tracking-tighter">{v?.product?.name}</span>
                                                        <span className="text-sm text-primary uppercase font-black">{v?.name}</span>
                                                    </div>
                                                );
                                            });
                                        }}
                                    >
                                        {(v) => (
                                            <SelectItem key={v.id.toString()} textValue={`${v.product.name} - ${v.name}`}>
                                                <div className="flex flex-col py-1">
                                                    <span className="text-[10px] text-slate-500 font-bold uppercase">{v.product.name}</span>
                                                    <span className="text-sm text-white font-black uppercase">{v.name}</span>
                                                </div>
                                            </SelectItem>
                                        )}
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] text-slate-500 font-black uppercase ml-1">Nombre de Profils (Slots)</label>
                                    <Input
                                        type="number"
                                        placeholder="Ex: 5"
                                        value={linkTotalSlots}
                                        onValueChange={setLinkTotalSlots}
                                        classNames={{
                                            inputWrapper: "bg-[#1f1f1f] border border-white/5 h-14 rounded-xl",
                                        }}
                                    />
                                </div>
                            </ModalBody>
                            <ModalFooter>
                                <Button variant="light" onPress={onClose} className="font-bold text-slate-500 uppercase text-xs">Annuler</Button>
                                <Button
                                    color="primary"
                                    onPress={handleLinkSubmit}
                                    isLoading={isLinking}
                                    className="font-black uppercase tracking-widest px-8 bg-gradient-to-tr from-primary to-orange-500"
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

