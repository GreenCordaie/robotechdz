"use server";

import { lbClient, isLoadBrainEnabled } from "@/lib/loadbrain";
import { z } from "zod";

const inputSchema = z.object({
    mac: z.string().regex(/^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/),
    appId: z.number().int().min(1).max(10),
});

export interface CheckDeviceResult {
    success: boolean;
    error?: string;
    data?: {
        mac: string;
        appName: string;
        isActivated: boolean;
        expiresAt: string | null;
        ip: string | null;
        playlistInjected: boolean;
    };
}

const APP_NAMES: Record<number, string> = {
    1: "IBO Player",
    2: "SmartOne",
    3: "BOB Player",
    4: "IBO Pro",
};

export async function checkIbosolDevice(input: { mac: string; appId: number }): Promise<CheckDeviceResult> {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, error: "MAC invalide" };
    }

    if (!isLoadBrainEnabled() || !lbClient) {
        return { success: false, error: "Service indisponible" };
    }

    try {
        // SDK 3.2.0 exposes ibosol.checkDevice synchronously.
        // The site-integration LoadBrainClient wraps the SDK without
        // surfacing the IbosolModule, so reach through `sdk` defensively.
        const sdk = (lbClient as any).sdk ?? lbClient;
        const ibosolModule = sdk?.ibosol;
        const result = ibosolModule?.checkDevice
            ? await ibosolModule.checkDevice({ mac: parsed.data.mac, appId: parsed.data.appId })
            : null;

        if (!result) {
            return { success: false, error: "SDK ibosol.checkDevice indisponible" };
        }

        return {
            success: true,
            data: {
                mac: result.mac || parsed.data.mac,
                appName: APP_NAMES[parsed.data.appId] || "IBO Player",
                isActivated: !!result.isActivated,
                expiresAt: result.expiresAt || null,
                ip: result.device?.ip || null,
                playlistInjected: !!result.playlistInjected,
            },
        };
    } catch (err: any) {
        return { success: false, error: err?.message || "Erreur de vérification" };
    }
}
