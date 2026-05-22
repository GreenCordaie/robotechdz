import "server-only";

export interface LoadbrainProviderSnapshot {
    slug: string;
    status: "ok" | "degraded" | "down";
    latencyMs: number;
    error?: string;
    balance: { balanceCents: number; currency: string; fetchedAt: string } | null;
    fetchedAt: string;
}

export interface ProvidersApiResponse {
    success: boolean;
    data: LoadbrainProviderSnapshot[];
    downCount: number;
    totalCount: number;
    error?: string;
}

const LOADBRAIN_URL = process.env.LOADBRAIN_URL ?? "";
const API_KEY = process.env.LOADBRAIN_API_KEY ?? "";

export async function fetchLoadbrainProviders(): Promise<ProvidersApiResponse> {
    if (!LOADBRAIN_URL || !API_KEY) {
        return {
            success: false,
            data: [],
            downCount: 0,
            totalCount: 0,
            error: "LOADBRAIN_URL ou LOADBRAIN_API_KEY non configuré",
        };
    }

    try {
        const url = `${LOADBRAIN_URL.replace(/\/$/, "")}/api/v1/giftcards/admin/providers/registry`;
        const res = await fetch(url, {
            headers: { "X-API-Key": API_KEY },
            signal: AbortSignal.timeout(8_000),
            cache: "no-store",
        });

        if (!res.ok) {
            const body = await res.text().catch(() => "");
            return {
                success: false,
                data: [],
                downCount: 0,
                totalCount: 0,
                error: `LoadBrain ${res.status}: ${body.slice(0, 120)}`,
            };
        }

        const body = (await res.json()) as ProvidersApiResponse;
        return {
            success: body.success ?? true,
            data: Array.isArray(body.data) ? body.data : [],
            downCount: body.downCount ?? 0,
            totalCount: body.totalCount ?? (Array.isArray(body.data) ? body.data.length : 0),
            error: body.error,
        };
    } catch (err) {
        return {
            success: false,
            data: [],
            downCount: 0,
            totalCount: 0,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
