"use client";

import React from "react";
import { Bell, BellOff, BellRing, Check } from "lucide-react";
import { Card, CardBody, Switch } from "@heroui/react";
import { toast } from "react-hot-toast";
import { getPushPublicKeyAction, subscribeToPushAction } from "@/app/admin/push/actions";

export default function PushNotificationManager() {
    const [isSupported, setIsSupported] = React.useState(true);
    const [permission, setPermission] = React.useState<NotificationPermission>("default");
    const [isSubscribed, setIsSubscribed] = React.useState(false);
    const [isLoading, setIsLoading] = React.useState(false);

    React.useEffect(() => {
        if (typeof window === "undefined") return;

        const supported = "Notification" in window && "serviceWorker" in navigator;
        setIsSupported(supported);

        if (supported) {
            setPermission(Notification.permission);

            // Check if already subscribed
            navigator.serviceWorker.ready.then(async (reg) => {
                const sub = await reg.pushManager.getSubscription();
                setIsSubscribed(!!sub);
            });
        }
    }, []);

    const urlBase64ToUint8Array = (base64String: string) => {
        const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    };

    const handleToggle = async (enabled: boolean) => {
        if (!isSupported) {
            toast.error("Notifications non supportées par ce navigateur");
            return;
        }

        setIsLoading(true);

        if (enabled) {
            try {
                const status = await Notification.requestPermission();
                setPermission(status);

                if (status !== "granted") {
                    toast.error("Permission refusée par le navigateur");
                    setIsLoading(false);
                    return;
                }

                const registration = await navigator.serviceWorker.ready;
                const keyRes = await getPushPublicKeyAction({});
                if (!keyRes.success || !keyRes.publicKey) {
                    toast.error("Erreur serveur");
                    setIsLoading(false);
                    return;
                }

                const subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(keyRes.publicKey),
                });

                const subRes = await subscribeToPushAction({ subscription });
                if (subRes && (subRes as { success?: boolean }).success) {
                    setIsSubscribed(true);
                    toast.success("Notifications activées !");
                }
            } catch (error) {
                toast.error("Erreur lors de l'activation");
            }
        } else {
            try {
                const registration = await navigator.serviceWorker.ready;
                const sub = await registration.pushManager.getSubscription();
                if (sub) {
                    await sub.unsubscribe();
                }
                setIsSubscribed(false);
                toast.success("Notifications désactivées");
            } catch {
                toast.error("Erreur lors de la désactivation");
            }
        }

        setIsLoading(false);
    };

    if (!isSupported) return null;

    const isActive = permission === "granted" && isSubscribed;

    return (
        <Card className="bg-[#161616] border border-white/5 rounded-[2rem] overflow-hidden shadow-2xl mt-6">
            <CardBody className="p-6 space-y-5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-2xl ${isActive ? 'bg-emerald-500/10' : 'bg-blue-500/10'}`}>
                            {isActive ? <BellRing className="text-emerald-400 w-5 h-5" /> : <Bell className="text-blue-400 w-5 h-5" />}
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-white uppercase tracking-tight">Notifications Push</h3>
                            <p className="text-slate-500 text-[9px] font-bold uppercase tracking-wider mt-0.5">
                                {isActive ? "Actif sur cet appareil" : "Recevez les alertes en temps réel"}
                            </p>
                        </div>
                    </div>

                    <Switch
                        isSelected={isActive}
                        isDisabled={isLoading}
                        onValueChange={handleToggle}
                        size="sm"
                        color="success"
                    />
                </div>

                {isActive && (
                    <div className="space-y-2 bg-black/30 rounded-2xl p-4 border border-white/5">
                        <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-3">Vous serez notifié pour :</p>
                        {[
                            "Nouvelles commandes",
                            "Commandes payées",
                            "Alertes stock faible",
                            "Tickets support",
                            "Messages WhatsApp",
                        ].map((label) => (
                            <div key={label} className="flex items-center gap-2">
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                                <span className="text-[11px] text-slate-300">{label}</span>
                            </div>
                        ))}
                    </div>
                )}

                {permission === "denied" && (
                    <div className="flex items-center gap-2 text-red-400 bg-red-500/10 p-3 rounded-xl">
                        <BellOff size={14} />
                        <span className="text-[10px] font-bold uppercase">Bloqué par le navigateur — autorisez dans les paramètres du site</span>
                    </div>
                )}
            </CardBody>
        </Card>
    );
}
