import { db } from "@/db";

/**
 * N8n Centralized Service
 * Delegating notification and automation logic to n8n workflows.
 */
export class N8nService {
    /**
     * Triggers an event on the configured n8n webhook.
     */
    static async triggerEvent(eventName: string, data: any) {
        // ... (existing logic)
    }

    /**
     * Specialized: Triggered when a new order is completed.
     */
    static async notifyOrderCreated(order: any) {
        return this.triggerEvent("ORDER_CREATED", {
            orderId: order.id,
            customer: order.customerName,
            total: order.totalAmount,
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
}
