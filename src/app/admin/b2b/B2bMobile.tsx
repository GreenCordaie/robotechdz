"use client";

import React, { useState, useEffect } from "react";
import {
    Plus,
    Building2,
    Wallet,
    Trash2,
    ArrowLeft,
    Search,
    ChevronRight,
    CircleDollarSign,
    ShieldCheck
} from "lucide-react";
import {
    useDisclosure,
    Button,
    Spinner,
    Card,
    CardBody,
    Chip
} from "@heroui/react";
import { toast } from "react-hot-toast";
import {
    getResellersAction,
    deleteResellerAction
} from "@/app/admin/settings/actions";
import { AddResellerModal } from "@/components/admin/modals/AddResellerModal";
import { formatCurrency } from "@/lib/formatters";
import Link from "next/link";

interface B2bMobileProps {
    initialResellers?: any[];
}

export default function B2bMobile({ initialResellers = [] }: B2bMobileProps) {
    const { isOpen: isB2bModalOpen, onOpen: onB2bModalOpen, onOpenChange: onB2bModalOpenChange } = useDisclosure();
    const [resellersList, setResellersList] = useState<any[]>(initialResellers);
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        fetchResellers();
    }, []);

    const fetchResellers = async () => {
        setIsLoading(true);
        try {
            const res: any = await getResellersAction({});
            if (res.success) {
                setResellersList(res.data || []);
            }
        } catch (err) {
            toast.error("Échec du chargement");
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (reseller: any) => {
        if (!window.confirm(`Supprimer ${reseller.companyName} ?`)) return;
        try {
            const res: any = await deleteResellerAction({ id: reseller.id });
            if (res.success) {
                setResellersList(resellersList.filter(r => r.id !== reseller.id));
                toast.success("Partenaire supprimé");
            }
        } catch (err) {
            toast.error("Erreur de connexion");
        }
    };

    const filteredResellers = resellersList.filter(r =>
        r.companyName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-[#0a0a0a]">
                <Spinner color="primary" />
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen bg-[#0a0a0a] text-white pb-32">
            <header className="p-4 border-b border-white/5 space-y-4">
                <div className="flex items-center gap-3">
                    <Link href="/admin/settings" className="p-2 bg-white/5 rounded-xl border border-white/5">
                        <ArrowLeft size={18} className="text-slate-400" />
                    </Link>
                    <h1 className="text-xl font-black italic uppercase tracking-tighter">Gestion B2B</h1>
                    <div className="ml-auto">
                        <Button isIconOnly size="sm" color="primary" className="rounded-full" onPress={onB2bModalOpen}>
                            <Plus size={18} />
                        </Button>
                    </div>
                </div>

                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input
                        type="text"
                        placeholder="Chercher partenaire..."
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 outline-none focus:border-primary/50 transition-all font-bold placeholder:text-slate-600"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </header>

            <main className="p-4 space-y-4">
                {filteredResellers.map((reseller) => (
                    <div key={reseller.id} className="p-5 bg-[#161616] border border-white/5 rounded-[2.5rem] space-y-5">
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-4">
                                <div className="size-12 rounded-2xl bg-primary/10 flex items-center justify-center font-black text-primary border border-primary/20 text-xl">
                                    {reseller.companyName.substring(0, 1).toUpperCase()}
                                </div>
                                <div className="space-y-1">
                                    <p className="text-base font-black uppercase tracking-tight italic">{reseller.companyName}</p>
                                    <div className="flex items-center gap-2">
                                        <div className={`size-1.5 rounded-full ${reseller.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                        <span className="text-[10px] font-black uppercase text-slate-500">{reseller.status}</span>
                                    </div>
                                </div>
                            </div>
                            <Button isIconOnly size="sm" variant="light" className="text-slate-600" onPress={() => handleDelete(reseller)}>
                                <Trash2 size={16} />
                            </Button>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 bg-white/5 border border-white/5 rounded-2xl space-y-1">
                                <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Solde Actuel</p>
                                <p className="text-sm font-black text-white">{formatCurrency(Number(reseller.wallet?.balance || 0), 'DZD')}</p>
                            </div>
                            <div className="p-3 bg-white/5 border border-white/5 rounded-2xl space-y-1">
                                <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Remise</p>
                                <p className="text-sm font-black text-primary">-{reseller.customDiscount || "5.00"}%</p>
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-4 border-t border-white/5">
                            <div className="flex items-center gap-2 text-slate-500">
                                <ShieldCheck size={12} />
                                <span className="text-[9px] font-black uppercase tracking-widest">ID Partenaire: #{reseller.id}</span>
                            </div>
                        </div>
                    </div>
                ))}

                {filteredResellers.length === 0 && (
                    <div className="py-20 text-center opacity-30">
                        <Building2 size={48} className="mx-auto mb-4" />
                        <p className="text-sm font-bold uppercase tracking-widest">Aucun partenaire</p>
                    </div>
                )}
            </main>

            <AddResellerModal
                isOpen={isB2bModalOpen}
                onOpenChange={onB2bModalOpenChange}
                onSuccess={fetchResellers}
            />
        </div>
    );
}
