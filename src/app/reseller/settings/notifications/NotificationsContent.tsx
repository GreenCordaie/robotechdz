"use client";

import React, { useEffect, useState } from "react";
import { Spinner, Switch } from "@heroui/react";
import { Bell, MessageCircle } from "lucide-react";
import { toast } from "react-hot-toast";
import {
    getResellerNotifPrefsAction,
    updateResellerNotifPrefAction,
} from "./actions";

interface PrefRow {
    eventKey: string;
    label: string;
    enabled: boolean;
}

export default function NotificationsContent() {
    const [items, setItems] = useState<PrefRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [pending, setPending] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        const res = await getResellerNotifPrefsAction({});
        if (res.success) setItems(res.data as PrefRow[]);
        setLoading(false);
    };

    useEffect(() => {
        load();
    }, []);

    const handleToggle = async (eventKey: string, enabled: boolean) => {
        setPending(eventKey);
        // Optimistic update
        setItems((prev) =>
            prev.map((i) => (i.eventKey === eventKey ? { ...i, enabled } : i))
        );
        const res = await updateResellerNotifPrefAction({ eventKey: eventKey as never, enabled });
        if (!res.success) {
            toast.error(res.error || "Échec mise à jour");
            // Rollback
            setItems((prev) =>
                prev.map((i) => (i.eventKey === eventKey ? { ...i, enabled: !enabled } : i))
            );
        } else {
            toast.success(enabled ? "Notification activée" : "Notification désactivée");
        }
        setPending(null);
    };

    return (
        <div className="p-6 max-w-3xl mx-auto">
            <div className="flex items-center gap-3 mb-2">
                <Bell className="w-7 h-7 text-[var(--primary)]" />
                <h1 className="text-2xl font-bold">Notifications WhatsApp</h1>
            </div>
            <p className="text-sm text-gray-500 mb-6">
                Choisissez les events qui doivent vous être envoyés par WhatsApp.
                Les <a href="/reseller/webhooks" className="underline">webhooks sortants</a> ont leur propre filtre.
            </p>

            {loading ? (
                <div className="flex justify-center py-12">
                    <Spinner />
                </div>
            ) : (
                <div className="space-y-2">
                    {items.map((item) => (
                        <div
                            key={item.eventKey}
                            data-testid={`notif-pref-row-${item.eventKey}`}
                            className="bg-[#161616] border border-[#262626] rounded-2xl p-4 flex items-center justify-between gap-4"
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <MessageCircle className="w-5 h-5 text-green-500 shrink-0" />
                                <div className="min-w-0">
                                    <div className="font-medium text-slate-200 text-sm">
                                        {item.label}
                                    </div>
                                    <div className="text-xs text-slate-500 font-mono mt-0.5">
                                        {item.eventKey}
                                    </div>
                                </div>
                            </div>
                            <Switch
                                isSelected={item.enabled}
                                isDisabled={pending === item.eventKey}
                                onValueChange={(v) => handleToggle(item.eventKey, v)}
                                aria-label={`Toggle ${item.eventKey}`}
                                data-testid={`notif-pref-switch-${item.eventKey}`}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
