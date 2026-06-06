import { create } from "zustand";

/**
 * Universal reseller cart. Items can come from several families. The checkout
 * action refuses to MIX suppliers in one order, so at pay time the cart fans
 * out into one order per family:
 *   - g2bulk     → checkoutResellerAction({ g2bulkProductId })  (Cartes & Vouchers)
 *   - streaming  → checkoutResellerAction({ id: variantId })    (comptes partagés)
 *   - activecode → purchaseActiveCodeAction({ planId }) per unit (instant codes)
 * Module-level store → survives navigation between pages.
 */
export type CartSource = "g2bulk" | "streaming" | "activecode";

export interface ResellerCartItem {
    source: CartSource;
    refId: number | string; // g2bulkProductId | variantId | activeCodePlanId(string)
    title: string;
    priceDzd: number;
    stock: number; // instant families use a high sentinel
    quantity: number;
    brandLabel?: string;
    region?: string;
}

interface ResellerCartState {
    items: ResellerCartItem[];
    add: (item: Omit<ResellerCartItem, "quantity">, qty?: number) => void;
    setQty: (key: string, qty: number) => void;
    remove: (key: string) => void;
    clear: () => void;
}

export const cartKey = (i: { source: CartSource; refId: number | string }) =>
    `${i.source}:${i.refId}`;

const clampQty = (qty: number, stock: number) =>
    Math.max(1, Math.min(qty, Math.max(1, stock)));

export const useResellerCart = create<ResellerCartState>((set) => ({
    items: [],
    add: (item, qty = 1) =>
        set((s) => {
            const k = cartKey(item);
            const existing = s.items.find((i) => cartKey(i) === k);
            if (existing) {
                return {
                    items: s.items.map((i) =>
                        cartKey(i) === k
                            ? { ...i, quantity: clampQty(i.quantity + qty, item.stock) }
                            : i,
                    ),
                };
            }
            return { items: [...s.items, { ...item, quantity: clampQty(qty, item.stock) }] };
        }),
    setQty: (key, qty) =>
        set((s) => ({
            items: s.items.map((i) =>
                cartKey(i) === key ? { ...i, quantity: clampQty(qty, i.stock) } : i,
            ),
        })),
    remove: (key) => set((s) => ({ items: s.items.filter((i) => cartKey(i) !== key) })),
    clear: () => set({ items: [] }),
}));
