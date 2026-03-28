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
    Wallet,
    Edit2,
    Trash2,
    MessageSquare
} from "lucide-react";
import { useRouter } from "next/navigation";
import { getIndebtedClients, recordPayment, getClientHistory, createClient, getReturnsByClient, getAllClients, updateClient, deleteClient, getClientStats } from "@/app/admin/clients/actions";
import { ReturnRequest } from "@/lib/constants";
import WhatsAppHistoryModal from "@/components/admin/modals/WhatsAppHistoryModal";

import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "react-hot-toast";
import { formatCurrency, formatWhatsApp, formatPhoneNatural } from "@/lib/formatters";

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
    oldBalanceDzd?: string | null;
    newBalanceDzd?: string | null;
    receiptNumber?: string | null;
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
    const [clientReturns, setClientReturns] = React.useState<Array<{ orderId: number; orderNumber: string; totalAmount: string; returnRequest: ReturnRequest; orderCreatedAt: Date | null }>>([]);

    const [repaymentAmount, setRepaymentAmount] = React.useState("");
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    // New Client Modal State
    const [newName, setNewName] = React.useState("");
    const [newTel, setNewTel] = React.useState("");
    const [isCreatingNew, setIsCreatingNew] = React.useState(false);

    // Edit Client States
    const [isEditOpen, setIsEditOpen] = React.useState(false);
    const [editingClient, setEditingClient] = React.useState<Client | null>(null);
    const [editName, setEditName] = React.useState("");
    const [editTel, setEditTel] = React.useState("");
    const [isUpdating, setIsUpdating] = React.useState(false);

    // Delete Client States
    const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
    const [clientToDelete, setClientToDelete] = React.useState<Client | null>(null);
    const [isDeleting, setIsDeleting] = React.useState(false);


    const { isOpen, onOpen, onClose } = useDisclosure();
    const { isOpen: isNewOpen, onOpen: onNewOpen, onClose: onNewClose } = useDisclosure();

    // WhatsApp history modal state
    const [isWhatsAppOpen, setIsWhatsAppOpen] = React.useState(false);
    const [whatsappClient, setWhatsappClient] = React.useState<Client | null>(null);

    // Polling or refresh logic
    const refreshData = React.useCallback(async () => {
        const [resClients, resStats] = await Promise.all([
            getAllClients({}),
            getClientStats({})
        ]);

        if (resClients && resClients.success && Array.isArray(resClients.clients)) {
            setClients(resClients.clients as Client[]);
        } else if (resClients) {
            toast.error("Erreur lors de la récupération des clients");
        }

        if (resStats && resStats.success) {
            setStats({
                totalDebt: parseFloat(resStats.totalDebt || "0"),
                recoveredThisMonth: parseFloat(resStats.recoveredThisMonth || "0"),
                indebtedCount: resStats.indebtedCount || 0
            });
        }
    }, []);


    React.useEffect(() => {
        const timeout = setTimeout(() => refreshData(), 30000); // Sustainable 30s interval
        return () => clearTimeout(timeout);
    }, [refreshData, stats]); // Add stats as dependency if it changes


    const handleViewClient = async (client: Client) => {
        setSelectedClient(client);
        setClientReturns([]);
        const data = await getClientHistory({ clientId: client.id }) as { success?: boolean; payments: any[], orders: any[], returns: any[] };

        if (!data || !data.success) {
            toast.error("Erreur lors de la récupération de l'historique");
            return;
        }

        setHistory({
            payments: (data.payments || []).map(p => ({ ...p, createdAt: p.createdAt ? new Date(p.createdAt) : null })),
            orders: (data.orders || []).map(o => ({ ...o, createdAt: o.createdAt ? new Date(o.createdAt) : null }))
        });

        if (data.returns) {
            setClientReturns(data.returns);
        }
        onOpen();
    };


    const handleSettle = async () => {
        if (!selectedClient || !repaymentAmount || Number(repaymentAmount) <= 0) return;
        setIsSubmitting(true);
        try {
            const res = (await recordPayment({
                clientId: selectedClient.id,
                amount: repaymentAmount,
                typeAction: "ACOMPTE" // Default for manual settle
            })) as { success: boolean; error?: string };
            if (res.success) {
                toast.success("Paiement enregistré avec succès");
                setRepaymentAmount("");
                onClose();
                refreshData();
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

    const handleEditClient = (client: Client) => {
        setEditingClient(client);
        setEditName(client.nomComplet);
        setEditTel(client.telephone || "");
        setIsEditOpen(true);
    };

    const handleUpdateClient = async () => {
        if (!editingClient || !editName) return;
        setIsUpdating(true);
        try {
            const res = await updateClient({
                id: editingClient.id,
                nomComplet: editName,
                telephone: editTel
            }) as { success: boolean; error?: string };

            if (res.success) {
                toast.success("Client mis à jour");
                setIsEditOpen(false);
                refreshData();
            } else {
                toast.error(res.error || "Erreur lors de la mise à jour");
            }
        } catch (error) {
            toast.error("Erreur lors de la mise à jour");
        } finally {
            setIsUpdating(false);
        }
    };

    const handleDeleteClick = (client: Client) => {
        setClientToDelete(client);
        setIsDeleteOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!clientToDelete) return;
        setIsDeleting(true);
        try {
            const res = await deleteClient({ id: clientToDelete.id }) as { success: boolean; error?: string };
            if (res.success) {
                toast.success("Client supprimé");
                setIsDeleteOpen(false);
                refreshData();
            } else {
                toast.error(res.error || "Erreur lors de la suppression");
            }
        } catch (error) {
            toast.error("Erreur lors de la suppression");
        } finally {
            setIsDeleting(false);
        }
    };

    const handleShareWhatsApp = (payment: any) => {
        if (!selectedClient?.telephone) {
            toast.error("Téléphone du client manquant");
            return;
        }

        const phone = selectedClient.telephone.startsWith('0')
            ? '213' + selectedClient.telephone.slice(1)
            : selectedClient.telephone;

        const dateStr = payment.date ? format(new Date(payment.date), "dd/MM/yyyy HH:mm", { locale: fr }) : "";

        const message = `*REÇU DE PAIEMENT - FLEXBOX DIRECT*\n\n` +
            `Client: ${selectedClient.nomComplet}\n` +
            `Date: ${dateStr}\n` +
            `Reçu N°: ${payment.receiptNumber || '---'}\n` +
            `---------------------------\n` +
            `*MONTANT VERSÉ: ${formatCurrency(payment.amount, 'DZD')}*\n` +
            `---------------------------\n` +
            `Ancien Solde: ${formatCurrency(payment.oldBalance || 0, 'DZD')}\n` +
            `*NOUVEAU SOLDE: ${formatCurrency(payment.newBalance || 0, 'DZD')}*\n\n` +
            `Merci de votre confiance !`;

        const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    };

    return (
        <div className="flex-1 flex flex-col max-w-7xl mx-auto w-full px-6 py-8 gap-8 bg-background-light dark:bg-[#0a0a0a]">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="text-slate-900 dark:text-white text-3xl font-bold tracking-tight">Clients & Crédits</h1>
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
                        <span className="text-slate-900 dark:text-white text-3xl font-black">{stats.indebtedCount} clients</span>
                    </div>
                    <div className="mt-2 flex items-center gap-1 text-slate-400 text-xs">
                        <Users className="w-3 h-3" />
                        <span>Données en temps réel</span>
                    </div>
                </div>
            </div>

            {/* Main Table Section */}
            <div className="bg-white dark:bg-[#161616] border border-slate-200 dark:border-[#262626] rounded-2xl overflow-hidden shadow-sm dark:shadow-2xl">
                <div className="p-6 border-b border-[#262626] flex justify-between items-center">
                    <h3 className="font-bold text-lg text-slate-900 dark:text-white">Liste des clients</h3>

                    <div className="relative w-full max-w-xs md:w-64">
                        <Input
                            placeholder="Rechercher un client..."
                            startContent={<Search className="text-slate-400 w-4 h-4 shrink-0" />}
                            value={search}
                            onValueChange={setSearch}
                            classNames={{
                                inputWrapper: "bg-slate-50 dark:bg-[#0a0a0a] border-slate-200 dark:border-[#262626] hover:bg-slate-100 dark:hover:bg-[#111] transition-colors"
                            }}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto text-slate-900 dark:text-white">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-[#262626]/30 text-slate-400 text-xs uppercase tracking-wider">
                                <th className="px-6 py-4 font-semibold">Client</th>
                                <th className="px-6 py-4 font-semibold text-center">Dernière Commande</th>
                                <th className="px-6 py-4 font-semibold text-center">Total Dette</th>
                                <th className="px-6 py-4 font-semibold text-center">Statut</th>
                                <th className="px-6 py-4 font-semibold text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-[#262626]">
                            {clients.map((client) => {
                                const lastOrder = client.orders?.[0];
                                return (
                                    <tr key={client.id} className="hover:bg-slate-50 dark:hover:bg-[#262626]/20 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="size-10 rounded-full bg-[#ec5b13]/20 flex items-center justify-center text-[#ec5b13] font-bold">
                                                    {client.nomComplet.substring(0, 2).toUpperCase()}
                                                </div>
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-slate-900 dark:text-white font-semibold truncate">{client.nomComplet}</span>
                                                    <span className="text-slate-500 text-xs truncate">{formatPhoneNatural(client.telephone)}</span>
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
                                            {Number(client.totalDetteDzd) > 0 ? (
                                                <Chip
                                                    size="sm"
                                                    variant="flat"
                                                    className="bg-[#ec5b13]/10 text-[#ec5b13] border border-[#ec5b13]/20 font-bold"
                                                >
                                                    En Dette
                                                </Chip>
                                            ) : (
                                                <Chip
                                                    size="sm"
                                                    variant="flat"
                                                    className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-bold"
                                                >
                                                    Dette Réglée
                                                </Chip>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {client.telephone && (
                                                    <button
                                                        onClick={() => {
                                                            setWhatsappClient(client);
                                                            setIsWhatsAppOpen(true);
                                                        }}
                                                        className="p-1.5 rounded-lg bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] transition-all"
                                                        title="Voir historique WhatsApp"
                                                    >
                                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.438 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                                                        </svg>
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleEditClient(client)}
                                                    className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition-all"
                                                    title="Modifier le client"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteClick(client)}
                                                    className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all"
                                                    title="Supprimer le client"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                                <Button
                                                    variant="light"
                                                    className="text-[#ec5b13] hover:text-white font-bold text-sm transition-colors"
                                                    onPress={() => handleViewClient(client)}
                                                >
                                                    Voir Dossier
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {clients.length === 0 && (
                        <div className="p-12 text-center text-slate-500 font-medium">
                            Aucun client trouvé.
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
                    base: "bg-white dark:bg-[#161616] border border-slate-200 dark:border-[#262626] rounded-[24px]",
                    header: "border-b border-slate-200 dark:border-[#262626] p-6",
                    body: "p-0",
                    footer: "bg-slate-50 dark:bg-[#0a0a0a] border-t border-slate-200 dark:border-[#262626] p-6 text-slate-900 dark:text-white"
                }}
            >
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader className="flex justify-between items-start">
                                <div>
                                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Dossier Client : {selectedClient?.nomComplet}</h2>
                                    <p className="text-slate-400 text-sm">Historique des transactions et règlements</p>
                                </div>
                            </ModalHeader>
                            <ModalBody>
                                {/* Repayment Section */}
                                <div className="p-6 bg-slate-50 dark:bg-[#262626]/10">
                                    <label className="block text-slate-400 text-sm font-medium mb-2">Montant reçu (DZD)</label>
                                    <div className="flex flex-col sm:flex-row gap-3">
                                        <Input
                                            placeholder="0.00"
                                            type="number"
                                            value={repaymentAmount}
                                            onValueChange={setRepaymentAmount}
                                            classNames={{
                                                inputWrapper: "bg-white dark:bg-[#0a0a0a] border-slate-200 dark:border-[#262626] h-12"
                                            }}
                                            className="flex-1"
                                        />
                                        <Button
                                            isLoading={isSubmitting}
                                            onPress={handleSettle}
                                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-12 px-6 rounded-xl transition-all shadow-lg shadow-emerald-900/20 whitespace-nowrap w-full sm:w-auto"
                                        >
                                            Valider le remboursement
                                        </Button>
                                    </div>
                                </div>

                                {/* Consolidated Movement journal */}
                                <div className="p-6 flex flex-col gap-4 max-h-[450px] overflow-y-auto">
                                    <h4 className="text-slate-700 dark:text-slate-100 font-semibold text-sm uppercase tracking-wider">Journal des Flux</h4>

                                    <div className="space-y-4">
                                        {React.useMemo(() => {
                                            const entries: any[] = [
                                                ...history.payments.map(p => ({
                                                    id: `pay-${p.id}`,
                                                    date: p.createdAt,
                                                    type: 'PAYMENT',
                                                    amount: p.montantDzd || "0",
                                                    label: p.typeAction === 'REMBOURSEMENT' ? 'Remboursement (Retour)' : 'Règlement de dette',
                                                    icon: Wallet,
                                                    color: 'text-emerald-500',
                                                    bgColor: 'bg-emerald-500/10',
                                                    oldBalance: p.oldBalanceDzd,
                                                    newBalance: p.newBalanceDzd,
                                                    receiptNumber: p.receiptNumber
                                                })),
                                                ...history.orders.map(o => ({
                                                    id: `order-${o.id}`,
                                                    date: o.createdAt,
                                                    type: 'ORDER',
                                                    amount: o.totalAmount || "0",
                                                    resteAPayer: o.resteAPayer || "0",
                                                    label: `Achat Commande #${o.orderNumber}`,
                                                    icon: ShoppingCart,
                                                    color: 'text-red-500',
                                                    bgColor: 'bg-red-500/10',
                                                    items: (o as any).items || []
                                                })),
                                                ...clientReturns.filter(r => r.returnRequest && r.returnRequest.status !== 'APPROUVE').map(r => ({
                                                    id: `return-${r.orderId}`,
                                                    date: new Date(r.returnRequest.initiatedAt),
                                                    type: 'RETURN',
                                                    amount: r.returnRequest.montant,
                                                    status: r.returnRequest.status,
                                                    label: `Retour Commande #${r.orderNumber}`,
                                                    icon: X,
                                                    color: r.returnRequest.status === 'REJETE' ? 'text-slate-400' : 'text-yellow-500',
                                                    bgColor: r.returnRequest.status === 'REJETE' ? 'bg-slate-500/10' : 'bg-yellow-500/10',
                                                    motifRejet: r.returnRequest.motifRejet
                                                }))
                                            ];
                                            return entries.sort((a, b) => {
                                                const dateA = a.date instanceof Date ? a.date.getTime() : new Date(a.date).getTime();
                                                const dateB = b.date instanceof Date ? b.date.getTime() : new Date(b.date).getTime();
                                                return dateB - dateA;
                                            });
                                        }, [history, clientReturns]).map((entry: any) => {
                                            const Icon = entry.icon;
                                            return (
                                                <div key={entry.id} className="group border-b border-slate-100 dark:border-slate-800/50 pb-4 last:border-0 last:pb-0">
                                                    <div className="flex justify-between items-start">
                                                        <div className="flex gap-3">
                                                            <div className={`${entry.bgColor} ${entry.color} p-2.5 rounded-xl transition-transform group-hover:scale-110`}>
                                                                <Icon className="w-5 h-5" />
                                                            </div>
                                                            <div>
                                                                <p className="text-slate-900 dark:text-white text-sm font-bold">{entry.label}</p>
                                                                <p className="text-slate-500 text-[10px] font-medium uppercase mt-0.5">
                                                                    {entry.date ? format(new Date(entry.date), "dd MMMM yyyy HH:mm", { locale: fr }) : "---"}
                                                                </p>

                                                                {entry.type === 'PAYMENT' && (
                                                                    <Button
                                                                        size="sm"
                                                                        variant="flat"
                                                                        className="h-7 px-2 mt-2 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 font-bold border border-[#25D366]/20"
                                                                        onPress={() => handleShareWhatsApp(entry)}
                                                                        startContent={<MessageSquare className="w-3 h-3" />}
                                                                    >
                                                                        Partager WhatsApp
                                                                    </Button>
                                                                )}

                                                                {entry.type === 'ORDER' && entry.items?.length > 0 && (
                                                                    <div className="mt-2 pl-2 border-l-2 border-slate-100 dark:border-slate-800 space-y-1">
                                                                        {entry.items.map((item: any, idx: number) => (
                                                                            <p key={idx} className="text-slate-600 dark:text-slate-400 text-[11px] leading-tight">
                                                                                • {item.name} <span className="text-slate-400">x{item.quantity}</span>
                                                                            </p>
                                                                        ))}
                                                                    </div>
                                                                )}

                                                                {entry.type === 'RETURN' && (
                                                                    <div className="mt-1">
                                                                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${entry.status === 'EN_ATTENTE' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' :
                                                                            'bg-red-500/10 text-red-500 border-red-500/20'
                                                                            }`}>
                                                                            {entry.status === 'EN_ATTENTE' ? 'En attente' : 'Rejeté'}
                                                                        </span>
                                                                        {entry.motifRejet && (
                                                                            <p className="text-[10px] text-red-400 italic mt-1">Motif: {entry.motifRejet}</p>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className={`${entry.color} font-black text-sm`}>
                                                                {entry.type === 'ORDER' ? '-' : '+'}{formatCurrency(entry.amount, 'DZD')}
                                                            </span>
                                                            {entry.type === 'ORDER' && Number(entry.resteAPayer) > 0 && (
                                                                <span className="text-orange-500 text-[9px] font-black uppercase block mt-1 tracking-tighter italic">
                                                                    Dette: {formatCurrency(entry.resteAPayer, 'DZD')}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
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
                classNames={{ base: "bg-white dark:bg-[#161616] text-slate-900 dark:text-white border border-slate-200 dark:border-[#262626]" }}
            >
                <ModalContent>
                    {(onClose) => {
                        const handleSave = async () => {
                            if (!newName) return;
                            setIsCreatingNew(true);
                            const res = (await createClient({ nom: newName, telephone: newTel })) as { success: boolean; error?: string };
                            if (res.success) {
                                toast.success("Client créé");
                                onClose();
                                refreshData();
                                setNewName("");
                                setNewTel("");
                            } else {
                                toast.error(res.error || "Erreur création client");
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
                                        classNames={{ inputWrapper: "bg-slate-50 dark:bg-[#0a0a0a] border-slate-200 dark:border-[#262626]" }}
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

            <WhatsAppHistoryModal
                isOpen={isWhatsAppOpen}
                onClose={() => {
                    setIsWhatsAppOpen(false);
                    setWhatsappClient(null);
                }}
                clientId={whatsappClient?.id ?? 0}
                clientName={whatsappClient?.nomComplet ?? ""}
                clientPhone={whatsappClient?.telephone ?? ""}
            />

            {/* Edit Client Modal */}
            <Modal
                isOpen={isEditOpen}
                onClose={() => setIsEditOpen(false)}
                classNames={{ base: "bg-white dark:bg-[#161616] text-slate-900 dark:text-white border border-slate-200 dark:border-[#262626]" }}
            >
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader>Modifier le Profil Client</ModalHeader>
                            <ModalBody className="gap-4">
                                <Input
                                    label="Nom Complet"
                                    value={editName}
                                    onValueChange={setEditName}
                                    classNames={{ inputWrapper: "bg-[#0a0a0a]" }}
                                />
                                <Input
                                    label="Téléphone"
                                    value={editTel}
                                    onValueChange={setEditTel}
                                    classNames={{ inputWrapper: "bg-slate-50 dark:bg-[#0a0a0a] border-slate-200 dark:border-[#262626]" }}
                                />
                            </ModalBody>
                            <ModalFooter>
                                <Button variant="flat" onPress={onClose} className="text-slate-400">Annuler</Button>
                                <Button
                                    isLoading={isUpdating}
                                    className="bg-[#ec5b13] text-white font-bold"
                                    onPress={handleUpdateClient}
                                >
                                    Sauvegarder
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={isDeleteOpen}
                onClose={() => setIsDeleteOpen(false)}
                classNames={{ base: "bg-white dark:bg-[#161616] text-slate-900 dark:text-white border border-slate-200 dark:border-[#262626]" }}
            >
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader>Confirmer la suppression</ModalHeader>
                            <ModalBody>
                                <p className="text-slate-600 dark:text-slate-300">
                                    Êtes-vous sûr de vouloir supprimer le client <span className="text-slate-900 dark:text-white font-bold">{clientToDelete?.nomComplet}</span> ?
                                </p>
                                <p className="text-red-400 text-xs mt-2 italic">
                                    Note : La suppression échouera si le client possède déjà des commandes enregistrées (historique protégé).
                                </p>
                            </ModalBody>
                            <ModalFooter>
                                <Button variant="flat" onPress={onClose} className="text-slate-400">Annuler</Button>
                                <Button
                                    isLoading={isDeleting}
                                    color="danger"
                                    className="font-bold"
                                    onPress={handleConfirmDelete}
                                >
                                    Supprimer définitivement
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>
        </div>
    );
}
