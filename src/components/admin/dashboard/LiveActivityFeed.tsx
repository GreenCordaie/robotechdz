"use client";

import React, { useState, useEffect } from "react";
import { useLiveEvents } from "@/hooks/useLiveEvents";
import { SystemEvent } from "@/lib/events";
import { Card, CardBody, CardHeader, Chip } from "@heroui/react";
import { Activity, Clock } from "lucide-react";

interface FeedItem {
    id: string;
    event: string;
    data: any;
    timestamp: Date;
}

export const LiveActivityFeed = () => {
    const { isConnected } = useLiveEvents(); // This hook also handles toasts and refresh
    const [feed, setFeed] = useState<FeedItem[]>([]);

    useEffect(() => {
        // Since useLiveEvents handles the EventSource, and we want to capture history here,
        // we might need to subscribe to the same stream OR use a shared state.
        // For simplicity, we'll listen to the stream again or ideally use a custom 
        // event listener if useLiveEvents was emitting.

        // Let's modify useLiveEvents later to allow callbacks, 
        // but for now, we'll implement a local listener for the feed.

        const eventSource = new EventSource("/api/events/stream");

        eventSource.onmessage = (event) => {
            try {
                const { event: eventName, data } = JSON.parse(event.data);
                if (eventName === "connected") return;

                const newItem: FeedItem = {
                    id: Math.random().toString(36).substring(7),
                    event: eventName,
                    data,
                    timestamp: new Date()
                };

                setFeed(prev => [newItem, ...prev].slice(0, 10)); // Keep last 10
            } catch (err) {
                console.error("Feed error:", err);
            }
        };

        return () => eventSource.close();
    }, []);

    const getEventLabel = (event: string) => {
        switch (event) {
            case SystemEvent.ORDER_CREATED: return "Nouvelle Commande";
            case SystemEvent.ORDER_PAID: return "Commande Payée";
            case SystemEvent.DEBT_PAYMENT_RECORDED: return "Paiement Dette";
            case SystemEvent.ORDER_PRINTED: return "Impression Ticket";
            case "connected": return "Connecté";
            default: return event;
        }
    };

    const getEventColor = (event: string): any => {
        if (event.includes("created")) return "success";
        if (event.includes("paid")) return "primary";
        if (event.includes("payment")) return "warning";
        if (event.includes("printed")) return "secondary";
        return "default";
    };

    return (
        <Card className="bg-[#1a1614] border-[#2d2622] h-full shadow-xl">
            <CardHeader className="flex justify-between items-center px-6 pt-6">
                <div className="flex items-center gap-2">
                    <Activity className="size-4 text-[var(--primary)]" />
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Activité en Direct</h3>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/5 border border-white/10">
                    <div className={`size-1.5 rounded-full ${isConnected ? "bg-green-500 animate-pulse" : "bg-slate-500"}`} />
                    <span className="text-[9px] font-black text-slate-400 uppercase">{isConnected ? "Live" : "Offline"}</span>
                </div>
            </CardHeader>
            <CardBody className="px-6 pb-6">
                {feed.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-slate-500 gap-2">
                        <Clock className="size-8 opacity-20" />
                        <p className="text-xs font-medium italic">En attente d&apos;événements...</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {feed.map((item) => (
                            <div key={item.id} className="flex items-start gap-3 group">
                                <div className="mt-1">
                                    <div className={`size-2 rounded-full mt-1.5 ${item.event === SystemEvent.ORDER_CREATED ? "bg-green-500" :
                                        item.event === SystemEvent.ORDER_PAID ? "bg-blue-500" :
                                            "bg-[var(--primary)]"
                                        }`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-xs font-bold text-white truncate">
                                            {getEventLabel(item.event)}
                                        </p>
                                        <span className="text-[10px] font-mono text-slate-500 whitespace-nowrap">
                                            {item.timestamp.toLocaleTimeString()}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <p className="text-[11px] text-slate-400 truncate">
                                            {item.data.clientName || item.data.orderNumber || "Action système"}
                                        </p>
                                        {item.data.amount && (
                                            <Chip size="sm" variant="flat" color="warning" className="h-4 text-[9px] font-bold">
                                                {item.data.amount} DA
                                            </Chip>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardBody>
        </Card>
    );
};
