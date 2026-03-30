"use client";

import React, { useState, useEffect } from "react";
import {
    Input,
    Card,
    CardBody,
    Button,
    Spinner,
    Badge,
    Divider,
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    useDisclosure
} from "@heroui/react";
import {
    Search,
    ShoppingBag,
    Zap,
    Tag,
    Filter,
    ShoppingCart,
    CreditCard,
    ChevronRight,
    Gamepad2,
    Tv,
    Plus,
    Trash2,
    Minus,
    Wallet
} from "lucide-react";
import { getPaginatedProducts } from "@/app/admin/catalogue/actions";
import { checkoutResellerAction, getCurrentResellerAction } from "../actions";
import { formatCurrency } from "@/lib/formatters";
import { toast } from "react-hot-toast";
import Image from "next/image";
import { useRouter } from "next/navigation";

export default function ResellerShop() {
    const [products, setProducts] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string>("all");
    const [cart, setCart] = useState<any[]>([]);
    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const { isOpen, onOpen, onOpenChange } = useDisclosure();
    const router = useRouter();

    const [reseller, setReseller] = useState<any>(null);

    useEffect(() => {
        const loadReseller = async () => {
            const res: any = await getCurrentResellerAction({});
            if (res.success) {
                setReseller(res.data);
            } else {
                toast.error("Session revendeur non trouvée");
            }
        };
        loadReseller();

        const loadProducts = async () => {
            setIsLoading(true);
            try {
                // Fetch first 50 products for now
                const res: any = await getPaginatedProducts({
                    page: 1,
                    limit: 48,
                    search: searchTerm,
                    type: selectedCategory === 'all' ? undefined : selectedCategory
                });
                if (res && res.success === false) {
                    toast.error("Erreur: " + res.error);
                    setProducts([]);
                } else {
                    setProducts(res.products || []);
                }
            } catch (error) {
                console.error("Failed to load products:", error);
            } finally {
                setIsLoading(false);
            }
        };
        loadProducts();
    }, [searchTerm, selectedCategory]);

    const addToCart = (product: any) => {
        setCart(prev => {
            const existing = prev.find(item => item.id === product.id);
            if (existing) {
                return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
            }
            toast.success(`${product.name} ajouté au panier`, {
                icon: '🛒',
                style: { background: '#161616', color: '#fff', border: '1px solid #262626' }
            });
            return [...prev, { ...product, quantity: 1 }];
        });
    };

    const removeFromCart = (productId: number) => {
        setCart(prev => prev.filter(item => item.id !== productId));
    };

    const updateQuantity = (productId: number, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.id === productId) {
                const newQty = Math.max(1, item.quantity + delta);
                return { ...item, quantity: newQty };
            }
            return item;
        }));
    };

    const partnerDiscount = parseFloat(reseller?.customDiscount || "5.00");

    const calculateItemPrice = (price: number) => {
        return price * (1 - partnerDiscount / 100);
    };

    const handleCheckout = async () => {
        if (cart.length === 0 || !reseller) return;
        setIsCheckingOut(true);
        try {
            // Apply discount to cart items for the checkout action
            const discountedCart = cart.map(item => ({
                ...item,
                price: calculateItemPrice(Number(item.price))
            }));

            const res: any = await checkoutResellerAction({
                resellerId: reseller.id,
                cart: discountedCart.map(i => ({ id: i.id, quantity: i.quantity }))
            });
            if (res.success) {
                toast.success(`Commande validée`, { duration: 5000 });
                setCart([]);
                onOpenChange();
                router.push("/reseller/orders");
            } else {
                toast.error(res.error || "Échec de la commande");
            }
        } catch (error) {
            toast.error("Erreur technique lors du paiement");
        } finally {
            setIsCheckingOut(false);
        }
    };

    const cartTotal = cart.reduce((acc, item) => acc + (calculateItemPrice(Number(item.price)) * item.quantity), 0);

    return (
        <div className="flex flex-col h-full space-y-8 animate-in fade-in duration-500">
            {/* Top Navigation / Filters */}
            <div className="sticky top-[-32px] z-20 bg-[#0a0a0a]/80 backdrop-blur-xl p-4 -mx-4 rounded-b-[32px] border-b border-[#262626] mb-4">
                <div className="flex flex-col md:flex-row gap-6 max-w-7xl mx-auto items-center">
                    <div className="relative flex-1 group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-[var(--primary)] transition-colors" size={20} />
                        <input
                            className="w-full bg-[#161616] border border-[#262626] rounded-2xl pl-12 pr-4 py-4 text-sm focus:ring-1 focus:ring-[var(--primary)]/50 outline-none text-slate-200 transition-all"
                            placeholder="Rechercher une carte, un jeu ou un abonnement..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="flex gap-2 bg-[#161616] p-1.5 rounded-2xl border border-[#262626]">
                        <button
                            onClick={() => setSelectedCategory("all")}
                            className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${selectedCategory === "all" ? "bg-[var(--primary)] text-white shadow-lg shadow-orange-950/20" : "text-slate-500 hover:text-white"}`}
                        >
                            Tout
                        </button>
                        <button
                            onClick={() => setSelectedCategory("CARTE")}
                            className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${selectedCategory === "CARTE" ? "bg-[var(--primary)] text-white shadow-lg shadow-orange-950/20" : "text-slate-500 hover:text-white"}`}
                        >
                            Cartes
                        </button>
                        <button
                            onClick={() => setSelectedCategory("ABONNEMENT")}
                            className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${selectedCategory === "ABONNEMENT" ? "bg-[var(--primary)] text-white shadow-lg shadow-orange-950/20" : "text-slate-500 hover:text-white"}`}
                        >
                            Abonnements
                        </button>
                    </div>

                    {cart.length > 0 && (
                        <Button
                            className="bg-emerald-500 text-white font-black px-8 h-14 rounded-2xl shadow-xl shadow-emerald-950/20 animate-in zoom-in duration-300"
                            endContent={<ChevronRight size={20} />}
                        >
                            Panier • {formatCurrency(cartTotal, 'DZD')}
                        </Button>
                    )}
                </div>
            </div>

            {/* Product Grid */}
            {isLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center py-40 gap-4">
                    <Spinner color="warning" size="lg" />
                    <p className="text-slate-500 font-bold uppercase tracking-[0.3em] animate-pulse">Initialisation du catalogue...</p>
                </div>
            ) : products.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-40 space-y-6 opacity-40">
                    <div className="size-32 rounded-[40px] bg-[#161616] border border-[#262626] flex items-center justify-center">
                        <Search size={48} className="text-slate-500" />
                    </div>
                    <p className="text-xl font-bold text-slate-500 italic">Aucun produit ne correspond à votre recherche</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 max-w-7xl mx-auto pb-20">
                    {products.map((product) => (
                        <Card
                            key={product.id}
                            isPressable
                            onClick={() => addToCart(product)}
                            className="bg-[#161616] border border-[#262626] hover:border-[var(--primary)]/40 transition-all group overflow-visible rounded-[24px]"
                        >
                            <CardBody className="p-0">
                                <div className="aspect-[4/3] w-full bg-[#0a0a0a] rounded-t-[23px] relative overflow-hidden flex items-center justify-center">
                                    {product.imageUrl ? (
                                        <Image
                                            src={product.imageUrl}
                                            alt={product.name}
                                            fill
                                            sizes="(max-width: 768px) 100vw, 300px"
                                            className="object-cover group-hover:scale-110 transition-transform duration-700 opacity-80"
                                        />
                                    ) : (
                                        <div className="flex flex-col items-center gap-3 opacity-20 group-hover:opacity-40 transition-opacity">
                                            {product.type === 'CARTE' ? <Gamepad2 size={40} /> : <Tv size={40} />}
                                            <span className="text-[10px] font-black uppercase tracking-widest">{product.type}</span>
                                        </div>
                                    )}

                                    {/* Action Overlays */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] to-transparent opacity-60"></div>

                                    <div className="absolute top-3 left-3 flex gap-2">
                                        {product.category?.name && (
                                            <span className="px-2 py-1 rounded-md bg-black/60 backdrop-blur-md text-[9px] font-bold text-white uppercase border border-white/10">
                                                {product.category.name}
                                            </span>
                                        )}
                                        {product.isSharing && (
                                            <span className="px-2 py-1 rounded-md bg-purple-500/20 backdrop-blur-md text-[9px] font-bold text-purple-400 uppercase border border-purple-500/30 flex items-center gap-1">
                                                <Zap size={10} />
                                                Shared
                                            </span>
                                        )}
                                    </div>

                                    <div className="absolute bottom-3 right-3 text-white">
                                        <div className="size-10 rounded-xl bg-[var(--primary)] flex items-center justify-center shadow-lg shadow-orange-950/40 opacity-0 group-hover:opacity-100 translate-y-4 group-hover:translate-y-0 transition-all duration-300">
                                            <Plus size={24} strokeWidth={3} />
                                        </div>
                                    </div>
                                </div>

                                <div className="p-5 space-y-3">
                                    <div className="min-h-[40px]">
                                        <h4 className="font-bold text-white text-sm line-clamp-2 leading-snug group-hover:text-[var(--primary)] transition-colors">{product.name}</h4>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <div className="flex flex-col">
                                            <span className="text-xs text-slate-500 font-bold decoration-red-500/50 line-through opacity-50">
                                                {formatCurrency(Number(product.price), 'DZD')}
                                            </span>
                                            <span className="text-lg font-black text-white leading-tight">
                                                {formatCurrency(calculateItemPrice(Number(product.price)), 'DZD')}
                                            </span>
                                        </div>
                                        <div className="bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase px-2 py-1 rounded-lg border border-emerald-500/20">
                                            -{partnerDiscount}%
                                        </div>
                                    </div>
                                </div>
                            </CardBody>
                        </Card>
                    ))}
                </div>
            )}

            {/* Checkout Modal */}
            <Modal
                isOpen={isOpen}
                onOpenChange={onOpenChange}
                size="2xl"
                classNames={{
                    base: "bg-[#0f0d0c] border border-[#2d2622] rounded-[32px]",
                    header: "border-b border-[#2d2622] p-8",
                    body: "p-8",
                    footer: "border-t border-[#2d2622] p-8"
                }}
            >
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader className="flex flex-col gap-1">
                                <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
                                    <ShoppingCart className="text-[var(--primary)]" />
                                    Récapitulatif de Commande
                                </h2>
                                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Paiement via Wallet Partenaire</p>
                            </ModalHeader>
                            <ModalBody>
                                <div className="space-y-6 max-h-[40vh] overflow-y-auto custom-scrollbar pr-2">
                                    {cart.map((item) => (
                                        <div key={item.id} className="flex items-center justify-between bg-[#161616] p-4 rounded-2xl border border-[#262626] group">
                                            <div className="flex items-center gap-4">
                                                <div className="size-12 rounded-xl bg-[#0a0a0a] flex items-center justify-center border border-white/5 relative overflow-hidden">
                                                    {item.imageUrl ? (
                                                        <Image src={item.imageUrl} alt={item.name} fill sizes="100px" className="object-cover opacity-60" />
                                                    ) : (
                                                        <Gamepad2 className="text-slate-700" size={24} />
                                                    )}
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-white text-sm line-clamp-1">{item.name}</h4>
                                                    <p className="text-xs text-[var(--primary)] font-black">{formatCurrency(item.price, 'DZD')} <span className="text-slate-500 font-medium">/ unité</span></p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-6">
                                                <div className="flex items-center gap-3 bg-[#0a0a0a] rounded-xl border border-[#262626] p-1">
                                                    <button
                                                        onClick={() => updateQuantity(item.id, -1)}
                                                        className="size-8 rounded-lg flex items-center justify-center hover:bg-white/5 text-slate-400 transition-colors"
                                                    >
                                                        <Minus size={14} />
                                                    </button>
                                                    <span className="text-sm font-black w-4 text-center">{item.quantity}</span>
                                                    <button
                                                        onClick={() => updateQuantity(item.id, 1)}
                                                        className="size-8 rounded-lg flex items-center justify-center hover:bg-white/5 text-slate-400 transition-colors"
                                                    >
                                                        <Plus size={14} />
                                                    </button>
                                                </div>
                                                <button
                                                    onClick={() => removeFromCart(item.id)}
                                                    className="p-2 text-slate-600 hover:text-red-500 transition-colors"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-8 p-6 rounded-2xl bg-orange-500/5 border border-orange-500/10 space-y-4">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-slate-400 font-bold uppercase tracking-wider">Sous-total</span>
                                        <span className="text-white font-black">{formatCurrency(cartTotal / (1 - partnerDiscount / 100), 'DZD')}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-slate-400 font-bold uppercase tracking-wider">Remise Partenaire</span>
                                        <span className="text-emerald-500 font-black">-{partnerDiscount}% (Inclus)</span>
                                    </div>
                                    <Divider className="bg-[#2d2622]" />
                                    <div className="flex justify-between items-center">
                                        <span className="text-lg font-black text-white">Total à Débiter</span>
                                        <span className="text-3xl font-black text-[var(--primary)]">{formatCurrency(cartTotal, 'DZD')}</span>
                                    </div>
                                </div>
                            </ModalBody>
                            <ModalFooter>
                                <Button
                                    variant="light"
                                    onPress={onClose}
                                    className="font-bold text-slate-400"
                                >
                                    Continuer mes achats
                                </Button>
                                <Button
                                    onClick={handleCheckout}
                                    disabled={isCheckingOut}
                                    className="bg-[var(--primary)] text-white font-black px-10 h-14 rounded-2xl shadow-xl shadow-orange-950/40"
                                    endContent={!isCheckingOut && <CreditCard size={20} />}
                                >
                                    {isCheckingOut ? <Spinner size="sm" color="white" /> : "Confirmer & Payer"}
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>
        </div>
    );
}
