# Implementation Plan: API Publique Partenaires

**Branch**: `005-public-api-partners` | **Date**: 2026-03-23 | **Spec**: [spec.md](spec.md)

## Summary

Exposer une API publique REST versionnée (`/api/v1/`) pour les partenaires externes : catalogue produits, création de commandes avec allocation de codes digitaux, gestion des clés API depuis l'admin. Authentification via `X-API-Key` (SHA-256 hashée en DB), rate limiting Redis (100 req/min), logs d'audit.

## Technical Context

**Language/Version**: TypeScript 5
**Primary Dependencies**: Next.js 14.2 App Router, Drizzle ORM, Zod (validation), `src/lib/redis.ts` (rate limiting — 004), `src/lib/orders.ts` (allocation stock existante), `src/lib/logger.ts` (003), `crypto` (Node.js built-in — SHA-256, randomBytes)
**Storage**: 2 nouvelles tables (`partner_api_keys`, `api_logs`) — migration `npm run db:push`
**Testing**: Manuel (quickstart.md)
**Target Platform**: Next.js API Routes (App Router) — `src/app/api/v1/`
**Performance Goals**: GET endpoints < 500ms ; POST commande < 2s
**Constraints**: Données sensibles jamais exposées (codes DISPONIBLE, purchasePrice). Clés stockées hashées uniquement. Rate limit 100 req/min Redis.

## Constitution Check

Constitution non configurée — pas de gates à évaluer.

## Project Structure

### Documentation (this feature)

```text
specs/005-public-api-partners/
├── plan.md              ✅ Ce fichier
├── research.md          ✅ 11 décisions techniques
├── data-model.md        ✅ Tables partnerApiKeys + apiLogs, DTOs
├── contracts/
│   └── api-v1.md        ✅ Contrats 4 endpoints + admin actions
├── quickstart.md        ✅ 11 scénarios de test
└── tasks.md             (à générer)
```

### Source Code

```text
src/
├── db/
│   └── schema.ts                           MODIFY — ajouter tables partnerApiKeys + apiLogs
├── lib/
│   └── api-auth.ts                         CREATE — helper authenticateApiKey() + logApiCall()
├── app/
│   └── api/
│       └── v1/
│           ├── products/
│           │   ├── route.ts                CREATE — GET /api/v1/products (liste + filtre catégorie)
│           │   └── [id]/
│           │       └── route.ts            CREATE — GET /api/v1/products/[id]
│           └── orders/
│               ├── route.ts               CREATE — POST /api/v1/orders (créer commande + allouer codes)
│               └── [id]/
│                   └── route.ts           CREATE — GET /api/v1/orders/[id]
└── app/
    └── admin/
        └── settings/
            ├── actions.ts                  MODIFY — ajouter createApiKey, revokeApiKey, listApiKeys
            └── ApiKeysSection.tsx          CREATE — Client Component (liste + création + révocation clés)
```

**Structure Decision**: Routes dans `src/app/api/v1/` (convention App Router). Helper `api-auth.ts` centralisé (même pattern que `webhook-security.ts`). UI dans settings existant (pas de nouvelle page admin).

## Implementation Phases

### Phase 1 — DB Schema + Helper Auth
- Ajouter `partnerApiKeys` et `apiLogs` dans `src/db/schema.ts`
- Exécuter `npm run db:push`
- Créer `src/lib/api-auth.ts` : `authenticateApiKey()` + `logApiCall()` + `checkApiRateLimit()`

### Phase 2 — US1 : Endpoints catalogue (GET)
- Créer `src/app/api/v1/products/route.ts` — GET liste avec filtre catégorie
- Créer `src/app/api/v1/products/[id]/route.ts` — GET détail produit

### Phase 3 — US2 : Endpoint commandes (POST + GET)
- Créer `src/app/api/v1/orders/route.ts` — POST avec validation Zod + allocation stock + retour codes
- Créer `src/app/api/v1/orders/[id]/route.ts` — GET statut commande

### Phase 4 — US3 : Interface admin gestion clés
- Modifier `src/app/admin/settings/actions.ts` — `createApiKey`, `revokeApiKey`, `listApiKeys`
- Créer `src/app/admin/settings/ApiKeysSection.tsx` — UI Client Component

## Complexity Tracking

2 nouvelles tables (migration simple), 6 nouveaux fichiers API, 1 fichier existant modifié (settings/actions.ts), 0 nouvelle dépendance externe.
