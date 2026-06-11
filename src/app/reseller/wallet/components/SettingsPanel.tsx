"use client";

import React, { useState } from "react";
import { Button, Input, Spinner, Switch } from "@heroui/react";
import { AlertTriangle, Bell } from "lucide-react";
import { toast } from "react-hot-toast";
import { updateResellerLowBalanceThresholdAction } from "../../settings/notifications/actions";
import { updateResellerWalletNotificationPrefAction } from "../actions";
import type { OverviewData } from "./types";

export function SettingsPanel({
    data,
    onChanged,
}: {
    data: OverviewData;
    onChanged: () => void | Promise<void>;
}) {
    const [threshold, setThreshold] = useState<string>(
        data.lowBalanceThreshold !== null ? String(data.lowBalanceThreshold) : "",
    );
    const [savingThr, setSavingThr] = useState(false);
    const [walletRecharged, setWalletRecharged] = useState(
        data.notificationPreferences.walletRecharged,
    );
    const [walletLowBalance, setWalletLowBalance] = useState(
        data.notificationPreferences.walletLowBalance,
    );

    const saveThreshold = async () => {
        const num = threshold.trim() === "" ? null : Math.round(parseFloat(threshold));
        if (num !== null && (!Number.isFinite(num) || num < 0)) {
            toast.error("Seuil invalide");
            return;
        }
        setSavingThr(true);
        const res = await updateResellerLowBalanceThresholdAction({ threshold: num });
        setSavingThr(false);
        if (res.success) {
            toast.success(num === null ? "Alerte désactivée" : "Seuil sauvegardé");
            onChanged();
        } else {
            toast.error("Erreur sauvegarde");
        }
    };

    const togglePref = async (
        key: "wallet.recharged" | "wallet.low_balance",
        next: boolean,
    ) => {
        if (key === "wallet.recharged") setWalletRecharged(next);
        else setWalletLowBalance(next);
        const res = await updateResellerWalletNotificationPrefAction({
            eventKey: key,
            enabled: next,
        });
        if (!res.success) {
            toast.error("Erreur sauvegarde notification");
            if (key === "wallet.recharged") setWalletRecharged(!next);
            else setWalletLowBalance(!next);
        }
    };

    return (
        <div className="space-y-6" data-testid="wallet-settings-panel">
            <div className="bg-[#161616] border border-[#262626] rounded-[28px] p-6 space-y-4">
                <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                    <AlertTriangle size={16} className="text-amber-400" />
                    Alerte solde bas
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                    Vous recevez une notification WhatsApp lorsque votre solde passe sous ce
                    seuil. Laissez vide ou 0 pour désactiver.
                </p>
                <div className="flex items-end gap-3">
                    <Input
                        type="number"
                        min={0}
                        label="Seuil (DZD)"
                        placeholder="Ex: 5000"
                        value={threshold}
                        onChange={(e) => setThreshold(e.target.value)}
                        className="flex-1"
                        data-testid="wallet-low-threshold-input"
                    />
                    <Button
                        onPress={saveThreshold}
                        isDisabled={savingThr}
                        className="bg-[var(--primary)] text-white font-black h-14"
                        data-testid="wallet-low-threshold-save"
                    >
                        {savingThr ? <Spinner size="sm" color="white" /> : "Sauvegarder"}
                    </Button>
                </div>
            </div>

            <div className="bg-[#161616] border border-[#262626] rounded-[28px] p-6 space-y-4">
                <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                    <Bell size={16} className="text-[var(--primary)]" />
                    Notifications WhatsApp
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                    Mêmes préférences que dans{" "}
                    <span className="text-slate-300 font-bold">
                        Paramètres → Notifications
                    </span>{" "}
                    — synchronisées.
                </p>

                <PrefRow
                    label="Recharge wallet confirmée"
                    description="Vous recevez un WhatsApp à chaque crédit de votre wallet."
                    checked={walletRecharged}
                    onChange={(v) => togglePref("wallet.recharged", v)}
                    testId="pref-wallet-recharged"
                />
                <PrefRow
                    label="Alerte solde bas"
                    description="Vous recevez un WhatsApp lorsque le solde passe sous le seuil défini ci-dessus."
                    checked={walletLowBalance}
                    onChange={(v) => togglePref("wallet.low_balance", v)}
                    testId="pref-wallet-low-balance"
                />
            </div>
        </div>
    );
}

function PrefRow({
    label,
    description,
    checked,
    onChange,
    testId,
}: {
    label: string;
    description: string;
    checked: boolean;
    onChange: (v: boolean) => void;
    testId?: string;
}) {
    return (
        <div
            className="flex items-start justify-between gap-4 pt-4 border-t border-white/5"
            data-testid={testId}
        >
            <div className="min-w-0">
                <p className="text-sm font-bold text-white">{label}</p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{description}</p>
            </div>
            <Switch isSelected={checked} onValueChange={onChange} color="warning" />
        </div>
    );
}
