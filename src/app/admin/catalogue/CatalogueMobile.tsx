"use client";

import React, { useState, useMemo } from "react";
import {
    Search,
    Plus,
    MoreVertical,
    TrendingUp,
    Package,
    Wallet,
    PlusCircle,
    Landmark
} from "lucide-react";
import { Button, Card, CardBody, Chip, Spinner, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Pagination } from "@heroui/react";
import { formatCurrency } from "@/lib/formatters";
import NextImage from "next/image";
import dynamic from "next/dynamic";
const AddProductModal = dynamic(() => import("@/components/admin/modals/AddProductModal").then(m => m.AddProductModal), { ssr: false });
const AddCategoryModal = dynamic(() => import("@/components/admin/modals/AddCategoryModal").then(m => m.AddCategoryModal), { ssr: false });
const ManageCategoriesModal = dynamic(() => import("@/components/admin/modals/ManageCategoriesModal").then(m => m.ManageCategoriesModal), { ssr: false });
const RechargeBalanceModal = dynamic(() => import("@/components/admin/modals/RechargeBalanceModal").then(m => m.RechargeBalanceModal), { ssr: false });
const MassImportModal = dynamic(() => import("@/components/admin/modals/MassImportModal").then(m => m.MassImportModal), { ssr: false });
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { deleteProductAction, toggleProductStatusAction } from "@/app/admin/catalogue/actions";
import { toast } from "react-hot-toast";

export default function CatalogueMobile({
    initialProducts,
    suppliers,
    categories,
    initialTotal,
    initialTotalPages,
    initialPage,
    initialSearch,
    initialCategoryId,
    initialStatus
}: any) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const pathname = usePathname();

    const [activeTab, setActiveTab] = useState<string>(initialCategoryId || "all");
    const [filterStatus, setFilterStatus] = useState<string>(initialStatus || "all");
    const [searchTerm, setSearchTerm] = useState(initialSearch);
    const [isAddProductOpen, setIsAddProductOpen] = useState(false);
    const [productToEdit, setProductToEdit] = useState<any>(null);
    const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
    const [categoryToEdit, setCategoryToEdit] = useState<any>(null);
    const [isManageCategoriesOpen, setIsManageCategoriesOpen] = useState(false);
    const [isRechargeOpen, setIsRechargeOpen] = useState(false);
    const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
    const [isMassImportOpen, setIsMassImportOpen] = useState(false);
    const [selectedProductForImport, setSelectedProductForImport] = useState<any>(null);

    const EXCHANGE_RATE_USD_DZD = 245;

    const updateParams = (newParams: Record<string, string | number | null>) => {
        const params = new URLSearchParams(searchParams.toString());
        Object.entries(newParams).forEach(([key, value]) => {
            if (value === null || value === "all" || value === "") params.delete(key);
            else params.set(key, value.toString());
        });
        if (!newParams.page) params.delete("page");
        router.push(`${pathname}?${params.toString()}`);
    };

    const handleEditProduct = (p: any) => {
        setProductToEdit(p);
        setIsAddProductOpen(true);
    };

    const handleDeleteProduct = async (id: number) => {
        // TODO: Replace window.confirm with a proper modal dialog for better UX
        if (window.confirm("Supprimer ce produit ?")) {
            const res = await deleteProductAction({ id });
            if (res.success) {
                toast.success("Supprimé");
                router.refresh();
            }
        }
    };

    const handleToggleStatus = async (id: number, currentStatus: string) => {
        const newStatus = currentStatus === "ACTIVE" ? "ARCHIVED" : "ACTIVE";
        const res = await toggleProductStatusAction({ id, status: newStatus });
        if (res.success) {
            toast.success("Statut mis à jour");
            router.refresh();
        }
    };

    const handleEditCategory = (cat: any) => {
        setCategoryToEdit(cat);
        setIsManageCategoriesOpen(false);
        setIsAddCategoryOpen(true);
    };

    const handleExportCSV = () => {
        const headers = ["Produit", "Catégorie", "Prix d'achat (DZD)", "Prix de vente", "Profit", "Statut"];
        const rows = filteredVariants.map((v: any) => {
            const linkedSup = v.variantSuppliers?.[0];
            const buyPrice = linkedSup ? parseFloat(linkedSup.purchasePrice || "0") : 0;
            const buyPriceDzd = linkedSup?.currency === 'USD' ? buyPrice * EXCHANGE_RATE_USD_DZD : buyPrice;
            const sellPrice = parseFloat(v.salePriceDzd);
            const revenue = v.isSharing ? sellPrice * (v.totalSlots || 1) : sellPrice;
            return [
                `${v.product.name} - ${v.name}`,
                v.product.category?.name || "N/A",
                buyPriceDzd.toFixed(2),
                sellPrice.toFixed(2),
                (revenue - buyPriceDzd).toFixed(2),
                v.product.status
            ];
        });

        const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `catalogue_export_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const allVariants = useMemo(() => {
        return initialProducts.flatMap((p: any) =>
            p.variants.map((v: any) => ({ ...v, product: p }))
        );
    }, [initialProducts]);

    const filteredVariants = useMemo(() => {
        return allVariants.filter((v: any) => {
            const matchesSearch = v.product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                v.name.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesCatalog = activeTab === "all" || v.product.categoryId === parseInt(activeTab);
            const matchesStatus = filterStatus === "all" || v.product.status === filterStatus; // Assuming status is on product
            return matchesSearch && matchesCatalog && matchesStatus;
        });
    }, [allVariants, searchTerm, activeTab, filterStatus]);

    const filteredProducts = useMemo(() => {
        return initialProducts.filter((p: any) => {
            const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesCategory = activeTab === "all" || p.categoryId === parseInt(activeTab);
            const matchesStatus = filterStatus === "all" || p.status === filterStatus;
            return matchesSearch && matchesCategory && matchesStatus;
        });
    }, [initialProducts, searchTerm, activeTab, filterStatus]);

    return (
        <div className="flex flex-col gap-6 pb-20 bg-[#0a0a0a] text-white min-h-screen">
            {/* Header / Tabs */}
            <header className="p-4 border-b border-white/5 space-y-4">
                <div className="flex justify-between items-center">
                    <h1 className="text-xl font-black text-white">Catalogue</h1>
                    <div className="flex gap-2">
                        <Button isIconOnly aria-label="Ajouter un produit" size="sm" variant="flat" className="bg-primary/20 text-primary" onPress={() => setIsAddProductOpen(true)}>
                            <Plus size={16} />
                        </Button>
                    </div>
                </div>

                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                        <input
                            type="text"
                            placeholder="Chercher un produit..."
                            className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 outline-none focus:border-primary/50 transition-all font-bold placeholder:text-slate-600"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </header>

            {/* Suppliers Quick View */}
            <section className="px-4">
                <div className="flex items-center gap-2 mb-4 px-1">
                    <Landmark size={14} className="text-primary" />
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Soldes Fournisseurs</h3>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar">

                    {suppliers.map((s: any) => {
                        const bal = parseFloat(s.balance || "0");
                        const isLow = bal < 100 && s.currency === 'USD';
                        return (
                            <button
                                key={s.id}
                                onClick={() => {
                                    setSelectedSupplier(s);
                                    setIsRechargeOpen(true);
                                }}
                                className="min-w-[140px] p-4 bg-[#161616] border border-white/5 rounded-3xl space-y-1 text-left active:scale-95 transition-all"
                            >
                                <p className="text-[9px] font-bold text-slate-500 uppercase truncate">{s.name}</p>
                                <p className={`text-sm font-black ${isLow ? 'text-red-500' : 'text-white'}`}>
                                    {formatCurrency(bal, s.currency || 'DZD')}
                                </p>
                            </button>
                        );
                    })}
                </div>
            </section>

            {/* Filters Section */}
            <section className="px-4 space-y-4">
                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                    <button
                        onClick={() => updateParams({ categoryId: "all" })}
                        className={`px-4 py-2 rounded-full text-[10px] font-black uppercase whitespace-nowrap transition-all ${initialCategoryId === "all" || !initialCategoryId ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-white/5 text-slate-400"}`}
                    >
                        Tout Categories
                    </button>
                    {categories.map((c: any) => (
                        <button
                            key={c.id}
                            onClick={() => updateParams({ categoryId: c.id })}
                            className={`px-4 py-2 border border-white/5 rounded-full text-[10px] font-bold uppercase whitespace-nowrap transition-all ${initialCategoryId === c.id.toString() ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-white/5 text-slate-400"}`}
                        >
                            {c.name}
                        </button>
                    ))}
                </div>

                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                    <button
                        onClick={() => updateParams({ status: "all" })}
                        className={`px-4 py-2 rounded-full text-[10px] font-black uppercase whitespace-nowrap transition-all ${initialStatus === "all" || !initialStatus ? "bg-[var(--primary)]/20 text-[var(--primary)] border border-[var(--primary)]/30" : "bg-white/5 text-slate-500"}`}
                    >
                        Tous Statuts
                    </button>
                    <button
                        onClick={() => updateParams({ status: "ACTIVE" })}
                        className={`px-4 py-2 rounded-full text-[10px] font-black uppercase whitespace-nowrap transition-all ${initialStatus === "ACTIVE" ? "bg-emerald-500/20 text-emerald-500 border border-emerald-500/30" : "bg-white/5 text-slate-500"}`}
                    >
                        En Vente
                    </button>
                    <button
                        onClick={() => updateParams({ status: "ARCHIVED" })}
                        className={`px-4 py-2 rounded-full text-[10px] font-black uppercase whitespace-nowrap transition-all ${initialStatus === "ARCHIVED" ? "bg-red-500/20 text-red-500 border border-red-500/30" : "bg-white/5 text-slate-500"}`}
                    >
                        Archivés
                    </button>
                </div>
            </section>

            {/* Product List */}
            <section className="px-4 space-y-3">
                <div className="flex justify-between items-center px-1">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">{filteredProducts.length} Produits</h3>
                </div>

                <div className="grid gap-3">
                    {filteredProducts.map((p: any) => {
                        const minPrice = p.variants?.length > 0
                            ? Math.min(...p.variants.map((v: any) => Number(v.salePriceDzd)))
                            : 0;

                        return (
                            <div key={p.id} className="p-3 bg-[#161616] border border-white/5 rounded-[2rem] flex items-center justify-between active:scale-[0.98] transition-all">
                                <div className="flex items-center gap-4">
                                    <div className="size-14 rounded-2xl bg-white/5 overflow-hidden flex items-center justify-center border border-white/5">
                                        {p.imageUrl ? (
                                            <NextImage
                                                src={p.imageUrl}
                                                alt={p.name}
                                                width={56}
                                                height={56}
                                                unoptimized
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <Package size={24} className="text-slate-700" />
                                        )}
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-black text-white truncate max-w-[160px]">{p.name}</p>
                                            <Chip size="sm" variant="dot" color={p.status === 'ACTIVE' ? 'success' : 'danger'} className="text-[8px] h-4 border-none p-0 capitalize">
                                                {p.status}
                                            </Chip>
                                        </div>
                                        <p className="text-xs font-bold text-primary">{formatCurrency(minPrice, 'DZD')}</p>
                                    </div>
                                </div>
                                <Dropdown classNames={{ content: "bg-[#161616] border border-[#262626]" }}>
                                    <DropdownTrigger>
                                        <Button isIconOnly aria-label="Actions sur ce produit" size="sm" variant="light" className="text-slate-600">
                                            <MoreVertical size={16} />
                                        </Button>
                                    </DropdownTrigger>
                                    <DropdownMenu aria-label="Actions" className="text-white">
                                        <DropdownItem key="edit" onPress={() => handleEditProduct(p)}>Modifier</DropdownItem>
                                        <DropdownItem key="stock" onPress={() => { setSelectedProductForImport(p); setIsMassImportOpen(true); }}>Gérer Stock</DropdownItem>
                                        <DropdownItem key="status" onPress={() => handleToggleStatus(p.id, p.status)}>
                                            {p.status === "ACTIVE" ? "Archiver" : "Réactiver"}
                                        </DropdownItem>
                                        <DropdownItem key="delete" className="text-red-500" onPress={() => handleDeleteProduct(p.id)}>Supprimer</DropdownItem>
                                    </DropdownMenu>
                                </Dropdown>
                            </div>
                        );
                    })}
                </div>

                {initialTotalPages > 1 && (
                    <div className="flex flex-col items-center gap-4 pt-6 pb-4">
                        <Pagination
                            total={initialTotalPages}
                            page={initialPage}
                            onChange={(page) => updateParams({ page })}
                            classNames={{
                                wrapper: "gap-1",
                                item: "bg-white/5 text-slate-400 font-bold border-none",
                                cursor: "bg-primary text-white font-black",
                            }}
                        />
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                            Page {initialPage} sur {initialTotalPages}
                        </p>
                    </div>
                )}
            </section>

            <AddProductModal
                isOpen={isAddProductOpen}
                onClose={() => { setIsAddProductOpen(false); setProductToEdit(null); }}
                categories={categories}
                suppliers={suppliers}
                productToEdit={productToEdit}
            />

            <AddCategoryModal
                isOpen={isAddCategoryOpen}
                onClose={() => { setIsAddCategoryOpen(false); setCategoryToEdit(null); }}
                categoryToEdit={categoryToEdit}
            />

            <ManageCategoriesModal
                isOpen={isManageCategoriesOpen}
                onClose={() => setIsManageCategoriesOpen(false)}
                categories={categories}
                onEdit={handleEditCategory}
            />

            <MassImportModal
                isOpen={isMassImportOpen}
                onClose={() => { setIsMassImportOpen(false); setSelectedProductForImport(null); }}
                product={selectedProductForImport}
            />

            {selectedSupplier && (
                <RechargeBalanceModal
                    isOpen={isRechargeOpen}
                    onClose={() => { setIsRechargeOpen(false); setSelectedSupplier(null); }}
                    supplierId={selectedSupplier.id}
                    supplierName={selectedSupplier.name}
                    currentBalance={selectedSupplier.balance || "0"}
                    exchangeRate={EXCHANGE_RATE_USD_DZD.toString()}
                    baseCurrency={selectedSupplier.currency || 'USD'}
                />
            )}
        </div>
    );
}
