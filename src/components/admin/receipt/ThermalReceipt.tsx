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

    const parseAccess = (code: string) => {
        if (!code.includes('|')) return null;
        const parts = code.split('|').map(s => s.trim());
        if (parts.length >= 2) {
            return {
                email: parts[0],
                pass: parts[1],
                profile: parts[2] || 'Unique',
                pin: parts[3]?.replace('PIN: ', '') || null
            };
        }
        return null;
    };

    // Helper to parse top-up strings (Diamant, PUBG, etc.)
    const parseTopUp = (code: string) => {
        if (!code.includes(':')) return null;
        const [label, value] = code.split(':').map(s => s.trim());
        return { label, value };
    };

    const CredentialRow = ({ email, pass, profile, pin }: { email: string, pass: string, profile: string, pin: string | null }) => (
        <div className="w-full bg-white border-2 border-dashed border-black rounded-lg p-3 my-2 space-y-2 no-break shadow-sm">
            <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase text-black leading-none">IDENTIFIANTS DE CONNEXION</span>
                <div className="text-[13px] font-black break-all mt-2">
                    <span className="text-gray-600">ID:</span> {email}
                </div>
                <div className="text-[14px] font-black break-all">
                    <span className="text-gray-600">PW:</span> {pass}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t-2 border-black">
                <div className="flex flex-col">
                    <span className="text-[9px] font-black uppercase text-black">PROFIL</span>
                    <span className="text-[16px] font-black text-primary uppercase">{profile}</span>
                </div>
                {pin && (
                    <div className="flex flex-col items-end">
                        <span className="text-[9px] font-black uppercase text-black">CODE PIN</span>
                        <span className="text-[20px] font-black text-black tracking-[0.2em] px-2 border-2 border-black rounded">{pin}</span>
                    </div>
                )}
            </div>
        </div>
    );

    const TopUpRow = ({ label, value }: { label: string, value: string }) => (
        <div className="flex justify-between text-[12px] w-full border-b border-gray-100 py-1">
            <span className="text-gray-800 font-bold uppercase">{label}:</span>
            <span className="font-black text-lg">{value}</span>
        </div>
    );

    return (
        <div id="thermal-receipt" className="min-h-screen flex items-center justify-center p-4 bg-[#e5e7eb] font-['Roboto_Mono',_monospace] text-[#1a1a1a]">
            <style jsx global>{`
                @import url('https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;700&display=swap');
                
                @media print {
                    @page {
                        size: 80mm auto;
                        margin: 0;
                    }
                    body * {
                        visibility: hidden;
                    }
                    #thermal-receipt, #thermal-receipt * {
                        visibility: visible;
                    }
                    #thermal-receipt {
                        width: 80mm !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        min-height: 0 !important;
                        background: white !important;
                        display: block !important;
                    }
                    .receipt-paper {
                        box-shadow: none !important;
                        width: 80mm !important;
                        max-width: 80mm !important;
                        padding: 5mm !important;
                        border: none !important;
                        margin: 0 !important;
                        background: white !important;
                        color: black !important;
                        font-family: 'Monaco', 'Courier New', monospace !important;
                        font-size: 11px !important;
                    }
                    .break-long-code {
                        word-break: break-all !important;
                        display: block;
                        line-height: 1.2;
                        background: #f4f4f4;
                        padding: 4px;
                        font-weight: 900 !important;
                        font-size: 14px !important;
                    }
                    .thermal-bold-large {
                        font-weight: 900 !important;
                        font-size: 16px !important;
                        text-transform: uppercase;
                    }
                    .item-row {
                        display: flex;
                        justify-content: space-between;
                        border-bottom: 2px solid #000;
                        margin-bottom: 6px;
                        font-weight: 700;
                    }
                    .no-break {
                        break-inside: avoid;
                    }
                    * {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                        text-rendering: optimizeLegibility !important;
                    }
                }

                .receipt-paper {
                    background-color: #ffffff;
                    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
                }
                .dotted-separator {
                    border-top: 1px dashed #333;
                    height: 1px;
                    width: 100%;
                    margin: 8px 0;
                }
                .thermal-text-bold {
                    font-weight: 700;
                }
            `}</style>

            <main className="receipt-paper w-full max-w-[320px] p-6 flex flex-col items-center" data-purpose="thermal-receipt-container">
                <header className="text-center w-full mb-2">
                    <div style={{ fontSize: '7pt', color: 'red', fontWeight: 'bold' }}>VERSION 1 - ANCIEN</div>
                    <h1 className="text-2xl font-black uppercase tracking-tight thermal-text-bold">FLEXBOX II</h1>
                    <p className="text-[10px] mt-1 font-bold">REÇU DE COMMANDE</p>
                </header>

                <div className="dotted-separator"></div>

                <section className="w-full text-xs space-y-1 mb-2" data-purpose="order-info">
                    <div className="flex justify-between">
                        <span>Commande :</span>
                        <span className="font-bold">{orderNumber}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Date :</span>
                        <span className="whitespace-nowrap">{formattedDate}</span>
                    </div>
                </section>

                <div className="dotted-separator"></div>

                {/* Section 1: Billable Items */}
                <section className="w-full mb-2" data-purpose="product-list">
                    {items?.map((item, idx) => (
                        <div key={idx} className="item-row text-[11px] py-0.5">
                            <span className="text-left font-medium">{item.quantity}x {item.name}</span>
                            <span className="font-bold whitespace-nowrap">{formatCurrency(item.price, 'DZD')}</span>
                        </div>
                    ))}
                </section>

                <div className="dotted-separator"></div>

                {/* Section 2: Summary (Moved up) */}
                <section className="w-full text-sm space-y-1 no-break" data-purpose="receipt-summary">
                    <div className="flex justify-between font-black text-base thermal-text-bold">
                        <span>TOTAL DZD :</span>
                        <span className="whitespace-nowrap">{formatCurrency(totalAmount, 'DZD')}</span>
                    </div>
                    <div className="flex justify-between text-[11px] pt-0.5">
                        <span>Mode de Paiement :</span>
                        <span className="font-bold font-mono uppercase">{paymentMethod}</span>
                    </div>
                </section>

                <div className="dotted-separator mt-2"></div>

                {/* Section 3: Technical Details / Codes (Moved down) */}
                <section className="w-full space-y-4 pt-2" data-purpose="technical-details">
                    <p className="text-[10px] font-black underline mb-2 text-center">CONTENU DE VOTRE COMMANDE</p>
                    {items?.map((item, idx) => (
                        (item.customData || (item.codes && item.codes.length > 0) || item.playerNickname) && (
                            <div key={`detail-${idx}`} className="space-y-2 no-break border-b border-gray-100 pb-2 last:border-0">
                                <p className="text-[9px] font-black uppercase text-gray-500">{item.name}</p>

                                {item.playerNickname && (
                                    <div className="flex justify-between text-[10px]">
                                        <span>PSEUDO:</span>
                                        <span className="font-black text-primary uppercase">{item.playerNickname}</span>
                                    </div>
                                )}

                                {item.customData && (
                                    <div className="text-[10px] bg-gray-50 p-1 rounded break-long-code">
                                        <span className="font-bold mr-1">ID/LIEN:</span>
                                        {item.customData}
                                    </div>
                                )}

                                <div className="space-y-1">
                                    {item.codes?.map((code: string, cIdx: number) => {
                                        const access = parseAccess(code);
                                        const topup = parseTopUp(code);

                                        if (access) {
                                            return <CredentialRow key={cIdx} {...access} />;
                                        }
                                        if (topup) {
                                            return <TopUpRow key={cIdx} {...topup} />;
                                        }
                                        return (
                                            <div key={cIdx} className="w-full py-2 px-2 text-center text-lg font-black uppercase tracking-widest bg-white border-2 border-black rounded break-long-code shadow-inner">
                                                {code}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )
                    ))}
                </section>

                <div className="dotted-separator mt-4"></div>

                <footer className="w-full text-center space-y-4 pt-2 no-break" data-purpose="receipt-footer">
                    <p className="text-[9px] leading-tight font-medium">
                        MERCI DE VOTRE CONFIANCE !<br />
                        Les codes digitaux ne sont ni repris ni échangés.<br />
                        Soutien technique : support@flexbox.dz
                    </p>

                    <div className="barcode-container flex flex-col items-center opacity-80" data-purpose="barcode">
                        <svg className="w-40 h-10" viewBox="0 0 100 30" xmlns="http://www.w3.org/2000/svg">
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
                        <span className="mt-1 font-mono text-[8px]">{orderNumber.replace(/[^0-9]/g, "").padStart(12, "0").slice(-12)}</span>
                    </div>
                </footer>
            </main>
        </div>
    );
};
