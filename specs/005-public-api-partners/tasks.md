# Tasks: API Publique Partenaires

**Input**: Design documents from `/specs/005-public-api-partners/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Organization**: Tâches groupées par user story pour une implémentation et validation indépendantes.

---

## Phase 1: Setup (DB Schema + Migration)

**Purpose**: Ajouter les tables en DB — fondation bloquante pour toutes les user stories.

- [x] T001 Modifier `src/db/schema.ts` : ajouter la table `partnerApiKeys` (`id` serial PK, `name` varchar(100) not null, `keyHash` varchar(64) not null unique, `permissions` varchar(20) not null default "READ", `isActive` boolean not null default true, `createdAt` timestamp defaultNow(), `lastUsedAt` timestamp, `callsThisMonth` integer default 0) et la table `apiLogs` (`id` serial PK, `apiKeyId` integer not null references partnerApiKeys.id, `endpoint` varchar(200) not null, `method` varchar(10) not null, `statusCode` integer not null, `responseTimeMs` integer, `createdAt` timestamp defaultNow()) — exporter les deux tables
- [x] T002 Exécuter `npm run db:push` depuis `c:\Users\PC\Desktop\100-pc-IA` pour appliquer le schema

**Checkpoint**: Tables `partner_api_keys` et `api_logs` créées en DB

---

## Phase 2: Fondation (Helper Auth — Bloquant pour toutes les routes)

**Purpose**: Centraliser l'authentification API key — partagé par les 4 routes v1.

- [x] T003 Créer `src/lib/api-auth.ts` : exporter la fonction `authenticateApiKey(request: NextRequest): Promise<{ apiKey: typeof partnerApiKeys.$inferSelect } | null>` — lit le header `X-API-Key`, calcule `sha256(key)`, recherche en DB avec `db.query.partnerApiKeys.findFirst({ where: and(eq(partnerApiKeys.keyHash, hash), eq(partnerApiKeys.isActive, true)) })`, met à jour `lastUsedAt` de manière fire-and-forget, retourne le record ou null si absent/inactif ; exporter `checkApiRateLimit(keyHash: string): Promise<boolean>` — utilise `cacheIncr(CACHE_KEYS.RATE_LIMIT(keyHash, "api"))` puis `cacheExpire` si count === 1 (TTL 60 secondes, seuil 100) — retourne true si bloqué ; exporter `logApiCall(apiKeyId: number, endpoint: string, method: string, statusCode: number, responseTimeMs: number): Promise<void>` — insert dans `apiLogs` en fire-and-forget (`.catch(() => {})`). Constante `API_RATE_LIMIT = 100`.

**Checkpoint**: `import { authenticateApiKey, checkApiRateLimit, logApiCall } from "@/lib/api-auth"` fonctionne

---

## Phase 3: User Story 1 — Récupérer le catalogue via API (Priority: P1) 🎯 MVP

**Goal**: Un partenaire avec une clé API valide peut appeler `GET /api/v1/products` et `GET /api/v1/products/{id}` pour obtenir le catalogue avec stocks.

**Independent Test**: `curl -H "X-API-Key: rbt_..." http://localhost:1556/api/v1/products` → JSON avec `data` array de produits actifs avec `id`, `name`, `category`, `minPrice`, `availableStock`, `variants`.

### Implémentation User Story 1

- [x] T004 [US1] Créer `src/app/api/v1/products/route.ts` : route GET publique (`export const dynamic = "force-dynamic"`), appeler `authenticateApiKey(request)` → si null retourner `Response.json({ error: "Unauthorized", details: "Invalid or revoked API key" }, { status: 401 })`, appeler `checkApiRateLimit(keyHash)` → si bloqué retourner `Response.json({ error: "Too Many Requests" }, { status: 429, headers: { "Retry-After": "60" } })`, lire `?category=` depuis `request.nextUrl.searchParams`, requête DB : `db.query.products.findMany({ where: eq(products.status, "ACTIVE"), with: { category: true, variants: true } })`, filtrer par catégorie si fournie, pour chaque produit calculer `minPrice` (min des `salePriceDzd` des variantes), `availableStock` (sum des codes DISPONIBLE + slots libres via sous-requêtes ou jointures), retourner `Response.json({ data: productDTOs, total: productDTOs.length })` — appeler `logApiCall()` fire-and-forget avec le statusCode
- [x] T005 [P] [US1] Créer `src/app/api/v1/products/[id]/route.ts` : même pattern auth + rate limit, chercher le produit par id avec `db.query.products.findFirst({ where: and(eq(products.id, id), eq(products.status, "ACTIVE")), with: { category: true, variants: true } })`, si non trouvé → 404 `{ error: "Not Found" }`, calculer stock par variante, retourner le ProductDTO (même format que la liste, sans tableau)

**Checkpoint**: US1 testable — `curl -H "X-API-Key: ..." http://localhost:1556/api/v1/products` retourne JSON valide, 401 sans clé

---

## Phase 4: User Story 2 — Passer une commande via API (Priority: P2)

**Goal**: Un partenaire READ_WRITE peut créer une commande via `POST /api/v1/orders` et obtenir les codes alloués. Il peut consulter le statut via `GET /api/v1/orders/{id}`.

**Independent Test**: `POST /api/v1/orders` avec `variantId` et `quantity` valides → HTTP 201 avec `orderId` + `items[0].codes` non vide.

### Implémentation User Story 2

- [x] T006 [US2] Créer `src/app/api/v1/orders/route.ts` : route POST, auth + rate limit, vérifier `apiKey.permissions === "READ_WRITE"` sinon 403 `{ error: "Forbidden", details: "This API key requires READ_WRITE permissions" }`, valider le body JSON avec Zod `z.object({ variantId: z.number().int().positive(), quantity: z.number().int().min(1).max(10), partnerReference: z.string().max(100).optional() })` → 400 si invalide, vérifier que la variante existe et est active, vérifier le stock disponible (codes DISPONIBLE ou slots libres ≥ quantity) → 422 `{ error: "Unprocessable Entity", details: "Stock insuffisant", availableStock: N }` si insuffisant, créer la commande en DB dans une transaction : insert `orders` (source: "API", status: "PAYE", totalAmount calculé, userId = null, notes = partnerReference), insert `orderItems`, appeler `allocateOrderStock()` depuis `src/lib/orders.ts` pour allouer les codes, retourner HTTP 201 avec `OrderResponseDTO` incluant les codes alloués — invalider le cache dashboard et kiosk avec `cacheDel()`
- [x] T007 [P] [US2] Créer `src/app/api/v1/orders/[id]/route.ts` : route GET, auth + rate limit, chercher la commande avec `db.query.orders.findFirst({ where: and(eq(orders.id, id), eq(orders.source, "API")), with: { items: { with: { digitalCodes: true } } } })`, vérifier que la commande appartient bien à ce partenaire (via apiKeyId stocké dans `notes` ou champ dédié — utiliser `orders.notes` pour stocker `apiKeyId:X` en JSON), si non trouvé ou pas à ce partenaire → 404, retourner `OrderResponseDTO` avec les codes alloués

**Checkpoint**: US2 testable — POST crée une commande, GET retourne le statut avec codes, 403 pour une clé READ

---

## Phase 5: User Story 3 — Gérer les clés API depuis l'admin (Priority: P3)

**Goal**: Un SUPER_ADMIN peut créer, lister et révoquer des clés API depuis `/admin/settings`.

**Independent Test**: Aller dans `/admin/settings` → créer une clé "Test Partner" → l'utiliser dans `curl -H "X-API-Key: ..." /api/v1/products` → succès → révoquer → même curl → 401.

### Implémentation User Story 3

- [x] T008 [US3] Modifier `src/app/admin/settings/actions.ts` : ajouter 3 actions protégées par `withAuth({ roles: [UserRole.SUPER_ADMIN] })` — `createApiKey({ name, permissions })` : générer `"rbt_" + crypto.randomBytes(32).toString("hex")`, calculer `keyHash = crypto.createHash("sha256").update(key).digest("hex")`, insérer dans `partnerApiKeys`, retourner `{ key, record }` (key affiché UNE SEULE FOIS) ; `revokeApiKey({ id })` : `db.update(partnerApiKeys).set({ isActive: false }).where(eq(partnerApiKeys.id, id))` ; `listApiKeys()` : `db.query.partnerApiKeys.findMany({ orderBy: [desc(partnerApiKeys.createdAt)] })` avec `keyPrefix` calculé (`key_hash.slice(0,8) + "..."`)
- [x] T009 [US3] Créer `src/app/admin/settings/ApiKeysSection.tsx` : Client Component (ajouté dans la page settings existante, visible SUPER_ADMIN only), props vides (charge via action), section avec : bouton "Créer une clé API" ouvrant un formulaire inline (champs: nom partenaire, permissions READ/READ_WRITE), table des clés existantes (colonnes: nom, permissions, statut badge vert/rouge, lastUsedAt, callsThisMonth, bouton Révoquer), modal/alerte affichant la clé générée UNE SEULE FOIS après création avec avertissement "Copiez cette clé maintenant, elle ne sera plus visible"
- [x] T010 [US3] Modifier la page settings existante pour intégrer `ApiKeysSection` : lire `src/app/admin/settings/page.tsx`, identifier où ajouter la section SUPER_ADMIN, importer et rendre `<ApiKeysSection />` conditionnellement si `user.role === "SUPER_ADMIN"`

**Checkpoint**: US3 testable — création/révocation depuis l'UI, clé fonctionnelle immédiatement après création

---

## Phase 6: Polish & Validation

**Purpose**: Robustesse et validation finale

- [ ] T011 [P] Vérifier que `GET /api/v1/products` ne retourne aucune donnée sensible : `purchasePrice`, codes numériques DISPONIBLE, `keyHash`, `supplierId` — inspecter manuellement la réponse JSON
- [ ] T012 [P] Vérifier que le rate limiting fonctionne : envoyer 105 requêtes → les 5 dernières doivent retourner 429 avec header `Retry-After: 60`
- [ ] T013 Valider les 11 scénarios du fichier `specs/005-public-api-partners/quickstart.md` manuellement

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1 — T001-T002)**: Aucune dépendance — BLOQUANT pour tout le reste
- **Fondation (Phase 2 — T003)**: Dépend de T001-T002 — BLOQUANT pour toutes les routes
- **US1 (Phase 3)**: Dépend de T003 ; T004 et T005 parallélisables (fichiers différents)
- **US2 (Phase 4)**: Dépend de T003 ; T006 et T007 parallélisables (fichiers différents) ; indépendant de US1
- **US3 (Phase 5)**: Dépend de T001-T002 uniquement ; T008 avant T009 (actions avant UI) ; T010 dépend de T009
- **Polish (Phase 6)**: Dépend de toutes les phases

### Parallel Opportunities

- T004 [US1] + T006 [US2] + T008 [US3] : tous parallélisables dès T003 terminé (fichiers différents)
- T005 [US1] parallélisable avec T004 (fichiers différents)
- T007 [US2] parallélisable avec T006 (fichiers différents)
- T011 + T012 : parallélisables entre eux

---

## Implementation Strategy

### MVP (US1 — catalogue via API)
1. T001 → T002 → T003 — Setup DB + auth helper
2. T004 — GET /api/v1/products
3. T005 — GET /api/v1/products/{id}
4. **VALIDER** : curl avec clé créée manuellement en DB fonctionne

### Livraison complète
1. Phase 1 → 2 → 3 (MVP) → 4 (commandes) → 5 (UI admin) → 6 (polish)
2. US3 peut être développée en parallèle de US1/US2 dès T001-T002 terminés

---

## Notes

- [P] = fichiers différents, pas de dépendances — exécutable en parallèle
- La clé API est affichée UNE SEULE FOIS — jamais stockée en clair — implémenter l'avertissement UI clairement
- `allocateOrderStock()` de `src/lib/orders.ts` est déjà testée et gère les codes digitaux et slots — réutiliser sans modification
- Pour tester sans UI admin (MVP) : créer une clé manuellement avec `INSERT INTO partner_api_keys (name, key_hash, permissions) VALUES ('Test', sha256('rbt_test'), 'READ_WRITE')`
- `orders.source` a déjà `API` comme valeur valide dans l'enum `OrderSource` — pas de modification nécessaire
