"use client";

import React, { useEffect, useState } from "react";
import { Button, Input } from "@heroui/react";
import { Search, ChevronLeft, ChevronRight, Settings2 } from "lucide-react";

import {
    formatExpiryCountdown,
    ProviderBadgeChip,
    StatusPill,
    STATUS_LABELS,
    type IptvProvider,
    type IptvStatus,
} from "./iptv-status";
import { formatCurrency } from "@/lib/formatters";

export interface IptvLineRow {
    readonly id: number;
    readonly provider: string;
    readonly status: string;
    readonly productName: string;
    readonly pricePaidDzd: string;
    readonly customerLabel: string | null;
    readonly customerPhone: string | null;
    readonly expiresAt: string | Date | null;
    readonly createdAt: string | Date;
}

export type StatusFilter = "ALL" | IptvStatus;

interface IptvLinesTableProps {
    readonly provider: IptvProvider;
    readonly items: ReadonlyArray<IptvLineRow>;
    readonly total: number;
    readonly page: number;
    readonly limit: number;
    readonly totalPages: number;
    readonly search: string;
    readonly statusFilter: StatusFilter;
    readonly isLoading: boolean;
    readonly onChange: (next: {
        readonly search?: string;
        readonly statusFilter?: StatusFilter;
        readonly page?: number;
    }) => void;
    readonly onManage: (id: number) => void;
}

const FILTER_CHIPS: ReadonlyArray<{
    key: StatusFilter;
    label: string;
}> = [
    { key: "ALL", label: "Tous" },
    { key: "ACTIVE", label: STATUS_LABELS.ACTIVE },
    { key: "PENDING_LOADBRAIN", label: STATUS_LABELS.PENDING_LOADBRAIN },
    { key: "EXPIRED", label: STATUS_LABELS.EXPIRED },
    { key: "FAILED", label: STATUS_LABELS.FAILED },
];

export const IptvLinesTable: React.FC<IptvLinesTableProps> = ({
    items,
    total,
    page,
    limit,
    totalPages,
    search,
    statusFilter,
    isLoading,
    onChange,
    onManage,
}) => {
    const [localSearch, setLocalSearch] = useState(search);

    useEffect(() => {
        setLocalSearch(search);
    }, [search]);

    useEffect(() => {
        const t = setTimeout(() => {
            if (localSearch !== search) {
                onChange({ search: localSearch, page: 1 });
            }
        }, 300);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [localSearch]);

    const startIdx = total === 0 ? 0 : (page - 1) * limit + 1;
    const endIdx = Math.min(page * limit, total);

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 min-w-0">
                    <Input
                        placeholder="Rechercher (surnom, téléphone, identifiant...)"
                        value={localSearch}
                        onValueChange={setLocalSearch}
                        startContent={
                            <Search size={14} className="text-slate-500" />
                        }
                        variant="bordered"
                        classNames={{
                            inputWrapper:
                                "bg-[#0a0a0a] border-[#262626] data-[hover=true]:border-[#FACC15]/40 group-data-[focus=true]:border-[#FACC15]",
                            input: "text-white",
                        }}
                    />
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {FILTER_CHIPS.map((c) => {
                        const active = statusFilter === c.key;
                        return (
                            <button
                                key={c.key}
                                type="button"
                                onClick={() =>
                                    onChange({
                                        statusFilter: c.key,
                                        page: 1,
                                    })
                                }
                                className={`px-3 h-9 rounded-lg text-xs font-black uppercase tracking-wider border transition-colors ${
                                    active
                                        ? "bg-[#FACC15] text-black border-[#FACC15]"
                                        : "bg-[#161616] text-slate-400 border-[#262626] hover:border-[#FACC15]/40 hover:text-white"
                                }`}
                            >
                                {c.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* List */}
            {isLoading && items.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-sm italic">
                    Chargement...
                </div>
            ) : items.length === 0 ? (
                <div className="py-16 text-center text-slate-500 text-sm italic bg-[#0f0f0f] border border-dashed border-[#262626] rounded-2xl">
                    Aucune ligne pour ce filtre. Achetez votre première en haut.
                </div>
            ) : (
                <ul className="space-y-2">
                    {items.map((row) => (
                        <li
                            key={row.id}
                            className="bg-[#161616] border border-[#262626] rounded-xl p-4 hover:border-[#FACC15]/40 transition-colors"
                        >
                            <div className="flex flex-col md:flex-row md:items-center gap-3">
                                <div className="flex-1 min-w-0 space-y-1.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <ProviderBadgeChip
                                            provider={row.provider}
                                        />
                                        <StatusPill status={row.status} />
                                        <span className="text-[10px] text-slate-500">
                                            #{row.id}
                                        </span>
                                    </div>
                                    <p className="text-sm font-black text-white truncate">
                                        {row.customerLabel ||
                                            row.customerPhone ||
                                            "Sans surnom"}
                                    </p>
                                    <p className="text-xs text-slate-400 truncate">
                                        {row.productName}
                                    </p>
                                </div>
                                <div className="flex md:flex-col md:items-end gap-2 md:gap-0.5 text-xs">
                                    <span className="text-slate-300">
                                        {formatExpiryCountdown(row.expiresAt)}
                                    </span>
                                    <span className="text-slate-500">
                                        {formatCurrency(
                                            parseFloat(row.pricePaidDzd),
                                            "DZD",
                                        )}
                                    </span>
                                </div>
                                <Button
                                    onPress={() => onManage(row.id)}
                                    startContent={<Settings2 size={14} />}
                                    className="bg-[#FACC15] text-black font-black text-xs h-9 px-4 rounded-lg shrink-0"
                                >
                                    Gérer
                                </Button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {/* Pagination */}
            {total > 0 && (
                <div className="flex items-center justify-between pt-2">
                    <p className="text-xs text-slate-500">
                        {startIdx}-{endIdx} sur {total}
                    </p>
                    <div className="flex items-center gap-2">
                        <Button
                            isIconOnly
                            size="sm"
                            isDisabled={page <= 1 || isLoading}
                            onPress={() =>
                                onChange({ page: Math.max(1, page - 1) })
                            }
                            className="bg-[#161616] border border-[#262626] text-slate-300"
                        >
                            <ChevronLeft size={14} />
                        </Button>
                        <span className="text-xs text-slate-400 font-black">
                            {page} / {totalPages}
                        </span>
                        <Button
                            isIconOnly
                            size="sm"
                            isDisabled={page >= totalPages || isLoading}
                            onPress={() =>
                                onChange({
                                    page: Math.min(totalPages, page + 1),
                                })
                            }
                            className="bg-[#161616] border border-[#262626] text-slate-300"
                        >
                            <ChevronRight size={14} />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default IptvLinesTable;
