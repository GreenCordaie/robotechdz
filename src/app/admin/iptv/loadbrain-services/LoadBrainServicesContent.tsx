"use client";

import React, { useEffect, useState } from "react";
import {
    Spinner,
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Button,
    Input,
    Select,
    SelectItem,
    useDisclosure,
    Chip,
} from "@heroui/react";
import { Zap, Tv, Tag, Link2, Unlink, ExternalLink, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "react-hot-toast";
import {
    listLoadBrainServicesAction,
    listCategoriesForLinkAction,
    linkLoadBrainServiceAction,
    unlinkLoadBrainSlugAction,
} from "./actions";
import { formatCurrency } from "@/lib/formatters";

interface ServiceRow {
    slug: string;
    displayName: string;
    providerName: string;
    providerType: "iptv" | "ibosol" | "other";
    durationLabel: string;
    deliveryType: "credentials" | "code" | "playlist";
    purchasePriceUsd: number;
    isAlreadyLinked: boolean;
    linkedVariantIds: number[];
}

interface CategoryRow {
    id: number;
    name: string;
}

const USD_DZD_RATE = 245; // fallback display only — le checkout reseller utilise shopSettings.usdExchangeRate

export default function LoadBrainServicesContent() {
    const [services, setServices] = useState<ServiceRow[]>([]);
    const [categories, setCategories] = useState<CategoryRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<"all" | "linked" | "unlinked">("all");
    const [activeService, setActiveService] = useState<ServiceRow | null>(null);
    const linkModal = useDisclosure();

    const loadAll = async () => {
        setLoading(true);
        try {
            const [s, c] = await Promise.all([
                listLoadBrainServicesAction({}),
                listCategoriesForLinkAction({}),
            ]);
            if (s.success) setServices(s.data as ServiceRow[]);
            else toast.error("Erreur chargement services");
            if (c.success) setCategories(c.data as CategoryRow[]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAll();
    }, []);

    const visibleServices = services.filter((s) => {
        if (filter === "linked") return s.isAlreadyLinked;
        if (filter === "unlinked") return !s.isAlreadyLinked;
        return true;
    });

    const handleOpenLink = (service: ServiceRow) => {
        setActiveService(service);
        linkModal.onOpen();
    };

    const handleUnlink = async (variantId: number) => {
        if (!confirm("Détacher ce slug LoadBrain du variant ? Les commandes futures ne déclencheront plus le provisioning auto.")) return;
        const res = await unlinkLoadBrainSlugAction({ variantId });
        if (res.success) {
            toast.success("Slug détaché");
            await loadAll();
        } else {
            toast.error(res.error || "Échec");
        }
    };

    return (
        <div className="p-8 space-y-6 max-w-7xl">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
                        <Zap className="text-[var(--primary)]" />
                        LoadBrain Marketplace
                    </h1>
                    <p className="text-sm text-slate-500 font-medium mt-1">
                        Liez les services LoadBrain à des produits revendables (kiosque + reseller). Le provisioning est ensuite automatique au checkout.
                    </p>
                </div>

                <div className="flex gap-2 bg-[#161616] p-1.5 rounded-xl border border-[#262626]">
                    {(
                        [
                            ["all", "Tous"],
                            ["unlinked", "À lier"],
                            ["linked", "Déjà liés"],
                        ] as const
                    ).map(([key, label]) => (
                        <button
                            key={key}
                            onClick={() => setFilter(key)}
                            className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                                filter === key
                                    ? "bg-[var(--primary)] text-white"
                                    : "text-slate-500 hover:text-white"
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </header>

            {loading ? (
                <div className="py-20 flex justify-center">
                    <Spinner color="warning" />
                </div>
            ) : visibleServices.length === 0 ? (
                <div className="py-20 text-center text-slate-500 italic">
                    Aucun service LoadBrain à afficher.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {visibleServices.map((s) => (
                        <article
                            key={s.slug}
                            data-testid="loadbrain-service-card"
                            className="bg-[#161616] border border-[#262626] rounded-2xl p-5 space-y-3 hover:border-[var(--primary)]/30 transition-colors"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-white text-sm leading-snug">{s.displayName}</h3>
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        <Chip size="sm" variant="flat" classNames={{ base: "bg-[#0a0a0a]", content: "text-[10px] font-bold text-slate-400" }}>
                                            {s.providerName}
                                        </Chip>
                                        <Chip size="sm" variant="flat" startContent={<Tag size={10} />} classNames={{ base: "bg-[#0a0a0a]", content: "text-[10px] font-bold text-slate-400" }}>
                                            {s.durationLabel}
                                        </Chip>
                                        <Chip size="sm" variant="flat" classNames={{ base: "bg-[#0a0a0a]", content: "text-[10px] font-bold text-slate-400" }}>
                                            {s.deliveryType}
                                        </Chip>
                                    </div>
                                </div>
                                {s.providerType === "ibosol" ? (
                                    <Tv className="text-purple-400 shrink-0" size={20} />
                                ) : (
                                    <Tv className="text-cyan-400 shrink-0" size={20} />
                                )}
                            </div>

                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-500">Achat LoadBrain</span>
                                <span className="font-black text-white">
                                    ${s.purchasePriceUsd.toFixed(2)} <span className="text-slate-600 font-medium">≈ {formatCurrency(s.purchasePriceUsd * USD_DZD_RATE, "DZD")}</span>
                                </span>
                            </div>

                            <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                                {s.isAlreadyLinked ? (
                                    <>
                                        <span className="flex items-center gap-1.5 text-[10px] font-black text-emerald-400 uppercase">
                                            <CheckCircle2 size={12} />
                                            Lié à {s.linkedVariantIds.length} variant{s.linkedVariantIds.length > 1 ? "s" : ""}
                                        </span>
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="flat"
                                                onPress={() => handleOpenLink(s)}
                                                className="bg-[#0a0a0a] text-slate-300 font-bold text-xs"
                                                startContent={<Link2 size={14} />}
                                            >
                                                Lier encore
                                            </Button>
                                            {s.linkedVariantIds[0] && (
                                                <Button
                                                    size="sm"
                                                    variant="flat"
                                                    color="danger"
                                                    onPress={() => handleUnlink(s.linkedVariantIds[0])}
                                                    className="font-bold text-xs"
                                                    startContent={<Unlink size={14} />}
                                                >
                                                    Détacher
                                                </Button>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <span className="flex items-center gap-1.5 text-[10px] font-bold text-amber-400 uppercase">
                                            <AlertCircle size={12} />
                                            Pas encore vendable
                                        </span>
                                        <Button
                                            size="sm"
                                            onPress={() => handleOpenLink(s)}
                                            className="bg-[var(--primary)] text-white font-bold text-xs"
                                            startContent={<Link2 size={14} />}
                                        >
                                            Lier
                                        </Button>
                                    </>
                                )}
                            </div>
                        </article>
                    ))}
                </div>
            )}

            {activeService && (
                <LinkServiceModal
                    isOpen={linkModal.isOpen}
                    onClose={linkModal.onClose}
                    service={activeService}
                    categories={categories}
                    onLinked={async () => {
                        linkModal.onClose();
                        await loadAll();
                    }}
                />
            )}
        </div>
    );
}

interface LinkServiceModalProps {
    isOpen: boolean;
    onClose: () => void;
    service: ServiceRow;
    categories: CategoryRow[];
    onLinked: () => void | Promise<void>;
}

function LinkServiceModal({ isOpen, onClose, service, categories, onLinked }: LinkServiceModalProps) {
    const defaultSale = (service.purchasePriceUsd * USD_DZD_RATE * 1.4).toFixed(0); // marge 40 % par défaut
    const defaultReseller = (service.purchasePriceUsd * USD_DZD_RATE * 1.2).toFixed(0); // marge 20 % wholesale

    const [productName, setProductName] = useState(service.displayName);
    const [variantName, setVariantName] = useState(service.durationLabel);
    const [salePrice, setSalePrice] = useState(defaultSale);
    const [resellerPrice, setResellerPrice] = useState(defaultReseller);
    const [categoryId, setCategoryId] = useState<string>(categories[0]?.id?.toString() ?? "");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        // Reset form when service changes
        setProductName(service.displayName);
        setVariantName(service.durationLabel);
        setSalePrice(defaultSale);
        setResellerPrice(defaultReseller);
    }, [service.slug]);

    const handleSubmit = async () => {
        if (!categoryId) {
            toast.error("Choisir une catégorie");
            return;
        }
        setSubmitting(true);
        try {
            const res = await linkLoadBrainServiceAction({
                slug: service.slug,
                productName: productName.trim(),
                categoryId: parseInt(categoryId, 10),
                salePriceDzd: salePrice,
                resellerPriceOverrideDzd: resellerPrice || undefined,
                variantName: variantName.trim(),
                kioskVisible: false,
                resellerVisible: true,
            });
            if (res.success) {
                toast.success(`Service "${service.slug}" lié au produit`);
                await onLinked();
            } else {
                toast.error(res.error || "Échec liaison");
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="2xl"
            classNames={{
                base: "bg-[#0f0d0c] border border-[#2d2622] rounded-3xl",
                header: "border-b border-[#2d2622]",
                footer: "border-t border-[#2d2622]",
            }}
        >
            <ModalContent>
                <ModalHeader>
                    <div>
                        <h2 className="text-xl font-black text-white">Lier {service.slug}</h2>
                        <p className="text-xs text-slate-500 font-medium mt-1">
                            Crée un produit + variant local. Le slug LoadBrain devient le pivot du provisioning automatique au checkout reseller.
                        </p>
                    </div>
                </ModalHeader>
                <ModalBody className="space-y-4">
                    <Input
                        label="Nom du produit"
                        placeholder="Netflix Premium..."
                        value={productName}
                        onChange={(e) => setProductName(e.target.value)}
                        variant="flat"
                    />
                    <Input
                        label="Nom du variant"
                        placeholder="1 mois"
                        value={variantName}
                        onChange={(e) => setVariantName(e.target.value)}
                        variant="flat"
                    />
                    <Select
                        label="Catégorie"
                        selectedKeys={categoryId ? new Set([categoryId]) : new Set()}
                        onChange={(e) => setCategoryId(e.target.value)}
                        variant="flat"
                    >
                        {categories.map((c) => (
                            <SelectItem key={c.id.toString()}>{c.name}</SelectItem>
                        ))}
                    </Select>
                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="Prix kiosque (DZD)"
                            type="number"
                            value={salePrice}
                            onChange={(e) => setSalePrice(e.target.value)}
                            variant="flat"
                            description={`Achat ≈ ${formatCurrency(service.purchasePriceUsd * USD_DZD_RATE, "DZD")}`}
                        />
                        <Input
                            label="Prix reseller (DZD)"
                            type="number"
                            value={resellerPrice}
                            onChange={(e) => setResellerPrice(e.target.value)}
                            variant="flat"
                            description="Override wholesale (vide = même prix)"
                        />
                    </div>

                    <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                        <ExternalLink size={14} />
                        <span>
                            Stock virtuel — provisioning à la demande via LoadBrain. Le variant restera "instant delivery" pour les revendeurs.
                        </span>
                    </div>
                </ModalBody>
                <ModalFooter>
                    <Button variant="light" onPress={onClose} className="font-bold">
                        Annuler
                    </Button>
                    <Button
                        onPress={handleSubmit}
                        disabled={submitting || !productName || !variantName || !categoryId || !salePrice}
                        className="bg-[var(--primary)] text-white font-black"
                        data-testid="link-submit"
                    >
                        {submitting ? <Spinner size="sm" color="white" /> : "Lier le service"}
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}
