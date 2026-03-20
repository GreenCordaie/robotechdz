"use client";

import React, { useState, useEffect } from "react";
import {
    Link,
    RefreshCcw,
    Save,
    Zap,
    Brain,
    ShieldAlert,
    CircleDollarSign
} from "lucide-react";
import { Button, Spinner, Input, Textarea, Switch } from "@heroui/react";
import { toast } from "react-hot-toast";
import {
    getShopSettingsAction,
    saveShopSettingsAction,
    testN8nAction
} from "@/app/admin/settings/actions";

export function ApiBotSettings() {
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isTestingN8n, setIsTestingN8n] = useState(false);

    // Filtered Settings for n8n-first architecture
    const [n8nWebhookUrl, setN8nWebhookUrl] = useState("");
    const [chatbotEnabled, setChatbotEnabled] = useState(false);
    const [geminiKey, setGeminiKey] = useState("");
    const [chatbotRole, setChatbotRole] = useState("");
    const [usdRate, setUsdRate] = useState("245.00");

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        setIsLoading(true);
        try {
            const res: any = await getShopSettingsAction({});
            if (res.success && res.data) {
                const s = res.data;
                setChatbotEnabled(!!s.chatbotEnabled);
                setGeminiKey(s.geminiApiKey || "");
                setChatbotRole(s.chatbotRole || "");
                setUsdRate(s.usdExchangeRate || "245.00");
                setN8nWebhookUrl(s.n8nWebhookUrl || "");
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
            // We only update the relevant fields, but we should pass everything to avoid accidental wipes 
            // if the action expects a full object. However, let's stick to what we have in UI.
            const res: any = await saveShopSettingsAction({
                chatbotEnabled,
                geminiApiKey: geminiKey,
                chatbotRole,
                usdExchangeRate: usdRate,
                n8nWebhookUrl,
                shopName: "FLEXBOX DIRECT",
            } as any);

            if (res.success) {
                toast.success("Configuration mise à jour");
            } else {
                toast.error(res.error || "Erreur de sauvegarde");
            }
        } catch (err) {
            toast.error("Erreur de connexion");
        } finally {
            setIsSaving(false);
        }
    };

    const handleTestN8n = async () => {
        setIsTestingN8n(true);
        try {
            const res = await testN8nAction({});
            if (res.success) {
                toast.success(res.message || "Test n8n réussi !");
            } else {
                toast.error(res.error || "Échec du test n8n");
            }
        } catch (err) {
            toast.error("Erreur technique n8n");
        } finally {
            setIsTestingN8n(false);
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
            <div className="pt-8 space-y-16">
                {/* General & Currency Section */}
                <section className="space-y-8">
                    <div>
                        <h3 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                            <CircleDollarSign className="text-[#ec5b13]" size={24} />
                            Paramètres Généraux
                        </h3>
                        <p className="text-sm text-slate-400 mt-1">Configuration de base de la boutique.</p>
                    </div>

                    <div className="bg-[#1a1614] p-8 rounded-[32px] border border-white/5 shadow-2xl">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-[#ec5b13] ml-1">Taux de Change (USD ➔ DZD)</label>
                                <Input
                                    value={usdRate}
                                    onValueChange={setUsdRate}
                                    placeholder="245.00"
                                    variant="bordered"
                                    className="dark"
                                    startContent={<CircleDollarSign size={16} className="text-[#ec5b13]" />}
                                    endContent={<span className="text-[10px] font-black text-slate-500">DZD</span>}
                                />
                                <p className="text-[9px] text-slate-500 italic mt-1 ml-1">Utilisé pour les calculs de prix et marges.</p>
                            </div>
                        </div>
                        <div className="mt-6 pt-6 border-t border-white/5 flex justify-end">
                            <Button
                                onPress={handleSave}
                                isLoading={isSaving}
                                className="bg-[#ec5b13] text-white font-black uppercase tracking-widest text-[10px] px-10 py-6 rounded-2xl shadow-xl shadow-[#ec5b13]/20"
                                startContent={<Save size={14} />}
                            >
                                Enregistrer les Paramètres
                            </Button>
                        </div>
                    </div>
                </section>

                {/* n8n Automation Section */}
                <section className="space-y-8">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                                <Zap className="text-orange-500" size={24} />
                                Automation & Webhooks (n8n)
                            </h3>
                            <p className="text-sm text-slate-400 mt-1">Noyau d&apos;automatisation centralisé (WhatsApp, Telegram, Stocks).</p>
                        </div>
                        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full border border-orange-500/20 bg-orange-500/5 text-orange-500">
                            <span className="text-[10px] font-black uppercase tracking-widest">Actif</span>
                        </div>
                    </div>

                    <div className="space-y-6 bg-[#1a1614] p-8 rounded-[32px] border border-white/5 shadow-2xl">
                        <div className="grid grid-cols-1 gap-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">URL du Webhook n8n</label>
                                <Input
                                    value={n8nWebhookUrl}
                                    onValueChange={setN8nWebhookUrl}
                                    placeholder="https://n8n.votre-domaine.com/webhook/..."
                                    variant="bordered"
                                    className="dark"
                                    startContent={<Link size={16} className="text-slate-500" />}
                                />
                            </div>
                        </div>

                        <div className="pt-6 flex justify-start border-t border-white/5 gap-4">
                            <Button
                                onPress={handleTestN8n}
                                isLoading={isTestingN8n}
                                variant="flat"
                                className="bg-orange-500/10 text-orange-500 font-black uppercase tracking-widest text-[10px] px-8 py-6 rounded-2xl border border-orange-500/20"
                                startContent={<RefreshCcw size={14} />}
                            >
                                Tester le Webhook
                            </Button>
                        </div>
                    </div>
                </section>

                {/* Gemini AI Intelligence Section */}
                <section className="space-y-8">
                    <div className="pt-6 space-y-6">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="p-3 bg-purple-500/10 rounded-2xl">
                                <Brain size={24} className="text-purple-500" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-white uppercase tracking-tight">Intelligence Artificielle (Gemini)</h3>
                                <p className="text-sm text-slate-400 mt-1">Cerveau optionnel pour les interactions intelligentes.</p>
                            </div>
                        </div>

                        <div className="bg-[#1a1614] p-8 rounded-[32px] border border-white/5 shadow-2xl space-y-6">
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
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Instructions (Prompt)</label>
                                    <Textarea
                                        value={chatbotRole}
                                        onValueChange={setChatbotRole}
                                        placeholder="Tu es l'assistant de FLEXBOX..."
                                        variant="bordered"
                                        className="dark"
                                        minRows={3}
                                    />
                                </div>
                            </div>
                            <div className="pt-6 border-t border-white/5 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Statut du Chatbot</span>
                                    <Switch
                                        isSelected={chatbotEnabled}
                                        onValueChange={setChatbotEnabled}
                                        color="secondary"
                                        size="sm"
                                    />
                                </div>
                                <Button
                                    onPress={handleSave}
                                    isLoading={isSaving}
                                    className="bg-purple-600 text-white font-black uppercase tracking-widest text-[10px] px-10 py-6 rounded-2xl"
                                    startContent={<Save size={14} />}
                                >
                                    Sauvegarder IA
                                </Button>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
