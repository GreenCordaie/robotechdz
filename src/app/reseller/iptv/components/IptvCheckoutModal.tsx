"use client";

import React, { useEffect, useState } from "react";
import {
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Button,
    Input,
    Select,
    SelectItem,
} from "@heroui/react";
import { toast } from "react-hot-toast";

import {
    createIptvOrderAction,
    getIptvAppsAction,
} from "@/app/reseller/iptv/actions";
import { formatCurrency } from "@/lib/formatters";
import {
    asErrorString,
    PROVIDER_BADGES,
    parseDurationFromName,
    type IptvProvider,
} from "./iptv-status";
import type { IptvProductLike } from "./IptvCatalogCard";

interface IptvCheckoutModalProps {
    readonly product: IptvProductLike | null;
    readonly provider: IptvProvider;
    readonly isOpen: boolean;
    readonly onClose: () => void;
    readonly onSuccess: () => void;
}

interface IboApp {
    readonly id?: string | number;
    readonly name?: string;
    readonly label?: string;
}

export const IptvCheckoutModal: React.FC<IptvCheckoutModalProps> = ({
    product,
    provider,
    isOpen,
    onClose,
    onSuccess,
}) => {
    const [customerLabel, setCustomerLabel] = useState("");
    const [customerPhone, setCustomerPhone] = useState("");
    const [iboAppId, setIboAppId] = useState<string>("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [apps, setApps] = useState<ReadonlyArray<IboApp>>([]);
    const [isLoadingApps, setIsLoadingApps] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setCustomerLabel("");
        setCustomerPhone("");
        setIboAppId("");
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || provider !== "ibosol") return;
        let active = true;
        setIsLoadingApps(true);
        getIptvAppsAction({})
            .then((res) => {
                if (!active) return;
                if (res.success) {
                    const arr = Array.isArray(res.data)
                        ? (res.data as ReadonlyArray<IboApp>)
                        : [];
                    setApps(arr);
                } else {
                    toast.error(
                        asErrorString(res.error, "Échec chargement applis IBO"),
                    );
                }
            })
            .catch((err) =>
                toast.error(asErrorString(err, "Échec chargement applis IBO")),
            )
            .finally(() => active && setIsLoadingApps(false));
        return () => {
            active = false;
        };
    }, [isOpen, provider]);

    if (!product) return null;

    const duration = parseDurationFromName(product.name);
    const isIbo = provider === "ibosol";
    const missingApp = isIbo && !iboAppId;

    const handleSubmit = async () => {
        if (customerLabel.length > 80) {
            toast.error("Le surnom client est trop long (80 max)");
            return;
        }
        if (customerPhone.length > 20) {
            toast.error("Le téléphone est trop long (20 max)");
            return;
        }
        if (missingApp) {
            toast.error("Sélectionnez une application IBO");
            return;
        }
        setIsSubmitting(true);
        try {
            const params: Record<string, unknown> = {};
            if (isIbo && iboAppId) params.app = iboAppId;
            const res = await createIptvOrderAction({
                provider,
                productId: product.id,
                customerLabel: customerLabel.trim() || undefined,
                customerPhone: customerPhone.trim() || undefined,
                params: Object.keys(params).length > 0 ? params : undefined,
            });
            if (res.success) {
                toast.success("Commande envoyée, en cours de provision");
                onSuccess();
                onClose();
            } else {
                toast.error(asErrorString(res.error, "Échec de la commande"));
            }
        } catch (err) {
            toast.error(asErrorString(err, "Erreur technique"));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="lg"
            backdrop="blur"
            classNames={{
                base: "bg-[#0f0f0f] border border-[#262626]",
                header: "border-b border-[#262626]",
                footer: "border-t border-[#262626]",
            }}
        >
            <ModalContent>
                <ModalHeader className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-black tracking-widest text-slate-500">
                        {PROVIDER_BADGES[provider]?.label ?? provider}
                    </span>
                    <span className="text-lg font-black text-white">
                        Acheter une ligne IPTV
                    </span>
                </ModalHeader>
                <ModalBody className="space-y-4 py-5">
                    <div className="bg-[#161616] border border-[#262626] rounded-xl p-4">
                        <div className="flex items-start justify-between gap-3">
                            <h4 className="font-black text-white text-sm leading-snug">
                                {product.name}
                            </h4>
                            {duration && (
                                <span className="shrink-0 px-2 py-0.5 rounded-md bg-[#FACC15]/10 border border-[#FACC15]/30 text-[10px] font-black uppercase tracking-wider text-[#FACC15]">
                                    {duration}
                                </span>
                            )}
                        </div>
                        <p className="mt-2 text-2xl font-black text-[#FACC15]">
                            {formatCurrency(product.priceDzd, "DZD")}
                        </p>
                    </div>

                    <div className="space-y-3">
                        <Input
                            label="Surnom client"
                            placeholder="Mohamed, 0555..., interne..."
                            value={customerLabel}
                            onValueChange={setCustomerLabel}
                            maxLength={80}
                            variant="bordered"
                            classNames={{
                                inputWrapper:
                                    "bg-[#0a0a0a] border-[#262626] data-[hover=true]:border-[#FACC15]/50 group-data-[focus=true]:border-[#FACC15]",
                                label: "text-slate-400",
                                input: "text-white",
                            }}
                        />
                        <Input
                            label="Téléphone (optionnel)"
                            placeholder="+213 ..."
                            value={customerPhone}
                            onValueChange={setCustomerPhone}
                            maxLength={20}
                            variant="bordered"
                            classNames={{
                                inputWrapper:
                                    "bg-[#0a0a0a] border-[#262626] data-[hover=true]:border-[#FACC15]/50 group-data-[focus=true]:border-[#FACC15]",
                                label: "text-slate-400",
                                input: "text-white",
                            }}
                        />
                        {isIbo && (
                            <Select
                                label="Application IBO"
                                placeholder={
                                    isLoadingApps
                                        ? "Chargement..."
                                        : "— choisir une application —"
                                }
                                selectedKeys={iboAppId ? [iboAppId] : []}
                                onSelectionChange={(keys) => {
                                    const k = Array.from(keys)[0];
                                    setIboAppId(k ? String(k) : "");
                                }}
                                isDisabled={isLoadingApps}
                                variant="bordered"
                                classNames={{
                                    trigger:
                                        "bg-[#0a0a0a] border-[#262626] data-[hover=true]:border-[#FACC15]/50",
                                    label: "text-slate-400",
                                    value: "text-white",
                                }}
                            >
                                {apps.map((app) => {
                                    const id = String(app.id ?? app.name ?? "");
                                    const label = String(
                                        app.label ?? app.name ?? id,
                                    );
                                    return (
                                        <SelectItem key={id}>{label}</SelectItem>
                                    );
                                })}
                            </Select>
                        )}
                    </div>
                </ModalBody>
                <ModalFooter>
                    <Button
                        variant="flat"
                        onPress={onClose}
                        isDisabled={isSubmitting}
                        className="bg-[#1a1a1a] text-slate-300"
                    >
                        Annuler
                    </Button>
                    <Button
                        onPress={handleSubmit}
                        isLoading={isSubmitting}
                        isDisabled={isSubmitting || missingApp}
                        className="bg-[#FACC15] text-black font-black"
                    >
                        Confirmer l'achat
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
};

export default IptvCheckoutModal;
