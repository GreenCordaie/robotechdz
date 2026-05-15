import { db } from "@/db";
import { iptvProvisions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { N8nService } from "@/services/n8n.service";
import { decrypt } from "@/lib/encryption";
import { sendWhatsAppMessage, sendWhatsAppButtons } from "@/lib/whatsapp";
import { parseIbosolCustomData } from "@/lib/ibosol-credentials";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function decryptCode(raw: any): string | null {
    if (!raw) return null;
    if (typeof raw === 'string') return raw;
    try { return decrypt(raw.code) || raw.code || null; } catch { return null; }
}

// ─── Ibosol helpers ──────────────────────────────────────────────────────────

const IBOSOL_APP_NAMES: Record<number, string> = {
    1: "IBO Player",
    2: "SmartOne",
    3: "BOB Player",
    4: "IBO Pro",
};

function formatExpiresFr(raw?: string): string {
    if (!raw) return "N/A";
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString("fr-FR");
}

interface IbosolFormatInput {
    mac?: string;
    activationCode?: string;
    expiresAt?: string;
    appId?: number;
    iptvUsername?: string;
    iptvPassword?: string;
    m3uUrl?: string;
    iptvProductName?: string;
    isPartial?: boolean;
}

function buildIbosolMessage(input: IbosolFormatInput): string {
    const appName = IBOSOL_APP_NAMES[input.appId ?? 1] ?? "IBO Player";

    if (input.isPartial) {
        return [
            `🎉 *Activation ${appName} réussie*`,
            ``,
            `📱 *Device activé*`,
            `MAC : ${input.mac}`,
            input.activationCode ? `Code activation : ${input.activationCode}` : null,
            input.expiresAt ? `Expire le : ${formatExpiresFr(input.expiresAt)}` : null,
            ``,
            `⚠️ *IPTV en cours de traitement*`,
            `Notre service va vous recontacter sous peu pour finaliser votre abonnement IPTV.`,
        ].filter(Boolean).join("\n");
    }

    if (input.iptvUsername && input.iptvPassword) {
        // Combo OK
        return [
            `🎉 *Votre ${appName} + IPTV est prêt*`,
            ``,
            `📱 *Device activé*`,
            `MAC : ${input.mac}`,
            input.activationCode ? `Code activation : ${input.activationCode}` : null,
            input.expiresAt ? `Expire le : ${formatExpiresFr(input.expiresAt)}` : null,
            ``,
            `📺 *Abonnement ${input.iptvProductName || "IPTV"}*`,
            `Identifiant : ${input.iptvUsername}`,
            `Mot de passe : ${input.iptvPassword}`,
            input.m3uUrl ? `URL M3U : ${input.m3uUrl}` : null,
            ``,
            `✅ La playlist est déjà injectée dans votre device — il suffit d'ouvrir ${appName}.`,
        ].filter(Boolean).join("\n");
    }

    // Activation seule
    return [
        `🎉 *Votre activation ${appName}*`,
        ``,
        `📱 *Device*`,
        `MAC : ${input.mac}`,
        `Application : ${appName}`,
        ``,
        `🔑 *Code activation*`,
        input.activationCode || "—",
        ``,
        input.expiresAt ? `📅 Expire le : ${formatExpiresFr(input.expiresAt)}` : null,
        ``,
        `💡 *Comment activer :*`,
        `1. Ouvrez ${appName} sur votre device`,
        `2. Allez dans Paramètres → Activer`,
        `3. Entrez le code ci-dessus`,
        `4. Profitez !`,
    ].filter(Boolean).join("\n");
}

/** Parse the joined Ibosol code string back into fields (reverse of formatIbosolCode in webhook) */
function parseIbosolCodeString(decryptedCode: string): Record<string, string> {
    const fields: Record<string, string> = {};
    for (const part of decryptedCode.split(" | ")) {
        const idx = part.indexOf(": ");
        if (idx > 0) {
            const key = part.substring(0, idx).trim();
            const value = part.substring(idx + 2).trim();
            fields[key] = value;
        }
    }
    return fields;
}

function isIbosolItem(item: any): boolean {
    const slug = item?.variant?.loadbrainSlug;
    return typeof slug === "string" && slug.startsWith("ibo-");
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
        // Ibosol items get their own dedicated WhatsApp message
        if (isIbosolItem(item)) continue;

        const codes = (item.codes || []).map(decryptCode).filter(Boolean);
        const slots = (item.slots || []).map((s: any) => {
            try {
                if (!s.digitalCode?.code) return null;
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
        // Ibosol items get their own dedicated WhatsApp message
        if (isIbosolItem(item)) continue;

        const codes = (item.codes || []).map(decryptCode).filter(Boolean) as string[];
        const slots = (item.slots || []).map((s: any) => {
            try {
                if (!s.digitalCode?.code) return null;
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

        // Detect if this item is IPTV (has loadbrainSlug on variant, but excluding ibo-* which has its own template)
        const slug = (item as any).variant?.loadbrainSlug as string | undefined;
        const isIptvItem = !!slug && !slug.startsWith("ibo-");

        // Separate IPTV credentials from regular codes
        const iptvCreds = isIptvItem ? codes : codes.filter(c => c.split(' | ').length >= 3);
        const regularCodes = isIptvItem ? [] : codes.filter(c => c.split(' | ').length < 3);

        if (regularCodes.length > 0) {
            lines.push(`🔑 *Code${regularCodes.length > 1 ? 's' : ''} d'activation :*`);
            for (const code of regularCodes) {
                lines.push(`• \`${code}\``);
            }
        }

        if (iptvCreds.length > 0) {
            for (const cred of iptvCreds) {
                const parts = cred.split(' | ');
                const username = parts[0] || "";
                const password = parts[1] || "";
                const m3uUrl = parts[2] || "";
                const epgUrl = parts[3] || "";

                // Mode "code" — single activation code (no password/m3u)
                if (username && !password && !m3uUrl) {
                    lines.push(`🔑 *Code d'activation IPTV :*`);
                    lines.push(`• \`${username}\``);
                    lines.push(``);
                    lines.push(`📲 Pour obtenir votre mot de passe, Smarters et M3U, cliquez ici :`);
                    lines.push(`https://t.me/MYIRON_BOT`);
                    lines.push(``);
                } else if (!username && !password && !m3uUrl) {
                    // Code vide — juste envoyer le lien bot
                    lines.push(`📲 Pour obtenir vos accès IPTV, cliquez ici :`);
                    lines.push(`https://t.me/MYIRON_BOT`);
                    lines.push(``);
                } else {
                    // Mode "credentials" — full line (username/password/m3u/epg)
                    lines.push(`📡 *Accès IPTV :*`);
                    lines.push(`• *Utilisateur :* \`${username}\``);
                    lines.push(`  *Mot de passe :* \`${password}\``);
                    if (m3uUrl) lines.push(`  *M3U :* \`${m3uUrl}\``);
                    if (epgUrl) lines.push(`  *EPG :* \`${epgUrl}\``);
                    lines.push(``);
                }
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

export async function triggerOrderDelivery(
    orderId: number,
    options: { forceManual?: boolean } = {}
): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
    const order = await db.query.orders.findFirst({
        where: (orders, { eq }) => eq(orders.id, orderId),
        with: {
            client: true,
            reseller: true,
            items: {
                with: {
                    codes: true,
                    slots: { with: { digitalCode: true } },
                    variant: true
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

            // EPIC 2 / Phase A — Si l'admin a coupé l'auto-send, on skip ici.
            // Le caissier peut toujours cliquer "Renvoyer WhatsApp" depuis le modal
            // commande pour déclencher manuellement (resendWhatsAppAction passe forceManual=true).
            if (!options.forceManual && settings && settings.autoSendWhatsapp === false) {
                console.log(`[DELIVERY] Order #${orderId} — auto-send WhatsApp désactivé (settings)`);
                return { success: true, skipped: true };
            }

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
                // Ibosol items are excluded — they get their own dedicated message below.
                const hasIptvCodes = (order as any).items?.some((item: any) =>
                    !isIbosolItem(item) &&
                    (item.codes || []).some((c: any) => {
                        const d = decrypt(c.code);
                        return d && d.split(' | ').length >= 3;
                    })
                );

                const hasAnyIptv = (order as any).items?.some((item: any) =>
                    item.variant?.loadbrainSlug && !item.variant.loadbrainSlug.startsWith('ibo-')
                );

                const hasIronMaxCode = (order as any).items?.some((item: any) =>
                    item.variant?.loadbrainSlug?.startsWith('ironmax') &&
                    (item.codes || []).some((c: any) => {
                        const d = decrypt(c.code);
                        return d && !d.includes(' | ');
                    })
                );

                if (hasIptvCodes || hasAnyIptv) {
                    let iptvMsg =
                        `📡 *Comment configurer votre IPTV :*\n\n` +
                        `1️⃣ Ouvrez votre application IPTV (Smarters, TiviMate, etc.)\n` +
                        `2️⃣ Ajoutez un abonnement avec les identifiants reçus\n` +
                        `3️⃣ Ou utilisez le lien M3U dans votre lecteur\n\n` +
                        `⚡ *L'accès est activé immédiatement !*`;

                    if (hasIronMaxCode) {
                        iptvMsg += `\n\n📲 *Pour obtenir votre mot de passe, Smarters et M3U :*\n` +
                            `👉 Cliquez ici : https://t.me/MYIRON_BOT\n` +
                            `Entrez votre code d'activation reçu ci-dessus dans le bot.`;
                    }

                    await sendWhatsAppMessage(customerPhone, iptvMsg, {
                        whatsappApiUrl: settings?.whatsappApiUrl ?? undefined,
                        whatsappApiKey: settings?.whatsappApiKey ?? undefined,
                        whatsappInstanceName: settings?.whatsappInstanceName ?? undefined,
                    }).catch(err => console.warn(`[DELIVERY] IPTV instructions failed:`, err));
                }

                // ── Ibosol delivery (3 templates: activation seule / combo OK / combo partiel) ──
                const ibosolItems = ((order as any).items || []).filter(isIbosolItem);

                for (const ibo of ibosolItems) {
                    const codes = ibo.codes || [];
                    if (codes.length === 0) continue;

                    const decryptedCode = decryptCode(codes[0]);
                    if (!decryptedCode) continue;

                    const fields = parseIbosolCodeString(decryptedCode);
                    const customData = parseIbosolCustomData(ibo.customData);

                    // Determine partial status from iptv_provisions table
                    let isPartial = false;
                    try {
                        const provision = await db.query.iptvProvisions.findFirst({
                            where: and(
                                eq(iptvProvisions.orderId, (order as any).id),
                                eq(iptvProvisions.orderItemId, ibo.id)
                            ),
                        });
                        isPartial = provision?.status === "completed_partial";
                    } catch (err: any) {
                        console.warn(`[DELIVERY] Ibosol provision lookup failed:`, err?.message);
                    }

                    const ibosolMsg = buildIbosolMessage({
                        mac: fields["MAC"],
                        activationCode: fields["Code activation"],
                        expiresAt: fields["Expire"],
                        appId: customData?.appId ?? 1,
                        iptvUsername: fields["User"],
                        iptvPassword: fields["Pass"],
                        m3uUrl: fields["M3U"],
                        iptvProductName: customData?.combo?.iptvProductName,
                        isPartial,
                    });

                    await sendWhatsAppMessage(customerPhone, ibosolMsg, {
                        whatsappApiUrl: settings?.whatsappApiUrl ?? undefined,
                        whatsappApiKey: settings?.whatsappApiKey ?? undefined,
                        whatsappInstanceName: settings?.whatsappInstanceName ?? undefined,
                    }).catch(err => console.warn(`[DELIVERY] Ibosol message failed for item #${ibo.id}:`, err));

                    console.log(`[DELIVERY] 📺 Ibosol message sent for item #${ibo.id} (partial=${isPartial})`);
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
