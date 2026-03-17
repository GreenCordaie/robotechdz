"use client";

import React from "react";
import {
    Button,
    Input,
    Table,
    TableHeader,
    TableColumn,
    TableBody,
    TableRow,
    TableCell,
    Chip,
    User,
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    useDisclosure
} from "@heroui/react";
import {
    Search,
    UserPlus,
    TrendingUp,
    CheckCircle,
    Users,
    Eye,
    X,
    ShoppingCart,
    Wallet
} from "lucide-react";
import { useRouter } from "next/navigation";
import { getIndebtedClients, recordPayment, getClientHistory, createClient } from "@/app/admin/clients/actions";

import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "react-hot-toast";
import { formatCurrency } from "@/lib/formatters";

interface ClientOrder {
    id: number;
    orderNumber: string;
    totalAmount: string;
    resteAPayer: string | null;
    status: string;
    isDelivered: boolean | null;
    createdAt: Date | null;
}

interface ClientPayment {
    id: number;
    montantDzd: string;
    createdAt: Date | null;
    typeAction: string;
}


interface Client {
    id: number;
    nomComplet: string;
    telephone: string | null;
    totalDetteDzd: string | null;
    orders?: ClientOrder[];
}


interface ClientsContentProps {
    initialStats: {
        totalDebt: number;
        recoveredThisMonth: number;
        indebtedCount: number;
    };
    initialClients: Client[];
}

export default function ClientsContent({ initialStats, initialClients }: ClientsContentProps) {
    const router = useRouter();
    const [stats, setStats] = React.useState(initialStats);
    const [clients, setClients] = React.useState<Client[]>(initialClients);
    const [search, setSearch] = React.useState("");
    const [selectedClient, setSelectedClient] = React.useState<Client | null>(null);
    const [history, setHistory] = React.useState<{ payments: ClientPayment[], orders: ClientOrder[] }>({ payments: [], orders: [] });

    const [repaymentAmount, setRepaymentAmount] = React.useState("");
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    // New Client Modal State
    const [newName, setNewName] = React.useState("");
    const [newTel, setNewTel] = React.useState("");
    const [isCreatingNew, setIsCreatingNew] = React.useState(false);


    const { isOpen, onOpen, onClose } = useDisclosure();
    const { isOpen: isNewOpen, onOpen: onNewOpen, onClose: onNewClose } = useDisclosure();

    // Polling or refresh logic
    const refreshData = React.useCallback(async () => {
        const indebted = await getIndebtedClients();
        if (Array.isArray(indebted)) {
            setClients(indebted);
        } else {
            toast.error("Erreur lors de la récupération des clients");
        }
    }, [search]);


    React.useEffect(() => {
        const timeout = setTimeout(() => refreshData(), 300);
        return () => clearTimeout(timeout);
    }, [refreshData]);


    const handleViewClient = async (client: Client) => {
        setSelectedClient(client);
        const data = await getClientHistory({ clientId: client.id });
        const typedData = data as { payments: any[], orders: any[] };
        setHistory({
            payments: typedData.payments.map(p => ({ ...p, createdAt: new Date(p.createdAt) })),
            orders: typedData.orders.map(o => ({ ...o, createdAt: new Date(o.createdAt) }))
        });
        onOpen();
    };


    const handleSettle = async () => {
        if (!selectedClient || !repaymentAmount || Number(repaymentAmount) <= 0) return;
        setIsSubmitting(true);
        try {
            const res = await recordPayment({
                clientId: selectedClient.id,
                amount: repaymentAmount,
                typeAction: "ACOMPTE" // Default for manual settle
            });
            if (res.success) {
                toast.success("Paiement enregistré avec succès");
                setRepaymentAmount("");
                onClose();
                router.refresh();
            } else {
                toast.error(res.error || "Erreur lors de l'enregistrement");
            }

        } catch (error) {
            toast.error("Erreur lors de l'enregistrement");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex-1 flex flex-col max-w-7xl mx-auto w-full px-6 py-8 gap-8 bg-[#0a0a0a]">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="text-white text-3xl font-bold tracking-tight">Clients & Crédits</h1>
                    <p className="text-slate-400 text-base">Suivi des paiements partiels et de l&apos;argent en attente.</p>

                </div>
                <Button
                    onPress={onNewOpen}
                    className="flex items-center gap-2 px-5 h-12 bg-[#ec5b13] hover:bg-orange-600 text-white rounded-xl transition-all font-bold shadow-lg shadow-[#ec5b13]/20"
                >
                    <UserPlus className="w-5 h-5" />
                    <span className="truncate">Nouveau Client / Dette</span>
                </Button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-[#161616] border border-[#262626] rounded-2xl p-6 flex flex-col gap-2">
                    <p className="text-slate-400 text-sm font-medium">Total des créances (Dehors)</p>
                    <div className="flex items-baseline gap-2">
                        <span className="text-red-500 text-3xl font-black">{formatCurrency(stats.totalDebt, 'DZD')}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-1 text-red-400 text-xs">
                        <TrendingUp className="w-3 h-3" />
                        <span>Dette active globale</span>
                    </div>
                </div>

                <div className="bg-[#161616] border border-[#262626] rounded-2xl p-6 flex flex-col gap-2">
                    <p className="text-slate-400 text-sm font-medium">Paiements récupérés ce mois</p>
                    <div className="flex items-baseline gap-2">
                        <span className="text-emerald-500 text-3xl font-black">{formatCurrency(stats.recoveredThisMonth, 'DZD')}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-1 text-emerald-400 text-xs">
                        <CheckCircle className="w-3 h-3" />
                        <span>Récupération stable</span>
                    </div>
                </div>

                <div className="bg-[#161616] border border-[#262626] rounded-2xl p-6 flex flex-col gap-2">
                    <p className="text-slate-400 text-sm font-medium">Clients endettés</p>
                    <div className="flex items-baseline gap-2">
                        <span className="text-white text-3xl font-black">{stats.indebtedCount} clients</span>
                    </div>
                    <div className="mt-2 flex items-center gap-1 text-slate-400 text-xs">
                        <Users className="w-3 h-3" />
                        <span>Données en temps réel</span>
                    </div>
                </div>
            </div>

            {/* Main Table Section */}
            <div className="bg-[#161616] border border-[#262626] rounded-2xl overflow-hidden shadow-2xl">
                <div className="p-6 border-b border-[#262626] flex justify-between items-center">
                    <h3 className="font-bold text-lg text-white">Liste des clients endettés</h3>

                    <div className="relative w-64">
                        <Input
                            placeholder="Rechercher un client..."
                            startContent={<Search className="text-slate-400 w-4 h-4" />}
                            value={search}
                            onValueChange={setSearch}
                            classNames={{
                                inputWrapper: "bg-[#0a0a0a] border-[#262626] hover:bg-[#111] transition-colors"
                            }}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto text-white">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-[#262626]/30 text-slate-400 text-xs uppercase tracking-wider">
                                <th className="px-6 py-4 font-semibold">Client</th>
                                <th className="px-6 py-4 font-semibold text-center">Dernière Commande</th>
                                <th className="px-6 py-4 font-semibold text-center">Total Dette</th>
                                <th className="px-6 py-4 font-semibold text-center">Statut</th>
                                <th className="px-6 py-4 font-semibold text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#262626]">
                            {clients.map((client) => {
                                const lastOrder = client.orders?.[0];
                                return (
                                    <tr key={client.id} className="hover:bg-[#262626]/20 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="size-10 rounded-full bg-[#ec5b13]/20 flex items-center justify-center text-[#ec5b13] font-bold">
                                                    {client.nomComplet.substring(0, 2).toUpperCase()}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-white font-semibold">{client.nomComplet}</span>
                                                    <span className="text-slate-500 text-xs">{client.telephone}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-slate-400 text-center font-bold">
                                            {lastOrder ? `#${lastOrder.orderNumber}` : "---"}
                                        </td>
                                        <td className="px-6 py-4 text-red-500 font-bold text-center">
                                            {formatCurrency(client.totalDetteDzd || 0, 'DZD')}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <Chip
                                                size="sm"
                                                variant="flat"
                                                className="bg-[#ec5b13]/10 text-[#ec5b13] border border-[#ec5b13]/20"
                                            >
                                                Paiement Partiel
                                            </Chip>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <Button
                                                variant="light"
                                                className="text-[#ec5b13] hover:text-white font-bold text-sm transition-colors"
                                                onPress={() => handleViewClient(client)}
                                            >
                                                Voir Dossier
                                            </Button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {clients.length === 0 && (
                        <div className="p-12 text-center text-slate-500 font-medium">
                            Aucun client avec une dette active trouvé.
                        </div>
                    )}
                </div>
            </div>

            {/* Overlaid Modal (Customer Record) */}
            <Modal
                isOpen={isOpen}
                onClose={onClose}
                size="lg"
                classNames={{
                    base: "bg-[#161616] border border-[#262626] rounded-[24px]",
                    header: "border-b border-[#262626] p-6",
                    body: "p-0",
                    footer: "bg-[#0a0a0a] border-t border-[#262626] p-6"
                }}
            >
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader className="flex justify-between items-start">
                                <div>
                                    <h2 className="text-xl font-bold text-white">Dossier Client : {selectedClient?.nomComplet}</h2>
                                    <p className="text-slate-400 text-sm">Historique des transactions et règlements</p>
                                </div>
                            </ModalHeader>
                            <ModalBody>
                                {/* Repayment Section */}
                                <div className="p-6 bg-[#262626]/10">
                                    <label className="block text-slate-400 text-sm font-medium mb-2">Montant reçu (DZD)</label>
                                    <div className="flex gap-3">
                                        <Input
                                            placeholder="0.00"
                                            type="number"
                                            value={repaymentAmount}
                                            onValueChange={setRepaymentAmount}
                                            classNames={{
                                                inputWrapper: "bg-[#0a0a0a] border-[#262626] h-12"
                                            }}
                                        />
                                        <Button
                                            isLoading={isSubmitting}
                                            onPress={handleSettle}
                                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-12 px-6 rounded-xl transition-all shadow-lg shadow-emerald-900/20 whitespace-nowrap"
                                        >
                                            Valider le remboursement
                                        </Button>
                                    </div>
                                </div>

                                {/* Transaction History */}
                                <div className="p-6 flex flex-col gap-4 max-h-[300px] overflow-y-auto">
                                    <h4 className="text-slate-100 font-semibold text-sm uppercase tracking-wider">Historique Récent</h4>
                                    <div className="space-y-4">
                                        {/* Show Unpaid Orders as negative balance */}
                                        {history.orders.filter(o => Number(o.resteAPayer) > 0).map(order => (
                                            <div key={`order-${order.id}`} className="flex justify-between items-center">
                                                <div className="flex items-center gap-3">
                                                    <div className="bg-red-500/10 p-2 rounded-lg text-red-500">
                                                        <ShoppingCart className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <p className="text-white text-sm font-medium">Achat Commande #{order.orderNumber}</p>
                                                        <p className="text-slate-500 text-xs">
                                                            {order.createdAt ? format(new Date(order.createdAt), "dd MMMM yyyy", { locale: fr }) : "---"}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-red-500 font-bold block">-{formatCurrency(order.totalAmount, 'DZD')}</span>
                                                    <span className="text-slate-500 text-[10px] uppercase font-bold italic">Reste: {formatCurrency(order.resteAPayer || 0, 'DZD')}</span>
                                                </div>
                                            </div>
                                        ))}

                                        {/* Show Payments as positive balance */}
                                        {history.payments.map(payment => (
                                            <div key={`pay-${payment.id}`} className="flex justify-between items-center">
                                                <div className="flex items-center gap-3">
                                                    <div className="bg-emerald-500/10 p-2 rounded-lg text-emerald-500">
                                                        <Wallet className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <p className="text-white text-sm font-medium">Règlement de dette</p>
                                                        <p className="text-slate-500 text-xs">
                                                            {payment.createdAt ? format(new Date(payment.createdAt), "dd MMMM yyyy", { locale: fr }) : "---"}
                                                        </p>

                                                    </div>
                                                </div>
                                                <span className="text-emerald-500 font-bold">+{formatCurrency(payment.montantDzd, 'DZD')}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </ModalBody>
                            <ModalFooter className="flex justify-between items-center">
                                <span className="text-slate-400 font-medium">Dette actuelle</span>
                                <span className="text-2xl font-black text-red-500">
                                    {formatCurrency(selectedClient?.totalDetteDzd || 0, 'DZD')}
                                </span>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>

            {/* New Client Modal */}
            <Modal
                isOpen={isNewOpen}
                onClose={onNewClose}
                classNames={{ base: "bg-[#161616] text-white border border-[#262626]" }}
            >
                <ModalContent>
                    {(onClose) => {
                        const handleSave = async () => {
                            if (!newName) return;
                            setIsCreatingNew(true);
                            const res = await createClient({ nom: newName, telephone: newTel });
                            if ('success' in res && res.success) {
                                toast.success("Client créé");
                                onClose();
                                refreshData();
                                setNewName("");
                                setNewTel("");
                            } else {
                                toast.error((res as any).error || "Erreur création client");
                            }
                            setIsCreatingNew(false);
                        };

                        return (
                            <>
                                <ModalHeader>Nouveau Profil Client</ModalHeader>
                                <ModalBody className="gap-4">
                                    <Input
                                        label="Nom Complet"
                                        placeholder="Ex: Karim Revendeur"
                                        value={newName}
                                        onValueChange={setNewName}
                                        classNames={{ inputWrapper: "bg-[#0a0a0a]" }}
                                    />
                                    <Input
                                        label="Téléphone"
                                        placeholder="06..."
                                        value={newTel}
                                        onValueChange={setNewTel}
                                        classNames={{ inputWrapper: "bg-[#0a0a0a]" }}
                                    />
                                </ModalBody>
                                <ModalFooter>
                                    <Button variant="flat" onPress={onClose} className="text-slate-400">Annuler</Button>
                                    <Button
                                        isLoading={isCreatingNew}
                                        className="bg-[#ec5b13] text-white font-bold"
                                        onPress={handleSave}
                                    >
                                        Créer le Profil
                                    </Button>
                                </ModalFooter>
                            </>
                        );

                    }}
                </ModalContent>
            </Modal>
        </div>
    );
}
