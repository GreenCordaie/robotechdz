"use client";

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';

/**
 * Known thermal-printer USB vendor IDs (used to suggest devices in the
 * Chrome USB picker; the user can still pick anything else).
 */
const THERMAL_VENDOR_FILTERS = [
    { vendorId: 0x0416 }, // Winbond / generic printers
    { vendorId: 0x04b8 }, // Epson
    { vendorId: 0x0519 }, // Star Micronics
    { vendorId: 0x0525 }, // Generic / Custom
    { vendorId: 0x067b }, // Prolific
    { vendorId: 0x1504 }, // Bixolon
    { vendorId: 0x1527 }, // Original ROBOTECH printer
    { vendorId: 0x154f }, // SNBC
    { vendorId: 0x1659 }, // Citizen
    { vendorId: 0x20d1 }, // Posiflex
    { vendorId: 0x28e9 }, // Xprinter
    { vendorId: 0x6868 }, // Generic Chinese ESC/POS
    { vendorId: 0x0fe6 }, // ICS Advent
    { classCode: 7 },     // USB class 7 = Printer (catches everything else)
];

interface PrinterInfo {
    name: string;
    vendorId: number;
    productId: number;
    serialNumber?: string;
}

const STORAGE_KEY = 'webusb_printer';

export const useWebUSBPrinter = () => {
    const [device, setDevice] = useState<any | null>(null);
    const [connected, setConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);

    /** Find the bulk OUT endpoint on any of the device's interfaces */
    const findEndpoint = (usbDevice: any): { interfaceNumber: number; endpointNumber: number } | null => {
        const interfaces = usbDevice.configuration?.interfaces || [];
        for (const iface of interfaces) {
            const alt = iface.alternate;
            const endpoint = alt?.endpoints?.find(
                (e: any) => e.direction === 'out' && e.type === 'bulk'
            );
            if (endpoint) {
                return { interfaceNumber: iface.interfaceNumber, endpointNumber: endpoint.endpointNumber };
            }
        }
        return null;
    };

    const claimAndOpen = async (usbDevice: any): Promise<boolean> => {
        try {
            await usbDevice.open();
            if (usbDevice.configuration === null) {
                await usbDevice.selectConfiguration(1);
            }
            const ep = findEndpoint(usbDevice);
            if (!ep) {
                toast.error("Imprimante détectée mais aucun port d'impression compatible (cherche endpoint bulk OUT)");
                await usbDevice.close().catch(() => {});
                return false;
            }
            await usbDevice.claimInterface(ep.interfaceNumber);
            return true;
        } catch (err: any) {
            console.error("[USB] claim/open error:", err);
            toast.error(err.message || "Erreur d'ouverture USB (l'imprimante est peut-être déjà utilisée par un autre logiciel)");
            return false;
        }
    };

    const connect = async () => {
        if (typeof navigator === 'undefined' || !('usb' in navigator)) {
            toast.error("WebUSB non supporté par ce navigateur. Utilisez Chrome ou Edge sur Windows/Mac/Linux.");
            return;
        }

        setIsConnecting(true);
        try {
            const usbDevice = await (navigator as any).usb.requestDevice({
                filters: THERMAL_VENDOR_FILTERS,
            });

            const ok = await claimAndOpen(usbDevice);
            if (!ok) return;

            setDevice(usbDevice);
            setConnected(true);

            // Persist for auto-connect
            const info: PrinterInfo = {
                name: usbDevice.productName || `USB ${usbDevice.vendorId.toString(16)}:${usbDevice.productId.toString(16)}`,
                vendorId: usbDevice.vendorId,
                productId: usbDevice.productId,
                serialNumber: usbDevice.serialNumber,
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(info));

            toast.success(`Imprimante connectée : ${info.name}`);
        } catch (err: any) {
            if (err.name !== 'NotFoundError') {
                console.error("[USB] connect error:", err);
                toast.error(err.message || "Échec de la connexion USB");
            }
        } finally {
            setIsConnecting(false);
        }
    };

    const disconnect = useCallback(async () => {
        if (device) {
            try {
                await device.close();
            } catch { /* ignore */ }
            setDevice(null);
            setConnected(false);
            localStorage.removeItem(STORAGE_KEY);
            toast.success("Imprimante déconnectée");
        }
    }, [device]);

    const print = async (data: Uint8Array): Promise<boolean> => {
        if (!device || !connected) {
            toast.error("L'imprimante n'est pas connectée");
            return false;
        }

        const ep = findEndpoint(device);
        if (!ep) {
            toast.error("Port d'impression introuvable");
            return false;
        }

        try {
            await device.transferOut(ep.endpointNumber, data);
            return true;
        } catch (err: any) {
            console.error("[USB] print transfer error:", err);
            toast.error(err.message || "Erreur lors de l'envoi à l'imprimante");
            setConnected(false);
            return false;
        }
    };

    /** Saved printer info (for UI display when not connected) */
    const getSavedInfo = useCallback((): PrinterInfo | null => {
        if (typeof window === 'undefined') return null;
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }, []);

    /** Auto-connect to previously paired device (silent — no toast on failure) */
    useEffect(() => {
        const autoConnect = async () => {
            if (typeof navigator === 'undefined' || !('usb' in navigator)) return;
            const saved = getSavedInfo();
            if (!saved) return;

            try {
                const devices = await (navigator as any).usb.getDevices();
                const matched = devices.find((d: any) =>
                    d.vendorId === saved.vendorId &&
                    d.productId === saved.productId &&
                    (saved.serialNumber === undefined || d.serialNumber === saved.serialNumber)
                );

                if (matched) {
                    const ok = await claimAndOpen(matched);
                    if (ok) {
                        setDevice(matched);
                        setConnected(true);
                    }
                }
            } catch (e) {
                console.warn("[USB] Auto-connect failed", e);
            }
        };

        autoConnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /** Listen for hardware unplug */
    useEffect(() => {
        const handleDisconnect = (event: any) => {
            if (device && event.device === device) {
                setDevice(null);
                setConnected(false);
                toast.error("Imprimante déconnectée");
            }
        };

        const usb = (navigator as any).usb;
        usb?.addEventListener?.('disconnect', handleDisconnect);
        return () => {
            usb?.removeEventListener?.('disconnect', handleDisconnect);
        };
    }, [device]);

    return {
        connected,
        isConnecting,
        device,
        connect,
        disconnect,
        print,
        getSavedInfo,
    };
};
