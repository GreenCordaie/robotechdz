"use client";

import React, { useState, useEffect } from "react";
import { useKioskStore } from "@/store/useKioskStore";
import { formatCurrency } from "@/lib/formatters";
import ProductModal from "./components/ProductModal";
import { createKioskOrder } from "./actions";
import Image from "next/image";
import { toast } from "react-hot-toast";
import DeliveryMethodModal from "./components/DeliveryMethodModal";

// --- Types ---
interface Variant {
    id: string;
    productId: string;
    name: string;
    salePriceDzd: number;
    stockCount: number;
    isSharing?: boolean;
}

interface Product {
    id: string;
    name: string;
    imageUrl?: string;
    description?: string;
    categoryId: string;
    categoryName?: string;
    requiresPlayerId?: boolean;
    isManualDelivery?: boolean;
    variants: Variant[];
}

// --- Main Component ---
export default function KioskMobile({ products: initialProducts, categories: initialCategories }: { products: any[], categories: any[] }) {
    const { step, setStep, cart, setLastOrderNumber, lastOrderNumber, clearCart } = useKioskStore();
    const [selectedCategory, setSelectedCategory] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Helper to open product modal
    const openProductModal = (product: Product) => {
        setSelectedProduct(product);
        setIsProductModalOpen(true);
    };

    const handleConfirmOrder = async (method: "TICKET" | "WHATSAPP", phone?: string) => {
        setIsSubmitting(true);
        try {
            const total = cart.reduce((acc, item) => acc + (Number(item.price) * item.quantity), 0);
            const formattedItems = cart.map(i => ({
                variantId: i.variantId,
                name: i.name,
                price: i.price,
                quantity: i.quantity,
                customData: i.customData,
                playerNickname: i.playerNickname
            }));

            const order = await createKioskOrder(formattedItems, total.toFixed(2), method, phone);
            setLastOrderNumber(order.orderNumber);
            toast.success("Commande envoyée !");
            clearCart();
            setIsDeliveryModalOpen(false);
            setStep("CONFIRMATION");
        } catch (error: any) {
            toast.error(error.message || "Erreur lors de la commande");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col h-screen bg-[#F8F9FA] font-['Plus_Jakarta_Sans'] overflow-hidden">
            {/* Dynamic View Content */}
            <div className="flex-1 overflow-y-auto pb-10 scroll-smooth">
                {step === "IDLE" ? (
                    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-100px)] p-8 animate-in fade-in zoom-in duration-700" onClick={() => setStep("CATALOGUE")}>
                        <div className="relative group cursor-pointer transition-transform duration-500 hover:scale-105 active:scale-95">
                            <div className="absolute -inset-4 bg-primary/20 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                            <div className="relative w-56 h-56 mb-12 drop-shadow-2xl">
                                <Image src="/logo.png" alt="Robotech" fill className="object-contain" priority />
                            </div>
                        </div>

                        <div className="text-center space-y-6 max-w-xs">
                            <div className="space-y-2">
                                <h1 className="text-4xl font-extrabold text-[#0c121e] tracking-tighter leading-none">
                                    ROBOTECH<span className="text-primary">.</span>
                                </h1>
                                <p className="text-slate-400 font-medium text-sm tracking-wide uppercase">
                                    VOTRE UNIVERS DIGITAL
                                </p>
                            </div>

                            <div className="relative inline-flex group">
                                <div className="absolute transition-all duration-1000 opacity-70 -inset-px bg-gradient-to-r from-primary via-[#ff8c42] to-primary rounded-full blur-lg group-hover:opacity-100 group-hover:-inset-1 group-hover:duration-200"></div>
                                <button className="relative inline-flex items-center justify-center px-12 py-4 text-base font-bold text-white transition-all duration-200 bg-primary font-pj rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 gap-3">
                                    <span>Toucher pour commencer</span>
                                    <span className="material-symbols-outlined fill-1">arrow_forward</span>
                                </button>
                            </div>
                        </div>
                    </div>
                ) : step === "CATALOGUE" ? (
                    <CatalogueView
                        products={initialProducts}
                        categories={initialCategories}
                        selectedCategory={selectedCategory}
                        setSelectedCategory={setSelectedCategory}
                        searchQuery={searchQuery}
                        setSearchQuery={setSearchQuery}
                        onProductClick={openProductModal}
                    />
                ) : step === "CART" ? (
                    <MobileCartView onValidate={() => setIsDeliveryModalOpen(true)} />
                ) : (
                    <SuccessView lastOrderNumber={lastOrderNumber || ""} onReset={() => {
                        setLastOrderNumber("");
                        setStep("IDLE");
                    }} />
                )}
            </div>

            {/* Floating Cart Button (Visible in Catalogue) */}
            {(step === "IDLE" || step === "CATALOGUE") && cart.length > 0 && (
                <button
                    onClick={() => setStep("CART")}
                    className="fixed bottom-10 right-6 bg-primary text-white size-16 rounded-full shadow-2xl shadow-primary/30 flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-40 group"
                >
                    <div className="absolute -top-1 -right-1 size-7 bg-white text-primary rounded-full flex items-center justify-center text-xs font-black shadow-lg border-2 border-primary">
                        {cart.length}
                    </div>
                    <span className="material-symbols-outlined !text-3xl">shopping_basket</span>
                </button>
            )}

            {/* Delivery Method Modal */}
            <DeliveryMethodModal
                isOpen={isDeliveryModalOpen}
                onClose={() => setIsDeliveryModalOpen(false)}
                onConfirm={handleConfirmOrder}
                isSubmitting={isSubmitting}
            />

            {/* Product Selection Modal */}
            {selectedProduct && (
                <ProductModal
                    isOpen={isProductModalOpen}
                    onClose={() => setIsProductModalOpen(false)}
                    product={selectedProduct}
                />
            )}
        </div>
    );
}

// --- Sub-components ---

function NavButton({ icon, label, active = false, onClick }: { icon: string; label: string; active?: boolean; onClick: () => void }) {
    return (
        <button onClick={onClick} className={`flex flex-col items-center gap-1 transition-all duration-300 ${active ? 'text-primary scale-110' : 'text-slate-400 opacity-60'}`}>
            <span className={`material-symbols-outlined ${active ? 'fill-1' : ''} !text-2xl`}>{icon}</span>
            <span className={`text-[10px] font-bold tracking-tight ${active ? 'opacity-100' : 'opacity-0 scale-50'} transition-all`}>{label}</span>
        </button>
    );
}

interface CatalogueViewProps {
    products: any[];
    categories: any[];
    selectedCategory: string;
    setSelectedCategory: (id: string) => void;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    onProductClick: (product: Product) => void;
}

function CatalogueView({ products, categories, selectedCategory, setSelectedCategory, searchQuery, setSearchQuery, onProductClick }: CatalogueViewProps) {

    const filteredProducts = products.filter(p => {
        const matchesCategory = selectedCategory === "all" || p.categoryId === selectedCategory;
        const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    return (
        <div className="p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header & Search */}
            <header className="mb-8 space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-black text-[#0c121e] tracking-tight text-shadow">Bonjour 👋</h1>
                        <p className="text-slate-400 text-sm font-medium">Explorez nos services digitaux</p>
                    </div>
                    <div className="size-12 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center">
                        <span className="material-symbols-outlined text-primary">notifications</span>
                    </div>
                </div>

                <div className="relative group">
                    <div className="absolute inset-0 bg-primary/5 rounded-3xl blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity"></div>
                    <div className="relative flex items-center bg-white border border-slate-100 rounded-3xl px-5 py-4 shadow-sm group-focus-within:border-primary group-focus-within:ring-4 group-focus-within:ring-primary/5 transition-all">
                        <span className="material-symbols-outlined text-slate-300 mr-3">search</span>
                        <input
                            type="text"
                            placeholder="Rechercher une carte, un jeu..."
                            className="bg-transparent border-none p-0 w-full text-sm font-semibold placeholder:text-slate-300 focus:ring-0 outline-none"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
            </header>

            {/* Categories Scroll Horizontal */}
            <div className="flex overflow-x-auto gap-2 pb-4 no-scrollbar -mx-4 px-4 sticky top-0 bg-[#F4F7FE] z-10 pt-2">
                <button
                    onClick={() => setSelectedCategory("all")}
                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all border whitespace-nowrap shrink-0 ${selectedCategory === "all"
                        ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20 scale-105'
                        : 'bg-white border-slate-100 text-slate-400'
                        }`}
                >
                    Tous
                </button>
                {categories.map((category: any) => (
                    <button
                        key={category.id}
                        onClick={() => setSelectedCategory(category.id)}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all border whitespace-nowrap shrink-0 ${selectedCategory === category.id
                            ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20 scale-105'
                            : 'bg-white border-slate-100 text-slate-400'
                            }`}
                    >
                        {category.name}
                    </button>
                ))}
            </div>

            {/* Product Grid */}
            <section className="mb-10">
                <div className="flex items-center justify-between mb-5">
                    <h2 className="text-lg font-black text-[#0c121e]">Populaires</h2>
                    <span className="text-slate-400 text-xs font-semibold">{filteredProducts.length} produits</span>
                </div>

                <div className="flex flex-col gap-4">
                    {filteredProducts.map((product: any) => {
                        const minPrice = product.variants && product.variants.length > 0
                            ? Math.min(...product.variants.map((v: any) => v.salePriceDzd))
                            : 0;

                        return (
                            <div
                                key={product.id}
                                className="bg-white rounded-[24px] p-3 shadow-sm border border-slate-50 active:scale-[0.98] transition-all group flex items-center gap-4"
                                onClick={() => onProductClick(product)}
                            >
                                {/* Image à gauche */}
                                <div className="w-24 h-24 bg-[#F8F9FA] rounded-2xl flex items-center justify-center overflow-hidden relative shrink-0">
                                    {product.imageUrl ? (
                                        <Image
                                            src={product.imageUrl}
                                            alt={product.name}
                                            fill
                                            className="object-cover group-hover:scale-110 transition-transform duration-500"
                                        />
                                    ) : (
                                        <span className="material-symbols-outlined text-slate-200 !text-3xl">image_not_supported</span>
                                    )}
                                    {product.isManualDelivery && (
                                        <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-blue-500/80 backdrop-blur-md rounded-md text-[7px] font-black uppercase text-white tracking-tighter">
                                            Manuel
                                        </div>
                                    )}
                                </div>

                                {/* Contenu à droite */}
                                <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
                                    <div>
                                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest leading-none mb-1">
                                            {product.categoryName || "Général"}
                                        </p>
                                        <h4 className="text-base font-black text-[#0c121e] leading-tight line-clamp-1">{product.name}</h4>
                                    </div>

                                    <div className="flex items-center justify-between mt-2">
                                        <div className="flex flex-col">
                                            <span className="text-primary font-black text-lg tracking-tight leading-none">{formatCurrency(minPrice, 'DZD')}</span>
                                            {product.variants && product.variants.length > 1 && (
                                                <span className="text-[10px] text-slate-400 font-bold uppercase mt-1">Multi-variantes</span>
                                            )}
                                        </div>
                                        <div className="size-10 bg-primary rounded-xl flex items-center justify-center text-white shadow-lg shadow-primary/20">
                                            <span className="material-symbols-outlined">add_shopping_cart</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {filteredProducts.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                        <div className="size-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-200">
                            <span className="material-symbols-outlined !text-4xl">search_off</span>
                        </div>
                        <p className="text-slate-400 font-bold">Aucun produit trouvé pour "{searchQuery}"</p>
                    </div>
                )}
            </section>
        </div>
    );
}

function CategoryCard({ label, active, onClick, icon }: any) {
    return (
        <button
            onClick={onClick}
            className={`flex flex-col items-center gap-3 min-w-[90px] p-4 rounded-[28px] transition-all duration-300 ${active
                ? 'bg-primary text-white shadow-xl shadow-primary/20 scale-105'
                : 'bg-white border border-slate-50 shadow-sm hover:border-primary/20'
                }`}
        >
            <div className={`size-12 rounded-2xl flex items-center justify-center transition-colors ${active ? 'bg-white/20' : 'bg-slate-50 text-slate-400'}`}>
                <span className={`material-symbols-outlined !text-2xl ${active ? 'fill-1' : ''}`}>{icon}</span>
            </div>
            <span className={`text-[10px] font-black uppercase tracking-tight ${active ? 'text-white' : 'text-slate-600'}`}>
                {label}
            </span>
        </button>
    );
}

function MobileCartView({ onValidate }: { onValidate: () => void }) {
    const { cart, updateQuantity, removeFromCart, setStep } = useKioskStore();

    const total = cart.reduce((acc, item) => acc + (Number(item.price) * item.quantity), 0);

    if (cart.length === 0) {
        return (
            <div className="p-8 flex flex-col items-center justify-center min-h-[calc(100vh-200px)] text-center animate-in fade-in zoom-in duration-500">
                <div className="relative mb-8">
                    <div className="absolute -inset-4 bg-primary/10 rounded-full blur-2xl"></div>
                    <div className="relative size-32 bg-white rounded-[40px] shadow-xl flex items-center justify-center">
                        <span className="material-symbols-outlined !text-6xl text-slate-200">shopping_basket</span>
                    </div>
                    <div className="absolute bottom-2 right-2 size-8 bg-primary rounded-full flex items-center justify-center text-white border-4 border-white">
                        <span className="material-symbols-outlined !text-sm font-black text-white">close</span>
                    </div>
                </div>
                <h2 className="text-2xl font-black mb-3">Panier vide</h2>
                <p className="text-slate-400 font-medium text-sm mb-10 max-w-[200px]">On dirait que vous n'avez pas encore trouvé votre bonheur.</p>
                <button
                    onClick={() => setStep("CATALOGUE")}
                    className="bg-[#0c121e] text-white px-10 py-5 rounded-3xl font-black uppercase tracking-widest shadow-xl shadow-slate-900/10 active:scale-95 transition-all"
                >
                    Commencer mes achats
                </button>
            </div>
        );
    }

    return (
        <div className="p-6 animate-in slide-in-from-right duration-500">
            <div className="flex items-center justify-between mb-8">
                <button onClick={() => setStep("CATALOGUE")} className="size-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-slate-100 active:scale-90 transition-transform">
                    <span className="material-symbols-outlined">arrow_back</span>
                </button>
                <div className="text-center">
                    <h1 className="text-xl font-black text-[#0c121e]">Mon Panier</h1>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{cart.length} articles</p>
                </div>
                <button disabled className="size-12 bg-red-50 rounded-2xl flex items-center justify-center shadow-sm border border-red-100 text-red-500 opacity-0 pointer-events-none">
                    <span className="material-symbols-outlined">delete_sweep</span>
                </button>
            </div>

            <div className="space-y-4 mb-8">
                {cart.map((item) => (
                    <div key={`${item.variantId}-${item.customData}`} className="bg-white rounded-[32px] p-5 shadow-sm border border-slate-50 flex gap-5 group relative overflow-hidden">
                        <div className="size-24 bg-slate-50 rounded-[24px] flex-shrink-0 flex items-center justify-center overflow-hidden relative">
                            {item.imageUrl ? (
                                <Image src={item.imageUrl} alt={item.productName} fill className="object-cover transition-transform group-hover:scale-110" />
                            ) : (
                                <span className="material-symbols-outlined text-slate-200 !text-3xl">inventory_2</span>
                            )}
                        </div>
                        <div className="flex-1 flex flex-col justify-between py-1">
                            <div className="space-y-1">
                                <div className="flex justify-between items-start">
                                    <h4 className="font-black text-sm text-[#0c121e] leading-tight pr-8">{item.productName}</h4>
                                    <button
                                        onClick={() => removeFromCart(item.variantId, item.customData)}
                                        className="absolute top-4 right-4 text-slate-200 hover:text-red-500 transition-colors p-1"
                                    >
                                        <span className="material-symbols-outlined !text-[22px]">close</span>
                                    </button>
                                </div>
                                <p className="text-primary text-[10px] font-black uppercase tracking-widest">{item.name}</p>
                            </div>

                            <div className="flex items-center justify-between mt-4">
                                <div className="flex items-center gap-1 bg-slate-50 rounded-2xl p-1">
                                    <button onClick={() => updateQuantity(item.variantId, -1, item.customData)} className="size-8 rounded-xl flex items-center justify-center font-black text-slate-400 active:bg-white active:shadow-sm transition-all"><span className="material-symbols-outlined !text-sm">remove</span></button>
                                    <span className="w-8 text-center font-black text-sm">{item.quantity}</span>
                                    <button onClick={() => updateQuantity(item.variantId, 1, item.customData)} className="size-8 rounded-xl flex items-center justify-center font-black text-slate-400 active:bg-white active:shadow-sm transition-all"><span className="material-symbols-outlined !text-sm">add</span></button>
                                </div>
                                <span className="font-black text-[#0c121e] text-base">{formatCurrency(Number(item.price) * item.quantity, 'DZD')}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Checkout Summary */}
            <div className="fixed bottom-10 left-6 right-6 p-6 bg-[#0c121e] rounded-[40px] text-white shadow-2xl shadow-slate-900/40 space-y-6">
                <div className="space-y-3">
                    <div className="flex justify-between items-center px-2">
                        <span className="text-white/40 text-xs font-bold uppercase tracking-widest">Sous-total</span>
                        <span className="font-black text-sm tracking-tight">{formatCurrency(total, 'DZD')}</span>
                    </div>
                    <div className="h-px bg-white/10 mx-2"></div>
                    <div className="flex justify-between items-center px-2">
                        <span className="text-lg font-black tracking-tight text-white/60">Total</span>
                        <span className="text-2xl font-black text-primary font-['Plus_Jakarta_Sans'] tracking-tighter text-white">{formatCurrency(total, 'DZD')}</span>
                    </div>
                </div>

                <button
                    onClick={onValidate}
                    className="w-full bg-primary text-white py-5 rounded-[26px] font-black uppercase tracking-widest shadow-xl shadow-primary/20 active:scale-95 transition-all text-sm flex items-center justify-center gap-3"
                >
                    <span>Valider la commande</span>
                    <span className="material-symbols-outlined !text-lg">navigate_next</span>
                </button>
            </div>
        </div>
    );
}

function SuccessView({ lastOrderNumber, onReset }: { lastOrderNumber: string, onReset: () => void }) {
    return (
        <div className="p-8 flex flex-col items-center justify-center min-h-screen text-center animate-in fade-in zoom-in duration-700 bg-white">
            <div className="relative mb-10">
                <div className="absolute -inset-10 bg-emerald-100/50 rounded-full blur-3xl animate-pulse"></div>
                <div className="relative size-32 bg-emerald-500 rounded-[48px] flex items-center justify-center text-white shadow-2xl shadow-emerald-500/20">
                    <span className="material-symbols-outlined !text-7xl fill-1">check_circle</span>
                </div>
            </div>

            <div className="space-y-4 max-w-xs mb-12">
                <h2 className="text-3xl font-black text-[#0c121e] uppercase tracking-tighter leading-tight">Commande<br />Réussie !</h2>
                <p className="text-slate-400 font-medium text-sm">Votre commande a été transmise avec succès à l'équipe ROBOTECH.</p>
            </div>

            <div className="w-full max-w-xs bg-slate-50 border-2 border-dashed border-slate-200 rounded-[32px] p-8 mb-12 space-y-3 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-primary/10"></div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Numéro de commande</p>
                <p className="text-5xl font-black text-[#0c121e] tracking-[0.3em] font-mono">{lastOrderNumber}</p>
            </div>

            <div className="space-y-4 w-full max-w-xs">
                <div className="flex gap-2 p-4 bg-indigo-50 rounded-2xl text-left border border-indigo-100/50">
                    <span className="material-symbols-outlined text-indigo-500 mt-0.5">info</span>
                    <p className="text-indigo-900/70 text-xs font-semibold leading-relaxed">Présentez ce numéro au comptoir pour finaliser le paiement.</p>
                </div>

                <button
                    onClick={onReset}
                    className="w-full bg-[#0c121e] text-white py-5 rounded-[26px] font-black uppercase tracking-widest active:scale-95 transition-all shadow-xl shadow-slate-900/10"
                >
                    Retour à l'accueil
                </button>
            </div>
        </div>
    );
}
