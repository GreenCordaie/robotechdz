"use client";

import React from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button, Card, CardBody } from "@heroui/react";
import { toast } from "react-hot-toast";
import { getPushPublicKeyAction, subscribeToPushAction } from "@/app/admin/push/actions";

export default function PushNotificationManager() {
    const [isSupported, setIsSupported] = React.useState(true);
    const [permission, setPermission] = React.useState<NotificationPermission>("default");
    const [isLoading, setIsLoading] = React.useState(false);

    React.useEffect(() => {
        if (typeof window !== "undefined") {
            const supported = "Notification" in window && "serviceWorker" in navigator;
            setIsSupported(supported);
            if (supported) {
                setPermission(Notification.permission);
            }
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

    const handleEnable = async () => {
        if (!isSupported) {
            toast.error("Notifications non supportées par ce navigateur");
            return;
        }

        setIsLoading(true);
        try {
            const status = await Notification.requestPermission();
            setPermission(status);

            if (status !== "granted") {
                toast.error("Permission refusée");
                setIsLoading(false);
                return;
            }

            // Get registration
            const registration = await navigator.serviceWorker.ready;

            // Get public key
            const keyRes = await getPushPublicKeyAction({});
            if (!keyRes.success || !keyRes.publicKey) {
                toast.error("Erreur récupération clé serveur");
                setIsLoading(false);
                return;
            }

            // Subscribe
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(keyRes.publicKey)
            });

            // Save to backend
            const subRes = await subscribeToPushAction({ subscription });
            if (subRes.success) {
                toast.success("Notifications activées !");
            } else {
                toast.error("Erreur lors de l'enregistrement");
            }
        } catch (error) {
            console.error("Push enable error:", error);
            toast.error("Échec de la configuration");
        } finally {
            setIsLoading(false);
        }
    };

    if (!isSupported) return null;

    return (
        <Card className="bg-[#161616] border border-white/5 rounded-[2rem] overflow-hidden shadow-2xl mt-6">
            <CardBody className="p-6 space-y-6">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-500/10 rounded-2xl">
                        <Bell className="text-blue-400 w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-tight">Alertes Mobiles</h3>
                        <p className="text-slate-500 text-[9px] font-bold uppercase tracking-wider mt-0.5">
                            {permission === "granted" ? "Service Actif" : "Notifications en temps réel"}
                        </p>
                    </div>
                </div>

                <div className="p-5 bg-black/40 rounded-2xl border border-white/5 text-center space-y-4">
                    <p className="text-slate-400 text-[11px] font-medium leading-relaxed italic">
                        &quot;Soyez alerté instantanément de chaque nouvelle commande, même si l&apos;application est fermée.&quot;
                    </p>

                    {permission === "granted" ? (
                        <div className="flex items-center justify-center gap-2 text-emerald-500 font-black uppercase text-[10px] bg-emerald-500/10 p-3 rounded-xl">
                            <Bell size={14} />
                            <span>Notifications activées sur cet appareil</span>
                        </div>
                    ) : (
                        <Button
                            onPress={handleEnable}
                            isLoading={isLoading}
                            className="bg-blue-600 text-white font-black uppercase tracking-widest text-[10px] py-4 px-8 rounded-xl w-full"
                        >
                            Activer les alertes
                        </Button>
                    )}
                </div>
            </CardBody>
        </Card>
    );
}
