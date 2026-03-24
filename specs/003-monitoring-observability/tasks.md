# Tasks: Monitoring & Observabilité

**Input**: Design documents from `/specs/003-monitoring-observability/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Organization**: Tâches groupées par user story pour une implémentation et validation indépendantes.

---

## Phase 1: Setup (Fondation — Logger Singleton)

**Purpose**: Le logger est la fondation partagée par toutes les user stories — doit être créé en premier.

- [x] T001 Créer le module singleton `src/lib/logger.ts` : types exportés `LogLevel = "info"|"warn"|"error"|"critical"` et `LogEntry = { id, level, timestamp, message, userId?, action?, metadata? }` ; tableau circulaire `logBuffer: LogEntry[]` (max 1000) ; map anti-spam `alertThrottle: Map<string, { count, firstSeenAt, lastAlertSentAt }>`  ; fonctions exportées `logger.info/warn/error()` (push dans buffer), `logger.critical()` (push + Telegram anti-spam 10 min via `sendTelegramNotification()`), `logger.getLogs(level?, limit=50)`, `logger.getCounts()` retournant `{info, warn, error, critical}`

**Checkpoint**: Logger importable depuis n'importe quel fichier du projet — `import { logger } from "@/lib/logger"`

---

## Phase 2: User Story 1 — Détecter une erreur critique automatiquement (Priority: P1) 🎯 MVP

**Goal**: Quand `logger.critical()` est appelé, une notification Telegram est envoyée aux admins en moins de 30 secondes, avec anti-spam (max 1 alerte toutes les 10 min pour la même erreur).

**Independent Test**: Appeler `logger.critical("Test", { action: "TEST" })` dans une action serveur → notification Telegram reçue. Appeler 3 fois en < 10 min → seulement 1 Telegram reçu.

### Implémentation User Story 1

- [x] T002 [US1] Intégrer `logger.critical()` dans `src/app/admin/caisse/actions.ts` : dans les blocs catch des actions critiques `payOrder` et `approveReturn`, ajouter `logger.error(...)` avec le message d'erreur, userId depuis le contexte user, et action correspondante (ex: `"PAY_ORDER_FAILED"`, `"APPROVE_RETURN_FAILED"`)
- [x] T003 [US1] Intégrer `logger.critical()` dans `src/lib/orders.ts` : dans la fonction `allocateOrderStock`, si l'allocation échoue (stock insuffisant après tentative), appeler `logger.critical("Allocation stock échouée", { action: "STOCK_ALLOCATION_FAILED", metadata: { orderId } })`
- [x] T004 [US1] Vérifier que `src/lib/logger.ts` gère correctement l'anti-spam : dans `logger.critical()`, calculer `errorKey = \`\${message}:\${ctx?.action || ""}\`` ; si `alertThrottle.get(errorKey)` existe et `lastAlertSentAt` < 10 min → incrémenter count, NE PAS envoyer Telegram ; sinon → envoyer Telegram + mettre à jour la map

**Checkpoint**: US1 testable — erreur critique → Telegram envoyé, anti-spam fonctionnel

---

## Phase 3: User Story 2 — Consulter le statut des services en temps réel (Priority: P2)

**Goal**: Un admin ouvre `/admin/monitoring` et voit les 4 services (DB, Telegram, WhatsApp, Print) avec badge vert/rouge + temps de réponse + uptime. L'endpoint public `/api/health` retourne la même info en JSON.

**Independent Test**: `curl http://localhost:1556/api/health` → JSON avec 4 services, réponse < 5s. Aller sur `/admin/monitoring` → voir les 4 cartes services et l'uptime.

### Implémentation User Story 2

- [x] T005 [P] [US2] Créer `src/app/api/health/route.ts` : route GET publique (`export const dynamic = "force-dynamic"`), lancer les 4 checks en parallèle via `Promise.allSettled` avec `AbortController` timeout 3s par service : (1) DB → `db.execute(sql\`SELECT 1\`)`, (2) Telegram → `GET https://api.telegram.org/bot{token}/getMe`, (3) WhatsApp → `GET {whatsappApiUrl}/api/instance/{instanceName}`, (4) Print → count orders avec `printStatus = "print_pending"` créés > 10 min ago ; retourner `{ status: "ok"|"degraded", uptime: process.uptime(), timestamp, services: ServiceStatus[] }` toujours HTTP 200
- [x] T006 [P] [US2] Créer `src/app/admin/monitoring/actions.ts` : action `getMonitoringLogs` avec `withAuth({ roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN] })`, retourner `{ logs: logger.getLogs(level, limit), counts: logger.getCounts(), uptime: process.uptime() }`
- [x] T007 [US2] Créer `src/app/admin/monitoring/page.tsx` : Server Component async, `getCurrentUser()` + redirect si non ADMIN/SUPER_ADMIN, fetch parallèle de `/api/health` et `getMonitoringLogs({})` pour les données initiales, passer au composant `MonitoringContent`
- [x] T008 [US2] Créer `src/app/admin/monitoring/MonitoringContent.tsx` : Client Component avec props `{ initialLogs, initialCounts, initialUptime, initialServices }` ; section uptime (formaté en h/m/s) ; grille 4 cartes services (nom, badge vert🟢/rouge🔴, responseTimeMs, errorMessage si down) ; section logs avec filtre niveau (boutons Tous/Info/Warn/Error/Critical), liste des 50 derniers logs avec badge coloré par niveau, timestamp, message, userId/action ; bouton Actualiser qui rappelle `getMonitoringLogs()`
- [x] T009 [US2] Modifier `src/components/admin/AdminSidebar.tsx` : importer `Activity` depuis `lucide-react`, ajouter un item de navigation `{ href: "/admin/monitoring", icon: Activity, label: "Monitoring", roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN] }` entre "Analytics" et "Paramètres" dans le tableau de navigation

**Checkpoint**: US2 testable — `/api/health` retourne JSON valide, `/admin/monitoring` affiche les services et logs

---

## Phase 4: User Story 3 — Consulter les logs structurés (Priority: P3)

**Goal**: L'admin voit les 50 derniers logs depuis `/admin/monitoring`, peut filtrer par niveau (info/warn/error), chaque entrée affiche niveau + timestamp + message + contexte.

**Independent Test**: Déclencher une action (initier un retour) → aller sur `/admin/monitoring` → voir une entrée log info/error correspondante avec userId et action.

### Implémentation User Story 3

- [x] T010 [P] [US3] Ajouter `logger.info()` dans `src/app/admin/caisse/actions.ts` : dans `initiateReturn` (succès), `approveReturn` (succès), `rejectReturn` (succès) — appeler `logger.info("Retour initié/approuvé/rejeté", { userId: user.id, action: "INITIATE_RETURN"|"APPROVE_RETURN"|"REJECT_RETURN", metadata: { orderId } })`
- [x] T011 [P] [US3] Vérifier que le filtre par niveau fonctionne dans `MonitoringContent.tsx` : le bouton de filtre sélectionné passe `level` à `getMonitoringLogs({ level, limit: 50 })`, le résultat est affiché sans rechargement de page complet (état local `filteredLogs`)

**Checkpoint**: US3 testable — filtrage logs fonctionnel, actions business loguées

---

## Phase 5: Polish & Validation

**Purpose**: Robustesse edge cases et validation finale

- [x] T012 [P] Vérifier le comportement si Telegram échoue dans `logger.critical()` : le `.catch(console.error)` est en place, aucune exception ne remonte — le log est quand même enregistré dans le buffer
- [x] T013 [P] Vérifier que `/api/health` répond toujours en HTTP 200 même si tous les services sont down (ne jamais retourner 503 — évite les fausses alertes load balancer)
- [x] T014 Vérifier que `/admin/monitoring` redirige vers `/admin/login` si l'utilisateur n'est pas connecté (getCurrentUser() retourne null → redirect)
- [x] T015 Valider les 8 scénarios du fichier `specs/003-monitoring-observability/quickstart.md` manuellement

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1 — T001)**: Aucune dépendance — démarrer immédiatement — BLOQUANT pour tout le reste
- **US1 (Phase 2)**: Dépend de T001 (logger doit exister pour l'intégrer)
- **US2 (Phase 3)**: T005 et T006 parallélisables dès T001 terminé ; T007 dépend de T006 ; T008 dépend de T007 ; T009 indépendant
- **US3 (Phase 4)**: T010 et T011 parallélisables dès T001 + T008 terminés
- **Polish (Phase 5)**: Dépend de toutes les phases

### Parallel Opportunities

- T005 (route API) + T006 (actions) peuvent être développés en parallèle dès T001 terminé
- T009 (sidebar) peut être développé à tout moment après T001
- T010 + T011 (US3) parallélisables entre eux
- T012 + T013 (Polish) parallélisables entre eux

---

## Implementation Strategy

### MVP (US1 + US2 core)
1. T001 — Logger singleton
2. T002 + T003 — Intégration critical dans actions clés
3. T005 — `/api/health`
4. T007 + T008 — Page monitoring
5. **VALIDER** : alerte Telegram fonctionne, dashboard visible

### Livraison complète
1. Phase 1 → 2 → 3 → 4 → 5
2. US3 (logs filtrables) ajoute de la valeur sans bloquer US1/US2

---

## Notes

- [P] = fichiers différents, pas de dépendances — exécutable en parallèle
- Le logger est un module singleton Node.js — les logs persistent en mémoire tant que le serveur tourne
- `logger.critical()` = seul niveau qui envoie un Telegram (pas error ni warn)
- L'endpoint `/api/health` est public — ne jamais y exposer de tokens ou données sensibles
- `getCachedSettings()` de `src/lib/security.ts` est disponible pour lire les settings dans le health check
