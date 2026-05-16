"use server";

import { lbClient, lbConfig, isLoadBrainEnabled } from "@/lib/loadbrain";
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

const POLL_INTERVAL_MS = 1500;
const POLL_MAX_ATTEMPTS = 20;          // ~30s d'attente max
const ORDER_PREFIX = "#CHK";            // tasks de check préfixées pour ne pas polluer #C ni #ADM

/**
 * Check IBOSOL device status via the public /api/v1/provision endpoint
 * with planId=ibo-check (0 crédit IBOSOL, gratuit).
 *
 * Le SDK IbosolModule.checkDevice() pointe sur /api/v1/ibosol/internal/check-device
 * qui n'est pas exposé sur l'API gateway publique. On contourne en utilisant
 * /api/v1/provision avec le plan ibo-check, puis on poll getTask jusqu'à completion.
 */
export async function checkIbosolDevice(input: { mac: string; appId: number }): Promise<CheckDeviceResult> {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, error: "MAC invalide" };
    }

    if (!isLoadBrainEnabled() || !lbClient || !lbConfig) {
        return { success: false, error: "Service indisponible" };
    }

    try {
        // 1. Résoudre IBOSOL providerId + ibo-check planId via le catalog
        const catRes = await fetch(`${lbConfig.baseUrl}/api/v1/catalog`, {
            headers: { "X-API-Key": lbConfig.apiKey },
            cache: "no-store",
        });
        const catalog = await catRes.json();
        const iboProvider = (catalog?.data?.providers || []).find((p: any) => p.type === "ibosol");
        if (!iboProvider) {
            return { success: false, error: "IBOSOL provider indisponible" };
        }
        const checkPlan = iboProvider.plans?.find((p: any) => p.displayName?.includes("Check MAC"));
        if (!checkPlan) {
            return { success: false, error: "Plan ibo-check introuvable" };
        }

        // 2. POST /provision (gratuit, 0 crédit)
        // ⚠️ webhookUrl + webhookSecret sont REQUIS par le gateway même quand on poll
        // (sinon 400 "Provider not found in any module" — message trompeur).
        const orderId = `${ORDER_PREFIX}-${parsed.data.mac.replace(/[:-]/g, "")}-${Date.now()}`;
        const webhookUrl = `${lbConfig.siteUrl.replace(/\/$/, "")}/api/loadbrain/webhook`;
        const provisionRes = await fetch(`${lbConfig.baseUrl}/api/v1/provision`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": lbConfig.apiKey,
            },
            body: JSON.stringify({
                orderId,
                customerId: "check-device",
                customerInfo: {
                    name: "Check Device",
                    mac: parsed.data.mac,
                    appId: parsed.data.appId,
                },
                providerId: iboProvider.id,
                planId: checkPlan.id,
                screenCount: 1,
                webhookUrl,
                webhookSecret: lbConfig.webhookSecret,
            }),
        });
        const provisionJson = await provisionRes.json();
        if (!provisionJson?.success || !provisionJson?.data?.taskId) {
            return { success: false, error: provisionJson?.error || "Échec création tâche check" };
        }
        const taskId = provisionJson.data.taskId;

        // 3. Poll getTask jusqu'à completion (max ~30s)
        for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
            await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

            const taskRes = await fetch(`${lbConfig.baseUrl}/api/v1/provision/${taskId}`, {
                headers: { "X-API-Key": lbConfig.apiKey },
                cache: "no-store",
            });
            const taskJson = await taskRes.json();
            const task = taskJson?.data?.task ?? taskJson?.data ?? null;
            if (!task) continue;

            if (task.status === "completed") {
                const creds = task.credentials || {};
                return {
                    success: true,
                    data: {
                        mac: creds.mac || parsed.data.mac,
                        appName: APP_NAMES[parsed.data.appId] || "IBO Player",
                        isActivated: !!creds.isActivated,
                        expiresAt: creds.expiresAt || null,
                        ip: creds.device?.ip || null,
                        playlistInjected: !!creds.playlistInjected,
                    },
                };
            }
            if (task.status === "failed") {
                return {
                    success: false,
                    error: task.error || task.errorCode || "Vérification échouée côté panel",
                };
            }
            // queued / processing → continue polling
        }

        return { success: false, error: "Timeout — vérification toujours en cours après 30s" };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Erreur de vérification";
        return { success: false, error: message };
    }
}
