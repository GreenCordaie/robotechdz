"use client";

import React, { useState, useEffect } from "react";
import {
    Input,
    Button,
    Card,
    CardBody,
    Spinner,
    Chip,
    ScrollShadow
} from "@heroui/react";
import { Search, ShoppingCart, Info, LayoutGrid, List } from "lucide-react";
import { getPaginatedProducts } from "@/app/admin/catalogue/actions";
import { formatCurrency } from "@/lib/formatters";
import { usePosStore } from "@/store/usePosStore";
import NextImage from "next/image";

export function CatalogueCaisse() {
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const addToCart = usePosStore((state) => state.addToCart);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const res = await getPaginatedProducts({
                    page: 1,
                    limit: 100,
                    search: search,
                    status: "ACTIVE"
                });
                setProducts(res.products);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        const timer = setTimeout(load, 300);
        return () => clearTimeout(timer);
    }, [search]);

    return (
        <div className="flex flex-col h-full bg-[#0a0a0a] rounded-2xl overflow-hidden border border-white/5 shadow-2xl">
            {/* Search Header */}
            <div className="p-6 border-b border-white/5 bg-black/20 backdrop-blur-md sticky top-0 z-10">
                <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-[#ec5b13] transition-colors" size={18} />
                    <input
                        type="text"
                        placeholder="Rechercher un produit..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm focus:ring-2 focus:ring-[#ec5b13]/50 focus:border-[#ec5b13] outline-none transition-all placeholder:text-slate-600"
                    />
                </div>
            </div>

            {/* Grid */}
            <ScrollShadow className="flex-1 p-6" hideScrollBar>
                {loading ? (
                    <div className="h-full flex items-center justify-center">
                        <Spinner color="warning" size="lg" label="Chargement du catalogue..." className="text-[#ec5b13]" />
                    </div>
                ) : products.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-4 opacity-50">
                        <span className="material-symbols-outlined !text-6xl">inventory_2</span>
                        <p className="font-bold uppercase text-xs tracking-widest">Aucun produit trouvé</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
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
                                className="group bg-[#111111] border border-white/5 hover:border-[#ec5b13]/50 transition-all duration-300"
                            >
                                <CardBody className="p-0 relative overflow-hidden aspect-square">
                                    {p.imageUrl ? (
                                        <NextImage
                                            src={p.imageUrl}
                                            alt={p.name}
                                            fill
                                            className="object-cover group-hover:scale-110 transition-transform duration-500"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-white/5">
                                            <span className="material-symbols-outlined !text-4xl text-slate-700">image</span>
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent p-4 flex flex-col justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div className="bg-[#ec5b13] text-white p-2 rounded-xl flex items-center justify-center shadow-lg transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                                            <ShoppingCart size={18} />
                                        </div>
                                    </div>
                                    <div className="absolute top-3 right-3">
                                        <Chip
                                            size="sm"
                                            className="bg-black/60 backdrop-blur-md border border-white/10 text-white font-black text-[10px]"
                                        >
                                            {formatCurrency(p.variants[0]?.salePriceDzd || 0, "DZD")}
                                        </Chip>
                                    </div>
                                </CardBody>
                                <div className="p-4 bg-gradient-to-b from-[#111111] to-black">
                                    <h4 className="font-bold text-xs uppercase truncate text-slate-300 group-hover:text-white transition-colors">{p.name}</h4>
                                    <p className="text-[10px] text-slate-500 mt-1 line-clamp-1">{p.variants[0]?.name || "Standard"}</p>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </ScrollShadow>
        </div>
    );
}
