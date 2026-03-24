# Research: API Publique Partenaires

**Feature**: 005-public-api-partners
**Date**: 2026-03-23

---

## Decision 1 — Authentification : X-API-Key header

**Decision**: Header `X-API-Key` (clé en clair dans le header, stockée hashée en DB)
**Rationale**: La spec FR-005 l'impose. Déjà utilisé dans le projet pour le webhook WhatsApp (`x-api-key`). Pattern universel et simple pour les partenaires. Vérification timing-safe avec `crypto.timingSafeEqual()` — pattern déjà établi dans `src/lib/webhook-security.ts` et `src/app/api/print-queue/route.ts`.
**Alternatives considérées**: Bearer token (`Authorization: Bearer ...`) — utilisé pour le cron, pas adapté aux partenaires externes. OAuth2 — trop complexe pour la v1 (spec l'exclut explicitement).

---

## Decision 2 — Hachage des clés API : SHA-256

**Decision**: `crypto.createHash("sha256").update(apiKey).digest("hex")` — stockage du hash uniquement en DB
**Rationale**: Simple, sans sel nécessaire (clés aléatoires de 32 bytes = entropie suffisante). Vérification rapide : hasher la clé reçue → comparer avec le hash en DB. La clé originale n'est jamais stockée.
**Alternatives considérées**: bcrypt — trop lent (500ms+) pour vérifier chaque requête API. argon2 — même problème de latence.

---

## Decision 3 — Génération des clés : crypto.randomBytes(32)

**Decision**: `"rbt_" + crypto.randomBytes(32).toString("hex")` — préfixe `rbt_` (Robotech) + 64 chars hex = clé de 68 chars
**Rationale**: Entropie élevée (256 bits), préfixe identifiable pour éviter les confusions avec d'autres secrets. Impossible à deviner ou brute-forcer.

---

## Decision 4 — Nouvelle table DB : `partnerApiKeys`

**Decision**: Créer une table `partner_api_keys` avec migration `npm run db:push`
**Champs**: `id`, `name` (nom partenaire), `keyHash` (sha256 unique), `permissions` enum READ|READ_WRITE, `isActive`, `createdAt`, `lastUsedAt`, `callsThisMonth`
**Rationale**: Aucune table existante ne convient. La table `resellers` est liée au système de revendeurs de l'app, pas aux partenaires API. Isolation propre.
**Alternatives considérées**: Réutiliser la table `resellers` — couplage non souhaité, logique différente.

---

## Decision 5 — Table de logs API : `apiLogs`

**Decision**: Créer une table `api_logs` légère : `id`, `apiKeyId`, `endpoint`, `method`, `statusCode`, `responseTimeMs`, `createdAt`
**Rationale**: FR-010 impose la journalisation de chaque appel. Utilisée pour l'analytics (callsThisMonth) et l'audit.
**Optimisation**: Pas de JSONB payload — uniquement les métadonnées de la requête (pas de données sensibles).

---

## Decision 6 — Rate Limiting : RateLimitService Redis (004)

**Decision**: Utiliser `RateLimitService` déjà migré vers Redis (004-redis-cache-layer) avec la clé `api:{keyHash}:minute`
**Seuil**: 100 req/min par clé API (spec FR-007). Réponse 429 avec header `Retry-After: 60`.
**Rationale**: Infrastructure de rate limiting déjà en place et distribuée. Pas de duplication.

---

## Decision 7 — Structure des routes : `/api/v1/`

**Decision**: Créer les routes dans `src/app/api/v1/` (App Router Next.js)
- `src/app/api/v1/products/route.ts` — GET liste produits
- `src/app/api/v1/products/[id]/route.ts` — GET détail produit
- `src/app/api/v1/orders/route.ts` — POST créer commande
- `src/app/api/v1/orders/[id]/route.ts` — GET statut commande
**Rationale**: Préfixe `/v1/` pour permettre des évolutions futures. Structure conventionnelle App Router.

---

## Decision 8 — Middleware d'authentification API : helper interne

**Decision**: Créer `src/lib/api-auth.ts` — helper `authenticateApiKey(request)` réutilisable par toutes les routes v1
**Fonctionnement**: Lit `X-API-Key` → sha256 → lookup en DB → vérifie isActive → met à jour lastUsedAt → retourne le record ApiKey ou null
**Rationale**: Évite la duplication dans chaque route. Pattern identique à `verifyWebhookSignature()` de `webhook-security.ts`.

---

## Decision 9 — Données exposées (ProductDTO)

**Decision**: Filtrage strict dans les routes — ne jamais exposer : `keyHash`, `purchasePrice`, `supplierId`, codes numériques non alloués
**Rationale**: FR-011 — les codes digitaux en DB (status DISPONIBLE) ne doivent JAMAIS apparaître dans les réponses API. Seuls les codes alloués à une commande sont retournés dans `POST /api/v1/orders`.

---

## Decision 10 — Interface admin : section dans `/admin/settings`

**Decision**: Ajouter une section "Clés API Partenaires" dans la page settings existante pour les SUPER_ADMIN
**Rationale**: US3 scope limité — pas besoin d'une page dédiée. La page settings est déjà SUPER_ADMIN only. Évite la création d'une route admin supplémentaire.
**Alternatives considérées**: Page `/admin/api-keys` dédiée — overkill pour la v1.

---

## Decision 11 — OrderSource.API déjà disponible

**Decision**: Utiliser `OrderSource.API` dans l'enum `OrderSource` de `src/lib/constants.ts` — déjà défini
**Rationale**: L'enum `OrderSource` contient déjà `KIOSK`, `B2B_WEB`, `API`. Zéro modification nécessaire pour le tracking de l'origine des commandes.
