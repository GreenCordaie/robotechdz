"use client";

import React, { useState } from "react";
import { Button, Card, CardBody, Chip, Spinner, Input, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure } from "@heroui/react";
import { ShoppingCart, Wallet as WalletIcon, X, CheckCircle, Search, UserPlus, Phone, Calendar, ArrowUpRight, ArrowDownRight, Users, TrendingUp } from "lucide-react";
import { getIndebtedClients, recordPayment, getClientHistory, createClient } from "@/app/admin/clients/actions";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/formatters";
import toast from "react-hot-toast";

export default function ClientsMobile({ initialStats, initialClients }: any) {
    const router = useRouter();
    const [searchTerm, setSearchTerm] = useState("");
    const [clients, setClients] = useState(initialClients);
    const [selectedClient, setSelectedClient] = useState<any>(null);
    const [history, setHistory] = useState<{ payments: any[], orders: any[] }>({ payments: [], orders: [] });
    const [repaymentAmount, setRepaymentAmount] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [newName, setNewName] = useState("");
    const [newTel, setNewTel] = useState("");
    const [isCreatingNew, setIsCreatingNew] = useState(false);

    const { isOpen, onOpen, onClose } = useDisclosure();
    const { isOpen: isNewOpen, onOpen: onNewOpen, onClose: onNewClose } = useDisclosure();

    const refreshData = async () => {
        const indebted = await getIndebtedClients({});
        if (Array.isArray(indebted)) setClients(indebted);
    };

    const handleViewClient = async (client: any) => {
        setSelectedClient(client);
        onOpen();
        const data = await getClientHistory({ clientId: client.id });
        const typedData = data as any;
        setHistory({
            payments: typedData.payments.map((p: any) => ({ ...p, createdAt: new Date(p.createdAt) })),
            orders: typedData.orders.map((o: any) => ({ ...o, createdAt: new Date(o.createdAt) }))
        });
    };

    const handleSettle = async () => {
        if (!selectedClient || !repaymentAmount) return;
        setIsSubmitting(true);
        try {
            const res = await recordPayment({ clientId: selectedClient.id, amount: repaymentAmount, typeAction: "ACOMPTE" }) as { success: boolean; error?: string };
            if (res.success) {
                toast.success("Enregistré");
                setRepaymentAmount("");
                onClose();
                router.refresh();
                refreshData();
            } else toast.error(res.error || "Erreur");
        } catch (e) { toast.error("Erreur technique"); }
        finally { setIsSubmitting(false); }
    };

    const handleSaveClient = async () => {
        if (!newName) return;
        setIsCreatingNew(true);
        const res = await createClient({ nom: newName, telephone: newTel }) as { success: boolean; error?: string };
        if (res.success) {
            toast.success("Client créé");
            onNewClose();
            setNewName("");
            setNewTel("");
            refreshData();
        } else toast.error("Erreur");
        setIsCreatingNew(false);
    };

    const filteredClients = clients.filter((c: any) =>
        c.nomComplet.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.telephone?.includes(searchTerm)
    );

    return (
        <div className="flex flex-col min-h-screen bg-[#0a0a0a] text-white pb-32">
            {/* Header / Big KPI */}
            <header className="p-6 pt-10 bg-gradient-to-b from-red-500/10 to-transparent border-b border-white/5 rounded-b-[3rem]">
                <div className="flex justify-between items-center mb-6">
                    <div className="p-3 bg-red-500/10 rounded-2xl border border-red-500/20">
                        <WalletIcon className="text-red-500" size={24} />
                    </div>
                    <Button
                        size="sm"
                        color="warning"
                        variant="flat"
                        className="rounded-full font-black text-[10px] uppercase"
                        startContent={<UserPlus size={14} />}
                        onPress={onNewOpen}
                    >
                        Nouveau
                    </Button>
                </div>

                <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Créances Totales</p>
                    <h1 className="text-4xl font-black tracking-tighter text-red-500">
                        {formatCurrency(initialStats.totalDebt, 'DZD')}
                    </h1>
                </div>

                <div className="flex gap-4 mt-8 overflow-x-auto pb-2 -mx-2 px-2 no-scrollbar">
                    <div className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center gap-2 shrink-0">
                        <CheckCircle size={12} className="text-emerald-500" />
                        <span className="text-[10px] font-black text-emerald-500 uppercase">{initialStats.indebtedCount} Actifs</span>
                    </div>
                    <div className="px-4 py-2 bg-[#ec5b13]/10 border border-[#ec5b13]/20 rounded-2xl flex items-center gap-2 shrink-0">
                        <TrendingUp size={12} className="text-[#ec5b13]" />
                        <span className="text-[10px] font-black text-[#ec5b13] uppercase">Récupéré: {formatCurrency(initialStats.recoveredThisMonth, 'DZD')}</span>
                    </div>
                </div>
            </header>

            <main className="p-4 space-y-6">
                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input
                        type="text"
                        placeholder="Chercher un client ou téléphone..."
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 outline-none focus:border-primary/50 transition-all font-bold placeholder:text-slate-600"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* List */}
                <div className="space-y-3">
                    <h3 className="px-1 text-[10px] font-black uppercase tracking-widest text-slate-600">Dettes par Client</h3>

                    {filteredClients.map((client: any) => (
                        <div
                            key={client.id}
                            className="p-4 bg-[#161616] border border-white/5 rounded-[2rem] flex items-center justify-between active:scale-[0.98] transition-all cursor-pointer"
                            onClick={() => handleViewClient(client)}
                        >
                            <div className="flex items-center gap-4">
                                <div className="size-12 rounded-2xl bg-red-500/10 flex items-center justify-center font-black text-red-500 border border-red-500/20 shadow-lg shadow-red-500/5">
                                    {client.nomComplet.substring(0, 1).toUpperCase()}
                                </div>
                                <div className="space-y-1">
                                    <p className="text-sm font-black text-white">{client.nomComplet}</p>
                                    <div className="flex items-center gap-2 opacity-60">
                                        <Phone size={10} className="text-slate-400" />
                                        <span className="text-[10px] font-bold text-slate-400">{client.telephone || "Aucun tel"}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-black text-red-500">{formatCurrency(client.totalDetteDzd || 0, 'DZD')}</p>
                                <p className="text-[8px] font-black uppercase text-slate-600">À Récupérer</p>
                            </div>
                        </div>
                    ))}

                    {filteredClients.length === 0 && (
                        <div className="py-20 text-center opacity-40">
                            <Users size={48} className="mx-auto mb-4 text-slate-700" />
                            <p className="text-sm font-bold">Aucun client trouvé</p>
                        </div>
                    )}
                </div>
            </main>

            {/* Dossier Modal */}
            <Modal isOpen={isOpen} onClose={onClose} size="full" className="dark bg-[#0a0a0a]" scrollBehavior="inside">
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader className="flex flex-col gap-1">
                                <span className="text-[10px] font-black uppercase text-red-500 tracking-widest">Dossier de Crédit</span>
                                <h2 className="text-xl font-black italic uppercase text-white">{selectedClient?.nomComplet}</h2>
                            </ModalHeader>
                            <ModalBody className="pb-10">
                                <div className="space-y-6">
                                    <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-[2rem] space-y-4">
                                        <p className="text-[10px] font-black uppercase text-slate-500">Règlement Rapide</p>
                                        <div className="flex gap-2">
                                            <Input
                                                placeholder="Montant DZD"
                                                type="number"
                                                value={repaymentAmount}
                                                onValueChange={setRepaymentAmount}
                                                className="flex-1"
                                            />
                                            <Button color="success" onPress={handleSettle} isLoading={isSubmitting} className="font-black h-14 rounded-2xl">
                                                Valider
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <h4 className="text-[10px] font-black uppercase text-slate-500">Historique des Flux</h4>
                                        <div className="space-y-3">
                                            {history.orders.filter((o: any) => Number(o.resteAPayer) > 0).map((o: any) => (
                                                <div key={o.id} className="p-4 bg-white/5 rounded-2xl border border-white/5 flex justify-between">
                                                    <div>
                                                        <p className="text-xs font-black">Achat #{o.orderNumber}</p>
                                                        <p className="text-[9px] text-slate-500">{format(new Date(o.createdAt), "dd MMM yyyy", { locale: fr })}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-xs font-black text-red-500">-{formatCurrency(o.totalAmount, 'DZD')}</p>
                                                        <p className="text-[8px] text-slate-500 italic">Reste: {formatCurrency(o.resteAPayer || 0, 'DZD')}</p>
                                                    </div>
                                                </div>
                                            ))}
                                            {history.payments.map((p: any) => (
                                                <div key={p.id} className="p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10 flex justify-between">
                                                    <div>
                                                        <p className="text-xs font-black text-emerald-500">Encaissement</p>
                                                        <p className="text-[9px] text-slate-500">{format(new Date(p.createdAt), "dd MMM yyyy", { locale: fr })}</p>
                                                    </div>
                                                    <p className="text-xs font-black text-emerald-500">+{formatCurrency(p.montantDzd, 'DZD')}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </ModalBody>
                            <ModalFooter className="bg-[#111] border-t border-white/5">
                                <div className="flex justify-between items-center w-full px-2">
                                    <span className="text-[10px] font-black uppercase text-slate-500">Dette Actuelle</span>
                                    <span className="text-2xl font-black text-red-500">{formatCurrency(selectedClient?.totalDetteDzd || 0, 'DZD')}</span>
                                </div>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>

            {/* Nouveau Client Modal */}
            <Modal isOpen={isNewOpen} onClose={onNewClose} className="dark bg-[#161616]">
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader>Nouveau Client</ModalHeader>
                            <ModalBody className="space-y-4">
                                <Input label="Nom" value={newName} onValueChange={setNewName} />
                                <Input label="Tel" value={newTel} onValueChange={setNewTel} />
                            </ModalBody>
                            <ModalFooter>
                                <Button onPress={handleSaveClient} isLoading={isCreatingNew} color="primary" className="font-black w-full h-14 rounded-2xl mt-4">
                                    Créer le Dossier
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>
        </div>
    );
}
