import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { clients, shopSettings, orders, products, whatsappFaqs, webhookEvents } from "@/db/schema";
import { eq, or, like, and, desc } from "drizzle-orm";
import { getGeminiResponse } from "@/lib/gemini";
import { ProductStatus, OrderStatus } from "@/lib/constants";

/**
 * WHATSAPP OFFICIAL CLOUD API WEBHOOK
 * Discussion 100% IA (Gemini) with Dynamic Catalog Context
 */

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    const settings = await db.query.shopSettings.findFirst();
    const VERIFY_TOKEN = settings?.whatsappVerifyToken || "flexbox_direct_webhook_secret";

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
}

async function getStoreCatalogContext() {
    try {
        const allProducts = await db.query.products.findMany({
            where: eq(products.status, ProductStatus.ACTIVE),
            with: { variants: true }
        });
        if (!allProducts.length) return "Catalogue vide.";

        let context = "CATALOGUE LIVE :\n";
        allProducts.forEach(p => {
            context += `- ${p.name}`;
            if (p.description) context += ` (${p.description})`;
            context += " | Prix : ";
            context += p.variants.map(v => `${v.name}: ${v.salePriceDzd} DA`).join(', ');
            if (p.tutorialText) context += ` | Tuto : ${p.tutorialText}`;
            context += "\n";
        });
        return context;
    } catch (e) { return "Erreur catalogue."; }
}

/**
 * Fetches recent messages to provide conversation history to Gemini.
 */
async function getConversationHistory(senderPhone: string) {
    try {
        const events = await db.query.webhookEvents.findMany({
            where: and(
                eq(webhookEvents.provider, "whatsapp"),
                eq(webhookEvents.customerPhone, senderPhone)
            ),
            orderBy: (we, { desc }) => [desc(we.processedAt)],
            limit: 15
        });

        // Format history for Gemini chat
        const history: { role: "user" | "model"; parts: { text: string }[] }[] = [];

        for (const ev of events) {
            const payload = ev.payload as any;
            if (payload?.event === "messages.upsert") {
                const text = payload.data?.message?.conversation || payload.data?.message?.extendedTextMessage?.text;
                const fromMe = payload.data?.key?.fromMe;
                if (text) {
                    history.unshift({
                        role: fromMe ? "model" : "user",
                        parts: [{ text }]
                    });
                }
            }
        }
        return history;
    } catch (e) { return []; }
}

/**
 * Provides Gemini with a detailed view of client orders, items, and codes.
 */
async function getClientOrdersContext(digits: string, clientId?: number) {
    try {
        const phoneMatch = digits.slice(-9);
        const whereClause = clientId
            ? or(eq(orders.clientId, clientId), like(orders.customerPhone, `%${phoneMatch}%`))
            : like(orders.customerPhone, `%${phoneMatch}%`);

        const recentOrders = await db.query.orders.findMany({
            where: whereClause,
            with: {
                items: {
                    with: {
                        codes: true,
                        slots: { with: { digitalCode: true } }
                    }
                }
            },
            orderBy: (o, { desc }) => [desc(o.createdAt)],
            limit: 5
        });

        if (!recentOrders.length) return "Aucune commande trouvée.";

        let ctx = "COMMANDES RÉCENTES :\n";
        recentOrders.forEach((o: any) => {
            const dateStr = o.createdAt ? new Date(o.createdAt).toLocaleDateString("fr-FR") : "Date inconnue";
            ctx += `- Commande #${o.orderNumber} | Statut: ${o.status} | Date: ${dateStr}\n`;
            (o.items || []).forEach((item: any) => {
                ctx += `  * ${item.quantity}x ${item.name}`;

                // Show codes if order is TERMINE or LIVRE
                if (o.status === OrderStatus.TERMINE || o.status === OrderStatus.LIVRE) {
                    const codes = (item.codes || []).map((c: any) => decrypt(c.code));
                    const slots = (item.slots || []).map((s: any) => {
                        const parent = decrypt(s.digitalCode.code);
                        let info = `${parent} (Profil ${s.slotNumber})`;
                        if (s.expiresAt) {
                            const expDate = new Date(s.expiresAt).toLocaleDateString("fr-FR");
                            info += ` [Expire le ${expDate}]`;
                        }
                        return info;
                    });
                    const allAccess = [...codes, ...slots].join(", ");
                    if (allAccess) ctx += ` | Accès: ${allAccess}`;
                }
                ctx += "\n";
            });
        });
        return ctx;
    } catch (e) {
        console.error("[GEMINI_CONTEXT] Error:", e);
        return "Historique des commandes indisponible temporairement.";
    }
}

import { formatOrderItemsText } from "@/lib/delivery";
import { decrypt } from "@/lib/encryption";

export async function POST(req: NextRequest) {
    try {
        const { verifyWebhookSignature, isEventProcessed } = await import("@/lib/webhook-security");

        // 0. Signature Validation
        const isValid = await verifyWebhookSignature(req.headers, "whatsapp");
        if (!isValid) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();

        // Evolution API payload parsing
        const event = body.event;
        if (event !== "messages.upsert") return NextResponse.json({ success: true });

        const messageData = body.data;
        const messageId = messageData?.key?.id;

        // --- IDEMPOTENCE & HISTORY RECORDING ---
        const senderPhone = messageData.key.remoteJid.split('@')[0];
        if (messageId) {
            const alreadyProcessed = await isEventProcessed("whatsapp", messageId, senderPhone, body);
            if (alreadyProcessed) return NextResponse.json({ success: true });
        }
        const text = (messageData.message?.conversation || messageData.message?.extendedTextMessage?.text || "").trim();
        const lowText = text.toLowerCase();

        const settings = await db.query.shopSettings.findFirst();
        if (!settings?.chatbotEnabled) return NextResponse.json({ success: true });

        const waConfig = {
            whatsappApiUrl: settings.whatsappApiUrl || "",
            whatsappApiKey: settings.whatsappApiKey || "",
            whatsappInstanceName: settings.whatsappInstanceName || ""
        };

        const reply = (msg: string) => sendWhatsAppMessage(senderPhone, msg, waConfig);

        // --- 👤 CLIENT IDENTIFICATION ---
        const digits = senderPhone.replace(/\D/g, '');
        const client = await db.query.clients.findFirst({
            where: or(eq(clients.telephone, digits), eq(clients.telephone, '0' + digits.slice(-9)))
        });

        // Helper to get latest codes text - Strictly linked to Phone Number
        const getLatestCodes = async () => {
            // Search criteria: Either linked to client record OR matching customer_phone in orders
            const whereClause = client
                ? or(eq(orders.clientId, client.id), like(orders.customerPhone, `%${digits.slice(-9)}%`))
                : like(orders.customerPhone, `%${digits.slice(-9)}%`);

            const latestOrders = await db.query.orders.findMany({
                where: and(whereClause, eq(orders.status, OrderStatus.TERMINE)),
                with: {
                    items: {
                        with: {
                            codes: true,
                            slots: { with: { digitalCode: true } }
                        }
                    }
                },
                orderBy: (orders, { desc }) => [desc(orders.createdAt)],
                limit: 1
            });
            if (!latestOrders.length) return "";
            const codesText = formatOrderItemsText((latestOrders[0] as any).items);
            return codesText ? `\n\n🔑 *VOS DERNIERS ACCÈS :*\n${codesText}` : "";
        };

        // --- ⚡ RAPID DATA TRIGGERS ---
        if (text === '1' || text === '2' || text === '3') {
            if (text === '1') {
                return client ? reply(`💰 *SOLDE*\nClient: *${client.nomComplet}*\nSolde: *${client.totalDetteDzd} DA*`)
                    : reply("❌ Client non reconnu.");
            } else if (text === '2') {
                if (!client) return reply("❌ Compte inexistant.");
                const latest = await db.query.orders.findMany({
                    where: eq(orders.clientId, client.id),
                    limit: 3,
                    orderBy: (orders, { desc }) => [desc(orders.createdAt)]
                });
                let msg = `📦 *DERNIÈRES COMMANDES*` + (latest.length ? latest.map(o => `\n\n🔸 #${o.orderNumber} - *${o.status === "TERMINE" ? "✅ Terminée" : o.status}*`).join('') : "\nAucune.");

                const codes = await getLatestCodes();
                return reply(msg + codes);
            } else if (text === '3') {
                if (!client) return reply("❌ Compte inexistant.");

                // Fetch active subscriptions
                const activeOrders = await db.query.orders.findMany({
                    where: and(eq(orders.clientId, client.id), eq(orders.status, OrderStatus.TERMINE)),
                    with: {
                        items: {
                            with: {
                                codes: true,
                                slots: { with: { digitalCode: true } }
                            }
                        }
                    },
                    orderBy: (orders, { desc }) => [desc(orders.createdAt)]
                });

                // Calculate active count
                const now = new Date();
                const activeCodes = activeOrders.flatMap(o => (o as any).items).flatMap(i => {
                    const codes = (i.codes || []).filter((c: any) => !c.expiresAt || new Date(c.expiresAt) > now);
                    const slots = (i.slots || []).filter((s: any) => !s.expiresAt || new Date(s.expiresAt) > now);
                    return [...codes, ...slots];
                });

                let msg = `🎁 *ESPACE FIDÉLITÉ & ACCÈS*\n\n⭐ Vos Points: *${client.loyaltyPoints} pts*\n🛒 Total Dépensé: *${client.totalSpentDzd} DA*\n\n🔑 *ACCÈS ACTIFS (${activeCodes.length}):*`;

                if (activeCodes.length > 0) {
                    const details = formatOrderItemsText(activeOrders.flatMap(o => (o as any).items));
                    msg += `\n${details}`;
                } else {
                    msg += "\nAucun accès actif pour le moment.";
                }

                return reply(msg + "\n\n💡 _Les codes expirés n'apparaissent plus ici._");
            }
        }

        // --- 🤖 DETERMINISTIC FAQ & PROBLEM DETECTION ---

        // 1. Proactive Problem Detection
        const problemKeywords = ["problème", "probleme", "souci", "marche pas", "fonctionne pas", "defectueux", "tuto", "aide"];
        const hasProblem = problemKeywords.some(kw => lowText.includes(kw));

        if (hasProblem) {
            const allProducts = await db.query.products.findMany({ where: eq(products.status, ProductStatus.ACTIVE) });
            const matchedProduct = allProducts.find(p => lowText.includes(p.name.toLowerCase()));

            if (matchedProduct && matchedProduct.tutorialText) {
                const codes = await getLatestCodes();
                await reply(`⚠️ *ASSISTANCE TECHNIQUE - ${matchedProduct.name.toUpperCase()}*\n\nDésolé pour ce désagrément. Voici le tutoriel pour vous aider :\n👉 ${matchedProduct.tutorialText}\n\nUne fois le tuto suivi, testez à nouveau votre accès.${codes}`);
                return NextResponse.json({ success: true });
            }
        }

        // 2. Flexible FAQ Matching
        const allFaqs = await db.query.whatsappFaqs.findMany();
        const matchedFaq = allFaqs.find(f => lowText.includes(f.question.toLowerCase()));

        if (matchedFaq) {
            const codes = await getLatestCodes();
            await reply(`${matchedFaq.answer}${codes}`);
            return NextResponse.json({ success: true });
        }

        // --- 🧠 DYNAMIC AI DISCUSSION ---
        const catalog = await getStoreCatalogContext();
        const clientOrders = await getClientOrdersContext(digits, client?.id);
        const history = await getConversationHistory(senderPhone);

        const baseInstructions = settings.chatbotRole || "Tu es l'assistant de FLEXBOX DIRECT.";

        const finalPrompt = `${baseInstructions}
        
---
PROFIL CLIENT :
Nom: ${client?.nomComplet || "Inconnu"}
Solde: ${client?.totalDetteDzd || 0} DA
Points Fidélité: ${client?.loyaltyPoints || 0}
Total Dépensé: ${client?.totalSpentDzd || 0} DA
---
HISTORIQUE COMMANDES :
${clientOrders}
---
CONTEXTE BOUTIQUE (CATALOGUE) :
${catalog}
---
CONSIGNES :
1. Sois pro, amical et très concis.
2. Si le client demande ses codes, utilise l'HISTORIQUE COMMANDES.
3. Si un compte est expiré, invite-le à renouveler.
4. Si une commande est en 'PAYE', dis-lui que c'est en cours de préparation.
5. Utilise les tutos du catalogue si besoin.`;

        const aiResponse = await getGeminiResponse(text, senderPhone, settings.geminiApiKey || "", finalPrompt, history);
        if (aiResponse) await reply(aiResponse);

        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ success: false }, { status: 500 });
    }
}
