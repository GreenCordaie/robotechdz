"use client";

import { ThermalReceiptV2 } from "@/components/admin/receipt/ThermalReceiptV2";

export default function TestReceiptPage() {
    const sampleItems = [
        {
            name: "Carte PSN 50€ Europe",
            quantity: 3,
            price: 34500,
            codes: [
                "ABCD-1234-EFGH-5678",
                "IJKL-5678-MNOP-1234",
                "QRST-9012-UVWX-3456"
            ]
        },
        {
            name: "Netflix Premium 1 Mois",
            quantity: 1,
            price: 1800,
            codes: ["netflix@demo.com | mdp1234 | Profil 2 | PIN: 66554"]
        },
        {
            name: "Recharge Diamant 1000",
            quantity: 1,
            price: 2500,
            codes: ["ID: 55667788 | Pseudo: GamerOne"]
        }
    ];

    return (
        <div className="bg-gray-100 min-h-screen py-10">
            <div className="max-w-[400px] mx-auto bg-white shadow-2xl p-4 rounded-xl border border-gray-200">
                <p className="text-center text-xs font-bold text-gray-500 mb-6 uppercase tracking-widest italic">Aperçu Réel 80mm (V2)</p>
                <ThermalReceiptV2
                    orderNumber="#C57-942"
                    date={new Date()}
                    items={sampleItems}
                    totalAmount={38800}
                    paymentMethod="Espèces"
                />
            </div>
        </div>
    );
}
