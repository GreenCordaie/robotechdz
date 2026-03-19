import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface User {
    id: number;
    email: string;
    role: "ADMIN" | "CAISSIER" | "TRAITEUR" | "RESELLER";
    nom: string;
    pinCode: string;
    avatarUrl?: string | null;
}

interface AuthState {
    isAuthenticated: boolean;
    user: User | null;
    setUser: (user: User) => void;
    clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            isAuthenticated: false,
            user: null,
            setUser: (user: User) => {
                set({
                    isAuthenticated: true,
                    user,
                });
            },
            clearAuth: () => {
                set({ isAuthenticated: false, user: null });
            },
        }),
        {
            name: "auth-storage",
            storage: createJSONStorage(() => localStorage),
        }
    )
);
