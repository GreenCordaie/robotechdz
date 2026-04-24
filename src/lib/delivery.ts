import { db } from "@/db";
import { N8nService } from "@/services/n8n.service";
import { decrypt } from "@/lib/encryption";
import { sendWhatsAppMessage, sendWhatsAppButtons } from "@/lib/whatsapp";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function decryptCode(raw: any): string | null {
    if (!raw) return null;
    if (typeof raw === 'string') return raw;
    try { return decrypt(raw.code) || raw.code || null; } catch { return null; }
}

function formatDate(date: string | Date): string {
    return new Date(date).toLocaleDateString('fr-FR', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function formatAmount(amount: any): string {
    const num = parseFloat(amount) || 0;
    return num.toLocaleString('fr-DZ') + ' DZD';
}

// ─── Legacy helper (used by n8n payload) ─────────────────────────────────────

export function formatOrderItemsText(items: any[]): string {
    let text = "";
    for (const item of items) {
        const codes = (item.codes || []).map(decryptCode).filter(Boolean);
        const slots = (item.slots || []).map((s: any) => {
            try {
                return {
                    parentCode: decrypt(s.digitalCode.code),
                    slotNumber: s.slotNumber,
                    pin: s.code ? decrypt(s.code) : null
                };
            } catch { return null; }
        }).filter(Boolean);

        for (const code of codes) {
            text += `Produit : ${item.name}\nAccès : *${code}*\n\n`;
        }
        for (const slot of slots as any[]) {
            text += `Produit : ${item.name}\nAccès : *${slot.parentCode}*\nProfil : ${slot.slotNumber}${slot.pin ? ` | PIN : ${slot.pin}` : ""}\n\n`;
        }
    }
    return text.trim();
}

// ─── Message builder ─────────────────────────────────────────────────────────

function buildWhatsAppMessage(order: any, shopName: string, appUrl: string, totalDebtClient: number = 0): string {
    const sep = "━━━━━━━━━━━━━━━━━━━━";
    const lines: string[] = [];

    // ── Header ──
    lines.push(sep);
    lines.push(`🏪 *${shopName}*`);
    lines.push(sep);
    lines.push(``);
    lines.push(`✅ *Commande confirmée !*`);
    lines.push(`Bonjour ! Votre commande a bien été traitée.`);
    lines.push(``);

    // ── Récapitulatif ──
    lines.push(`📋 *Récapitulatif Financier*`);
    lines.push(`┌ Commande : *${order.orderNumber}*`);
    lines.push(`├ Date : ${formatDate(order.createdAt)}`);
    lines.push(`├ Total Brut : ${formatAmount(order.totalAmount)}`);

    const remise = parseFloat(order.remise) || 0;
    if (remise > 0) {
        lines.push(`├ Remise : -${formatAmount(remise)}`);
    }

    const net = (parseFloat(order.totalAmount) || 0) - remise;
    lines.push(`├ *Net à payer : ${formatAmount(net)}*`);

    const verse = parseFloat(order.montantPaye) || 0;
    lines.push(`├ Montant versé : ${formatAmount(verse)}`);

    const reste = parseFloat(order.resteAPayer) || 0;
    if (reste > 0) {
        lines.push(`├ *Reste à payer : ${formatAmount(reste)} ⚠️*`);
    } else {
        lines.push(`├ *Statut : Commande soldée ✅*`);
    }

    if (totalDebtClient > 0) {
        lines.push(`└ *Dette totale client : ${formatAmount(totalDebtClient)}*`);
    } else {
        lines.push(`└ *Dette totale client : 0 DZD*`);
    }
    lines.push(``);

    // ── Produits & codes ──
    const items: any[] = order.items || [];
    for (const item of items) {
        const codes = (item.codes || []).map(decryptCode).filter(Boolean) as string[];
        const slots = (item.slots || []).map((s: any) => {
            try {
                return {
                    parentCode: decrypt(s.digitalCode.code),
                    slotNumber: s.slotNumber,
                    pin: s.code ? decrypt(s.code) : null
                };
            } catch { return null; }
        }).filter(Boolean) as any[];

        const totalAccess = codes.length + slots.length;
        if (totalAccess === 0) continue;

        lines.push(sep);
        lines.push(`🎁 *${item.name}* × ${item.quantity}`);
        lines.push(`_${totalAccess} accès reçu${totalAccess > 1 ? 's' : ''} · ${formatAmount(item.price * item.quantity)}_`);
        lines.push(``);

        // Separate IPTV credentials (4 segments: user | pass | m3u | epg) from regular codes
        const iptvCreds = codes.filter(c => c.split(' | ').length >= 3);
        const regularCodes = codes.filter(c => c.split(' | ').length < 3);

        if (regularCodes.length > 0) {
            lines.push(`🔑 *Code${regularCodes.length > 1 ? 's' : ''} d'activation :*`);
            for (const code of regularCodes) {
                lines.push(`• \`${code}\``);
            }
        }

        if (iptvCreds.length > 0) {
            lines.push(`📡 *Accès IPTV :*`);
            for (const cred of iptvCreds) {
                const parts = cred.split(' | ');
                const username = parts[0] || "";
                const password = parts[1] || "";
                const m3uUrl = parts[2] || "";
                const epgUrl = parts[3] || "";

                lines.push(`• *Utilisateur :* \`${username}\``);
                lines.push(`  *Mot de passe :* \`${password}\``);
                if (m3uUrl) lines.push(`  *M3U :* \`${m3uUrl}\``);
                if (epgUrl) lines.push(`  *EPG :* \`${epgUrl}\``);
                lines.push(``);
            }
        }

        if (slots.length > 0) {
            lines.push(`👤 *Profil${slots.length > 1 ? 's' : ''} :*`);
            for (const slot of slots) {
                lines.push(`• Profil N°${slot.slotNumber} — \`${slot.parentCode}\`${slot.pin ? `  |  PIN : *${slot.pin}*` : ''}`);
            }
        }

        lines.push(``);
    }

    // ── Footer ──
    lines.push(sep);
    lines.push(``);
    lines.push(``);
    lines.push(`💬 _Un problème ? Répondez à ce message, notre équipe vous aide 24h/24._`);
    lines.push(``);
    lines.push(`Merci pour votre confiance ! 🙏`);
    lines.push(`_${shopName}_`);

    return lines.join('\n');
}

// ─── Main trigger ─────────────────────────────────────────────────────────────

export async function triggerOrderDelivery(orderId: number): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
    const order = await db.query.orders.findFirst({
        where: (orders, { eq }) => eq(orders.id, orderId),
        with: {
            client: true,
            reseller: true,
            items: {
                with: {
                    codes: true,
                    slots: { with: { digitalCode: true } }
                }
            }
        }
    });

    if (!order) {
        console.warn(`[DELIVERY] Order #${orderId} not found`);
        return { success: false, error: 'Order not found' };
    }

    const customerPhone = (order as any).customerPhone
        || (order as any).client?.telephone
        || (order as any).reseller?.telephone;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://boutique.nexusbox.tech';

    // Guard: skip if no codes or slots allocated yet (manual orders awaiting traitement)
    const hasAnyCredentials = (order as any).items?.some((item: any) =>
        (item.codes && item.codes.length > 0) || (item.slots && item.slots.length > 0)
    );
    if (!hasAnyCredentials) {
        console.log(`[DELIVERY] Order #${orderId} has no codes/slots yet — skipping WhatsApp`);
        return { success: true, skipped: true };
    }

    const formattedText = formatOrderItemsText((order as any).items);

    // 1. Direct WAHA (primary) — the app runs on the host and can always reach WAHA at localhost:3001.
    //    n8n runs in Docker and cannot reliably reach localhost:3001 from inside the container.
    let wahaResult: { success: boolean; error?: string } = { success: false, skipped: true } as any;

    if (customerPhone && (order as any).deliveryMethod === 'WHATSAPP') {
        try {
            const settings = await db.query.shopSettings.findFirst();
            const shopName = settings?.shopName || 'Ma Boutique';
            const totalDebt = parseFloat((order as any).client?.totalDetteDzd || "0");
            const message = buildWhatsAppMessage(order, shopName, appUrl, totalDebt);

            wahaResult = await sendWhatsAppMessage(customerPhone, message, {
                whatsappApiUrl: settings?.whatsappApiUrl ?? undefined,
                whatsappApiKey: settings?.whatsappApiKey ?? undefined,
                whatsappInstanceName: settings?.whatsappInstanceName ?? undefined,
            });

            if (wahaResult.success) {
                console.log(`[DELIVERY] ✅ WhatsApp sent to ${customerPhone} for order #${orderId}`);

                // ── Netflix instructions (envoyé après le message principal) ──
                const hasNetflixSlots = (order as any).items?.some((item: any) =>
                    (item.slots || []).length > 0
                );

                if (hasNetflixSlots) {
                    const instructionsMsg =
                        `📺 *Comment activer votre accès Netflix :*\n\n` +
                        `1️⃣ Connectez-vous sur votre TV ou appareil\n` +
                        `2️⃣ Entrez l'email et le mot de passe reçus\n` +
                        `3️⃣ Quand Netflix demande le *code de foyer* (4 chiffres), répondez simplement *CODE* à ce message.\n\n` +
                        `⚡ *Nous vous enverrons le code instantanément !*`;

                    await sendWhatsAppMessage(customerPhone, instructionsMsg, {
                        whatsappApiUrl: settings?.whatsappApiUrl ?? undefined,
                        whatsappApiKey: settings?.whatsappApiKey ?? undefined,
                        whatsappInstanceName: settings?.whatsappInstanceName ?? undefined,
                    }).catch(err => console.warn(`[DELIVERY] Netflix instructions failed:`, err));

                    console.log(`[DELIVERY] 📺 Netflix instructions text sent to ${customerPhone}`);
                }

                // ── IPTV instructions (si credentials IPTV détectées) ──
                const hasIptvCodes = (order as any).items?.some((item: any) =>
                    (item.codes || []).some((c: any) => {
                        const d = decrypt(c.code);
                        return d && d.split(' | ').length >= 3;
                    })
                );

                if (hasIptvCodes) {
                    const iptvMsg =
                        `📡 *Comment configurer votre IPTV :*\n\n` +
                        `1️⃣ Ouvrez votre application IPTV (Smarters, TiviMate, etc.)\n` +
                        `2️⃣ Ajoutez un abonnement avec les identifiants reçus\n` +
                        `3️⃣ Ou utilisez le lien M3U dans votre lecteur\n\n` +
                        `⚡ *L'accès est activé immédiatement !*`;

                    await sendWhatsAppMessage(customerPhone, iptvMsg, {
                        whatsappApiUrl: settings?.whatsappApiUrl ?? undefined,
                        whatsappApiKey: settings?.whatsappApiKey ?? undefined,
                        whatsappInstanceName: settings?.whatsappInstanceName ?? undefined,
                    }).catch(err => console.warn(`[DELIVERY] IPTV instructions failed:`, err));
                }
            } else {
                console.error(`[DELIVERY] ❌ WhatsApp failed: ${wahaResult.error}`);
            }
        } catch (err: any) {
            console.error(`[DELIVERY] ❌ WhatsApp error:`, err.message);
            wahaResult = { success: false, error: err.message };
        }
    } else {
        console.log(`[DELIVERY] deliveryMethod=${(order as any).deliveryMethod}, phone=${customerPhone || 'none'} — skipping WhatsApp`);
        return { success: true, skipped: true };
    }

    // 2. Notify n8n in background for other automations (Telegram, CRM, archival…)
    N8nService.triggerEvent('CUSTOMER_DELIVERY', {
        orderId: (order as any).id,
        orderNumber: (order as any).orderNumber,
        customerPhone,
        deliveryMethod: (order as any).deliveryMethod,
        appUrl,
        formattedItemsText: formattedText
    }).catch((err: any) => {
        console.warn(`[DELIVERY] n8n notification failed (non-blocking):`, err.message);
    });

    return wahaResult;
}
