"use client";

import React from "react";
import { formatCurrency } from "@/lib/formatters";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useAuthStore } from "@/store/useAuthStore";

import Image from "next/image";

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
    remise?: string | number;
    paymentMethod?: string;
    totalClientDebt?: string | number;
    isPreview?: boolean; // Prop to control preview styles
    settings?: {
        shopName: string;
        shopTel: string;
        shopAddress: string;
        footerMessage: string;
        showCashier: boolean;
        showDateTime: boolean;
        showLogo: boolean;
        showTrackQr: boolean;
        logoUrl: string;
    };
}

export const ThermalReceiptV2 = ({
    orderNumber,
    date,
    items,
    totalAmount,
    remise = 0,
    paymentMethod = "Espèces",
    totalClientDebt = 0,
    isPreview = false,
    settings
}: ThermalReceiptProps) => {
    const storeSettings = useSettingsStore();
    const {
        shopName,
        shopTel,
        shopAddress,
        footerMessage,
        showCashier,
        showDateTime,
        showLogo,
        showTrackQr,
        logoUrl
    } = settings || storeSettings;

    const { user } = useAuthStore();

    const formattedDate = new Date(date).toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    const parseAccess = (code: string) => {
        if (!code || !code.includes('|')) return null;
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

    const parseTopUp = (code: string) => {
        if (!code || !code.includes(':')) return null;
        const [label, value] = code.split(':').map(s => s.trim());
        return { label, value };
    };

    const receiptContent = (
        <div id="thermal-receipt-content" className="receipt-v2-container">
            <style jsx global>{`
                .receipt-v2-container {
                    width: 72mm; /* Slightly smaller than 80mm to allow for physical printer margins */
                    margin: 0 auto;
                    background: white;
                    padding: 4mm;
                    font-family: 'Courier New', 'Lucida Console', Monaco, monospace;
                    font-size: 10pt;
                    color: black;
                    line-height: 1.2;
                    -webkit-font-smoothing: none;
                    -moz-osx-font-smoothing: grayscale;
                    text-rendering: optimizeSpeed;
                }

                @media print {
                    .receipt-v2-container {
                        width: 80mm;
                        padding: 2mm;
                        box-shadow: none !important;
                    }
                }

                .receipt-v2-header {
                    text-align: center;
                    margin-bottom: 4mm;
                    border-bottom: 1px dashed black;
                    padding-bottom: 2mm;
                }

                .receipt-v2-title {
                    font-size: 14pt;
                    font-weight: 900;
                    margin-bottom: 1mm;
                }

                .receipt-v2-item-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 1mm;
                }

                .receipt-v2-item-name {
                    flex: 1;
                    padding-right: 2mm;
                    word-break: break-word;
                    font-weight: 700;
                }

                .receipt-v2-item-price {
                    font-weight: 900;
                    white-space: nowrap;
                }

                .receipt-v2-total-block {
                    margin-top: 2mm;
                    border-top: 1px double black;
                    padding-top: 2mm;
                    width: 100%;
                }

                .receipt-v2-total-row {
                    display: flex;
                    justify-content: space-between;
                    font-size: 12pt;
                    font-weight: 900;
                }

                .receipt-v2-tech-details {
                    font-size: 8pt;
                    margin-top: 4mm;
                    padding-top: 2mm;
                    border-top: 1px dashed black;
                }

                .receipt-v2-code-box {
                    background: #f3f4f6;
                    padding: 1.5mm;
                    margin: 1mm 0;
                    word-break: break-all;
                    font-weight: 900;
                    border: 1px solid #ccc;
                }

                .receipt-v2-shared-line {
                    font-size: 8pt;
                    font-weight: 900;
                    background: #f3f4f6;
                    padding: 1.5mm;
                    margin-top: 1mm;
                    border: 1px solid #ccc;
                    display: block;
                }
                
                .receipt-v2-footer {
                    margin-top: 6mm;
                    text-align: center;
                    font-size: 8pt;
                    border-top: 1px dashed black;
                    padding-top: 4mm;
                }
            `}</style>

            <header className="receipt-v2-header">
                {showLogo && logoUrl && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2mm' }}>
                        <Image
                            src={logoUrl}
                            alt="Logo"
                            width={100}
                            height={45}
                            unoptimized
                            style={{
                                height: '12mm',
                                width: 'auto',
                                filter: 'grayscale(100%) contrast(200%)'
                            }}
                        />
                    </div>
                )}
                <div style={{ fontSize: '7pt', color: 'blue', fontWeight: 'bold', textAlign: 'center' }}>VERSION 2 - NOUVEAU</div>
                <div className="receipt-v2-title">{shopName.toUpperCase()}</div>
                {shopAddress && <div style={{ fontSize: '7pt', marginBottom: '0.5mm' }}>{shopAddress}</div>}
                {shopTel && <div style={{ fontSize: '7pt', marginBottom: '1mm' }}>Tel: {shopTel}</div>}

                <div style={{ fontSize: '8pt', fontWeight: 800, marginTop: '2mm', borderTop: '0.5px solid black', paddingTop: '1mm' }}>REÇU DE COMMANDE</div>
                <div style={{ fontSize: '8pt', marginTop: '1mm' }}>
                    #{orderNumber} {showDateTime ? `- ${formattedDate}` : ''}
                </div>
                {showCashier && user?.nom && (
                    <div style={{ fontSize: '7pt', marginTop: '0.5mm' }}>Caissier: {user?.nom}</div>
                )}
            </header>

            <div className="receipt-v2-items">
                {items.map((item, idx) => {
                    const quantity = Number(item.quantity ?? 1);
                    const unitPrice = Number(item.price ?? 0);
                    const itemTotal = quantity * unitPrice;

                    return (
                        <div key={idx} className="receipt-v2-item-row">
                            <span className="receipt-v2-item-name">
                                {quantity}x {item.name}
                                {quantity > 1 && (
                                    <span style={{ fontSize: '8pt', fontWeight: 400, marginLeft: '1mm' }}>
                                        ({formatCurrency(unitPrice, 'DZD')})
                                    </span>
                                )}
                            </span>
                            <span className="receipt-v2-item-price">{formatCurrency(itemTotal, 'DZD')}</span>
                        </div>
                    );
                })}
            </div>

            <div className="receipt-v2-total-block">
                <div className="receipt-v2-total-row" style={{ fontWeight: Number(remise) > 0 ? 500 : 900, fontSize: Number(remise) > 0 ? '10pt' : '12pt' }}>
                    <span>{Number(remise) > 0 ? "TOTAL BRUT :" : "TOTAL :"}</span>
                    <span>{formatCurrency(totalAmount, 'DZD')}</span>
                </div>

                {Number(remise) > 0 && (
                    <>
                        <div className="receipt-v2-total-row" style={{ fontSize: '10pt', fontStyle: 'italic', fontWeight: 500, marginTop: '1mm' }}>
                            <span>REMISE :</span>
                            <span>-{formatCurrency(remise, 'DZD')}</span>
                        </div>
                        <div className="receipt-v2-total-row" style={{ fontSize: '13pt', fontWeight: 900, borderTop: '0.5px dotted black', marginTop: '2mm', paddingTop: '2mm' }}>
                            <span>TOTAL NET :</span>
                            <span>{formatCurrency(Number(totalAmount) - Number(remise), 'DZD')}</span>
                        </div>
                    </>
                )}


                <div style={{ fontSize: '10pt', fontWeight: 700, marginTop: '3mm', borderTop: '0.5px solid #eee', paddingTop: '1mm' }}>
                    PAIEMENT: {paymentMethod.toUpperCase()}
                </div>

                {Number(totalClientDebt) > 0 && (
                    <div className="receipt-v2-total-row" style={{ fontSize: '11pt', fontWeight: 900, borderTop: '1px dashed black', marginTop: '2mm', paddingTop: '2mm' }}>
                        <span>RESTE DE DETTE :</span>
                        <span>{formatCurrency(totalClientDebt, 'DZD')}</span>
                    </div>
                )}
            </div>

            <div className="receipt-v2-tech-details">
                <div style={{ textAlign: 'center', marginBottom: '2mm', textDecoration: 'underline', fontWeight: 900, fontSize: '9pt' }}>CONTENU NUMÉRIQUE</div>
                {items.map((item, idx) => {
                    const hasDetails = item.customData || (item.codes && item.codes.length > 0) || item.playerNickname;
                    if (!hasDetails) return null;

                    return (
                        <div key={`tech-${idx}`} style={{ marginBottom: '4mm' }}>
                            <div style={{ fontSize: '7pt', fontWeight: 900, color: '#333', marginBottom: '1mm' }}>{item.name.toUpperCase()}</div>

                            {item.playerNickname && (
                                <div style={{ fontWeight: 900, fontSize: '9pt' }}>PSEUDO: {item.playerNickname}</div>
                            )}

                            {item.customData && (
                                <div className="receipt-v2-code-box">ID/LIEN: {item.customData}</div>
                            )}

                            {item.codes?.map((code, cIdx) => {
                                const access = parseAccess(code);
                                const topup = parseTopUp(code);

                                if (access) {
                                    return (
                                        <div key={cIdx} className="receipt-v2-shared-line">
                                            {access.email}({access.pass})
                                            <div style={{ marginTop: '0.5mm', borderTop: '0.5px solid #ccc', paddingTop: '0.5mm' }}>
                                                {access.profile} {access.pin ? `| PIN:${access.pin}` : ''}
                                            </div>
                                        </div>
                                    );
                                }
                                if (topup) {
                                    return (
                                        <div key={cIdx} style={{ fontWeight: 900, marginTop: '1mm', borderLeft: '3px solid black', paddingLeft: '2mm' }}>
                                            {topup.label}: {topup.value}
                                        </div>
                                    );
                                }
                                return (
                                    <div key={cIdx} className="receipt-v2-code-box">
                                        {code}
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}
            </div>

            <footer className="receipt-v2-footer">
                <div style={{ fontWeight: 900 }}>{footerMessage.toUpperCase()}</div>
                <div style={{ fontSize: '7pt', marginTop: '1mm' }}>Vérifiez vos codes avant de quitter.</div>
                <div style={{ marginTop: '4mm', letterSpacing: '4px', fontWeight: 900, fontSize: '12pt' }}>
                    *{orderNumber.toUpperCase()}*
                </div>

                {showTrackQr && (
                    <div style={{ marginTop: '4mm', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ fontSize: '7pt', marginBottom: '2mm', fontWeight: 700 }}>SUIVI DE COMMANDE</div>
                        <div className="receipt-v2-qr-placeholder" style={{
                            width: '30mm',
                            height: '30mm',
                            border: '1px solid black',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '6pt',
                            textAlign: 'center'
                        }}>
                            [QR CODE DE SUIVI]
                            {/* Note: Physical printer prints real QR via command, 
                                this is for preview/browser print representation */}
                        </div>
                    </div>
                )}
            </footer>
        </div>
    );

    if (isPreview) {
        return (
            <div className="min-h-screen flex items-center justify-center p-8 bg-gray-200">
                <div className="shadow-2xl rounded-sm overflow-hidden">
                    {receiptContent}
                </div>
            </div>
        );
    }

    return receiptContent;
};
