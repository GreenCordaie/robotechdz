import { create } from "zustand";

export type OrderStatus = "EN_ATTENTE" | "PAYE" | "TERMINE" | "ANNULE";

export interface OrderItem {
    variantId: number;
    name: string;
    price: string;
    quantity: number;
}

export interface Order {
    id: number;
    orderNumber: string;
    status: OrderStatus;
    totalAmount: string;
    items: OrderItem[];
    deliveryMethod: "TICKET" | "WHATSAPP";
    customerPhone?: string;
    createdAt: Date | string | null;
}

interface OrderState {
    currentOrder: Order | null;
    searchQuery: string;
    isSearching: boolean;
    setCurrentOrder: (order: Order | null) => void;
    setSearchQuery: (query: string) => void;
    setIsSearching: (isSearching: boolean) => void;
}

export const useOrderStore = create<OrderState>((set) => ({
    currentOrder: null,
    searchQuery: "",
    isSearching: false,
    setCurrentOrder: (order) => set({ currentOrder: order }),
    setSearchQuery: (query) => set({ searchQuery: query }),
    setIsSearching: (isSearching) => set({ isSearching: isSearching }),
}));
