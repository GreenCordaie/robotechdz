"use client";

import React from "react";
import { formatCurrency } from "@/lib/formatters";

interface ReceiptItem {
    name: string;
    quantity: number;
    price: string | number;
    codes?: string[];
    customData?: string;
    playerNickname?: string;
}

interface ThermalReceiptProps {
    orderNumber: string;
    date: string | Date;
    items: ReceiptItem[];
    totalAmount: string | number;
    paymentMethod?: string;
}

export const ThermalReceipt = ({
    orderNumber,
    date,
    items,
    totalAmount,
    paymentMethod = "Espèces"
}: ThermalReceiptProps) => {
    const formattedDate = new Date(date).toLocaleString('fr-FR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    return (
        <div id="thermal-receipt" className="min-h-screen flex items-center justify-center p-4 bg-[#e5e7eb] font-['Roboto_Mono',_monospace] text-[#1a1a1a]">
            <style jsx global>{`
                @import url('https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;700&display=swap');
                
                @media print {
                    body * {
                        visibility: hidden;
                        margin: 0;
                        padding: 0;
                    }
                    #thermal-receipt, #thermal-receipt * {
                        visibility: visible;
                    }
                    #thermal-receipt {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 80mm !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        min-height: 0 !important;
                        background: white !important;
                    }
                    .receipt-paper {
                        box-shadow: none !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        border: none !important;
                    }
                    @page {
                        size: 80mm auto;
                        margin: 0;
                    }
                }

                .receipt-paper {
                    background-color: #ffffff;
                    background-image: radial-gradient(#f0f0f0 1px, transparent 0);
                    background-size: 20px 20px;
                    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05), inset 0 0 100px rgba(0,0,0,0.02);
                }
                .dotted-separator {
                    border-top: 1px dashed #333;
                    height: 1px;
                    width: 100%;
                    margin: 12px 0;
                }
                .activation-box {
                    background-color: #f3f4f6;
                    border: 1px solid #e5e7eb;
                    font-weight: 700;
                    letter-spacing: 0.05em;
                }
                .thermal-text-bold {
                    font-weight: 700;
                    filter: contrast(1.2);
                }
                .barcode-container {
                    letter-spacing: 2px;
                    font-size: 10px;
                }
            `}</style>

            <main className="receipt-paper w-full max-w-[320px] p-6 flex flex-col items-center" data-purpose="thermal-receipt-container">
                <header className="text-center w-full mb-4">
                    <h1 className="text-xl font-bold uppercase tracking-tight thermal-text-bold">FLEXBOX DIRECT</h1>
                    <p className="text-xs mt-1">LLC - New Mexico, USA</p>
                </header>

                <div className="dotted-separator"></div>

                <section className="w-full text-xs space-y-1" data-purpose="order-info">
                    <div className="flex justify-between">
                        <span>Commande N°</span>
                        <span className="font-bold">{orderNumber}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Date :</span>
                        <span className="whitespace-nowrap">{formattedDate}</span>
                    </div>
                </section>

                <div className="dotted-separator"></div>

                <section className="w-full space-y-4" data-purpose="product-list">
                    {items?.map((item, idx) => (
                        <article key={idx} className="text-xs">
                            <div className="flex justify-between items-start mb-2">
                                <span className="pr-2 text-left">{item.quantity}x {item.name}</span>
                                <span className="whitespace-nowrap font-bold">{formatCurrency(item.price, 'DZD')}</span>
                            </div>
                            <div className="space-y-1">
                                {(item.customData || item.playerNickname) && (
                                    <div className="flex flex-col gap-0.5 px-2 py-1 bg-slate-50 border border-slate-100 rounded text-[9px] font-bold text-black uppercase mb-1">
                                        {item.customData && <div className="flex justify-between"><span>ID/LIEN:</span> <span>{item.customData}</span></div>}
                                        {item.playerNickname && <div className="flex justify-between"><span>PSEUDO:</span> <span>{item.playerNickname}</span></div>}
                                    </div>
                                )}
                                {item.codes?.map((code: string, cIdx: number) => (
                                    <div key={cIdx} className="activation-box p-2 text-center rounded text-[10px] uppercase">
                                        {code}
                                    </div>
                                ))}
                            </div>
                        </article>
                    ))}
                </section>

                <div className="dotted-separator"></div>

                <section className="w-full text-sm space-y-1" data-purpose="receipt-summary">
                    <div className="flex justify-between font-bold text-base thermal-text-bold">
                        <span>TOTAL PAYÉ :</span>
                        <span className="whitespace-nowrap">{formatCurrency(totalAmount, 'DZD')}</span>
                    </div>
                    <div className="flex justify-between text-xs pt-1">
                        <span>Méthode :</span>
                        <span>{paymentMethod}</span>
                    </div>
                </section>

                <div className="dotted-separator mt-6"></div>

                <footer className="w-full text-center space-y-6" data-purpose="receipt-footer">
                    <p className="text-[10px] leading-relaxed italic">
                        Merci de votre visite !<br />
                        Les codes digitaux ne sont ni repris ni échangés.
                    </p>

                    <div className="barcode-container flex flex-col items-center" data-purpose="barcode">
                        <svg className="w-48 h-12" viewBox="0 0 100 30" xmlns="http://www.w3.org/2000/svg">
                            <rect fill="black" height="30" width="2" x="5"></rect>
                            <rect fill="black" height="30" width="1" x="8"></rect>
                            <rect fill="black" height="30" width="3" x="11"></rect>
                            <rect fill="black" height="30" width="1" x="16"></rect>
                            <rect fill="black" height="30" width="2" x="19"></rect>
                            <rect fill="black" height="30" width="4" x="23"></rect>
                            <rect fill="black" height="30" width="1" x="29"></rect>
                            <rect fill="black" height="30" width="2" x="32"></rect>
                            <rect fill="black" height="30" width="1" x="36"></rect>
                            <rect fill="black" height="30" width="3" x="39"></rect>
                            <rect fill="black" height="30" width="2" x="44"></rect>
                            <rect fill="black" height="30" width="4" x="48"></rect>
                            <rect fill="black" height="30" width="1" x="54"></rect>
                            <rect fill="black" height="30" width="2" x="57"></rect>
                            <rect fill="black" height="30" width="3" x="61"></rect>
                            <rect fill="black" height="30" width="1" x="66"></rect>
                            <rect fill="black" height="30" width="2" x="69"></rect>
                            <rect fill="black" height="30" width="4" x="73"></rect>
                            <rect fill="black" height="30" width="1" x="79"></rect>
                            <rect fill="black" height="30" width="2" x="82"></rect>
                            <rect fill="black" height="30" width="3" x="86"></rect>
                            <rect fill="black" height="30" width="1" x="91"></rect>
                        </svg>
                        <span className="mt-1 font-mono text-[9px]">{orderNumber.replace(/[^0-9]/g, "").padStart(12, "0").slice(-12)}</span>
                    </div>
                </footer>
            </main>
        </div>
    );
};
