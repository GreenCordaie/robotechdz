"use client";

import React, { useState, useEffect } from "react";
import {
    Card,
    CardBody,
    Spinner,
    Chip,
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Button,
    Input,
    Textarea,
    useDisclosure,
} from "@heroui/react";
import {
    History,
    Search,
    ShoppingBag,
    Copy,
    Eye,
    Send,
    KeyRound,
    Zap,
    AlertTriangle,
    CheckCircle2,
} from "lucide-react";
import {
    getResellerOrdersAction,
    getResellerOrderDetailAction,
    sendCredentialsToClientAction,
} from "../actions";
import { BsvOrdersSection } from "./components/BsvOrdersSection";
import { G2BulkOrdersSection } from "./components/G2BulkOrdersSection";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { toast } from "react-hot-toast";

interface OrderListItem {
    id: number;
    orderNumber: string;
    status: string;
    totalAmount: string;
    createdAt: Date | string;
    itemCount: number;
    productNames: string[];
}

interface OrderDetail {
    id: number;
    orderNumber: string;
    status: string;
    totalAmount: string;
    createdAt: Date | string;
    items: OrderDetailItem[];
}

interface OrderDetailItem {
    id: number;
    name: string;
    productName: string;
    quantity: number;
    price: string;
    standardCodes: string[];
    sharedSlots: Array<{ slotNumber: number; parentCode: string | null; pin: string | null }>;
    iptvProvisions: Array<{
        id: number;
        status: string;
        error: string | null;
        credentials: unknown;
        completedAt: Date | string | null;
    }>;
}

export default function ResellerOrders() {
    const [orders, setOrders] = useState<OrderListItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [activeOrder, setActiveOrder] = useState<OrderDetail | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const detailModal = useDisclosure();
    const sendModal = useDisclosure();

    useEffect(() => {
        const loadOrders = async () => {
            const res = await getResellerOrdersAction({});
            if (res.success) {
                setOrders((res.data as OrderListItem[]) ?? []);
            } else {
                toast.error("Erreur: " + ((res as { error?: string }).error ?? "inconnue"));
            }
            setIsLoading(false);
        };
        loadOrders();
    }, []);

    const visibleOrders = orders.filter((o) =>
        search ? o.orderNumber.toLowerCase().includes(search.toLowerCase()) : true
    );

    const openDetail = async (orderId: number) => {
        setLoadingDetail(true);
        detailModal.onOpen();
        const res = await getResellerOrderDetailAction({ orderId });
        if (res.success) {
            setActiveOrder(res.data as OrderDetail);
        } else {
            toast.error((res as { error?: string }).error ?? "Erreur");
            detailModal.onClose();
        }
        setLoadingDetail(false);
    };

    const closeDetail = () => {
        detailModal.onClose();
        setActiveOrder(null);
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-20">
            <BsvOrdersSection />
            <G2BulkOrdersSection />
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
                        <History className="text-[var(--primary)] size-8" />
                        Mes Commandes
                    </h1>
                    <p className="text-slate-500 font-medium mt-1 uppercase tracking-widest text-[10px]">
                        Historique B2B + codes / credentials récupérables
                    </p>
                </div>

                <div className="relative w-full md:w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input
                        type="text"
                        placeholder="Numéro de commande..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-[#161616] border border-[#262626] rounded-2xl pl-11 pr-4 py-3 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-[var(--primary)]/50"
                    />
                </div>
            </header>

            <Card className="bg-[#161616] border border-[#262626] rounded-[32px] overflow-hidden">
                <CardBody className="p-0">
                    {isLoading ? (
                        <div className="py-40 flex flex-col items-center justify-center gap-4">
                            <Spinner color="warning" />
                            <p className="text-slate-500 font-bold text-xs uppercase tracking-widest">Chargement...</p>
                        </div>
                    ) : visibleOrders.length === 0 ? (
                        <div className="py-40 flex flex-col items-center justify-center gap-6 opacity-30">
                            <ShoppingBag size={64} className="text-slate-500" />
                            <p className="text-xl font-bold italic">Aucune commande pour le moment</p>
                        </div>
                    ) : (
                        <ul className="divide-y divide-[#262626]/50">
                            {visibleOrders.map((order) => (
                                <li
                                    key={order.id}
                                    data-testid="order-row"
                                    className="px-6 py-5 flex flex-col md:flex-row md:items-center gap-4 group hover:bg-white/[0.02] transition-colors"
                                >
                                    <div className="flex-1 min-w-0 space-y-1.5">
                                        <div className="flex items-center gap-3">
                                            <span className="font-black text-white text-sm">{order.orderNumber}</span>
                                            <StatusChip status={order.status} />
                                        </div>
                                        <div className="text-xs text-slate-500 font-medium truncate">
                                            {order.productNames.length > 0
                                                ? `${order.productNames.join(" · ")}${order.itemCount > 3 ? ` · +${order.itemCount - 3}` : ""}`
                                                : `${order.itemCount} article${order.itemCount > 1 ? "s" : ""}`}
                                        </div>
                                        <div className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">
                                            {formatDate(new Date(order.createdAt))}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <span className="font-black text-[var(--primary)] text-base">
                                            {formatCurrency(parseFloat(order.totalAmount), "DZD")}
                                        </span>
                                        <Button
                                            size="sm"
                                            onPress={() => openDetail(order.id)}
                                            data-testid="order-detail-btn"
                                            className="bg-white/5 text-white font-bold border border-white/10 hover:bg-white/10"
                                            startContent={<Eye size={14} />}
                                        >
                                            Détails
                                        </Button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardBody>
            </Card>

            {/* Detail modal */}
            <Modal
                isOpen={detailModal.isOpen}
                onClose={closeDetail}
                size="3xl"
                scrollBehavior="inside"
                classNames={{
                    base: "bg-[#0f0d0c] border border-[#2d2622] rounded-[32px]",
                    header: "border-b border-[#2d2622]",
                    footer: "border-t border-[#2d2622]",
                }}
            >
                <ModalContent>
                    {(close) => (
                        <>
                            <ModalHeader>
                                <div>
                                    <h2 className="text-xl font-black text-white">
                                        Commande {activeOrder?.orderNumber ?? "..."}
                                    </h2>
                                    {activeOrder && (
                                        <p className="text-xs text-slate-500 mt-1">
                                            {formatDate(new Date(activeOrder.createdAt))} ·{" "}
                                            {formatCurrency(parseFloat(activeOrder.totalAmount), "DZD")}
                                        </p>
                                    )}
                                </div>
                            </ModalHeader>
                            <ModalBody className="space-y-6">
                                {loadingDetail || !activeOrder ? (
                                    <div className="py-20 flex justify-center">
                                        <Spinner color="warning" />
                                    </div>
                                ) : (
                                    activeOrder.items.map((item) => (
                                        <ItemBlock key={item.id} item={item} />
                                    ))
                                )}
                            </ModalBody>
                            <ModalFooter>
                                <Button variant="light" onPress={close} className="font-bold">
                                    Fermer
                                </Button>
                                {activeOrder && (
                                    <Button
                                        onPress={sendModal.onOpen}
                                        data-testid="send-to-client-btn"
                                        className="bg-[var(--primary)] text-white font-black"
                                        startContent={<Send size={16} />}
                                    >
                                        Envoyer au client
                                    </Button>
                                )}
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>

            {/* Send to client modal */}
            {activeOrder && (
                <SendToClientModal
                    isOpen={sendModal.isOpen}
                    onClose={sendModal.onClose}
                    orderId={activeOrder.id}
                    orderNumber={activeOrder.orderNumber}
                />
            )}
        </div>
    );
}

function StatusChip({ status }: { status: string }) {
    const map: Record<string, { label: string; className: string }> = {
        PAYE: { label: "Payé", className: "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" },
        LIVRE: { label: "Livré", className: "bg-blue-500/10 text-blue-500 border border-blue-500/20" },
        TERMINE: { label: "Terminé", className: "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" },
        EN_ATTENTE: { label: "En attente", className: "bg-amber-500/10 text-amber-500 border border-amber-500/20" },
        ANNULE: { label: "Annulée", className: "bg-red-500/10 text-red-500 border border-red-500/20" },
        REMBOURSE: { label: "Remboursée", className: "bg-purple-500/10 text-purple-500 border border-purple-500/20" },
    };
    const entry = map[status] ?? { label: status, className: "bg-slate-500/10 text-slate-500 border border-slate-500/20" };
    return (
        <Chip size="sm" className={`${entry.className} font-bold text-[10px] uppercase tracking-wider`}>
            {entry.label}
        </Chip>
    );
}

function ItemBlock({ item }: { item: OrderDetailItem }) {
    const copy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success("Copié");
        } catch {
            toast.error("Copie impossible");
        }
    };

    const hasContent =
        item.standardCodes.length > 0 || item.sharedSlots.length > 0 || item.iptvProvisions.length > 0;

    return (
        <div className="bg-[#161616] border border-[#262626] rounded-2xl p-5 space-y-4">
            <header className="flex items-center justify-between">
                <div>
                    <h3 className="font-bold text-white text-sm">{item.productName}</h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                        {item.name} · ×{item.quantity}
                    </p>
                </div>
                <span className="text-sm font-black text-[var(--primary)]">
                    {formatCurrency(parseFloat(item.price) * item.quantity, "DZD")}
                </span>
            </header>

            {!hasContent && (
                <p className="text-xs text-slate-500 italic py-4 text-center">
                    Aucun code disponible — livraison manuelle en attente.
                </p>
            )}

            {item.standardCodes.length > 0 && (
                <section className="space-y-2">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                        <KeyRound size={12} /> Codes ({item.standardCodes.length})
                    </h4>
                    <div className="space-y-2">
                        {item.standardCodes.map((code, idx) => (
                            <CredentialRow key={idx} label={`#${idx + 1}`} value={code} onCopy={() => copy(code)} />
                        ))}
                    </div>
                </section>
            )}

            {item.sharedSlots.length > 0 && (
                <section className="space-y-2">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                        <KeyRound size={12} /> Profils partagés ({item.sharedSlots.length})
                    </h4>
                    <div className="space-y-2">
                        {item.sharedSlots.map((slot, idx) => (
                            <div key={idx} className="bg-[#0a0a0a] border border-white/5 rounded-xl p-3 space-y-2">
                                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    <span>Profil {slot.slotNumber}</span>
                                </div>
                                {slot.parentCode && (
                                    <CredentialRow label="Accès" value={slot.parentCode} onCopy={() => copy(slot.parentCode!)} />
                                )}
                                {slot.pin && (
                                    <CredentialRow label="PIN" value={slot.pin} onCopy={() => copy(slot.pin!)} />
                                )}
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {item.iptvProvisions.length > 0 && (
                <section className="space-y-2">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                        <Zap size={12} /> Provisioning LoadBrain
                    </h4>
                    <div className="space-y-2">
                        {item.iptvProvisions.map((p) => (
                            <IptvProvisionBlock key={p.id} provision={p} onCopy={copy} />
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}

function IptvProvisionBlock({
    provision,
    onCopy,
}: {
    provision: OrderDetailItem["iptvProvisions"][number];
    onCopy: (s: string) => void | Promise<void>;
}) {
    const isDone = provision.status === "completed";
    const isFailed = provision.status === "failed";
    const inProgress = provision.status === "queued" || provision.status === "processing";

    const creds = provision.credentials as Record<string, unknown> | null;

    return (
        <div className="bg-[#0a0a0a] border border-white/5 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">IPTV</span>
                {isDone && (
                    <span className="text-[10px] font-black uppercase text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 size={10} />
                        Livré
                    </span>
                )}
                {inProgress && (
                    <span className="text-[10px] font-black uppercase text-amber-400 flex items-center gap-1">
                        <Spinner size="sm" color="warning" />
                        En cours
                    </span>
                )}
                {isFailed && (
                    <span className="text-[10px] font-black uppercase text-red-400 flex items-center gap-1">
                        <AlertTriangle size={10} />
                        Échec
                    </span>
                )}
            </div>

            {isFailed && provision.error && (
                <p className="text-xs text-red-400/80 italic">{provision.error}</p>
            )}

            {isDone && creds && typeof creds === "object" && (
                <div className="space-y-1.5">
                    {Object.entries(creds)
                        .filter(([_, v]) => typeof v === "string" && v.length > 0)
                        .map(([key, value]) => (
                            <CredentialRow
                                key={key}
                                label={key}
                                value={String(value)}
                                onCopy={() => onCopy(String(value))}
                            />
                        ))}
                </div>
            )}
        </div>
    );
}

function CredentialRow({ label, value, onCopy }: { label: string; value: string; onCopy: () => void | Promise<void> }) {
    return (
        <div className="flex items-center justify-between gap-3 bg-white/5 rounded-lg px-3 py-2">
            <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</p>
                <code className="text-sm font-bold text-white break-all">{value}</code>
            </div>
            <button
                type="button"
                onClick={onCopy}
                className="p-2 text-slate-500 hover:text-[var(--primary)] hover:bg-[var(--primary)]/10 rounded-lg transition-colors"
                aria-label={`Copier ${label}`}
            >
                <Copy size={14} />
            </button>
        </div>
    );
}

function SendToClientModal({
    isOpen,
    onClose,
    orderId,
    orderNumber,
}: {
    isOpen: boolean;
    onClose: () => void;
    orderId: number;
    orderNumber: string;
}) {
    const [phone, setPhone] = useState("");
    const [message, setMessage] = useState("");
    const [sending, setSending] = useState(false);

    const submit = async () => {
        setSending(true);
        try {
            const res = await sendCredentialsToClientAction({
                orderId,
                customerPhone: phone,
                customMessage: message || undefined,
            });
            if (res.success) {
                const data = res.data as { delivered: boolean; queuedForLater: boolean; reason?: string };
                if (data.queuedForLater) {
                    toast.success("Mis en queue WhatsApp ✓");
                } else if (data.delivered) {
                    toast.success("Envoyé ✓");
                } else {
                    toast(data.reason ?? "Action enregistrée", { icon: "ℹ️" });
                }
                onClose();
            } else {
                toast.error((res as { error?: string }).error ?? "Échec");
            }
        } finally {
            setSending(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="lg"
            classNames={{
                base: "bg-[#0f0d0c] border border-[#2d2622] rounded-[32px]",
                header: "border-b border-[#2d2622]",
                footer: "border-t border-[#2d2622]",
            }}
        >
            <ModalContent>
                {(close) => (
                    <>
                        <ModalHeader>
                            <div>
                                <h2 className="text-xl font-black text-white">Envoyer au client</h2>
                                <p className="text-xs text-slate-500 font-medium mt-1">
                                    Commande {orderNumber} — codes envoyés via WhatsApp
                                </p>
                            </div>
                        </ModalHeader>
                        <ModalBody className="space-y-4">
                            <Input
                                label="Numéro WhatsApp du client"
                                placeholder="+213 555 000 000"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                variant="flat"
                                isRequired
                            />
                            <Textarea
                                label="Message personnalisé (optionnel)"
                                placeholder="Bonjour, voici vos accès..."
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                variant="flat"
                                maxLength={500}
                                description={`${message.length}/500`}
                            />
                            <p className="text-[10px] text-slate-500 italic flex items-center gap-2">
                                ℹ️ Le serveur enverra le message à l&apos;arrière-plan via WhatsApp.
                                En mode test (WhatsApp non configuré), l&apos;action est validée sans envoi réel.
                            </p>
                        </ModalBody>
                        <ModalFooter>
                            <Button variant="light" onPress={close} className="font-bold">
                                Annuler
                            </Button>
                            <Button
                                onPress={submit}
                                disabled={sending || phone.length < 8}
                                className="bg-[var(--primary)] text-white font-black"
                                data-testid="send-submit"
                            >
                                {sending ? <Spinner size="sm" color="white" /> : "Envoyer"}
                            </Button>
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
}
