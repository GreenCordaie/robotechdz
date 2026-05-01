// src/lib/ibosol-credentials.ts

/** Payload Ibosol tel que reçu du webhook LoadBrain */
export interface IbosolPayload {
    mac?: string;
    activationCode?: string;
    pin?: string;
    expiresAt?: string;
    isActivated?: boolean;
    playlistInjected?: boolean;
    playlistId?: string;
    iptvUsername?: string;
    iptvPassword?: string;
    m3uUrl?: string;
    epgUrl?: string;
    device?: { app_type?: string; ip?: string };
}

/** Format de customData pour items Ibosol au panier */
export interface IbosolCustomData {
    type: "ibosol";
    mac: string;
    appId: number;
    combo?: {
        iptvVariantId: number;
        iptvProviderId: string;
        iptvPlanId: string;
        iptvProductName: string;
        iptvPrice: string;
    };
}

/** Détecte si un payload webhook est de type Ibosol (vs IPTV classique avec screens[]) */
export function isIbosolPayload(creds: unknown): creds is IbosolPayload {
    if (!creds || typeof creds !== "object") return false;
    const c = creds as Record<string, unknown>;
    return Boolean(c.mac || c.activationCode || c.playlistInjected !== undefined);
}

/** Détecte un échec partiel : combo demandé mais IPTV non créée */
export function isPartialSuccess(payload: IbosolPayload, comboRequested: boolean): boolean {
    if (!comboRequested) return false;
    const hasActivation = !!payload.isActivated || !!payload.activationCode;
    const hasIptvCreds = !!(payload.iptvUsername && payload.iptvPassword);
    return hasActivation && !hasIptvCreds;
}

/** Sérialise les credentials Ibosol en chaîne unique pour digital_codes */
export function formatIbosolCode(payload: IbosolPayload): string {
    const parts: string[] = [];
    if (payload.mac) parts.push(`MAC: ${payload.mac}`);
    if (payload.activationCode) parts.push(`Code activation: ${payload.activationCode}`);
    if (payload.pin) parts.push(`PIN: ${payload.pin}`);
    if (payload.expiresAt) parts.push(`Expire: ${payload.expiresAt}`);
    if (payload.iptvUsername) parts.push(`User: ${payload.iptvUsername}`);
    if (payload.iptvPassword) parts.push(`Pass: ${payload.iptvPassword}`);
    if (payload.m3uUrl) parts.push(`M3U: ${payload.m3uUrl}`);
    if (payload.epgUrl) parts.push(`EPG: ${payload.epgUrl}`);
    if (payload.playlistInjected !== undefined) {
        parts.push(`Playlist injectée: ${payload.playlistInjected ? "oui" : "non"}`);
    }
    return parts.join(" | ");
}

/** Parse customData (string JSON) en `IbosolCustomData` typé. Retourne null si pas Ibosol. */
export function parseIbosolCustomData(customData: string | null | undefined): IbosolCustomData | null {
    if (!customData) return null;
    try {
        const parsed = JSON.parse(customData);
        if (parsed?.type === "ibosol" && typeof parsed.mac === "string" && typeof parsed.appId === "number") {
            return parsed as IbosolCustomData;
        }
    } catch {
        // customData not JSON
    }
    return null;
}

/** Parse une date au format Ibosol "YYYY-MM-DD" ou ISO ou DD-MM-YYYY HH:mm */
export function parseIbosolExpires(raw: string | null | undefined): Date | null {
    if (!raw || raw === "pending") return null;
    const ddmm = raw.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
    if (ddmm) {
        const [, dd, mm, yyyy, hh = "00", mi = "00"] = ddmm;
        return new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:00Z`);
    }
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
}
