# Data Model: Cache Redis Layer

**Feature**: 004-redis-cache-layer
**Date**: 2026-03-23

---

## Pas de migration DB

Ce feature n'ajoute aucune table ni colonne en base de données. Toutes les données sont stockées en mémoire Redis avec expiration automatique.

---

## Clés Redis (Cache Key Schema)

### kiosk:catalogue

**Type Redis**: String (JSON sérialisé)
**TTL**: 60 secondes
**Contenu**: Retour complet de `getKioskData()` — array de produits avec catégories, variantes, stocks disponibles
**Invalidé par**: Toute modification produit/variante/stock dans l'admin

```typescript
type KioskCacheData = Awaited<ReturnType<typeof getKioskData>>;
// Stored as: JSON.stringify(KioskCacheData)
// Key: "kiosk:catalogue"
```

---

### admin:dashboard:{period}

**Type Redis**: String (JSON sérialisé)
**TTL**: 300 secondes (5 minutes)
**Contenu**: Stats dashboard pour une période donnée (`today`, `yesterday`, `week`, `month`, `all`)
**Invalidé par**: `payOrder()`, `approveReturn()`, annulation commande

```typescript
// Keys: "admin:dashboard:today", "admin:dashboard:week", etc.
// Pattern delete: redis.del("admin:dashboard:today", "admin:dashboard:week", ...)
```

---

### ratelimit:{ip}:{action}

**Type Redis**: String (compteur entier)
**TTL**: 900 secondes (15 minutes) — posé sur le premier `INCR`
**Contenu**: Nombre de tentatives depuis cette IP pour cette action
**Resetté par**: TTL automatique Redis

```typescript
// Key: "ratelimit:192.168.1.1:login"
// Value: "3" (string — Redis INCR retourne un entier)
```

---

## Interface TypeScript (src/lib/redis.ts)

```typescript
// Types internes au module
type CacheKey = string;
type TTLSeconds = number;

// Helpers exportés
export function cacheGet<T>(key: CacheKey): Promise<T | null>;
export function cacheSet<T>(key: CacheKey, value: T, ttl: TTLSeconds): Promise<void>;
export function cacheDel(...keys: CacheKey[]): Promise<void>;
export function cacheIncr(key: CacheKey): Promise<number>;
export function cacheExpire(key: CacheKey, ttl: TTLSeconds): Promise<void>;
export function isRedisAvailable(): boolean;
```

---

## Constantes de cache (src/lib/redis.ts)

```typescript
export const CACHE_KEYS = {
    KIOSK_CATALOGUE: "kiosk:catalogue",
    DASHBOARD: (period: string) => `admin:dashboard:${period}`,
    DASHBOARD_ALL_PERIODS: ["today", "yesterday", "week", "month", "all"].map(p => `admin:dashboard:${p}`),
    RATE_LIMIT: (ip: string, action: string) => `ratelimit:${ip}:${action}`,
} as const;

export const CACHE_TTL = {
    KIOSK_CATALOGUE: 60,         // 60 secondes
    DASHBOARD: 300,               // 5 minutes
    RATE_LIMIT: 900,              // 15 minutes
} as const;
```
