"use client";

import React, { useState, useEffect } from "react";
import { Spinner, Card, CardBody, Progress, Chip } from "@heroui/react";
import { getSharedAccountsInventory } from "./actions";
import { Users, Mail, LayoutGrid, CheckCircle2, Circle } from "lucide-react";

export default function SharedAccountsContent() {
    const [inventory, setInventory] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const loadInventory = async () => {
        setIsLoading(true);
        try {
            const data = await getSharedAccountsInventory();
            setInventory(data);
        } catch (error) {
            console.error("Failed to load inventory:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadInventory();
        const interval = setInterval(loadInventory, 10000); // Refresh every 10s
        return () => clearInterval(interval);
    }, []);

    if (isLoading && inventory.length === 0) {
        return (
            <div className="flex h-full items-center justify-center">
                <Spinner color="warning" label="Chargement de l'inventaire..." />
            </div>
        );
    }

    return (
        <div className="space-y-8 p-4 md:p-8 bg-[#0a0a0a] min-h-full">
            <header className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-secondary/10 rounded-2xl">
                        <Users className="text-secondary w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white tracking-tight">Comptes Partagés</h1>
                        <p className="text-slate-400 text-sm italic">Suivi de l&apos;occupation des profils en temps réel</p>
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                {inventory.length === 0 ? (
                    <div className="col-span-full py-20 text-center border-2 border-dashed border-white/5 rounded-3xl opacity-40">
                        <span className="material-symbols-outlined text-6xl mb-4">inventory_2</span>
                        <p className="text-xl font-medium">Aucun compte partagé configuré</p>
                    </div>
                ) : inventory.map((variant) => (
                    variant.digitalCodes.map((account: any) => {
                        const total = account.slots.length;
                        const sold = account.slots.filter((s: any) => s.status === "VENDU").length;
                        const occupancy = (sold / total) * 100;

                        return (
                            <Card
                                key={account.id}
                                className="bg-[#161616] border border-white/5 hover:border-secondary/30 transition-all group overflow-hidden"
                                shadow="none"
                            >
                                <CardBody className="p-6 space-y-6">
                                    <div className="flex justify-between items-start">
                                        <div className="space-y-1">
                                            <h3 className="font-bold text-slate-100 flex items-center gap-2">
                                                {variant.product.name}
                                                <Chip size="sm" variant="flat" color="secondary" className="text-[10px] h-5">{variant.name}</Chip>
                                            </h3>
                                            <p className="text-xs text-slate-500 flex items-center gap-1.5">
                                                <Mail size={12} />
                                                {account.code}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-lg font-black text-white">{sold}/{total}</div>
                                            <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest leading-none">Profils</p>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Progress
                                            value={occupancy}
                                            color={occupancy === 100 ? "danger" : occupancy > 70 ? "warning" : "success"}
                                            size="sm"
                                            className="h-1.5"
                                        />
                                        <div className="flex justify-between text-[10px] text-slate-500 font-bold uppercase">
                                            <span>Remplissage</span>
                                            <span>{Math.round(occupancy)}%</span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-5 gap-2 pt-2">
                                        {account.slots.sort((a: any, b: any) => a.slotNumber - b.slotNumber).map((slot: any) => (
                                            <div
                                                key={slot.id}
                                                className={`aspect-square rounded-lg flex items-center justify-center transition-all ${slot.status === "VENDU"
                                                    ? 'bg-slate-800/50 text-slate-500 border border-white/5'
                                                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-lg shadow-emerald-500/5'
                                                    }`}
                                            >
                                                <div className="flex flex-col items-center">
                                                    {slot.status === "VENDU" ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                                                    <span className="text-[7px] font-black mt-0.5 max-w-full truncate px-0.5">
                                                        {slot.profileName || slot.slotNumber}
                                                    </span>
                                                    {slot.code && slot.status === "VENDU" && (
                                                        <span className="text-[6px] opacity-70 font-mono">{slot.code}</span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardBody>
                            </Card>
                        );
                    })
                ))}
            </div>
        </div>
    );
}
