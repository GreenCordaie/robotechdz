"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Spinner } from "@heroui/react";
import { Palette, Bell, Save } from "lucide-react";
import { toast } from "react-hot-toast";
import { getResellerBrandAction, updateResellerBrandAction } from "./actions";

const DEFAULT_ACCENT = "#E50914";

export default function BrandSettingsContent() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [companyName, setCompanyName] = useState("");
    const [brandName, setBrandName] = useState("");
    const [brandColor, setBrandColor] = useState("");
    const [supportPhone, setSupportPhone] = useState("");
    const [supportWhatsapp, setSupportWhatsapp] = useState("");

    useEffect(() => {
        getResellerBrandAction({})
            .then((res) => {
                if (res.success) {
                    const d = res.data;
                    setCompanyName(d.companyName);
                    setBrandName(d.brandName);
                    setBrandColor(d.brandColor);
                    setSupportPhone(d.supportPhone);
                    setSupportWhatsapp(d.supportWhatsapp);
                }
            })
            .finally(() => setLoading(false));
    }, []);

    const accent = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(brandColor)
        ? brandColor
        : DEFAULT_ACCENT;
    const displayBrand = brandName.trim() || companyName || "Votre marque";

    const save = async () => {
        setSaving(true);
        try {
            const res = await updateResellerBrandAction({
                brandName: brandName.trim(),
                brandColor: brandColor.trim(),
                supportPhone: supportPhone.trim(),
                supportWhatsapp: supportWhatsapp.trim(),
            });
            if (res.success) toast.success("Marque enregistrée");
            else toast.error(res.error || "Échec de l'enregistrement");
        } catch {
            toast.error("Erreur technique");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="py-40 flex justify-center">
                <Spinner color="warning" />
            </div>
        );
    }

    return (
        <div className="space-y-8 max-w-5xl animate-in fade-in duration-500">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
                        <Palette className="text-[var(--primary)] size-7" />
                        Ma marque
                    </h1>
                    <p className="text-slate-500 font-medium mt-1 text-sm">
                        Ce que vos clients voient sur le lien d&apos;activation — votre nom, vos
                        couleurs, votre contact. Vos fournisseurs restent invisibles.
                    </p>
                </div>
                <Link
                    href="/reseller/settings/notifications"
                    className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-[var(--primary)] transition-colors"
                >
                    <Bell size={14} /> Notifications
                </Link>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8 items-start">
                {/* Form */}
                <div className="space-y-5 bg-[#161616] border border-[#262626] rounded-[28px] p-6">
                    <Field label="Nom affiché à vos clients">
                        <input
                            value={brandName}
                            onChange={(e) => setBrandName(e.target.value)}
                            placeholder={companyName || "Ex: StreamShop DZ"}
                            maxLength={60}
                            className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[var(--primary)]/60"
                        />
                        <p className="text-[11px] text-slate-500 mt-1.5">
                            Vide = votre raison sociale ({companyName || "—"}).
                        </p>
                    </Field>

                    <Field label="Couleur de marque">
                        <div className="flex items-center gap-3">
                            <input
                                type="color"
                                value={accent}
                                onChange={(e) => setBrandColor(e.target.value)}
                                className="size-11 rounded-lg bg-transparent border border-[#262626] cursor-pointer"
                                aria-label="Sélecteur de couleur"
                            />
                            <input
                                value={brandColor}
                                onChange={(e) => setBrandColor(e.target.value)}
                                placeholder={DEFAULT_ACCENT}
                                maxLength={7}
                                className="flex-1 bg-[#0a0a0a] border border-[#262626] rounded-xl px-4 py-2.5 text-sm font-mono text-white placeholder:text-slate-600 focus:outline-none focus:border-[var(--primary)]/60"
                            />
                        </div>
                    </Field>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <Field label="WhatsApp support (chiffres)">
                            <input
                                value={supportWhatsapp}
                                onChange={(e) => setSupportWhatsapp(e.target.value)}
                                placeholder="213xxxxxxxxx"
                                maxLength={20}
                                className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[var(--primary)]/60"
                            />
                        </Field>
                        <Field label="Téléphone support">
                            <input
                                value={supportPhone}
                                onChange={(e) => setSupportPhone(e.target.value)}
                                placeholder="0xxxxxxxxx"
                                maxLength={20}
                                className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[var(--primary)]/60"
                            />
                        </Field>
                    </div>

                    <Button
                        onPress={save}
                        isLoading={saving}
                        className="bg-[var(--primary)] text-white font-black px-6 h-12 rounded-2xl"
                        startContent={!saving ? <Save size={16} /> : undefined}
                    >
                        Enregistrer
                    </Button>
                </div>

                {/* Live preview of the customer-facing magic-link header */}
                <aside className="lg:sticky lg:top-24 space-y-3">
                    <p className="text-[10px] uppercase font-black tracking-widest text-slate-500">
                        Aperçu client
                    </p>
                    <div className="rounded-2xl border border-neutral-800 bg-gradient-to-b from-neutral-950 to-neutral-900 p-5">
                        <div className="text-[11px] uppercase tracking-widest text-neutral-500">
                            Accès Netflix
                        </div>
                        <div className="text-2xl font-semibold text-white truncate">
                            {displayBrand}
                        </div>
                        <button
                            type="button"
                            disabled
                            className="mt-5 w-full py-3 rounded-xl text-white font-semibold text-sm"
                            style={{ backgroundColor: accent }}
                        >
                            👁️ Voir mon code
                        </button>
                        {(supportWhatsapp.trim() || supportPhone.trim()) && (
                            <div className="mt-4 text-center text-xs font-semibold text-neutral-300 border border-neutral-700 rounded-xl py-2">
                                💬 Contactez votre vendeur
                            </div>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="block text-[11px] uppercase font-black tracking-widest text-slate-500 mb-1.5">
                {label}
            </label>
            {children}
        </div>
    );
}
