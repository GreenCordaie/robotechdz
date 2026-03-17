"use client";

import { ThermalReceipt } from "@/components/admin/receipt/ThermalReceipt";

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
            codes: ["NFLX-9876-XYZ"]
        }
    ];

    return (
        <ThermalReceipt
            orderNumber="#A45"
            date={new Date()}
            items={sampleItems}
            totalAmount={36300}
            paymentMethod="Espèces"
        />
    );
}
