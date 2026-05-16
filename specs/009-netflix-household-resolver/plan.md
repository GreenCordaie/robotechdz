# Implementation Plan: Netflix Household Auto-Resolver

**Branch**: `009-netflix-household-resolver` | **Date**: 2026-03-29 | **Spec**: [spec.md](spec.md)

## Summary

Automatisation de la résolution des problèmes "foyer Netflix" et "première connexion" pour des milliers de comptes partagés. Le système se connecte aux boîtes Outlook des comptes Netflix via IMAP, récupère les codes de vérification, et les envoie aux clients par WhatsApp — automatiquement sur keyword ou manuellement via bouton admin. Les profils reçoivent des PINs à 4 chiffres auto-générés et uniques.

## Technical Context

**Language/Version**: TypeScript 5 / Next.js 14.2 App Router
**Primary Dependencies**: Drizzle ORM, Zod, BullMQ, imapflow (NEW), mailparser (NEW)
**Storage**: PostgreSQL — ajout colonne `outlook_password` dans `digital_codes`
**Testing**: npm test / npm run lint
**Target Platform**: Node.js server (Next.js)
**Performance Goals**: 50 résolutions simultanées, < 2 min par résolution
**Constraints**: IMAP timeout 30s, retry × 3 (90s max), connexions on-demand uniquement
**Scale/Scope**: Milliers de comptes Netflix, pic estimé 50 résolutions simultanées

## Constitution Check

Constitution non configurée pour ce projet (template vide). Pas de gates à évaluer.

**Règles appliquées par défaut**:
- ✅ Pas de nouvelle table DB — modification minimale (1 colonne)
- ✅ Réutilisation des patterns existants (encrypt/decrypt, withAuth, sendWhatsAppMessage)
- ✅ Nouveau service isolé (`netflix-resolver.service.ts`) — zéro couplage avec l'existant
- ✅ Modifications chirurgicales sur les fichiers existants

## Project Structure

### Documentation (this feature)

```text
specs/009-netflix-household-resolver/
├── plan.md              ← ce fichier
├── spec.md              ← spécification fonctionnelle
├── research.md          ← décisions techniques
├── data-model.md        ← schéma DB + contrats
├── quickstart.md        ← guide démarrage
├── checklists/
│   └── requirements.md
└── tasks.md             ← généré par /speckit.tasks
```

### Source Code

```text
src/
├── services/
│   ├── netflix-resolver.service.ts    ← NOUVEAU
│   ├── account.service.ts             ← MODIFIÉ (auto-PIN + outlookPassword)
│   └── n8n.service.ts                 ← inchangé
├── db/
│   └── schema.ts                      ← MODIFIÉ (+outlookPassword colonne)
├── app/
│   └── admin/
│       └── comptes-partages/
│           ├── actions.ts             ← MODIFIÉ (+resolveHouseholdAction, outlookPassword)
│           └── SharedAccountsContent.tsx  ← MODIFIÉ (champ Outlook, PIN visible, bouton)
└── app/
    └── api/
        └── webhooks/
            └── whatsapp/
                └── route.ts           ← MODIFIÉ (détection keywords household)
```

## Phase 0: Research ✅

Voir [research.md](research.md) — toutes les décisions résolues:

| Décision | Choix |
|----------|-------|
| Librairie IMAP | `imapflow` + `mailparser` |
| Serveur Outlook | `outlook.office365.com:993` SSL |
| Extraction code | regex `\b\d{4}\b` + regex URL Netflix |
| Retry | 3× avec 30s de délai |
| Stockage outlookPassword | Champ séparé `outlook_password` encrypté |
| PIN unicité | Vérification en DB, max 10 tentatives |
| Architecture résolution | Synchrone pour bouton, fire-and-forget pour WhatsApp |
| Détection keywords | Avant bloc Gemini, même si chatbot désactivé |

## Phase 1: Design ✅

### Data Model — [data-model.md](data-model.md)

**DB Changes**:
```sql
-- digital_codes: +1 colonne nullable
ALTER TABLE digital_codes ADD COLUMN outlook_password TEXT;
```

**digital_code_slots.code**: comportement modifié — PIN 4 chiffres auto-généré si vide.

### Contrats d'interface

```typescript
// resolveHouseholdAction
Input:  { slotId: number }
Output: { success: boolean; type?: 'CODE'|'LINK'|'NOT_FOUND'; error?: string }

// addSharedAccount (étendu)
Input:  { ..., outlookPassword?: string }
Output: { success: boolean; generatedPins?: { slotIndex: number; pin: string }[] }

// NetflixResolverService.resolve
Input:  (email: string, outlookPassword: string)
Output: Promise<{ type: 'CODE'|'LINK'|'NOT_FOUND'|'ERROR'; value?: string; attempts: number; error?: string }>
```

### Flux principal

```
keyword WhatsApp → lookup slot par téléphone → decrypt outlookPass →
NetflixResolverService → IMAP Outlook → extract code/link →
sendWhatsAppMessage → auditLog
```

## Implementation Order

1. **[DB]** `src/db/schema.ts` — colonne `outlookPassword`
2. **[DB]** `npx drizzle-kit push`
3. **[Service]** `src/services/netflix-resolver.service.ts` — IMAP + extraction
4. **[Service]** `src/services/account.service.ts` — auto-PIN + outlookPassword
5. **[Action]** `src/app/admin/comptes-partages/actions.ts` — resolveHouseholdAction + outlookPassword
6. **[UI]** `src/app/admin/comptes-partages/SharedAccountsContent.tsx` — champ Outlook + PIN + bouton
7. **[Webhook]** `src/app/api/webhooks/whatsapp/route.ts` — détection keywords
8. **[Install]** `npm install imapflow mailparser @types/mailparser`
