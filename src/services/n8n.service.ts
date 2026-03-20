import { db } from "@/db";

/**
 * N8n Centralized Service
 * Delegating notification and automation logic to n8n workflows.
 */
export class N8nService {
    /**
     * Triggers an event on the configured n8n webhook.
     * Resilient: Errors are logged but do not crash the main application flow.
     */
    static async triggerEvent(eventName: string, data: any) {
        // Get webhook from DB first, fallback to env
        let webhookUrl = process.env.N8N_WEBHOOK_URL;

        try {
            const { SystemQueries } = await import("@/services/queries/system.queries");
            const settings = await SystemQueries.getSettings();
            if (settings?.n8nWebhookUrl) {
                webhookUrl = settings.n8nWebhookUrl;
            }
        } catch (e) {
            console.error("[N8N-SERVICE] Failed to fetch settings from DB:", e);
        }

        if (!webhookUrl) {
            console.warn(`[N8N-SERVICE] Trigger ${eventName} skipped: Webhook URL not configured.`);
            return false;
        }

        try {
            console.log(`📡 [N8N-TRIGGER] Event: ${eventName}`);

            const response = await fetch(webhookUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Event-Source": "Robitechdz-Backend",
                    "X-Event-Name": eventName
                },
                body: JSON.stringify({
                    event: eventName,
                    timestamp: new Date().toISOString(),
                    data
                })
            });

            if (!response.ok) {
                const errorBody = await response.text();
                console.error(`[N8N-ERROR] Status: ${response.status} | Body: ${errorBody}`);
                return false;
            }

            console.log(`✅ [N8N-SUCCESS] Event ${eventName} delivered.`);
            return true;
        } catch (error) {
            // Failure should not block the caller
            console.error(`[N8N-CRITICAL-TRANSPORT] Event: ${eventName} | Error:`, (error as Error).message);
            return false;
        }
    }
}
