import { db } from "@/db";
import { decrypt } from "@/lib/encryption";

/**
 * Service to orchestrate advanced logic with n8n.
 * Decouples the Next.js app from the complex automation workflows.
 */
export class N8nService {
    /**
     * Generic trigger for any event
     */
    static async triggerEvent(eventName: string, data: any) {
        try {
            const settings = await db.query.shopSettings.findFirst();
            const webhookUrl = settings?.n8nWebhookUrl || process.env.N8N_WEBHOOK_URL || "http://localhost:5678/webhook/flexbox-gateway";

            // n8n runs in Docker — replace localhost with host.docker.internal
            // so n8n can reach WAHA (also in Docker) via the host bridge
            const waUrl = (settings?.whatsappApiUrl || 'http://localhost:3001')
                .replace('localhost', 'host.docker.internal');

            const config = {
                shopTitle: settings?.shopName || "ROBOTECH DZ",
                wa_url: waUrl,
                wa_key: settings?.whatsappApiKey,
                wa_instance: settings?.whatsappInstanceName || "default",
                tg_token: settings?.telegramBotToken,
                tg_caisse: settings?.telegramChatIdCaisse,
            };

            console.log(`[N8nService] Triggering event: ${eventName} at URL: ${webhookUrl}`);
            const payload = { eventName, config, data };

            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(10_000)
            });

            const responseStatus = response.status;
            const responseText = await response.text();

            if (!response.ok) {
                console.error(`[N8nService] n8n error ${responseStatus}: ${responseText}`);
                return { error: true, status: responseStatus, message: responseText };
            }

            console.log(`[N8nService] Request successful (${responseStatus})`);

            try {
                return JSON.parse(responseText);
            } catch {
                return { success: true, raw: responseText };
            }
        } catch (error: any) {
            console.error(`[N8nService] Failed to reach n8n:`, error.message);
            return { error: true, message: error.message };
        }
    }

    /**
     * Specialized notification for order events
     */
    static async notifyOrderEvent(eventName: string, order: any, items: any[]) {
        // Map app events to Gateway-recognized event names
        const gatewayEventMap: Record<string, string> = {
            'ORDER_DELIVERED': 'CUSTOMER_DELIVERY',
            'ORDER_PRINTED': 'ORDER_CREATED', // Gateway uses ORDER_CREATED for CAISSE notification
            'MANUAL_PROCESSING_REQUIRED': 'TRAITEUR_NOTIFY'
        };

        const finalEventName = gatewayEventMap[eventName] || eventName;

        return this.triggerEvent(finalEventName, {
            orderId: order.id,
            orderNumber: order.orderNumber,
            customerPhone: order.customerPhone || order.client?.telephone || "",
            customerName: order.client?.nomComplet || "Client Kiosque",
            totalAmount: order.totalAmount,
            itemsCount: items?.length || 0,
            formattedItemsText: items?.map((it: any) => {
                let line = `- ${it.name} (x${it.quantity})`;
                if (it.credentials?.length) {
                    line += '\n' + it.credentials.map((c: any) => `  ${c.label}: ${c.value}`).join('\n');
                }
                return line;
            }).join('\n\n') || "",
            link: `${process.env.NEXT_PUBLIC_APP_URL}/admin/commandes`
        });
    }

    /**
     * Notify about order archival
     */
    static async notifyOrderArchival(order: any) {
        return this.triggerEvent("ORDER_ARCHIVED", {
            orderId: order.id,
            orderNumber: order.orderNumber,
            customerName: order.client?.nomComplet || "Client",
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Backward compatibility
     */
    static async notifyOrderPrinted(order: any, items: any[]) {
        return this.notifyOrderEvent("ORDER_PRINTED", order, items);
    }

    /**
     * Notifies the "Traiteur" (Processor) that an order is ready for manual handling.
     */
    static async notifyTraiteur(order: any) {
        return this.notifyOrderEvent("MANUAL_PROCESSING_REQUIRED", order, order.items || []);
    }

    /**
     * Syncs a customer to CRM via n8n
     */
    static async syncCustomerToCRM(client: any, trigger: string) {
        return this.triggerEvent("CRM_SYNC", {
            clientId: client.id,
            name: client.nomComplet,
            phone: client.telephone,
            trigger
        });
    }

    /**
     * Syncs a supplier to CRM via n8n
     */
    static async syncSupplierToCRM(supplier: any, trigger: string) {
        return this.triggerEvent("CRM_SYNC_SUPPLIER", {
            supplierId: supplier.id,
            name: supplier.name,
            trigger
        });
    }

    /**
     * Syncs a shared account to Notion via n8n
     */
    static async syncSharedAccountToNotion(data: {
        productName: string;
        email: string;
        pass: string;
        variantName: string;
        slotsCount: number;
    }) {
        return this.triggerEvent("NOTION_SYNC_ACCOUNT", data);
    }

    /**
     * Triggers the daily expiration scan workflow in n8n
     */
    static async runDailyExpirationScan() {
        return this.triggerEvent("DAILY_EXPIRATION_SCAN", {
            timestamp: new Date().toISOString()
        });
    }
}
