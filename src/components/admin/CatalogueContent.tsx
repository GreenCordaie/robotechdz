"use client";

import React, { useState, useEffect, useTransition, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import NextImage from "next/image";
import {
    Button,
    Card,
    CardBody,
    Input,
    Table,
    TableHeader,
    TableColumn,
    TableBody,
    TableRow,
    TableCell,
    Chip,
    Select,
    SelectItem,
    User as HeroUser,
    Dropdown,
    DropdownTrigger,
    DropdownMenu,
    DropdownItem,
    Spinner
} from "@heroui/react";
import {
    MoreVertical,
    Plus,
    Search,
    Bell,
    Settings,
    LayoutGrid,
    Package,
    Wallet,
    Truck,
    AlertTriangle,
    PlusCircle,
    ArrowUpCircle,
    Landmark,
    CircleDollarSign,
    Download,
    Printer,
    Filter,
    Edit,
    Trash
} from "lucide-react";
import { AddProductModal } from "@/components/admin/modals/AddProductModal";
import { AddCategoryModal } from "@/components/admin/modals/AddCategoryModal";
import { ManageCategoriesModal } from "@/components/admin/modals/ManageCategoriesModal";
import { RechargeBalanceModal } from "@/components/admin/modals/RechargeBalanceModal";
import { MassImportModal } from "@/components/admin/modals/MassImportModal";
import { deleteProductAction, toggleProductStatusAction } from "@/app/admin/catalogue/actions";
import toast from "react-hot-toast";
import Link from "next/link";
import { formatCurrency } from "@/lib/formatters";

interface Product {
    id: number;
    name: string;
    description: string | null;
    imageUrl: string | null;
    categoryId: number | null;
    status: string; // Add status field
    variants: any[];
}

interface Supplier {
    id: number;
    name: string;
    balance: string | null;
    currency: string | null;
    status: string;
}

interface Category {
    id: number;
    name: string;
    icon: string | null;
    imageUrl: string | null;
}

interface CatalogueContentProps {
    initialProducts: Product[];
    suppliers: any[];
    categories: any[];
    initialTotal: number;
    initialTotalPages: number;
    initialPage: number;
    initialSearch: string;
    initialCategoryId: string;
    initialStatus: "ACTIVE" | "ARCHIVED";
}

export default function CatalogueContent({
    initialProducts,
    suppliers,
    categories,
    initialTotal,
    initialTotalPages,
    initialPage,
    initialSearch,
    initialCategoryId,
    initialStatus
}: CatalogueContentProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        const interval = setInterval(() => {
            router.refresh();
        }, 30000); // Sustainable 30s interval
        return () => clearInterval(interval);
    }, [router]);

    const [isAddProductOpen, setIsAddProductOpen] = useState(false);
    const [productToEdit, setProductToEdit] = useState<Product | null>(null);
    const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
    const [isManageCategoriesOpen, setIsManageCategoriesOpen] = useState(false);
    const [categoryToEdit, setCategoryToEdit] = useState<Category | null>(null);
    const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
    const [isRechargeOpen, setIsRechargeOpen] = useState(false);
    const [isMassImportOpen, setIsMassImportOpen] = useState(false);
    const [selectedProductForImport, setSelectedProductForImport] = useState<Product | null>(null);

    // Filter states synced with URL
    const [searchTerm, setSearchTerm] = useState(initialSearch);
    const [selectedCategoryId, setSelectedCategoryId] = useState(initialCategoryId);
    const [status, setStatus] = useState<"ACTIVE" | "ARCHIVED">(initialStatus);
    const [page, setPage] = useState(initialPage);

    // Create a new URL with updated search params
    const createPageUrl = (pageNumber: number, search?: string, catId?: string, currentStatus?: string) => {
        const params = new URLSearchParams();
        params.set("page", pageNumber.toString());
        if (search) params.set("search", search);
        if (catId && catId !== "all") params.set("categoryId", catId);
        if (currentStatus && currentStatus !== "ACTIVE") params.set("status", currentStatus);
        return `${pathname}?${params.toString()}`;
    };

    const updateParams = useCallback((newParams: Record<string, string | number | null>) => {
        const params = new URLSearchParams(searchParams.toString());
        Object.entries(newParams).forEach(([key, value]) => {
            if (value === null || value === "all" || value === "") {
                params.delete(key);
            } else {
                params.set(key, value.toString());
            }
        });
        // Always reset to page 1 on search/category change unless page is explicitly provided
        if (!newParams.page) params.delete("page");

        startTransition(() => {
            router.push(`${pathname}?${params.toString()}`);
        });
    }, [searchParams, pathname, router]);

    // Debounced search
    useEffect(() => {
        if (searchTerm === initialSearch) return;
        const handler = setTimeout(() => {
            updateParams({ search: searchTerm });
        }, 500);
        return () => clearTimeout(handler);
    }, [searchTerm, initialSearch, updateParams]);

    const handlePageChange = (newPage: number) => {
        updateParams({ page: newPage });
    };

    const handleCategoryChange = (val: string) => {
        setSelectedCategoryId(val);
        updateParams({ categoryId: val });
    };

    const handleOpenRecharge = (supplier: Supplier) => {
        setSelectedSupplier(supplier);
        setIsRechargeOpen(true);
    };

    const handleEditCategory = (category: Category) => {
        setCategoryToEdit(category);
        setIsManageCategoriesOpen(false);
        setIsAddCategoryOpen(true);
    };

    const handleCloseAddCategory = () => {
        setIsAddCategoryOpen(false);
        setCategoryToEdit(null);
    };

    const handleEditProduct = (product: Product) => {
        setProductToEdit(product);
        setIsAddProductOpen(true);
    };

    const handleCloseAddProduct = () => {
        setIsAddProductOpen(false);
        setProductToEdit(null);
    };

    const handleDeleteProduct = async (id: number) => {
        if (confirm("Êtes-vous sûr de vouloir supprimer ce produit ?")) {
            const res = await deleteProductAction({ id });
            if (res.success) {
                toast.success("Produit supprimé");
                router.refresh();
            } else {
                toast.error(res.error || "Erreur lors de la suppression");
            }
        }
    };

    const handleToggleStatus = async (id: number, currentStatus: string) => {
        const newStatus = currentStatus === "ACTIVE" ? "ARCHIVED" : "ACTIVE";
        const msg = newStatus === "ARCHIVED"
            ? "Archiver ce produit ? Il ne sera plus visible sur le Kiosque."
            : "Réactiver ce produit ?";

        if (confirm(msg)) {
            const res = await toggleProductStatusAction({ id, status: newStatus });
            if (res.success) {
                toast.success(newStatus === "ARCHIVED" ? "Produit archivé" : "Produit activé");
                router.refresh();
            } else {
                toast.error(res.error || "Erreur de statut");
            }
        }
    };

    const handleOpenMassImport = (product: Product) => {
        setSelectedProductForImport(product);
        setIsMassImportOpen(true);
    };

    const products = initialProducts;
    const filteredProductsForCount = initialProducts; // This replaces the local filter for stats

    const handleExportCSV = () => {
        const headers = ["ID", "Nom", "Catégorie", "Prix Min", "Profit Moyen"];
        const rows = products.map(p => {
            const cat = categories.find(c => c.id === p.categoryId);
            const minPrice = p.variants.length > 0
                ? Math.min(...p.variants.map(v => Number(v.salePriceDzd)))
                : 0;
            return [
                p.id,
                p.name,
                cat?.name || "Sans catégorie",
                minPrice,
                "Profit Estimé"
            ];
        });

        const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `catalogue_${new Date().toISOString()}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success("Catalogue exporté");
    };

    const handlePrint = () => {
        window.print();
    };

    const totalPages = initialTotalPages;
    const paginatedProducts = products;

    const EXCHANGE_RATE_USD_DZD = 245;

    return (
        <div className="flex flex-col min-h-full space-y-8 bg-[#0a0a0a]">
            <header className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                    <h2 className="text-xl font-bold text-white tracking-tight">Catalogue & Fournisseurs</h2>
                    <div className="hidden md:flex bg-[#161616] p-1 rounded-xl border border-[#262626]">
                        <button
                            onClick={() => {
                                setStatus("ACTIVE");
                                setPage(1);
                                router.push(createPageUrl(1, searchTerm, selectedCategoryId, "ACTIVE"));
                            }}
                            className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${status === "ACTIVE" ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-slate-500 hover:text-slate-300"}`}
                        >
                            En Vente
                        </button>
                        <button
                            onClick={() => {
                                setStatus("ARCHIVED");
                                setPage(1);
                                router.push(createPageUrl(1, searchTerm, selectedCategoryId, "ARCHIVED"));
                            }}
                            className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${status === "ARCHIVED" ? "bg-red-500/80 text-white shadow-lg shadow-red-500/20" : "text-slate-500 hover:text-slate-300"}`}
                        >
                            Archives
                        </button>
                    </div>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
                    <div className="relative w-full max-w-xs md:w-64 shrink-0">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4 shrink-0" />
                        <Input
                            classNames={{
                                input: "pl-10 text-white",
                                inputWrapper: "bg-[#161616] border border-[#262626] rounded-xl h-10 text-sm focus-within:ring-2 focus-within:ring-primary/50"
                            }}
                            placeholder="Rechercher..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Select
                        className="w-full sm:w-48 shrink-0"
                        classNames={{
                            trigger: "bg-[#161616] border border-[#262626] rounded-xl h-10 min-h-10",
                            value: "text-white text-sm"
                        }}
                        placeholder="Catégorie"
                        selectedKeys={[selectedCategoryId]}
                        onSelectionChange={(keys) => handleCategoryChange(Array.from(keys)[0] as string)}
                    >
                        {[
                            { id: "all", name: "Toutes les catégories" },
                            ...categories.map(c => ({ id: c.id.toString(), name: c.name }))
                        ].map((cat) => (
                            <SelectItem key={cat.id} textValue={cat.name}>
                                {cat.name}
                            </SelectItem>
                        ))}
                    </Select>
                    {isPending && <Spinner size="sm" color="warning" className="shrink-0" />}
                    <div className="flex gap-2 border-l border-[#262626] pl-4">
                        <Button
                            isIconOnly
                            className="size-10 rounded-xl bg-[#161616] border border-[#262626] flex items-center justify-center hover:bg-[#262626] transition-colors"
                            onClick={handleExportCSV}
                        >
                            <Download className="w-5 h-5 text-slate-400 shrink-0" />
                        </Button>
                    </div>
                    <Button
                        isIconOnly
                        className="size-10 rounded-xl bg-[#161616] border border-[#262626] flex items-center justify-center hover:bg-[#262626] transition-colors"
                        onClick={() => toast.success("Aucune nouvelle notification")}
                    >
                        <Bell className="w-5 h-5 text-slate-400 shrink-0" />
                    </Button>
                    <Button
                        isIconOnly
                        className="size-10 rounded-xl bg-[#161616] border border-[#262626] flex items-center justify-center hover:bg-[#262626] transition-colors"
                        as={Link}
                        href="/admin/settings"
                    >
                        <Settings className="w-5 h-5 text-slate-400 shrink-0" />
                    </Button>
                </div>
            </header>

            {/* Section 1: Portefeuilles Fournisseurs */}
            <section>
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold flex items-center gap-2 text-white">
                        <Landmark className="text-primary w-5 h-5 shrink-0" />
                        Portefeuilles Fournisseurs
                    </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {suppliers.map((supplier) => {
                        const bal = parseFloat(supplier.balance || "0");
                        const currency = (supplier.currency as 'USD' | 'DZD') || 'DZD';
                        const balanceDzd = currency === 'DZD' ? bal : bal * EXCHANGE_RATE_USD_DZD;
                        const isLowBalance = currency === 'USD' ? bal < 100 : bal < 5000;

                        return (
                            <div key={supplier.id} className={`bg-[#161616] p-5 rounded-xl border ${isLowBalance ? 'border-red-500/50' : 'border-[#262626]'} shadow-sm flex flex-col justify-between h-44 relative overflow-hidden group hover:border-primary/30 transition-colors`}>
                                {isLowBalance && (
                                    <div className="absolute top-0 right-0 p-2">
                                        <span className="flex items-center gap-1 px-2 py-1 bg-red-500/10 text-red-500 text-[10px] font-bold rounded-full uppercase shrink-0">
                                            <AlertTriangle className="w-3 h-3 shrink-0" />
                                            Alerte Solde
                                        </span>
                                    </div>
                                )}
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-sm text-slate-500 font-medium uppercase tracking-wider">{supplier.name}</p>
                                        <h4 className={`text-2xl font-black mt-2 leading-none tracking-tighter ${isLowBalance ? 'text-red-500' : 'text-white'}`}>
                                            {formatCurrency(bal, currency)}
                                        </h4>
                                        {currency === 'USD' && (
                                            <p className="text-xs text-slate-600 mt-2 font-bold uppercase">~ {formatCurrency(balanceDzd, 'DZD')}</p>
                                        )}
                                    </div>
                                    <div className="p-2 bg-primary/10 rounded-lg text-primary shrink-0 transition-transform group-hover:scale-110">
                                        {currency === 'USD' ? <CircleDollarSign className="w-4 h-4 shrink-0" /> : <Landmark className="w-4 h-4 shrink-0" />}
                                    </div>
                                </div>
                                <Button
                                    size="sm"
                                    onClick={() => handleOpenRecharge(supplier)}
                                    className={`w-full font-bold ${isLowBalance ? 'bg-red-500 text-white' : 'bg-primary/10 text-primary hover:bg-primary hover:text-white'} transition-all rounded-lg`}
                                    startContent={isLowBalance ? <ArrowUpCircle className="w-4 h-4 shrink-0" /> : <PlusCircle className="w-4 h-4 shrink-0" />}
                                >
                                    {isLowBalance ? 'Recharger Urgent' : 'Recharger'}
                                </Button>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* Section 2: Catalogue Produits */}
            <section>
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold flex items-center gap-2 text-white">
                        <Package className="text-primary w-5 h-5 shrink-0" />
                        Catalogue Produits
                    </h3>
                    <div className="flex flex-wrap md:flex-nowrap gap-3">
                        <Button
                            onPress={() => setIsAddCategoryOpen(true)}
                            variant="flat"
                            className="flex-1 md:flex-none flex items-center gap-2 px-6 py-2.5 bg-blue-500/10 text-blue-500 rounded-xl text-sm font-black hover:bg-blue-500/20 transition-all active:scale-95"
                            startContent={<PlusCircle className="w-5 h-5 shrink-0" />}
                        >
                            <span className="hidden sm:inline">Ajouter une Catégorie</span>
                            <span className="sm:hidden">+ Cat</span>
                        </Button>
                        <Button
                            onPress={() => setIsManageCategoriesOpen(true)}
                            variant="flat"
                            className="flex-1 md:flex-none flex items-center gap-2 px-6 py-2.5 bg-[#ec5b13]/10 text-[#ec5b13] rounded-xl text-sm font-black hover:bg-[#ec5b13]/20 transition-all active:scale-95"
                            startContent={<Settings className="w-5 h-5 shrink-0" />}
                        >
                            <span className="hidden sm:inline">Gérer les Catégories</span>
                            <span className="sm:hidden">Gérer</span>
                        </Button>
                        <Button
                            onPress={() => setIsAddProductOpen(true)}
                            className="w-full md:w-auto flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl text-sm font-black shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform active:scale-95"
                            startContent={<Plus className="w-5 h-5 shrink-0" />}
                        >
                            Ajouter un Produit
                        </Button>
                    </div>
                </div>

                <div className="bg-[#161616] border border-[#262626] rounded-2xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-[#262626]/50 border-b border-[#262626]">
                                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Produit</th>
                                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Catégorie</th>
                                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Prix de Vente</th>
                                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Profit Est.</th>
                                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#262626]">
                                {paginatedProducts.map((product) => {
                                    const category = categories.find(c => c.id === product.categoryId);
                                    const minPrice = product.variants.length > 0
                                        ? Math.min(...product.variants.map(v => Number(v.salePriceDzd)))
                                        : 0;

                                    // Improved profit calculation across variants for display
                                    const avgProfit = product.variants.length > 0
                                        ? product.variants.reduce((acc, v) => {
                                            const sellPrice = parseFloat(v.salePriceDzd);
                                            const totalRevenue = v.isSharing ? sellPrice * (v.totalSlots || 1) : sellPrice;

                                            // Find the primary linked supplier for this variant
                                            const linkedSup = v.variantSuppliers?.[0];
                                            if (!linkedSup) return acc + totalRevenue; // Assume 100% profit if no cost data

                                            const buyPrice = parseFloat(linkedSup.purchasePrice || "0");
                                            let buyPriceDzd = buyPrice;

                                            if (linkedSup.currency === 'USD') {
                                                const rate = EXCHANGE_RATE_USD_DZD;
                                                buyPriceDzd = buyPrice * rate;
                                            }

                                            return acc + (totalRevenue - buyPriceDzd);
                                        }, 0) / product.variants.length
                                        : 0;

                                    return (
                                        <tr key={product.id} className="hover:bg-white/5 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="size-12 rounded-xl bg-[#262626] flex items-center justify-center shrink-0 overflow-hidden border border-white/5">
                                                        {product.imageUrl ? (
                                                            <NextImage src={product.imageUrl} alt={product.name} width={48} height={48} className="w-full h-full object-cover shrink-0" />
                                                        ) : (
                                                            <Package className="w-6 h-6 text-primary shrink-0 opacity-50" />
                                                        )}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="flex flex-col">
                                                            <p className="text-slate-100 font-bold text-sm tracking-tight group-hover:text-primary transition-colors">{product.name}</p>
                                                            {product.status === "ARCHIVED" && (
                                                                <Chip size="sm" variant="flat" color="default" className="mt-1 h-4 text-[8px] border-none uppercase font-black">Archivé</Chip>
                                                            )}
                                                        </div>
                                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">ID: #{product.id + 1000}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <Chip size="sm" variant="flat" className="font-bold text-[10px] uppercase bg-[#262626] text-slate-400 border border-white/5">
                                                    {category?.name || "Sans catégorie"}
                                                </Chip>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <p className="text-sm font-black text-white whitespace-nowrap">{formatCurrency(minPrice, 'DZD')}</p>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <p className={`text-sm font-black whitespace-nowrap ${avgProfit > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                    {avgProfit > 0 ? '+' : ''}{formatCurrency(Math.round(avgProfit), 'DZD')}
                                                </p>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <Dropdown classNames={{ content: "bg-[#161616] border border-[#262626]" }}>
                                                    <DropdownTrigger>
                                                        <Button
                                                            isIconOnly
                                                            size="sm"
                                                            variant="light"
                                                            className="text-slate-500 hover:text-white transition-colors hover:bg-[#262626]"
                                                        >
                                                            <MoreVertical className="w-4 h-4 shrink-0" />
                                                        </Button>
                                                    </DropdownTrigger>
                                                    <DropdownMenu aria-label="Actions produit">
                                                        <DropdownItem
                                                            key="edit"
                                                            startContent={<Edit className="w-4 h-4 shrink-0 text-primary" />}
                                                            className="text-white hover:bg-white/5"
                                                            onPress={() => handleEditProduct(product)}
                                                        >
                                                            Modifier
                                                        </DropdownItem>
                                                        <DropdownItem
                                                            key="stock"
                                                            startContent={<PlusCircle className="w-4 h-4 shrink-0 text-emerald-500" />}
                                                            className="text-white hover:bg-white/5"
                                                            onPress={() => handleOpenMassImport(product)}
                                                        >
                                                            Gérer le Stock
                                                        </DropdownItem>
                                                        <DropdownItem
                                                            key="status"
                                                            startContent={product.status === "ACTIVE" ? <Bell className="w-4 h-4 shrink-0 text-amber-500" /> : <ArrowUpCircle className="w-4 h-4 shrink-0 text-emerald-500" />}
                                                            className="text-white hover:bg-white/5"
                                                            onPress={() => handleToggleStatus(product.id, product.status)}
                                                        >
                                                            {product.status === "ACTIVE" ? "Archiver (Cacher)" : "Réactiver"}
                                                        </DropdownItem>
                                                        <DropdownItem
                                                            key="delete"
                                                            className="text-red-500 hover:bg-red-500/10"
                                                            startContent={<Trash className="w-4 h-4 shrink-0" />}
                                                            onPress={() => handleDeleteProduct(product.id)}
                                                        >
                                                            Supprimer défi.
                                                        </DropdownItem>
                                                    </DropdownMenu>
                                                </Dropdown>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-6 py-4 border-t border-[#262626] bg-[#262626]/20 flex items-center justify-between">
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                            Page {initialPage} sur {totalPages || 1} ({initialTotal} produits au total)
                        </p>
                        <div className="flex gap-2">
                            <Button
                                size="sm"
                                variant="flat"
                                className="bg-[#262626] text-white font-bold h-8 px-4 rounded-lg disabled:opacity-50"
                                onClick={() => handlePageChange(Math.max(1, initialPage - 1))}
                                disabled={initialPage === 1 || isPending}
                            >
                                Précédent
                            </Button>
                            <Button
                                size="sm"
                                variant="flat"
                                className="bg-[#262626] text-white font-bold h-8 px-4 rounded-lg disabled:opacity-50"
                                onClick={() => handlePageChange(Math.min(totalPages, initialPage + 1))}
                                disabled={initialPage >= totalPages || isPending}
                            >
                                Suivant
                            </Button>
                        </div>
                    </div>
                </div>
            </section>

            <AddProductModal
                isOpen={isAddProductOpen}
                onClose={handleCloseAddProduct}
                categories={categories}
                suppliers={suppliers}
                productToEdit={productToEdit}
            />

            <AddCategoryModal
                isOpen={isAddCategoryOpen}
                onClose={handleCloseAddCategory}
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
                onClose={() => {
                    setIsMassImportOpen(false);
                    setSelectedProductForImport(null);
                }}
                product={selectedProductForImport}
            />

            {selectedSupplier && (
                <RechargeBalanceModal
                    isOpen={isRechargeOpen}
                    onClose={() => {
                        setIsRechargeOpen(false);
                        setSelectedSupplier(null);
                    }}
                    supplierId={selectedSupplier.id}
                    supplierName={selectedSupplier.name}
                    currentBalance={selectedSupplier.balance || "0"}
                    exchangeRate={EXCHANGE_RATE_USD_DZD.toString()}
                    baseCurrency={(selectedSupplier.currency as 'USD' | 'DZD') || 'USD'}
                />
            )}
        </div>
    );
}
