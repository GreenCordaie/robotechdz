"use client";

import React, { useState } from "react";
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
    User as HeroUser
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
    Filter
} from "lucide-react";
import { AddProductModal } from "@/components/admin/modals/AddProductModal";
import { AddCategoryModal } from "@/components/admin/modals/AddCategoryModal";
import { RechargeBalanceModal } from "@/components/admin/modals/RechargeBalanceModal";
import toast from "react-hot-toast";
import Link from "next/link";

interface Product {
    id: number;
    name: string;
    description: string | null;
    imageUrl: string | null;
    categoryId: number | null;
    variants: any[];
}

interface Supplier {
    id: number;
    name: string;
    balanceDzd: string | null;
    balanceUsd: string | null;
    exchangeRate: string | null;
}

interface Category {
    id: number;
    name: string;
    icon: string | null;
}

interface CatalogueContentProps {
    products: Product[];
    suppliers: Supplier[];
    categories: Category[];
}

export default function CatalogueContent({ products, suppliers, categories }: CatalogueContentProps) {
    const [isAddProductOpen, setIsAddProductOpen] = useState(false);
    const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
    const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
    const [isRechargeOpen, setIsRechargeOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedCategoryId, setSelectedCategoryId] = useState("all");
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const handleOpenRecharge = (supplier: Supplier) => {
        setSelectedSupplier(supplier);
        setIsRechargeOpen(true);
    };

    const filteredProducts = products.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = selectedCategoryId === "all" || p.categoryId?.toString() === selectedCategoryId;
        return matchesSearch && matchesCategory;
    });

    const handleExportCSV = () => {
        const headers = ["ID", "Nom", "Catégorie", "Prix Min", "Profit Moyen"];
        const rows = filteredProducts.map(p => {
            const cat = categories.find(c => c.id === p.categoryId);
            const minPrice = p.variants.length > 0
                ? Math.min(...p.variants.map(v => Number(v.salePriceDzd)))
                : 0;
            return [
                p.id,
                p.name,
                cat?.name || "Sans catégorie",
                minPrice,
                "Calc"
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

    const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
    const paginatedProducts = filteredProducts.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    return (
        <div className="flex flex-col min-h-full space-y-8 bg-[#0a0a0a]">
            {/* Header */}
            <header className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white tracking-tight">Catalogue & Fournisseurs</h2>
                <div className="flex items-center gap-4">
                    <div className="relative w-64">
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
                        className="w-48"
                        classNames={{
                            trigger: "bg-[#161616] border border-[#262626] rounded-xl h-10 min-h-10",
                            value: "text-white text-sm"
                        }}
                        placeholder="Catégorie"
                        selectedKeys={[selectedCategoryId]}
                        onSelectionChange={(keys) => setSelectedCategoryId(Array.from(keys)[0] as string)}
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
                        const balanceDzd = parseFloat(supplier.balanceDzd || "0");
                        const isLowBalance = balanceDzd < 5000;
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
                                            {balanceDzd.toLocaleString()} <span className="text-sm font-bold text-slate-500">DZD</span>
                                        </h4>
                                        <p className="text-xs text-slate-600 mt-2 font-bold uppercase">{parseFloat(supplier.balanceUsd || "0").toLocaleString()} USD</p>
                                    </div>
                                    <div className="p-2 bg-primary/10 rounded-lg text-primary shrink-0 transition-transform group-hover:scale-110">
                                        {parseFloat(supplier.balanceUsd || "0") > 0 ? <CircleDollarSign className="w-4 h-4 shrink-0" /> : <Landmark className="w-4 h-4 shrink-0" />}
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
                    <div className="flex gap-3">
                        <Button
                            onPress={() => setIsAddCategoryOpen(true)}
                            variant="flat"
                            className="flex items-center gap-2 px-6 py-2.5 bg-[#ec5b13]/10 text-[#ec5b13] rounded-xl text-sm font-black hover:bg-[#ec5b13]/20 transition-all active:scale-95"
                            startContent={<PlusCircle className="w-5 h-5 shrink-0" />}
                        >
                            Nouvelle Catégorie
                        </Button>
                        <Button
                            onPress={() => setIsAddProductOpen(true)}
                            className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl text-sm font-black shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform active:scale-95"
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

                                            // Find the primary linked supplier for this variant
                                            const linkedSup = v.variantSuppliers?.[0];
                                            let buyPriceUsd = parseFloat(v.purchasePriceUsd);
                                            let rate = 225;

                                            if (linkedSup) {
                                                buyPriceUsd = parseFloat(linkedSup.purchasePriceUsd);
                                                // Find the supplier object to get their specific rate
                                                const supplierObj = suppliers.find(s => s.id === linkedSup.supplierId);
                                                if (supplierObj) {
                                                    rate = parseFloat(supplierObj.exchangeRate || "225");
                                                }
                                            } else if (suppliers.length > 0) {
                                                // Fallback to first supplier rate
                                                rate = parseFloat(suppliers[0].exchangeRate || "225");
                                            }

                                            return acc + (sellPrice - (buyPriceUsd * rate));
                                        }, 0) / product.variants.length
                                        : 0;

                                    return (
                                        <tr key={product.id} className="hover:bg-white/5 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="size-12 rounded-xl bg-[#262626] flex items-center justify-center shrink-0 overflow-hidden border border-white/5">
                                                        {product.imageUrl ? (
                                                            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover shrink-0" />
                                                        ) : (
                                                            <Package className="w-6 h-6 text-primary shrink-0 opacity-50" />
                                                        )}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-bold text-white truncate uppercase tracking-tight">{product.name}</p>
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
                                                <p className="text-sm font-black text-white whitespace-nowrap">{minPrice.toLocaleString()} <span className="text-[10px] text-slate-500">DZD</span></p>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <p className={`text-sm font-black whitespace-nowrap ${avgProfit > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                    {avgProfit > 0 ? '+' : ''}{Math.round(avgProfit).toLocaleString()} <span className="text-[10px] opacity-60">DZD</span>
                                                </p>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <Button
                                                    isIconOnly
                                                    size="sm"
                                                    variant="light"
                                                    className="text-slate-500 hover:text-white transition-colors hover:bg-[#262626]"
                                                    onClick={() => toast("Modifier / Supprimer bientôt disponible")}
                                                >
                                                    <MoreVertical className="w-4 h-4 shrink-0" />
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-6 py-4 border-t border-[#262626] bg-[#262626]/20 flex items-center justify-between">
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                            Page {currentPage} sur {totalPages || 1} ({filteredProducts.length} produits)
                        </p>
                        <div className="flex gap-2">
                            <Button
                                size="sm"
                                variant="flat"
                                className="bg-[#262626] text-white font-bold h-8 px-4 rounded-lg disabled:opacity-50"
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                            >
                                Précédent
                            </Button>
                            <Button
                                size="sm"
                                variant="flat"
                                className="bg-[#262626] text-white font-bold h-8 px-4 rounded-lg disabled:opacity-50"
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage >= totalPages}
                            >
                                Suivant
                            </Button>
                        </div>
                    </div>
                </div>
            </section>

            <AddProductModal
                isOpen={isAddProductOpen}
                onClose={() => setIsAddProductOpen(false)}
                categories={categories}
                suppliers={suppliers}
            />

            <AddCategoryModal
                isOpen={isAddCategoryOpen}
                onClose={() => setIsAddCategoryOpen(false)}
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
                    currentBalance={selectedSupplier.balanceUsd || "0"}
                    exchangeRate={selectedSupplier.exchangeRate || "225"}
                />
            )}
        </div>
    );
}
