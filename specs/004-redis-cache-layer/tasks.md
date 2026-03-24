# Tasks: Cache Redis Layer

**Input**: Design documents from `/specs/004-redis-cache-layer/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Organization**: Tâches groupées par user story pour une implémentation et validation indépendantes.

---

## Phase 1: Setup (Fondation — Client Redis + Module)

**Purpose**: Installer ioredis et créer le module singleton — fondation partagée par toutes les user stories.

- [x] T001 Ajouter `ioredis` aux dépendances du projet en exécutant `npm install ioredis` dans `c:\Users\PC\Desktop\100-pc-IA`
- [x] T002 Ajouter `REDIS_URL=redis://localhost:6379` dans `.env` et `.env.example`
- [x] T003 Créer `src/lib/redis.ts` : client ioredis singleton (`new Redis(process.env.REDIS_URL)` avec `lazyConnect: true`, `enableOfflineQueue: false`, `reconnectOnError`), helpers exportés `cacheGet<T>(key): Promise<T|null>` (JSON.parse, try/catch → null), `cacheSet<T>(key, value, ttlSeconds): Promise<void>` (JSON.stringify, try/catch → no-op), `cacheDel(...keys): Promise<void>` (try/catch → no-op), `cacheIncr(key): Promise<number>` (try/catch → 0), `cacheExpire(key, ttlSeconds): Promise<void>` (try/catch → no-op), constantes exportées `CACHE_KEYS = { KIOSK_CATALOGUE: "kiosk:catalogue", DASHBOARD: (period: string) => \`admin:dashboard:${period}\`, DASHBOARD_ALL: ["today","yesterday","week","month","all"].map(p => \`admin:dashboard:${p}\`), RATE_LIMIT: (ip: string, action: string) => \`ratelimit:${ip}:${action}\` }`, `CACHE_TTL = { KIOSK_CATALOGUE: 60, DASHBOARD: 300, RATE_LIMIT: 900 }`

**Checkpoint**: `import { cacheGet, cacheSet, CACHE_KEYS } from "@/lib/redis"` fonctionne depuis n'importe quel fichier

---

## Phase 2: User Story 1 — Catalogue kiosk chargé instantanément (Priority: P1) 🎯 MVP

**Goal**: Le catalogue kiosk se charge en < 200ms au 2ème chargement grâce au cache Redis (TTL 60s). Invalidation immédiate quand un produit est modifié.

**Independent Test**: Vider le cache (`redis-cli DEL kiosk:catalogue`) → charger le kiosk → recharger → 2ème requête doit être servie depuis le cache.

### Implémentation User Story 1

- [x] T004 [US1] Modifier `src/app/kiosk/actions.ts` : dans `getKioskData()`, ajouter le pattern cache-aside au début : `const cached = await cacheGet(CACHE_KEYS.KIOSK_CATALOGUE); if (cached) return cached;` — après le fetch DB, ajouter `cacheSet(CACHE_KEYS.KIOSK_CATALOGUE, result, CACHE_TTL.KIOSK_CATALOGUE).catch(() => {});` avant le return
- [x] T005 [P] [US1] Modifier `src/app/admin/catalogue/actions.ts` : dans `createProductAction()` et toute action de modification produit (update, delete si existante), appeler `cacheDel(CACHE_KEYS.KIOSK_CATALOGUE)` après le succès de la mutation DB

**Checkpoint**: US1 testable — `redis-cli EXISTS kiosk:catalogue` → 1 après le 1er load, 0 après modification produit

---

## Phase 3: User Story 2 — Dashboard admin sans latence (Priority: P2)

**Goal**: Les stats du dashboard (`getDashboardStats(period)`) se chargent en < 500ms au 2ème appel. Cache invalidé quand une commande est payée.

**Independent Test**: Ouvrir `/admin/dashboard` deux fois → 2ème chargement < 500ms. Payer une commande → `redis-cli KEYS "admin:dashboard:*"` → 0 clé.

### Implémentation User Story 2

- [x] T006 [US2] Modifier `src/app/admin/dashboard/actions.ts` : dans `getDashboardStats(period)`, ajouter le pattern cache-aside — `const cacheKey = CACHE_KEYS.DASHBOARD(period); const cached = await cacheGet(cacheKey); if (cached) return cached;` — après les calculs, `cacheSet(cacheKey, result, CACHE_TTL.DASHBOARD).catch(() => {});`
- [x] T007 [US2] Modifier `src/app/admin/caisse/actions.ts` : dans `payOrder` (bloc succès, après mise à jour statut), appeler `cacheDel(...CACHE_KEYS.DASHBOARD_ALL, CACHE_KEYS.KIOSK_CATALOGUE)` pour invalider dashboard ET kiosk (stock change)
- [x] T008 [P] [US2] Modifier `src/app/admin/caisse/actions.ts` : dans `approveReturn` (bloc succès), appeler `cacheDel(...CACHE_KEYS.DASHBOARD_ALL, CACHE_KEYS.KIOSK_CATALOGUE)` (retour modifie les stocks et les stats financières)

**Checkpoint**: US2 testable — dashboard rapide au 2ème chargement, clés dashboard supprimées après paiement

---

## Phase 4: User Story 3 — Rate Limiting Distribué (Priority: P3)

**Goal**: Le rate limiting des connexions admin utilise Redis (INCR atomique) au lieu de la DB. Fonctionne correctement même avec plusieurs instances serveur.

**Independent Test**: 5 tentatives de connexion échouées → `redis-cli GET ratelimit:127.0.0.1:login` → `"5"` → 6ème tentative bloquée.

### Implémentation User Story 3

- [x] T009 [US3] Réécrire `src/services/rate-limit.service.ts` : remplacer les requêtes DB par Redis — `checkLimit(key)` → `cacheGet<number>(key)` (ou `redis.get(key)`) pour lire le compteur, retourner `{ blocked: count >= 5, remainingAttempts: Math.max(0, 5 - (count ?? 0)) }` ; `recordFailure(key)` → `cacheIncr(key)` puis si count === 1 → `cacheExpire(key, CACHE_TTL.RATE_LIMIT)` (pose le TTL uniquement au 1er incrément) ; `resetLimit(key)` → `cacheDel(key)`. Préserver l'API publique existante (interface inchangée pour les appelants).

**Checkpoint**: US3 testable — Redis contient les clés `ratelimit:*` lors des tentatives échouées, DB `rateLimits` n'est plus interrogée

---

## Phase 5: Polish & Validation

**Purpose**: Robustesse edge cases et validation finale

- [ ] T010 [P] Vérifier la dégradation gracieuse : arrêter Redis (`docker compose stop redis`) → charger le kiosk → doit fonctionner sans erreur 500 (fallback DB). Vérifier dans les logs serveur qu'il n'y a pas d'exception non catchée.
- [ ] T011 [P] Vérifier que les données sensibles sont absentes du cache : `redis-cli GET kiosk:catalogue` → inspecter JSON → confirmer absence de champs `codeValue`, `password`, `hashedPassword`
- [ ] T012 Valider les 7 scénarios du fichier `specs/004-redis-cache-layer/quickstart.md` manuellement

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1 — T001-T003)**: Aucune dépendance — BLOQUANT pour tout le reste
- **US1 (Phase 2)**: Dépend de T001-T003 ; T004 et T005 parallélisables entre eux
- **US2 (Phase 3)**: Dépend de T001-T003 ; T006 parallélisable avec T004/T005 ; T007 et T008 touchent le même fichier → séquentiels entre eux
- **US3 (Phase 4)**: Dépend de T001-T003 uniquement — complètement indépendant de US1 et US2
- **Polish (Phase 5)**: Dépend de toutes les phases précédentes

### Parallel Opportunities

- T004 [US1] + T006 [US2] + T009 [US3] : tous parallélisables dès T003 terminé (fichiers différents)
- T005 [US1] : parallélisable avec T004 (même feature, fichier différent)
- T007 + T008 touchent `caisse/actions.ts` → séquentiels
- T010 + T011 : parallélisables entre eux

---

## Implementation Strategy

### MVP (US1 — catalogue kiosk)
1. T001 → T002 → T003 — Setup Redis
2. T004 — Cache kiosk
3. T005 — Invalidation sur modification produit
4. **VALIDER** : kiosk rapide, invalidation fonctionnelle

### Livraison complète
1. Phase 1 → 2 → 3 → 4 → 5
2. US2 (dashboard) et US3 (rate limit) indépendants de US1

---

## Notes

- [P] = fichiers différents, pas de dépendances — exécutable en parallèle
- `ioredis` avec `enableOfflineQueue: false` → les commandes échouent immédiatement si Redis est down (pas de queue infinie) → permet la dégradation gracieuse dans les try/catch
- Les données sensibles (codes digitaux, mots de passe) ne passent pas dans le cache car `getKioskData()` les filtre déjà avant de retourner
- La table `rateLimits` en DB peut rester en place — elle ne sera simplement plus interrogée
