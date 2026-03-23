"use client";

import React, { useState, useMemo } from "react";
import { useKioskStore } from "@/store/useKioskStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import ProductModal from "../components/ProductModal";
import NextImage from "next/image";
import { formatCurrency } from "@/lib/formatters";

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
            <header className="h-24 px-8 flex items-center justify-between bg-[#F9FAFB] border-b border-gray-100 shrink-0">
                {/* Logo Section */}
                <div className="flex-shrink-0">
                    {dashboardLogoUrl ? (
                        <div className="h-10 md:h-14 flex items-center">
                            <NextImage src={dashboardLogoUrl} alt={shopName} width={160} height={60} className="h-full w-auto object-contain" />
                        </div>
                    ) : (
                        <div className="text-3xl font-black tracking-tighter text-[#ec5b13]">
                            {shopName.toUpperCase().split(' ')[0]}
                        </div>
                    )}
                </div>

                {/* Center Search Bar */}
                <div className="flex-grow max-w-xl px-6">
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                            <svg className="w-6 h-6 text-black/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path d="21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5"></path>
                            </svg>
                        </div>
                        <input
                            className="w-full h-12 md:h-16 pl-14 pr-6 text-lg bg-white border-none rounded-full shadow-sm focus:ring-4 focus:ring-[#ec5b13]/20 transition-all placeholder:text-black/30 text-black font-bold outline-none"
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
                        className="relative bg-white h-12 md:h-16 px-8 rounded-full shadow-sm flex items-center justify-center gap-3 active:scale-95 transition-transform border border-gray-50 touch-target"
                    >
                        <svg className="w-8 h-8 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5"></path>
                        </svg>
                        <span className="text-xl font-black text-black">Panier</span>
                        <div className="absolute -top-1 -right-1 bg-[#ec5b13] text-white text-base font-black w-8 h-8 rounded-full flex items-center justify-center border-2 border-[#F9FAFB] shadow-md">
                            {cart.length}
                        </div>
                    </button>
                </div>
            </header>
            {/* END: Header */}

            {/* BEGIN: Main Content */}
            <main className="flex-grow overflow-hidden flex flex-col">
                {/* BEGIN: Categories Bar */}
                <nav className="py-4 px-8 overflow-x-auto no-scrollbar flex gap-3 whitespace-nowrap shrink-0">
                    {/* Active Category */}
                    <button
                        onClick={() => setSelectedCategoryId(null)}
                        className={`px-8 h-10 md:h-14 text-lg font-black rounded-full flex items-center justify-center transition-colors touch-target ${selectedCategoryId === null ? 'bg-black text-white' : 'bg-white border-2 border-slate-200 text-black active:bg-gray-100'}`}
                    >
                        Tous
                    </button>
                    {/* Inactive Categories */}
                    {categories.map((cat) => (
                        <button
                            key={cat.id}
                            onClick={() => setSelectedCategoryId(cat.id)}
                            className={`px-8 h-10 md:h-14 text-lg font-black rounded-full flex items-center justify-center transition-colors touch-target ${selectedCategoryId === cat.id ? 'bg-black text-white' : 'bg-white border-2 border-slate-200 text-black active:bg-gray-100'}`}
                        >
                            {cat.name}
                        </button>
                    ))}
                </nav>
                {/* END: Categories Bar */}

                {/* BEGIN: Product Grid */}
                <section className="flex-grow overflow-y-auto px-8 pb-8 no-scrollbar">
                    <div className="grid grid-cols-[repeat(auto-fill,243px)] gap-6 justify-center">
                        {filteredProducts.map((product) => (
                            <div
                                key={product.id}
                                onClick={() => setSelectedProduct(product)}
                                className="w-[243px] bg-white rounded-[24px] overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col active:scale-[0.98] transition-transform cursor-pointer group"
                            >
                                <div className="w-[243px] h-[228px] bg-[#F3F4F6] flex items-center justify-center relative overflow-hidden">
                                    {product.imageUrl && (
                                        <img
                                            alt={product.name}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                            src={product.imageUrl}
                                        />
                                    )}
                                </div>
                                <div className="p-5 flex flex-col gap-1 relative">
                                    <h3 className="text-lg font-black text-black leading-tight uppercase tracking-tight truncate">{product.name}</h3>

                                    <div className="flex items-center justify-between mt-1">
                                        <p className="text-[#ec5b13] text-md font-black">
                                            {formatCurrency(Math.min(...product.variants.map((v: any) => Number(v.salePriceDzd))), 'DZD')}
                                        </p>

                                        {/* Stock Badge */}
                                        {(() => {
                                            const totalStock = product.variants.reduce((acc: number, v: any) => acc + (v.stockCount || 0), 0);
                                            return totalStock > 0 ? (
                                                <div className="px-2 py-0.5 bg-emerald-50 text-[8px] font-black text-emerald-600 rounded-full border border-emerald-100 flex items-center gap-1 uppercase tracking-wider">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                                                    Dispo
                                                </div>
                                            ) : (
                                                <div className="px-2 py-0.5 bg-rose-50 text-[8px] font-black text-rose-600 rounded-full border border-rose-100 uppercase tracking-wider">
                                                    Rupture
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
                {/* END: Product Grid */}
            </main>
            {/* END: Main Content */}

            {/* BEGIN: Footer Message */}
            <footer className="h-12 bg-white border-t border-gray-100 flex items-center justify-center px-8 shrink-0">
                <p className="text-black/50 font-bold text-base">Touchez un produit pour voir les options disponibles</p>
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
