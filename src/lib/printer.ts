/**
 * Client d'impression — Robotech Print Service local (127.0.0.1:6543)
 * La configuration du ticket (nom boutique, adresse, footer…) est
 * UNIQUEMENT pilotée par les paramètres dans Réglages → Ticket de Caisse.
 */

const PRINT_SERVICE_URL = 'http://127.0.0.1:6543';
const PRINT_SECRET = process.env.PRINT_SECRET || 'robotech-print-secret-change-moi';
const TIMEOUT_MS = 10_000;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PrintShop {
    name: string;
    address?: string;
    tel?: string;
    footerMessage?: string;
    showDateTime: boolean;
    showCashier: boolean;
}

export interface PrintCredential {
    label: 'Email' | 'Pass' | 'Profil' | 'Code' | string;
    value: string;
}

export interface PrintItem {
    productName: string;
    quantity: number;
    price: number;
    credentials: PrintCredential[];
}

export interface PrintData {
    orderNumber: string;
    date: string;
    time: string;
    paymentMethod?: string;
    cashierName?: string;
    customer: {
        name: string;
        phone: string;
    };
    shop: PrintShop;        // ← piloté par ReceiptSettings
    items: PrintItem[];
    trackingUrl: string;
    totalClientDebt?: number;
}

export interface PrintResult {
    success: boolean;
    error?: string;
}

// ─── Client HTTP ─────────────────────────────────────────────────────────────

/**
 * Envoie un ticket au service d'impression local.
 * Ne lève jamais d'exception — retourne toujours { success, error? }.
 */
export async function printReceipt(data: PrintData): Promise<PrintResult> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const res = await fetch(`${PRINT_SERVICE_URL}/print`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-print-secret': PRINT_SECRET,
            },
            body: JSON.stringify(data),
            signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            return { success: false, error: (body as any).error || `HTTP ${res.status}` };
        }

        return await res.json() as PrintResult;

    } catch (err: any) {
        if (err.name === 'AbortError') {
            return { success: false, error: 'Timeout: service impression inaccessible (127.0.0.1:6543)' };
        }
        return { success: false, error: err.message };
    }
}

/**
 * Vérifie que le service d'impression local est démarré.
 */
export async function isPrintServiceAvailable(): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${PRINT_SERVICE_URL}/health`, {
            method: 'GET',
            mode: 'cors',
            signal: controller.signal,
        });
        clearTimeout(timer);
        return res.ok;
    } catch (err: any) {
        console.warn('[RobotechPrint] health check failed:', err?.message || err);
        return false;
    }
}

// ─── Builder ─────────────────────────────────────────────────────────────────

/**
 * Construit un objet PrintData complet depuis une commande DB + les settings boutique.
 * Les settings viennent du store (useSettingsStore) ou de la DB directement.
 *
 * @param order    - Commande avec items, codes, slots, client (Drizzle)
 * @param settings - Paramètres boutique (shopName, shopTel, shopAddress, footerMessage…)
 * @param appUrl   - URL publique de l'app pour le QR de suivi
 * @param cashierName - Nom du caissier (optionnel)
 */
export function buildPrintData(
    order: any,
    settings: {
        shopName?: string;
        shopTel?: string;
        shopAddress?: string;
        footerMessage?: string;
        showCashier?: boolean;
        showDateTime?: boolean;
    },
    appUrl: string,
    cashierName?: string,
): PrintData {
    const now = new Date();
    const date = now.toLocaleDateString('fr-FR');
    const time = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    const items: PrintItem[] = (order.items || []).map((item: any) => {
        const credentials: PrintCredential[] = [];

        // Codes simples (Netflix, Spotify, cartes cadeaux…)
        (item.codes || []).forEach((c: any) => {
            const code = typeof c === 'string' ? c : c.code;
            if (code) credentials.push({ label: 'Code', value: String(code) });
        });

        // Slots de comptes partagés (email + pass + profil + pin)
        (item.slots || []).forEach((s: any) => {
            const parent = s.digitalCode || {};
            if (parent.email) credentials.push({ label: 'Email', value: String(parent.email) });
            if (parent.password) credentials.push({ label: 'Pass', value: String(parent.password) });
            if (s.slotNumber) credentials.push({ label: 'Profil', value: String(s.slotNumber) });
            if (s.code) credentials.push({ label: 'Code', value: String(s.code) });
        });

        return {
            productName: item.product?.name || item.name || 'Article',
            quantity: item.quantity ?? 1,
            price: Number(item.price ?? 0),
            credentials,
        };
    });

    return {
        orderNumber: order.orderNumber,
        date,
        time,
        paymentMethod: order.paymentMethod || undefined,
        cashierName: cashierName || undefined,
        customer: {
            name: order.client?.name || order.reseller?.name || 'Client',
            phone: order.client?.telephone || order.reseller?.telephone || '',
        },
        // ── Toutes les infos boutique viennent des settings ReceiptSettings ──
        shop: {
            name: settings.shopName || 'MA BOUTIQUE',
            address: settings.shopAddress || undefined,
            tel: settings.shopTel || undefined,
            footerMessage: settings.footerMessage || undefined,
            showDateTime: settings.showDateTime ?? true,
            showCashier: settings.showCashier ?? true,
        },
        items,
        trackingUrl: `${appUrl}/suivi/${order.orderNumber}`,
        totalClientDebt: order.totalClientDebt ?? 0,
    };
}
