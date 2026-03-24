import { create } from "zustand";
import { getShopSettingsAction } from "@/app/admin/settings/actions";

interface SettingsState {
    shopName: string;
    shopTel: string;
    shopAddress: string;
    footerMessage: string;
    showCashier: boolean;
    showDateTime: boolean;
    showLogo: boolean;
    showTrackQr: boolean;
    logoUrl: string;
    dashboardLogoUrl: string;
    faviconUrl: string;
    isB2bEnabled: boolean;
    isLoading: boolean;
    fetchSettings: () => Promise<void>;
    updateSettings: (settings: Partial<Omit<SettingsState, 'fetchSettings' | 'isLoading'>>) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
    shopName: "FLEXBOX Direct",
    shopTel: "",
    shopAddress: "",
    footerMessage: "Merci de votre visite !",
    showCashier: true,
    showDateTime: true,
    showLogo: true,
    showTrackQr: true,
    logoUrl: "",
    dashboardLogoUrl: "",
    faviconUrl: "",
    isB2bEnabled: false,
    isLoading: false,
    fetchSettings: async () => {
        set({ isLoading: true });
        try {
            const res = await getShopSettingsAction({});
            if (res.success && res.data) {
                set({
                    shopName: res.data.shopName || "FLEXBOX Direct",
                    shopTel: res.data.shopTel || "",
                    shopAddress: res.data.shopAddress || "",
                    footerMessage: res.data.footerMessage || "Merci de votre visite !",
                    showCashier: res.data.showCashierOnReceipt ?? true,
                    showDateTime: res.data.showDateTimeOnReceipt ?? true,
                    showLogo: res.data.showLogoOnReceipt ?? true,
                    showTrackQr: res.data.showTrackQrOnReceipt ?? true,
                    logoUrl: res.data.logoUrl || "",
                    dashboardLogoUrl: res.data.dashboardLogoUrl || "",
                    faviconUrl: res.data.faviconUrl || "",
                    isB2bEnabled: !!res.data.isB2bEnabled,
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
