"use client";

import React, { useEffect, useState } from "react";
import { Spinner, Switch, Input, Button } from "@heroui/react";
import { Bell, MessageCircle, Wallet } from "lucide-react";
import { toast } from "react-hot-toast";
import {
    getResellerNotifPrefsAction,
    updateResellerNotifPrefAction,
    getResellerLowBalanceThresholdAction,
    updateResellerLowBalanceThresholdAction,
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
    const [threshold, setThreshold] = useState<string>("");
    const [thresholdSaving, setThresholdSaving] = useState(false);

    const load = async () => {
        setLoading(true);
        const [prefs, thr] = await Promise.all([
            getResellerNotifPrefsAction({}),
            getResellerLowBalanceThresholdAction({}),
        ]);
        if (prefs.success) setItems(prefs.data as PrefRow[]);
        if (thr.success) setThreshold(thr.data != null ? String(thr.data) : "");
        setLoading(false);
    };

    useEffect(() => {
        load();
    }, []);

    const handleSaveThreshold = async () => {
        const trimmed = threshold.trim();
        const value = trimmed === "" ? null : Number(trimmed);
        if (value != null && (!Number.isFinite(value) || value < 0)) {
            toast.error("Seuil invalide");
            return;
        }
        setThresholdSaving(true);
        const res = await updateResellerLowBalanceThresholdAction({ threshold: value });
        if (res.success) {
            toast.success(value ? "Seuil enregistré" : "Alerte solde bas désactivée");
        } else {
            toast.error(res.error || "Échec mise à jour");
        }
        setThresholdSaving(false);
    };

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

            {!loading && (
                <div className="mt-6 bg-[#161616] border border-[#262626] rounded-2xl p-4">
                    <div className="flex items-center gap-3 mb-3">
                        <Wallet className="w-5 h-5 text-amber-500 shrink-0" />
                        <div className="min-w-0">
                            <div className="font-medium text-slate-200 text-sm">Alerte solde bas</div>
                            <div className="text-xs text-slate-500 mt-0.5">
                                Recevez un WhatsApp quand votre solde passe sous ce montant. Laissez vide pour désactiver.
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <Input
                            type="number"
                            value={threshold}
                            onValueChange={setThreshold}
                            placeholder="ex: 5000"
                            min={0}
                            endContent={<span className="text-xs text-slate-500">DZD</span>}
                            className="max-w-[220px]"
                            aria-label="Seuil d'alerte solde bas (DZD)"
                            data-testid="low-balance-threshold-input"
                        />
                        <Button
                            color="primary"
                            isLoading={thresholdSaving}
                            onPress={handleSaveThreshold}
                            data-testid="low-balance-threshold-save"
                        >
                            Enregistrer
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
