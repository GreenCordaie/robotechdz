# Implementation Plan: Cache Redis Layer

**Branch**: `004-redis-cache-layer` | **Date**: 2026-03-23 | **Spec**: [spec.md](spec.md)

## Summary

Ajouter une couche de cache Redis pour accélérer le catalogue kiosk (60s TTL), les stats du dashboard admin (5 min TTL), et migrer le rate limiting de la DB vers Redis pour le rendre distribué. Client `ioredis` + module singleton `src/lib/redis.ts` avec dégradation gracieuse.

## Technical Context

**Language/Version**: TypeScript 5
**Primary Dependencies**: Next.js 14.2 App Router, `ioredis` (à installer), `src/lib/logger.ts` (003 — warn sur erreur Redis)
**Storage**: Redis (déjà dans docker-compose.yml, port 6379) — zero migration DB
**Testing**: Manuel (quickstart.md)
**Target Platform**: Next.js full-stack, Node.js singleton
**Performance Goals**: Catalogue kiosk < 200ms (cache chaud) ; dashboard < 500ms (cache chaud) ; rate limit < 1ms
**Constraints**: Dégradation gracieuse obligatoire si Redis down (FR-006). Données sensibles jamais en cache (FR-008).
**Scale/Scope**: Faible volume (~100 req/min attendues)

## Constitution Check

Constitution non configurée — pas de gates à évaluer.

## Project Structure

### Documentation (this feature)

```text
specs/004-redis-cache-layer/
├── plan.md              ✅ Ce fichier
├── research.md          ✅ Décisions techniques
├── data-model.md        ✅ Clés Redis, TTL, constantes
├── contracts/
│   └── redis-helpers.md ✅ API module redis.ts + patterns
├── quickstart.md        ✅ 7 scénarios de test
└── tasks.md             (à générer par /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── lib/
│   └── redis.ts                              CREATE — client ioredis singleton + helpers cacheGet/cacheSet/cacheDel/cacheIncr + CACHE_KEYS + CACHE_TTL
├── services/
│   └── rate-limit.service.ts                 MODIFY — remplacer requêtes DB par Redis INCR/EXPIRE (API publique inchangée)
├── app/
│   └── kiosk/
│       └── actions.ts                        MODIFY — wrapper cache-aside autour de getKioskData()
│   └── admin/
│       ├── dashboard/
│       │   └── actions.ts                    MODIFY — cache-aside pour getDashboardStats() + invalidation dans payOrder
│       └── catalogue/
│           └── actions.ts                    MODIFY — cacheDel("kiosk:catalogue") après createProduct/updateProduct
├── app/
│   └── admin/
│       └── caisse/
│           └── actions.ts                    MODIFY — cacheDel dashboard+kiosk après payOrder et approveReturn
.env                                          MODIFY — ajouter REDIS_URL=redis://localhost:6379
.env.example                                  MODIFY — ajouter REDIS_URL=redis://localhost:6379
package.json                                  MODIFY — ajouter ioredis
```

**Structure Decision**: Module singleton dans `src/lib/` (même pattern que db, logger, telegram). Zero nouveau service externe.

## Implementation Phases

### Phase 1 — Setup (ioredis + module redis.ts)
- Installer `ioredis` + `@types/ioredis` si nécessaire
- Ajouter `REDIS_URL` dans `.env` et `.env.example`
- Créer `src/lib/redis.ts` : client singleton avec reconnexion auto, helpers cacheGet/cacheSet/cacheDel/cacheIncr/cacheExpire, CACHE_KEYS, CACHE_TTL, dégradation gracieuse

### Phase 2 — US1 : Cache catalogue kiosk
- Modifier `src/app/kiosk/actions.ts` : wrapper cache-aside autour de `getKioskData()`
- Modifier `src/app/admin/catalogue/actions.ts` : `cacheDel(CACHE_KEYS.KIOSK_CATALOGUE)` après toute mutation produit

### Phase 3 — US2 : Cache dashboard admin
- Modifier `src/app/admin/dashboard/actions.ts` : cache-aside pour `getDashboardStats(period)`
- Modifier `src/app/admin/caisse/actions.ts` : `cacheDel()` dashboard + kiosk après `payOrder` et `approveReturn`

### Phase 4 — US3 : Rate limiting Redis
- Réécrire `src/services/rate-limit.service.ts` : INCR/EXPIRE Redis au lieu de requêtes DB (API publique identique)

## Complexity Tracking

Aucune violation — un nouveau fichier (`redis.ts`), modifications chirurgicales des actions existantes, zero migration DB, un seul nouveau package (`ioredis`).
