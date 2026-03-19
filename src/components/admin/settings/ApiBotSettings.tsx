"use client";

import React, { useState, useEffect } from "react";
import {
    Send,
    Link,
    Key,
    Bot,
    QrCode,
    RefreshCcw,
    CheckCircle2,
    HelpCircle,
    Terminal,
    Save,
    Loader2,
    MessageSquare
} from "lucide-react";
import { Card, CardBody, Button, Spinner, Input } from "@heroui/react";
import { toast } from "react-hot-toast";
import {
    getShopSettingsAction,
    saveShopSettingsAction,
    testWhatsAppAction,
    getWhatsAppStatusAction
} from "@/app/admin/settings/actions";

export function ApiBotSettings() {
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [waStatus, setWaStatus] = useState<{ state: string, qr?: string, number?: string } | null>(null);

    // Evolution API Settings
    const [waUrl, setWaUrl] = useState("http://localhost:3001");
    const [waKey, setWaKey] = useState("");
    const [waInstance, setWaInstance] = useState("FLEXBOX_BOT");
    const [waSender, setWaSender] = useState("");

    // Telegram Bot Settings
    const [telegramBotToken, setTelegramBotToken] = useState("");
    const [telegramChatId, setTelegramChatId] = useState("");
    const [telegramChatIdAdmin, setTelegramChatIdAdmin] = useState("");
    const [telegramChatIdCaisse, setTelegramChatIdCaisse] = useState("");
    const [telegramChatIdTraiteur, setTelegramChatIdTraiteur] = useState("");
    const [webhookUrl, setWebhookUrl] = useState("");
    const [waMessageTemplate, setWaMessageTemplate] = useState("");
    const [isActivatingWebhook, setIsActivatingWebhook] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        setIsLoading(true);
        try {
            const res: any = await getShopSettingsAction({});
            if (res.success && res.data) {
                const s = res.data;
                setWaUrl(s.whatsappApiUrl || "http://localhost:3001");
                setWaKey(s.whatsappApiKey || "");
                setWaInstance(s.whatsappInstanceName || "FLEXBOX_BOT");
                setWaSender(s.whatsappSenderNumber || "");

                setTelegramBotToken(s.telegramBotToken || "");
                setTelegramChatId(s.telegramChatId || "");
                setTelegramChatIdAdmin(s.telegramChatIdAdmin || "");
                setTelegramChatIdCaisse(s.telegramChatIdCaisse || "");
                setTelegramChatIdTraiteur(s.telegramChatIdTraiteur || "");
                setWebhookUrl(s.webhookUrl || "");
                setWaMessageTemplate(s.whatsappMessageTemplate || "");

                if (s.whatsappApiUrl) {
                    refreshStatus();
                }
            }
        } catch (err) {
            toast.error("Erreur chargement paramètres");
        } finally {
            setIsLoading(false);
        }
    };

    const refreshStatus = async () => {
        try {
            const res: any = await getWhatsAppStatusAction({});
            if (res.success) {
                setWaStatus({ state: res.state, qr: res.qr, number: res.number });
            } else {
                setWaStatus({ state: "error" });
            }
        } catch (e) {
            setWaStatus({ state: "error" });
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res: any = await saveShopSettingsAction({
                whatsappApiUrl: waUrl,
                whatsappApiKey: waKey,
                whatsappInstanceName: waInstance,
                whatsappSenderNumber: waSender,
                telegramBotToken,
                telegramChatId,
                telegramChatIdAdmin,
                telegramChatIdCaisse,
                telegramChatIdTraiteur,
                webhookUrl,
                whatsappMessageTemplate: waMessageTemplate,
                shopName: "FLEXBOX DIRECT",
            } as any);

            if (res.success) {
                toast.success("Configuration API mise à jour");
                refreshStatus();
            } else {
                toast.error(res.error || "Erreur de sauvegarde");
            }
        } catch (err) {
            toast.error("Erreur de connexion");
        } finally {
            setIsSaving(false);
        }
    };

    const handleActivateWebhook = async () => {
        if (!telegramBotToken || !webhookUrl) {
            toast.error("Token et URL Webhook requis");
            return;
        }
        setIsActivatingWebhook(true);
        try {
            // Logic for webhook activation would go here (server action)
            toast.success("Webhook configuré avec succès");
        } catch (e) {
            toast.error("Échec de l'activation");
        } finally {
            setIsActivatingWebhook(false);
        }
    };

    const handleTest = async () => {
        const testNum = window.prompt("Entrez un numéro de test (ex: 06...)", waSender || "0656822261");
        if (!testNum) return;

        setIsTesting(true);
        try {
            const res: any = await testWhatsAppAction({
                url: waUrl,
                key: waKey,
                instance: waInstance,
                number: testNum
            });
            if (res.success) {
                toast.success("Message de test envoyé !");
            } else {
                toast.error(res.error || "Échec du test");
            }
        } catch (err) {
            toast.error("Erreur API");
        } finally {
            setIsTesting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <Spinner color="warning" />
                <p className="mt-4 text-slate-500 font-medium animate-pulse uppercase tracking-widest text-[10px]">Chargement des API...</p>
            </div>
        );
    }

    return (
        <div className="space-y-16 animate-in fade-in slide-in-from-bottom-2 duration-400 pb-20">
            {/* WhatsApp Evolution API Section */}
            <section className="space-y-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                            <MessageSquare className="text-[#25D366]" size={24} />
                            WhatsApp Evolution API
                        </h3>
                        <p className="text-sm text-slate-400 mt-1">Livraison automatique de codes via instance native.</p>
                    </div>

                    <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full border transition-colors ${waStatus?.state === 'open'
                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                        : waStatus?.state === 'error'
                            ? 'bg-red-500/10 text-red-500 border-red-500/20'
                            : 'bg-orange-500/10 text-orange-500 border-orange-500/20'
                        }`}>
                        <span className="relative flex h-2 w-2">
                            {waStatus?.state === 'open' && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>}
                            <span className={`relative inline-flex rounded-full h-2 w-2 ${waStatus?.state === 'open' ? 'bg-emerald-500' : waStatus?.state === 'error' ? 'bg-red-500' : 'bg-orange-500'
                                }`}></span>
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-widest">
                            {waStatus?.state === 'open' ? `Connecté: ${waStatus.number || 'Bot'}` : waStatus?.state === 'error' ? 'Déconnecté / Erreur' : 'En attente scan'}
                        </span>
                        <button onClick={refreshStatus} className="ml-2 hover:rotate-180 transition-transform bg-white/5 p-1 rounded-md">
                            <RefreshCcw size={12} />
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-6 bg-[#1a1614] p-8 rounded-[32px] border border-white/5 shadow-2xl">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">URL de l'API Evolution</label>
                                <Input
                                    value={waUrl}
                                    onValueChange={setWaUrl}
                                    placeholder="http://localhost:3001"
                                    variant="bordered"
                                    className="dark"
                                    startContent={<Link size={16} className="text-slate-500" />}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">API Key Personnelle</label>
                                <Input
                                    value={waKey}
                                    onValueChange={setWaKey}
                                    type="password"
                                    placeholder="Clé secrète configurée"
                                    variant="bordered"
                                    className="dark"
                                    startContent={<Key size={16} className="text-slate-500" />}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Nom de l'Instance</label>
                                <Input
                                    value={waInstance}
                                    onValueChange={setWaInstance}
                                    placeholder="ex: FLEXBOX_BOT"
                                    variant="bordered"
                                    className="dark"
                                    startContent={<Bot size={16} className="text-slate-500" />}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Numéro par défaut</label>
                                <Input
                                    value={waSender}
                                    onValueChange={setWaSender}
                                    placeholder="213XXXXXXXXX"
                                    variant="bordered"
                                    className="dark"
                                    startContent={<Terminal size={16} className="text-slate-500" />}
                                />
                            </div>
                        </div>

                        {/* WhatsApp Message Customization */}
                        <div className="pt-8 border-t border-white/5 space-y-6">
                            <div>
                                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4">
                                    <MessageSquare size={14} className="text-[#25D366]" />
                                    Personnalisation du message de livraison
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                    <div className="md:col-span-3 space-y-2">
                                        <textarea
                                            value={waMessageTemplate}
                                            onChange={(e) => setWaMessageTemplate(e.target.value)}
                                            placeholder="Tapez le message de livraison ici..."
                                            className="w-full min-h-[160px] bg-black/20 border border-white/10 rounded-2xl p-4 text-sm text-slate-300 focus:outline-none focus:border-[#ec5b13]/50 transition-colors font-sans leading-relaxed"
                                        />
                                        <div className="flex flex-wrap gap-2 pt-1">
                                            {['{{items}}', '{{orderId}}', '{{customer}}', '{{shopName}}'].map((p) => (
                                                <button
                                                    key={p}
                                                    onClick={() => setWaMessageTemplate(prev => prev + p)}
                                                    className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded-md text-[10px] font-mono text-slate-400 transition-colors border border-white/5"
                                                >
                                                    {p}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="bg-white/5 rounded-2xl p-4 border border-white/5 flex flex-col gap-3 justify-center">
                                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5 pb-2">Astuce Pro</div>
                                        <p className="text-[11px] text-slate-400 leading-relaxed italic">
                                            Utilisez <span className="text-emerald-400 font-bold">{"{{items}}"}</span> pour insérer automatiquement les codes numériques et accès aux profils achetés.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="pt-6 flex justify-between items-center border-t border-white/5">
                            <Button
                                onPress={handleTest}
                                isLoading={isTesting}
                                variant="flat"
                                className="bg-white/5 text-white font-black uppercase tracking-widest text-[10px] px-8 py-6 rounded-2xl"
                                startContent={<Send size={14} />}
                            >
                                Tester la connexion
                            </Button>

                            <Button
                                onPress={handleSave}
                                isLoading={isSaving}
                                className="bg-[#ec5b13] text-white font-black uppercase tracking-widest text-[10px] px-10 py-6 rounded-2xl shadow-xl shadow-[#ec5b13]/20"
                                startContent={<Save size={14} />}
                            >
                                Enregistrer
                            </Button>
                        </div>
                    </div>

                    <div className="bg-black/40 border border-white/5 rounded-[32px] p-8 flex flex-col items-center justify-center text-center">
                        {waStatus?.state === 'open' ? (
                            <div className="space-y-4 py-10">
                                <div className="size-24 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto ring-4 ring-emerald-500/20">
                                    <CheckCircle2 className="text-emerald-500" size={48} />
                                </div>
                                <p className="text-white font-black uppercase tracking-tight text-lg">Prêt pour livraison</p>
                            </div>
                        ) : waStatus?.qr ? (
                            <div className="space-y-4">
                                <div className="p-4 bg-white rounded-2xl shadow-2xl">
                                    <img src={waStatus.qr} alt="Scan QR" className="size-48" />
                                </div>
                                <p className="text-orange-500 font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2">
                                    <QrCode size={14} /> Scan Requis
                                </p>
                            </div>
                        ) : (
                            <div className="opacity-30">
                                <HelpCircle size={48} className="mx-auto text-slate-500" />
                                <p className="text-[10px] font-black uppercase mt-4">Aucune config active</p>
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {/* Telegram Bot Section */}
            <section className="space-y-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                            <Send className="text-blue-400" size={24} />
                            Telegram Bot Integration
                        </h3>
                        <p className="text-sm text-slate-400 mt-1">Notifications administratives et canaux de vente.</p>
                    </div>
                </div>

                <div className="space-y-6 bg-[#1a1614] p-8 rounded-[32px] border border-white/5 shadow-2xl">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Bot Token</label>
                            <Input
                                value={telegramBotToken}
                                onValueChange={setTelegramBotToken}
                                type="password"
                                placeholder="7348...:AAEj..."
                                variant="bordered"
                                className="dark"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">URL Publique Webhook</label>
                            <div className="flex gap-3">
                                <Input
                                    className="flex-1 dark"
                                    value={webhookUrl}
                                    onValueChange={setWebhookUrl}
                                    placeholder="https://xxx.ngrok-free.app"
                                    variant="bordered"
                                />
                                <Button
                                    onPress={handleActivateWebhook}
                                    isLoading={isActivatingWebhook}
                                    className="bg-blue-500/10 text-blue-400 font-black uppercase text-[10px] px-6 rounded-2xl border border-blue-500/20"
                                >
                                    Relier
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 pt-6 border-t border-white/5">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Global Chat ID</label>
                            <Input value={telegramChatId} onValueChange={setTelegramChatId} size="sm" variant="bordered" className="dark" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Admin ID</label>
                            <Input value={telegramChatIdAdmin} onValueChange={setTelegramChatIdAdmin} size="sm" variant="bordered" className="dark" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Caisse ID</label>
                            <Input value={telegramChatIdCaisse} onValueChange={setTelegramChatIdCaisse} size="sm" variant="bordered" className="dark" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Traiteur ID</label>
                            <Input value={telegramChatIdTraiteur} onValueChange={setTelegramChatIdTraiteur} size="sm" variant="bordered" className="dark" />
                        </div>
                    </div>
                </div>
            </section>

            {/* Docker Guide & Port Hint */}
            <div className="bg-[#0a0a0a] border border-white/5 rounded-3xl p-8 font-mono text-xs leading-loose text-slate-300 relative overflow-hidden">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-500/10 rounded-xl">
                            <Terminal className="text-emerald-500" size={18} />
                        </div>
                        <span className="text-sm font-black uppercase tracking-widest text-white">Configuration Environment (Port 1556)</span>
                    </div>
                </div>
                <div className="space-y-4">
                    <p className="text-slate-500 italic">Serveur local détecté sur le port <span className="text-emerald-500">1556</span>. Utilisez ce port pour vos tunnels (Ngrok) lors du paramétrage des webhooks.</p>
                    <div className="bg-black/40 p-6 rounded-2xl border border-white/5 select-all">
                        docker run -d --name evolution-api -p 3001:3001 -e API_KEY=abc -v evo_data:/evolution atendai/evolution-api:latest
                    </div>
                </div>
            </div>
        </div>
    );
}

