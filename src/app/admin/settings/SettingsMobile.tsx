"use client";

import React from "react";
import NextImage from "next/image";

import {
    User,
    Shield,
    Palette,
    Store,
    Bell,
    LogOut,
    ChevronRight,
    Smartphone,
    CreditCard,
    Users,
    KeyRound,
    Group,
    UserCircle,
    Truck,
    Headset,
    LayoutDashboard,
    ShieldAlert,
    Power,
    Globe,
    Lock,
    Save,
    Percent,
    Coins,
    Building2,
    Trash2,
    Download,
    AlertTriangle,
    RefreshCw,
    History,
    Zap,
    FileJson,
    FileSpreadsheet,
    Loader2,
    MessageCircleQuestion
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "react-hot-toast";
import { useSettingsStore } from "@/store/useSettingsStore";
import {
    getUsersAction,
    deleteUserAction,
    getShopSettingsAction,
    saveShopSettingsAction,
    generateMfaSecretAction,
    enableMfaAction,
    disableMfaAction,
    resetProductionDataAction,
    exportDatabaseAction,
    getAuditLogsAction,
    exportAuditLogsAction,
    generateBackupCodesAction,
    testN8nAction
} from "./actions";
import { uploadImage } from "@/app/admin/actions/upload";
import { AddMemberModal } from "@/components/admin/modals/AddMemberModal";
import { EditMemberModal } from "@/components/admin/modals/EditMemberModal";
import { Spinner, Button, Card, CardBody, Input, Textarea, Switch } from "@heroui/react";
import { ReceiptSettings } from "@/components/admin/settings/ReceiptSettings";
import { ApiBotSettings } from "@/components/admin/settings/ApiBotSettings";
import { FaqBotSettings } from "@/components/admin/settings/FaqBotSettings";
import { QRCodeSVG } from "qrcode.react";
import PushNotificationManager from "@/components/admin/push/PushNotificationManager";

export default function SettingsMobile() {
    const clearAuth = useAuthStore((state) => state.clearAuth);
    const user = useAuthStore((state) => state.user);
    const updateGlobalSettings = useSettingsStore((state) => state.updateSettings);
    const router = useRouter();
    const [view, setView] = React.useState<"HUB" | "TEAM" | "SHOP" | "RECEIPT" | "SECURITY" | "API" | "FAQ" | "APPEARANCE" | "AUDIT_LOGS">("HUB");
    const [usersList, setUsersList] = React.useState<any[]>([]);
    const [isLoadingUsers, setIsLoadingUsers] = React.useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = React.useState(false);
    const [selectedMember, setSelectedMember] = React.useState<any>(null);

    // MFA State
    const [mfaQrCode, setMfaQrCode] = React.useState<string | null>(null);
    const [mfaSecret, setMfaSecret] = React.useState<string | null>(null);
    const [mfaInputCode, setMfaInputCode] = React.useState("");
    const [isMfaEnabling, setIsMfaEnabling] = React.useState(false);

    // Shop Settings State
    const [shopData, setShopData] = React.useState<any>(null);
    const [isSavingShop, setIsSavingShop] = React.useState(false);
    const [isResetting, setIsResetting] = React.useState(false);
    const [isExportingDb, setIsExportingDb] = React.useState(false);
    const [resetConfirmation, setResetConfirmation] = React.useState("");
    const [backupCodes, setBackupCodes] = React.useState<string[] | null>(null);
    const [isGeneratingCodes, setIsGeneratingCodes] = React.useState(false);

    // Audit Log States
    const [auditLogs, setAuditLogs] = React.useState<any[]>([]);
    const [isAuditLoading, setIsAuditLoading] = React.useState(false);
    const [isExportingLogs, setIsExportingLogs] = React.useState(false);

    // Appearance State & Refs
    const [isUploadingLogo, setIsUploadingLogo] = React.useState(false);
    const [isUploadingDashboardLogo, setIsUploadingDashboardLogo] = React.useState(false);
    const [isUploadingFavicon, setIsUploadingFavicon] = React.useState(false);
    const logoInputRef = React.useRef<HTMLInputElement>(null);
    const dashboardLogoInputRef = React.useRef<HTMLInputElement>(null);
    const faviconInputRef = React.useRef<HTMLInputElement>(null);

    // Additional States
    const [isTestingN8n, setIsTestingN8n] = React.useState(false);

    const loadUsers = async () => {
        setIsLoadingUsers(true);
        const res = await getUsersAction({});
        if (res.success) setUsersList(res.data as any[]);
        setIsLoadingUsers(false);
    };

    const loadShopSettings = async () => {
        const res = await getShopSettingsAction({});
        if (res.success) {
            setShopData(res.data);
            return res.data;
        }
        return null;
    };

    React.useEffect(() => {
        if (view === "TEAM") loadUsers();
        if (view === "SHOP" || view === "SECURITY" || view === "API" || view === "APPEARANCE") loadShopSettings();
        if (view === "AUDIT_LOGS") fetchAuditLogs();
    }, [view]);

    const fetchAuditLogs = async () => {
        setIsAuditLoading(true);
        try {
            const res: any = await getAuditLogsAction({});
            if (res.success) setAuditLogs(res.data || []);
        } catch (err) {
            toast.error("Erreur logs");
        } finally {
            setIsAuditLoading(false);
        }
    };

    const handleGenerateMfa = async () => {
        const res = await generateMfaSecretAction({});
        if (res.success) {
            setMfaQrCode(res.data.otpauth);
            setMfaSecret(res.data.secret);
        }
    };

    const handleEnableMfa = async () => {
        if (!mfaSecret) return;
        setIsMfaEnabling(true);
        const res = await enableMfaAction({ secret: mfaSecret, code: mfaInputCode });
        if (res.success) {
            toast.success("2FA activé !");
            setMfaQrCode(null);
            setMfaSecret(null);
            setMfaInputCode("");
            loadShopSettings();
        } else {
            toast.error(res.error || "Code invalide");
        }
        setIsMfaEnabling(false);
    };

    const handleDisableMfa = async () => {
        if (confirm("Désactiver le 2FA ?")) {
            const res = await disableMfaAction({});
            if (res.success) {
                toast.success("2FA désactivé");
                loadShopSettings();
            }
        }
    };

    const handleGenerateBackupCodes = async () => {
        setIsGeneratingCodes(true);
        try {
            const res: any = await generateBackupCodesAction({});
            if (res.success) {
                setBackupCodes(res.data);
                toast.success("Codes de secours générés");
            }
        } catch (err) {
            toast.error("Erreur codes");
        } finally {
            setIsGeneratingCodes(false);
        }
    };

    const handleExportLogs = async (format: 'csv' | 'json') => {
        setIsExportingLogs(true);
        try {
            const res: any = await exportAuditLogsAction({});
            if (res.success) {
                const data = res.data;
                let blob;
                let filename;
                const ts = new Date().toISOString().replace(/[:.]/g, '-');
                if (format === 'json') {
                    blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    filename = `audit_logs_${ts}.json`;
                } else {
                    const headers = "ID,User,Action,Entity,Date,IP\n";
                    const rows = data.map((l: any) => `${l.id},"${l.user?.nom || 'System'}","${l.action}","${l.entityType || ''}",${l.createdAt},${l.ipAddress}`).join("\n");
                    blob = new Blob([headers + rows], { type: 'text/csv' });
                    filename = `audit_logs_${ts}.csv`;
                }
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                a.click();
            }
        } catch (err) {
            toast.error("Erreur export");
        } finally {
            setIsExportingLogs(false);
        }
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
                if (target === 'logo') setShopData({ ...shopData, logoUrl: res.url });
                else if (target === 'dashboard') {
                    setShopData({ ...shopData, dashboardLogoUrl: res.url });
                    updateGlobalSettings({ dashboardLogoUrl: res.url });
                }
                else if (target === 'favicon') {
                    setShopData({ ...shopData, faviconUrl: res.url });
                    updateGlobalSettings({ faviconUrl: res.url });
                }
                toast.success("Image mise à jour");
            } else {
                toast.error("Erreur upload");
            }
        } catch (err) {
            toast.error("Erreur connexion upload");
        } finally {
            if (target === 'logo') setIsUploadingLogo(false);
            else if (target === 'dashboard') setIsUploadingDashboardLogo(false);
            else if (target === 'favicon') setIsUploadingFavicon(false);
        }
    };

    const handleTestN8n = async () => {
        setIsTestingN8n(true);
        try {
            const res = await testN8nAction({});
            if (res.success) {
                toast.success(res.message || "Test n8n réussi !");
            } else {
                toast.error(res.error || "Échec test n8n");
            }
        } catch (err) {
            toast.error("Erreur technique n8n");
        } finally {
            setIsTestingN8n(false);
        }
    };

    const handleSaveShop = async () => {
        setIsSavingShop(true);
        const res = await saveShopSettingsAction(shopData);
        if (res.success) {
            toast.success("Réglages enregistrés");
            setView("HUB");
        } else if ("error" in res) {
            toast.error(res.error || "Erreur sauvegarde");
        } else {
            toast.error("Erreur sauvegarde");
        }
        setIsSavingShop(false);
    };

    const toggleMaintenance = async (val: boolean) => {
        const res = await saveShopSettingsAction({ ...shopData, isMaintenanceMode: val });
        if (res.success) {
            setShopData({ ...shopData, isMaintenanceMode: val });
            toast.success(val ? "Maintenance Activée" : "Maintenance Désactivée");
        }
    };

    const handleDeleteUser = async (id: number) => {
        if (confirm("Supprimer ce membre ?")) {
            const res = await deleteUserAction({ id });
            if (res.success) {
                toast.success("Membre supprimé");
                loadUsers();
            } else if ("error" in res) {
                toast.error(res.error || "Erreur suppression");
            } else {
                toast.error("Erreur suppression");
            }
        }
    };

    const handleLogout = async () => {
        await clearAuth();
        toast.success("Déconnecté");
        router.push("/admin/login");
    };

    const handleExportDatabase = async () => {
        setIsExportingDb(true);
        try {
            const res = await exportDatabaseAction({});
            if (res.success && res.data) {
                const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `database_backup_mobile_${new Date().toISOString().split('T')[0]}.json`;
                a.click();
                toast.success("Base de données exportée");
            } else {
                toast.error(res.error || "Erreur export");
            }
        } catch (err) {
            toast.error("Erreur de connexion");
        } finally {
            setIsExportingDb(false);
        }
    };

    const handleProductionReset = async () => {
        if (resetConfirmation !== "PERMANENT DELETE") {
            toast.error("Veuillez saisir le texte de confirmation");
            return;
        }

        if (!confirm("EFFACER TOUTE LA PRODUCTION ? Cette action est irréversible.")) return;

        setIsResetting(true);
        try {
            const res = await resetProductionDataAction({ confirmation: resetConfirmation });
            if (res.success) {
                toast.success("Système réinitialisé");
                setResetConfirmation("");
                window.location.reload();
            } else {
                toast.error(res.error || "Erreur reset");
            }
        } catch (err) {
            toast.error("Erreur de connexion");
        } finally {
            setIsResetting(false);
        }
    };

    const { isB2bEnabled } = useSettingsStore();

    const hubGroups = [
        {
            title: "Gestion Quotidienne",
            items: [
                { name: "Dashboard", icon: LayoutDashboard, color: "text-blue-400", bg: "bg-blue-400/10", href: "/admin", desc: "Statistiques & Revenus", roles: ["ADMIN", "CAISSIER", "TRAITEUR"] },
                { name: "Clients & Crédits", icon: UserCircle, color: "text-indigo-400", bg: "bg-indigo-400/10", href: "/admin/clients", desc: "Dettes & Paiements", roles: ["ADMIN", "CAISSIER"] },
                { name: "Fournisseurs", icon: Truck, color: "text-pink-400", bg: "bg-pink-400/10", href: "/admin/fournisseurs", desc: "Balances & Flux", roles: ["ADMIN"] },
                { name: "Comptes Partagés", icon: Group, color: "text-orange-400", bg: "bg-orange-400/10", href: "/admin/comptes-partages", desc: "Inventaire & Slots", roles: ["ADMIN", "CAISSIER"] },
                { name: "Tickets Support", icon: Headset, color: "text-red-400", bg: "bg-red-400/10", href: "/admin/support", desc: "Plaintes & SAV", roles: ["ADMIN", "CAISSIER", "TRAITEUR"] },
            ]
        },
        {
            title: "Configuration Boutique",
            items: [
                { name: "Identité Boutique", icon: Store, color: "text-blue-500", bg: "bg-blue-500/10", desc: "Infos, Logos, Coordonnées", roles: ["ADMIN"] },
                { name: "Équipe & Accès", icon: Users, color: "text-[#ec5b13]", bg: "bg-[#ec5b13]/10", desc: "Membres, Rôles, Permissions", roles: ["ADMIN"] },
                ...(isB2bEnabled ? [{ name: "B2B & Partners", icon: Smartphone, color: "text-emerald-500", bg: "bg-emerald-500/10", href: "/admin/b2b", desc: "Revendeurs, API, Tarifs", roles: ["ADMIN"] }] : []),
                { name: "Ticket de Caisse", icon: CreditCard, color: "text-amber-500", bg: "bg-amber-500/10", desc: "Logiciel de caisse, Reçus", roles: ["ADMIN"] },
                { name: "Apparence & Visuels", icon: Palette, color: "text-purple-400", bg: "bg-purple-400/10", desc: "Logos, Couleurs, Favicon", roles: ["ADMIN"] },
            ]
        },
        {
            title: "Sécurité & Système",
            items: [
                { name: "Automation & IA", icon: Zap, color: "text-orange-500", bg: "bg-orange-500/10", desc: "Webhooks (n8n) & Gemini", roles: ["ADMIN"] },
                { name: "FAQ Bot", icon: MessageCircleQuestion, color: "text-purple-400", bg: "bg-purple-500/10", desc: "Fiches problèmes & solutions IA", roles: ["ADMIN"] },
                { name: "Sécurité du Compte", icon: KeyRound, color: "text-cyan-500", bg: "bg-cyan-500/10", desc: "Mot de passe & 2FA", roles: ["ADMIN", "CAISSIER", "TRAITEUR"] },
                { name: "Audit Logs", icon: History, color: "text-slate-400", bg: "bg-slate-400/10", desc: "Forensics & Historique", roles: ["ADMIN"] },
                { name: "Mode Maintenance", icon: Shield, color: "text-red-500", bg: "bg-red-500/10", desc: "Backups, Système, Wipe", roles: ["ADMIN"] },
            ]
        }
    ];

    const visibleGroups = hubGroups.map(group => ({
        ...group,
        items: group.items.filter(item => {
            if (!user) return false;
            return item.roles.includes(user.role as any);
        })
    })).filter(group => group.items.length > 0);

    return (
        <div className="flex flex-col min-h-screen bg-[#0a0a0a] text-white pb-32">
            {/* Header / Profile Summary */}
            <header className="p-8 pt-10   bg-gradient-to-b from-[#1a110d] to-black border-b border-white/5 rounded-b-[3rem]">
                <div className="flex items-center gap-5">
                    <div className="size-16 rounded-full bg-[#ec5b13] flex items-center justify-center font-black text-2xl border-4 border-black shadow-xl">
                        {user?.nom?.substring(0, 1).toUpperCase() || "A"}
                    </div>
                    <div>
                        <h1 className="text-xl font-black tracking-tight">{user?.nom || "Admin"}</h1>
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">{user?.role || "Gérant"}</p>
                    </div>
                </div>
            </header>

            <main className="p-6 space-y-8 mt-4">
                {hubGroups.map((group) => (
                    <div key={group.title} className="space-y-3">
                        <h3 className="px-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">{group.title}</h3>
                        <div className="space-y-2">
                            {group.items.map((item) => (
                                <div
                                    key={item.name}
                                    className="block"
                                    onClick={() => {
                                        if (item.name === "Équipe & Accès") {
                                            setView("TEAM");
                                        } else if (item.name === "Identité Boutique") {
                                            setView("SHOP");
                                        } else if (item.name === "Sécurité du Compte") {
                                            setView("SECURITY");
                                        } else if (item.name === "Apparence & Visuels") {
                                            setView("APPEARANCE");
                                        } else if (item.name === "Automation & IA") {
                                            setView("API");
                                        } else if (item.name === "FAQ Bot") {
                                            setView("FAQ");
                                        } else if (item.name === "Audit Logs") {
                                            setView("AUDIT_LOGS");
                                        } else if (item.name === "Mode Maintenance") {
                                            const run = async () => {
                                                let currentData = shopData;
                                                if (!currentData) currentData = await loadShopSettings();
                                                if (!currentData) return;
                                                const target = !currentData.isMaintenanceMode;
                                                const toggleable = confirm(target ? "Activer le mode maintenance ?" : "Désactiver le mode maintenance ?");
                                                if (toggleable) toggleMaintenance(target);
                                            };
                                            run();
                                        } else if (item.name === "Ticket de Caisse") {
                                            setView("RECEIPT");
                                        } else if ((item as any).href) {
                                            router.push((item as any).href);
                                        } else {
                                            toast.success(`Ouverture de ${item.name} (Bientôt disponible sur mobile)`);
                                        }
                                    }}
                                >
                                    <div className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-3xl active:scale-[0.98] transition-all cursor-pointer">
                                        <div className="flex items-center gap-4">
                                            <div className={`size-10 rounded-2xl ${item.bg} flex items-center justify-center ${item.color}`}>
                                                <item.icon size={20} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-white uppercase tracking-tight">{item.name}</p>
                                                <p className="text-[10px] text-slate-500 font-medium">{item.desc}</p>
                                            </div>
                                        </div>
                                        <ChevronRight size={16} className="text-slate-700" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}

                <button
                    onClick={handleLogout}
                    className="w-full mt-6 py-4 flex items-center justify-center gap-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-3xl font-black uppercase text-xs active:scale-95 transition-all shadow-xl shadow-red-500/5 mb-10"
                >
                    <LogOut size={18} />
                    <span>Déconnexion du profil</span>
                </button>
            </main >

            {/* Team View Overlay */}
            {
                view === "TEAM" && (
                    <div className="fixed inset-0 z-50 bg-[#0a0a0a] flex flex-col pb-20 animate-in slide-in-from-right duration-300">
                        <header className="p-4 border-b border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <button onClick={() => setView("HUB")} className="p-2 -ml-2 text-slate-500">
                                    <ChevronRight className="rotate-180" size={24} />
                                </button>
                                <h1 className="text-xl font-black uppercase italic tracking-tighter">Équipe & Accès</h1>
                            </div>
                            <Button
                                size="sm"
                                className="bg-primary/20 text-primary font-black uppercase text-[10px] rounded-full px-4"
                                onPress={() => setIsAddModalOpen(true)}
                            >
                                Ajouter
                            </Button>
                        </header>

                        <main className="p-4 flex-1 overflow-y-auto space-y-3">
                            {isLoadingUsers ? (
                                <div className="flex justify-center py-20"><Spinner color="primary" /></div>
                            ) : usersList.length === 0 ? (
                                <p className="text-center text-slate-500 py-20 font-bold uppercase text-[10px] tracking-widest">Aucun membre</p>
                            ) : usersList.map((m) => (
                                <div key={m.id} className="p-4 bg-[#161616] border border-white/5 rounded-3xl flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="size-12 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center overflow-hidden">
                                            {m.avatarUrl ? (
                                                <NextImage
                                                    src={m.avatarUrl}
                                                    className="w-full h-full object-cover"
                                                    alt=""
                                                    width={48}
                                                    height={48}
                                                    unoptimized
                                                />
                                            ) : (
                                                <Users size={20} className="text-slate-600" />
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-sm font-black text-white">{m.nom}</p>
                                            <p className="text-[10px] text-primary font-bold uppercase tracking-widest">{m.role}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            isIconOnly
                                            size="sm"
                                            variant="light"
                                            className="text-slate-600"
                                            onPress={() => {
                                                setSelectedMember(m);
                                                setIsEditModalOpen(true);
                                            }}
                                        >
                                            <Smartphone size={16} />
                                        </Button>
                                        <Button
                                            isIconOnly
                                            size="sm"
                                            variant="light"
                                            className="text-red-500/50"
                                            onPress={() => handleDeleteUser(m.id)}
                                        >
                                            <LogOut className="rotate-90" size={16} />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </main>

                        <AddMemberModal
                            isOpen={isAddModalOpen}
                            onOpenChange={setIsAddModalOpen}
                        />

                        <EditMemberModal
                            isOpen={isEditModalOpen}
                            onOpenChange={setIsEditModalOpen}
                            member={selectedMember}
                            onSuccess={loadUsers}
                        />
                    </div>
                )
            }

            {/* Shop View Overlay */}
            {
                view === "SHOP" && shopData && (
                    <div className="fixed inset-0 z-50 bg-[#0a0a0a] flex flex-col pb-20 animate-in slide-in-from-right duration-300">
                        <header className="p-4 border-b border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <button onClick={() => setView("HUB")} className="p-2 -ml-2 text-slate-500">
                                    <ChevronRight className="rotate-180" size={24} />
                                </button>
                                <h1 className="text-xl font-black uppercase italic tracking-tighter">Identité Boutique</h1>
                            </div>
                            <Button
                                size="sm"
                                className="bg-primary text-white font-black uppercase text-[10px] rounded-full px-5"
                                onPress={handleSaveShop}
                                isLoading={isSavingShop}
                            >
                                Enregistrer
                            </Button>
                        </header>

                        <main className="p-6 flex-1 overflow-y-auto space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Nom de l&apos;enseigne</label>
                                <input
                                    className="w-full bg-white/5 border border-white/5 rounded-2xl p-4 text-sm font-bold outline-none focus:border-primary/50 transition-all"
                                    value={shopData.shopName || ""}
                                    onChange={(e) => setShopData({ ...shopData, shopName: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Téléphone Contact</label>
                                <input
                                    className="w-full bg-white/5 border border-white/5 rounded-2xl p-4 text-sm font-bold outline-none focus:border-primary/50 transition-all"
                                    value={shopData.shopTel || ""}
                                    onChange={(e) => setShopData({ ...shopData, shopTel: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Adresse Physique</label>
                                <textarea
                                    className="w-full bg-white/5 border border-white/5 rounded-2xl p-4 text-sm font-bold outline-none focus:border-primary/50 transition-all min-h-[100px]"
                                    value={shopData.shopAddress || ""}
                                    onChange={(e) => setShopData({ ...shopData, shopAddress: e.target.value })}
                                />
                            </div>

                            <div className="p-5 bg-[#ec5b13]/10 border border-[#ec5b13]/20 rounded-3xl space-y-4">
                                <div className="flex items-center gap-3 text-[#ec5b13]">
                                    <Smartphone size={18} />
                                    <h3 className="text-xs font-black uppercase tracking-wider">Accès Rapide Webhook WhatsApp</h3>
                                </div>
                                <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                                    Si vous redémarrez vos serveurs et que le lien Cloudflare change, mettez à jour l&apos;URL ici pour que le robot WhatsApp continue de fonctionner.
                                </p>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black uppercase text-slate-500 ml-1">URL du Webhook</label>
                                    <input
                                        className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs font-mono outline-none focus:border-[#ec5b13]/50 transition-all text-[#ec5b13]"
                                        placeholder="https://xyz.trycloudflare.com/api/webhooks/whatsapp"
                                        value={shopData.whatsappWebhookUrl || ""}
                                        onChange={(e) => setShopData({ ...shopData, whatsappWebhookUrl: e.target.value })}
                                    />
                                </div>
                            </div>
                        </main>
                    </div>
                )
            }
            {/* Receipt View Overlay */}
            {
                view === "RECEIPT" && (
                    <div className="fixed inset-0 z-50 bg-[#0a0a0a] flex flex-col pb-20 animate-in slide-in-from-right duration-300">
                        <header className="p-4 border-b border-white/5 flex items-center gap-3">
                            <button onClick={() => setView("HUB")} className="p-2 -ml-2 text-slate-500">
                                <ChevronRight className="rotate-180" size={24} />
                            </button>
                            <h1 className="text-xl font-black uppercase italic tracking-tighter">Paramètres Reçu</h1>
                        </header>

                        <main className="p-4 flex-1 overflow-y-auto">
                            <ReceiptSettings />
                        </main>
                    </div>
                )
            }

            {/* Security View Overlay */}
            {
                view === "SECURITY" && (
                    <div className="fixed inset-0 z-[60] bg-[#0a0a0a] flex flex-col pb-20 animate-in slide-in-from-right duration-300">
                        <header className="p-6 border-b border-white/5 flex items-center justify-between bg-black/50 backdrop-blur-xl">
                            <div className="flex items-center gap-4">
                                <button onClick={() => setView("HUB")} className="p-2 -ml-2 text-slate-500 rounded-full hover:bg-white/5 transition-colors">
                                    <ChevronRight className="rotate-180" size={24} />
                                </button>
                                <div>
                                    <h1 className="text-xl font-bold uppercase italic tracking-tighter leading-none">Sécurité & Système</h1>
                                    <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.2em] mt-1">Contrôle God Mode mobile</p>
                                </div>
                            </div>
                            <Button
                                size="sm"
                                className="bg-emerald-500 text-white font-black uppercase text-[10px] rounded-full px-5 h-9"
                                onPress={handleSaveShop}
                                isLoading={isSavingShop}
                            >
                                Enregistrer
                            </Button>
                        </header>

                        <main className="p-6 flex-1 overflow-y-auto space-y-6 custom-scrollbar">
                            {/* God Mode Section */}
                            <Card className="bg-[#161616] border border-white/5 rounded-[2rem] overflow-hidden shadow-2xl">
                                <CardBody className="p-6 space-y-6">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-red-500/10 rounded-2xl">
                                            <ShieldAlert className="text-red-500 w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-black text-white uppercase tracking-tight">Accès & Maintenance</h3>
                                            <p className="text-slate-500 text-[9px] font-bold uppercase tracking-wider mt-0.5">Restrictions d&apos;urgence</p>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-white/5">
                                            <div className="flex items-center gap-3">
                                                <Power className={shopData?.isMaintenanceMode ? "text-red-500" : "text-emerald-500"} size={18} />
                                                <span className="text-xs font-black uppercase tracking-widest text-white">Mode Maintenance</span>
                                            </div>
                                            <button
                                                onClick={() => setShopData({ ...shopData, isMaintenanceMode: !shopData?.isMaintenanceMode })}
                                                className={`w-12 h-6 rounded-full transition-all relative ${shopData?.isMaintenanceMode ? "bg-red-500" : "bg-white/10"}`}
                                            >
                                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${shopData?.isMaintenanceMode ? "left-7" : "left-1"}`} />
                                            </button>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2 text-white ml-1">
                                                <Globe size={12} className="text-[#ec5b13]" />
                                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">IP Whitelisting</span>
                                            </div>
                                            <textarea
                                                className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-xs text-white placeholder:text-slate-800 outline-none focus:border-[#ec5b13]/50 transition-all min-h-[80px] font-mono"
                                                placeholder="123.456.78.90, ..."
                                                value={shopData?.allowedIps || ""}
                                                onChange={(e) => setShopData({ ...shopData, allowedIps: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </CardBody>
                            </Card>

                            {/* 2FA Section */}
                            <Card className="bg-[#161616] border border-white/5 rounded-[2rem] overflow-hidden shadow-2xl">
                                <CardBody className="p-6 space-y-6">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-[#ec5b13]/10 rounded-2xl">
                                            <Lock className="text-[#ec5b13] w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-black text-white uppercase tracking-tight">Double Auth (2FA)</h3>
                                            <p className="text-slate-500 text-[9px] font-bold uppercase tracking-wider mt-0.5">Authentification forte</p>
                                        </div>
                                    </div>

                                    {!mfaQrCode ? (
                                        <div className="p-5 bg-black/40 rounded-2xl border border-white/5 text-center space-y-4">
                                            <p className="text-slate-500 text-[11px] font-medium leading-relaxed italic">&quot;Applique une seconde vérification via votre application mobile de sécurité.&quot;</p>
                                            <Button
                                                onPress={handleGenerateMfa}
                                                className="bg-[#ec5b13] text-white font-black uppercase tracking-widest text-[10px] py-4 px-8 rounded-xl w-full"
                                            >
                                                Configurer le 2FA
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <div className="flex flex-col items-center p-4 bg-white rounded-3xl">
                                                <QRCodeSVG value={mfaQrCode} size={140} />
                                            </div>
                                            <p className="text-[10px] text-slate-500 uppercase font-black text-center tracking-widest">Scannez avec Authenticator</p>
                                            <input
                                                type="text"
                                                placeholder="Code 6 chiffres"
                                                className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 text-center text-lg font-black tracking-[0.4em] text-[#ec5b13] outline-none"
                                                maxLength={6}
                                                value={mfaInputCode}
                                                onChange={(e) => setMfaInputCode(e.target.value)}
                                            />
                                            <div className="flex gap-2">
                                                <Button
                                                    variant="bordered"
                                                    className="flex-1 border-white/10 text-slate-500 font-black uppercase text-[10px] rounded-xl h-10"
                                                    onPress={() => setMfaQrCode(null)}
                                                >
                                                    Annuler
                                                </Button>
                                                <Button
                                                    isLoading={isMfaEnabling}
                                                    disabled={mfaInputCode.length !== 6}
                                                    className="flex-1 bg-emerald-500 text-white font-black uppercase text-[10px] rounded-xl h-10 shadow-lg shadow-emerald-500/20"
                                                    onPress={handleEnableMfa}
                                                >
                                                    Activer
                                                </Button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Backup Codes Enhancer */}
                                    <div className="mt-8 pt-6 border-t border-white/5 space-y-4">
                                        <div className="flex items-center gap-2">
                                            <ShieldAlert size={14} className="text-red-500" />
                                            <span className="text-[10px] font-black text-slate-500 uppercase">Codes de Secours</span>
                                        </div>

                                        {!backupCodes ? (
                                            <Button
                                                onPress={handleGenerateBackupCodes}
                                                isLoading={isGeneratingCodes}
                                                className="w-full bg-white/5 border border-white/10 text-white font-black uppercase text-[10px] rounded-xl h-10"
                                            >
                                                Générer codes de secours
                                            </Button>
                                        ) : (
                                            <div className="p-4 bg-black/50 border border-white/10 rounded-2xl space-y-3">
                                                <p className="text-[9px] text-red-500 font-bold uppercase text-center">Enregistrez ces codes en lieu sûr !</p>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {backupCodes.map((c, i) => (
                                                        <div key={i} className="bg-white/5 p-2 rounded-lg text-center font-mono text-sm font-bold text-white border border-white/5">
                                                            {c}
                                                        </div>
                                                    ))}
                                                </div>
                                                <Button
                                                    size="sm"
                                                    variant="light"
                                                    className="w-full text-[9px] font-black uppercase text-slate-500"
                                                    onPress={() => setBackupCodes(null)}
                                                >
                                                    Masquer les codes
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </CardBody>
                            </Card>

                            {/* Push Notifications Section */}
                            <PushNotificationManager />

                            {/* Maintenance & Data Tools */}
                            <Card className="bg-[#161616] border border-red-500/20 rounded-[2rem] overflow-hidden shadow-2xl mb-10">
                                <CardBody className="p-6 space-y-6">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-red-500/10 rounded-2xl">
                                            <Trash2 className="text-red-500 w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-black text-white uppercase tracking-tight">Maintenance Production</h3>
                                            <p className="text-slate-500 text-[9px] font-bold uppercase tracking-wider mt-0.5">Données & Nettoyage</p>
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        <div className="p-5 bg-black/40 rounded-2xl border border-white/5 space-y-4">
                                            <div className="space-y-1">
                                                <p className="text-xs font-black text-white uppercase">Sauvegarde DB</p>
                                                <p className="text-[9px] text-slate-500 font-bold uppercase">Export JSON complet du système</p>
                                            </div>
                                            <Button
                                                onPress={handleExportDatabase}
                                                isLoading={isExportingDb}
                                                startContent={<Download size={14} />}
                                                className="w-full bg-[#262626] text-white font-black uppercase text-[10px] py-4 rounded-xl"
                                            >
                                                Exporter Backup
                                            </Button>
                                        </div>

                                        <div className="p-5 bg-red-950/10 rounded-2xl border border-red-900/20 space-y-4">
                                            <div className="space-y-1">
                                                <p className="text-xs font-black text-red-500 uppercase">Wipe Production</p>
                                                <p className="text-[9px] text-red-900 font-bold uppercase italic">Suppression irréversible des données</p>
                                            </div>

                                            <div className="space-y-3">
                                                <input
                                                    type="text"
                                                    value={resetConfirmation}
                                                    onChange={(e) => setResetConfirmation(e.target.value)}
                                                    placeholder="Taper PERMANENT DELETE"
                                                    className="w-full bg-black/40 border border-red-900/30 rounded-xl py-3 px-4 text-[10px] font-black text-red-500 outline-none focus:border-red-500/50"
                                                />
                                                <Button
                                                    onPress={handleProductionReset}
                                                    isLoading={isResetting}
                                                    disabled={resetConfirmation !== "PERMANENT DELETE"}
                                                    startContent={<AlertTriangle size={14} />}
                                                    className="w-full bg-red-600 text-white font-black uppercase text-[10px] py-4 rounded-xl shadow-lg shadow-red-600/20"
                                                >
                                                    RESET TOTAL
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </CardBody>
                            </Card>
                        </main>
                    </div>
                )
            }

            {/* Appearance View Overlay */}
            {
                view === "APPEARANCE" && shopData && (
                    <div className="fixed inset-0 z-50 bg-[#0a0a0a] flex flex-col pb-20 animate-in slide-in-from-right duration-300">
                        <header className="p-4 border-b border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <button onClick={() => setView("HUB")} className="p-2 -ml-2 text-slate-500">
                                    <ChevronRight className="rotate-180" size={24} />
                                </button>
                                <h1 className="text-xl font-black uppercase italic tracking-tighter">Apparence</h1>
                            </div>
                            <Button
                                size="sm"
                                className="bg-primary text-white font-black uppercase text-[10px] rounded-full px-5"
                                onPress={handleSaveShop}
                                isLoading={isSavingShop}
                            >
                                Enregistrer
                            </Button>
                        </header>

                        <main className="p-6 flex-1 overflow-y-auto space-y-8">
                            <section className="space-y-4">
                                <h3 className="text-xs font-black uppercase tracking-widest text-[#ec5b13]">Couleur d&apos;accent</h3>
                                <div className="flex flex-wrap gap-4">
                                    {["#ec5b13", "#4169e1", "#10b981", "#ef4444", "#8b5cf6", "#f59e0b"].map(c => (
                                        <button
                                            key={c}
                                            onClick={() => setShopData({ ...shopData, accentColor: c })}
                                            className={`size-10 rounded-full border-2 transition-all ${shopData.accentColor === c ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-50'}`}
                                            style={{ backgroundColor: c }}
                                        />
                                    ))}
                                </div>
                            </section>

                            <section className="space-y-6">
                                <h3 className="text-xs font-black uppercase tracking-widest text-[#ec5b13]">Logos & Branding</h3>

                                {[
                                    { label: 'Logo Principal', key: 'logoUrl', ref: logoInputRef, target: 'logo', loading: isUploadingLogo },
                                    { label: 'Logo Dashboard', key: 'dashboardLogoUrl', ref: dashboardLogoInputRef, target: 'dashboard', loading: isUploadingDashboardLogo },
                                    { label: 'Favicon', key: 'faviconUrl', ref: faviconInputRef, target: 'favicon', loading: isUploadingFavicon }
                                ].map((item) => (
                                    <div key={item.key} className="p-5 bg-[#161616] border border-white/5 rounded-[2rem] space-y-4">
                                        <div className="flex justify-between items-center">
                                            <p className="text-[10px] font-black uppercase text-slate-500">{item.label}</p>
                                            <input type="file" ref={item.ref as any} className="hidden" accept="image/*" onChange={(e) => handleLogoFileChange(e, item.target as any)} />
                                            <Button
                                                size="sm"
                                                variant="flat"
                                                className="font-black uppercase text-[9px] rounded-xl bg-white/5"
                                                onPress={() => item.ref.current?.click()}
                                                isLoading={item.loading}
                                            >
                                                Changer
                                            </Button>
                                        </div>
                                        <div className="h-24 bg-black/40 rounded-2xl flex items-center justify-center p-4 border border-dashed border-white/10 overflow-hidden">
                                            {shopData[item.key] ? (
                                                <NextImage
                                                    src={shopData[item.key]}
                                                    className="max-h-full max-w-full object-contain"
                                                    alt="Preview"
                                                    width={200}
                                                    height={100}
                                                    unoptimized
                                                />
                                            ) : (
                                                <p className="text-[10px] font-bold text-slate-700 uppercase">Aucun fichier</p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </section>
                        </main>
                    </div>
                )
            }

            {/* API & Intelligence View Overlay */}
            {
                view === "API" && (
                    <div className="fixed inset-0 z-50 bg-[#0a0a0a] flex flex-col pb-20 animate-in slide-in-from-right duration-300">
                        <header className="p-4 border-b border-white/5 flex items-center gap-3">
                            <button onClick={() => setView("HUB")} className="p-2 -ml-2 text-slate-500">
                                <ChevronRight className="rotate-180" size={24} />
                            </button>
                            <h1 className="text-xl font-black uppercase italic tracking-tighter leading-tight">Automation & IA</h1>
                        </header>
                        <div className="flex-1 overflow-y-auto px-4">
                            <ApiBotSettings />
                        </div>
                    </div>
                )
            }

            {/* FAQ Bot View Overlay */}
            {view === "FAQ" && (
                <div className="fixed inset-0 z-50 bg-[#0a0a0a] flex flex-col pb-20 animate-in slide-in-from-right duration-300">
                    <header className="p-4 border-b border-white/5 flex items-center gap-3">
                        <button onClick={() => setView("HUB")} className="p-2 -ml-2 text-slate-500">
                            <ChevronRight className="rotate-180" size={24} />
                        </button>
                        <h1 className="text-xl font-black uppercase italic tracking-tighter leading-tight">FAQ Bot</h1>
                    </header>
                    <div className="flex-1 overflow-y-auto px-4 py-4">
                        <FaqBotSettings />
                    </div>
                </div>
            )}

            {/* Audit Logs View Overlay */}
            {
                view === "AUDIT_LOGS" && (
                    <div className="fixed inset-0 z-50 bg-[#0a0a0a] flex flex-col pb-20 animate-in slide-in-from-right duration-300">
                        <header className="p-4 border-b border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <button onClick={() => setView("HUB")} className="p-2 -ml-2 text-slate-500">
                                    <ChevronRight className="rotate-180" size={24} />
                                </button>
                                <h1 className="text-xl font-black uppercase italic tracking-tighter">Audit Logs</h1>
                            </div>
                            <div className="flex gap-2">
                                <Button isIconOnly size="sm" variant="light" className="text-slate-400" onPress={fetchAuditLogs} isLoading={isAuditLoading}>
                                    <RefreshCw size={18} />
                                </Button>
                            </div>
                        </header>

                        <div className="flex gap-2 p-4 border-b border-white/5 bg-black/20 overflow-x-auto no-scrollbar">
                            <Button
                                size="sm"
                                className="bg-white/5 text-white font-black uppercase text-[9px] rounded-xl flex-1 min-w-[120px]"
                                startContent={<FileJson size={12} />}
                                onPress={() => handleExportLogs('json')}
                                isLoading={isExportingLogs}
                            >
                                Export JSON
                            </Button>
                            <Button
                                size="sm"
                                className="bg-white/5 text-white font-black uppercase text-[9px] rounded-xl flex-1 min-w-[120px]"
                                startContent={<FileSpreadsheet size={12} />}
                                onPress={() => handleExportLogs('csv')}
                                isLoading={isExportingLogs}
                            >
                                Export CSV
                            </Button>
                        </div>

                        <main className="p-4 flex-1 overflow-y-auto space-y-3">
                            {isAuditLoading && auditLogs.length === 0 ? (
                                <div className="flex justify-center py-20"><Spinner color="primary" /></div>
                            ) : auditLogs.length === 0 ? (
                                <p className="text-center text-slate-500 py-20 font-bold uppercase text-[10px] tracking-widest">Aucun log</p>
                            ) : auditLogs.map((log) => (
                                <div key={log.id} className="p-4 bg-[#161616] border border-white/5 rounded-3xl space-y-2">
                                    <div className="flex justify-between items-start">
                                        <span className="text-[10px] font-black uppercase text-primary italic leading-none">{log.action}</span>
                                        <span className="text-[8px] font-bold text-slate-600 uppercase">{new Date(log.createdAt).toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="size-6 rounded-full bg-white/5 flex items-center justify-center">
                                            <User size={12} className="text-slate-500" />
                                        </div>
                                        <p className="text-xs font-bold text-slate-300">{log.user?.nom || 'Système'}</p>
                                    </div>
                                    {log.details && (
                                        <p className="text-[9px] text-slate-500 font-mono bg-black/20 p-2 rounded-xl border border-white/5 break-all max-h-20 overflow-y-auto">
                                            {typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </main>
                    </div>
                )
            }
        </div >
    );
}
