import { create } from "zustand";

export type KioskStep = "IDLE" | "CATALOGUE" | "CART" | "CONFIRMATION";

interface CartItem {
    variantId: number;
    productId: number;
    name: string;
    productName: string;
    price: string;
    quantity: number;
    imageUrl?: string;
    customData?: string;
    playerNickname?: string;
}

interface KioskState {
    step: KioskStep;
    cart: CartItem[];
    lastOrderNumber: string | null;
    selectedProductId: number | null;
    // Actions
    setStep: (step: KioskStep) => void;
    addToCart: (item: CartItem) => void;
    updateQuantity: (variantId: number, delta: number, customData?: string, playerNickname?: string) => void;
    removeFromCart: (variantId: number, customData?: string, playerNickname?: string) => void;
    clearCart: () => void;
    getTotalAmount: () => number;
    setLastOrderNumber: (num: string | null) => void;
    setSelectedProductId: (id: number | null) => void;
    resetKiosk: () => void;
}

export const useKioskStore = create<KioskState>((set, get) => ({
    step: "IDLE",
    cart: [],
    lastOrderNumber: null,
    selectedProductId: null,

    setStep: (step: KioskStep) => set({ step }),

    addToCart: (item: CartItem) => set((state) => {
        const existing = state.cart.find(i => i.variantId === item.variantId && i.customData === item.customData && i.playerNickname === item.playerNickname);
        if (existing) {
            return {
                cart: state.cart.map(i =>
                    (i.variantId === item.variantId && i.customData === item.customData && i.playerNickname === item.playerNickname)
                        ? { ...i, quantity: i.quantity + item.quantity }
                        : i
                )
            };
        }
        return { cart: [...state.cart, item] };
    }),

    updateQuantity: (variantId: number, delta: number, customData?: string, playerNickname?: string) => set((state) => ({
        cart: state.cart.map(i =>
            (i.variantId === variantId && i.customData === customData && i.playerNickname === playerNickname)
                ? { ...i, quantity: Math.max(1, i.quantity + delta) }
                : i
        )
    })),

    removeFromCart: (variantId: number, customData?: string, playerNickname?: string) => set((state) => ({
        cart: state.cart.filter(i => !(i.variantId === variantId && i.customData === customData && i.playerNickname === playerNickname))
    })),

    clearCart: () => set({ cart: [] }),

    getTotalAmount: () => {
        const { cart } = get();
        return cart.reduce((acc: number, item: CartItem) => acc + (Number(item.price) * item.quantity), 0);
    },

    setLastOrderNumber: (num) => set({ lastOrderNumber: num }),

    setSelectedProductId: (id) => set({ selectedProductId: id }),

    resetKiosk: () => set({
        step: "IDLE",
        cart: [],
        lastOrderNumber: null,
        selectedProductId: null
    }),
}));
