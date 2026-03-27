"use client";

import React, { useState, useEffect } from "react";
import {
    Save,
    Loader2,
    Store,
    MapPin,
    Phone,
    Type,
    CheckCircle2,
    Image as ImageIcon,
    Clock,
    User as UserIcon
} from "lucide-react";
import { toast } from "react-hot-toast";
import { useSettingsStore } from "@/store/useSettingsStore";
import { saveShopSettingsAction } from "@/app/admin/settings/actions";
import { ThermalReceiptV2 } from "@/components/admin/receipt/ThermalReceiptV2";

export function ReceiptSettings() {
    const store = useSettingsStore();

    // Local form states (synced with store on mount)
    const [shopName, setShopName] = useState(store.shopName);
    const [shopTel, setShopTel] = useState(store.shopTel);
    const [shopAddress, setShopAddress] = useState(store.shopAddress);
    const [footerMessage, setFooterMessage] = useState(store.footerMessage);
    const [showCashier, setShowCashier] = useState(store.showCashier);
    const [showDateTime, setShowDateTime] = useState(store.showDateTime);
    const [showLogo, setShowLogo] = useState(store.showLogo);
    const [showTrackQr, setShowTrackQr] = useState(store.showTrackQr);
    const [isSaving, setIsSaving] = useState(false);

    // Sync local state when store hydrates
    useEffect(() => {
        setShopName(store.shopName);
        setShopTel(store.shopTel);
        setShopAddress(store.shopAddress);
        setFooterMessage(store.footerMessage);
        setShowCashier(store.showCashier);
        setShowDateTime(store.showDateTime);
        setShowLogo(store.showLogo);
        setShowTrackQr(store.showTrackQr);
    }, [store.shopName, store.shopTel, store.shopAddress, store.footerMessage, store.showCashier, store.showDateTime, store.showLogo, store.showTrackQr]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await saveShopSettingsAction({
                shopName,
                shopTel,
                shopAddress,
                footerMessage,
                showCashierOnReceipt: showCashier,
                showDateTimeOnReceipt: showDateTime,
                showLogoOnReceipt: showLogo,
                showTrackQrOnReceipt: showTrackQr,
            } as any);

            if (res.success) {
                store.updateSettings({
                    shopName,
                    shopTel,
                    shopAddress,
                    footerMessage,
                    showCashier,
                    showDateTime,
                    showLogo,
                    showTrackQr,
                });
                toast.success("Paramètres d'impression mis à jour");
            } else if ("error" in res) {
                toast.error(res.error || "Erreur de sauvegarde");
            } else {
                toast.error("Erreur de sauvegarde");
            }
        } catch (err) {
            toast.error("Erreur de connexion");
        } finally {
            setIsSaving(false);
        }
    };

    // Dummy data for the preview
    const previewData = {
        orderNumber: "C-PREVIEW",
        date: new Date(),
        totalAmount: 15000,
        paymentMethod: "Espèces",
        totalClientDebt: 2500,
        items: [
            { name: "Netflix Premium (1 Mois)", quantity: 1, price: 1500, codes: ["A1B2-C3D4-E5F6"] },
            { name: "PSN 50$ (US)", quantity: 3, price: 13500, codes: ["P8X2-L9M3-QW12", "Z4V7-K0J5-RT99", "N1Y4-U6B8-GH44"] }
        ]
    };

    const currentLocalSettings = {
        shopName,
        shopTel,
        shopAddress,
        footerMessage,
        showCashier,
        showDateTime,
        showLogo,
        showTrackQr,
        logoUrl: store.logoUrl
    };

    return (
        <div className="flex flex-col lg:flex-row gap-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Form Column */}
            <div className="lg:w-3/5 space-y-8">
                <div className="bg-[#161616] p-8 rounded-[32px] border border-white/5 shadow-2xl">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="p-3 bg-[#ec5b13]/10 rounded-2xl">
                            <Store className="text-[#ec5b13] size-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white uppercase tracking-tight">Configuration du Reçu</h2>
                            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mt-1">Personnalisez l&apos;identité de vos tickets</p>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 ml-2">
                                    <Type size={12} /> Nom Commercial
                                </label>
                                <input
                                    className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 focus:border-[#ec5b13]/50 transition-all outline-none text-white font-bold"
                                    type="text"
                                    value={shopName}
                                    onChange={(e) => setShopName(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 ml-2">
                                    <Phone size={12} /> Téléphone
                                </label>
                                <input
                                    className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 focus:border-[#ec5b13]/50 transition-all outline-none text-white font-bold"
                                    type="text"
                                    value={shopTel}
                                    onChange={(e) => setShopTel(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 ml-2">
                                <MapPin size={12} /> Adresse Complète
                            </label>
                            <input
                                className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 focus:border-[#ec5b13]/50 transition-all outline-none text-white font-bold"
                                type="text"
                                value={shopAddress}
                                onChange={(e) => setShopAddress(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 ml-2">
                                <Type size={12} /> Message de Pied de Page
                            </label>
                            <textarea
                                className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 focus:border-[#ec5b13]/50 transition-all outline-none text-white font-bold min-h-[100px]"
                                value={footerMessage}
                                onChange={(e) => setFooterMessage(e.target.value)}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                            {/* Toggle Cards */}
                            <button
                                onClick={() => setShowLogo(!showLogo)}
                                className={`p-4 rounded-2xl border transition-all flex flex-col items-center gap-3 ${showLogo ? 'bg-[#ec5b13]/10 border-[#ec5b13]/30 text-white' : 'bg-black/40 border-white/5 text-slate-500'}`}
                            >
                                <ImageIcon size={20} className={showLogo ? 'text-[#ec5b13]' : ''} />
                                <span className="text-[10px] font-black uppercase tracking-widest">Logo</span>
                            </button>

                            <button
                                onClick={() => setShowDateTime(!showDateTime)}
                                className={`p-4 rounded-2xl border transition-all flex flex-col items-center gap-3 ${showDateTime ? 'bg-[#ec5b13]/10 border-[#ec5b13]/30 text-white' : 'bg-black/40 border-white/5 text-slate-500'}`}
                            >
                                <Clock size={20} className={showDateTime ? 'text-[#ec5b13]' : ''} />
                                <span className="text-[10px] font-black uppercase tracking-widest">Date/Heure</span>
                            </button>

                            <button
                                onClick={() => setShowCashier(!showCashier)}
                                className={`p-4 rounded-2xl border transition-all flex flex-col items-center gap-3 ${showCashier ? 'bg-[#ec5b13]/10 border-[#ec5b13]/30 text-white' : 'bg-black/40 border-white/5 text-slate-500'}`}
                            >
                                <UserIcon size={20} className={showCashier ? 'text-[#ec5b13]' : ''} />
                                <span className="text-[10px] font-black uppercase tracking-widest">Caissier</span>
                            </button>

                            <button
                                onClick={() => setShowTrackQr(!showTrackQr)}
                                className={`p-4 rounded-2xl border transition-all flex flex-col items-center gap-3 ${showTrackQr ? 'bg-[#ec5b13]/10 border-[#ec5b13]/30 text-white' : 'bg-black/40 border-white/5 text-slate-500'}`}
                            >
                                <Type size={20} className={showTrackQr ? 'text-[#ec5b13]' : ''} />
                                <span className="text-[10px] font-black uppercase tracking-widest">QR Code</span>
                            </button>
                        </div>
                    </div>
                </div>

                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="w-full bg-[#ec5b13] hover:bg-orange-600 text-white font-black py-5 rounded-2xl shadow-xl shadow-[#ec5b13]/30 transition-all transform active:scale-[0.98] mt-10 flex items-center justify-center gap-3 disabled:opacity-50 uppercase tracking-[0.2em] text-xs"
                >
                    {isSaving ? <Loader2 className="animate-spin size-5" /> : <Save className="size-5" />}
                    {isSaving ? "Enregistrement..." : "Appliquer les Changements"}
                </button>
            </div>

            {/* Preview Column */}
            <div className="lg:w-2/5 flex flex-col items-center">
                <div className="sticky top-10 flex flex-col items-center w-full">
                    <div className="flex items-center gap-2 mb-8">
                        <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Aperçu Hardware Direct</span>
                    </div>

                    <div className="relative group">
                        {/* Hardware paper effect */}
                        <div className="absolute -inset-4 bg-white/5 rounded-[40px] blur-2xl opacity-50 group-hover:opacity-100 transition-opacity duration-700" />

                        <div className="relative transform hover:scale-[1.02] transition-transform duration-500 ease-out">
                            {/* The ACTUAL production component */}
                            <ThermalReceiptV2
                                {...previewData}
                                settings={currentLocalSettings}
                            />
                        </div>

                        {/* Scissors icon to show cut point */}
                        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 rotate-180">
                            <div className="w-px h-12 bg-gradient-to-t from-[#ec5b13] to-transparent" />
                            <span className="text-[10px] font-black text-[#ec5b13] uppercase tracking-widest">Point de Coupe</span>
                        </div>
                    </div>

                    <div className="mt-24 p-6 bg-blue-500/5 border border-blue-500/10 rounded-2xl max-w-sm">
                        <div className="flex gap-4">
                            <CheckCircle2 size={16} className="text-blue-400 shrink-0 mt-0.5" />
                            <div>
                                <h4 className="text-[10px] font-black text-white uppercase tracking-widest mb-1">Calibration WYSIWYG</h4>
                                <p className="text-[11px] text-slate-500 leading-relaxed font-medium italic">
                                    L&apos;aperçu à droite utilise le moteur de rendu réel de votre imprimante 80mm.
                                    Tout changement dans le formulaire réagit instantanément ici.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
