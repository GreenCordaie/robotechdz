"use client";

import React, { useState } from "react";
import { Usb, Loader2, CheckCircle, XCircle, Printer, Scissors, Zap, AlertTriangle } from "lucide-react";
import { useWebUSBPrinter } from "@/hooks/useWebUSBPrinter";
import { generateTestTicket } from "@/lib/escpos";
import { toast } from "react-hot-toast";

interface PrinterSettingsProps {
    initialPaperWidth: number;        // 58 or 80
    initialAutoCut: boolean;
    initialAutoPrintPaid: boolean;
    shopName?: string;
    onChange: (changes: Partial<{
        printerPaperWidth: number;
        printerAutoCut: boolean;
        printerAutoPrintPaid: boolean;
    }>) => void;
}

export function PrinterSettings({
    initialPaperWidth,
    initialAutoCut,
    initialAutoPrintPaid,
    shopName,
    onChange,
}: PrinterSettingsProps) {
    const printer = useWebUSBPrinter();
    const [paperWidth, setPaperWidth] = useState<number>(initialPaperWidth);
    const [autoCut, setAutoCut] = useState<boolean>(initialAutoCut);
    const [autoPrintPaid, setAutoPrintPaid] = useState<boolean>(initialAutoPrintPaid);
    const [testing, setTesting] = useState(false);

    const savedInfo = printer.getSavedInfo();
    const isWebUsbSupported = typeof navigator !== "undefined" && "usb" in navigator;

    const updatePaperWidth = (w: number) => {
        setPaperWidth(w);
        onChange({ printerPaperWidth: w });
    };
    const updateAutoCut = (v: boolean) => {
        setAutoCut(v);
        onChange({ printerAutoCut: v });
    };
    const updateAutoPrintPaid = (v: boolean) => {
        setAutoPrintPaid(v);
        onChange({ printerAutoPrintPaid: v });
    };

    const handleTestPrint = async () => {
        if (!printer.connected) {
            toast.error("Connectez d'abord une imprimante");
            return;
        }
        setTesting(true);
        try {
            const data = generateTestTicket({ shopName, paperWidth, autoCut });
            const ok = await printer.print(data);
            if (ok) toast.success("Ticket de test envoyé");
        } finally {
            setTesting(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Connection card */}
            <div className="bg-zinc-900/30 rounded-2xl p-6 border border-white/10">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                        <div className={`p-3 rounded-xl ${printer.connected ? "bg-emerald-500/10" : "bg-slate-700/50"}`}>
                            <Printer className={`w-5 h-5 ${printer.connected ? "text-emerald-400" : "text-slate-400"}`} />
                        </div>
                        <div>
                            <h3 className="text-sm font-black uppercase tracking-wider text-white">État de l&apos;imprimante</h3>
                            {printer.connected && printer.device ? (
                                <p className="text-xs text-emerald-400 mt-0.5 flex items-center gap-1.5">
                                    <CheckCircle className="w-3 h-3" />
                                    Connectée — {printer.device.productName || `${printer.device.vendorId.toString(16)}:${printer.device.productId.toString(16)}`}
                                </p>
                            ) : savedInfo ? (
                                <p className="text-xs text-amber-400 mt-0.5 flex items-center gap-1.5">
                                    <XCircle className="w-3 h-3" />
                                    Déconnectée — précédente : {savedInfo.name}
                                </p>
                            ) : (
                                <p className="text-xs text-slate-400 mt-0.5">Aucune imprimante associée</p>
                            )}
                        </div>
                    </div>

                    <div className="flex gap-2">
                        {printer.connected ? (
                            <button
                                onClick={printer.disconnect}
                                className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-xl text-xs font-black uppercase tracking-wider transition-colors border border-red-500/20"
                            >
                                <XCircle className="w-3.5 h-3.5" />
                                Déconnecter
                            </button>
                        ) : (
                            <button
                                onClick={printer.connect}
                                disabled={printer.isConnecting || !isWebUsbSupported}
                                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-xs font-black uppercase tracking-wider transition-colors border border-emerald-500/20"
                            >
                                {printer.isConnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Usb className="w-3.5 h-3.5" />}
                                {printer.isConnecting ? "Connexion..." : "Connecter une imprimante"}
                            </button>
                        )}

                        <button
                            onClick={handleTestPrint}
                            disabled={!printer.connected || testing}
                            className="flex items-center gap-2 px-4 py-2.5 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-xs font-black uppercase tracking-wider transition-colors border border-cyan-500/20"
                        >
                            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                            Test
                        </button>
                    </div>
                </div>

                {!isWebUsbSupported && (
                    <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-amber-300">
                            Ce navigateur ne supporte pas WebUSB. Utilisez <strong>Chrome</strong> ou <strong>Edge</strong> sur ordinateur (Windows/Mac/Linux).
                        </p>
                    </div>
                )}

                {printer.connected && printer.device && (
                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                        <Stat label="Vendor ID" value={`0x${printer.device.vendorId.toString(16).padStart(4, "0")}`} mono />
                        <Stat label="Product ID" value={`0x${printer.device.productId.toString(16).padStart(4, "0")}`} mono />
                        {printer.device.serialNumber && <Stat label="Serial" value={printer.device.serialNumber} mono />}
                        {printer.device.manufacturerName && <Stat label="Marque" value={printer.device.manufacturerName} />}
                    </div>
                )}
            </div>

            {/* Paper width */}
            <div className="bg-zinc-900/30 rounded-2xl p-6 border border-white/10">
                <h3 className="text-sm font-black uppercase tracking-wider text-white mb-4">Largeur du papier</h3>
                <div className="grid grid-cols-2 gap-3">
                    {[58, 80].map((w) => (
                        <button
                            key={w}
                            onClick={() => updatePaperWidth(w)}
                            className={`p-4 rounded-xl border-2 text-left transition-all ${
                                paperWidth === w
                                    ? "border-[var(--primary)] bg-[var(--primary)]/10"
                                    : "border-white/10 bg-zinc-900/40 hover:border-white/20"
                            }`}
                        >
                            <div className={`text-2xl font-black ${paperWidth === w ? "text-[var(--primary)]" : "text-white"}`}>{w}<span className="text-sm">mm</span></div>
                            <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mt-1">
                                {w === 58 ? "Étroit · 32 cols" : "Standard · 48 cols"}
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Toggles */}
            <div className="bg-zinc-900/30 rounded-2xl p-6 border border-white/10 space-y-4">
                <h3 className="text-sm font-black uppercase tracking-wider text-white mb-2">Comportement</h3>

                <ToggleRow
                    icon={<Scissors className="w-4 h-4" />}
                    label="Coupe automatique"
                    description="Envoie la commande de coupe à la fin de chaque ticket."
                    checked={autoCut}
                    onChange={updateAutoCut}
                />

                <ToggleRow
                    icon={<Printer className="w-4 h-4" />}
                    label="Impression automatique au paiement"
                    description="Imprime le ticket dès que la commande passe à PAYE (sans clic manuel)."
                    checked={autoPrintPaid}
                    onChange={updateAutoPrintPaid}
                />
            </div>

            {/* Help */}
            <div className="bg-zinc-900/30 rounded-2xl p-6 border border-white/10">
                <h3 className="text-sm font-black uppercase tracking-wider text-white mb-3">Aide</h3>
                <ul className="text-xs text-slate-400 space-y-2 leading-relaxed">
                    <li>• Branchez l&apos;imprimante en USB et allumez-la avant de cliquer <strong>Connecter</strong>.</li>
                    <li>• Sur Windows, l&apos;imprimante doit utiliser le pilote <strong>WinUSB</strong> (pas le pilote Microsoft) — installez via <strong>Zadig</strong> si nécessaire.</li>
                    <li>• Si l&apos;imprimante n&apos;apparaît pas dans la liste : déconnectez tout autre logiciel d&apos;impression qui pourrait la verrouiller.</li>
                    <li>• Une fois connectée, la sélection est mémorisée — la reconnexion est automatique au démarrage.</li>
                </ul>
            </div>
        </div>
    );
}

function Stat({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
    return (
        <div>
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</div>
            <div className={`text-xs text-white mt-0.5 ${mono ? "font-mono" : "font-bold"}`}>{value}</div>
        </div>
    );
}

function ToggleRow({
    icon, label, description, checked, onChange,
}: { icon: React.ReactNode; label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <label className="flex items-start gap-3 cursor-pointer group">
            <div className={`p-2 rounded-lg shrink-0 transition-colors ${checked ? "bg-[var(--primary)]/10 text-[var(--primary)]" : "bg-zinc-800/50 text-slate-500"}`}>
                {icon}
            </div>
            <div className="flex-1">
                <div className="text-sm font-bold text-white">{label}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{description}</div>
            </div>
            <div className={`relative w-10 h-6 rounded-full transition-colors shrink-0 mt-1 ${checked ? "bg-[var(--primary)]" : "bg-zinc-700"}`}>
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => onChange(e.target.checked)}
                    className="sr-only"
                />
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`} />
            </div>
        </label>
    );
}
