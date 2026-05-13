"use client";

import React, { useEffect, useState } from "react";
import {
    Spinner,
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Button,
    Input,
    Textarea,
    useDisclosure,
    Chip,
} from "@heroui/react";
import {
    Inbox,
    CheckCircle2,
    XCircle,
    Mail,
    Phone,
    Building2,
    FileText,
    Clock,
    Copy,
    Eye,
} from "lucide-react";
import { toast } from "react-hot-toast";
import {
    listSignupRequestsAction,
    approveSignupRequestAction,
    rejectSignupRequestAction,
} from "./actions";

interface SignupRequest {
    id: number;
    email: string;
    companyName: string;
    contactPhone: string;
    nif: string | null;
    rcNumber: string | null;
    message: string | null;
    status: string;
    rejectedReason: string | null;
    processedAt: Date | string | null;
    createdAt: Date | string;
}

interface ApproveResult {
    resellerId: number;
    userId: number;
    generatedPin: string;
    generatedPassword: string;
}

export default function SignupsContent() {
    const [requests, setRequests] = useState<SignupRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<"PENDING" | "APPROVED" | "REJECTED" | "ALL">("PENDING");
    const [activeRequest, setActiveRequest] = useState<SignupRequest | null>(null);

    const detailModal = useDisclosure();
    const approveModal = useDisclosure();
    const rejectModal = useDisclosure();
    const credsModal = useDisclosure();

    const [credentials, setCredentials] = useState<ApproveResult | null>(null);
    const [customDiscount, setCustomDiscount] = useState("");
    const [rejectReason, setRejectReason] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const load = async () => {
        setLoading(true);
        const res = await listSignupRequestsAction({ status: filter });
        if (res.success) {
            setRequests(res.data as SignupRequest[]);
        } else {
            toast.error("Erreur chargement");
        }
        setLoading(false);
    };

    useEffect(() => {
        load();
    }, [filter]);

    const openDetail = (req: SignupRequest) => {
        setActiveRequest(req);
        detailModal.onOpen();
    };

    const startApprove = (req: SignupRequest) => {
        setActiveRequest(req);
        setCustomDiscount("");
        approveModal.onOpen();
    };

    const startReject = (req: SignupRequest) => {
        setActiveRequest(req);
        setRejectReason("");
        rejectModal.onOpen();
    };

    const submitApprove = async () => {
        if (!activeRequest) return;
        setSubmitting(true);
        try {
            const res = await approveSignupRequestAction({
                requestId: activeRequest.id,
                customDiscount: customDiscount || undefined,
            });
            if (res.success) {
                setCredentials(res.data as ApproveResult);
                approveModal.onClose();
                detailModal.onClose();
                credsModal.onOpen();
                toast.success("Reseller créé");
                await load();
            } else {
                toast.error(res.error || "Échec");
            }
        } finally {
            setSubmitting(false);
        }
    };

    const submitReject = async () => {
        if (!activeRequest || !rejectReason) return;
        setSubmitting(true);
        try {
            const res = await rejectSignupRequestAction({
                requestId: activeRequest.id,
                reason: rejectReason,
            });
            if (res.success) {
                rejectModal.onClose();
                detailModal.onClose();
                toast.success("Demande rejetée");
                await load();
            } else {
                toast.error(res.error || "Échec");
            }
        } finally {
            setSubmitting(false);
        }
    };

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success("Copié");
        } catch {
            toast.error("Copie impossible");
        }
    };

    return (
        <div className="p-8 space-y-6 max-w-7xl">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
                        <Inbox className="text-[var(--primary)]" />
                        Demandes Reseller
                    </h1>
                    <p className="text-sm text-slate-500 font-medium mt-1">
                        Validez ou rejetez les demandes d&apos;accès B2B publiques.
                    </p>
                </div>

                <div className="flex gap-2 bg-[#161616] p-1.5 rounded-xl border border-[#262626]">
                    {(
                        [
                            ["PENDING", "À traiter"],
                            ["APPROVED", "Approuvées"],
                            ["REJECTED", "Rejetées"],
                            ["ALL", "Toutes"],
                        ] as const
                    ).map(([key, label]) => (
                        <button
                            key={key}
                            onClick={() => setFilter(key)}
                            className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                                filter === key
                                    ? "bg-[var(--primary)] text-white"
                                    : "text-slate-500 hover:text-white"
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </header>

            {loading ? (
                <div className="py-20 flex justify-center">
                    <Spinner color="warning" />
                </div>
            ) : requests.length === 0 ? (
                <div className="py-20 text-center text-slate-500 italic">
                    Aucune demande {filter === "ALL" ? "" : "dans cet état"}.
                </div>
            ) : (
                <ul className="divide-y divide-[#262626] bg-[#161616] border border-[#262626] rounded-2xl overflow-hidden">
                    {requests.map((req) => (
                        <li
                            key={req.id}
                            data-testid="signup-request-row"
                            className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-white/[0.02]"
                        >
                            <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <span className="font-bold text-white text-sm">{req.companyName}</span>
                                    <StatusBadge status={req.status} />
                                </div>
                                <div className="text-xs text-slate-500 font-medium flex flex-wrap gap-3">
                                    <span className="flex items-center gap-1">
                                        <Mail size={12} /> {req.email}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Phone size={12} /> {req.contactPhone}
                                    </span>
                                    {req.nif && (
                                        <span className="flex items-center gap-1">
                                            <FileText size={12} /> NIF {req.nif}
                                        </span>
                                    )}
                                </div>
                                <div className="text-[10px] text-slate-600 font-bold uppercase tracking-widest flex items-center gap-1">
                                    <Clock size={10} /> {new Date(req.createdAt).toLocaleString("fr-FR")}
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    onPress={() => openDetail(req)}
                                    className="bg-white/5 text-white font-bold border border-white/10"
                                    startContent={<Eye size={14} />}
                                >
                                    Détails
                                </Button>
                                {req.status === "PENDING" && (
                                    <>
                                        <Button
                                            size="sm"
                                            onPress={() => startApprove(req)}
                                            data-testid="signup-approve-btn"
                                            className="bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/30"
                                            startContent={<CheckCircle2 size={14} />}
                                        >
                                            Approuver
                                        </Button>
                                        <Button
                                            size="sm"
                                            onPress={() => startReject(req)}
                                            className="bg-red-500/15 text-red-400 font-bold border border-red-500/30"
                                            startContent={<XCircle size={14} />}
                                        >
                                            Rejeter
                                        </Button>
                                    </>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {/* Detail modal */}
            <Modal
                isOpen={detailModal.isOpen}
                onClose={detailModal.onClose}
                size="2xl"
                classNames={{
                    base: "bg-[#0f0d0c] border border-[#2d2622] rounded-3xl",
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
                                        {activeRequest?.companyName}
                                    </h2>
                                    <p className="text-xs text-slate-500 mt-1">{activeRequest?.email}</p>
                                </div>
                            </ModalHeader>
                            <ModalBody className="space-y-3 text-sm">
                                <Field label="Téléphone" value={activeRequest?.contactPhone} />
                                <Field label="NIF" value={activeRequest?.nif ?? "—"} />
                                <Field label="N° RC" value={activeRequest?.rcNumber ?? "—"} />
                                <Field label="Status" value={activeRequest?.status ?? ""} />
                                {activeRequest?.message && (
                                    <div className="pt-3 border-t border-[#2d2622]">
                                        <p className="text-[10px] uppercase font-black text-slate-500 mb-2">
                                            Message
                                        </p>
                                        <p className="text-slate-300 whitespace-pre-wrap">{activeRequest.message}</p>
                                    </div>
                                )}
                                {activeRequest?.rejectedReason && (
                                    <div className="pt-3 border-t border-[#2d2622]">
                                        <p className="text-[10px] uppercase font-black text-red-500 mb-2">
                                            Motif du rejet
                                        </p>
                                        <p className="text-red-400">{activeRequest.rejectedReason}</p>
                                    </div>
                                )}
                            </ModalBody>
                            <ModalFooter>
                                <Button variant="light" onPress={close} className="font-bold">
                                    Fermer
                                </Button>
                                {activeRequest?.status === "PENDING" && (
                                    <>
                                        <Button
                                            onPress={() => activeRequest && startReject(activeRequest)}
                                            className="bg-red-500/15 text-red-400 font-bold border border-red-500/30"
                                            startContent={<XCircle size={14} />}
                                        >
                                            Rejeter
                                        </Button>
                                        <Button
                                            onPress={() => activeRequest && startApprove(activeRequest)}
                                            className="bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/30"
                                            startContent={<CheckCircle2 size={14} />}
                                        >
                                            Approuver
                                        </Button>
                                    </>
                                )}
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>

            {/* Approve modal */}
            <Modal isOpen={approveModal.isOpen} onClose={approveModal.onClose} size="md">
                <ModalContent>
                    {(close) => (
                        <>
                            <ModalHeader>Approuver {activeRequest?.companyName}</ModalHeader>
                            <ModalBody className="space-y-4">
                                <p className="text-xs text-slate-500">
                                    Crée un user RESELLER + reseller + wallet 0 DZD avec le tier par défaut (Bronze).
                                    Vous recevrez un PIN et password générés à communiquer manuellement.
                                </p>
                                <Input
                                    label="Custom discount % (optionnel)"
                                    type="number"
                                    placeholder="Ex: 7"
                                    value={customDiscount}
                                    onChange={(e) => setCustomDiscount(e.target.value)}
                                    description="S'ajoute par-dessus le tier discount, capé 100%"
                                />
                            </ModalBody>
                            <ModalFooter>
                                <Button variant="light" onPress={close} className="font-bold">
                                    Annuler
                                </Button>
                                <Button
                                    onPress={submitApprove}
                                    disabled={submitting}
                                    className="bg-emerald-500 text-white font-black"
                                    data-testid="approve-submit"
                                >
                                    {submitting ? <Spinner size="sm" color="white" /> : "Confirmer"}
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>

            {/* Reject modal */}
            <Modal isOpen={rejectModal.isOpen} onClose={rejectModal.onClose} size="md">
                <ModalContent>
                    {(close) => (
                        <>
                            <ModalHeader>Rejeter {activeRequest?.companyName}</ModalHeader>
                            <ModalBody className="space-y-4">
                                <Textarea
                                    label="Motif du rejet"
                                    placeholder="Document manquant, activité incompatible..."
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    isRequired
                                    minRows={3}
                                />
                            </ModalBody>
                            <ModalFooter>
                                <Button variant="light" onPress={close} className="font-bold">
                                    Annuler
                                </Button>
                                <Button
                                    onPress={submitReject}
                                    disabled={submitting || rejectReason.length < 3}
                                    className="bg-red-500 text-white font-black"
                                    data-testid="reject-submit"
                                >
                                    {submitting ? <Spinner size="sm" color="white" /> : "Rejeter"}
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>

            {/* Credentials modal — affichées 1 seule fois après approval */}
            <Modal isOpen={credsModal.isOpen} onClose={credsModal.onClose} size="md" isDismissable={false}>
                <ModalContent>
                    {(close) => (
                        <>
                            <ModalHeader className="text-emerald-500">Reseller créé ✓</ModalHeader>
                            <ModalBody className="space-y-3 text-sm">
                                <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                                    ⚠️ Ces identifiants ne seront affichés qu&apos;UNE SEULE FOIS. Copiez-les
                                    et envoyez-les manuellement au reseller (WhatsApp, email).
                                </p>
                                {credentials && (
                                    <>
                                        <CredField label="Email" value={activeRequest?.email ?? ""} onCopy={copyToClipboard} />
                                        <CredField label="Password" value={credentials.generatedPassword} onCopy={copyToClipboard} />
                                        <CredField label="PIN" value={credentials.generatedPin} onCopy={copyToClipboard} />
                                    </>
                                )}
                            </ModalBody>
                            <ModalFooter>
                                <Button onPress={close} className="bg-[var(--primary)] text-white font-black">
                                    J&apos;ai copié, fermer
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const map: Record<string, string> = {
        PENDING: "bg-amber-500/15 text-amber-400 border-amber-500/30",
        APPROVED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
        REJECTED: "bg-red-500/15 text-red-400 border-red-500/30",
    };
    return (
        <Chip
            size="sm"
            className={`${map[status] ?? "bg-slate-500/15 text-slate-400 border-slate-500/30"} font-bold text-[10px] uppercase tracking-wider border`}
        >
            {status}
        </Chip>
    );
}

function Field({ label, value }: { label: string; value: string | undefined }) {
    return (
        <div className="flex justify-between items-center py-1">
            <span className="text-[10px] uppercase font-black text-slate-500">{label}</span>
            <span className="text-slate-200 text-sm">{value || "—"}</span>
        </div>
    );
}

function CredField({
    label,
    value,
    onCopy,
}: {
    label: string;
    value: string;
    onCopy: (s: string) => void | Promise<void>;
}) {
    return (
        <div className="flex items-center justify-between gap-3 bg-[#161616] border border-[#262626] rounded-xl px-3 py-2">
            <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</p>
                <code className="text-sm font-bold text-white break-all">{value}</code>
            </div>
            <button
                type="button"
                onClick={() => onCopy(value)}
                className="p-2 text-slate-500 hover:text-[var(--primary)] hover:bg-[var(--primary)]/10 rounded-lg transition-colors"
                aria-label={`Copier ${label}`}
            >
                <Copy size={14} />
            </button>
        </div>
    );
}
