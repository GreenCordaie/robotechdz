import { EventEmitter } from "events";

/**
 * Global Event Bus for the application.
 * Allows decoupling long-running side effects from synchronous API responses.
 */
class AppEventBus extends EventEmitter {
    private static instance: AppEventBus;

    private constructor() {
        super();
        this.setMaxListeners(20);
        console.log("[EventBus] Initialized");
    }

    public static getInstance(): AppEventBus {
        if (!AppEventBus.instance) {
            AppEventBus.instance = new AppEventBus();
        }
        return AppEventBus.instance;
    }

    /**
     * Typed emit helper
     */
    public publish(event: SystemEvent, payload: any) {
        console.log(`[EventBus] Publishing: ${event}`);
        this.emit(event, payload);
    }
}

/**
 * Core System Events
 */
export enum SystemEvent {
    // Orders
    ORDER_CREATED = "order.created",
    ORDER_PAID = "order.paid",
    ORDER_DELIVERED = "order.delivered",
    ORDER_CANCELLED = "order.cancelled",

    // Printing
    TICKET_PRINTED = "ticket.printed",
    ORDER_PRINTED = "order.printed",

    // Payments
    DEBT_PAYMENT_RECORDED = "payment.recorded",

    // Inventory
    STOCK_LOW = "inventory.stock_low",

    // CRM
    CUSTOMER_UPDATED = "customer.updated"
}

export const eventBus = AppEventBus.getInstance();
