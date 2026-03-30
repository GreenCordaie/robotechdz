import React, { useState, useEffect } from "react";
import {
    Input,
    Button,
    Card,
    CardBody,
    Spinner,
    Chip,
    ScrollShadow,
    Tabs,
    Tab
} from "@heroui/react";
import { Search, ShoppingCart, Info, LayoutGrid, List, Sparkles, Plus } from "lucide-react";
import { getPaginatedProducts, getCategoriesAction } from "@/app/admin/catalogue/actions";
import { formatCurrency } from "@/lib/formatters";
import { usePosStore } from "@/store/usePosStore";
import NextImage from "next/image";

export function CatalogueCaisse() {
    const [products, setProducts] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>("all");
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const addToCart = usePosStore((state) => state.addToCart);

    useEffect(() => {
        const loadCategories = async () => {
            const res = await getCategoriesAction({});
            if (Array.isArray(res)) {
                setCategories(res);
            }
        };
        loadCategories();
    }, []);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const res = await getPaginatedProducts({
                    page: 1,
                    limit: 100,
                    search: search,
                    categoryId: selectedCategory === "all" ? undefined : selectedCategory,
                    status: "ACTIVE"
                });
                if ('products' in res) {
                    setProducts(res.products);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        const timer = setTimeout(load, 300);
        return () => clearTimeout(timer);
    }, [search, selectedCategory]);

    return (
        <div className="flex flex-col h-full bg-background-dark/50 backdrop-blur-2xl rounded-3xl overflow-hidden border border-white/5 shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)]">
            {/* Search & Categories Header */}
            <div className="p-6 pb-0 space-y-6">
                <div className="relative group">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-[var(--primary)] transition-all duration-300" size={20} />
                    <input
                        type="text"
                        placeholder="Rechercher une carte ou un service..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-white/[0.03] hover:bg-white/[0.05] border border-white/10 rounded-2xl py-4 pl-14 pr-6 text-base font-medium focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)]/50 outline-none transition-all duration-300 placeholder:text-slate-600"
                    />
                </div>

                <ScrollShadow orientation="horizontal" className="flex gap-2 pb-6 scrollbar-hide" hideScrollBar>
                    <button
                        onClick={() => setSelectedCategory("all")}
                        className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-2 shrink-0 border ${selectedCategory === "all"
                            ? "bg-[var(--primary)] text-white border-[var(--primary)] shadow-[0_0_20px_-5px_var(--primary)]"
                            : "bg-white/5 text-slate-400 border-white/10 hover:bg-white/10 hover:text-white"
                            }`}
                    >
                        <LayoutGrid size={14} />
                        Tous
                    </button>
                    {categories.map((cat) => (
                        <button
                            key={cat.id}
                            onClick={() => setSelectedCategory(cat.id.toString())}
                            className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-2 shrink-0 border ${selectedCategory === cat.id.toString()
                                ? "bg-[var(--primary)] text-white border-[var(--primary)] shadow-[0_0_20px_-5px_var(--primary)]"
                                : "bg-white/5 text-slate-400 border-white/10 hover:bg-white/10 hover:text-white"
                                }`}
                        >
                            {cat.name}
                        </button>
                    ))}
                </ScrollShadow>
            </div>

            {/* Grid */}
            <ScrollShadow className="flex-1 px-6 pb-6" hideScrollBar>
                {loading ? (
                    <div className="h-full flex flex-col items-center justify-center gap-4">
                        <Spinner color="warning" size="lg" />
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--primary)] animate-pulse">Sync Catalogue...</p>
                    </div>
                ) : products.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-6 opacity-50 py-12">
                        <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center">
                            <span className="material-symbols-outlined !text-4xl text-slate-600">search_off</span>
                        </div>
                        <p className="font-black uppercase text-[10px] tracking-[0.3em]">Vide intersidéral</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5">
                        {products.map((p) => (
                            <Card
                                key={p.id}
                                isPressable
                                onPress={() => addToCart({
                                    id: p.variants[0]?.id || p.id,
                                    name: p.name,
                                    price: parseFloat(p.variants[0]?.salePriceDzd || "0"),
                                    quantity: 1
                                })}
                                className="group bg-background-dark/80 border border-white/5 hover:border-[var(--primary)]/50 transition-all duration-500 shadow-xl hover:shadow-[0_0_30px_-10px_rgba(236,91,19,0.2)] rounded-[2rem] overflow-hidden"
                            >
                                <CardBody className="p-0 relative aspect-[4/5]">
                                    {p.imageUrl ? (
                                        <NextImage
                                            src={p.imageUrl}
                                            alt={p.name}
                                            fill
                                            className="object-cover group-hover:scale-110 transition-transform duration-700"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/[0.02] to-white/[0.05]">
                                            <span className="material-symbols-outlined !text-5xl text-white/10 group-hover:text-[var(--primary)]/20 transition-colors duration-500">category</span>
                                        </div>
                                    )}

                                    {/* Glass Overlay on Hover */}
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 backdrop-blur-[2px] transition-all duration-500 flex items-center justify-center">
                                        <div className="w-14 h-14 rounded-full bg-[var(--primary)] text-white flex items-center justify-center shadow-2xl scale-0 group-hover:scale-100 transition-transform duration-500 delay-100">
                                            <Plus size={28} />
                                        </div>
                                    </div>

                                    {/* Price Badge */}
                                    <div className="absolute bottom-4 left-4 right-4 translate-y-2 group-hover:translate-y-0 transition-transform duration-500">
                                        <div className="bg-black/60 backdrop-blur-xl border border-white/10 p-3 rounded-2xl shadow-2xl">
                                            <div className="flex justify-between items-center gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-black text-[11px] uppercase tracking-wider text-white truncate">{p.name}</h4>
                                                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight mt-0.5">{p.variants[0]?.name || "Standard"}</p>
                                                </div>
                                                <p className="font-black text-xs text-[var(--primary)] whitespace-nowrap bg-[var(--primary)]/10 px-2 py-1 rounded-lg">
                                                    {formatCurrency(p.variants[0]?.salePriceDzd || 0, "DZD")}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Stock/Quick Tag (Optional visual) */}
                                    {p.isManualDelivery === false && (
                                        <div className="absolute top-4 left-4">
                                            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/20 backdrop-blur-md border border-emerald-500/30 rounded-full shadow-lg">
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">Instant</span>
                                            </div>
                                        </div>
                                    )}
                                </CardBody>
                            </Card>
                        ))}
                    </div>
                )}
            </ScrollShadow>
        </div>
    );
}
