import "server-only";
import { lbConfig } from "@/lib/loadbrain";

export interface IbosolApp {
    id: number;
    name: string;
    icon?: string;
}

const FALLBACK_APPS: IbosolApp[] = [
    { id: 1, name: "IBO Player" },
    { id: 2, name: "SmartOne" },
    { id: 3, name: "BOB Player" },
    { id: 4, name: "IBO Pro" },
];

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
let cache: { data: IbosolApp[]; expiresAt: number } | null = null;

export async function getIbosolApps(): Promise<IbosolApp[]> {
    if (cache && cache.expiresAt > Date.now()) return cache.data;

    if (!lbConfig) {
        console.warn("[ibosol-apps] LoadBrain not configured — using fallback");
        return FALLBACK_APPS;
    }

    try {
        const url = `${lbConfig.baseUrl.replace(/\/$/, "")}/api/v1/ibosol/admin/apps`;
        const res = await fetch(url, {
            headers: { "X-API-Key": lbConfig.apiKey },
            signal: AbortSignal.timeout(5000),
            cache: "no-store",
        });
        if (!res.ok) throw new Error(`LoadBrain returned ${res.status}`);
        const body = await res.json();
        // Gateway envelope {success, data} | direct array | {applications: [...]}
        const raw: any[] = Array.isArray(body)
            ? body
            : (body?.data ?? body?.applications ?? body?.data?.applications ?? []);
        if (!Array.isArray(raw) || raw.length === 0) throw new Error("Empty apps list");

        const apps: IbosolApp[] = raw.map((a) => ({
            id: Number(a.id),
            name: String(a.name ?? a.label ?? `App #${a.id}`),
            icon: typeof a.icon === "string" ? a.icon : undefined,
        })).filter((a) => Number.isFinite(a.id) && a.id > 0);

        if (apps.length === 0) throw new Error("No valid apps after normalization");

        cache = { data: apps, expiresAt: Date.now() + CACHE_TTL_MS };
        return apps;
    } catch (err) {
        console.warn(
            "[ibosol-apps] fallback to hardcoded list:",
            err instanceof Error ? err.message : err
        );
        return FALLBACK_APPS;
    }
}

export function getIbosolAppName(appId: number, apps: IbosolApp[]): string {
    return apps.find((a) => a.id === appId)?.name ?? `IBO Player (#${appId})`;
}

export function invalidateIbosolAppsCache(): void {
    cache = null;
}
