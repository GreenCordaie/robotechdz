"use client";
/**
 * Per-row action menu for reseller IPTV lines.
 *
 * Renders a HeroUI Dropdown of lifecycle operations (enable, disable, extend,
 * renew, kick, reset credentials, lock/unlock ISP, reset country, cancel
 * provisioning, delete, view history). Each item is dynamically disabled when
 * the upstream provider does not advertise the action in its capabilities
 * payload — falls back to "all-disabled" if capabilities failed to load, which
 * is preferable to crashing the table.
 *
 * Destructive actions go through `confirm()` plus a toast.promise wrapper so
 * the user always gets feedback. On success, the parent `onChanged` callback
 * triggers the table refresh.
 */

import React, { useCallback } from "react";
import {
    Button,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownTrigger,
    Tooltip,
} from "@heroui/react";
import {
    Calendar,
    Globe,
    History,
    Key,
    Lock,
    MoreVertical,
    Power,
    PowerOff,
    RefreshCw,
    Trash2,
    Unlock,
    UserX,
    X,
} from "lucide-react";
import { toast } from "react-hot-toast";

import type { IptvLineRow } from "./IptvLinesTable";
import {
    cancelIptvProvisioningAction,
    deleteIptvLineAction,
    disableIptvLineAction,
    enableIptvLineAction,
    extendIptvLineAction,
    kickIptvUserAction,
    lockIptvIspAction,
    renewIptvLineAction,
    resetIptvCountryAction,
    resetIptvCredentialsAction,
    unlockIptvIspAction,
} from "@/app/reseller/iptv/actions";
import { asErrorString } from "./iptv-status";

interface IptvLineActionsMenuProps {
    readonly row: IptvLineRow;
    readonly capabilities: ReadonlySet<string>;
    readonly onChanged: () => void;
    readonly onShowHistory: (id: number) => void;
}

interface ActionDef {
    readonly key: string;
    readonly label: string;
    readonly icon: React.ReactNode;
    readonly capability: string | null;
    readonly visible: boolean;
    readonly destructive?: boolean;
    readonly confirmMsg?: string;
    readonly invoke?: (
        id: number,
    ) => Promise<{ success: boolean; error?: unknown }>;
    /** Open the events tab instead of running an action. */
    readonly showHistory?: boolean;
}

export const IptvLineActionsMenu: React.FC<IptvLineActionsMenuProps> = ({
    row,
    capabilities,
    onChanged,
    onShowHistory,
}) => {
    const status = row.status;

    const isActive = status === "ACTIVE";
    const isFrozen = status === "FROZEN";
    const isExpired = status === "EXPIRED";
    const isPending = status === "PENDING_LOADBRAIN";
    const isTerminal =
        status === "CANCELLED" || status === "REFUNDED" || status === "FAILED";

    const items: ReadonlyArray<ActionDef> = [
        {
            key: "enable",
            label: "Activer",
            icon: <Power size={14} />,
            capability: "enable",
            visible: isFrozen,
            invoke: (id) => enableIptvLineAction({ id }),
        },
        {
            key: "disable",
            label: "Désactiver",
            icon: <PowerOff size={14} />,
            capability: "disable",
            visible: isActive,
            invoke: (id) => disableIptvLineAction({ id }),
        },
        {
            key: "extend",
            label: "Étendre",
            icon: <Calendar size={14} />,
            capability: "extend",
            visible: isActive || isFrozen,
            invoke: (id) => extendIptvLineAction({ id }),
        },
        {
            key: "renew",
            label: "Renouveler",
            icon: <RefreshCw size={14} />,
            capability: "renew",
            visible: isActive || isExpired,
            invoke: (id) => renewIptvLineAction({ id }),
            confirmMsg:
                "Renouveler cette ligne ? Votre portefeuille sera débité au prix actuel.",
        },
        {
            key: "kick",
            label: "Kicker l'utilisateur",
            icon: <UserX size={14} />,
            capability: "kick",
            visible: isActive,
            destructive: true,
            confirmMsg: "Déconnecter l'utilisateur en cours ?",
            invoke: (id) => kickIptvUserAction({ id }),
        },
        {
            key: "reset-credentials",
            label: "Réinitialiser le mot de passe",
            icon: <Key size={14} />,
            capability: "reset-credentials",
            visible: isActive || isFrozen,
            destructive: true,
            confirmMsg:
                "Réinitialiser les identifiants ? Les anciens cesseront de fonctionner.",
            invoke: (id) => resetIptvCredentialsAction({ id }),
        },
        {
            key: "lock-isp",
            label: "Verrouiller l'ISP",
            icon: <Lock size={14} />,
            capability: "lock-isp",
            visible: isActive,
            invoke: (id) => lockIptvIspAction({ id }),
        },
        {
            key: "unlock-isp",
            label: "Déverrouiller l'ISP",
            icon: <Unlock size={14} />,
            capability: "unlock-isp",
            visible: isActive,
            invoke: (id) => unlockIptvIspAction({ id }),
        },
        {
            key: "reset-country",
            label: "Réinitialiser le pays",
            icon: <Globe size={14} />,
            capability: "reset-country",
            visible: isActive,
            destructive: true,
            confirmMsg:
                "Réinitialiser le verrou pays ? L'utilisateur pourra changer de pays.",
            invoke: (id) => resetIptvCountryAction({ id }),
        },
        {
            key: "cancel-provisioning",
            label: "Annuler le provisionnement",
            icon: <X size={14} />,
            capability: "cancel",
            visible: isPending,
            destructive: true,
            confirmMsg: "Annuler le provisionnement en cours ?",
            invoke: (id) => cancelIptvProvisioningAction({ id }),
        },
        {
            key: "delete",
            label: "Supprimer",
            icon: <Trash2 size={14} />,
            capability: "delete",
            visible: !isTerminal,
            destructive: true,
            confirmMsg:
                "Supprimer définitivement cette ligne ? Aucun remboursement automatique.",
            invoke: (id) => deleteIptvLineAction({ id }),
        },
        {
            key: "history",
            label: "Historique",
            icon: <History size={14} />,
            capability: null,
            visible: true,
            showHistory: true,
        },
    ];

    const runAction = useCallback(
        async (def: ActionDef) => {
            if (def.showHistory) {
                onShowHistory(row.id);
                return;
            }
            if (!def.invoke) return;
            if (def.confirmMsg && !confirm(def.confirmMsg)) return;
            const promise = def.invoke(row.id).then((res) => {
                if (!res.success) {
                    throw new Error(asErrorString(res.error, "Action échouée"));
                }
                return res;
            });
            await toast
                .promise(promise, {
                    loading: "Action en cours…",
                    success: "Action réussie",
                    error: (err) => asErrorString(err, "Action échouée"),
                })
                .then(() => onChanged())
                .catch(() => {
                    /* toast handled it */
                });
        },
        [onChanged, onShowHistory, row.id],
    );

    const visibleItems = items.filter((it) => it.visible);

    return (
        <Dropdown
            placement="bottom-end"
            classNames={{ content: "bg-[#0f0f0f] border border-[#262626] min-w-[220px]" }}
        >
            <DropdownTrigger>
                <Button
                    isIconOnly
                    size="sm"
                    aria-label="Actions"
                    className="bg-[#161616] border border-[#262626] text-slate-300 h-7 w-7 min-w-7 hover:border-[#FACC15]/40 hover:text-[#FACC15]"
                >
                    <MoreVertical size={13} />
                </Button>
            </DropdownTrigger>
            <DropdownMenu
                aria-label="Actions de ligne IPTV"
                variant="flat"
                disabledKeys={visibleItems
                    .filter(
                        (it) =>
                            it.capability !== null &&
                            !capabilities.has(it.capability),
                    )
                    .map((it) => it.key)}
            >
                {visibleItems.map((it) => {
                    const unsupported =
                        it.capability !== null && !capabilities.has(it.capability);
                    const labelNode = unsupported ? (
                        <Tooltip
                            content="Non supporté pour ce fournisseur"
                            placement="left"
                        >
                            <span>{it.label}</span>
                        </Tooltip>
                    ) : (
                        it.label
                    );
                    return (
                        <DropdownItem
                            key={it.key}
                            startContent={it.icon}
                            onPress={() => void runAction(it)}
                            className={
                                it.destructive
                                    ? "text-red-300 data-[hover=true]:bg-red-500/10"
                                    : "text-slate-200 data-[hover=true]:bg-[#1a1a1a]"
                            }
                            color={it.destructive ? "danger" : "default"}
                        >
                            {labelNode}
                        </DropdownItem>
                    );
                })}
            </DropdownMenu>
        </Dropdown>
    );
};

export default IptvLineActionsMenu;
