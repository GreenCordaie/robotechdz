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
    MessageSquare,
    Zap,
    Brain,
    ShieldAlert,
    ShieldCheck,
    Info,
    Smartphone,
    Globe
} from "lucide-react";
import { Card, CardBody, Button, Spinner, Input, Textarea, Switch } from "@heroui/react";
import { toast } from "react-hot-toast";
import {
    getShopSettingsAction,
    saveShopSettingsAction,
    testWhatsAppAction,
    getWhatsAppFaqsAction,
    upsertWhatsAppFaqAction,
    deleteWhatsAppFaqAction,
    activateTelegramWebhookAction
} from "@/app/admin/settings/actions";
import { Tabs, Tab } from "@heroui/react";

export function ApiBotSettings() {
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isTesting, setIsTesting] = useState(false);

    // Evolution API Settings
    const [whatsappApiUrl, setWhatsappApiUrl] = useState("");
    const [whatsappApiKey, setWhatsappApiKey] = useState("");
    const [whatsappInstanceName, setWhatsappInstanceName] = useState("");
    const [waSender, setWaSender] = useState("");
    const [waWebhookUrl, setWaWebhookUrl] = useState("");
    const [waVerifyToken, setWaVerifyToken] = useState("");

    // Telegram Bot Settings
    const [telegramBotToken, setTelegramBotToken] = useState("");
    const [telegramChatId, setTelegramChatId] = useState("");
    const [telegramChatIdAdmin, setTelegramChatIdAdmin] = useState("");
    const [telegramChatIdCaisse, setTelegramChatIdCaisse] = useState("");
    const [telegramChatIdTraiteur, setTelegramChatIdTraiteur] = useState("");
    const [webhookUrl, setWebhookUrl] = useState("");
    const [waMessageTemplate, setWaMessageTemplate] = useState("");
    const [chatbotEnabled, setChatbotEnabled] = useState(false);
    const [chatbotGreeting, setChatbotGreeting] = useState("");
    const [geminiKey, setGeminiKey] = useState("");
    const [chatbotRole, setChatbotRole] = useState("");
    const [isActivatingWebhook, setIsActivatingWebhook] = useState(false);

    // FAQ State
    const [faqs, setFaqs] = useState<any[]>([]);
    const [isFaqLoading, setIsFaqLoading] = useState(false);
    const [newFaq, setNewFaq] = useState({ question: "", answer: "" });
    const [isAddingFaq, setIsAddingFaq] = useState(false);

    useEffect(() => {
        loadSettings();
        loadFaqs();
    }, []);

    const loadFaqs = async () => {
        setIsFaqLoading(true);
        const res = await getWhatsAppFaqsAction({});
        if (res.success) setFaqs(res.data as any[]);
        setIsFaqLoading(false);
    };

    const handleAddFaq = async () => {
        if (!newFaq.question || !newFaq.answer) {
            toast.error("Veuillez remplir les deux champs");
            return;
        }
        setIsAddingFaq(true);
        const res = await upsertWhatsAppFaqAction(newFaq);
        if (res.success) {
            toast.success("FAQ ajoutée !");
            setNewFaq({ question: "", answer: "" });
            loadFaqs();
        } else {
            toast.error("Erreur lors de l'ajout");
        }
        setIsAddingFaq(false);
    };

    const handleDeleteFaq = async (id: number) => {
        if (!confirm("Supprimer cette réponse ?")) return;
        const res = await deleteWhatsAppFaqAction({ id });
        if (res.success) {
            toast.success("Supprimé");
            loadFaqs();
        }
    };

    const loadSettings = async () => {
        setIsLoading(true);
        try {
            const res: any = await getShopSettingsAction({});
            if (res.success && res.data) {
                const s = res.data;
                setWhatsappApiUrl(s.whatsappApiUrl || "http://localhost:3001");
                setWhatsappApiKey(s.whatsappApiKey || "");
                setWhatsappInstanceName(s.whatsappInstanceName || "FLEXBOX_BOT");
                setWaSender(s.whatsappSenderNumber || "");
                setWaWebhookUrl(s.whatsappWebhookUrl || "");
                setWaVerifyToken(s.whatsappVerifyToken || "flexbox_direct_webhook_secret");

                setTelegramBotToken(s.telegramBotToken || "");
                setTelegramChatId(s.telegramChatId || "");
                setTelegramChatIdAdmin(s.telegramChatIdAdmin || "");
                setTelegramChatIdCaisse(s.telegramChatIdCaisse || "");
                setTelegramChatIdTraiteur(s.telegramChatIdTraiteur || "");
                setWebhookUrl(s.webhookUrl || "");
                setWaMessageTemplate(s.whatsappMessageTemplate || "");
                setChatbotEnabled(!!s.chatbotEnabled);
                setChatbotGreeting(s.chatbotGreeting || "");
                setGeminiKey(s.geminiApiKey || "");
                setChatbotRole(s.chatbotRole || "");
            }
        } catch (err) {
            toast.error("Erreur chargement paramètres");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res: any = await saveShopSettingsAction({
                whatsappApiUrl,
                whatsappApiKey,
                whatsappInstanceName,
                whatsappSenderNumber: waSender,
                whatsappWebhookUrl: waWebhookUrl,
                whatsappVerifyToken: waVerifyToken,
                telegramBotToken,
                telegramChatId,
                telegramChatIdAdmin,
                telegramChatIdCaisse,
                telegramChatIdTraiteur,
                webhookUrl,
                whatsappMessageTemplate: waMessageTemplate,
                chatbotEnabled,
                chatbotGreeting,
                geminiApiKey: geminiKey,
                chatbotRole,
                shopName: "FLEXBOX DIRECT",
            } as any);

            if (res.success) {
                toast.success("Configuration API mise à jour");
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
            const res = await activateTelegramWebhookAction({ token: telegramBotToken, url: webhookUrl });
            if (res.success) {
                toast.success("Webhook Telegram activé avec succès !");
            } else {
                toast.error(res.error || "Échec de l'activation");
            }
        } catch (e) {
            toast.error("Erreur lors de la configuration du Webhook");
        } finally {
            setIsActivatingWebhook(false);
        }
    };

    const handleTest = async () => {
        const testNum = window.prompt("Entrez un numéro de test avec indicatif (ex: 33754027162)", waSender || "");
        if (!testNum) return;

        setIsTesting(true);
        try {
            const res: any = await testWhatsAppAction({
                number: testNum
            });
            if (res.success) {
                toast.success("Message via Evolution envoyé !");
            } else {
                toast.error(res.error || "Échec du test Evolution");
            }
        } catch (err) {
            toast.error("Erreur API Evolution");
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
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-400 pb-20">
            <Tabs
                aria-label="Options IA & Bot"
                color="warning"
                variant="underlined"
                classNames={{
                    tabList: "gap-6 w-full relative rounded-none border-b border-white/5",
                    cursor: "w-full bg-[#ec5b13]",
                    tab: "max-w-fit px-0 h-12",
                    tabContent: "group-data-[selected=true]:text-[#ec5b13] font-black uppercase text-[10px] tracking-widest"
                }}
            >
                <Tab
                    key="config"
                    title={
                        <div className="flex items-center gap-2">
                            <Zap size={14} />
                            <span>Configuration API</span>
                        </div>
                    }
                >
                    <div className="pt-8 space-y-16">
                        {/* WhatsApp Meta Cloud API Section */}
                        <section className="space-y-8">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                                        <MessageSquare className="text-[#25D366]" size={24} />
                                        Evolution API (Moteur Actuel)
                                    </h3>
                                    <p className="text-sm text-slate-400 mt-1">Connexion flexible via votre propre instance Evolution API.</p>
                                </div>

                                <div className="flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#25D366]/20 bg-[#25D366]/5 text-[#25D366]">
                                    <span className="text-[10px] font-black uppercase tracking-widest">Connecté</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-1 gap-8">
                                <div className="space-y-6 bg-[#1a1614] p-8 rounded-[32px] border border-white/5 shadow-2xl">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">URL API Evolution</label>
                                            <Input
                                                value={whatsappApiUrl}
                                                onValueChange={setWhatsappApiUrl}
                                                placeholder="http://votre-ip:3001"
                                                variant="bordered"
                                                className="dark"
                                                startContent={<Globe size={16} className="text-slate-500" />}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Nom de l'Instance</label>
                                            <Input
                                                value={whatsappInstanceName}
                                                onValueChange={setWhatsappInstanceName}
                                                placeholder="FLEXBOX_BOT"
                                                variant="bordered"
                                                className="dark"
                                                startContent={<Bot size={16} className="text-slate-500" />}
                                            />
                                        </div>
                                        <div className="space-y-2 md:col-span-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Clé API (apikey)</label>
                                            <Input
                                                value={whatsappApiKey}
                                                onValueChange={setWhatsappApiKey}
                                                type="password"
                                                placeholder="Saisissez votre apikey Evolution..."
                                                variant="bordered"
                                                className="dark"
                                                startContent={<ShieldCheck size={16} className="text-slate-500" />}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Numéro par défaut (Réception Test)</label>
                                            <Input
                                                value={waSender}
                                                onValueChange={setWaSender}
                                                placeholder="213XXXXXXXXX"
                                                variant="bordered"
                                                className="dark"
                                                startContent={<Terminal size={16} className="text-slate-500" />}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Token de Vérification (Webhook)</label>
                                            <Input
                                                value={waVerifyToken}
                                                onValueChange={setWaVerifyToken}
                                                placeholder="flexbox_secret..."
                                                variant="bordered"
                                                className="dark"
                                                startContent={<Key size={16} className="text-slate-500" />}
                                            />
                                        </div>

                                        <div className="space-y-4 md:col-span-2 p-6 bg-blue-500/5 border border-blue-500/10 rounded-3xl">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Globe size={14} className="text-blue-400" />
                                                <h4 className="text-[10px] font-black uppercase text-blue-400">Configuration du Webhook dans Evolution</h4>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className="space-y-2 text-[10px] text-slate-400">
                                                    <p>Réglez le Webhook dans Evolution vers :</p>
                                                    <code className="block bg-black/40 p-2 rounded border border-white/5 text-blue-300">
                                                        {typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/whatsapp` : ''}
                                                    </code>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[9px] text-slate-500 font-bold uppercase ml-1">URL Callback (Tunnel actuel)</label>
                                                    <Input
                                                        value={waWebhookUrl}
                                                        onValueChange={setWaWebhookUrl}
                                                        placeholder="Lien auto..."
                                                        variant="bordered"
                                                        size="sm"
                                                        className="dark"
                                                        startContent={<Zap size={14} className="text-blue-500" />}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Gemini AI Intelligence Section */}
                                    <div className="pt-6 border-t border-slate-800 space-y-6">
                                        <div className="flex items-center gap-2 mb-4">
                                            <div className="p-2 bg-purple-500/10 rounded-lg">
                                                <Brain size={18} className="text-purple-500" />
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-bold text-slate-200">Intelligence Artificielle (Google Gemini)</h3>
                                                <p className="text-[10px] text-slate-500">Transformez votre bot en assistant SAV autonome</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Clé API Google Gemini</label>
                                                <Input
                                                    type="password"
                                                    value={geminiKey}
                                                    onValueChange={setGeminiKey}
                                                    placeholder="AIzaSy..."
                                                    variant="bordered"
                                                    className="dark"
                                                    startContent={<ShieldAlert size={16} className="text-purple-500" />}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Rôle / Instructions du Bot (Prompt)</label>
                                                <Textarea
                                                    value={chatbotRole}
                                                    onValueChange={setChatbotRole}
                                                    placeholder="Tu es l'assistant de FLEXBOX DIRECT..."
                                                    variant="bordered"
                                                    className="dark"
                                                    minRows={3}
                                                />
                                            </div>
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
                                                                type="button"
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

                                    {/* Chatbot Configuration */}
                                    <div className="pt-8 border-t border-white/5 space-y-6">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                <Bot size={14} className="text-blue-400" />
                                                Chatbot Interactif (Auto-Réponse)
                                            </h4>
                                            <Button
                                                size="sm"
                                                onPress={() => setChatbotEnabled(!chatbotEnabled)}
                                                className={`font-black uppercase text-[9px] px-4 rounded-full border transition-all ${chatbotEnabled
                                                    ? 'bg-blue-500/20 text-blue-400 border-blue-500/30 ring-4 ring-blue-500/5'
                                                    : 'bg-white/5 text-slate-500 border-white/10'
                                                    }`}
                                            >
                                                {chatbotEnabled ? 'Désactiver le Bot' : 'Activer le Bot'}
                                            </Button>
                                        </div>

                                        {chatbotEnabled && (
                                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 animate-in zoom-in-95 duration-300">
                                                <div className="md:col-span-3 space-y-2">
                                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Message d'accueil & Menu</label>
                                                    <textarea
                                                        value={chatbotGreeting}
                                                        onChange={(e) => setChatbotGreeting(e.target.value)}
                                                        placeholder="Ex: 👋 Bonjour ! Que souhaitez-vous faire ? 1. Solde..."
                                                        className="w-full min-h-[120px] bg-black/40 border border-white/10 rounded-2xl p-4 text-sm text-slate-300 focus:outline-none focus:border-blue-400/50 transition-colors font-sans leading-relaxed"
                                                    />
                                                    <p className="text-[9px] text-slate-500 italic mt-1 ml-1">
                                                        Note: Le bot traitera automatiquement les réponses "1", "2" et "3".
                                                    </p>
                                                </div>
                                                <div className="bg-blue-500/5 rounded-2xl p-4 border border-blue-500/10 flex flex-col gap-2 justify-center">
                                                    <div className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Logic Bot v1.5 (Cloud)</div>
                                                    <ul className="text-[10px] text-slate-400 space-y-1.5 list-disc pl-3">
                                                        <li><b className="text-slate-300">1</b>: Solde & Dette</li>
                                                        <li><b className="text-slate-300">2</b>: Dernières commandes</li>
                                                        <li><b className="text-slate-300">3</b>: Support technique</li>
                                                        <li><b className="text-slate-300">IA</b>: Chat naturel via Gemini</li>
                                                    </ul>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="pt-6 flex justify-between items-center border-t border-white/5">
                                        <Button
                                            onPress={handleTest}
                                            isLoading={isTesting}
                                            variant="flat"
                                            className="bg-white/5 text-white font-black uppercase tracking-widest text-[10px] px-8 py-6 rounded-2xl"
                                            startContent={<Send size={14} />}
                                        >
                                            Tester Evolution
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
                    </div>
                </Tab>

                <Tab
                    key="faq"
                    title={
                        <div className="flex items-center gap-2">
                            <HelpCircle size={14} />
                            <span>Réponses Prédéfinies (FAQ)</span>
                        </div>
                    }
                >
                    <div className="pt-8 space-y-8">
                        <section className="bg-[#1a1614] p-8 rounded-[32px] border border-white/5 shadow-2xl">
                            <div className="flex items-center gap-4 mb-8">
                                <div className="p-3 bg-[#ec5b13]/10 rounded-2xl">
                                    <MessageSquare size={24} className="text-[#ec5b13]" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-white uppercase tracking-tight">Gestionnaire FAQ WhatsApp</h3>
                                    <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest">Réponses instantanées sans IA</p>
                                </div>
                            </div>

                            {/* Add FAQ Form */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 bg-white/5 rounded-3xl border border-white/5 mb-10">
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black uppercase text-slate-500 ml-1">Question du client</label>
                                    <Input
                                        placeholder="Ex: Livraison ?"
                                        variant="bordered"
                                        size="sm"
                                        value={newFaq.question}
                                        onValueChange={(v) => setNewFaq({ ...newFaq, question: v })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black uppercase text-slate-500 ml-1">Votre réponse exacte</label>
                                    <Input
                                        placeholder="Ex: Nous livrons sous 24h..."
                                        variant="bordered"
                                        size="sm"
                                        value={newFaq.answer}
                                        onValueChange={(v) => setNewFaq({ ...newFaq, answer: v })}
                                    />
                                </div>
                                <div className="flex items-end">
                                    <Button
                                        className="w-full bg-[#ec5b13] text-white font-black uppercase text-[10px] h-12 rounded-xl"
                                        onPress={handleAddFaq}
                                        isLoading={isAddingFaq}
                                    >
                                        Ajouter la réponse
                                    </Button>
                                </div>
                            </div>

                            {/* FAQ List */}
                            <div className="space-y-4">
                                {isFaqLoading ? (
                                    <div className="flex justify-center py-10"><Spinner color="warning" /></div>
                                ) : faqs.length === 0 ? (
                                    <div className="text-center py-20 border-2 border-dashed border-white/5 rounded-[2rem]">
                                        <p className="text-slate-600 font-black uppercase text-[10px] tracking-[0.2em]">Aucune FAQ configurée</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-3">
                                        {faqs.map((faq) => (
                                            <div key={faq.id} className="flex flex-col md:flex-row md:items-center justify-between p-5 bg-black/40 border border-white/5 rounded-2xl hover:border-[#ec5b13]/30 transition-all gap-4">
                                                <div className="space-y-1">
                                                    <p className="text-[10px] font-black text-[#ec5b13] uppercase tracking-widest">{faq.question}</p>
                                                    <p className="text-sm text-slate-300 font-medium">{faq.answer}</p>
                                                </div>
                                                <Button
                                                    isIconOnly
                                                    size="sm"
                                                    variant="flat"
                                                    color="danger"
                                                    className="bg-red-500/10 text-red-500 rounded-xl"
                                                    onPress={() => handleDeleteFaq(faq.id)}
                                                >
                                                    <RefreshCcw size={14} className="rotate-45" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </section>

                        <div className="p-8 bg-blue-500/5 border border-blue-500/10 rounded-[32px] flex items-start gap-4">
                            <Brain size={20} className="text-blue-400 mt-1" />
                            <div className="space-y-2">
                                <h4 className="text-xs font-black text-blue-400 uppercase tracking-widest">Fonctionnement du moteur</h4>
                                <p className="text-[11px] text-slate-400 leading-relaxed">
                                    Le robot analyse chaque message entrant. S&apos;il trouve un mot clé correspondant à l&apos;une de vos questions dans la liste ci-dessus, il répondra instantanément le texte associé.
                                    <br /><br />
                                    <b>Important :</b> Si aucune réponse prédéfinie n&apos;est trouvée, le robot cherchera automatiquement dans votre catalogue de produits pour donner les prix ou proposera vos tutoriels vidéos. L&apos;IA Gemini n&apos;intervient qu&apos;en dernier recours.
                                </p>
                            </div>
                        </div>
                    </div>
                </Tab>
            </Tabs>
        </div>
    );
}
