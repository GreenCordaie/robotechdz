# Research: Monitoring & Observabilité

**Feature**: 003-monitoring-observability
**Date**: 2026-03-23

---

## Decision 1: Logger structuré — fichier ou mémoire

**Decision**: Tableau circulaire en mémoire (module singleton Node.js) + persistence légère optionnelle dans un fichier JSON. Pas de base de données dédiée.

**Rationale**: La spec l'indique explicitement. Next.js App Router partage le même processus Node.js entre les requêtes — un module singleton (`src/lib/logger.ts`) avec un tableau circulaire de 1000 entrées fonctionne parfaitement. Zéro dépendance nouvelle. La persistance fichier est optionnelle (log sur `/tmp/app-logs.json`).

**Alternatives considered**:
- Winston/Pino — over-engineering, dépendance supplémentaire, complexité de configuration Next.js
- Base de données (table `logs`) — trop lourd, contredit la spec, impact perf

---

## Decision 2: Format des logs structurés

**Decision**: Interface TypeScript `LogEntry` avec champs: `id`, `level`, `timestamp`, `message`, `userId?`, `action?`, `metadata?` (JSON). Stocké dans le tableau circulaire en mémoire.

**Rationale**: Aligne avec la spec FR-007. Simple à implémenter, lisible par le dashboard admin.

---

## Decision 3: Alertes Telegram critiques — anti-spam

**Decision**: Map en mémoire `AlertThrottle` (errorKey → lastAlertSentAt). La clé = `hash(message + route)`. Si une alerte identique a été envoyée il y a moins de 10 minutes, elle est groupée (compteur incrémenté, pas de nouveau Telegram).

**Rationale**: Spec FR-003. Simple à implémenter sans dépendance externe. La map est en mémoire (reset au redémarrage serveur — acceptable).

**Alternatives considered**:
- Stockage DB de l'anti-spam — over-engineering
- Redis pour l'anti-spam — hors scope (feature 004)

---

## Decision 4: Health checks — services à tester

**Decision**: 4 services dans `/api/health` :
1. **Database** : `db.execute(sql`SELECT 1`)` avec timeout 3s
2. **Telegram** : `GET https://api.telegram.org/bot{token}/getMe` avec timeout 3s
3. **WhatsApp (WAHA)** : `GET {whatsappApiUrl}/api/instance/{instanceName}` avec timeout 3s
4. **Print Service** : Vérifier si des commandes sont bloquées en `print_pending` depuis > 10 minutes (indicateur indirect)

**Rationale**: Services identifiés dans la spec. Appels légers (ping/status), pas de vraies transactions. Tous en parallèle (`Promise.allSettled`) pour respecter le timeout de 5s global.

**Note Print Service**: Le service d'impression est un exe externe qui pull depuis l'API — pas de health endpoint direct. On mesure plutôt les jobs bloqués.

**Alternatives considered**:
- Tester Gemini API — hors spec, coûteux en tokens
- Tester n8n — déjà en diagnostic dans d'autres features

---

## Decision 5: Page `/admin/monitoring` — accès

**Decision**: Page protégée, accessible aux rôles ADMIN et SUPER_ADMIN. Pattern identique aux autres pages admin : async Server Component + getCurrentUser() + redirect si non autorisé.

**Rationale**: Spec FR-008. Cohérent avec le pattern existant des pages admin.

---

## Decision 6: Logger — intégration dans le code existant

**Decision**: Créer `src/lib/logger.ts` comme module singleton avec fonctions `logger.info()`, `logger.warn()`, `logger.error()`, `logger.critical()`. Ne pas remplacer tous les `console.log` existants (trop risqué, hors scope). Uniquement logger les événements critiques business (paiement, allocation stock, erreurs serveur).

**Rationale**: La spec FR-001 demande de capturer les erreurs non gérées. On peut ajouter un handler global dans `src/app/layout.tsx` ou via middleware. Les 127 console.log existants restent — on n'y touche pas.

**Patterns à logger** :
- Erreurs dans les actions serveur critiques (paiement, retour)
- Erreurs non gérées dans les API routes
- Alertes critiques (stock insuffisant, paiement échoué)

---

## Decision 7: Endpoint `/api/health` — authentification

**Decision**: Endpoint **public** (pas d'authentification). Retourne les statuts sans données sensibles.

**Rationale**: Spec FR-004. Un health check doit être accessible sans auth pour les load balancers, outils de monitoring externes. Ne retourne que `{ name, isUp, responseTimeMs }` — pas de tokens ou configs.

---

## Decision 8: Anti-spam Telegram — stockage

**Decision**: Map en mémoire `Map<string, { count: number; firstSeenAt: Date; lastAlertSentAt: Date }>` dans le module logger singleton.

**Rationale**: Simple, zéro dépendance. Reset au redémarrage serveur (acceptable — les alertes redémarrent proprement).

---

## Technical Findings

### Fichiers clés à créer
- `src/lib/logger.ts` — module singleton logger + anti-spam
- `src/app/api/health/route.ts` — health check endpoint public
- `src/app/admin/monitoring/page.tsx` — page admin (Server Component)
- `src/app/admin/monitoring/MonitoringContent.tsx` — Client Component
- `src/app/admin/monitoring/actions.ts` — server actions pour récupérer logs

### Fichiers clés à modifier
- `src/components/admin/AdminSidebar.tsx` — ajout item "Monitoring" pour ADMIN+SUPER_ADMIN
- (optionnel) `src/app/admin/caisse/actions.ts` — logger.critical() sur erreurs critiques

### Admin Sidebar pattern
```typescript
// Item à ajouter dans AdminSidebar.tsx
{ href: "/admin/monitoring", icon: Activity, label: "Monitoring", roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN] }
```
