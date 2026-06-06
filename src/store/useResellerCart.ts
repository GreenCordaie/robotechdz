import { create } from "zustand";

/**
 * Reseller multi-product cart — G2Bulk (Cartes & Vouchers) only. The checkout
 * action refuses to mix suppliers in one order, so the cart is single-source
 * by construction (every item is a G2Bulk productId). Module-level store →
 * survives client navigation between brand pages.
 */
export interface ResellerCartItem {
    productId: number; // g2bulkProductId
    title: string;
    priceDzd: number;
    stock: number;
    quantity: number;
    brandLabel?: string;
    region?: string;
}

interface ResellerCartState {
    items: ResellerCartItem[];
    add: (item: Omit<ResellerCartItem, "quantity">, qty?: number) => void;
    setQty: (productId: number, qty: number) => void;
    remove: (productId: number) => void;
    clear: () => void;
}

const clampQty = (qty: number, stock: number) =>
    Math.max(1, Math.min(qty, Math.max(1, stock)));

export const useResellerCart = create<ResellerCartState>((set) => ({
    items: [],
    add: (item, qty = 1) =>
        set((s) => {
            const existing = s.items.find((i) => i.productId === item.productId);
            if (existing) {
                return {
                    items: s.items.map((i) =>
                        i.productId === item.productId
                            ? { ...i, quantity: clampQty(i.quantity + qty, item.stock) }
                            : i,
                    ),
                };
            }
            return { items: [...s.items, { ...item, quantity: clampQty(qty, item.stock) }] };
        }),
    setQty: (productId, qty) =>
        set((s) => ({
            items: s.items.map((i) =>
                i.productId === productId ? { ...i, quantity: clampQty(qty, i.stock) } : i,
            ),
        })),
    remove: (productId) =>
        set((s) => ({ items: s.items.filter((i) => i.productId !== productId) })),
    clear: () => set({ items: [] }),
}));
