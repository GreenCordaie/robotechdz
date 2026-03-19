"use client";

import React from "react";
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
    LayoutDashboard
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "react-hot-toast";
import { useSettingsStore } from "@/store/useSettingsStore";
import { getUsersAction, deleteUserAction, getShopSettingsAction, saveShopSettingsAction } from "./actions";
import { AddMemberModal } from "@/components/admin/modals/AddMemberModal";
import { EditMemberModal } from "@/components/admin/modals/EditMemberModal";
import { Spinner, Button } from "@heroui/react";
import { ReceiptSettings } from "@/components/admin/settings/ReceiptSettings";

export default function SettingsMobile() {
    const clearAuth = useAuthStore((state) => state.clearAuth);
    const user = useAuthStore((state) => state.user);
    const router = useRouter();
    const [view, setView] = React.useState<"HUB" | "TEAM" | "SHOP" | "RECEIPT">("HUB");
    const [usersList, setUsersList] = React.useState<any[]>([]);
    const [isLoadingUsers, setIsLoadingUsers] = React.useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = React.useState(false);
    const [selectedMember, setSelectedMember] = React.useState<any>(null);

    // Shop Settings State
    const [shopData, setShopData] = React.useState<any>(null);
    const [isSavingShop, setIsSavingShop] = React.useState(false);

    const loadUsers = async () => {
        setIsLoadingUsers(true);
        const res = await getUsersAction({});
        if (res.success) setUsersList(res.data as any[]);
        setIsLoadingUsers(false);
    };

    const loadShopSettings = async () => {
        const res = await getShopSettingsAction({});
        if (res.success) setShopData(res.data);
    };

    React.useEffect(() => {
        if (view === "TEAM") loadUsers();
        if (view === "SHOP") loadShopSettings();
    }, [view]);

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

    const { isB2bEnabled } = useSettingsStore();

    const hubGroups = [
        {
            title: "Gestion Quotidienne",
            items: [
                { name: "Dashboard", icon: LayoutDashboard, color: "text-blue-400", bg: "bg-blue-400/10", href: "/admin", desc: "Statistiques & Revenus" },
                { name: "Clients & Crédits", icon: UserCircle, color: "text-indigo-400", bg: "bg-indigo-400/10", href: "/admin/clients", desc: "Dettes & Paiements" },
                { name: "Fournisseurs", icon: Truck, color: "text-pink-400", bg: "bg-pink-400/10", href: "/admin/fournisseurs", desc: "Balances & Flux" },
                { name: "Comptes Partagés", icon: Group, color: "text-orange-400", bg: "bg-orange-400/10", href: "/admin/comptes-partages", desc: "Inventaire & Slots" },
                { name: "Tickets Support", icon: Headset, color: "text-red-400", bg: "bg-red-400/10", href: "/admin/support", desc: "Plaintes & SAV" },
            ]
        },
        {
            title: "Configuration Boutique",
            items: [
                { name: "Identité Boutique", icon: Store, color: "text-blue-500", bg: "bg-blue-500/10", desc: "Infos, Logos, Coordonnées" },
                { name: "Équipe & Accès", icon: Users, color: "text-[#ec5b13]", bg: "bg-[#ec5b13]/10", desc: "Membres, Rôles, Permissions" },
                ...(isB2bEnabled ? [{ name: "B2B & Partners", icon: Smartphone, color: "text-emerald-500", bg: "bg-emerald-500/10", desc: "Revendeurs, API, Tarifs" }] : []),
                { name: "Ticket de Caisse", icon: CreditCard, color: "text-amber-500", bg: "bg-amber-500/10", desc: "Logiciel de caisse, Reçus" },
            ]
        },
        {
            title: "Sécurité & Système",
            items: [
                { name: "Mode Maintenance", icon: Shield, color: "text-red-500", bg: "bg-red-500/10", desc: "Logs, Backups, Système" },
                { name: "Sécurité du Compte", icon: KeyRound, color: "text-cyan-500", bg: "bg-cyan-500/10", desc: "Mot de passe & 2FA" },
            ]
        }
    ];

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
                                        } else if (item.name === "Mode Maintenance") {
                                            const run = async () => {
                                                if (!shopData) await loadShopSettings();
                                                const toggleable = confirm(!shopData?.isMaintenanceMode ? "Activer le mode maintenance ?" : "Désactiver le mode maintenance ?");
                                                if (toggleable) toggleMaintenance(!shopData?.isMaintenanceMode);
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
            </main>

            {/* Team View Overlay */}
            {view === "TEAM" && (
                <div className="fixed inset-0 z-50 bg-[#0a0a0a] flex flex-col pb-20">
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
                                            <img src={m.avatarUrl} className="w-full h-full object-cover" alt="" />
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
            )}

            {/* Shop View Overlay */}
            {view === "SHOP" && shopData && (
                <div className="fixed inset-0 z-50 bg-[#0a0a0a] flex flex-col pb-20">
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
            )}
            {/* Receipt View Overlay */}
            {view === "RECEIPT" && (
                <div className="fixed inset-0 z-50 bg-[#0a0a0a] flex flex-col pb-20">
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
            )}
        </div>
    );
}
