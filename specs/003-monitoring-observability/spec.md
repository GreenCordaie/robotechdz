# Feature Specification: Monitoring & Observabilité

**Feature Branch**: `003-monitoring-observability`
**Created**: 2026-03-23
**Status**: Draft

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Détecter une erreur critique automatiquement (Priority: P1)

Quand une erreur critique survient en production (paiement échoué, allocation stock ratée, crash serveur), l'équipe admin est alertée immédiatement via Telegram sans attendre un signalement utilisateur.

**Why this priority**: Les erreurs silencieuses en prod coûtent des ventes et de la confiance client. L'alerte automatique réduit le temps de réaction de heures à secondes.

**Independent Test**: Déclencher manuellement une erreur critique → vérifier qu'une notification Telegram arrive dans les 30 secondes avec contexte (page, action, utilisateur).

**Acceptance Scenarios**:

1. **Given** une erreur non gérée survient côté serveur, **When** l'erreur est capturée, **Then** une notification Telegram est envoyée au canal admin avec : type d'erreur, page/action concernée, userId si disponible, timestamp.
2. **Given** une erreur non critique (warning), **When** elle est capturée, **Then** elle est enregistrée en log structuré mais n'envoie PAS de Telegram.
3. **Given** une erreur se répète plus de 5 fois en 10 minutes, **When** le seuil est atteint, **Then** une seule alerte groupée est envoyée (pas de spam Telegram).

---

### User Story 2 — Consulter le statut des services en temps réel (Priority: P2)

Un admin peut ouvrir `/admin/monitoring` et voir en un coup d'œil si tous les services sont opérationnels : base de données, WhatsApp, Telegram, service d'impression.

**Why this priority**: Quand quelque chose ne marche pas, l'admin doit savoir immédiatement quel service est en cause sans creuser dans des logs.

**Independent Test**: Ouvrir `/admin/monitoring` → vérifier que chaque service affiche un badge vert/rouge → couper un service → rafraîchir → badge passe au rouge.

**Acceptance Scenarios**:

1. **Given** tous les services fonctionnent, **When** l'admin ouvre `/admin/monitoring`, **Then** chaque service affiche un badge vert "Opérationnel" avec temps de réponse.
2. **Given** un service est inaccessible, **When** la page se charge, **Then** le service affiche un badge rouge "Hors ligne" avec la dernière heure de disponibilité connue.
3. **Given** la page `/admin/monitoring`, **When** elle s'affiche, **Then** elle montre aussi : uptime depuis dernier démarrage, compteur d'erreurs des dernières 24h par niveau (info/warn/error).

---

### User Story 3 — Consulter les logs structurés (Priority: P3)

Un admin peut voir les derniers logs de l'application (50 entrées max) filtrés par niveau (info/warn/error) depuis `/admin/monitoring`, sans accès SSH au serveur.

**Why this priority**: Diagnostiquer un problème sans accès serveur est crucial pour les non-développeurs.

**Independent Test**: Provoquer une action (paiement, retour) → aller dans `/admin/monitoring` → voir l'entrée de log correspondante avec userId, action, timestamp.

**Acceptance Scenarios**:

1. **Given** des actions ont eu lieu, **When** l'admin consulte les logs, **Then** chaque entrée affiche : niveau (🔴 error / 🟡 warn / 🟢 info), timestamp, message, contexte (userId, action).
2. **Given** l'admin filtre par niveau "error", **When** le filtre est appliqué, **Then** seules les erreurs s'affichent.

---

### Edge Cases

- Que se passe-t-il si Telegram lui-même est en panne pour envoyer les alertes ? → Logger l'échec localement, ne pas créer de boucle infinie.
- Que se passe-t-il si les logs sont trop volumineux ? → Conserver uniquement les 1000 dernières entrées en mémoire/fichier, rotation automatique.
- Que se passe-t-il si le health check ralentit l'app ? → Timeout de 3 secondes par service, vérifications en parallèle.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le système DOIT capturer automatiquement toutes les erreurs non gérées (serveur et client) avec contexte : message, stack trace tronquée, userId, page/route, timestamp.
- **FR-002**: Les erreurs de niveau "critical" (paiement échoué, allocation stock ratée) DOIVENT déclencher une notification Telegram immédiate au canal admin.
- **FR-003**: Un mécanisme anti-spam DOIT regrouper les erreurs identiques répétées (même message, même route) en une seule alerte toutes les 10 minutes.
- **FR-004**: Le système DOIT exposer un endpoint public `/api/health` retournant le statut de : base de données, WhatsApp API, Telegram Bot, service d'impression — avec temps de réponse de chacun.
- **FR-005**: La page `/admin/monitoring` DOIT afficher : statut en temps réel de chaque service (vert/rouge), uptime, compteur d'erreurs 24h.
- **FR-006**: La page `/admin/monitoring` DOIT afficher les 50 derniers logs avec filtrage par niveau (info/warn/error).
- **FR-007**: Tous les logs DOIVENT être structurés avec les champs : level, timestamp, message, userId (optionnel), action (optionnel), metadata (optionnel).
- **FR-008**: La page `/admin/monitoring` DOIT être accessible uniquement aux rôles ADMIN et SUPER_ADMIN.
- **FR-009**: Le endpoint `/api/health` DOIT répondre en moins de 5 secondes même si un service externe est lent (timeout par service).

### Key Entities

- **LogEntry** : id, level (info/warn/error/critical), message, userId?, action?, metadata (JSON), timestamp — stocké en mémoire circulaire (1000 entrées max) ou fichier rotatif.
- **ServiceStatus** : name, isUp (boolean), responseTimeMs, lastChecked, lastUpAt — calculé à la volée par `/api/health`.
- **AlertThrottle** : errorKey (hash message+route), count, firstSeenAt, lastAlertSentAt — pour anti-spam Telegram.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Une erreur critique est détectée et notifiée via Telegram en moins de 30 secondes après son occurrence.
- **SC-002**: Le endpoint `/api/health` répond en moins de 5 secondes dans tous les cas (services lents ou hors ligne inclus).
- **SC-003**: 100% des erreurs non gérées sont capturées — aucune erreur silencieuse en production.
- **SC-004**: L'admin peut diagnostiquer l'origine d'un problème depuis `/admin/monitoring` en moins de 2 minutes sans accès SSH.
- **SC-005**: Le système de logs ne dégrade pas les performances de l'application (ajout < 5ms par requête).

## Assumptions

- Les logs sont stockés en mémoire (tableau circulaire) avec persistance légère dans un fichier JSON — pas de base de données dédiée pour éviter les dépendances supplémentaires.
- Sentry peut être utilisé en tier gratuit pour l'error tracking côté client (browser) ; le tracking serveur est custom via le logger interne.
- Le canal Telegram pour les alertes monitoring est le même que celui des admins déjà configuré dans `shopSettings`.
- L'uptime est calculé depuis le dernier démarrage du processus Node.js (`process.uptime()`).
- Les health checks des services externes utilisent des appels légers (ping/status) — pas de vraies transactions.
