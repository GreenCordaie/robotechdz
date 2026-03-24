# Feature Specification: API Publique Partenaires

**Feature Branch**: `005-public-api-partners`
**Created**: 2026-03-23
**Status**: Draft

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Récupérer le catalogue via API (Priority: P1)

Un partenaire externe (revendeur, application tierce) peut interroger l'API publique pour obtenir la liste des produits disponibles avec leurs prix et stocks, afin d'afficher le catalogue dans sa propre interface.

**Why this priority**: C'est la donnée la plus demandée par les partenaires. Sans accès au catalogue, aucune intégration n'est possible. C'est le point d'entrée de toute la feature.

**Independent Test**: Appeler `GET /api/v1/products` avec une clé API valide → recevoir la liste des produits avec nom, prix, stock disponible et catégorie.

**Acceptance Scenarios**:

1. **Given** un partenaire avec une clé API valide, **When** il appelle `GET /api/v1/products`, **Then** il reçoit la liste complète des produits actifs avec : id, name, category, minPrice, availableStock, description.
2. **Given** un partenaire avec une clé API valide, **When** il appelle `GET /api/v1/products?category=Gaming`, **Then** seuls les produits de la catégorie demandée sont retournés.
3. **Given** une requête sans clé API ou avec une clé invalide, **When** l'appel est effectué, **Then** l'API retourne une erreur 401 avec message explicatif.
4. **Given** un partenaire avec clé valide, **When** il appelle `GET /api/v1/products/{id}`, **Then** il reçoit le détail d'un produit avec ses variantes et prix.

---

### User Story 2 — Passer une commande via API (Priority: P2)

Un partenaire peut créer une commande pour un client final directement via l'API, sans passer par le kiosk ou l'admin panel. Le système alloue les codes digitaux et renvoie les données de livraison.

**Why this priority**: Permet aux revendeurs d'automatiser leurs ventes. Sans cette fonctionnalité, l'API est en lecture seule et n'apporte qu'une valeur limitée.

**Independent Test**: Appeler `POST /api/v1/orders` avec un produit valide et une quantité → recevoir un orderId + les codes alloués dans la réponse.

**Acceptance Scenarios**:

1. **Given** un partenaire avec clé API valide et stock disponible, **When** il crée une commande (`POST /api/v1/orders`), **Then** la commande est créée, le stock est alloué, et la réponse contient : orderId, status, items avec codes digitaux délivrés.
2. **Given** une commande avec stock insuffisant, **When** le partenaire soumet la commande, **Then** l'API retourne une erreur 422 avec le message "Stock insuffisant" et la quantité disponible.
3. **Given** une commande créée avec succès, **When** le partenaire appelle `GET /api/v1/orders/{id}`, **Then** il peut consulter le statut et les détails de la commande.

---

### User Story 3 — Gérer les clés API depuis l'admin (Priority: P3)

Un SUPER_ADMIN peut créer, révoquer et lister les clés API partenaires depuis le panel admin, avec un nom de partenaire et des permissions configurables (lecture seule vs lecture+écriture).

**Why this priority**: Nécessaire pour contrôler l'accès et désactiver un partenaire compromis sans toucher au code. Mais le reste de la feature peut fonctionner avec des clés créées manuellement en DB.

**Independent Test**: Aller dans `/admin/settings` → créer une nouvelle clé API → copier la clé → l'utiliser dans un appel API → vérifier qu'elle fonctionne.

**Acceptance Scenarios**:

1. **Given** un SUPER_ADMIN dans `/admin/settings`, **When** il crée une clé API avec un nom de partenaire, **Then** une clé unique est générée et affichée une seule fois (non récupérable ensuite).
2. **Given** une clé API active, **When** le SUPER_ADMIN la révoque, **Then** tous les appels ultérieurs avec cette clé retournent 401 immédiatement.
3. **Given** la liste des clés API, **When** l'admin la consulte, **Then** chaque clé affiche : nom partenaire, date de création, dernière utilisation, statut (active/révoquée), nombre d'appels du mois.

---

### Edge Cases

- Que se passe-t-il si un partenaire envoie trop de requêtes ? → Rate limiting à 100 req/min par clé API — réponse 429 avec header `Retry-After`.
- Que se passe-t-il si un produit est désactivé entre la consultation du catalogue et la commande ? → Erreur 422 "Produit non disponible" lors de la commande.
- Que se passe-t-il si la clé API est transmise dans les logs par erreur ? → Les clés sont stockées hashées en DB — seul le hash est visible, jamais la clé originale.
- Que se passe-t-il si l'API reçoit un payload malformé ? → Validation stricte des entrées — erreur 400 avec détail des champs invalides.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: L'API DOIT exposer un endpoint `GET /api/v1/products` retournant les produits actifs avec stock disponible, filtrable par catégorie.
- **FR-002**: L'API DOIT exposer un endpoint `GET /api/v1/products/{id}` retournant le détail d'un produit avec ses variantes.
- **FR-003**: L'API DOIT exposer un endpoint `POST /api/v1/orders` permettant de créer une commande et d'obtenir les codes digitaux alloués en réponse.
- **FR-004**: L'API DOIT exposer un endpoint `GET /api/v1/orders/{id}` permettant de consulter le statut d'une commande.
- **FR-005**: Chaque requête API DOIT être authentifiée via une clé API transmise dans le header `X-API-Key`.
- **FR-006**: Les clés API invalides ou révoquées DOIVENT retourner une erreur 401 immédiatement.
- **FR-007**: Le système DOIT appliquer un rate limiting de 100 requêtes par minute par clé API — dépassement → réponse 429.
- **FR-008**: Un SUPER_ADMIN DOIT pouvoir créer, lister et révoquer des clés API depuis l'interface admin.
- **FR-009**: Les clés API DOIVENT être stockées de manière sécurisée (hashées) — la valeur en clair n'est affichée qu'une seule fois à la création.
- **FR-010**: Chaque appel API DOIT être journalisé avec : clé (référence), endpoint, timestamp, statut HTTP, temps de réponse.
- **FR-011**: Les données sensibles (codes digitaux non alloués, mots de passe) NE DOIVENT PAS apparaître dans les réponses API.
- **FR-012**: L'API DOIT retourner des erreurs structurées au format JSON avec un champ `error` et un champ `details`.

### Key Entities

- **ApiKey** : id, name (partenaire), keyHash, permissions (READ / READ_WRITE), isActive, createdAt, lastUsedAt, callsThisMonth — stockée hashée.
- **ApiLog** : id, apiKeyId, endpoint, method, statusCode, responseTimeMs, timestamp — pour audit et analytics.
- **ProductDTO** : id, name, category, description, minPrice, availableStock — version publique sans données internes.
- **OrderRequest** : productId, variantId, quantity, partnerReference (optionnel) — payload de création de commande.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un partenaire peut intégrer l'API et afficher le catalogue dans son application en moins d'une journée de développement (documentation claire + réponses prévisibles).
- **SC-002**: L'API répond en moins de 500ms pour toutes les requêtes GET (catalogue, détail produit, statut commande) en charge normale.
- **SC-003**: 100% des appels non authentifiés sont rejetés avec une erreur 401 — aucun accès aux données sans clé valide.
- **SC-004**: Le rate limiting bloque les abus (> 100 req/min) sans affecter les partenaires en usage normal.
- **SC-005**: Un admin peut révoquer une clé compromise en moins de 30 secondes depuis l'interface.
- **SC-006**: Zéro donnée sensible (codes non alloués, hash de mots de passe) exposée dans les réponses API.

## Assumptions

- Les partenaires sont des revendeurs ou applications tierces de confiance — pas d'API publique ouverte sans inscription préalable.
- Les commandes via API suivent le même workflow que les commandes kiosk (allocation stock, audit log, notification Telegram).
- Le versioning d'API (`/v1/`) permet des évolutions futures sans casser les intégrations existantes.
- La documentation de l'API (OpenAPI/Swagger) sera générée automatiquement depuis les contrats de routes.
- Les clés API n'ont pas de date d'expiration par défaut — révocation manuelle uniquement.
- Pas d'OAuth2 pour cette version — simple clé API dans le header suffit pour les besoins actuels.
