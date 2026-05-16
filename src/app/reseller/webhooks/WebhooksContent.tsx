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
    Checkbox,
    useDisclosure,
    Chip,
    Switch,
} from "@heroui/react";
import {
    Webhook,
    Plus,
    Trash2,
    Send,
    Copy,
    AlertCircle,
    CheckCircle2,
    Activity,
    Power,
} from "lucide-react";
import { toast } from "react-hot-toast";
import {
    listMyWebhooksAction,
    createMyWebhookAction,
    toggleMyWebhookAction,
    deleteMyWebhookAction,
    testMyWebhookAction,
} from "./actions";
import { formatDate } from "@/lib/formatters";

interface WebhookRow {
    id: number;
    url: string;
    events: string;
    secret: string;
    isActive: boolean;
    lastFiredAt: Date | string | null;
    lastStatusCode: number | null;
    lastError: string | null;
    deliveriesOk: number;
    deliveriesFailed: number;
    createdAt: Date | string;
}

const AVAILABLE_EVENTS = [
    { value: "order.paid", label: "Commande payée", desc: "Le reseller a fait un checkout B2B" },
    { value: "credentials.ready", label: "Credentials prêtes", desc: "Provisioning LoadBrain terminé" },
    { value: "wallet.recharged", label: "Wallet rechargé", desc: "Solde crédité par l'admin" },
] as const;

export default function WebhooksContent() {
    const [hooks, setHooks] = useState<WebhookRow[]>([]);
    const [loading, setLoading] = useState(true);

    const addModal = useDisclosure();
    const secretModal = useDisclosure();
    const [createdSecret, setCreatedSecret] = useState<{ url: string; secret: string } | null>(null);

    const [url, setUrl] = useState("");
    const [selectedEvents, setSelectedEvents] = useState<string[]>(["order.paid"]);
    const [submitting, setSubmitting] = useState(false);

    const load = async () => {
        setLoading(true);
        const res = await listMyWebhooksAction({});
        if (res.success) setHooks(res.data as WebhookRow[]);
        else toast.error("Erreur chargement");
        setLoading(false);
    };

    useEffect(() => {
        load();
    }, []);

    const openAdd = () => {
        setUrl("");
        setSelectedEvents(["order.paid"]);
        addModal.onOpen();
    };

    const submit = async () => {
        if (selectedEvents.length === 0) {
            toast.error("Choisir au moins 1 event");
            return;
        }
        setSubmitting(true);
        try {
            const res = await createMyWebhookAction({
                url,
                events: selectedEvents as ("order.paid" | "credentials.ready" | "wallet.recharged")[],
            });
            if (res.success) {
                const created = res.data as WebhookRow;
                addModal.onClose();
                setCreatedSecret({ url: created.url, secret: created.secret });
                secretModal.onOpen();
                await load();
            } else {
                toast.error(res.error || "Échec");
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleToggle = async (id: number, isActive: boolean) => {
        const res = await toggleMyWebhookAction({ id, isActive });
        if (res.success) {
            toast.success(isActive ? "Webhook activé" : "Webhook désactivé");
            await load();
        } else {
            toast.error("Échec");
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Supprimer ce webhook ? Cette action est irréversible.")) return;
        const res = await deleteMyWebhookAction({ id });
        if (res.success) {
            toast.success("Webhook supprimé");
            await load();
        } else {
            toast.error("Échec");
        }
    };

    const handleTest = async (id: number) => {
        const res = await testMyWebhookAction({ id });
        if (res.success) {
            toast.success("Test dispatched — vérifie ta receiver app");
            await load();
        } else {
            toast.error(res.error || "Échec");
        }
    };

    const copyToClipboard = async (text: string, label: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success(label + " copié");
        } catch {
            toast.error("Copie impossible");
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500 max-w-6xl pb-20">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
                        <Webhook className="text-[var(--primary)] size-8" />
                        Webhooks sortants
                    </h1>
                    <p className="text-slate-500 font-medium mt-1 uppercase tracking-widest text-[10px]">
                        Reçois les événements business par HTTP POST signé HMAC-SHA256
                    </p>
                </div>

                <Button
                    onPress={openAdd}
                    data-testid="add-webhook-btn"
                    className="bg-[var(--primary)] text-white font-black px-6 h-14 rounded-2xl shadow-xl shadow-orange-950/20"
                    startContent={<Plus size={18} />}
                >
                    Nouveau webhook
                </Button>
            </header>

            <DocSection />

            {loading ? (
                <div className="py-20 flex justify-center">
                    <Spinner color="warning" />
                </div>
            ) : hooks.length === 0 ? (
                <div className="py-20 text-center text-slate-500 italic">
                    Aucun webhook — commence par cliquer sur <strong>Nouveau webhook</strong> ci-dessus.
                </div>
            ) : (
                <ul className="space-y-3">
                    {hooks.map((h) => (
                        <li
                            key={h.id}
                            data-testid="webhook-row"
                            className="bg-[#161616] border border-[#262626] rounded-2xl p-5 space-y-3"
                        >
                            <div className="flex flex-col md:flex-row md:items-start gap-3">
                                <div className="flex-1 min-w-0 space-y-1.5">
                                    <code className="text-sm text-white font-bold break-all">{h.url}</code>
                                    <div className="flex flex-wrap gap-1.5">
                                        {h.events.split(",").map((e) => (
                                            <Chip
                                                key={e}
                                                size="sm"
                                                className="bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/20 font-bold text-[10px] uppercase"
                                            >
                                                {e}
                                            </Chip>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Switch
                                        size="sm"
                                        isSelected={h.isActive}
                                        onValueChange={(v) => handleToggle(h.id, v)}
                                        aria-label="Activer/désactiver"
                                    />
                                    <Button
                                        size="sm"
                                        onPress={() => handleTest(h.id)}
                                        className="bg-white/5 text-slate-300 font-bold border border-white/10"
                                        startContent={<Send size={14} />}
                                    >
                                        Test
                                    </Button>
                                    <Button
                                        size="sm"
                                        onPress={() => handleDelete(h.id)}
                                        className="bg-red-500/15 text-red-400 font-bold border border-red-500/30"
                                        startContent={<Trash2 size={14} />}
                                        aria-label="Supprimer"
                                    >
                                        Supprimer
                                    </Button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-white/5">
                                <Stat label="✓ OK" value={h.deliveriesOk.toString()} color="emerald" />
                                <Stat label="× Échecs" value={h.deliveriesFailed.toString()} color="red" />
                                <Stat label="Dernier code" value={h.lastStatusCode?.toString() ?? "—"} />
                                <Stat
                                    label="Dernier envoi"
                                    value={h.lastFiredAt ? formatDate(new Date(h.lastFiredAt)) : "—"}
                                />
                            </div>

                            {h.lastError && (
                                <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                    <span className="break-all">{h.lastError}</span>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {/* Add modal */}
            <Modal
                isOpen={addModal.isOpen}
                onClose={addModal.onClose}
                size="lg"
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
                                <h2 className="text-xl font-black text-white">Nouveau webhook</h2>
                            </ModalHeader>
                            <ModalBody className="space-y-4">
                                <Input
                                    label="URL receiver"
                                    placeholder="https://api.votre-site.com/webhooks/robotech"
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    variant="flat"
                                    isRequired
                                    data-testid="webhook-url"
                                />
                                <div className="space-y-2">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                        Events à écouter
                                    </p>
                                    {AVAILABLE_EVENTS.map((e) => (
                                        <label
                                            key={e.value}
                                            className="flex items-start gap-3 bg-[#161616] border border-[#262626] rounded-xl p-3 cursor-pointer hover:border-[var(--primary)]/30 transition-colors"
                                        >
                                            <Checkbox
                                                isSelected={selectedEvents.includes(e.value)}
                                                onValueChange={(checked) => {
                                                    setSelectedEvents((prev) =>
                                                        checked
                                                            ? [...prev, e.value]
                                                            : prev.filter((s) => s !== e.value)
                                                    );
                                                }}
                                            />
                                            <div>
                                                <code className="text-sm font-bold text-white">{e.value}</code>
                                                <p className="text-xs text-slate-500 mt-0.5">{e.desc}</p>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                                <p className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 italic">
                                    ⚠️ Le secret HMAC sera affiché UNE SEULE FOIS après création. Note-le bien.
                                </p>
                            </ModalBody>
                            <ModalFooter>
                                <Button variant="light" onPress={close} className="font-bold">
                                    Annuler
                                </Button>
                                <Button
                                    onPress={submit}
                                    disabled={submitting || !url || selectedEvents.length === 0}
                                    className="bg-[var(--primary)] text-white font-black"
                                    data-testid="webhook-submit"
                                >
                                    {submitting ? <Spinner size="sm" color="white" /> : "Créer"}
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>

            {/* Secret modal (1x shown) */}
            <Modal
                isOpen={secretModal.isOpen}
                onClose={secretModal.onClose}
                size="lg"
                isDismissable={false}
            >
                <ModalContent>
                    {(close) => (
                        <>
                            <ModalHeader className="text-emerald-500 flex items-center gap-2">
                                <CheckCircle2 /> Webhook créé
                            </ModalHeader>
                            <ModalBody className="space-y-3">
                                <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                                    ⚠️ Le secret HMAC est affiché ici UNE SEULE FOIS. Copie-le maintenant — il
                                    ne sera plus consultable ensuite.
                                </p>
                                {createdSecret && (
                                    <>
                                        <div className="bg-[#161616] border border-[#262626] rounded-xl px-3 py-2">
                                            <p className="text-[9px] font-black uppercase text-slate-500">URL</p>
                                            <code className="text-xs text-white break-all">{createdSecret.url}</code>
                                        </div>
                                        <div className="flex items-center justify-between gap-3 bg-[#161616] border border-[#262626] rounded-xl px-3 py-2">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[9px] font-black uppercase text-slate-500">
                                                    Secret HMAC-SHA256
                                                </p>
                                                <code className="text-xs font-bold text-emerald-400 break-all">
                                                    {createdSecret.secret}
                                                </code>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => copyToClipboard(createdSecret.secret, "Secret")}
                                                className="p-2 text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg"
                                                aria-label="Copier secret"
                                            >
                                                <Copy size={14} />
                                            </button>
                                        </div>
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

function DocSection() {
    return (
        <details className="bg-[#161616] border border-[#262626] rounded-2xl p-5 group">
            <summary className="cursor-pointer flex items-center gap-2 text-sm font-bold text-white">
                <Activity className="text-[var(--primary)]" size={16} />
                Documentation rapide
            </summary>
            <div className="mt-4 space-y-3 text-sm text-slate-300 leading-relaxed">
                <p>
                    Quand un événement business se produit (commande payée, credentials prêtes,
                    wallet rechargé), nous envoyons un <strong>POST HTTP signé</strong> à
                    votre URL.
                </p>
                <div className="bg-[#0a0a0a] border border-white/5 rounded-xl p-3 space-y-1 font-mono text-xs">
                    <p><span className="text-slate-500">POST</span> {`{votre URL}`}</p>
                    <p><span className="text-slate-500">X-Robotech-Event</span>: order.paid</p>
                    <p><span className="text-slate-500">X-Robotech-Delivery</span>: {`<id unique>`}</p>
                    <p><span className="text-slate-500">X-Robotech-Signature</span>: sha256={`<hex>`}</p>
                    <p><span className="text-slate-500">X-Robotech-Timestamp</span>: 1234567890</p>
                </div>
                <p className="text-xs text-slate-500">
                    <strong>Validation côté serveur :</strong> calcule <code>HMAC-SHA256(body, secret)</code>{" "}
                    et compare avec <code>X-Robotech-Signature</code> (timing-safe). Rejette si
                    différent.
                </p>
                <p className="text-xs text-slate-500">
                    Timeout : 10s. Pas de retry pour cette version — un webhook qui échoue en
                    chaîne peut être désactivé manuellement.
                </p>
            </div>
        </details>
    );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
    const colorClass =
        color === "emerald"
            ? "text-emerald-400"
            : color === "red"
                ? "text-red-400"
                : "text-white";
    return (
        <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</p>
            <p className={`text-sm font-bold ${colorClass}`}>{value}</p>
        </div>
    );
}
