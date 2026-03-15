"use client";

import React, { useState, useMemo } from "react";
import { useKioskStore } from "@/store/useKioskStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import ProductModal from "../components/ProductModal";

interface CatalogueViewProps {
    products: any[];
    categories: any[];
}

export default function CatalogueView({ products, categories }: CatalogueViewProps) {
    const {
        cart,
        setStep
    } = useKioskStore();
    const { shopName, dashboardLogoUrl } = useSettingsStore();

    const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedProduct, setSelectedProduct] = useState<any | null>(null);

    // Filtering logic
    const filteredProducts = useMemo(() => {
        return products.filter((p) => {
            const matchesCategory = selectedCategoryId ? p.categoryId === selectedCategoryId : true;
            const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
            return matchesCategory && matchesSearch;
        });
    }, [products, selectedCategoryId, searchTerm]);

    return (
        <div className="bg-[#F9FAFB] font-sans text-slate-900 overflow-hidden h-screen flex flex-col select-none touch-none scale-100 origin-top">
            <style jsx global>{`
                .no-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .no-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
            `}</style>

            {/* BEGIN: Header */}
            <header className="h-32 px-10 flex items-center justify-between bg-[#F9FAFB] border-b border-gray-100 shrink-0">
                {/* Logo Section */}
                <div className="flex-shrink-0">
                    {dashboardLogoUrl ? (
                        <div className="h-20 flex items-center">
                            <img src={dashboardLogoUrl} alt={shopName} className="h-full w-auto object-contain" />
                        </div>
                    ) : (
                        <div className="text-4xl font-black tracking-tighter text-[#ec5b13]">
                            {shopName.toUpperCase().split(' ')[0]}
                        </div>
                    )}
                </div>

                {/* Center Search Bar */}
                <div className="flex-grow max-w-2xl px-8">
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none">
                            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path d="21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5"></path>
                            </svg>
                        </div>
                        <input
                            className="w-full h-20 pl-16 pr-8 text-2xl bg-white border-none rounded-full shadow-sm focus:ring-4 focus:ring-[#ec5b13]/20 transition-all placeholder:text-gray-300 outline-none"
                            placeholder="Rechercher un produit..."
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* Cart Button placeholder - matches Stitch design */}
                <div className="flex-shrink-0">
                    <button
                        onClick={() => setStep("CART")}
                        className="relative bg-white h-20 px-10 rounded-full shadow-sm flex items-center justify-center gap-4 active:scale-95 transition-transform border border-gray-50 touch-target"
                    >
                        <svg className="w-10 h-10 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                        </svg>
                        <span className="text-2xl font-bold text-slate-700">Panier</span>
                        <div className="absolute -top-2 -right-2 bg-[#ec5b13] text-white text-lg font-bold w-10 h-10 rounded-full flex items-center justify-center border-4 border-[#F9FAFB] shadow-md">
                            {cart.length}
                        </div>
                    </button>
                </div>
            </header>
            {/* END: Header */}

            {/* BEGIN: Main Content */}
            <main className="flex-grow overflow-hidden flex flex-col">
                {/* BEGIN: Categories Bar */}
                <nav className="py-8 px-10 overflow-x-auto no-scrollbar flex gap-4 whitespace-nowrap shrink-0">
                    {/* Active Category */}
                    <button
                        onClick={() => setSelectedCategoryId(null)}
                        className={`px-12 h-20 text-2xl font-bold rounded-full flex items-center justify-center transition-colors touch-target ${selectedCategoryId === null ? 'bg-black text-white' : 'bg-white border border-gray-200 text-black active:bg-gray-100'}`}
                    >
                        Tous
                    </button>
                    {/* Inactive Categories */}
                    {categories.map((cat) => (
                        <button
                            key={cat.id}
                            onClick={() => setSelectedCategoryId(cat.id)}
                            className={`px-12 h-20 text-2xl font-semibold rounded-full flex items-center justify-center transition-colors touch-target ${selectedCategoryId === cat.id ? 'bg-black text-white' : 'bg-white border border-gray-200 text-black active:bg-gray-100'}`}
                        >
                            {cat.name}
                        </button>
                    ))}
                </nav>
                {/* END: Categories Bar */}

                {/* BEGIN: Product Grid */}
                <section className="flex-grow overflow-y-auto px-10 pb-12 no-scrollbar">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-10">
                        {filteredProducts.map((product) => (
                            <div
                                key={product.id}
                                onClick={() => setSelectedProduct(product)}
                                className="bg-white rounded-[32px] overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col active:scale-[0.98] transition-transform cursor-pointer group"
                            >
                                <div className="h-64 bg-[#F3F4F6] flex items-center justify-center p-12">
                                    <img
                                        alt={product.name}
                                        className="w-full h-full object-contain filter drop-shadow-lg group-hover:scale-105 transition-transform duration-500"
                                        src={product.imageUrl}
                                    />
                                </div>
                                <div className="p-8 flex flex-col gap-2">
                                    <h3 className="text-2xl font-bold text-slate-800 leading-tight">{product.name}</h3>
                                    <p className="text-[#ec5b13] text-xl font-bold mt-1">
                                        À partir de {Math.min(...product.variants.map((v: any) => Number(v.salePriceDzd))).toLocaleString()} DZD
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
                {/* END: Product Grid */}
            </main>
            {/* END: Main Content */}

            {/* BEGIN: Footer Message */}
            <footer className="h-16 bg-white border-t border-gray-100 flex items-center justify-center px-10 shrink-0">
                <p className="text-gray-400 font-medium text-lg">Touchez un produit pour voir les options disponibles</p>
            </footer>
            {/* END: Footer Message */}

            {/* Selection Modal */}
            <ProductModal
                isOpen={!!selectedProduct}
                onClose={() => setSelectedProduct(null)}
                product={selectedProduct}
            />
        </div>
    );
}
