# Research: Performance Optimization — 010

**Date**: 2026-03-30

## Décisions techniques

### 1. loading.tsx — Skeletons Next.js App Router

**Decision**: Créer un fichier `loading.tsx` dans chaque dossier de route admin.
**Rationale**: Next.js App Router streame automatiquement le shell (sidebar, header) et affiche le `loading.tsx` pendant que les données chargent. Zéro changement aux composants existants. Additive-only.
**Alternatives rejetées**: `<Suspense>` manuel dans chaque page — plus de travail, même résultat.

### 2. Lazy loading des modals

**Decision**: Wrapper les 17 modals avec `dynamic(() => import(...), { ssr: false })` dans leurs composants parents.
**Rationale**: Les modals ne sont jamais visibles au premier rendu. Leur code (HeroUI Modal, formulaires, actions) est chargé inutilement. Avec dynamic(), ils sont splitté dans des chunks séparés.
**Alternatives rejetées**: Import statique — statu quo, bundle trop lourd.
**Risque**: Aucun — les modals restent fonctionnels, juste chargés à la demande.

### 3. ISR (revalidate) à la place de force-dynamic sur les listings

**Decision**: Remplacer `force-dynamic` par `export const revalidate = 60` sur les pages non temps-réel.
**Rationale**: Les server actions utilisent déjà `revalidatePath()` après chaque mutation → le cache est invalidé immédiatement lors des changements. Le TTL 60s sert de filet de sécurité.
**Pages concernées**: catalogue, clients, fournisseurs, b2b.
**Pages à garder force-dynamic**: support (tickets en temps réel), caisse (données live).
**Alternatives rejetées**: Garder force-dynamic — re-génère inutilement les pages à chaque visite.

### 4. Caisse page.tsx — garder "use client"

**Decision**: Ne pas modifier caisse/page.tsx.
**Rationale**: Utilise `useIsMobile()` hook qui nécessite "use client". CaisseContent et CaisseMobile chargent leurs données via server actions au runtime. Modifier ce fichier apporte un risque pour zéro gain.

### 5. Support page — garder force-dynamic

**Decision**: Ne pas modifier support/page.tsx.
**Rationale**: Les tickets support changent en temps réel. Le cache de 60s rendrait les nouvelles conversations invisibles.

### 6. Dashboard + Analytics — ajouter revalidate = 300

**Decision**: Ajouter `export const revalidate = 300` (5 min) sur dashboard et analytics.
**Rationale**: Les actions analytics utilisent déjà Redis avec TTL 5min. Le revalidate Next.js aligne le cache HTTP sur le cache Redis. Résultat : affichage instantané (< 100ms) lors des revisites.

### 7. resolverLogs sans limit — déjà corrigé

**Decision**: Déjà fixé en session précédente avec `limit: 200`.
**Rationale**: La table auditLogs peut devenir volumineuse. Limit explicite préventif.

### 8. exportDatabaseAction — garder sans limit

**Decision**: Ne pas modifier.
**Rationale**: C'est une action d'export total volontaire. Ajouter un limit casserait la fonctionnalité d'export complet.

## Périmètre définitif

### À faire (safe, impact élevé)
- loading.tsx × 12 routes admin
- dynamic() sur les 17 modals
- revalidate sur catalogue, clients, fournisseurs, b2b (force-dynamic → revalidate=60)
- revalidate sur dashboard, analytics (rien → revalidate=300)

### À ne pas toucher
- caisse/page.tsx (use client + isMobile)
- support/page.tsx (force-dynamic justifié)
- traitement/page.tsx (server actions, OK)
- Toutes les server actions existantes
- DB config, Redis config
- Webhooks WhatsApp, Netflix resolver
