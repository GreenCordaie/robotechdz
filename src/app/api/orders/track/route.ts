import { NextResponse } from 'next/server';
import { db } from '@/db';
import { eq } from 'drizzle-orm';
import { orders } from '@/db/schema';
import { decrypt } from '@/lib/encryption';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const orderNumber = searchParams.get('orderNumber');
        const phoneDigits = searchParams.get('phoneDigits');

        if (!orderNumber) {
            return NextResponse.json({ error: 'Numéro de commande manquant' }, { status: 400 });
        }

        const order = await db.query.orders.findFirst({
            where: eq(orders.orderNumber, orderNumber),
            with: {
                client: true,
                reseller: true,
                items: {
                    with: {
                        product: true,
                        codes: true,
                        slots: {
                            with: {
                                digitalCode: true
                            }
                        }
                    }
                }
            }
        });

        if (!order) {
            return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
        }

        // Determine the phone number to check against
        const fullPhone = order.client?.telephone || order.reseller?.telephone;
        const last4 = fullPhone ? fullPhone.slice(-4) : null;

        const isPhoneValidated = !!(phoneDigits && last4 && phoneDigits === last4);

        // Format the response
        const responseData = {
            orderNumber: order.orderNumber,
            status: order.status,
            totalAmount: order.totalAmount,
            createdAt: order.createdAt,
            deliveryMethod: order.deliveryMethod,
            customerName: order.client?.name || order.reseller?.name || 'Client',
            isPhoneValidated,
            phoneRequired: !!last4, // True if the order has a phone number
            items: order.items.map(item => {
                const itemData: any = {
                    id: item.id,
                    productName: item.product?.name || 'Produit',
                    quantity: item.quantity,
                    price: item.price,
                };

                // Only include codes if the phone is validated and the order is completed
                if (isPhoneValidated && order.status === 'TERMINE') {
                    itemData.codes = (item.codes || []).map((c: any) => {
                        try { return typeof c === 'string' ? c : decrypt(c.code); }
                        catch { return 'Erreur de déchiffrement'; }
                    }).filter(Boolean);

                    itemData.slots = (item.slots || []).map((s: any) => {
                        try {
                            const parentCode = decrypt(s.digitalCode.code);
                            const slotPin = s.code ? decrypt(s.code) : null;
                            return {
                                parentCode,
                                slotNumber: s.slotNumber,
                                pin: slotPin
                            };
                        } catch { return null; }
                    }).filter(Boolean);
                }

                return itemData;
            })
        };

        return NextResponse.json(responseData);

    } catch (error) {
        console.error('[Track Order API] Error:', error);
        return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
    }
}
