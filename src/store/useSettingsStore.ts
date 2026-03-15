import { create } from "zustand";
import { getShopSettingsAction } from "@/app/admin/settings/actions";

interface SettingsState {
    shopName: string;
    dashboardLogoUrl: string;
    faviconUrl: string;
    isLoading: boolean;
    fetchSettings: () => Promise<void>;
    updateSettings: (settings: Partial<{ shopName: string; dashboardLogoUrl: string; faviconUrl: string }>) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
    shopName: "FLEXBOX Direct",
    dashboardLogoUrl: "",
    faviconUrl: "",
    isLoading: false,
    fetchSettings: async () => {
        set({ isLoading: true });
        try {
            const res = await getShopSettingsAction();
            if (res.success && res.data) {
                set({
                    shopName: res.data.shopName || "FLEXBOX Direct",
                    dashboardLogoUrl: res.data.dashboardLogoUrl || "",
                    faviconUrl: res.data.faviconUrl || "",
                });
            }
        } catch (err) {
            console.error("Failed to fetch settings:", err);
        } finally {
            set({ isLoading: false });
        }
    },
    updateSettings: (settings) => set((state) => ({ ...state, ...settings })),
}));
