"use client";

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';

export const useWebUSBPrinter = () => {
    const [device, setDevice] = useState<any | null>(null);
    const [connected, setConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);

    const findEndpoint = (usbDevice: any) => {
        // Most thermal printers use Interface 0
        const iface = usbDevice.configuration?.interfaces[0];
        if (!iface) return null;

        const endpoint = iface.alternate.endpoints.find(
            (e: any) => e.direction === 'out' && e.type === 'bulk'
        );
        return endpoint ? endpoint.endpointNumber : null;
    };

    const connect = async () => {
        // @ts-ignore
        if (!('usb' in navigator)) {
            toast.error("WebUSB non supporté par ce navigateur (Utilisez Chrome/Edge)");
            return;
        }

        setIsConnecting(true);
        try {
            // @ts-ignore
            const usbDevice = await navigator.usb.requestDevice({
                filters: [{ vendorId: 0x1527 }]
            });
            await usbDevice.open();
            if (usbDevice.configuration === null) {
                await usbDevice.selectConfiguration(1);
            }
            await usbDevice.claimInterface(0);

            setDevice(usbDevice);
            setConnected(true);

            // Persist for auto-connect
            localStorage.setItem('webusb_vendor_id', usbDevice.vendorId.toString());
            localStorage.setItem('webusb_product_id', usbDevice.productId.toString());

            toast.success(`Imprimante connectée : ${usbDevice.productName || 'USB'}`);
        } catch (err: any) {
            console.error("USB Connection error:", err);
            if (err.name !== 'NotFoundError') {
                toast.error("Échec de la connexion USB");
            }
        } finally {
            setIsConnecting(false);
        }
    };

    const disconnect = useCallback(async () => {
        if (device) {
            try {
                await device.close();
            } catch (e) { }
            setDevice(null);
            setConnected(false);
            localStorage.removeItem('webusb_vendor_id');
            localStorage.removeItem('webusb_product_id');
        }
    }, [device]);

    const print = async (data: Uint8Array) => {
        if (!device || !connected) {
            toast.error("L'imprimante n'est pas connectée");
            return false;
        }

        const endpointNumber = findEndpoint(device);
        if (endpointNumber === null) {
            toast.error("Impossible de trouver le port d'impression");
            return false;
        }

        try {
            await device.transferOut(endpointNumber, data);
            return true;
        } catch (err) {
            console.error("Print transfer error:", err);
            toast.error("Erreur lors de l'envoi à l'imprimante");
            setConnected(false); // Likely disconnected
            return false;
        }
    };

    // Auto-connect to previously paired device
    useEffect(() => {
        const autoConnect = async () => {
            // @ts-ignore
            if (!('usb' in navigator)) return;

            const savedVendor = localStorage.getItem('webusb_vendor_id');
            const savedProduct = localStorage.getItem('webusb_product_id');

            if (savedVendor && savedProduct) {
                // @ts-ignore
                const devices = await navigator.usb.getDevices();
                const matched = devices.find((d: any) =>
                    d.vendorId.toString() === savedVendor &&
                    d.productId.toString() === savedProduct
                );

                if (matched) {
                    try {
                        await matched.open();
                        if (matched.configuration === null) await matched.selectConfiguration(1);
                        await matched.claimInterface(0);
                        setDevice(matched);
                        setConnected(true);
                    } catch (e) {
                        console.warn("Auto-connect failed", e);
                    }
                }
            }
        };

        autoConnect();
    }, []);

    // Listen for disconnects
    useEffect(() => {
        const handleDisconnect = (event: any) => {
            if (device && event.device === device) {
                setDevice(null);
                setConnected(false);
                toast.error("Imprimante déconnectée");
            }
        };

        // @ts-ignore
        navigator.usb?.addEventListener('disconnect', handleDisconnect);
        // @ts-ignore
        return () => navigator.usb?.removeEventListener('disconnect', handleDisconnect);
    }, [device]);

    return {
        connected,
        isConnecting,
        device,
        connect,
        disconnect,
        print
    };
};
