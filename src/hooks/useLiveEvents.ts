"use client";

import { useEffect, useRef, useState } from "react";
import { SystemEvent } from "@/lib/events";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";

type EventData = {
    event: string;
    data: any;
};

/**
 * Hook to listen for real-time system events via SSE.
 */
export function useLiveEvents() {
    const [isConnected, setIsConnected] = useState(false);
    const router = useRouter();
    const eventSourceRef = useRef<EventSource | null>(null);

    useEffect(() => {
        // Connect to the SSE stream
        const eventSource = new EventSource("/api/events/stream");
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => {
            console.log("[SSE] Connected to event stream");
            setIsConnected(true);
        };

        eventSource.onmessage = (event) => {
            try {
                const { event: eventName, data }: EventData = JSON.parse(event.data);

                // Common handlers
                switch (eventName) {
                    case "connected":
                        console.log("[SSE] Connection established:", data.timestamp);
                        break;

                    case SystemEvent.ORDER_CREATED:
                        toast.success(`Nouvelle commande : #${data.orderNumber || '???'}`);
                        router.refresh();
                        break;

                    case SystemEvent.DEBT_PAYMENT_RECORDED:
                        toast.success(`Nouveau paiement : ${data.amount} DA de ${data.clientName || 'un client'}`);
                        router.refresh();
                        break;

                    case "whatsapp.message": // Custom event from webhook if we add it
                        router.refresh();
                        break;

                    default:
                        // Generic refresh for other system events that might impact UI
                        if (eventName.includes("updated") || eventName.includes("created")) {
                            router.refresh();
                        }
                }
            } catch (err) {
                console.error("[SSE] Error parsing event data:", err);
            }
        };

        eventSource.onerror = (err) => {
            console.error("[SSE] Connection error:", err);
            setIsConnected(false);
            // EventSource automatically attempts to reconnect on error
        };

        return () => {
            console.log("[SSE] Closing connection");
            eventSource.close();
            eventSourceRef.current = null;
        };
    }, [router]);

    return { isConnected };
}
