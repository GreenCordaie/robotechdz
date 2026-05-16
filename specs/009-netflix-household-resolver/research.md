# Research: Netflix Household Auto-Resolver

**Feature**: 009-netflix-household-resolver
**Date**: 2026-03-29

---

## Decision 1: Librairie IMAP

**Decision**: `imapflow` + `mailparser`
**Rationale**: `imapflow` est la librairie IMAP Node.js la plus moderne (async/await natif, TypeScript types inclus, connection pooling, idle support). `mailparser` parse les corps d'email en HTML/texte. Utilisées ensemble dans la majorité des projets Node.js récents.
**Alternatives considérées**: `imap` (callback-based, obsolète), `node-imap` (plus maintenu), `emailjs-imap-client` (abandonné)

**Config Outlook IMAP**:
```
host: outlook.office365.com
port: 993
secure: true (SSL/TLS)
auth: { user: email, pass: outlookPassword }
```

---

## Decision 2: Extraction du code Netflix

**Decision**: Double stratégie — regex code 4 chiffres + regex URL Netflix
**Rationale**: Netflix envoie deux types d'emails selon le contexte.

| Type | Pattern | Extrait |
|------|---------|---------|
| Code vérification | `\b\d{4}\b` dans le corps | Code 4 chiffres |
| Lien household | `https://www\.netflix\.com[^\s"<>]*(?:update-household|verify)[^\s"<>]*` | URL complète |

**Senders Netflix connus** (filtre FROM):
- `info@account.netflix.com`
- `noreply@mailer.netflix.com`
- `noreply@netflix.com`
- `netflix@mailer.netflix.com`

**Fenêtre de recherche**: emails reçus dans les 15 dernières minutes

---

## Decision 3: Retry logic

**Decision**: 3 retries × 30 secondes = 90 secondes max d'attente
**Rationale**: Netflix envoie ses emails en général en 1-3 minutes. 90 secondes couvre 95% des cas sans bloquer trop longtemps.
**Implémentation**: `async/await` avec `setTimeout` wrappé en Promise (pas de BullMQ pour les retries — trop lourd pour un délai de 30s)

---

## Decision 4: Identification client via téléphone

**Decision**: Lookup via `orders` → `orderItems` → `digitalCodeSlots`
**Rationale**: Le numéro WhatsApp du client est stocké dans `orders.customerPhone` ou `clients.telephone`. La jointure orders → items → slots permet de trouver le slot actif.

**Requête** (ordre de priorité):
1. `digitalCodeSlots` WHERE `status = VENDU` AND `orderItem.order.customerPhone = phone` ORDER BY `createdAt DESC` LIMIT 1
2. Via `clients.telephone` si `customerPhone` est null

---

## Decision 5: Stockage outlookPassword

**Decision**: Champ `outlook_password TEXT` séparé dans `digital_codes`, encrypté avec `encrypt()` existant
**Rationale**: Évite tout conflit avec le champ `code` ("email | netflix_pass") actuellement parsé par `code.split(" | ")`. Encryptage identique aux autres secrets.

---

## Decision 6: PIN 4 chiffres — génération et unicité

**Decision**: Génération aléatoire côté serveur dans `AccountService`, vérification unicité dans `digital_code_slots.code`
**Rationale**: 4 chiffres = 10 000 combinaisons. Avec des milliers de slots, la probabilité de collision monte. On vérifie l'unicité en base avant d'assigner.

```typescript
// Algorithme
async function generateUniquePin(tx): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const pin = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
    const existing = await tx.query.digitalCodeSlots.findFirst({
      where: eq(digitalCodeSlots.code, encrypt(pin))
    })
    if (!existing) return pin
  }
  throw new Error('Impossible de générer un PIN unique après 10 tentatives')
}
```

---

## Decision 7: Architecture de la résolution

**Decision**: Résolution synchrone dans la Server Action (pas de queue BullMQ)
**Rationale**: La résolution prend 2-90 secondes. BullMQ est adapté pour des jobs en background sans feedback immédiat. Ici, l'UI admin attend le résultat pour afficher succès/erreur. Pour le WhatsApp auto, on lance en background (fire-and-forget) pour ne pas bloquer le webhook.

**Pour le bouton manuel**: `await resolveHouseholdAction(slotId)` → retour immédiat à l'UI
**Pour le webhook WhatsApp**: `resolveHouseholdAction(slotId).catch(...)` → fire-and-forget, réponse immédiate au client

---

## Decision 8: Détection keywords WhatsApp

**Decision**: Insertion AVANT le bloc `if (!settings?.chatbotEnabled)` dans le webhook
**Rationale**: La résolution doit fonctionner même si le chatbot IA est désactivé. Le check se fait sur les keywords AVANT tout le pipeline Gemini.

**Keywords** (case-insensitive):
```typescript
const HOUSEHOLD_KEYWORDS = ['foyer', 'household', 'appareil', 'code netflix', 'connexion', 'activer', 'verification', 'vérification']
```

---

## Packages à installer

```bash
npm install imapflow mailparser
npm install -D @types/mailparser
```

`imapflow` inclut ses propres types TypeScript — pas besoin de `@types/imapflow`.
