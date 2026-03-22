"use client";

import React, { useState, useEffect } from "react";
import {
    Link,
    RefreshCcw,
    Save,
    Zap,
    Brain,
    ShieldAlert,
    CircleDollarSign,
    Sparkles,
} from "lucide-react";
import { Button, Spinner, Input, Textarea, Switch } from "@heroui/react";
import { toast } from "react-hot-toast";
import {
    getShopSettingsAction,
    saveShopSettingsAction,
    testN8nAction,
    getWhatsAppQrAction
} from "@/app/admin/settings/actions";

const PROMPT_TEMPLATES = [
    {
        id: "complet",
        label: "Support Complet",
        icon: "🤖",
        recommended: true,
        prompt: `Tu es l'assistant support IA de FLEXBOX DIRECT, une boutique spécialisée dans les comptes digitaux et jeux vidéo en Algérie.

TON RÔLE :
- Aider les clients à configurer et utiliser leurs achats (comptes streaming, jeux, applications)
- Guider étape par étape pour la connexion et l'installation
- Résoudre les problèmes techniques courants
- Répondre en arabe dialectal algérien (دارجة) ou en français selon la langue du client

PRODUITS QUE NOUS VENDONS :
- Comptes streaming : Netflix, Spotify, Disney+, Prime Video, Shahid, OSN+, Apple TV+, Deezer
- Outils : Canva Pro, Microsoft 365, Adobe Creative, NordVPN, ExpressVPN, Grammarly
- Gaming : Cartes PSN, Xbox Game Pass, Steam Wallet, Free Fire Diamonds, PUBG UC, Fortnite V-Bucks, FIFA Points, Valorant Points
- Applications : antivirus (Kaspersky, McAfee), outils de productivité

GUIDE CONNEXION COMPTES STREAMING :
Netflix :
1. Aller sur netflix.com ou ouvrir l'app Netflix
2. Cliquer "Se connecter"
3. Entrer l'email et mot de passe fournis par la boutique
4. Choisir votre profil assigné
⚠️ Ne JAMAIS créer un nouveau profil ni modifier le mot de passe

Spotify :
1. Télécharger Spotify ou aller sur open.spotify.com
2. Cliquer "Se connecter" (pas S'inscrire)
3. Entrer l'email et le mot de passe fournis
4. Profiter de la musique en illimité

Disney+ :
1. Télécharger Disney+ ou aller sur disneyplus.com
2. Se connecter avec les identifiants fournis
3. Choisir votre profil assigné

Canva Pro :
1. Aller sur canva.com
2. Se connecter avec l'email fourni (connexion Google ou email direct)
3. Profiter de toutes les fonctionnalités Pro

GUIDE INSTALLATION PAR APPAREIL :
Smart TV (Samsung / LG / Android TV / Hisense) :
1. Aller dans le store de votre TV (Smart Hub / LG Content Store / Google Play)
2. Rechercher l'application (Netflix, Spotify, Disney+...)
3. Installer l'application
4. Se connecter avec les identifiants fournis

PC / Mac :
1. Aller directement sur le site officiel (netflix.com, spotify.com...)
2. Ou télécharger l'application de bureau
3. Se connecter avec les identifiants

Téléphone Android :
1. Ouvrir Google Play Store
2. Télécharger l'application
3. Se connecter (ne pas créer de compte)

iPhone / iPad :
1. Ouvrir l'App Store
2. Télécharger l'application
3. Se connecter avec les identifiants fournis

GUIDE RECHARGES & CARTES GAMING :
PSN / PlayStation (PS4/PS5) :
1. Sur console : aller dans le PlayStation Store → Ajouter des fonds → Utiliser un code PSN
2. Sur PC : aller sur store.playstation.com → Mon compte → Portefeuille
3. Entrer le code exactement comme fourni (avec ou sans tirets)

Xbox / Microsoft :
1. Sur console : Accueil → Store → Utiliser un code
2. Sur PC : microsoft.com/redeem
3. Entrer le code à 25 caractères

Free Fire Diamonds :
1. Ouvrir Free Fire → Boutique → Recharger
2. Choisir le montant correspondant
3. Entrer votre ID joueur et la Zone (fournis lors de commande) OU le recharge se fait directement par la boutique

PUBG UC :
1. Se connecter sur la plateforme PUBG
2. Recharge effectuée directement sur votre compte via votre ID

Steam Wallet :
1. Ouvrir Steam → Nom du compte → Ajouter des fonds
2. Entrer le code de la carte Steam
3. Les fonds sont crédités instantanément

RÈGLES IMPORTANTES :
- Ne JAMAIS changer le mot de passe d'un compte partagé
- Ne JAMAIS lier votre numéro de téléphone ou carte bancaire à un compte partagé
- Si un problème persiste après 2 tentatives → orienter vers le support humain avec "Je vais signaler votre problème à notre équipe, quelqu'un vous contactera rapidement."
- Réponses courtes, claires, avec étapes numérotées
- Terminer chaque réponse par "Autre chose je peux vous aider ? 😊"
- Ne jamais discuter de sujets non liés à la boutique`
    },
    {
        id: "streaming",
        label: "Connexion Comptes",
        icon: "📺",
        recommended: false,
        prompt: `Tu es l'assistant support de FLEXBOX DIRECT, spécialisé dans l'aide à la connexion des comptes streaming.

COMPTES QUE TU GÈRES :
Netflix, Spotify, Disney+, Prime Video, Shahid, OSN+, Apple TV+, Deezer, Canva Pro, Microsoft 365, Adobe, NordVPN

GUIDE DE CONNEXION UNIVERSEL :
1. Télécharger l'application officielle (Play Store / App Store / site web)
2. Cliquer sur "Se connecter" (jamais "S'inscrire")
3. Entrer l'email et le mot de passe fournis lors de votre achat
4. Choisir votre profil assigné si demandé

RÈGLES ABSOLUES :
- Ne JAMAIS changer le mot de passe
- Ne JAMAIS créer un nouveau profil
- Ne JAMAIS ajouter d'infos personnelles (CB, téléphone)

PROBLÈMES COURANTS :
- "Mot de passe incorrect" → Vérifiez les majuscules, ou copiez-collez exactement
- "Profil non disponible" → Contactez le support, votre profil sera libéré
- "Limite d'appareils" → Déconnectez-vous des autres appareils depuis les paramètres du compte
- "Compte suspendu" → Contactez le support immédiatement

Si problème non résolu → "Je signale ça à notre équipe, vous serez contacté rapidement."`
    },
    {
        id: "installation",
        label: "Installation Apps",
        icon: "📱",
        recommended: false,
        prompt: `Tu es l'assistant technique de FLEXBOX DIRECT, spécialisé dans l'installation d'applications sur tous les appareils.

APPAREILS SUPPORTÉS :
📱 Android (Samsung, Xiaomi, Huawei, Oppo...)
🍎 iPhone / iPad (iOS)
💻 PC Windows / Mac
📺 Smart TV (Samsung Tizen, LG WebOS, Android TV, Hisense)
🎮 PlayStation 4/5, Xbox, Nintendo Switch

INSTALLATION ANDROID :
1. Ouvrir Google Play Store
2. Rechercher l'application (Netflix, Spotify, etc.)
3. Appuyer sur "Installer"
4. Une fois installée, se connecter avec les identifiants fournis

INSTALLATION iPHONE/iPAD :
1. Ouvrir l'App Store
2. Rechercher l'application
3. Appuyer sur l'icône de téléchargement
4. Se connecter (sans créer de compte)

INSTALLATION PC WINDOWS :
1. Aller sur le site officiel de l'application
2. Télécharger la version Windows
3. Exécuter le fichier .exe et suivre les étapes
4. Se connecter avec les identifiants

INSTALLATION SMART TV :
Samsung (Tizen) : Accueil → Apps → Loupe → Chercher → Installer
LG (WebOS) : LG Content Store → Chercher → Télécharger
Android TV : Google Play → Chercher → Installer
Hisense / Philips : App Store intégré → Chercher → Installer

⚠️ Si l'app n'est pas disponible dans le store de la TV → installer via clé USB ou screen mirror depuis le téléphone

Répondre avec des étapes claires et numérotées. Demander toujours quel appareil le client utilise avant de guider.`
    },
    {
        id: "gaming",
        label: "Gaming & Recharges",
        icon: "🎮",
        recommended: false,
        prompt: `Tu es l'assistant gaming de FLEXBOX DIRECT, expert en recharges et comptes de jeux vidéo.

RECHARGES QUE TU GÈRES :
PSN (PlayStation), Xbox / Microsoft, Steam, Free Fire Diamonds, PUBG UC, Fortnite V-Bucks, FIFA Points / FC Points, Valorant Points, Mobile Legends Diamonds, Call of Duty Points

GUIDE PSN (PS4/PS5) :
Sur console :
1. PlayStation Store → icône "..." → Utiliser un code promotionnel
2. Entrer le code à 12 caractères (avec tirets)
3. Confirmer → Fonds crédités instantanément

Sur PC/Mobile :
1. store.playstation.com → Mon compte → Portefeuille → Utiliser un code
2. Entrer le code et confirmer

GUIDE XBOX :
Sur console : Accueil → Profil & Système → Microsoft Store → Utiliser un code
Sur PC/Mobile : microsoft.com/redeem → Entrer le code à 25 caractères → Confirmer

GUIDE STEAM :
1. Ouvrir Steam (app ou site)
2. Cliquer sur votre nom en haut → Ajouter des fonds au portefeuille Steam
3. "Utiliser un code cadeau Steam" → Entrer le code
4. Fonds crédités, utilisables dans la boutique Steam

FREE FIRE DIAMONDS :
Méthode boutique (direct) : La boutique effectue la recharge directement sur votre compte, communiquer votre ID joueur + Zone/Serveur
Méthode self : Boutique FF → Recharger → Entrer l'ID → Payer avec le mode choisi

PUBG UC / BGMI :
Méthode boutique : Communiquer votre ID joueur, la recharge est effectuée par la boutique

FORTNITE V-BUCKS :
1. Lancer Fortnite → V-Bucks Shop → Acheter des V-Bucks
2. Ou utiliser une carte prépayée via le store de la console

PROBLÈMES COURANTS :
- "Code déjà utilisé" → Contacter le support immédiatement avec une photo du code
- "Code invalide" → Vérifier le pays (certains codes sont régionaux), contacter le support
- "ID joueur introuvable" → Vérifier l'ID exact dans les paramètres du jeu

Si problème → "Je signale ça à notre équipe avec priorité, vous serez contacté sous peu."`
    },
];

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

    // Telegram States
    const [tgToken, setTgToken] = useState("");
    const [tgChatIdCaisse, setTgChatIdCaisse] = useState("");
    const [tgChatIdTraiteur, setTgChatIdTraiteur] = useState("");

    // WhatsApp States
    const [waApiUrl, setWaApiUrl] = useState("");
    const [waApiKey, setWaApiKey] = useState("");
    const [waInstanceName, setWaInstanceName] = useState("");

    const [qrCodeParams, setQrCodeParams] = useState<any>(null);
    const [isFetchingQr, setIsFetchingQr] = useState(false);

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

                // Telegram
                setTgToken(s.telegramBotToken || "");
                setTgChatIdCaisse(s.telegramChatIdCaisse || "");
                setTgChatIdTraiteur(s.telegramChatIdTraiteur || "");

                // WhatsApp
                setWaApiUrl(s.whatsappApiUrl || "");
                setWaApiKey(s.whatsappApiKey || "");
                setWaInstanceName(s.whatsappInstanceName || "");
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
                telegramBotToken: tgToken,
                telegramChatIdCaisse: tgChatIdCaisse,
                telegramChatIdTraiteur: tgChatIdTraiteur,
                whatsappApiUrl: waApiUrl,
                whatsappApiKey: waApiKey,
                whatsappInstanceName: waInstanceName,
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

    const handleFetchQr = async () => {
        setIsFetchingQr(true);
        setQrCodeParams(null);
        try {
            const res: any = await getWhatsAppQrAction({});
            if (res.success && res.data) {
                setQrCodeParams(res.data);
                if (res.data?.instance?.state === 'open') {
                    toast.success("Instance WhatsApp déjà connectée !");
                } else if (res.data?.base64) {
                    toast.success("QR Code récupéré ! Scannez-le rapidement.");
                } else if (res.data?.qrcode?.base64) {
                    toast.success("QR Code récupéré ! Scannez-le rapidement."); // Fallback for other versions
                }
            } else {
                toast.error(res.error || "Erreur de récupération du QR Code");
            }
        } catch (err) {
            toast.error("Erreur technique lors de la requête QR");
        } finally {
            setIsFetchingQr(false);
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

                {/* Telegram Configuration Section */}
                <section className="space-y-8">
                    <div>
                        <h3 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                            <Zap className="text-[#0088cc]" size={24} />
                            Configuration Telegram
                        </h3>
                        <p className="text-sm text-slate-400 mt-1">Gérez vos notifications et interactions Telegram.</p>
                    </div>

                    <div className="bg-[#1a1614] p-8 rounded-[32px] border border-white/5 shadow-2xl">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2 md:col-span-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Bot Token (@BotFather)</label>
                                <Input
                                    value={tgToken}
                                    onValueChange={setTgToken}
                                    type="password"
                                    placeholder="123456789:ABCDE..."
                                    variant="bordered"
                                    className="dark"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">ID Chat Caisse</label>
                                <Input
                                    value={tgChatIdCaisse}
                                    onValueChange={setTgChatIdCaisse}
                                    placeholder="-100..."
                                    variant="bordered"
                                    className="dark"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">ID Chat Traiteur</label>
                                <Input
                                    value={tgChatIdTraiteur}
                                    onValueChange={setTgChatIdTraiteur}
                                    placeholder="-100..."
                                    variant="bordered"
                                    className="dark"
                                />
                            </div>
                        </div>
                        <div className="mt-6 pt-6 border-t border-white/5 flex justify-end">
                            <Button
                                onPress={handleSave}
                                isLoading={isSaving}
                                className="bg-[#0088cc] text-white font-black uppercase tracking-widest text-[10px] px-10 py-6 rounded-2xl shadow-xl shadow-[#0088cc]/20"
                                startContent={<Save size={14} />}
                            >
                                Enregistrer Telegram
                            </Button>
                        </div>
                    </div>
                </section>

                {/* WhatsApp Waha Section */}
                <section className="space-y-8">
                    <div>
                        <h3 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                            <Zap className="text-[#25D366]" size={24} />
                            Configuration WhatsApp (Waha)
                        </h3>
                        <p className="text-sm text-slate-400 mt-1">Connexion au service Waha local (Docker). Les valeurs par défaut fonctionnent avec le start.bat.</p>
                    </div>

                    <div className="bg-[#1a1614] p-8 rounded-[32px] border border-white/5 shadow-2xl">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2 md:col-span-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">URL Waha</label>
                                <Input
                                    value={waApiUrl}
                                    onValueChange={setWaApiUrl}
                                    placeholder="http://localhost:3001"
                                    variant="bordered"
                                    className="dark"
                                />
                                <p className="text-[9px] text-slate-600 ml-1">Par défaut : http://localhost:3001 (géré par Docker)</p>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Clé API Waha (X-Api-Key)</label>
                                <Input
                                    value={waApiKey}
                                    onValueChange={setWaApiKey}
                                    type="password"
                                    placeholder="abc"
                                    variant="bordered"
                                    className="dark"
                                />
                                <p className="text-[9px] text-slate-600 ml-1">Défini dans docker-compose.yml (WHATSAPP_API_KEY)</p>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Nom de la Session</label>
                                <Input
                                    value={waInstanceName}
                                    onValueChange={setWaInstanceName}
                                    placeholder="default"
                                    variant="bordered"
                                    className="dark"
                                />
                                <p className="text-[9px] text-slate-600 ml-1">Nom de la session Waha (défaut : default)</p>
                            </div>
                        </div>

                        {/* Status / QR Code */}
                        <div className="mt-6 pt-6 border-t border-white/5 flex flex-col md:flex-row justify-between items-start gap-6">
                            <div className="flex flex-col items-start gap-3">
                                {qrCodeParams?.status === 'WORKING' ? (
                                    <div className="flex items-center gap-3 p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
                                        <span className="flex h-3 w-3 relative">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                                        </span>
                                        <div>
                                            <p className="text-emerald-400 font-black text-sm">WhatsApp Connecté</p>
                                            {qrCodeParams.phone && <p className="text-emerald-600 text-[10px] font-mono mt-0.5">{qrCodeParams.phone}</p>}
                                        </div>
                                    </div>
                                ) : qrCodeParams?.status === 'SCAN_QR_CODE' && qrCodeParams?.qrBase64 ? (
                                    <div className="text-center space-y-3">
                                        <div className="bg-white p-3 rounded-2xl shadow-xl inline-block">
                                            <img src={qrCodeParams.qrBase64} alt="WhatsApp QR Code" className="w-52 h-52" />
                                        </div>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Scannez avec WhatsApp → Appareils liés</p>
                                    </div>
                                ) : qrCodeParams?.status ? (
                                    <div className="p-4 bg-yellow-500/10 rounded-2xl border border-yellow-500/20">
                                        <p className="text-yellow-400 font-bold text-sm">Statut : {qrCodeParams.status}</p>
                                        <p className="text-yellow-600 text-[10px] mt-1">Vérifiez que Docker est démarré (start.bat)</p>
                                    </div>
                                ) : (
                                    <Button
                                        onPress={handleFetchQr}
                                        isLoading={isFetchingQr}
                                        variant="flat"
                                        className="bg-[#25D366]/10 text-[#25D366] font-black uppercase tracking-widest text-[10px] px-6 py-6 rounded-2xl border border-[#25D366]/20"
                                    >
                                        Vérifier la connexion / QR Code
                                    </Button>
                                )}
                                {qrCodeParams && (
                                    <button onClick={() => setQrCodeParams(null)} className="text-[9px] text-slate-600 hover:text-slate-400 font-bold uppercase tracking-wider transition-colors">
                                        Réinitialiser
                                    </button>
                                )}
                            </div>
                            <Button
                                onPress={handleSave}
                                isLoading={isSaving}
                                className="bg-[#25D366] text-white font-black uppercase tracking-widest text-[10px] px-10 py-6 rounded-2xl shadow-xl shadow-[#25D366]/20"
                                startContent={<Save size={14} />}
                            >
                                Enregistrer Waha
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
                                <h3 className="text-xl font-black text-white uppercase tracking-tight">Support IA WhatsApp</h3>
                                <p className="text-sm text-slate-400 mt-1">Configurez le comportement et les connaissances de votre assistant.</p>
                            </div>
                        </div>

                        <div className="bg-[#1a1614] p-8 rounded-[32px] border border-white/5 shadow-2xl space-y-8">

                            {/* API Key + Toggle */}
                            <div className="flex flex-col md:flex-row gap-6 items-start">
                                <div className="flex-1 space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Clé API Groq (IA)</label>
                                    <Input
                                        type="password"
                                        value={geminiKey}
                                        onValueChange={setGeminiKey}
                                        placeholder="gsk_..."
                                        variant="bordered"
                                        className="dark"
                                        startContent={<ShieldAlert size={16} className="text-purple-500" />}
                                    />
                                    <p className="text-[9px] text-slate-600 ml-1">console.groq.com → API Keys</p>
                                </div>
                                <div className="flex items-center gap-4 pt-8">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Chatbot Actif</span>
                                    <Switch
                                        isSelected={chatbotEnabled}
                                        onValueChange={setChatbotEnabled}
                                        color="secondary"
                                        size="sm"
                                    />
                                </div>
                            </div>

                            {/* Prompt Templates */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <Sparkles size={14} className="text-purple-400" />
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Templates de Prompt — Cliquez pour appliquer</label>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {PROMPT_TEMPLATES.map((t) => (
                                        <button
                                            key={t.id}
                                            onClick={() => setChatbotRole(t.prompt)}
                                            className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all text-center hover:scale-[1.02] active:scale-95 ${chatbotRole === t.prompt
                                                ? 'border-purple-500/50 bg-purple-500/10 text-purple-300'
                                                : 'border-white/5 bg-white/[0.02] text-slate-400 hover:border-white/10 hover:text-white'}`}
                                        >
                                            <span className="text-2xl">{t.icon}</span>
                                            <span className="text-[10px] font-black uppercase tracking-wider leading-tight">{t.label}</span>
                                            {t.recommended && (
                                                <span className="text-[8px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full font-black uppercase">Recommandé</span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Prompt Editor */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Instructions du Bot (Prompt Système)</label>
                                    <span className="text-[9px] text-slate-600 font-bold">{chatbotRole.length} caractères</span>
                                </div>
                                <Textarea
                                    value={chatbotRole}
                                    onValueChange={setChatbotRole}
                                    placeholder="Décrivez le rôle et les connaissances de votre assistant..."
                                    variant="bordered"
                                    className="dark font-mono text-xs"
                                    minRows={12}
                                    maxRows={30}
                                />
                                <p className="text-[9px] text-slate-600 ml-1">
                                    Ce texte définit la personnalité, les connaissances et les limites de votre assistant IA. Plus il est détaillé, meilleures seront les réponses.
                                </p>
                            </div>

                            <div className="pt-4 border-t border-white/5 flex justify-end">
                                <Button
                                    onPress={handleSave}
                                    isLoading={isSaving}
                                    className="bg-purple-600 text-white font-black uppercase tracking-widest text-[10px] px-10 py-6 rounded-2xl shadow-xl shadow-purple-600/20"
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
