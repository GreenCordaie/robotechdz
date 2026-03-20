"use client";

import React, { useState, useEffect } from "react";
import {
    Plus,
    Building2,
    Wallet,
    Trash2,
    ArrowLeft
} from "lucide-react";
import { useDisclosure, Button, Spinner } from "@heroui/react";
import { toast } from "react-hot-toast";
import {
    getResellersAction,
    deleteResellerAction
} from "@/app/admin/settings/actions";
import { AddResellerModal } from "@/components/admin/modals/AddResellerModal";
import { formatCurrency } from "@/lib/formatters";
import Link from "next/link";

interface B2bManagementContentProps {
    initialResellers?: any[];
}

export default function B2bManagementContent({ initialResellers = [] }: B2bManagementContentProps) {
    const { isOpen: isB2bModalOpen, onOpen: onB2bModalOpen, onOpenChange: onB2bModalOpenChange } = useDisclosure();

    const [resellersList, setResellersList] = useState<any[]>(initialResellers);
    const [isResellersLoading, setIsResellersLoading] = useState(false);
    const defaultResellerDiscount = "5.00";

    useEffect(() => {
        fetchResellers();
    }, []);

    const fetchResellers = async () => {
        setIsResellersLoading(true);
        try {
            const res: any = await getResellersAction({});
            if (res.success) {
                setResellersList(res.data || []);
            }
        } catch (err) {
            toast.error("Échec du chargement des revendeurs");
        } finally {
            setIsResellersLoading(false);
        }
    };

    const handleDeleteReseller = async (id: number, name: string) => {
        if (!window.confirm(`Supprimer le partenaire ${name} ? Cela supprimera aussi son compte utilisateur.`)) return;
        try {
            const res: any = await deleteResellerAction({ id });
            if (res.success) {
                setResellersList(resellersList.filter(r => r.id !== id));
                toast.success("Partenaire supprimé");
            } else {
                toast.error(res.error || "Erreur de suppression");
            }
        } catch (err) {
            toast.error("Erreur de connexion");
        }
    };

    return (
        <div className="p-4 md:p-8 space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-2 text-slate-500">
                        <Link href="/admin/settings" className="hover:text-[#ec5b13] transition-colors flex items-center gap-1">
                            <ArrowLeft size={14} />
                            <span className="text-xs font-bold uppercase tracking-widest">Paramètres</span>
                        </Link>
                        <span className="text-xs">/</span>
                        <span className="text-xs font-bold uppercase tracking-widest text-[#ec5b13]">B2B & Revendeurs</span>
                    </div>
                    <h1 className="text-3xl font-black text-white uppercase italic tracking-tighter">
                        Gestion <span className="text-[#ec5b13]">B2B</span>
                    </h1>
                    <p className="text-slate-400 font-medium">Contrôlez vos partenaires revendeurs et leurs accès.</p>
                </div>

                <Button
                    onPress={onB2bModalOpen}
                    className="h-14 px-8 bg-[#ec5b13] text-white font-black rounded-2xl shadow-xl shadow-orange-950/20 hover:scale-105 transition-all uppercase tracking-tight"
                    startContent={<Plus size={20} />}
                >
                    Nouveau Partenaire
                </Button>
            </div>

            {/* Main Content */}
            {isResellersLoading ? (
                <div className="py-40 flex flex-col items-center justify-center gap-4 bg-[#161616] border border-[#262626] rounded-[40px]">
                    <Spinner color="warning" size="lg" />
                    <p className="text-slate-500 font-bold uppercase tracking-widest animate-pulse">Chargement des partenaires...</p>
                </div>
            ) : resellersList.length === 0 ? (
                <div className="py-40 border-2 border-dashed border-[#2d2622] rounded-[40px] flex flex-col items-center justify-center gap-6 text-center px-6">
                    <div className="size-24 rounded-3xl bg-[#161616] border border-[#2d2622] flex items-center justify-center">
                        <Building2 className="size-12 text-slate-700" />
                    </div>
                    <div className="space-y-2">
                        <p className="text-xl font-black text-white uppercase italic">Aucun partenaire</p>
                        <p className="text-slate-500 font-medium max-w-sm">Vous n&apos;avez pas encore de revendeurs enregistrés dans votre base de données.</p>
                    </div>
                    <Button
                        onPress={onB2bModalOpen}
                        variant="bordered"
                        className="border-[#2d2622] text-slate-300 font-bold px-8 rounded-xl hover:bg-white/5"
                    >
                        Ajouter votre premier revendeur
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {resellersList.map((reseller) => (
                        <div key={reseller.id} className="bg-[#161616] border border-[#262626] rounded-[32px] p-6 space-y-6 hover:border-[#ec5b13]/30 transition-all group relative overflow-hidden">
                            {/* Abstract shadow */}
                            <div className="absolute -top-24 -right-24 size-48 bg-[#ec5b13]/5 blur-[60px] rounded-full group-hover:bg-[#ec5b13]/10 transition-colors"></div>

                            <div className="flex items-start justify-between relative z-10">
                                <div className="flex items-center gap-4">
                                    <div className="size-14 rounded-2xl bg-[#0a0a0a] border border-[#262626] flex items-center justify-center text-[#ec5b13] font-black text-2xl group-hover:bg-[#ec5b13] group-hover:text-white transition-all duration-500">
                                        {reseller.companyName.substring(0, 1).toUpperCase()}
                                    </div>
                                    <div>
                                        <h4 className="font-black text-white text-xl leading-tight uppercase italic">{reseller.companyName}</h4>
                                        <p className="text-sm text-slate-500 font-medium">{reseller.user?.email || 'N/A'}</p>
                                    </div>
                                </div>
                                <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${reseller.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500'}`}>
                                    {reseller.status}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 relative z-10">
                                <div className="bg-[#0a0a0a] p-4 rounded-2xl border border-[#262626]">
                                    <p className="text-[10px] text-slate-600 uppercase font-black tracking-widest mb-1">Solde Wallet</p>
                                    <p className="text-xl font-black text-white">{formatCurrency(Number(reseller.wallet?.balance || 0), 'DZD')}</p>
                                </div>
                                <div className="bg-[#0a0a0a] p-4 rounded-2xl border border-[#262626]">
                                    <p className="text-[10px] text-slate-600 uppercase font-black tracking-widest mb-1">Remise Client</p>
                                    <p className="text-xl font-black text-[#ec5b13]">-{reseller.customDiscount || defaultResellerDiscount}%</p>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-[#262626] flex items-center justify-between relative z-10">
                                <div className="flex items-center gap-2">
                                    <Wallet className="size-4 text-slate-600" />
                                    <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">ID #{reseller.id}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleDeleteReseller(reseller.id, reseller.companyName)}
                                        className="size-10 rounded-xl bg-red-500/5 text-slate-600 hover:text-red-500 hover:bg-red-500/10 transition-all flex items-center justify-center border border-transparent hover:border-red-500/20"
                                    >
                                        <Trash2 className="size-5" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <AddResellerModal
                isOpen={isB2bModalOpen}
                onOpenChange={onB2bModalOpenChange}
                onSuccess={fetchResellers}
            />
        </div>
    );
}
