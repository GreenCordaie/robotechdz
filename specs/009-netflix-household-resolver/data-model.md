# Data Model: Netflix Household Auto-Resolver

**Feature**: 009-netflix-household-resolver
**Date**: 2026-03-29

---

## Changements DB

### Table `digital_codes` — Ajout colonne

```sql
ALTER TABLE digital_codes ADD COLUMN outlook_password TEXT;
-- Nullable: les comptes existants n'ont pas encore ce champ
-- Encrypté avec encrypt() avant stockage
```

**Drizzle schema** (ajout dans `digitalCodes`):
```typescript
outlookPassword: text("outlook_password"), // encrypté, nullable
```

### Table `digital_code_slots` — Pas de changement de schéma

Le champ `code TEXT` existe déjà. Il stockait le PIN optionnel — il devient auto-généré (4 chiffres, encrypté).

---

## Entités impactées

### SharedAccount (`digital_codes`)

| Champ | Type | Changement |
|-------|------|------------|
| `id` | serial | inchangé |
| `variant_id` | integer | inchangé |
| `code` | text (encrypted) | inchangé — format "email \| netflix_pass" |
| `outlook_password` | text (encrypted) | **NOUVEAU** — nullable |
| `status` | enum | inchangé |
| `purchase_price` | numeric | inchangé |
| `purchase_currency` | text | inchangé |
| `is_debit_completed` | boolean | inchangé |
| `order_item_id` | integer | inchangé |
| `created_at` | timestamp | inchangé |
| `expires_at` | timestamp | inchangé |

### Slot (`digital_code_slots`)

| Champ | Type | Changement |
|-------|------|------------|
| `id` | serial | inchangé |
| `digital_code_id` | integer | inchangé |
| `slot_number` | integer | inchangé |
| `profile_name` | text | inchangé |
| `code` | text (encrypted) | **COMPORTEMENT** — auto-généré 4 chiffres si vide |
| `status` | enum | inchangé |
| `order_item_id` | integer | inchangé |
| `created_at` | timestamp | inchangé |
| `expires_at` | timestamp | inchangé |

---

## Nouveaux fichiers

### `src/services/netflix-resolver.service.ts`

```typescript
interface ResolverResult {
  type: 'CODE' | 'LINK' | 'NOT_FOUND' | 'ERROR'
  value?: string       // le code 4 chiffres ou l'URL
  attempts: number     // nombre de tentatives effectuées
  error?: string       // message d'erreur si type=ERROR
}

class NetflixResolverService {
  static async resolve(email: string, outlookPassword: string): Promise<ResolverResult>
  private static async fetchLatestNetflixEmail(email: string, outlookPassword: string): Promise<ResolverResult>
  private static extractFromBody(text: string, html: string): ResolverResult | null
}
```

---

## Flux de données — Résolution automatique WhatsApp

```
WhatsApp message reçu
    ↓
route.ts: détection keyword HOUSEHOLD_KEYWORDS
    ↓
lookup: orders JOIN orderItems JOIN digitalCodeSlots
        WHERE customerPhone = senderPhone AND status = VENDU
        ORDER BY createdAt DESC LIMIT 1
    ↓
digitalCode = digitalCodeSlots.digitalCode
    ↓
email = decrypt(digitalCode.code).split(" | ")[0]
outlookPass = decrypt(digitalCode.outlookPassword)
    ↓
NetflixResolverService.resolve(email, outlookPass)
  → imapflow connect outlook.office365.com:993
  → SEARCH FROM netflix, SINCE -15min
  → parse body → extract code/link
  → retry × 3 (30s entre chaque)
    ↓
result.type === 'CODE' → WhatsApp: "Votre code Netflix: XXXX"
result.type === 'LINK' → WhatsApp: "Cliquez ici: [URL]"
result.type === 'NOT_FOUND' → WhatsApp: "Email non trouvé, réessayez"
result.type === 'ERROR' → WhatsApp: "Erreur technique, contactez le support"
    ↓
auditLogs.insert({ action: 'NETFLIX_RESOLVE', entityType: 'SLOT', entityId: slotId, newData: result })
```

---

## Flux de données — PIN auto-généré

```
addSharedAccount / addSharedAccountInternal appelé
    ↓
Pour chaque slot:
  si slotsConfig[i].pinCode fourni → encrypt(pinCode) → stocker
  sinon → generateUniquePin(tx) → encrypt(pin) → stocker
    ↓
Response inclut les PINs générés (décryptés) pour affichage immédiat
```

---

## Contrats d'interface

### Action `resolveHouseholdAction`
```typescript
Input:  { slotId: number }
Output: { success: boolean; type?: 'CODE'|'LINK'|'NOT_FOUND'; error?: string }
```

### Action `addSharedAccount` (modifiée)
```typescript
Input:  { variantId, email, password, outlookPassword?, slots[], purchasePrice?, ... }
Output: { success: boolean; generatedPins?: { slotIndex: number; pin: string }[]; error?: string }
```

### `NetflixResolverService.resolve`
```typescript
Input:  (email: string, outlookPassword: string)
Output: Promise<ResolverResult>
```
