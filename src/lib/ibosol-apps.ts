import "server-only";
import { lbConfig } from "@/lib/loadbrain";
import { lbV2, isLoadBrainV2Enabled } from "@/lib/loadbrain-v2";

export interface IbosolApp {
    id: number;
    name: string;
    icon?: string;
}

function normalizeApps(raw: any[]): IbosolApp[] {
    return raw
        .map((a) => ({
            id: Number(a.id),
            name: String(a.name ?? a.label ?? `App #${a.id}`),
            icon: typeof a.icon === "string" ? a.icon : undefined,
        }))
        .filter((a) => Number.isFinite(a.id) && a.id > 0);
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

    // v2 path (behind LOADBRAIN_USE_V2=true), fallback to v1 raw fetch on error.
    if (isLoadBrainV2Enabled() && lbV2) {
        try {
            const data = await lbV2.iptv.apps.list();
            // SDK v2 returns a flat ReadonlyArray<IptvApp>; some envelope variants
            // may instead surface { apps: [...] }. Tolerate both.
            const raw: any[] = Array.isArray(data)
                ? (data as any[])
                : ((data as any)?.apps ?? []);
            const apps = normalizeApps(raw);
            if (apps.length > 0) {
                cache = { data: apps, expiresAt: Date.now() + CACHE_TTL_MS };
                return apps;
            }
            console.warn("[ibosol-apps] v2 returned empty list, fallback to v1");
        } catch (err) {
            console.warn(
                "[ibosol-apps] v2 fetch failed, fallback to v1:",
                err instanceof Error ? err.message : err
            );
            // fall through to v1
        }
    }

    try {
        // Public tenant endpoint at the gateway: validates X-API-Key, proxies to
        // the ibosol module's internal apps route. Admin endpoint requires a
        // Bearer JWT and is unreachable with just a tenant API key.
        const url = `${lbConfig.baseUrl.replace(/\/$/, "")}/api/v1/ibosol/apps`;
        const res = await fetch(url, {
            headers: { "X-API-Key": lbConfig.apiKey },
            signal: AbortSignal.timeout(5000),
            cache: "no-store",
        });
        if (!res.ok) throw new Error(`LoadBrain returned ${res.status}`);
        const body = await res.json();
        // Gateway envelope: {success, data: {apps: [...]}}. Fall back to other
        // shapes in case the response format ever shifts upstream.
        const raw: any[] = Array.isArray(body)
            ? body
            : (body?.data?.apps ?? body?.applications ?? body?.data?.applications ?? body?.data ?? []);
        if (!Array.isArray(raw) || raw.length === 0) throw new Error("Empty apps list");

        const apps = normalizeApps(raw);

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
