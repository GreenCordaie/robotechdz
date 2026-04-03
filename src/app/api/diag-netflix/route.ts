import { NextResponse } from "next/server";
import { db } from "@/db";
import { digitalCodes, orders, clients, digitalCodeSlots, orderItems } from "@/db/schema";
import { ilike, eq, desc } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";
import { NetflixResolverService } from "@/services/netflix-resolver.service";

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const emailParam = searchParams.get('email') || "Arahamplin5568@outlook.com";
        const emailToSearch = emailParam.trim();

        console.log(`[DIAG] Searching for email: ${emailToSearch}`);

        const allCodes = await db.query.digitalCodes.findMany({
            with: {
                slots: {
                    with: {
                        orderItem: {
                            with: {
                                order: {
                                    with: {
                                        client: true
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        const results = allCodes.filter(dc => {
            const dec = (decrypt(dc.code) || '').toLowerCase();
            return dec.includes(emailToSearch.toLowerCase());
        });

        if (results.length === 0) {
            return NextResponse.json({ error: "No codes found matching this email" });
        }

        const details = await Promise.all(results.map(async (dc) => {
            const resolverResult = await NetflixResolverService.resolve(
                emailToSearch,
                dc.msRefreshToken,
                dc.msClientId
            );

            // Diagnostic supplémentaire : lister les 10 derniers mails
            let lastEmails: any[] = [];
            try {
                const { MicrosoftAuthService } = await import("@/services/microsoft-auth.service");
                const accessToken = await MicrosoftAuthService.refreshAccessToken(dc.msRefreshToken!, dc.msClientId || undefined);
                const response = await fetch(
                    "https://graph.microsoft.com/v1.0/me/messages?$orderby=receivedDateTime desc&$top=10&$select=subject,from,receivedDateTime",
                    { headers: { 'Authorization': `Bearer ${accessToken}` } }
                );
                if (response.ok) {
                    const data = await response.json();
                    lastEmails = data.value.map((m: any) => ({
                        subject: m.subject,
                        from: m.from.emailAddress.address,
                        date: m.receivedDateTime
                    }));
                }
            } catch (e: any) {
                lastEmails = [{ error: e.message }];
            }

            return {
                id: dc.id,
                email: emailToSearch,
                msStatus: dc.msStatus,
                msAccountEmail: dc.msAccountEmail,
                hasRefreshToken: !!dc.msRefreshToken,
                lastEmailsFromGraph: lastEmails,
                slots: dc.slots.map(s => ({
                    slotId: s.id,
                    orderId: s.orderItem?.order?.id,
                    orderNumber: s.orderItem?.order?.orderNumber,
                    clientPhone: s.orderItem?.order?.client?.telephone,
                    status: s.status
                })),
                resolverTest: resolverResult
            };
        }));

        return NextResponse.json(details);
    } catch (err: any) {
        return NextResponse.json({ error: err.message });
    }
}
