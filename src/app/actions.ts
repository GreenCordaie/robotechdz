"use server";

import { triggerOrderDelivery } from "@/lib/delivery";

/**
 * Global trigger for order delivery notifications (WhatsApp/Telegram).
 * This function is designed to be called whenever an order status changes to 'Paid'.
 * It uses the Evolution API (Baileys based) for WhatsApp delivery.
 */
export async function handleOrderDelivery(orderId: number) {
    try {
        console.log(`[WA-DELIVERY] Triggering for Order #${orderId}`);
        const result = await triggerOrderDelivery(orderId);

        if (result?.success) {
            console.log(`[WA-DELIVERY] Order #${orderId} delivered successfully via WhatsApp.`);
        } else {
            console.warn(`[WA-DELIVERY] Order #${orderId} delivery failed or skipped:`, result?.error || "Unknown reason");
        }

        return result;
    } catch (error: any) {
        console.error(`[WA-DELIVERY-ERROR] Critical failure for Order #${orderId}:`, error.message);
        return { success: false, error: error.message };
    }
}
