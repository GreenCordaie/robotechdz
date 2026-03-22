import { NextResponse } from 'next/server';
import { db } from '@/db';
import { eq } from 'drizzle-orm';
import { orders } from '@/db/schema';
import { decrypt } from '@/lib/encryption';
import { RateLimitService } from '@/services/rate-limit.service';

export async function GET(request: Request) {
    try {
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
        const rlKey = `track:${ip}`;

        const rl = await RateLimitService.checkLimit(rlKey);
        if (rl.isBlocked) {
            return NextResponse.json({ error: 'Trop de tentatives. Réessayez plus tard.' }, { status: 429 });
        }

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
                        variant: {
                            with: {
                                product: true
                            }
                        },
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
        const fullPhone = order.client?.telephone || order.reseller?.contactPhone;
        const last4 = fullPhone ? fullPhone.slice(-4) : null;

        const isPhoneValidated = !!(phoneDigits && last4 && phoneDigits === last4);

        // If phone required but not yet validated, return minimal info only
        if (last4 && !isPhoneValidated) {
            if (phoneDigits) {
                await RateLimitService.recordFailure(rlKey);
            }
            return NextResponse.json({
                orderNumber: order.orderNumber,
                status: order.status,
                isPhoneValidated: false,
                phoneRequired: true
            });
        }

        // Format the response (phone validated or no phone required)
        const responseData = {
            orderNumber: order.orderNumber,
            status: order.status,
            totalAmount: order.totalAmount,
            createdAt: order.createdAt,
            deliveryMethod: order.deliveryMethod,
            customerName: order.client?.nomComplet || order.reseller?.companyName || 'Client',
            isPhoneValidated,
            phoneRequired: !!last4,
            items: order.items.map(item => {
                const itemData: any = {
                    id: item.id,
                    productName: item.variant?.product?.name || 'Produit',
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
