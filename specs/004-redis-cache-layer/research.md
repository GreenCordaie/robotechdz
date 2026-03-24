# Research: Cache Redis Layer

**Feature**: 004-redis-cache-layer
**Date**: 2026-03-23

---

## Decision 1 — Client Redis : ioredis vs node-redis

**Decision**: `ioredis`
**Rationale**: Meilleur support TypeScript natif, reconnexion automatique intégrée, API plus ergonomique pour les opérations courantes (get/set/del/scan). Supporte le mode cluster si besoin futur. Très répandu dans les projets Next.js/Node.js production.
**Alternatives considérées**: `redis` (node-redis v4) — officiel mais API async légèrement plus verbeuse ; `@upstash/redis` — pour Redis serverless uniquement (ne convient pas ici, Redis local).

---

## Decision 2 — Singleton Redis Client

**Decision**: Module singleton `src/lib/redis.ts` — une seule instance partagée par tout le process Node.js
**Rationale**: Évite les connexions multiples (chaque import créerait une nouvelle connexion). Pattern identique à celui utilisé pour Drizzle ORM (`src/db/index.ts`).
**Alternatives considérées**: Connexion par requête — overhead réseau élevé, connexions pool saturé.

---

## Decision 3 — Graceful Degradation (Redis unavailable)

**Decision**: Try/catch systématique dans les helpers Redis. Si Redis est down → fallback vers la DB sans lever d'exception. Logger un `logger.warn()` (nouveau logger du 003).
**Rationale**: La spec FR-006 impose une dégradation gracieuse. L'utilisateur ne doit jamais voir une erreur due au cache. Redis est une optimisation, pas une source de vérité.
**Implémentation**: Fonctions helper `cacheGet<T>()` et `cacheSet()` dans `src/lib/redis.ts` qui absorbent les erreurs.

---

## Decision 4 — Invalidation du cache kiosk

**Decision**: Invalider `kiosk:catalogue` dans les actions admin qui modifient produits/variantes/stocks.
**Fichiers concernés**:
- `src/app/admin/catalogue/actions.ts` — création/modification produit
- `src/app/admin/catalogue/[id]/actions.ts` — si existant
- `src/app/admin/caisse/actions.ts` — `payOrder`, `approveReturn` (modifient les stocks)
**Rationale**: Invalidation event-driven garantit la cohérence sans attendre le TTL de 60s. Simple à implémenter : `redis.del("kiosk:catalogue")` après chaque mutation.

---

## Decision 5 — Invalidation du cache dashboard

**Decision**: Invalider `admin:dashboard:*` (toutes les clés dashboard) dans `payOrder` et actions qui modifient les commandes.
**Rationale**: Le dashboard affiche les ventes du jour/semaine — doit se mettre à jour quand une commande est payée. Pattern `redis.del()` après chaque `payOrder` succès.
**Alternatives considérées**: Invalidation basée sur TTL uniquement (5 min) — acceptable mais moins réactif.

---

## Decision 6 — Migration Rate Limiting vers Redis

**Decision**: Réécrire `src/services/rate-limit.service.ts` pour utiliser Redis avec `INCR` + `EXPIRE` au lieu de la table `rateLimits` en DB.
**Rationale**: Redis INCR est atomique → thread-safe multi-instances. Latence < 1ms vs 5-50ms pour une requête DB. Expiration automatique via TTL Redis → plus besoin de cron de nettoyage.
**Pattern**:
```
key = `ratelimit:${ip}:login`
count = redis.incr(key)
if count === 1: redis.expire(key, 900) // 15 min
if count > 5: block
```
**Alternatives considérées**: Conserver la DB pour rate limiting — non viable en multi-instances.

---

## Decision 7 — Sérialisation des données en cache

**Decision**: JSON.stringify/JSON.parse — simple et suffisant pour les types retournés par `getKioskData()` et `getDashboardStats()`.
**Rationale**: Les données sont déjà des objets JSON-sérialisables. Pas besoin de MessagePack ou autre format binaire pour ce volume.

---

## Decision 8 — Clés Redis et namespacing

**Decision**: Préfixe structuré par domaine : `kiosk:catalogue`, `admin:dashboard:{period}`, `ratelimit:{ip}:{action}`.
**Rationale**: Permet le scan/delete par pattern (ex: `admin:dashboard:*`). Évite les collisions entre fonctionnalités.

---

## Decision 9 — REDIS_URL dans l'environnement

**Decision**: Ajouter `REDIS_URL=redis://localhost:6379` dans `.env` et `.env.example`. Le Redis Docker est déjà configuré sur le port 6379.
**Rationale**: Redis est déjà dans `docker-compose.yml` (redis:7-alpine, port 6379). Il suffit d'ajouter la variable d'environnement et le package NPM.
