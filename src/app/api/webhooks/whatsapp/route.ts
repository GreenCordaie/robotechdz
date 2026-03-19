import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { clients, shopSettings, orders, products, whatsappFaqs } from "@/db/schema";
import { eq, or, like, and, desc } from "drizzle-orm";
import { getGeminiResponse } from "@/lib/gemini";

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
            where: eq(products.status, 'ACTIVE'),
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

import { formatOrderItemsText } from "@/lib/delivery";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        // Evolution API payload parsing
        const event = body.event;
        if (event !== "messages.upsert") return NextResponse.json({ success: true });

        const messageData = body.data;
        const senderPhone = messageData.key.remoteJid.split('@')[0];
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
                where: and(whereClause, eq(orders.status, "TERMINE")),
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
        if (text === '1' || text === '2') {
            if (text === '1') {
                return client ? reply(`💰 *SOLDE*\nClient: *${client.nomComplet}*\nSolde: *${client.totalDetteDzd} DA*`)
                    : reply("❌ Client non reconnu.");
            } else {
                if (!client) return reply("❌ Compte inexistant.");
                const latest = await db.query.orders.findMany({
                    where: eq(orders.clientId, client.id),
                    limit: 3,
                    orderBy: (orders, { desc }) => [desc(orders.createdAt)]
                });
                let msg = `📦 *COMMANDES*` + (latest.length ? latest.map(o => `\n\n🔸 #${o.orderNumber} - *${o.status}*`).join('') : "\nAucune.");

                // Append codes if found in latest orders
                const codes = await getLatestCodes();
                return reply(msg + codes);
            }
        }

        // --- 🤖 DETERMINISTIC FAQ & PROBLEM DETECTION ---

        // 1. Proactive Problem Detection
        const problemKeywords = ["problème", "probleme", "souci", "marche pas", "fonctionne pas", "defectueux", "tuto", "aide"];
        const hasProblem = problemKeywords.some(kw => lowText.includes(kw));

        if (hasProblem) {
            const allProducts = await db.query.products.findMany({ where: eq(products.status, 'ACTIVE') });
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
        const baseInstructions = settings.chatbotRole || "Tu es l'assistant de FLEXBOX DIRECT.";

        const finalPrompt = `${baseInstructions}
        
---
CONTEXTE BOUTIQUE :
${catalog}
---
IMPORTANT : Discute naturellement. Si on te demande les prix, utilise le catalogue ci-dessus. Si on te demande comment faire quelque chose, utilise le tuto associé.
Réponds de manière concise et pro.`;

        const aiResponse = await getGeminiResponse(text, senderPhone, settings.geminiApiKey || "", finalPrompt);
        if (aiResponse) await reply(aiResponse);

        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ success: false }, { status: 500 });
    }
}
