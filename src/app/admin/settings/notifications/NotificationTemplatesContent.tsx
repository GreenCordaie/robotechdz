"use client";

import React, { useEffect, useState } from "react";
import { Button, Spinner, Textarea, Chip } from "@heroui/react";
import { Mail, Save, RotateCcw, Eye } from "lucide-react";
import { toast } from "react-hot-toast";
import {
    listTemplatesAction,
    updateTemplateAction,
    resetTemplateAction,
    previewTemplateAction,
} from "./actions";

interface TemplateRow {
    eventKey: string;
    label: string;
    body: string;
    isCustom: boolean;
    updatedAt: Date | string | null;
    variables: string[];
    defaultBody: string;
}

const SAMPLE_VARS: Record<string, Record<string, string>> = {
    "wallet.recharged": {
        companyName: "Boutique Demo",
        methodLabel: "espèces",
        amount: "10 000 DZD",
        newBalance: "110 000 DZD",
    },
    "signup.approved": {
        companyName: "Boutique Demo",
        email: "demo@example.com",
        password: "Pa55w0rd!",
        pin: "1234",
    },
    "signup.rejected": {
        companyName: "Boutique Demo",
        email: "demo@example.com",
        reason: "Documents manquants",
    },
    "order.confirmed": {
        companyName: "Boutique Demo",
        orderNumber: "ORD-001234",
        itemCount: "3",
        totalAmount: "12 500 DZD",
        deliveryStatus: "⚡ Provisioning en cours",
    },
    "order.credentials.ready": {
        companyName: "Boutique Demo",
        orderNumber: "ORD-001234",
        credentialSummary: "Aperçu : Code AB12…",
    },
};

export default function NotificationTemplatesContent() {
    const [items, setItems] = useState<TemplateRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [previews, setPreviews] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        const res = await listTemplatesAction({});
        if (res.success) {
            const data = res.data as TemplateRow[];
            setItems(data);
            setDrafts(Object.fromEntries(data.map((d) => [d.eventKey, d.body])));
        }
        setLoading(false);
    };

    useEffect(() => {
        load();
    }, []);

    const handleSave = async (eventKey: string) => {
        setSubmitting(eventKey);
        const res = await updateTemplateAction({ eventKey, body: drafts[eventKey] });
        if (res.success) {
            toast.success("Template enregistré");
            await load();
        } else {
            toast.error(res.error || "Échec");
        }
        setSubmitting(null);
    };

    const handleReset = async (eventKey: string) => {
        if (!confirm("Reset au template par défaut ? La version personnalisée sera supprimée.")) return;
        setSubmitting(eventKey);
        const res = await resetTemplateAction({ eventKey });
        if (res.success) {
            toast.success("Template reset");
            await load();
        } else {
            toast.error(res.error || "Échec");
        }
        setSubmitting(null);
    };

    const handlePreview = async (eventKey: string) => {
        const res = await previewTemplateAction({
            body: drafts[eventKey],
            vars: SAMPLE_VARS[eventKey] ?? {},
        });
        if (res.success) {
            setPreviews((p) => ({ ...p, [eventKey]: res.data.rendered }));
        } else {
            toast.error(res.error || "Échec preview");
        }
    };

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <div className="flex items-center gap-3 mb-2">
                <Mail className="w-7 h-7 text-[var(--primary)]" />
                <h1 className="text-2xl font-bold">Templates notifications WhatsApp</h1>
            </div>
            <p className="text-sm text-gray-500 mb-3">
                Personnalisez les messages envoyés aux resellers.
                Variables : <code className="bg-[#161616] px-1 rounded">{"{{key}}"}</code>.
                Reset = retour au template par défaut.
            </p>
            <a
                href="/admin/settings/notifications/logs"
                data-testid="notif-logs-link"
                className="inline-block mb-6 text-xs font-medium text-[var(--primary)] hover:underline"
            >
                → Voir l&apos;historique des envois (notification logs)
            </a>

            {loading ? (
                <div className="flex justify-center py-12">
                    <Spinner />
                </div>
            ) : (
                <div className="space-y-6">
                    {items.map((item) => (
                        <div
                            key={item.eventKey}
                            data-testid={`tpl-row-${item.eventKey}`}
                            className="bg-[#161616] border border-[#262626] rounded-2xl p-5"
                        >
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <div className="text-base font-bold text-slate-200">
                                        {item.label}
                                    </div>
                                    <div className="text-xs text-slate-500 font-mono mt-0.5">
                                        {item.eventKey}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {item.isCustom ? (
                                        <Chip color="warning" size="sm">Personnalisé</Chip>
                                    ) : (
                                        <Chip color="default" size="sm">Défaut</Chip>
                                    )}
                                </div>
                            </div>

                            <div className="text-xs text-slate-500 mb-2">
                                Variables :{" "}
                                {item.variables.map((v) => (
                                    <code
                                        key={v}
                                        className="bg-[#0e0e0e] border border-[#262626] px-1.5 py-0.5 rounded mr-1 text-slate-400"
                                    >
                                        {`{{${v}}}`}
                                    </code>
                                ))}
                            </div>

                            <Textarea
                                value={drafts[item.eventKey] ?? item.body}
                                onValueChange={(v) =>
                                    setDrafts((d) => ({ ...d, [item.eventKey]: v }))
                                }
                                minRows={6}
                                maxRows={14}
                                data-testid={`tpl-body-${item.eventKey}`}
                                classNames={{
                                    input: "font-mono text-sm",
                                }}
                            />

                            {previews[item.eventKey] && (
                                <pre
                                    data-testid={`tpl-preview-${item.eventKey}`}
                                    className="mt-3 bg-[#0a0a0a] border border-[#262626] rounded-xl p-3 text-xs text-slate-300 whitespace-pre-wrap font-sans"
                                >
                                    {previews[item.eventKey]}
                                </pre>
                            )}

                            <div className="flex items-center gap-2 mt-3 flex-wrap">
                                <Button
                                    size="sm"
                                    color="primary"
                                    startContent={<Save className="w-4 h-4" />}
                                    isLoading={submitting === item.eventKey}
                                    onPress={() => handleSave(item.eventKey)}
                                    data-testid={`tpl-save-${item.eventKey}`}
                                >
                                    Enregistrer
                                </Button>
                                <Button
                                    size="sm"
                                    variant="bordered"
                                    startContent={<Eye className="w-4 h-4" />}
                                    onPress={() => handlePreview(item.eventKey)}
                                    data-testid={`tpl-preview-btn-${item.eventKey}`}
                                >
                                    Aperçu
                                </Button>
                                {item.isCustom && (
                                    <Button
                                        size="sm"
                                        variant="bordered"
                                        color="danger"
                                        startContent={<RotateCcw className="w-4 h-4" />}
                                        onPress={() => handleReset(item.eventKey)}
                                        data-testid={`tpl-reset-${item.eventKey}`}
                                    >
                                        Reset au défaut
                                    </Button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
