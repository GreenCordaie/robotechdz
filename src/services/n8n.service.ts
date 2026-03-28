import { db } from "@/db";
import { digitalCodes, digitalCodeSlots, orderItems, orders, clients, productVariants } from "@/db/schema";
import { eq, and, lte, gte, isNotNull, ne } from "drizzle-orm";
import { DigitalCodeStatus, DigitalCodeSlotStatus } from "@/lib/constants";

/**
 * N8n Centralized Service
 * Delegating notification and automation logic to n8n workflows.
 */
export class N8nService {
    /**
     * Triggers an event on the configured n8n webhook.
     */
    static async triggerEvent(eventName: string, data: any) {
        try {
            const settings = await db.query.shopSettings.findFirst();

            // Strip /webhook/... suffix to prevent URL doubling when settings store full path
            // Use configured URL from settings/env or fallback to localhost
            const webhookUrl = settings?.n8nWebhookUrl || process.env.N8N_WEBHOOK_URL || "http://localhost:5678/webhook/robotech-events-debug";

            const config = {
                tg_token: settings?.telegramBotToken,
                tg_caisse: settings?.telegramChatIdCaisse,
                tg_traiteur: settings?.telegramChatIdTraiteur,
                wa_url: settings?.whatsappApiUrl,
                wa_key: settings?.whatsappApiKey,
                wa_instance: settings?.whatsappInstanceName,
                prompt: settings?.chatbotRole,
                greeting: settings?.chatbotGreeting,
            };

            console.log(`[N8nService] Full Config:`, JSON.stringify(config, null, 2));
            console.log(`[N8nService] Triggering event: ${eventName} at URL: ${webhookUrl}`);
            const payload = { eventName, config, data };
            console.log(`[N8nService] Payload Body:`, JSON.stringify(payload, null, 2));

            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(8_000)
            });

            const responseStatus = response.status;
            const responseText = await response.text();

            if (!response.ok) {
                console.error(`[N8nService] n8n error ${responseStatus}: ${responseText}`);
                return { error: true, status: responseStatus, message: responseText };
            }

            try {
                return JSON.parse(responseText);
            } catch {
                return { success: true, raw: responseText };
            }
        } catch (error: any) {
            console.error(`[N8nService] Error triggering event ${eventName}:`, error.message || error);
            return { error: true, message: error.message || String(error) };
        }
    }

    /**
     * Specialized: Triggered when a new order is completed.
     */
    static async notifyOrderCreated(order: any) {
        return this.triggerEvent("ORDER_CREATED", {
            orderId: order.id,
            orderNumber: order.orderNumber,
            customer: order.customerName,
            customerPhone: order.customerPhone, // Essential for automated WhatsApp delivery
            total: order.totalAmount,
            status: order.status,
            isFullyAuto: !!order.isFullyAuto,
            itemsCount: order.items?.length || 0,
            link: `${process.env.NEXT_PUBLIC_APP_URL}/admin/caisse/${order.id}`
        });
    }

    /**
     * Specialized: Triggered when stock falls below threshold.
     */
    static async notifyLowStock(product: any) {
        return this.triggerEvent("LOW_STOCK_ALERT", {
            productId: product.id,
            name: product.name,
            currentStock: product.stock,
            threshold: product.stockLimit || 5
        });
    }

    /**
     * CRM Sync: Notifies n8n to sync client data (creation or balance update).
     */
    static async syncCustomerToCRM(client: any, action: 'CREATED' | 'PAYMENT' | 'ORDER') {
        return this.triggerEvent("CRM_SYNC_CUSTOMER", {
            clientId: client.id,
            name: client.nomComplet,
            phone: client.telephone,
            debt: client.totalDetteDzd,
            action,
            lastUpdated: new Date().toISOString()
        });
    }

    /**
     * CRM Sync: Notifies n8n to sync supplier data.
     */
    static async syncSupplierToCRM(supplier: any, action: 'CREATED' | 'RECHARGE' | 'ADJUSTMENT' | 'PAYMENT') {
        return this.triggerEvent("CRM_SYNC_SUPPLIER", {
            supplierId: supplier.id,
            name: supplier.name,
            balance: supplier.balance,
            currency: supplier.currency,
            action,
            lastUpdated: new Date().toISOString()
        });
    }

    /**
     * Notion Sync: Pushes a new shared account to Notion database.
     */
    static async syncSharedAccountToNotion(accountData: {
        productName: string;
        email: string;
        pass: string;
        variantName: string;
        slotsCount: number;
    }) {
        return this.triggerEvent("NOTION_SYNC_ACCOUNT", {
            ...accountData,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Notifies the "Traiteur" (Processor) that an order is ready for manual handling.
     */
    static async notifyTraiteur(order: any) {
        return this.triggerEvent("TRAITEUR_NOTIFY", {
            orderId: order.id,
            orderNumber: order.orderNumber,
            customerPhone: order.customerPhone,
            totalAmount: order.totalAmount,
            items: order.items.map((it: any) => ({
                name: it.name,
                quantity: it.quantity,
                customData: it.customData
            }))
        });
    }

    static async notifyOrderArchival(order: any) {
        return this.triggerEvent("ORDER_ARCHIVAL", {
            orderId: order.id,
            orderNumber: order.orderNumber,
            clientName: order.client?.nom || "Client",
            clientPhone: order.client?.telephone || "",
            totalAmount: order.totalAmount,
            items: order.items.map((i: any) => ({
                name: i.variant?.product?.name || i.name,
                variant: i.variant?.name,
                quantity: i.quantity,
                price: i.price
            })),
            source: order.source,
            date: new Date().toISOString()
        });
    }

    /**
     * Specialized: Triggered when an order ticket is successfully printed.
     * This allows for automated delivery of codes or digital tickets.
     */
    static async notifyOrderPrinted(order: any, items: any[]) {
        return this.triggerEvent("ORDER_PRINTED", {
            orderId: order.id,
            orderNumber: order.orderNumber,
            customer: order.client?.nomComplet || order.reseller?.name || order.customerName || "Client",
            customerPhone: order.client?.telephone || order.reseller?.telephone || order.customerPhone || "",
            total: order.totalAmount,
            status: order.status,
            items: items.map(it => ({
                name: it.name || it.productName,
                quantity: it.quantity,
                credentials: it.credentials || []
            })),
            isAutoDelivery: order.status === 'TERMINE'
        });
    }

    /**
     * Specialized: Triggered when a debt payment ticket is successfully printed.
     * This allows sending an automated WhatsApp confirmation to the client.
     */
    static async notifyDebtPaymentPrinted(payment: any, client: any) {
        return this.triggerEvent("DEBT_PAYMENT_PRINTED", {
            paymentId: payment.id,
            receiptNumber: payment.receiptNumber,
            clientId: client.id,
            customer: client.nomComplet, // Align with Delivery pattern
            customerPhone: client.telephone, // Align with Waha/Delivery pattern
            amountPaid: payment.montantDzd,
            oldBalance: payment.oldBalanceDzd,
            newBalance: payment.newBalanceDzd,
            date: payment.createdAt || new Date().toISOString()
        });
    }

    /**
     * Notifies about an approaching expiry (usually 3 days before).
     */
    static async notifyApproachingExpiry(data: {
        type: 'CODE' | 'SLOT';
        itemName: string;
        expiresAt: Date;
        clientPhone: string;
        clientName: string;
    }) {
        return this.triggerEvent("EXPIRY_ALERT", {
            ...data,
            expiresAt: data.expiresAt.toISOString()
        });
    }

    /**
     * Scans the database for expiring items and updates status of expired ones.
     */
    static async runDailyExpirationScan() {
        const now = new Date();
        const threeDaysFromNow = new Date(now.getTime() + (3 * 24 * 60 * 60 * 1000));
        const twoDaysFromNow = new Date(now.getTime() + (2 * 24 * 60 * 60 * 1000));

        console.log(`[Expiration Scan] Started at ${now.toISOString()}`);

        const results = { notified: 0 };

        try {
            // 1. Find SLOTs expiring in 3 days
            const approachingSlots = await db
                .select({
                    id: digitalCodeSlots.id,
                    expiresAt: digitalCodeSlots.expiresAt,
                    phone: orders.customerPhone,
                    clientName: clients.nomComplet,
                    variantName: productVariants.name
                })
                .from(digitalCodeSlots)
                .innerJoin(orderItems, eq(digitalCodeSlots.orderItemId, orderItems.id))
                .innerJoin(orders, eq(orderItems.orderId, orders.id))
                .leftJoin(clients, eq(orders.clientId, clients.id))
                .innerJoin(productVariants, eq(orderItems.variantId, productVariants.id))
                .where(
                    and(
                        eq(digitalCodeSlots.status, DigitalCodeSlotStatus.VENDU),
                        isNotNull(digitalCodeSlots.expiresAt),
                        gte(digitalCodeSlots.expiresAt, twoDaysFromNow),
                        lte(digitalCodeSlots.expiresAt, threeDaysFromNow)
                    )
                );

            await Promise.all(approachingSlots
                .filter(slot => slot.phone && slot.expiresAt)
                .map(slot => this.notifyApproachingExpiry({
                    type: 'SLOT',
                    itemName: slot.variantName,
                    expiresAt: slot.expiresAt!,
                    clientPhone: slot.phone!,
                    clientName: slot.clientName || "Client"
                }).then(() => { results.notified++; })
                ));

            // Mark SLOTs and CODEs as EXPIRED in parallel
            await Promise.all([
                db.update(digitalCodeSlots)
                    .set({ status: DigitalCodeSlotStatus.EXPIRE })
                    .where(and(
                        ne(digitalCodeSlots.status, DigitalCodeSlotStatus.EXPIRE),
                        isNotNull(digitalCodeSlots.expiresAt),
                        lte(digitalCodeSlots.expiresAt, now)
                    )),
                db.update(digitalCodes)
                    .set({ status: DigitalCodeStatus.EXPIRE })
                    .where(and(
                        ne(digitalCodes.status, DigitalCodeStatus.EXPIRE),
                        isNotNull(digitalCodes.expiresAt),
                        lte(digitalCodes.expiresAt, now)
                    ))
            ]);

        } catch (error) {
            console.error("[Expiration Scan Error]", error);
        }

        console.log(`[Expiration Scan] Finished. Notified: ${results.notified}`);
        return results;
    }

    /**
     * Forwards an incoming WhatsApp message to n8n for AI support processing.
     * Delegates 100% of the logic to the "Robotech AI Assistant" n8n workflow.
     * Routes directly to the AI Assistant webhook (not the gateway) since
     * the gateway switch does not handle WHATSAPP_SUPPORT events.
     */
    static async handleWhatsAppSupport(payload: any) {
        try {
            const settings = await db.query.shopSettings.findFirst();
            let baseUrl = settings?.n8nWebhookUrl || process.env.N8N_WEBHOOK_URL || "http://localhost:5678";
            baseUrl = baseUrl.replace(/\/webhook\/.*$/, '');
            const webhookUrl = `${baseUrl}/webhook/robotech-ai-assistant-gemini`;

            // Wrap with config so the n8n workflow can read credentials and prompts
            const wrappedPayload = {
                config: {
                    wa_url: settings?.whatsappApiUrl,
                    wa_key: settings?.whatsappApiKey,
                    wa_instance: settings?.whatsappInstanceName,
                    prompt: settings?.chatbotRole,
                    greeting: settings?.chatbotGreeting,
                },
                ...payload
            };

            console.log(`[N8nService] Forwarding WhatsApp to AI Assistant: ${webhookUrl}`);
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(wrappedPayload),
                signal: AbortSignal.timeout(8_000)
            });

            const responseText = await response.text();
            if (!response.ok) {
                console.error(`[N8nService] AI Assistant error ${response.status}: ${responseText}`);
                return { error: true, status: response.status, message: responseText };
            }

            try {
                return JSON.parse(responseText);
            } catch {
                return { success: true, raw: responseText };
            }
        } catch (error: any) {
            console.error(`[N8nService] Error forwarding WhatsApp to AI Assistant:`, error.message || error);
            return { error: true, message: error.message || String(error) };
        }
    }
}
