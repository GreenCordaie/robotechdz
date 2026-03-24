# Module Contract: src/lib/redis.ts

**Feature**: 004-redis-cache-layer

---

## Public API

```typescript
import { redis, cacheGet, cacheSet, cacheDel, cacheIncr, cacheExpire, CACHE_KEYS, CACHE_TTL } from "@/lib/redis";

// Lire depuis le cache (retourne null si absent ou Redis down)
const data = await cacheGet<KioskData>("kiosk:catalogue");

// Écrire dans le cache avec TTL
await cacheSet("kiosk:catalogue", kioskData, CACHE_TTL.KIOSK_CATALOGUE);

// Supprimer des clés (invalidation)
await cacheDel("kiosk:catalogue");
await cacheDel(...CACHE_KEYS.DASHBOARD_ALL_PERIODS);

// Rate limiting
const count = await cacheIncr(CACHE_KEYS.RATE_LIMIT("192.168.1.1", "login"));
if (count === 1) await cacheExpire(CACHE_KEYS.RATE_LIMIT("192.168.1.1", "login"), CACHE_TTL.RATE_LIMIT);
```

---

## Graceful Degradation Contract

Toutes les fonctions helpers (`cacheGet`, `cacheSet`, `cacheDel`) DOIVENT :
1. Absorber toute exception Redis (connexion perdue, timeout, etc.)
2. Retourner `null` (pour `cacheGet`) ou ne rien faire (pour `cacheSet`/`cacheDel`) si Redis est indisponible
3. Logger un `logger.warn()` sur la première erreur (pas de spam)
4. NE PAS lever d'exception vers l'appelant

```typescript
// Exemple d'implémentation
export async function cacheGet<T>(key: string): Promise<T | null> {
    try {
        const value = await redis.get(key);
        if (!value) return null;
        return JSON.parse(value) as T;
    } catch {
        // Redis down — dégradation gracieuse silencieuse
        return null;
    }
}
```

---

## Pattern Cache-Aside (utilisé partout)

```typescript
// 1. Essayer le cache
const cached = await cacheGet<ReturnType<typeof getKioskData>>(CACHE_KEYS.KIOSK_CATALOGUE);
if (cached) return cached;

// 2. Cache miss → DB
const fresh = await fetchFromDB();

// 3. Stocker en cache (fire-and-forget, ne pas bloquer)
cacheSet(CACHE_KEYS.KIOSK_CATALOGUE, fresh, CACHE_TTL.KIOSK_CATALOGUE).catch(() => {});

return fresh;
```

---

## Rate Limiting Contract

```typescript
// src/services/rate-limit.service.ts — API publique inchangée
class RateLimitService {
    async checkLimit(key: string): Promise<{ blocked: boolean; remainingAttempts: number }>;
    async recordFailure(key: string): Promise<void>;
    async resetLimit(key: string): Promise<void>;
}
```

L'implémentation interne passe de la DB à Redis, mais l'API publique reste identique pour ne pas casser les appelants existants.
