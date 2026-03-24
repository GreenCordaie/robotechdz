# Feature Specification: Cache Redis

**Feature Branch**: `004-redis-cache-layer`
**Created**: 2026-03-23
**Status**: Draft

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Catalogue kiosk chargé instantanément (Priority: P1)

Le catalogue produits de la borne kiosk se charge en moins d'une seconde, même lors des heures de pointe, grâce à une mise en cache des données produits/catégories.

**Why this priority**: Le catalogue est la donnée la plus consultée (chaque session kiosk). Actuellement chaque affichage déclenche une requête DB complexe avec stocks en temps réel.

**Independent Test**: Charger le kiosk deux fois → la 2ème requête doit être 5x plus rapide que la 1ère (servie depuis le cache).

**Acceptance Scenarios**:

1. **Given** le cache est froid, **When** le kiosk charge le catalogue, **Then** les données sont récupérées depuis la DB et mises en cache pour 60 secondes.
2. **Given** le cache est chaud, **When** le kiosk charge le catalogue, **Then** les données sont servies depuis le cache sans toucher la DB.
3. **Given** un produit est modifié par l'admin, **When** la modification est sauvegardée, **Then** le cache catalogue est invalidé immédiatement.

---

### User Story 2 — Dashboard admin sans latence (Priority: P2)

Les statistiques du dashboard admin (ventes du jour, top produits, revenus) se chargent instantanément plutôt qu'en 2-3 secondes actuellement.

**Why this priority**: Les admins consultent le dashboard plusieurs fois par jour. Les requêtes analytiques sont coûteuses (agrégations sur toutes les commandes).

**Independent Test**: Ouvrir le dashboard → noter le temps de chargement → rouvrir → 2ème chargement doit être < 500ms.

**Acceptance Scenarios**:

1. **Given** les stats du dashboard sont en cache (TTL 5 minutes), **When** l'admin ouvre le dashboard, **Then** les données s'affichent en moins de 500ms.
2. **Given** une nouvelle commande est payée, **When** le paiement est confirmé, **Then** le cache dashboard est invalidé pour que les stats restent à jour.

---

### User Story 3 — Rate limiting distribué (Priority: P3)

Le rate limiting des tentatives de connexion admin fonctionne correctement même avec plusieurs instances du serveur (actuellement stocké en DB, lent et non partagé entre instances).

**Why this priority**: Avec plusieurs instances (load balancing), le rate limiting actuel en DB peut être contourné en frappant des instances différentes.

**Independent Test**: Simuler 10 tentatives de connexion échouées depuis la même IP → la 6ème doit être bloquée quel que soit le serveur qui répond.

**Acceptance Scenarios**:

1. **Given** 5 tentatives de connexion échouées depuis une IP, **When** la 6ème tentative arrive, **Then** elle est bloquée immédiatement (TTL 15 minutes) sur toutes les instances.
2. **Given** le TTL expire, **When** l'utilisateur retente, **Then** le compteur est remis à zéro.

---

### Edge Cases

- Que se passe-t-il si Redis est inaccessible ? → Fallback transparent vers la DB sans erreur visible pour l'utilisateur. Log d'avertissement.
- Que se passe-t-il si le cache contient des données obsolètes (bug d'invalidation) ? → TTL maximum de 5 minutes garantit une fraîcheur acceptable même sans invalidation.
- Que se passe-t-il si la mémoire Redis est saturée ? → Politique d'éviction LRU — les données les moins récentes sont supprimées en premier.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le système DOIT mettre en cache le résultat de `getKioskData()` (catalogue + stock) avec un TTL de 60 secondes.
- **FR-002**: Le cache catalogue DOIT être invalidé immédiatement quand un produit, une variante ou un stock est modifié dans l'admin.
- **FR-003**: Le système DOIT mettre en cache les statistiques du dashboard admin avec un TTL de 5 minutes.
- **FR-004**: Le cache dashboard DOIT être invalidé quand une commande est payée ou annulée.
- **FR-005**: Le rate limiting des connexions DOIT utiliser le cache au lieu de la base de données pour la lecture/écriture des compteurs.
- **FR-006**: En cas d'indisponibilité du cache, le système DOIT basculer automatiquement sur la base de données sans erreur visible (dégradation gracieuse).
- **FR-007**: Le cache DOIT être accessible en lecture/écriture en moins de 5ms (réseau local).
- **FR-008**: Les données sensibles (codes digitaux, mots de passe) NE DOIVENT JAMAIS être mises en cache.

### Key Entities

- **CacheKey** : convention de nommage — `kiosk:catalogue`, `admin:dashboard:overview`, `ratelimit:{ip}:{action}`.
- **TTL par type** : catalogue kiosk = 60s, dashboard stats = 300s, rate limit = 900s (15 min).
- **Invalidation triggers** : modification produit/variante → invalide `kiosk:catalogue` ; commande payée → invalide `admin:dashboard:*`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Le chargement du catalogue kiosk passe de > 1 seconde à < 200ms (cache chaud).
- **SC-002**: Le chargement du dashboard admin passe de 2-3 secondes à < 500ms (cache chaud).
- **SC-003**: En cas de panne du cache, 100% des requêtes continuent de fonctionner via la DB (dégradation gracieuse).
- **SC-004**: Le rate limiting bloque correctement les attaques brute-force même avec 2+ instances serveur actives.
- **SC-005**: Zéro donnée sensible (codes, mots de passe) dans le cache — vérifiable par inspection des clés.

## Assumptions

- Redis est déjà disponible dans l'environnement Docker du projet (docker-compose.yml).
- Le cache est utilisé uniquement pour les lectures fréquentes — jamais comme source de vérité pour les transactions.
- L'invalidation est manuelle (event-driven) plutôt qu'automatique — l'admin déclenche l'invalidation lors des modifications.
- Les sessions utilisateur restent dans les cookies JWT existants — pas de session Redis.
- Une seule instance Redis suffit pour la charge actuelle (pas de Redis Cluster nécessaire).
