"use server";

/**
 * Code inventory stock — admin read-only view.
 *
 * Reads the platform's LoadBrain code inventory from the gateway stock
 * route (`/api/v1/giftcards/inventory/stock`) using the site's X-API-Key.
 * This surfaces available deliverable codes per product, with a special
 * emphasis on `source: "refund"` units — codes recovered back into stock
 * when a reseller order was refunded as "reusable".
 *
 * Read-only: no DB writes, no mutation. The gateway is the source of truth.
 */
import { z } from "zod";
import { withAuth } from "@/lib/security";
import { UserRole } from "@/lib/constants";

/**
 * A summary row: one (provider, product_ref, label, status, source) bucket
 * with a count `n` of units in it.
 */
export interface InventoryStockSummaryRow {
    provider: string;
    product_ref: string;
    label: string | null;
    status: string;
    source: string;
    n: number;
}

/** A single deliverable unit (a code) in stock. */
export interface InventoryStockUnitRow {
    id: string;
    provider: string;
    productRef: string;
    label: string | null;
    deliverableType: string;
    source: string;
    createdAt: string | null;
    expiresAt: string | null;
    code: string | null;
}

export interface InventoryStockData {
    summary: InventoryStockSummaryRow[];
    units: InventoryStockUnitRow[];
    disabled: boolean;
}

/**
 * Resolve the LoadBrain base URL + API key from env. Returns null when the
 * env is missing — callers should surface a "non configuré" state rather
 * than crash. (Duplicated from the active-code / refund-request actions;
 * there is no shared src/lib/loadbrain.ts yet.)
 */
function resolveLoadBrainAuth(): { baseUrl: string; apiKey: string } | null {
    const apiKey = process.env.LOADBRAIN_API_KEY;
    const baseUrl = process.env.LOADBRAIN_URL;
    if (!apiKey || !baseUrl) return null;
    return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
}

export const getInventoryStockAction = withAuth(
    { roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN], schema: z.any().optional() },
    async (): Promise<
        | { success: true; data: InventoryStockData }
        | { success: false; error: string }
    > => {
        const auth = resolveLoadBrainAuth();
        if (!auth) {
            return { success: false, error: "LoadBrain non configuré" };
        }

        try {
            const res = await fetch(
                `${auth.baseUrl}/api/v1/giftcards/inventory/stock`,
                {
                    headers: { "X-API-Key": auth.apiKey },
                    cache: "no-store",
                },
            );
            if (!res.ok) {
                return { success: false, error: `upstream ${res.status}` };
            }
            const body = (await res.json()) as {
                success?: boolean;
                data?: {
                    summary?: InventoryStockSummaryRow[];
                    units?: InventoryStockUnitRow[];
                    disabled?: boolean;
                };
            };
            const data = body.data ?? {};
            return {
                success: true,
                data: {
                    summary: Array.isArray(data.summary) ? data.summary : [],
                    units: Array.isArray(data.units) ? data.units : [],
                    disabled: data.disabled === true,
                },
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Erreur réseau",
            };
        }
    },
);
