"use client";

import React, { useMemo, useState, useTransition } from "react";
import {
    Button,
    Card,
    CardBody,
    Input,
    Textarea,
    Select,
    SelectItem,
    Chip,
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    useDisclosure,
    RadioGroup,
    Radio,
    Switch,
    Tooltip,
} from "@heroui/react";
import toast from "react-hot-toast";
import { Pencil, Trash2, Plus, Star, RefreshCw, Calculator } from "lucide-react";
import {
    createPricingRuleAction,
    updatePricingRuleAction,
    deletePricingRuleAction,
    setUsdRateAction,
    simulatePricingAction,
} from "./actions";

// ---------------------------------------------------------------------------
// Local types — mirror the server payload shapes.
// ---------------------------------------------------------------------------

type ScopeType = "global" | "category" | "brand" | "sku";
type MarkupType = "pct" | "fixed_dzd";

interface RuleRow {
    id: number;
    scopeType: ScopeType;
    scopeValue: string;
    markupType: MarkupType;
    markupValue: string;
    notes: string | null;
    isActive: boolean;
    createdAt: string | Date;
    updatedAt: string | Date;
}

interface TierOption {
    id: number;
    name: string;
    discountPct: number;
}

interface SimResult {
    costDzd: number;
    basePriceDzd: number;
    finalPriceDzd: number;
    marginDzd: number;
    marginPct: number;
    appliedRule: {
        id: number;
        scopeType: ScopeType;
        scopeValue: string;
        markupType: MarkupType;
        markupValue: number;
    };
    conversionRate: number;
}

// Precedence order for sorting the rules table.
const SCOPE_RANK: Record<ScopeType, number> = { sku: 0, brand: 1, category: 2, global: 3 };

function formatDzd(n: number): string {
    return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n) + " DZD";
}

function formatMarkup(type: MarkupType, value: string | number): string {
    const v = Number(value);
    if (type === "pct") return `+${(v / 100).toFixed(2)}%`;
    return `+${v.toFixed(2)} DZD`;
}

// ---------------------------------------------------------------------------

interface BsvPricingClientProps {
    initialRules: RuleRow[];
    initialRate: number;
    tiers: TierOption[];
}

export default function BsvPricingClient({ initialRules, initialRate, tiers }: BsvPricingClientProps) {
    const [rules, setRules] = useState<RuleRow[]>(initialRules);
    const [rate, setRate] = useState<number>(initialRate);
    const [rateInput, setRateInput] = useState<string>(String(initialRate));
    const [isPending, startTransition] = useTransition();

    const ruleModal = useDisclosure();
    const [editing, setEditing] = useState<RuleRow | null>(null);

    const sortedRules = useMemo(() => {
        return [...rules].sort((a, b) => {
            const r = SCOPE_RANK[a.scopeType] - SCOPE_RANK[b.scopeType];
            if (r !== 0) return r;
            return a.scopeValue.localeCompare(b.scopeValue);
        });
    }, [rules]);

    async function refreshRules() {
        const { getAllPricingRulesAction } = await import("./actions");
        const res = await getAllPricingRulesAction({} as any);
        if (res && (res as any).success) setRules((res as any).data);
    }

    // -----------------------------------------------------------------------
    // USD rate
    // -----------------------------------------------------------------------

    async function handleSaveRate() {
        const trimmed = rateInput.trim();
        if (!trimmed || !Number.isFinite(Number(trimmed)) || Number(trimmed) <= 0) {
            toast.error("Taux invalide");
            return;
        }
        startTransition(async () => {
            const res = await setUsdRateAction({ rate: trimmed });
            if ((res as any).success) {
                setRate(Number(trimmed));
                toast.success(`Taux mis à jour : ${trimmed} DZD/USD`);
            } else {
                toast.error((res as any).error || "Échec mise à jour");
            }
        });
    }

    // -----------------------------------------------------------------------
    // Rule CRUD
    // -----------------------------------------------------------------------

    function openCreate() {
        setEditing(null);
        ruleModal.onOpen();
    }

    function openEdit(row: RuleRow) {
        setEditing(row);
        ruleModal.onOpen();
    }

    async function handleDelete(row: RuleRow) {
        if (!confirm(`Supprimer la règle « ${row.scopeType} : ${row.scopeValue} » ?`)) return;
        const res = await deletePricingRuleAction({ id: row.id });
        if ((res as any).success) {
            toast.success("Règle supprimée");
            await refreshRules();
        } else {
            toast.error((res as any).error || "Suppression refusée");
        }
    }

    // -----------------------------------------------------------------------
    // Simulator
    // -----------------------------------------------------------------------

    const [simPriceUsd, setSimPriceUsd] = useState<string>("0.92");
    const [simCategory, setSimCategory] = useState<string>("gaming");
    const [simBrand, setSimBrand] = useState<string>("free-fire");
    const [simSku, setSimSku] = useState<string>("free-fire__110DIAMONDS__GLOBAL");
    const [simTierId, setSimTierId] = useState<string>(tiers[0]?.id ? String(tiers[0].id) : "");
    const [simCustomPct, setSimCustomPct] = useState<string>("0");
    const [simResult, setSimResult] = useState<SimResult | null>(null);
    const [simError, setSimError] = useState<string | null>(null);

    async function runSimulation() {
        setSimError(null);
        const usdNum = Number(simPriceUsd);
        if (!Number.isFinite(usdNum) || usdNum < 0) {
            setSimError("Prix USD invalide");
            return;
        }
        const tier = tiers.find((t) => String(t.id) === simTierId);
        const tierPct = tier?.discountPct ?? 0;
        const customPct = Number(simCustomPct) || 0;

        const res = await simulatePricingAction({
            priceCentsUsd: Math.round(usdNum * 100),
            category: simCategory.trim(),
            brand: simBrand.trim(),
            sku: simSku.trim(),
            tierDiscountPct: tierPct,
            customDiscountPct: customPct,
        });
        if ((res as any).success) {
            setSimResult((res as any).data);
        } else {
            setSimError((res as any).error || "Échec simulation");
        }
    }

    // -----------------------------------------------------------------------

    return (
        <div className="space-y-6">
            <header className="space-y-1">
                <h1 className="text-2xl font-black uppercase tracking-tight text-white">
                    BSV Pricing
                </h1>
                <p className="text-sm text-slate-400">
                    Règles de markup appliquées aux listings BSV (LoadBrain) côté shop revendeur.
                </p>
            </header>

            {/* ----------------- USD → DZD rate ----------------- */}
            <Card className="bg-[#161616] border border-white/5">
                <CardBody className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold uppercase text-slate-200 tracking-wider">
                            Taux USD → DZD
                        </h2>
                        <Chip size="sm" variant="flat" color="default">
                            Actuel : {rate.toFixed(2)} DZD
                        </Chip>
                    </div>
                    <div className="flex gap-2 items-end max-w-md">
                        <Input
                            type="number"
                            label="Nouveau taux"
                            size="sm"
                            value={rateInput}
                            onValueChange={setRateInput}
                            step={0.01}
                            min={0}
                            startContent={<span className="text-slate-500 text-xs">$1 =</span>}
                            endContent={<span className="text-slate-500 text-xs">DZD</span>}
                        />
                        <Button
                            color="primary"
                            size="md"
                            onPress={handleSaveRate}
                            isLoading={isPending}
                            startContent={<RefreshCw size={14} />}
                        >
                            Mettre à jour
                        </Button>
                    </div>
                    <p className="text-xs text-slate-500">
                        Source : manuel · cache service 1 h
                    </p>
                </CardBody>
            </Card>

            {/* ----------------- Rules table ----------------- */}
            <Card className="bg-[#161616] border border-white/5">
                <CardBody className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold uppercase text-slate-200 tracking-wider">
                            Règles actives ({sortedRules.length})
                        </h2>
                        <Button
                            size="sm"
                            color="primary"
                            startContent={<Plus size={14} />}
                            onPress={openCreate}
                        >
                            Ajouter une règle
                        </Button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs uppercase text-slate-500 border-b border-white/5">
                                    <th className="py-2 px-2">Scope</th>
                                    <th className="py-2 px-2">Valeur</th>
                                    <th className="py-2 px-2">Markup</th>
                                    <th className="py-2 px-2">État</th>
                                    <th className="py-2 px-2">Notes</th>
                                    <th className="py-2 px-2 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedRules.map((r) => (
                                    <tr key={r.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                                        <td className="py-2 px-2">
                                            {r.scopeType === "global" ? (
                                                <span className="inline-flex items-center gap-1 text-yellow-400 font-bold uppercase text-xs">
                                                    <Star size={12} /> Global
                                                </span>
                                            ) : (
                                                <Chip size="sm" variant="flat">{r.scopeType}</Chip>
                                            )}
                                        </td>
                                        <td className="py-2 px-2 font-mono text-xs text-slate-300">
                                            {r.scopeValue}
                                        </td>
                                        <td className="py-2 px-2 font-semibold text-emerald-400">
                                            {formatMarkup(r.markupType, r.markupValue)}
                                        </td>
                                        <td className="py-2 px-2">
                                            {r.isActive ? (
                                                <Chip size="sm" color="success" variant="flat">Actif</Chip>
                                            ) : (
                                                <Chip size="sm" color="default" variant="flat">Inactif</Chip>
                                            )}
                                        </td>
                                        <td className="py-2 px-2 text-slate-500 text-xs max-w-xs truncate">
                                            {r.notes || "—"}
                                        </td>
                                        <td className="py-2 px-2 text-right">
                                            <div className="inline-flex gap-1">
                                                <Tooltip content="Éditer">
                                                    <Button
                                                        isIconOnly
                                                        size="sm"
                                                        variant="light"
                                                        onPress={() => openEdit(r)}
                                                    >
                                                        <Pencil size={14} />
                                                    </Button>
                                                </Tooltip>
                                                {r.scopeType !== "global" && (
                                                    <Tooltip content="Supprimer" color="danger">
                                                        <Button
                                                            isIconOnly
                                                            size="sm"
                                                            variant="light"
                                                            color="danger"
                                                            onPress={() => handleDelete(r)}
                                                        >
                                                            <Trash2 size={14} />
                                                        </Button>
                                                    </Tooltip>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {sortedRules.length === 0 && (
                                    <tr><td colSpan={6} className="py-6 text-center text-slate-500 text-sm">
                                        Aucune règle. Crée-en une — ou applique la migration de seed.
                                    </td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardBody>
            </Card>

            {/* ----------------- Simulator ----------------- */}
            <Card className="bg-[#161616] border border-white/5">
                <CardBody className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold uppercase text-slate-200 tracking-wider flex items-center gap-2">
                            <Calculator size={14} /> Simulateur de prix
                        </h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Input
                            label="Prix BSV (USD)"
                            type="number"
                            size="sm"
                            value={simPriceUsd}
                            onValueChange={setSimPriceUsd}
                            step={0.01}
                            min={0}
                        />
                        <Input label="Catégorie" size="sm" value={simCategory} onValueChange={setSimCategory} />
                        <Input label="Marque (slug)" size="sm" value={simBrand} onValueChange={setSimBrand} />
                        <Input label="SKU canonique" size="sm" value={simSku} onValueChange={setSimSku} />
                        <Select
                            label="Tier client"
                            size="sm"
                            selectedKeys={simTierId ? [simTierId] : []}
                            onSelectionChange={(keys) => {
                                const k = Array.from(keys)[0];
                                if (k) setSimTierId(String(k));
                            }}
                        >
                            {tiers.map((t) => (
                                <SelectItem key={String(t.id)}>
                                    {t.name} (−{t.discountPct}%)
                                </SelectItem>
                            ))}
                        </Select>
                        <Input
                            label="Discount custom additionnel (%)"
                            type="number"
                            size="sm"
                            value={simCustomPct}
                            onValueChange={setSimCustomPct}
                            min={0}
                            max={100}
                        />
                    </div>

                    <Button color="primary" onPress={runSimulation} startContent={<Calculator size={14} />}>
                        Simuler
                    </Button>

                    {simError && (
                        <div className="text-sm text-danger-400">{simError}</div>
                    )}

                    {simResult && (
                        <div className="bg-black/30 rounded-md p-4 space-y-1 text-sm font-mono">
                            <div className="flex justify-between text-slate-400">
                                <span>Coût (USD × {simResult.conversionRate})</span>
                                <span>{formatDzd(simResult.costDzd)}</span>
                            </div>
                            <div className="flex justify-between text-slate-400">
                                <span>
                                    Règle : {simResult.appliedRule.scopeType} « {simResult.appliedRule.scopeValue} » (
                                    {formatMarkup(simResult.appliedRule.markupType, simResult.appliedRule.markupValue)})
                                </span>
                            </div>
                            <div className="flex justify-between text-slate-200">
                                <span>Prix public catalogue</span>
                                <span>{formatDzd(simResult.basePriceDzd)}</span>
                            </div>
                            <div className="flex justify-between text-emerald-400 text-base font-bold pt-2 border-t border-white/10">
                                <span>Prix final reseller</span>
                                <span>{formatDzd(simResult.finalPriceDzd)}</span>
                            </div>
                            <div className="flex justify-between text-slate-500 pt-2 border-t border-white/10">
                                <span>Marge brute</span>
                                <span>
                                    {formatDzd(simResult.marginDzd)} ({simResult.marginPct.toFixed(2)}%)
                                </span>
                            </div>
                        </div>
                    )}
                </CardBody>
            </Card>

            <RuleModal
                isOpen={ruleModal.isOpen}
                onClose={ruleModal.onClose}
                editing={editing}
                onSaved={async () => {
                    ruleModal.onClose();
                    await refreshRules();
                }}
            />
        </div>
    );
}

// ---------------------------------------------------------------------------
// Modal — create / edit a rule
// ---------------------------------------------------------------------------

interface RuleModalProps {
    isOpen: boolean;
    onClose: () => void;
    editing: RuleRow | null;
    onSaved: () => Promise<void> | void;
}

function RuleModal({ isOpen, onClose, editing, onSaved }: RuleModalProps) {
    const isEdit = !!editing;
    const [scopeType, setScopeType] = useState<ScopeType>(editing?.scopeType ?? "category");
    const [scopeValue, setScopeValue] = useState<string>(editing?.scopeValue ?? "");
    const [markupType, setMarkupType] = useState<MarkupType>(editing?.markupType ?? "pct");
    const [markupValue, setMarkupValue] = useState<string>(editing?.markupValue ?? "1500");
    const [notes, setNotes] = useState<string>(editing?.notes ?? "");
    const [isActive, setIsActive] = useState<boolean>(editing?.isActive ?? true);
    const [saving, setSaving] = useState(false);

    // Reset on open
    React.useEffect(() => {
        if (isOpen) {
            setScopeType(editing?.scopeType ?? "category");
            setScopeValue(editing?.scopeValue ?? "");
            setMarkupType(editing?.markupType ?? "pct");
            setMarkupValue(editing?.markupValue ?? "1500");
            setNotes(editing?.notes ?? "");
            setIsActive(editing?.isActive ?? true);
        }
    }, [isOpen, editing]);

    async function handleSubmit() {
        if (scopeType !== "global" && !scopeValue.trim()) {
            toast.error("Valeur de scope requise");
            return;
        }
        if (!markupValue.trim() || !Number.isFinite(Number(markupValue)) || Number(markupValue) < 0) {
            toast.error("Valeur de markup invalide");
            return;
        }
        setSaving(true);
        try {
            const payload = {
                scopeType,
                scopeValue: scopeType === "global" ? "*" : scopeValue.trim(),
                markupType,
                markupValue: markupValue.trim(),
                notes: notes.trim() || null,
                isActive,
            };
            const res = isEdit
                ? await updatePricingRuleAction({ ...payload, id: editing!.id })
                : await createPricingRuleAction(payload);
            if ((res as any).success) {
                toast.success(isEdit ? "Règle mise à jour" : "Règle créée");
                await onSaved();
            } else {
                toast.error((res as any).error || "Échec");
            }
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} backdrop="blur" placement="center">
            <ModalContent>
                <ModalHeader>{isEdit ? "Éditer la règle" : "Nouvelle règle de markup"}</ModalHeader>
                <ModalBody className="space-y-3">
                    <Select
                        label="Type de scope"
                        size="sm"
                        selectedKeys={[scopeType]}
                        onSelectionChange={(keys) => {
                            const k = Array.from(keys)[0] as ScopeType;
                            if (k) setScopeType(k);
                        }}
                    >
                        <SelectItem key="global">Global (fallback)</SelectItem>
                        <SelectItem key="category">Catégorie</SelectItem>
                        <SelectItem key="brand">Marque</SelectItem>
                        <SelectItem key="sku">SKU précis</SelectItem>
                    </Select>

                    <Input
                        label="Valeur de scope"
                        size="sm"
                        value={scopeType === "global" ? "*" : scopeValue}
                        onValueChange={setScopeValue}
                        isDisabled={scopeType === "global"}
                        description={scopeType === "global" ? "Le scope global utilise toujours '*'" : "Ex: 'gaming', 'free-fire', 'free-fire__110DIAMONDS__GLOBAL'"}
                    />

                    <RadioGroup
                        label="Type de markup"
                        orientation="horizontal"
                        value={markupType}
                        onValueChange={(v) => setMarkupType(v as MarkupType)}
                    >
                        <Radio value="pct">% (basis points)</Radio>
                        <Radio value="fixed_dzd">DZD fixe</Radio>
                    </RadioGroup>

                    <Input
                        label={markupType === "pct" ? "Valeur (bps — 1500 = 15%)" : "Valeur (DZD)"}
                        type="number"
                        size="sm"
                        value={markupValue}
                        onValueChange={setMarkupValue}
                        min={0}
                        step={markupType === "pct" ? 50 : 1}
                    />

                    <Textarea
                        label="Notes"
                        size="sm"
                        value={notes}
                        onValueChange={setNotes}
                        maxRows={3}
                    />

                    <Switch isSelected={isActive} onValueChange={setIsActive} size="sm">
                        Règle active
                    </Switch>
                </ModalBody>
                <ModalFooter>
                    <Button variant="light" onPress={onClose}>Annuler</Button>
                    <Button color="primary" onPress={handleSubmit} isLoading={saving}>
                        {isEdit ? "Mettre à jour" : "Créer"}
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}
