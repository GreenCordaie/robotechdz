# Spec — Chatbot IA Anti-Répétition

**Date :** 2026-03-23
**Statut :** Approuvé

---

## Problème

Le chatbot WhatsApp répond en boucle avec les mêmes réponses parce que :
1. La réponse du bot n'est pas stockée dans `webhookEvents` → `getConversationHistory` ne voit que les messages du client, le LLM ignore ce qu'il a déjà dit
2. Aucun paramètre anti-répétition dans l'appel Groq
3. Le system prompt force la même question de clôture à chaque réponse

---

## Fix 1 — Stocker la réponse bot dans webhookEvents

**Fichier :** `src/app/api/webhooks/whatsapp/route.ts`

Après `sendWhatsAppMessage()` réussi, insérer la réponse bot :

```typescript
if (sendResult.success) {
    await db.insert(webhookEvents).values({
        provider: 'whatsapp',
        externalId: `bot_${Date.now()}_${senderPhone}`,
        customerPhone: senderPhone,
        payload: {
            event: "message",
            payload: { fromMe: true, body: aiReply, type: "text" }
        },
        processedAt: new Date()
    });
}
```

`getConversationHistory` retourne alors l'échange complet (user + bot) en ordre chronologique.

---

## Fix 2 — Paramètres anti-répétition Groq

**Fichier :** `src/lib/gemini.ts`

```typescript
body: JSON.stringify({
    model,
    messages,
    max_tokens: 800,
    temperature: 0.7,
    frequency_penalty: 0.8,
    presence_penalty: 0.6,
}),
```

---

## Fix 3 — System prompt corrigé

**Fichier :** `src/app/api/webhooks/whatsapp/route.ts`

- Retirer "Termine TOUJOURS par la question de clôture"
- Ajouter règle anti-répétition explicite
- Réduire `limit` de `getConversationHistory` de 15 → 10

---

## Fichiers modifiés

| Fichier | Modification |
|---------|-------------|
| `src/lib/gemini.ts` | frequency_penalty + presence_penalty |
| `src/app/api/webhooks/whatsapp/route.ts` | Stockage bot reply + prompt + limit 10 |
