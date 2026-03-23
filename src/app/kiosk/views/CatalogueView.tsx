"use client";

import React, { useState, useMemo } from "react";
import { useKioskStore } from "@/store/useKioskStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import ProductModal from "../components/ProductModal";
import { formatCurrency } from "@/lib/formatters";

interface CatalogueViewProps {
    products: any[];
    categories: any[];
}

// ─── Fallback categories (quand la DB n'en a pas) ──────────────────────────
const FALLBACK_CATEGORIES = [
    { id: -1, name: "Gaming" },
    { id: -2, name: "Streaming" },
    { id: -3, name: "Cartes Cadeaux" },
    { id: -4, name: "Recharges" },
];

// ─── Category icon mapping (T017) ──────────────────────────────────────────
const ICON_MAP: Record<string, string> = {
    gaming:    "sports_esports",
    jeux:      "sports_esports",
    game:      "sports_esports",
    streaming: "live_tv",
    stream:    "live_tv",
    video:     "live_tv",
    carte:     "redeem",
    card:      "redeem",
    cadeau:    "redeem",
    gift:      "redeem",
    recharge:  "smartphone",
    mobile:    "smartphone",
    musique:   "music_note",
    music:     "music_note",
};

function getCategoryIcon(name: string): string {
    const lower = name.toLowerCase();
    for (const [key, icon] of Object.entries(ICON_MAP)) {
        if (lower.includes(key)) return icon;
    }
    return "apps";
}

// ─── Component ─────────────────────────────────────────────────────────────
export default function CatalogueView({ products, categories }: CatalogueViewProps) {

    // T007 — Brancher les stores
    const { cart, setStep, updateQuantity, removeFromCart, getTotalAmount } = useKioskStore();
    useSettingsStore(); // shopName disponible si besoin

    // T006 — States locaux
    const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
    const [searchTerm,         setSearchTerm]         = useState("");
    const [selectedProduct,    setSelectedProduct]     = useState<any | null>(null);

    // Catégories à afficher — fallback si la DB est vide
    const displayCategories = categories.length > 0 ? categories : FALLBACK_CATEGORIES;
    const usingFallback     = categories.length === 0;

    // T008 — Filtrage
    const filteredProducts = useMemo(() => {
        return products.filter((p, index) => {
            const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
            if (!matchesSearch) return false;
            if (!selectedCategoryId) return true;
            if (!usingFallback) return p.categoryId === selectedCategoryId;
            // Fallback : distribue les produits par index % nb catégories
            const catIndex = FALLBACK_CATEGORIES.findIndex(c => c.id === selectedCategoryId);
            return catIndex !== -1 && (index % FALLBACK_CATEGORIES.length) === catIndex;
        });
    }, [products, selectedCategoryId, searchTerm, usingFallback]);

    const totalAmount = getTotalAmount();
    const totalItems  = cart.reduce((sum, item) => sum + item.quantity, 0);

    // ─── Render ─────────────────────────────────────────────────────────────
    return (
        // T005 — Root : flex layout full-screen
        <div className="flex h-screen w-screen overflow-hidden bg-[#F5F5F7] select-none touch-none">

            {/* ══════════════════════════════════════════════════════════════
                MAIN — zone gauche (~75%)
            ══════════════════════════════════════════════════════════════ */}
            <main className="flex flex-col flex-1 overflow-hidden">

                {/* T009 — Search Bar */}
                <div className="px-8 pt-8 pb-4 shrink-0">
                    <div className="relative">
                        <span className="material-symbols-outlined absolute left-6 top-1/2 -translate-y-1/2 text-[#86868B] !text-3xl pointer-events-none">
                            search
                        </span>
                        <input
                            className="w-full bg-white rounded-[24px] py-5 pl-16 pr-6 text-xl shadow-[0_4px_24px_rgba(0,0,0,0.06)] focus:ring-2 focus:ring-[#FF8000]/20 outline-none placeholder:text-[#86868B] text-gray-900 font-medium transition-all"
                            placeholder="Rechercher un produit, une marque..."
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* T018-T021 — Category Chips */}
                <nav
                    className="px-8 pb-4 overflow-x-auto shrink-0"
                    style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                >
                    <div className="flex gap-3 w-max">
                        {/* Chip "Tout" */}
                        <button
                            onClick={() => setSelectedCategoryId(null)}
                            className={`flex items-center gap-2 px-6 py-3 rounded-full font-semibold text-sm whitespace-nowrap transition-colors ${
                                selectedCategoryId === null
                                    ? "bg-[#FF8000] text-white shadow-lg shadow-[#FF8000]/20"
                                    : "bg-white text-gray-800 border border-gray-200 hover:bg-gray-50"
                            }`}
                        >
                            <span className="material-symbols-outlined !text-[18px] leading-none">apps</span>
                            Tout
                        </button>

                        {/* Chips dynamiques */}
                        {displayCategories.map((cat) => (
                            <button
                                key={cat.id}
                                onClick={() => setSelectedCategoryId(cat.id)}
                                className={`flex items-center gap-2 px-6 py-3 rounded-full font-semibold text-sm whitespace-nowrap transition-colors ${
                                    selectedCategoryId === cat.id
                                        ? "bg-[#FF8000] text-white shadow-lg shadow-[#FF8000]/20"
                                        : "bg-white text-gray-800 border border-gray-200 hover:bg-gray-50"
                                }`}
                            >
                                <span className="material-symbols-outlined !text-[18px] leading-none">
                                    {getCategoryIcon(cat.name)}
                                </span>
                                {cat.name}
                            </button>
                        ))}
                    </div>
                </nav>

                {/* T010-T015 — Product Grid */}
                <section
                    className="flex-1 overflow-y-auto px-8 pb-8"
                    style={{ scrollbarWidth: "none" }}
                >
                    {filteredProducts.length === 0 ? (
                        // T030 — État vide
                        <div className="flex flex-col items-center justify-center h-64 text-[#86868B]">
                            <span className="material-symbols-outlined !text-5xl mb-3">search_off</span>
                            <p className="font-semibold text-lg">
                                {searchTerm
                                    ? `Aucun résultat pour "${searchTerm}"`
                                    : "Aucun produit disponible"}
                            </p>
                        </div>
                    ) : (
                        <>
                            <h2 className="text-2xl font-bold text-gray-900 mb-6">Nos Produits</h2>
                            <div className="grid grid-cols-[repeat(auto-fill,243px)] gap-6 justify-center">
                                {filteredProducts.map((product) => {
                                    const variants   = product.variants || [];
                                    const totalStock = variants.reduce(
                                        (acc: number, v: any) => acc + (v.stockCount || 0), 0
                                    );
                                    const isOutOfStock = !product.isManualDelivery && totalStock === 0 && variants.length > 0;
                                    const minPrice     = variants.length > 0
                                        ? Math.min(...variants.map((v: any) => Number(v.salePriceDzd) || 0))
                                        : null;

                                    return (
                                        <div
                                            key={product.id}
                                            onClick={() => !isOutOfStock && setSelectedProduct(product)}
                                            className="w-[243px] bg-white rounded-[24px] overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col active:scale-[0.98] cursor-pointer group"
                                        >
                                            {/* Image fixe 243×228 */}
                                            <div className="w-[243px] h-[228px] bg-gray-100 flex items-center justify-center relative overflow-hidden">
                                                {product.imageUrl && (
                                                    <img
                                                        src={product.imageUrl}
                                                        alt={product.name}
                                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                    />
                                                )}
                                            </div>

                                            {/* Info */}
                                            <div className="px-4 py-3 flex flex-col gap-1">
                                                <h3 className="text-sm font-black text-black leading-tight uppercase tracking-tight truncate">{product.name}</h3>
                                                <div className="flex items-center justify-between mt-1">
                                                    {isOutOfStock || minPrice === null ? (
                                                        <div className="px-2 py-0.5 bg-rose-50 text-[8px] font-black text-rose-600 rounded-full border border-rose-100 uppercase tracking-wider">
                                                            Rupture
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div>
                                                                <p className="text-[10px] text-black/40 font-semibold uppercase tracking-wider">From</p>
                                                                <p className="text-[#FF8000] text-sm font-black leading-tight">
                                                                    {formatCurrency(minPrice, "DZD")}
                                                                </p>
                                                            </div>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setSelectedProduct(product); }}
                                                                className="bg-[#FF8000] hover:bg-[#E67300] text-white w-3 h-3 rounded-full shadow transition-colors flex items-center justify-center active:scale-95 shrink-0"
                                                            >
                                                                <span className="material-symbols-outlined !text-sm leading-none">add</span>
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </section>
            </main>

            {/* ══════════════════════════════════════════════════════════════
                SIDEBAR — "Ma Sélection" (desktop lg+) — T022-T028
            ══════════════════════════════════════════════════════════════ */}
            <aside className="hidden lg:flex flex-col w-[25%] min-w-[280px] max-w-[380px] bg-white border-l border-gray-200 shadow-2xl shrink-0">

                {/* T023 — Header */}
                <div className="p-8 border-b border-gray-100">
                    <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-bold text-gray-900">Ma Sélection</h2>
                        <span className="bg-[#FF8000]/10 text-[#FF8000] px-3 py-1 rounded-full text-sm font-bold">
                            {totalItems} {totalItems <= 1 ? "item" : "items"}
                        </span>
                    </div>
                </div>

                {/* T024-T025 — Liste items */}
                <div
                    className="flex-1 overflow-y-auto p-8 space-y-6"
                    style={{ scrollbarWidth: "none" }}
                >
                    {/* T027 — État vide */}
                    {cart.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-[#86868B] py-12">
                            <span className="material-symbols-outlined !text-5xl mb-3">shopping_bag</span>
                            <p className="font-semibold text-center text-sm">Votre panier est vide</p>
                            <p className="text-xs text-center mt-1">Ajoutez des produits depuis le catalogue</p>
                        </div>
                    ) : (
                        cart.map((item) => (
                            <div key={`${item.variantId}-${item.customData ?? ""}`} className="flex gap-4">
                                {/* Miniature */}
                                {item.imageUrl ? (
                                    <img
                                        src={item.imageUrl}
                                        alt={item.productName}
                                        className="w-20 h-20 rounded-2xl object-cover shrink-0"
                                    />
                                ) : (
                                    <div className="w-20 h-20 rounded-2xl bg-gray-100 flex items-center justify-center shrink-0">
                                        <span className="material-symbols-outlined text-gray-400">image</span>
                                    </div>
                                )}

                                {/* Info + quantité */}
                                <div className="flex-1 flex flex-col justify-between min-w-0">
                                    <div>
                                        <h4 className="font-semibold text-gray-900 line-clamp-1 text-sm">{item.productName}</h4>
                                        <p className="text-xs text-[#86868B]">{item.name}</p>
                                        <p className="text-[#FF8000] font-bold text-sm mt-0.5">
                                            {formatCurrency(Number(item.price), "DZD")}
                                        </p>
                                    </div>

                                    {/* T025 — Contrôles quantité */}
                                    <div className="flex items-center gap-3 mt-2">
                                        <button
                                            onClick={() =>
                                                item.quantity <= 1
                                                    ? removeFromCart(item.variantId, item.customData, item.playerNickname)
                                                    : updateQuantity(item.variantId, -1, item.customData, item.playerNickname)
                                            }
                                            className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#F5F5F7] text-gray-700 font-bold text-lg hover:bg-gray-200 transition-colors"
                                        >
                                            −
                                        </button>
                                        <span className="text-base font-bold text-gray-900 w-5 text-center">
                                            {item.quantity}
                                        </span>
                                        <button
                                            onClick={() => updateQuantity(item.variantId, 1, item.customData, item.playerNickname)}
                                            className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#F5F5F7] text-gray-700 font-bold text-lg hover:bg-gray-200 transition-colors"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* T026 — Total + Checkout */}
                <div className="p-8 bg-[#F5F5F7] border-t border-gray-100">
                    <div className="flex justify-between items-end mb-6">
                        <span className="text-[#86868B] font-medium text-lg">Total</span>
                        <span className="text-4xl font-bold text-gray-900">
                            {formatCurrency(totalAmount, "DZD")}
                        </span>
                    </div>
                    <button
                        onClick={() => setStep("CART")}
                        disabled={cart.length === 0}
                        className="w-full py-5 bg-[#FF8000] hover:bg-[#E67300] disabled:bg-gray-200 disabled:cursor-not-allowed text-white rounded-[24px] font-bold text-lg uppercase tracking-wider shadow-xl shadow-[#FF8000]/20 transition-all active:scale-[0.98]"
                    >
                        Terminer et Commander
                    </button>
                </div>
            </aside>

            {/* ══════════════════════════════════════════════════════════════
                MOBILE — FAB panier (lg:hidden)
            ══════════════════════════════════════════════════════════════ */}
            <div className="lg:hidden fixed bottom-28 right-6 z-40">
                <button
                    onClick={() => setStep("CART")}
                    className="w-16 h-16 bg-gray-900 rounded-full shadow-2xl flex items-center justify-center relative active:scale-90 transition-all duration-300"
                >
                    <span className="material-symbols-outlined text-white !text-3xl">shopping_bag</span>
                    {totalItems > 0 && (
                        <div className="absolute -top-1 -right-1 w-6 h-6 bg-[#FF8000] rounded-full border-2 border-white flex items-center justify-center text-[10px] font-black text-white">
                            {totalItems}
                        </div>
                    )}
                </button>
            </div>

            {/* ══════════════════════════════════════════════════════════════
                MOBILE — BottomNavBar (lg:hidden)
            ══════════════════════════════════════════════════════════════ */}
            <nav className="lg:hidden fixed bottom-0 left-0 w-full h-24 bg-white/90 backdrop-blur-2xl rounded-t-[32px] z-50 flex justify-around items-center px-4 border-t border-gray-100 shadow-[0px_-10px_40px_rgba(0,0,0,0.04)]">
                <div className="flex flex-col items-center justify-center bg-gradient-to-br from-[#924700] to-[#FF8000] text-white rounded-[20px] px-6 py-2">
                    <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>storefront</span>
                    <span className="font-semibold text-[11px] uppercase tracking-widest mt-1">Shop</span>
                </div>
                <button
                    onClick={() => setStep("CART")}
                    className="flex flex-col items-center justify-center text-gray-600 opacity-60 px-6 py-2 hover:opacity-100 transition-opacity active:scale-95"
                >
                    <span className="material-symbols-outlined">shopping_bag</span>
                    <span className="font-semibold text-[11px] uppercase tracking-widest mt-1">Cart</span>
                </button>
            </nav>

            {/* T016 — ProductModal conservé sans modification */}
            <ProductModal
                isOpen={!!selectedProduct}
                onClose={() => setSelectedProduct(null)}
                product={selectedProduct}
            />
        </div>
    );
}
