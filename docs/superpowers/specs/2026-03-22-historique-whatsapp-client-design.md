# Spec — Historique WhatsApp par Client

**Date :** 2026-03-22
**Statut :** Approuvé

---

## Contexte

Les conversations WhatsApp (entrantes et sortantes) sont stockées dans la table `webhookEvents` (`provider = 'whatsapp'`). L'admin n'a actuellement aucune interface pour consulter l'historique WhatsApp d'un client spécifique depuis sa fiche.

---

## Objectif

Ajouter un bouton "WhatsApp" sur chaque fiche client (page Clients) qui ouvre une modal affichant la conversation complète : messages entrants du client, réponses du bot, et tickets support liés.

---

## Périmètre

**Inclus :**
- Server action `getClientWhatsAppHistory({ clientId })`
- Modal `WhatsAppHistoryModal` — style chat, 30 derniers messages
- Bouton WhatsApp sur les cartes clients dans `ClientsContent`
- Tickets support liés au même numéro (section basse de la modal)

**Exclus :**
- Envoi de message depuis l'admin
- Temps réel / polling
- Historique sur plus de 30 messages (pagination)
- Images, vidéos ou autres médias (texte uniquement)

---

## Architecture

### Données existantes

**Table `webhookEvents` :**
```
id           serial PK
provider     text         -- 'whatsapp'
externalId   text         -- message ID unique
customerPhone text        -- format '213XXXXXXXXX'
payload      jsonb        -- contenu complet du message
processedAt  timestamp
```

**Payload JSON — structure réelle stockée par le webhook :**
```json
{
  "event": "message",
  "payload": {
    "fromMe": false,
    "body": "Bonjour je veux...",
    "type": "text"
  }
}
```
> Structure confirmée depuis `src/app/api/webhooks/whatsapp/route.ts` — la fonction `getConversationHistory()` lit `p.payload?.body` et `p.payload?.fromMe`.

**Table `supportTickets` :**
```
customerPhone  text   -- format '213XXXXXXXXX'
subject        text
status         text   -- 'OUVERT' (défaut), 'TRAITE' (valeurs réelles utilisées dans le code)
createdAt      timestamp
```

**Table `clients` :**
```
telephone  text  -- format local '0XXXXXXXXX'
```

### Normalisation téléphone

```typescript
// 0XXXXXXXXX → 213XXXXXXXXX
const intlPhone = client.telephone.startsWith('0')
  ? '213' + client.telephone.slice(1)
  : client.telephone;
```

---

## Server Action

**Fichier :** `src/app/admin/clients/actions.ts`

```typescript
// Imports requis à ajouter dans clients/actions.ts :
// import { webhookEvents, supportTickets } from "@/db/schema";
// import { eq, desc, and } from "drizzle-orm";

export const getClientWhatsAppHistory = withAuth(
  { roles: [UserRole.ADMIN, UserRole.CAISSIER], schema: z.object({ clientId: z.number() }) },
  async ({ clientId }) => {
    const client = await db.query.clients.findFirst({ where: eq(clients.id, clientId) });
    if (!client?.telephone) return { success: false, error: "Client introuvable" };

    // Normalisation : '0XXXXXXXXX' → '213XXXXXXXXX'
    const intlPhone = client.telephone.startsWith('0')
      ? '213' + client.telephone.slice(1)
      : client.telephone;

    const [events, tickets] = await Promise.all([
      db.select()
        .from(webhookEvents)
        .where(and(
          eq(webhookEvents.provider, 'whatsapp'),
          eq(webhookEvents.customerPhone, intlPhone)
        ))
        .orderBy(desc(webhookEvents.processedAt))
        .limit(30),
      db.select()
        .from(supportTickets)
        .where(eq(supportTickets.customerPhone, intlPhone))
        .orderBy(desc(supportTickets.createdAt))
        .limit(5)
    ]);

    const messages = events.map(e => {
      // Structure réelle du payload : { event: "message", payload: { fromMe, body, type } }
      // Même pattern que route.ts getConversationHistory()
      const p = e.payload as any;
      if (p?.event !== "message") return null; // Ignorer les événements non-message
      const inner = p.payload;
      return {
        id: e.id,
        fromMe: inner?.fromMe ?? false,
        body: inner?.body || '[Message non textuel]',
        messageType: inner?.type || 'text',
        timestamp: e.processedAt,
      };
    }).filter(Boolean).reverse(); // Filtrer null + ordre chronologique

    return {
      success: true,
      data: { messages, tickets, phone: intlPhone }
    };
  }
);
```

---

## Composant WhatsAppHistoryModal

**Fichier :** `src/components/admin/modals/WhatsAppHistoryModal.tsx`

### Props
```typescript
interface WhatsAppHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: number;
  clientName: string;
  clientPhone: string;
}
```

### État interne
```typescript
const [messages, setMessages] = useState<Message[]>([]);
const [tickets, setTickets] = useState<Ticket[]>([]);
const [isLoading, setIsLoading] = useState(false);
```

### Chargement

Au montage (quand `isOpen` devient `true`) : appel `getClientWhatsAppHistory({ clientId })`.

### Structure UI

```
┌─────────────────────────────────────────┐
│ 💬 WhatsApp — NomClient   [X messages]  │
│ +213XXXXXXXXX                           │
├─────────────────────────────────────────┤
│                                         │
│   [Bulle gris gauche] Message client    │
│                   10:32                 │
│                                         │
│         Réponse bot [Bulle orange droite│
│                               10:32    │
│                                         │
│   [Bulle gris gauche] Autre message     │
│                   10:35                 │
│                                         │
├─────────────────────────────────────────┤
│ Tickets liés (si présents)              │
│ • [OUVERT] Sujet du ticket — 22/03      │
└─────────────────────────────────────────┘
```

**Bulles :**
- `fromMe: false` (client) → bulle **gauche**, fond `#262626`, texte blanc
- `fromMe: true` (bot) → bulle **droite**, fond `#ec5b13/20`, texte orange clair, label "Bot"

**États :**
- Chargement : `<Spinner />` centré
- Aucun message : "Aucune conversation WhatsApp trouvée pour ce client"
- Messages non textuels (`messageType !== 'text'`) : afficher `[Image]` / `[Audio]` / `[Fichier]`

---

## Modification ClientsContent

**Fichier :** `src/components/admin/ClientsContent.tsx`

### Ajouts

1. Import `WhatsAppHistoryModal`
2. État :
```typescript
const [whatsappClientId, setWhatsappClientId] = useState<number | null>(null);
const [whatsappClientName, setWhatsappClientName] = useState('');
const [whatsappClientPhone, setWhatsappClientPhone] = useState('');
const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
```

3. Bouton sur chaque carte/ligne client (visible uniquement si `client.telephone`) :
```tsx
<button
  onClick={() => {
    setWhatsappClientId(client.id);
    setWhatsappClientName(client.nomComplet);
    setWhatsappClientPhone(client.telephone);
    setIsWhatsAppModalOpen(true);
  }}
  className="p-1.5 rounded-lg bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] transition-all"
  title="Voir historique WhatsApp"
>
  {/* WhatsApp SVG icon */}
</button>
```

4. Montage de la modal :
```tsx
<WhatsAppHistoryModal
  isOpen={isWhatsAppModalOpen}
  onClose={() => setIsWhatsAppModalOpen(false)}
  clientId={whatsappClientId!}
  clientName={whatsappClientName}
  clientPhone={whatsappClientPhone}
/>
```

---

## Cas limites

| Cas | Comportement |
|-----|--------------|
| Client sans numéro de téléphone | Bouton WhatsApp masqué |
| Aucun message dans webhookEvents | Message "Aucune conversation trouvée" |
| Payload JSON malformé | Afficher `[Message illisible]` au lieu de crasher |
| Messages non textuels (image, audio) | Afficher `[Image]`, `[Audio]`, `[Fichier]` |
| Téléphone déjà en format international | Condition `startsWith('0')` préserve le format |

---

## Fichiers modifiés

| Fichier | Type |
|---------|------|
| `src/app/admin/clients/actions.ts` | Ajout `getClientWhatsAppHistory` |
| `src/components/admin/modals/WhatsAppHistoryModal.tsx` | Création |
| `src/components/admin/ClientsContent.tsx` | Ajout bouton + état + modal |
