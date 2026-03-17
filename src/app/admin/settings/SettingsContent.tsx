"use client";

import React, { useState, useEffect } from "react";
import {
    Plus,
    ShieldCheck,
    UserCog,
    User,
    CheckCircle2,
    XCircle,
    KeyRound,
    Trash2,
    Save,
    Loader2,
    Palette,
    Store,
    Percent,
    AlertTriangle,
    Coins,
    Building2,
    Users,
    Lock,
    Smartphone,
    History,
    Globe,
    Power,
    ShieldAlert,
    Download,
    FileJson,
    FileSpreadsheet,
    Copy,
    RefreshCw
} from "lucide-react";
import NextImage from "next/image";
import { QRCodeSVG } from "qrcode.react";
import { useDisclosure, Spinner, Button } from "@heroui/react";
import Link from "next/link";
import { toast } from "react-hot-toast";
import { AddMemberModal } from "@/components/admin/modals/AddMemberModal";
import { EditMemberModal } from "@/components/admin/modals/EditMemberModal";
import {
    getShopSettingsAction,
    saveShopSettingsAction,
    getUsersAction,
    deleteUserAction,
    testTelegramBotAction,
    setTelegramWebhookAction,
    testWhatsAppAction,
    getAuditLogsAction,
    generateMfaSecretAction,
    enableMfaAction,
    disableMfaAction,
    generateBackupCodesAction,
    exportAuditLogsAction
} from "@/app/admin/settings/actions";
import { uploadImage } from "@/app/admin/actions/upload";
import { useSettingsStore } from "@/store/useSettingsStore";
import { formatCurrency } from "@/lib/formatters";

export default function SettingsContent() {
    const [activeTab, setActiveTab] = useState<"general" | "team" | "api" | "b2b" | "appearance" | "receipt" | "security">("general");
    const { isOpen, onOpen, onOpenChange } = useDisclosure();
    const updateGlobalSettings = useSettingsStore((state) => state.updateSettings);

    const [b2bSubTab, setB2bSubTab] = useState<"config" | "manage">("config");

    // Settings states
    const [shopName, setShopName] = useState("");
    const [shopTel, setShopTel] = useState("");
    const [shopAddress, setShopAddress] = useState("");
    const [raisonSociale, setRaisonSociale] = useState("");
    const [ein, setEin] = useState("");
    const [footerMessage, setFooterMessage] = useState("");
    const [showCashier, setShowCashier] = useState(true);
    const [showDateTime, setShowDateTime] = useState(true);
    const [showLogo, setShowLogo] = useState(false);
    const [accentColor, setAccentColor] = useState("#ec5b13");
    const [dashboardLogoUrl, setDashboardLogoUrl] = useState("");
    const [faviconUrl, setFaviconUrl] = useState("");
    const [logoUrl, setLogoUrl] = useState("https://lh3.googleusercontent.com/aida-public/AB6AXuAc0N62EzEzZzBI60NaoTtEF00tJ4ruXHAprleWW2Ek0c_HJiYCXwfN8trT6eQnjQrV5nE_-fyuuJosSJb_iytbtbNGp-K0Wd6vX-CPo20bhzT8S_St7llE3bP8PuJTX3ksNDuaag3oCbGIG_lZUwYPpyNcDhS-ZZsyPgxdx6s6c1GGpOhrqGqPdgtDJu-cj6Xz_MqFfmz6rBVYDmiePw407Len9Q5yGIf3OUX-df_CRLX9jEKC9xgO2mOWd1gftB6LcGqkoR0lqGU5");

    // B2B states
    const [isB2bEnabled, setIsB2bEnabled] = useState(false);
    const [defaultResellerDiscount, setDefaultResellerDiscount] = useState("5.00");
    const [minResellerRecharge, setMinResellerRecharge] = useState("1000.00");

    // Team states
    const [team, setTeam] = useState<any[]>([]);
    const [isTeamsLoading, setIsTeamsLoading] = useState(true);
    const logoInputRef = React.useRef<HTMLInputElement>(null);
    const dashboardLogoInputRef = React.useRef<HTMLInputElement>(null);
    const faviconInputRef = React.useRef<HTMLInputElement>(null);
    const [selectedMember, setSelectedMember] = useState<any>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [telegramBotToken, setTelegramBotToken] = useState("");
    const [telegramChatId, setTelegramChatId] = useState("");
    const [telegramChatIdAdmin, setTelegramChatIdAdmin] = useState("");
    const [telegramChatIdCaisse, setTelegramChatIdCaisse] = useState("");
    const [telegramChatIdTraiteur, setTelegramChatIdTraiteur] = useState("");
    const [isTestingBot, setIsTestingBot] = useState(false);

    // B2B Modal state
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);
    const [isUploadingDashboardLogo, setIsUploadingDashboardLogo] = useState(false);
    const [isUploadingFavicon, setIsUploadingFavicon] = useState(false);
    const [isActivatingWebhook, setIsActivatingWebhook] = useState(false);
    const [webhookUrl, setWebhookUrl] = useState("");
    const [whatsappToken, setWhatsappToken] = useState("");
    const [whatsappPhoneId, setWhatsappPhoneId] = useState("");
    const [isTestingWhatsApp, setIsTestingWhatsApp] = useState(false);

    // Global loading/saving states
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
    const [allowedIps, setAllowedIps] = useState("");

    // MFA States
    const [mfaSecret, setMfaSecret] = useState<string | null>(null);
    const [mfaQrCode, setMfaQrCode] = useState<string | null>(null);
    const [mfaInputCode, setMfaInputCode] = useState("");
    const [isMfaEnabling, setIsMfaEnabling] = useState(false);
    const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
    const [isGeneratingCodes, setIsGeneratingCodes] = useState(false);

    // Audit Log States
    const [auditLogs, setAuditLogs] = useState<any[]>([]);
    const [isAuditLoading, setIsAuditLoading] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        fetchInitialData();
    }, []);

    const handleActivateWebhook = async () => {
        if (!telegramBotToken) {
            toast.error("Veuillez saisir un Token Bot");
            return;
        }

        setIsActivatingWebhook(true);
        try {
            const appUrl = webhookUrl || window.location.origin;
            const res: any = await setTelegramWebhookAction({ token: telegramBotToken, url: appUrl });
            if (res.success) {
                toast.success("Webhook Telegram activé avec succès !");
            } else {
                toast.error(res.error || "Erreur d'activation");
            }
        } catch (err) {
            toast.error("Erreur de connexion");
        } finally {
            setIsActivatingWebhook(false);
        }
    };

    const fetchInitialData = async () => {
        setIsLoading(true);
        try {
            const [settingsRes, teamRes]: [any, any] = await Promise.all([
                getShopSettingsAction({}), // Added {}
                getUsersAction({}) // Added {}
            ]);

            if (settingsRes.success && settingsRes.data) {
                const s = settingsRes.data;
                setShopName(s.shopName || "");
                setShopTel(s.shopTel || "");
                setShopAddress(s.shopAddress || "");
                setRaisonSociale(s.raisonSociale || "");
                setEin(s.ein || "");
                setFooterMessage(s.footerMessage || "");
                setShowCashier(s.showCashierOnReceipt ?? true);
                setShowDateTime(s.showDateTimeOnReceipt ?? true);
                setShowLogo(s.showLogoOnReceipt ?? false);
                setAccentColor(s.accentColor || "#ec5b13");
                if (s.logoUrl) setLogoUrl(s.logoUrl);
                if (s.dashboardLogoUrl) setDashboardLogoUrl(s.dashboardLogoUrl);
                if (s.faviconUrl) setFaviconUrl(s.faviconUrl);
                if (s.telegramBotToken) setTelegramBotToken(s.telegramBotToken);
                if (s.telegramChatId) setTelegramChatId(s.telegramChatId);
                if (s.telegramChatIdAdmin) setTelegramChatIdAdmin(s.telegramChatIdAdmin);
                if (s.telegramChatIdCaisse) setTelegramChatIdCaisse(s.telegramChatIdCaisse);
                if (s.telegramChatIdTraiteur) setTelegramChatIdTraiteur(s.telegramChatIdTraiteur);
                if (s.webhookUrl) setWebhookUrl(s.webhookUrl);
                if (s.whatsappToken) setWhatsappToken(s.whatsappToken);
                if (s.whatsappPhoneId) setWhatsappPhoneId(s.whatsappPhoneId);
                setIsB2bEnabled(s.isB2bEnabled ?? false);
                setDefaultResellerDiscount(s.defaultResellerDiscount || "5.00");
                setMinResellerRecharge(s.minResellerRecharge || "1000.00");
                setIsMaintenanceMode(s.isMaintenanceMode ?? false);
                setAllowedIps(s.allowedIps || "");
            }

            if (teamRes.success) {
                setTeam(teamRes.data || []);
            }
        } catch (err) {
            console.error(err);
            toast.error("Échec du chargement des données");
        } finally {
            setIsLoading(false);
            setIsTeamsLoading(false);
        }
    };


    const handleSave = async () => {
        setIsSaving(true);
        setError(null);
        try {
            const res: any = await saveShopSettingsAction({
                shopName,
                shopTel,
                shopAddress,
                raisonSociale,
                ein,
                footerMessage,
                showCashierOnReceipt: showCashier,
                showDateTimeOnReceipt: showDateTime,
                showLogoOnReceipt: showLogo,
                accentColor,
                logoUrl,
                dashboardLogoUrl,
                faviconUrl,
                telegramBotToken,
                telegramChatId,
                telegramChatIdAdmin,
                telegramChatIdCaisse,
                telegramChatIdTraiteur,
                webhookUrl,
                whatsappToken,
                whatsappPhoneId,
                isB2bEnabled,
                defaultResellerDiscount,
                minResellerRecharge,
                isMaintenanceMode,
                allowedIps,
            });

            if (!res.success) {
                const msg = res.error || "Erreur lors de la sauvegarde";
                setError(msg);
                toast.error(msg);
            } else {
                updateGlobalSettings({ shopName, dashboardLogoUrl, faviconUrl });
                toast.success("Paramètres enregistrés avec succès");
            }
        } catch (err) {
            const msg = "Erreur de connexion";
            setError(msg);
            toast.error(msg);
        } finally {
            setIsSaving(false);
        }
    };

    const handleTestBot = async () => {
        if (!telegramBotToken || !telegramChatId) {
            toast.error("Veuillez saisir un Token et un Chat ID");
            return;
        }

        setIsTestingBot(true);
        try {
            const res: any = await testTelegramBotAction({ token: telegramBotToken, chatId: telegramChatId });
            if (res.success) {
                toast.success("Message de test envoyé à Telegram !");
            } else {
                toast.error(res.error || "Erreur lors du test");
            }
        } catch (err) {
            toast.error("Erreur de connexion");
        } finally {
            setIsTestingBot(false);
        }
    };

    const handleWhatsAppTest = async () => {
        if (!whatsappToken || !whatsappPhoneId) {
            toast.error("Veuillez saisir un Token et un Phone ID");
            return;
        }

        setIsTestingWhatsApp(true);
        try {
            const res: any = await testWhatsAppAction({ token: whatsappToken, phoneId: whatsappPhoneId });
            if (res.success) {
                toast.success("Message de test envoyé à WhatsApp !");
            } else {
                toast.error(res.error || "Erreur lors du test WhatsApp");
            }
        } catch (err) {
            toast.error("Erreur de connexion");
        } finally {
            setIsTestingWhatsApp(false);
        }
    };

    const handleEditOpen = (member: any) => {
        setSelectedMember(member);
        setIsEditModalOpen(true);
    };

    const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>, target: 'logo' | 'dashboard' | 'favicon') => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (target === 'logo') setIsUploadingLogo(true);
        else if (target === 'dashboard') setIsUploadingDashboardLogo(true);
        else if (target === 'favicon') setIsUploadingFavicon(true);

        try {
            const formData = new FormData();
            formData.append("file", file);
            const res = await uploadImage(formData);
            if (res.success && res.url) {
                if (target === 'logo') setLogoUrl(res.url);
                else if (target === 'dashboard') {
                    setDashboardLogoUrl(res.url);
                    updateGlobalSettings({ dashboardLogoUrl: res.url });
                }
                else if (target === 'favicon') {
                    setFaviconUrl(res.url);
                    updateGlobalSettings({ faviconUrl: res.url });
                }
                toast.success("Image mise à jour");
            } else {
                toast.error("Erreur lors de l'upload: " + (res.error || "Erreur inconnue"));
            }
        } catch (err) {
            console.error(err);
            toast.error("Erreur de connexion lors de l'upload");
        } finally {
            if (target === 'logo') setIsUploadingLogo(false);
            else if (target === 'dashboard') setIsUploadingDashboardLogo(false);
            else if (target === 'favicon') setIsUploadingFavicon(false);
        }
    };

    const handleDeleteUser = async (id: number, name: string) => {
        if (!window.confirm(`Supprimer ${name} de l'équipe ?`)) return;
        try {
            const res: any = await deleteUserAction({ id });
            if (res.success) {
                setTeam(team.filter(u => u.id !== id));
                toast.success(`${name} supprimé avec succès`);
            } else {
                toast.error((res as any).error || "Erreur lors de la suppression");
            }
        } catch (err) {
            console.error(err);
            toast.error("Erreur de connexion");
        }
    };

    return (
        <div className="flex-1 flex flex-col font-sans antialiased text-slate-100 bg-[#0f0d0c] min-h-screen mx-[-32px] my-[-32px]">
            <style jsx global>{`
                .custom-switch {
                    position: relative;
                    display: inline-block;
                    width: 44px;
                    height: 24px;
                }
                .custom-switch input { opacity: 0; width: 0; height: 0; }
                .slider {
                    position: absolute;
                    cursor: pointer;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background-color: #3d2b22;
                    transition: .4s;
                    border-radius: 24px;
                }
                .slider:before {
                    position: absolute;
                    content: "";
                    height: 18px; width: 18px;
                    left: 3px; bottom: 3px;
                    background-color: white;
                    transition: .4s;
                    border-radius: 50%;
                }
                input:checked + .slider { background-color: #ec5b13; }
                input:checked + .slider:before { transform: translateX(20px); }

                /* Ticket Jagged Edges */
                .ticket-paper {
                    position: relative;
                    background: white;
                    color: #000;
                    box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.5);
                }
                .ticket-paper::before,
                .ticket-paper::after {
                    content: "";
                    position: absolute;
                    left: 0;
                    right: 0;
                    height: 10px;
                    background-size: 20px 10px;
                    background-repeat: repeat-x;
                    z-index: 1;
                }
                .ticket-paper::before {
                    top: -10px;
                    background-image: radial-gradient(circle at 10px 10px, transparent 10px, white 10px);
                }
                .ticket-paper::after {
                    bottom: -10px;
                    background-image: radial-gradient(circle at 10px 0, transparent 10px, white 10px);
                }
            `}</style>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto">
                {/* Header & Tabs */}
                <header className="bg-[#0f0d0c]/80 backdrop-blur-md border-b border-[#2d2622] sticky top-0 z-10">
                    <div className="px-8 pt-8 pb-0 overflow-x-auto no-scrollbar">
                        <h2 className="text-2xl font-bold mb-6 text-white">Paramètres</h2>
                        <div className="flex gap-8 min-w-max">
                            <button
                                onClick={() => setActiveTab("general")}
                                className={`pb-4 border-b-2 text-sm transition-all relative whitespace-nowrap ${activeTab === "general" ? "text-[#ec5b13] font-bold" : "text-slate-500 hover:text-slate-200 font-medium"}`}
                            >
                                Général
                                {activeTab === "general" && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-[#ec5b13] rounded-full"></span>}
                            </button>
                            <button
                                onClick={() => setActiveTab("team")}
                                className={`pb-4 border-b-2 text-sm transition-all relative whitespace-nowrap ${activeTab === "team" ? "text-[#ec5b13] font-bold" : "text-slate-500 hover:text-slate-200 font-medium"}`}
                            >
                                Équipe
                                {activeTab === "team" && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-[#ec5b13] rounded-full"></span>}
                            </button>
                            <button
                                onClick={() => setActiveTab("api")}
                                className={`pb-4 border-b-2 text-sm transition-all relative whitespace-nowrap ${activeTab === "api" ? "text-[#ec5b13] font-bold" : "text-slate-500 hover:text-slate-200 font-medium"}`}
                            >
                                API & Bot
                                {activeTab === "api" && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-[#ec5b13] rounded-full"></span>}
                            </button>
                            <button
                                onClick={() => setActiveTab("receipt")}
                                className={`pb-4 border-b-2 text-sm transition-all relative whitespace-nowrap ${activeTab === "receipt" ? "text-[#ec5b13] font-bold" : "text-slate-500 hover:text-slate-200 font-medium"}`}
                            >
                                Ticket de Caisse
                                {activeTab === "receipt" && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-[#ec5b13] rounded-full"></span>}
                            </button>
                            <button
                                onClick={() => setActiveTab("b2b")}
                                className={`pb-4 border-b-2 text-sm transition-all relative whitespace-nowrap ${activeTab === "b2b" ? "text-[#ec5b13] font-bold" : "text-slate-500 hover:text-slate-200 font-medium"}`}
                            >
                                <span className="flex items-center gap-2">
                                    <Store className="size-4" />
                                    B2B & Revendeurs
                                </span>
                                {activeTab === "b2b" && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-[#ec5b13] rounded-full"></span>}
                            </button>
                            <button
                                onClick={() => setActiveTab("appearance")}
                                className={`pb-4 border-b-2 text-sm transition-all relative whitespace-nowrap ${activeTab === "appearance" ? "text-[#ec5b13] font-bold" : "text-slate-500 hover:text-slate-200 font-medium"}`}
                            >
                                Apparence & Personnalisation
                                {activeTab === "appearance" && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-[#ec5b13] rounded-full"></span>}
                            </button>
                        </div>
                    </div>
                </header>

                <div className="max-w-7xl px-8 py-10">
                    {activeTab === "general" && (
                        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            {/* Identité de la Boutique Section */}
                            <section className="space-y-8 max-w-6xl">
                                <div>
                                    <h3 className="text-lg font-bold">Identité de la Boutique</h3>
                                    <p className="text-sm text-slate-400 mt-1">Gérez les informations publiques et légales de votre entreprise.</p>
                                </div>

                                <div className="flex items-center gap-8">
                                    <div className="relative group cursor-pointer">
                                        <div className="size-32 rounded-full overflow-hidden border-4 border-[#2d2622] bg-[#1a1614] relative">
                                            {isUploadingLogo && (
                                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10">
                                                    <Loader2 className="animate-spin text-white size-8" />
                                                </div>
                                            )}
                                            <NextImage
                                                className="object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                                alt="Shop Logo"
                                                src={logoUrl || "https://lh3.googleusercontent.com/aida-public/AB6AXuAc0N62EzEzZzBI60NaoTtEF00tJ4ruXHAprleWW2Ek0c_HJiYCXwfN8trT6eQnjQrV5nE_-fyuuJosSJb_iytbtbNGp-K0Wd6vX-CPo20bhzT8S_St7llE3bP8PuJTX3ksNDuaag3oCbGIG_lZUwYPpyNcDhS-ZZsyPgxdx6s6c1GGpOhrqGqPdgtDJu-cj6Xz_MqFfmz6rBVYDmiePw407Len9Q5yGIf3OUX-df_CRLX9jEKC9xgO2mOWd1gftB6LcGqkoR0lqGU5"}
                                                fill
                                            />


                                        </div>
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                            <span className="material-symbols-outlined text-white text-3xl">photo_camera</span>
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold mb-1">Logo de la boutique</p>
                                        <p className="text-xs text-slate-500 mb-3">Format JPG, PNG ou GIF. Max 5MB.</p>
                                        <input
                                            type="file"
                                            ref={logoInputRef}
                                            className="hidden"
                                            accept="image/*"
                                            onChange={(e) => handleLogoFileChange(e, 'logo')}
                                        />
                                        <button
                                            onClick={() => logoInputRef.current?.click()}
                                            disabled={isUploadingLogo}
                                            className="px-4 py-2 bg-[#1a1614] border border-[#2d2622] rounded-lg text-sm font-medium hover:bg-[#2d2622] transition-colors disabled:opacity-50 flex items-center gap-2"
                                        >
                                            {isUploadingLogo && <Loader2 className="animate-spin size-4" />}
                                            {isUploadingLogo ? "Téléchargement..." : "Changer le logo"}
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-400">Nom de la boutique</label>
                                        <input
                                            className="w-full bg-[#1a1614] border border-[#2d2622] rounded-xl px-4 py-3 focus:ring-1 focus:ring-[#ec5b13] focus:border-transparent transition-all outline-none text-slate-100"
                                            type="text"
                                            value={shopName}
                                            onChange={(e) => setShopName(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-400">Raison sociale</label>
                                        <input
                                            className="w-full bg-[#1a1614] border border-[#2d2622] rounded-xl px-4 py-3 focus:ring-1 focus:ring-[#ec5b13] focus:border-transparent transition-all outline-none text-slate-100"
                                            type="text"
                                            value={raisonSociale}
                                            onChange={(e) => setRaisonSociale(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-400">Adresse légale</label>
                                        <input
                                            className="w-full bg-[#1a1614] border border-[#2d2622] rounded-xl px-4 py-3 focus:ring-1 focus:ring-[#ec5b13] focus:border-transparent transition-all outline-none text-slate-100"
                                            type="text"
                                            value={shopAddress}
                                            onChange={(e) => setShopAddress(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-400">Numéro d&apos;identification fiscal / EIN</label>

                                        <input
                                            className="w-full bg-[#1a1614] border border-[#2d2622] rounded-xl px-4 py-3 focus:ring-1 focus:ring-[#ec5b13] focus:border-transparent transition-all outline-none text-slate-100"
                                            placeholder="XX-XXXXXXX"
                                            type="text"
                                            value={ein}
                                            onChange={(e) => setEin(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </section>

                            <div className="pt-10 flex justify-end max-w-6xl">
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="bg-[#ec5b13] hover:bg-orange-600 text-white px-8 py-4 rounded-xl font-bold text-base shadow-lg shadow-[#ec5b13]/40 transition-all flex items-center gap-3 disabled:opacity-50"
                                >
                                    {isSaving ? <Loader2 className="animate-spin size-5" /> : <Save className="size-5" />}
                                    {isSaving ? "Sauvegarde..." : "Sauvegarder les modifications"}
                                </button>
                            </div>
                        </div>
                    )}

                    {activeTab === "team" && (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                            {/* BEGIN: Page Header */}
                            <header className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <h1 className="text-3xl font-bold tracking-tight text-white">Équipe & Accès</h1>
                                    <p className="text-slate-400 text-sm md:text-base">Gérez les caissiers et leurs permissions.</p>
                                </div>
                                <button
                                    onClick={onOpen}
                                    className="bg-[#ec5b13] hover:bg-orange-600 transition-all text-white px-6 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 w-fit shadow-lg shadow-[#ec5b13]/20"
                                >
                                    <Plus className="w-5 h-5" />
                                    Ajouter un membre
                                </button>
                            </header>

                            {/* BEGIN: User Grid */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {isTeamsLoading ? (
                                    <div className="col-span-2 py-20 flex flex-col items-center justify-center space-y-4">
                                        <Loader2 className="animate-spin text-[#ec5b13] size-12" />
                                        <p className="text-slate-500 font-medium">Chargement de l&apos;équipe...</p>

                                    </div>
                                ) : team.length === 0 ? (
                                    <div className="col-span-2 py-20 flex flex-col items-center justify-center space-y-4 border-2 border-dashed border-[#2d2622] rounded-3xl">
                                        <User className="text-slate-700 size-16" />
                                        <p className="text-slate-500 font-medium">Aucun membre dans l&apos;équipe pour le moment.</p>

                                    </div>
                                ) : team.map((member) => (
                                    <section key={member.id} className={`bg-[#161616] border border-[#262626] rounded-2xl p-6 flex flex-col justify-between hover:border-[#ec5b13]/30 transition-colors group`}>
                                        <div className="flex items-start justify-between mb-6">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-xl border overflow-hidden ${member.role === 'ADMIN' ? 'bg-[#ec5b13]/20 text-[#ec5b13] border-[#ec5b13]/30' : 'bg-zinc-800 text-slate-400 border-[#262626]'}`}>
                                                    {member.avatarUrl ? (
                                                        <NextImage src={member.avatarUrl} className="object-cover" alt={member.nom} fill />


                                                    ) : (
                                                        member.nom.substring(0, 2).toUpperCase()
                                                    )}
                                                </div>
                                                <div>
                                                    <h3 className="text-lg font-semibold text-white">{member.nom}</h3>
                                                    <p className="text-slate-400 text-sm font-medium">{member.email}</p>
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                        <span className="text-slate-500 text-[10px] tracking-widest font-mono font-bold uppercase">PIN: {member.pinCode}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <span className={`px-3 py-1 text-xs font-bold rounded-full border uppercase tracking-wider ${member.role === 'ADMIN' ? 'bg-[#ec5b13]/10 text-[#ec5b13] border-[#ec5b13]/20' : 'bg-zinc-800 text-slate-200 border-zinc-700'}`}>
                                                {member.role === 'ADMIN' ? 'Administrateur' : member.role === 'CAISSIER' ? 'Caissier' : 'Traiteur'}
                                            </span>
                                        </div>
                                        <div className="space-y-4 mb-8">
                                            <div className="flex items-center gap-2 text-sm text-slate-300 font-medium">
                                                {member.role === 'ADMIN' ? (
                                                    <>
                                                        <ShieldCheck className="w-4 h-4 text-[#ec5b13]" />
                                                        <span>Tous les accès</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                                        <span>{member.role === 'CAISSIER' ? 'Caisse, Catalogue' : 'Tableau de bord Traiteur'}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        <div className="pt-6 border-t border-[#262626] flex items-center gap-3">
                                            <button
                                                onClick={() => handleEditOpen(member)}
                                                className="flex-grow py-3 text-sm font-bold text-slate-300 hover:text-white transition-colors flex items-center justify-center gap-2 bg-white/5 rounded-xl hover:bg-white/10"
                                            >
                                                <UserCog className="w-4 h-4" />
                                                Modifier
                                            </button>
                                            <button
                                                onClick={() => handleDeleteUser(member.id, member.nom)}
                                                className="p-3 text-red-500 hover:bg-red-500/10 rounded-xl transition-colors border border-transparent hover:border-red-500/20"
                                                title="Supprimer l'accès"
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </section>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === "api" && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300 max-w-6xl">
                            {/* API & Bot Section */}
                            <section className="space-y-8">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-lg font-bold">API & Bot Python</h3>
                                        <p className="text-sm text-slate-400 mt-1">Gérez vos accès API et l&apos;état de vos connecteurs automatisés.</p>

                                    </div>
                                    <div className="flex items-center gap-2 bg-[#10b981]/10 text-[#10b981] px-4 py-1.5 rounded-full border border-[#10b981]/20">
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10b981] opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#10b981]"></span>
                                        </span>
                                        <span className="text-[10px] font-bold uppercase tracking-widest">Bot Python : Connecté</span>
                                    </div>
                                </div>

                                {/* BEGIN: Telegram Integration Guide */}
                                <div className="bg-[#1e293b]/50 border border-[#334155] rounded-2xl p-8 space-y-6">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="size-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                                            <span className="material-symbols-outlined text-blue-400">info</span>
                                        </div>
                                        <h4 className="text-lg font-bold text-white">Comment configurer l&apos;automatisation Telegram ?</h4>

                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="flex gap-4">
                                            <div className="size-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0 border border-zinc-700">
                                                <span className="text-sm font-bold text-slate-400">1</span>
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-sm font-bold text-slate-200">Créer le Bot</p>
                                                <p className="text-xs text-slate-400 leading-relaxed">
                                                    Ouvrez Telegram, cherchez <span className="text-blue-400">@BotFather</span> et envoyez <code className="bg-black/40 px-1 py-0.5 rounded text-blue-300">/newbot</code>. Suivez les instructions pour obtenir votre Token API.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex gap-4">
                                            <div className="size-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0 border border-zinc-700">
                                                <span className="text-sm font-bold text-slate-400">2</span>
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-sm font-bold text-slate-200">Créer le Groupe</p>
                                                <p className="text-xs text-slate-400 leading-relaxed">
                                                    Créez un nouveau groupe Telegram (ex: &quot;FLEXBOX Commandes&quot;) et ajoutez votre nouveau bot en tant que membre.

                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex gap-4">
                                            <div className="size-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0 border border-zinc-700">
                                                <span className="text-sm font-bold text-slate-400">3</span>
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-sm font-bold text-slate-200">Obtenir le Chat ID</p>
                                                <p className="text-xs text-slate-400 leading-relaxed">
                                                    Ajoutez temporairement le bot <span className="text-blue-400">@RawDataBot</span> (ou <span className="text-blue-400">@getidsbot</span>) dans votre groupe. Il vous donnera l&apos;ID.

                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex gap-4">
                                            <div className="size-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0 border border-zinc-700">
                                                <span className="text-sm font-bold text-slate-400">4</span>
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-sm font-bold text-slate-200">Connecter</p>
                                                <p className="text-xs text-slate-400 leading-relaxed">
                                                    Collez le Token et le Chat ID ci-dessous, puis sauvegardez pour activer les notifications.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                {/* END: Telegram Integration Guide */}

                                <div className="bg-[#1a1614] p-8 rounded-2xl border border-[#2d2622] space-y-8">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-3">
                                            <label className="text-sm font-medium text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                                <span className="material-symbols-outlined text-sm text-blue-400">key</span>
                                                Bot Token Telegram
                                            </label>
                                            <input
                                                className="w-full bg-[#0f0d0c] border border-[#2d2622] rounded-xl px-4 py-3 font-mono text-sm text-slate-200 outline-none focus:ring-1 focus:ring-blue-500/50"
                                                type="password"
                                                placeholder="7348923489:AAEj..."
                                                value={telegramBotToken}
                                                onChange={(e) => setTelegramBotToken(e.target.value)}
                                            />
                                        </div>

                                        <div className="space-y-3">
                                            <label className="text-sm font-medium text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                                <span className="material-symbols-outlined text-sm text-blue-400">chat</span>
                                                Chat ID du Groupe
                                            </label>
                                            <div className="flex gap-3">
                                                <input
                                                    className="flex-1 bg-[#0f0d0c] border border-[#2d2622] rounded-xl px-4 py-3 font-mono text-sm text-slate-200 outline-none focus:ring-1 focus:ring-blue-500/50"
                                                    type="text"
                                                    placeholder="-100..."
                                                    value={telegramChatId}
                                                    onChange={(e) => setTelegramChatId(e.target.value)}
                                                />
                                                <button
                                                    onClick={handleActivateWebhook}
                                                    disabled={isActivatingWebhook}
                                                    className="px-4 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-xl text-emerald-400 transition-all disabled:opacity-50 flex items-center gap-2 font-bold text-xs shrink-0"
                                                >
                                                    {isActivatingWebhook ? <Loader2 className="animate-spin size-4" /> : <span className="material-symbols-outlined text-lg">api</span>}
                                                    {isActivatingWebhook ? "Activation..." : "Activer le Webhook"}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div className="space-y-3">
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                                <span className="material-symbols-outlined text-sm">shield_person</span>
                                                ADMIN Chat ID
                                            </label>
                                            <input
                                                className="w-full bg-[#0f0d0c] border border-[#2d2622] rounded-xl px-4 py-3 font-mono text-sm text-slate-200 outline-none focus:ring-1 focus:ring-[#ec5b13]/50"
                                                type="text"
                                                placeholder="-100..."
                                                value={telegramChatIdAdmin}
                                                onChange={(e) => setTelegramChatIdAdmin(e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                                <span className="material-symbols-outlined text-sm">point_of_sale</span>
                                                CAISSE Chat ID
                                            </label>
                                            <input
                                                className="w-full bg-[#0f0d0c] border border-[#2d2622] rounded-xl px-4 py-3 font-mono text-sm text-slate-200 outline-none focus:ring-1 focus:ring-emerald-500/50"
                                                type="text"
                                                placeholder="-100..."
                                                value={telegramChatIdCaisse}
                                                onChange={(e) => setTelegramChatIdCaisse(e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                                <span className="material-symbols-outlined text-sm">conveyor_belt</span>
                                                TRAITEUR Chat ID
                                            </label>
                                            <input
                                                className="w-full bg-[#0f0d0c] border border-[#2d2622] rounded-xl px-4 py-3 font-mono text-sm text-slate-200 outline-none focus:ring-1 focus:ring-blue-500/50"
                                                type="text"
                                                placeholder="-100..."
                                                value={telegramChatIdTraiteur}
                                                onChange={(e) => setTelegramChatIdTraiteur(e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    <div className="p-4 rounded-xl bg-blue-500/5 border border-dashed border-blue-500/20">
                                        <p className="text-[11px] text-slate-400 font-medium leading-relaxed italic">
                                            Le Chat ID doit commencer par un signe moins (-) s&apos;il s&apos;agit d&apos;un groupe ou d&apos;un supergroupe (ex: -1001234567890).

                                        </p>
                                    </div>

                                    <div className="space-y-3">
                                        <label className="text-sm font-medium text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                            <span className="material-symbols-outlined text-sm text-blue-400">link</span>
                                            URL Publique du Webhook (Tunnel HTTPS requis)
                                        </label>
                                        <div className="flex flex-col gap-2">
                                            <input
                                                className="w-full bg-[#0f0d0c] border border-[#2d2622] rounded-xl px-4 py-3 font-mono text-sm text-slate-200 outline-none focus:ring-1 focus:ring-blue-500/50"
                                                type="text"
                                                placeholder="https://votre-tunnel.ngrok.io"
                                                value={webhookUrl}
                                                onChange={(e) => setWebhookUrl(e.target.value)}
                                            />
                                            <p className="text-[10px] text-slate-500 italic">
                                                En local, utilisez <b>Ngrok</b> pour obtenir une URL HTTPS vers votre port 1556. Telegram refuse l&apos;HTTP simple.

                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* BEGIN: WhatsApp Business API Configuration */}
                                <div className="space-y-8 pt-10 border-t border-[#2d2622]">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="text-lg font-bold">WhatsApp Business API (Meta)</h3>
                                            <p className="text-sm text-slate-400 mt-1">Configurez l&apos;envoi automatique des codes par WhatsApp.</p>

                                        </div>
                                        <div className="flex items-center gap-2 bg-[#25D366]/10 text-[#25D366] px-4 py-1.5 rounded-full border border-[#25D366]/20">
                                            <span className="relative flex h-2 w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#25D366] opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#25D366]"></span>
                                            </span>
                                            <span className="text-[10px] font-bold uppercase tracking-widest">API Meta : Configurable</span>
                                        </div>
                                    </div>

                                    {/* WhatsApp Tutorial Card */}
                                    <div className="bg-[#25D366]/5 border border-[#25D366]/20 rounded-2xl p-8 space-y-6">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="size-10 rounded-full bg-[#25D366]/20 flex items-center justify-center">
                                                <span className="material-symbols-outlined text-[#25D366] text-xl">help</span>
                                            </div>
                                            <h4 className="text-lg font-bold text-white">Comment configurer l&apos;API WhatsApp ?</h4>

                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="flex gap-4">
                                                <div className="size-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0 border border-zinc-700">
                                                    <span className="text-sm font-bold text-[#25D366]">1</span>
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-sm font-bold text-slate-200">Application Meta</p>
                                                    <p className="text-xs text-slate-400 leading-relaxed">
                                                        Allez sur <span className="text-[#25D366]">developers.facebook.com</span> et créez une application &quot;Entreprise&quot;.

                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex gap-4">
                                                <div className="size-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0 border border-zinc-700">
                                                    <span className="text-sm font-bold text-[#25D366]">2</span>
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-sm font-bold text-slate-200">Produit WhatsApp</p>
                                                    <p className="text-xs text-slate-400 leading-relaxed">
                                                        Ajoutez le produit &quot;WhatsApp&quot; et associez votre numéro de téléphone professionnel.

                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex gap-4">
                                                <div className="size-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0 border border-zinc-700">
                                                    <span className="text-sm font-bold text-[#25D366]">3</span>
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-sm font-bold text-slate-200">Phone Number ID</p>
                                                    <p className="text-xs text-slate-400 leading-relaxed">
                                                        Copiez l&apos;<b>Identifiant du numéro de téléphone</b> (Phone Number ID) depuis le tableau de bord.

                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex gap-4">
                                                <div className="size-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0 border border-zinc-700">
                                                    <span className="text-sm font-bold text-[#25D366]">4</span>
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-sm font-bold text-slate-200">Token Permanent</p>
                                                    <p className="text-xs text-slate-400 leading-relaxed">
                                                        Générez un <b>Token d&apos;accès permanent</b> via les paramètres d&apos;entreprise (Système users).
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* WhatsApp Inputs */}
                                    <div className="bg-[#1a1614] p-8 rounded-2xl border border-[#2d2622] space-y-8">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            <div className="space-y-3">
                                                <label className="text-sm font-medium text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-sm text-[#25D366]">key</span>
                                                    Token Permanent WhatsApp
                                                </label>
                                                <input
                                                    className="w-full bg-[#0f0d0c] border border-[#2d2622] rounded-xl px-4 py-3 font-mono text-sm text-slate-200 outline-none focus:ring-1 focus:ring-[#25D366]/50"
                                                    type="password"
                                                    placeholder="EAAl..."
                                                    value={whatsappToken}
                                                    onChange={(e) => setWhatsappToken(e.target.value)}
                                                />
                                            </div>

                                            <div className="space-y-3">
                                                <label className="text-sm font-medium text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-sm text-[#25D366]">phone_iphone</span>
                                                    Phone Number ID
                                                </label>
                                                <div className="flex gap-3">
                                                    <input
                                                        className="flex-1 bg-[#0f0d0c] border border-[#2d2622] rounded-xl px-4 py-3 font-mono text-sm text-slate-200 outline-none focus:ring-1 focus:ring-[#25D366]/50"
                                                        type="text"
                                                        placeholder="1029384756..."
                                                        value={whatsappPhoneId}
                                                        onChange={(e) => setWhatsappPhoneId(e.target.value)}
                                                    />
                                                    <button
                                                        onClick={handleWhatsAppTest}
                                                        disabled={isTestingWhatsApp}
                                                        className="px-6 bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/20 rounded-xl text-[#25D366] transition-all disabled:opacity-50 flex items-center gap-2 font-bold text-xs shrink-0"
                                                    >
                                                        {isTestingWhatsApp ? <Loader2 className="animate-spin size-4" /> : <span className="material-symbols-outlined text-lg">send</span>}
                                                        {isTestingWhatsApp ? "Test..." : "Tester"}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="pt-10 flex justify-end">
                                    <button
                                        onClick={handleSave}
                                        disabled={isSaving}
                                        className="bg-[#ec5b13] hover:bg-orange-600 text-white px-8 py-4 rounded-xl font-bold text-base shadow-lg shadow-[#ec5b13]/40 transition-all flex items-center gap-3 disabled:opacity-50"
                                    >
                                        {isSaving ? <Loader2 className="animate-spin size-5" /> : <Save className="size-5" />}
                                        {isSaving ? "Sauvegarde..." : "Sauvegarder les modifications"}
                                    </button>
                                </div>
                            </section>
                        </div>
                    )}

                    {activeTab === "receipt" && (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="flex flex-col lg:flex-row gap-12">
                                {/* Form Column */}
                                <section className="lg:w-3/5 space-y-8">
                                    <div className="bg-[#161616] p-8 rounded-2xl border border-[#2d2622] shadow-xl">
                                        <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-[#ec5b13]">print</span>
                                            Paramètres d&apos;Impression (Ticket Thermique)
                                        </h2>
                                        <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className="space-y-2">
                                                    <label className="text-sm text-slate-400 font-medium">Nom de la boutique</label>
                                                    <input
                                                        className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl px-4 py-3 focus:ring-1 focus:ring-[#ec5b13] transition-all outline-none text-white"
                                                        type="text"
                                                        value={shopName}
                                                        onChange={(e) => setShopName(e.target.value)}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-sm text-slate-400 font-medium">Téléphone</label>
                                                    <input
                                                        className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl px-4 py-3 focus:ring-1 focus:ring-[#ec5b13] transition-all outline-none text-white"
                                                        type="text"
                                                        value={shopTel}
                                                        onChange={(e) => setShopTel(e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm text-slate-400 font-medium">Adresse</label>
                                                <input
                                                    className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl px-4 py-3 focus:ring-1 focus:ring-[#ec5b13] transition-all outline-none text-white"
                                                    type="text"
                                                    value={shopAddress}
                                                    onChange={(e) => setShopAddress(e.target.value)}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm text-slate-400 font-medium">Message de pied de page</label>
                                                <textarea
                                                    className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl px-4 py-3 focus:ring-1 focus:ring-[#ec5b13] transition-all outline-none text-white"
                                                    rows={3}
                                                    value={footerMessage}
                                                    onChange={(e) => setFooterMessage(e.target.value)}
                                                />
                                            </div>

                                            <div className="pt-4 space-y-4">
                                                <div className="flex items-center justify-between p-4 bg-black/50 rounded-xl border border-[#262626]/50">
                                                    <div>
                                                        <p className="font-bold text-sm">Afficher le nom du caissier</p>
                                                        <p className="text-xs text-slate-500">Ajoute le nom de l&apos;utilisateur actif sur le ticket</p>
                                                    </div>
                                                    <label className="custom-switch">
                                                        <input
                                                            type="checkbox"
                                                            checked={showCashier}
                                                            onChange={(e) => setShowCashier(e.target.checked)}
                                                        />
                                                        <span className="slider"></span>
                                                    </label>
                                                </div>
                                                <div className="flex items-center justify-between p-4 bg-black/50 rounded-xl border border-[#262626]/50">
                                                    <div>
                                                        <p className="font-bold text-sm">Date et Heure d&apos;impression</p>
                                                        <p className="text-xs text-slate-500">Obligatoire pour la conformité fiscale</p>
                                                    </div>
                                                    <label className="custom-switch">
                                                        <input
                                                            type="checkbox"
                                                            checked={showDateTime}
                                                            onChange={(e) => setShowDateTime(e.target.checked)}
                                                        />
                                                        <span className="slider"></span>
                                                    </label>
                                                </div>
                                                <div className="flex items-center justify-between p-4 bg-black/50 rounded-xl border border-[#262626]/50">
                                                    <div>
                                                        <p className="font-bold text-sm">Afficher le Logo</p>
                                                        <p className="text-xs text-slate-500">Imprimer le logo au format monochrome</p>
                                                    </div>
                                                    <label className="custom-switch">
                                                        <input
                                                            type="checkbox"
                                                            checked={showLogo}
                                                            onChange={(e) => setShowLogo(e.target.checked)}
                                                        />
                                                        <span className="slider"></span>
                                                    </label>
                                                </div>
                                            </div>

                                            <button
                                                onClick={handleSave}
                                                disabled={isSaving}
                                                className="w-full bg-[#ec5b13] hover:bg-orange-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-[#ec5b13]/20 transition-all transform active:scale-[0.98] mt-8 flex items-center justify-center gap-2 disabled:opacity-50"
                                                type="button"
                                            >
                                                {isSaving ? <Loader2 className="animate-spin size-5" /> : <Save className="size-5" />}
                                                {isSaving ? "ENREGISTREMENT..." : "ENREGISTRER LES MODIFICATIONS"}
                                            </button>
                                        </form>
                                    </div>
                                </section>

                                {/* Preview Column */}
                                <section className="lg:w-2/5 flex flex-col items-center">
                                    <div className="sticky top-40 w-full flex flex-col items-center">
                                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-8">Aperçu du Ticket (80mm)</h3>

                                        <div className="ticket-paper w-[320px] p-6 font-mono text-[13px] leading-tight select-none">
                                            <div className="text-center mb-4 text-black">
                                                {showLogo && (
                                                    <div className="mb-4 flex justify-center grayscale contrast-[200%]">
                                                        <NextImage src={logoUrl || "https://lh3.googleusercontent.com/aida-public/AB6AXuAc0N62EzEzZzBI60NaoTtEF00tJ4ruXHAprleWW2Ek0c_HJiYCXwfN8trT6eQnjQrV5nE_-fyuuJosSJb_iytbtbNGp-K0Wd6vX-CPo20bhzT8S_St7llE3bP8PuJTX3ksNDuaag3oCbGIG_lZUwYPpyNcDhS-ZZsyPgxdx6s6c1GGpOhrqGqPdgtDJu-cj6Xz_MqFfmz6rBVYDmiePw407Len9Q5yGIf3OUX-df_CRLX9jEKC9xgO2mOWd1gftB6LcGqkoR0lqGU5"} alt="Logo" width={100} height={48} className="h-12 w-auto grayscale contrast-[200%]" />
                                                    </div>
                                                )}
                                                <p className="text-lg font-bold mb-1 uppercase">{shopName}</p>
                                                <p className="text-[11px] leading-none mb-1">{shopAddress}</p>
                                                <p className="text-[11px]">Tel: {shopTel}</p>
                                                <p className="mt-2 text-[11px]">--------------------------------</p>
                                            </div>

                                            <div className="mb-4 text-black">
                                                <div className="flex justify-between">
                                                    <span>Commande:</span>
                                                    <span className="font-bold">#C42</span>
                                                </div>
                                                {showDateTime && (
                                                    <div className="flex justify-between">
                                                        <span>Date:</span>
                                                        <span>14/03/2026 14:35</span>
                                                    </div>
                                                )}
                                                {showCashier && (
                                                    <div className="flex justify-between">
                                                        <span>Caissier:</span>
                                                        <span>Admin</span>
                                                    </div>
                                                )}
                                                <p className="text-[11px] mt-1 text-center font-bold">--------------------------------</p>
                                            </div>

                                            <div className="space-y-3 mb-6 text-black">
                                                <div>
                                                    <div className="flex justify-between font-bold">
                                                        <span>1x Netflix 1 Mois</span>
                                                        <span className="whitespace-nowrap font-black">{formatCurrency(1500, 'DZD')}</span>
                                                    </div>
                                                    <div className="text-[11px] mt-0.5 bg-gray-100 p-1.5 rounded-md font-bold">
                                                        [CODE]: A1B2-C3D4-E5F6
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="flex justify-between font-bold">
                                                        <span>3x PSN 20$</span>
                                                        <span className="whitespace-nowrap font-black">{formatCurrency(13500, 'DZD')}</span>
                                                    </div>
                                                    <div className="text-[11px] mt-0.5 space-y-0.5 bg-gray-100 p-1.5 rounded-md font-bold">
                                                        <p>[CODE 1/3]: P8X2-L9M3-QW12</p>
                                                        <p>[CODE 2/3]: Z4V7-K0J5-RT99</p>
                                                        <p>[CODE 3/3]: N1Y4-U6B8-GH44</p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="border-t border-dashed border-black pt-4 mb-6 text-center text-black">
                                                <p className="text-[10px] uppercase tracking-[0.2em] font-bold">Total à payer</p>
                                                <p className="text-2xl font-black mt-1">{formatCurrency(15000, 'DZD')}</p>
                                            </div>

                                            <div className="text-center italic text-[11px] leading-snug text-black">
                                                {footerMessage.split('\n').map((line, i) => (
                                                    <p key={i}>{line}</p>
                                                ))}
                                                <div className="mt-4 opacity-50 font-bold">
                                                    <p>**** FIN DU TICKET ****</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-12 text-slate-500 text-xs font-bold flex items-center gap-2 uppercase tracking-widest">
                                            <span className="material-symbols-outlined text-sm">info</span>
                                            L&apos;aperçu est mis à jour en temps réel
                                        </div>
                                    </div>
                                </section>
                            </div>
                        </div>
                    )}

                    {activeTab === "appearance" && (
                        <div className="max-w-4xl space-y-12 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            {/* Section: Couleur d'accentuation */}
                            <section className="space-y-6">
                                <div className="flex flex-col gap-1">
                                    <h2 className="text-xl font-bold text-white">Couleur d&apos;accentuation</h2>
                                    <p className="text-sm text-slate-400">Personnalisez la couleur principale de votre interface admin.</p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                                    <div className="space-y-6">
                                        <div className="flex flex-wrap gap-4 items-center">
                                            <button onClick={() => setAccentColor("#ec5b13")} className={`w-10 h-10 rounded-full bg-[#ec5b13] transition-all hover:scale-110 shrink-0 ${accentColor === "#ec5b13" ? "border-4 border-white/20 ring-2 ring-[#ec5b13] ring-offset-4 ring-offset-[#0f0d0c]" : ""}`}></button>
                                            <button onClick={() => setAccentColor("#4169e1")} className={`w-10 h-10 rounded-full bg-[#4169e1] transition-all hover:scale-110 shrink-0 ${accentColor === "#4169e1" ? "border-4 border-white/20 ring-2 ring-[#4169e1] ring-offset-4 ring-offset-[#0f0d0c]" : ""}`}></button>
                                            <button onClick={() => setAccentColor("#10b981")} className={`w-10 h-10 rounded-full bg-[#10b981] transition-all hover:scale-110 shrink-0 ${accentColor === "#10b981" ? "border-4 border-white/20 ring-2 ring-[#10b981] ring-offset-4 ring-offset-[#0f0d0c]" : ""}`}></button>
                                            <button onClick={() => setAccentColor("#8b5cf6")} className={`w-10 h-10 rounded-full bg-[#8b5cf6] transition-all hover:scale-110 shrink-0 ${accentColor === "#8b5cf6" ? "border-4 border-white/20 ring-2 ring-[#8b5cf6] ring-offset-4 ring-offset-[#0f0d0c]" : ""}`}></button>
                                            <button onClick={() => setAccentColor("#ef4444")} className={`w-10 h-10 rounded-full bg-[#ef4444] transition-all hover:scale-110 shrink-0 ${accentColor === "#ef4444" ? "border-4 border-white/20 ring-2 ring-[#ef4444] ring-offset-4 ring-offset-[#0f0d0c]" : ""}`}></button>
                                        </div>
                                        <div className="max-w-xs">
                                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Code Hexadécimal</label>
                                            <div className="relative flex items-center group">
                                                <span className="absolute left-3 text-slate-400 group-focus-within:text-[#ec5b13] transition-colors">#</span>
                                                <input
                                                    className="w-full bg-[#1a1614] border border-[#2d2622] rounded-xl pl-7 pr-12 py-3 text-white focus:ring-1 focus:ring-[#ec5b13] focus:border-[#ec5b13] outline-none transition-all"
                                                    type="text"
                                                    value={accentColor.replace('#', '')}
                                                    onChange={(e) => setAccentColor('#' + e.target.value)}
                                                />
                                                <span className="material-symbols-outlined absolute right-3 text-slate-400 cursor-pointer hover:text-white shrink-0">palette</span>
                                            </div>
                                        </div>
                                    </div>
                                    {/* Preview Area */}
                                    <div className="p-6 bg-[#1a1614]/50 border border-[#2d2622] rounded-2xl flex flex-col items-center justify-center gap-6">
                                        <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Aperçu en direct</span>
                                        <div className="flex flex-col items-center gap-4">
                                            <button className="bg-[#ec5b13] hover:bg-[#ec5b13]/90 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-[#ec5b13]/20 transition-all shrink-0">
                                                Bouton Primaire
                                            </button>
                                            <span className="px-3 py-1 bg-[#ec5b13]/20 text-[#ec5b13] text-xs font-bold rounded-full border border-[#ec5b13]/30 shrink-0">
                                                Badge Actif
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <hr className="border-[#2d2622]" />

                            {/* Section: Logos et Icônes */}
                            <section className="space-y-6">
                                <div className="flex flex-col gap-1">
                                    <h2 className="text-xl font-bold text-white">Logos et Icônes</h2>
                                    <p className="text-sm text-slate-400">Importez vos éléments visuels pour une interface à votre image.</p>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                                    {/* Dark Dashboard Logo */}
                                    <div
                                        onClick={() => dashboardLogoInputRef.current?.click()}
                                        className="group relative flex flex-col items-center justify-center p-6 bg-[#1a1614] border-2 border-dashed border-[#2d2622] hover:border-[#ec5b13]/50 rounded-2xl transition-all cursor-pointer overflow-hidden"
                                    >
                                        <input
                                            type="file"
                                            ref={dashboardLogoInputRef}
                                            className="hidden"
                                            accept="image/*"
                                            onChange={(e) => handleLogoFileChange(e, 'dashboard')}
                                        />
                                        {isUploadingDashboardLogo ? (
                                            <Loader2 className="animate-spin text-[#ec5b13] size-8 mb-3" />
                                        ) : dashboardLogoUrl ? (
                                            <div className="mb-3 h-12 flex items-center justify-center w-full">
                                                <NextImage src={dashboardLogoUrl} className="object-contain" alt="Dashboard Logo" width={120} height={48} />
                                            </div>
                                        ) : (
                                            <span className="material-symbols-outlined text-3xl text-slate-500 group-hover:text-[#ec5b13] mb-3">upload_file</span>
                                        )}
                                        <span className="text-xs font-bold text-center text-slate-300">Logo Dashboard (Dark)</span>
                                        <span className="text-[10px] text-slate-500 mt-1 uppercase">SVG, PNG (Max 2MB)</span>
                                    </div>

                                    {/* Light Terminal Logo */}
                                    <div
                                        onClick={() => logoInputRef.current?.click()}
                                        className="group relative flex flex-col items-center justify-center p-6 bg-white/5 border-2 border-dashed border-[#2d2622] hover:border-[#ec5b13]/50 rounded-2xl transition-all cursor-pointer overflow-hidden"
                                    >
                                        {isUploadingLogo ? (
                                            <Loader2 className="animate-spin text-[#ec5b13] size-8 mb-3" />
                                        ) : logoUrl ? (
                                            <div className="mb-3 h-12 flex items-center justify-center w-full">
                                                <NextImage src={logoUrl} className="object-contain" alt="Terminal Logo" width={120} height={48} />
                                            </div>
                                        ) : (
                                            <span className="material-symbols-outlined text-3xl text-slate-500 group-hover:text-[#ec5b13] mb-3">upload_file</span>
                                        )}
                                        <span className="text-xs font-bold text-center text-slate-300">Logo Borne Client (Light)</span>
                                        <span className="text-[10px] text-slate-500 mt-1 uppercase">SVG, PNG (Max 2MB)</span>
                                    </div>

                                    {/* Favicon */}
                                    <div
                                        onClick={() => faviconInputRef.current?.click()}
                                        className="group relative flex flex-col items-center justify-center p-6 bg-[#1a1614] border-2 border-dashed border-[#2d2622] hover:border-[#ec5b13]/50 rounded-2xl transition-all cursor-pointer overflow-hidden"
                                    >
                                        <input
                                            type="file"
                                            ref={faviconInputRef}
                                            className="hidden"
                                            accept="image/*"
                                            onChange={(e) => handleLogoFileChange(e, 'favicon')}
                                        />
                                        {isUploadingFavicon ? (
                                            <Loader2 className="animate-spin text-[#ec5b13] size-8 mb-3" />
                                        ) : faviconUrl ? (
                                            <div className="mb-3 size-10 flex items-center justify-center">
                                                <NextImage src={faviconUrl} className="object-contain" alt="Favicon" width={40} height={40} />
                                            </div>
                                        ) : (
                                            <span className="material-symbols-outlined text-3xl text-slate-500 group-hover:text-[#ec5b13] mb-3">branding_watermark</span>
                                        )}
                                        <span className="text-xs font-bold text-center text-slate-300">Favicon</span>
                                        <span className="text-[10px] text-slate-500 mt-1 uppercase">ICO, PNG (32x32px)</span>
                                    </div>
                                </div>
                            </section>

                            <hr className="border-[#2d2622]" />

                            {/* Section: Personnalisation du Ticket */}
                            <section className="space-y-6">
                                <div className="flex flex-col gap-1">
                                    <h2 className="text-xl font-bold text-white">Personnalisation du Ticket</h2>
                                    <p className="text-sm text-slate-400">Configurez l&apos;apparence des tickets imprimés en caisse.</p>
                                </div>
                                <div className="space-y-6 max-w-2xl">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-400">Message de remerciement</label>
                                        <textarea
                                            className="w-full bg-[#1a1614] border border-[#2d2622] rounded-xl px-4 py-3 focus:ring-1 focus:ring-[#ec5b13] focus:border-transparent transition-all outline-none text-slate-100"
                                            rows={2}
                                            value={footerMessage}
                                            onChange={(e) => setFooterMessage(e.target.value)}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between p-4 bg-[#1a1614] border border-[#2d2622] rounded-xl">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-sm font-bold text-white">Afficher le logo sur le ticket</span>
                                            <span className="text-xs text-slate-500">Ajoute votre logo au sommet du ticket thermique</span>
                                        </div>
                                        <label className="custom-switch">
                                            <input
                                                type="checkbox"
                                                checked={showLogo}
                                                onChange={(e) => setShowLogo(e.target.checked)}
                                            />
                                            <span className="slider"></span>
                                        </label>
                                    </div>
                                </div>
                            </section>
                            <div className="pt-10 flex justify-end">
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="bg-[#ec5b13] hover:bg-orange-600 text-white px-8 py-4 rounded-xl font-bold text-base shadow-lg shadow-[#ec5b13]/40 transition-all flex items-center gap-3 disabled:opacity-50"
                                >
                                    {isSaving ? <Loader2 className="animate-spin size-5" /> : <Save className="size-5" />}
                                    {isSaving ? "Sauvegarde..." : "Sauvegarder les modifications"}
                                </button>
                            </div>
                        </div>
                    )}
                    {activeTab === "b2b" && (
                        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            {/* B2B Sub Tabs */}
                            <div className="flex gap-4 p-1 bg-[#1a1614] w-fit rounded-xl border border-[#2d2622]">
                                <button
                                    onClick={() => setB2bSubTab("config")}
                                    className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${b2bSubTab === "config" ? "bg-[#ec5b13] text-white" : "text-slate-400 hover:text-white"}`}
                                >
                                    Configuration
                                </button>
                                <button
                                    onClick={() => setB2bSubTab("manage")}
                                    className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${b2bSubTab === "manage" ? "bg-[#ec5b13] text-white" : "text-slate-400 hover:text-white"}`}
                                >
                                    Gestion des Revendeurs
                                </button>
                            </div>

                            {b2bSubTab === "config" ? (
                                <section className="max-w-4xl space-y-8">
                                    <div className="bg-[#1a1614] p-8 rounded-2xl border border-[#2d2622] space-y-8">
                                        <div className="flex items-center justify-between p-4 bg-orange-500/5 border border-orange-500/10 rounded-xl">
                                            <div className="flex items-center gap-4">
                                                <div className="size-12 rounded-full bg-orange-500/20 flex items-center justify-center">
                                                    <Store className="size-6 text-[#ec5b13]" />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-base font-bold text-white">Activer le Portail B2B</span>
                                                    <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Permettre l&apos;accès aux partenaires revendeurs</span>
                                                </div>
                                            </div>
                                            <label className="custom-switch">
                                                <input
                                                    type="checkbox"
                                                    checked={isB2bEnabled}
                                                    onChange={(e) => setIsB2bEnabled(e.target.checked)}
                                                />
                                                <span className="slider"></span>
                                            </label>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            <div className="space-y-3">
                                                <label className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                    <Percent className="size-4 text-orange-400" />
                                                    Remise par défaut (%)
                                                </label>
                                                <input
                                                    className="w-full bg-[#0f0d0c] border border-[#2d2622] rounded-xl px-4 py-3 text-slate-200 outline-none focus:ring-1 focus:ring-orange-500/50"
                                                    type="number"
                                                    step="0.01"
                                                    value={defaultResellerDiscount}
                                                    onChange={(e) => setDefaultResellerDiscount(e.target.value)}
                                                />
                                                <p className="text-[10px] text-slate-500 italic">Appliquée à tous les revendeurs n&apos;ayant pas de remise personnalisée.</p>
                                            </div>

                                            <div className="space-y-3">
                                                <label className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                    <Coins className="size-4 text-orange-400" />
                                                    Recharge Minimum (DZD)
                                                </label>
                                                <input
                                                    className="w-full bg-[#0f0d0c] border border-[#2d2622] rounded-xl px-4 py-3 text-slate-200 outline-none focus:ring-1 focus:ring-orange-500/50"
                                                    type="number"
                                                    value={minResellerRecharge}
                                                    onChange={(e) => setMinResellerRecharge(e.target.value)}
                                                />
                                                <p className="text-[10px] text-slate-500 italic">Montant minimum pour un dépôt de crédit B2B.</p>
                                            </div>
                                        </div>

                                        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-start gap-4">
                                            <AlertTriangle className="size-5 text-blue-400 shrink-0 mt-0.5" />
                                            <div className="space-y-1">
                                                <p className="text-sm font-bold text-blue-300">Mode de fonctionnement</p>
                                                <p className="text-xs text-blue-200/70 leading-relaxed">
                                                    Une fois activé, les revendeurs pourront se connecter à leur interface dédiée.
                                                    Leurs commandes seront payées via leur <b>Wallet Pré-payé</b>. Assurez-vous d&apos;avoir configuré les prix grossistes.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex justify-end">
                                        <button
                                            onClick={handleSave}
                                            disabled={isSaving}
                                            className="bg-[#ec5b13] hover:bg-orange-600 text-white px-8 py-4 rounded-xl font-bold text-base shadow-lg shadow-[#ec5b13]/40 transition-all flex items-center gap-3 disabled:opacity-50"
                                        >
                                            {isSaving ? <Loader2 className="animate-spin size-5" /> : <Save className="size-5" />}
                                            Sauvegarder la configuration B2B
                                        </button>
                                    </div>
                                </section>
                            ) : (
                                <section className="space-y-6">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="text-lg font-bold">Gestion des Partenaires</h3>
                                            <p className="text-sm text-slate-400 mt-1">Gérez vos revendeurs, leurs soldes et leurs accès dans le module dédié.</p>
                                        </div>
                                        <Link
                                            href="/admin/b2b"
                                            className="bg-[#ec5b13] hover:bg-orange-600 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-lg shadow-orange-950/20 transition-all flex items-center gap-2"
                                        >
                                            <Building2 className="size-4" />
                                            Accéder à la Gestion B2B
                                        </Link>
                                    </div>

                                    <div className="bg-[#1a1614] border border-[#2d2622] rounded-3xl p-8 flex flex-col items-center justify-center gap-6 text-center">
                                        <div className="size-20 rounded-2xl bg-[#0a0a0a] border border-[#2d2622] flex items-center justify-center">
                                            <Users className="size-10 text-[#ec5b13]" />
                                        </div>
                                        <div className="space-y-2">
                                            <h4 className="text-xl font-bold text-white">Module Partenaires Déporté</h4>
                                            <p className="text-slate-400 max-w-md mx-auto text-sm leading-relaxed">
                                                La gestion des revendeurs a été déplacée vers une page dédiée pour offrir une interface plus complète et performante.
                                            </p>
                                        </div>
                                        <Button
                                            as={Link}
                                            href="/admin/b2b"
                                            variant="bordered"
                                            className="border-[#2d2622] text-slate-300 font-bold px-10 rounded-xl hover:bg-white/5"
                                        >
                                            Ouvrir la liste des partenaires
                                        </Button>
                                    </div>
                                </section>
                            )}
                        </div>
                    )}
                </div>
            </main>

            <AddMemberModal
                isOpen={isOpen}
                onOpenChange={onOpenChange}
            />

            <EditMemberModal
                isOpen={isEditModalOpen}
                onOpenChange={setIsEditModalOpen}
                member={selectedMember}
                onSuccess={fetchInitialData}
            />

        </div>
    );
}
