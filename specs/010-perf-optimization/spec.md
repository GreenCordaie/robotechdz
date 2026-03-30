# Feature Specification: Performance & Réactivité — Standards Web App Moderne

**Feature Branch**: `010-perf-optimization`
**Created**: 2026-03-29
**Status**: Draft

---

## Contexte & Diagnostic

Audit effectué sur la codebase actuelle. Problèmes identifiés :

| Zone | Constat | Criticité |
|------|---------|-----------|
| Code splitting | 1 seul composant lazy sur 37 fichiers "use client" | Critique |
| Streaming / Suspense | 0 fichiers loading.tsx, 0 Suspense | Critique |
| Caching pages | 13 routes en force-dynamic, zéro ISR | Critique |
| Bundle JS | HeroUI + Lucide + Toast importés en masse (~200 KB+) | Élevé |
| Images | next/image sous-utilisé, pas d'optimisation systématique | Élevé |
| Cache headers | Pas de Cache-Control explicite sur les assets statiques | Moyen |
| Redis | Infrastructure présente mais sous-exploitée sur les routes admin | Moyen |

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Navigation Admin Instantanée (Priority: P1)

Un employé (caissier, traiteur, admin) navigue entre les pages `/admin/caisse`, `/admin/traitement`, `/admin/comptes-partages` plusieurs fois par heure. Actuellement, chaque changement de page recharge une masse de JavaScript. L'objectif : les pages admin s'affichent en moins de 1 seconde dès la 2ème visite, sans spinner global.

**Why this priority**: Utilisé en continu, plusieurs heures par jour. Le ressenti de lenteur impacte directement la productivité opérationnelle.

**Independent Test**: Naviguer entre 3 pages admin et mesurer le temps entre le clic et l'affichage du contenu principal.

**Acceptance Scenarios**:

1. **Given** l'utilisateur est sur `/admin/caisse`, **When** il clique sur "Traitement" dans le sidebar, **Then** le squelette de la page s'affiche en moins de 200ms et le contenu réel en moins de 1s
2. **Given** une page admin déjà visitée, **When** l'utilisateur y revient, **Then** aucun rechargement réseau des modules JS déjà chargés
3. **Given** une connexion lente (3G simulée), **When** l'utilisateur charge une page admin, **Then** un skeleton/loader apparaît immédiatement sans écran blanc

---

### User Story 2 — Chargement Initial de l'Application (Priority: P1)

Un utilisateur ouvre le kiosk ou l'interface admin pour la première fois. Actuellement, tout le JavaScript de toutes les pages est chargé d'un coup. L'objectif : seul le code nécessaire à la page courante est téléchargé.

**Why this priority**: Le TTI (Time to Interactive) impacte directement l'expérience kiosk (client en face) et l'impression de qualité de l'outil.

**Independent Test**: Mesurer le bundle JS initial avec et sans les optimisations via les DevTools Network.

**Acceptance Scenarios**:

1. **Given** l'utilisateur ouvre `/admin/dashboard`, **When** la page se charge, **Then** seul le bundle dashboard et layout est téléchargé (pas le code de caisse, traitement, etc.)
2. **Given** l'utilisateur ouvre le kiosk, **When** la page se charge, **Then** le LCP (image ou titre principal) est visible en moins de 1.5s
3. **Given** n'importe quelle page admin, **When** on inspecte le réseau, **Then** les composants lourds (modals, tables, graphiques) sont chargés en lazy après l'affichage initial

---

### User Story 3 — Données Fraîches Sans Attente (Priority: P2)

L'admin consulte le dashboard ou les statistiques. Les données changent toutes les quelques minutes. L'objectif : utiliser le cache intelligent — afficher les données en cache immédiatement, puis revalider en arrière-plan.

**Why this priority**: Évite l'écran vide à chaque visite du dashboard. Les données affichées sont acceptablement fraîches (moins de 5 min) sans bloquer l'affichage.

**Independent Test**: Visiter le dashboard, naviguer ailleurs, revenir : les données s'affichent instantanément puis se mettent à jour silencieusement.

**Acceptance Scenarios**:

1. **Given** le dashboard a déjà été visité, **When** l'utilisateur y revient, **Then** les données précédentes s'affichent immédiatement (moins de 100ms) pendant la revalidation en arrière-plan
2. **Given** une nouvelle commande vient d'être passée, **When** l'admin consulte les stats dans les 5 minutes, **Then** les données sont à jour
3. **Given** Redis est indisponible, **When** l'utilisateur charge une page avec cache, **Then** la page fonctionne normalement (fallback sur DB direct)

---

### User Story 4 — Performance Perçue via Skeletons (Priority: P2)

Lors de n'importe quel chargement de données, l'utilisateur voit une interface qui répond immédiatement plutôt qu'un écran blanc ou un spinner centralisé.

**Why this priority**: La performance perçue est aussi importante que la performance réelle. Un skeleton bien placé donne l'impression d'une app 2x plus rapide.

**Independent Test**: Throttler la connexion à "Slow 3G" et naviguer entre les pages admin — aucun écran blanc de plus de 200ms.

**Acceptance Scenarios**:

1. **Given** une page avec un tableau de données, **When** les données chargent, **Then** un skeleton animé remplace l'espace des lignes sans layout shift (CLS inférieur à 0.1)
2. **Given** un modal lourd (ex: détail commande), **When** il s'ouvre, **Then** il apparaît avec un spinner interne, pas un blocage de l'interface entière
3. **Given** une requête DB lente, **When** la page charge, **Then** l'en-tête et le sidebar sont visibles avant la fin du chargement des données

---

### Edge Cases

- Que se passe-t-il si l'utilisateur navigue rapidement et annule une requête en cours ?
- Comment gérer les données en cache quand un admin effectue une action (invalidation ciblée vs globale) ?
- Que se passe-t-il si un lazy-loaded component échoue à charger (erreur réseau) ?
- Les utilisateurs mobiles avec connexion instable doivent toujours voir quelque chose d'utilisable.
- Le cache Redis tombe en production : l'app doit dégrader gracieusement sans crash.

---

## Requirements *(mandatory)*

### Functional Requirements

**Bundle & Code Splitting**

- **FR-001**: Les pages admin DOIVENT charger uniquement leur propre code JavaScript au premier rendu (route-based code splitting sur toutes les routes `/admin/*`)
- **FR-002**: Les composants non visibles au premier rendu (modals, tableaux secondaires, graphiques) DOIVENT être chargés en différé après le rendu initial
- **FR-003**: Les imports de bibliothèques UI DOIVENT être tree-shakés — seuls les composants effectivement utilisés sont inclus dans le bundle final
- **FR-004**: La taille du bundle JavaScript initial de chaque page DOIT être réduite d'au moins 40% par rapport à l'état actuel mesuré

**Streaming & Performance Perçue**

- **FR-005**: Chaque page admin DOIT afficher un skeleton de chargement pendant la récupération des données, sans décalage de mise en page (CLS inférieur à 0.1)
- **FR-006**: Les routes admin DOIVENT streamer le shell HTML (sidebar, header) avant la fin des requêtes base de données
- **FR-007**: Les modals DOIVENT être chargés en différé — leur code ne DOIT PAS être inclus dans le bundle de la page parente

**Caching**

- **FR-008**: Les pages dashboard et statistiques DOIVENT utiliser un cache de 5 minutes avec revalidation en arrière-plan lors des visites suivantes
- **FR-009**: Les actions de mutation (paiement, ajout commande, mise à jour) DOIVENT invalider uniquement les caches concernés, pas une invalidation globale
- **FR-010**: Les assets statiques (scripts, styles, polices, images) DOIVENT être servis avec des en-têtes de cache long terme basés sur le hash de leur contenu
- **FR-011**: Les données de configuration globale (paramètres boutique, produits actifs) DOIVENT être mises en cache et non rechargées à chaque requête HTTP

**Base de données**

- **FR-012**: Les requêtes sur les pages de listing DOIVENT utiliser la pagination côté serveur — aucun chargement illimité de toutes les lignes
- **FR-013**: Les requêtes avec jointures multiples DOIVENT être auditées pour éviter le problème N+1 (une requête par relation)
- **FR-014**: Les requêtes identiques exécutées dans la même fenêtre de temps DOIVENT être dédupliquées via le cache

**Images & Polices**

- **FR-015**: Toutes les images affichées DOIVENT être optimisées automatiquement avec dimensions explicites et format adaptatif (WebP/AVIF)
- **FR-016**: Les polices DOIVENT être préchargées et configurées pour éviter le flash de texte invisible (FOIT)

### Key Entities

- **Route Segment**: Chaque page de l'application, peut être statique, dynamique ou à revalidation périodique selon la fraîcheur des données requises
- **Bundle Chunk**: Unité de code JavaScript séparée, chargée à la demande lors de la navigation vers une page ou de l'ouverture d'un composant
- **Cache Layer**: Couche entre les requêtes HTTP et la base de données, avec durée de vie configurable et invalidation événementielle lors des mutations
- **Skeleton**: Placeholder visuel affiché pendant le chargement, reproduisant la structure du contenu final pour éviter les décalages de mise en page

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Le temps d'affichage du contenu principal (LCP) sur toutes les pages admin est inférieur à **1.5 secondes** sur connexion standard
- **SC-002**: La navigation entre deux pages admin déjà visitées prend moins de **300ms** (ressenti instantané)
- **SC-003**: Le bundle JavaScript initial de chaque page est réduit d'au moins **40%** par rapport à l'état actuel mesuré avant optimisation
- **SC-004**: Aucune page n'affiche d'écran blanc de plus de **200ms** — un skeleton est toujours visible pendant le chargement
- **SC-005**: Les pages dashboard et statistiques s'affichent en moins de **100ms** lors d'une 2ème visite grâce au cache
- **SC-006**: Le score Lighthouse Performance des pages principales est supérieur à **85/100**
- **SC-007**: Zéro régression fonctionnelle — toutes les actions existantes (paiement, livraison WhatsApp, résolution Netflix) continuent de fonctionner correctement après les optimisations

---

## Assumptions

- Les optimisations ciblent principalement les routes `/admin/*` (usage intensif quotidien)
- Le kiosk (`/kiosk`) est une priorité secondaire mais bénéficiera des optimisations bundle
- Redis est déjà opérationnel en production (confirmé par l'audit)
- La connexion DB (pool de 10 connexions) est suffisante, pas besoin de réplique lecture à ce stade
- HeroUI reste la librairie UI principale — on optimise les imports, on ne change pas de librairie
- Les mesures de performance de référence (avant) seront prises avec Lighthouse en mode Incognito

---

## Priorisation d'Implémentation

### Phase 1 — Impact maximal, effort minimal
1. Ajouter `loading.tsx` sur toutes les routes admin (skeletons immédiats)
2. Lazy loading des modals lourds
3. Activer ISR avec revalidation sur les pages de listing (remplacer force-dynamic)

### Phase 2 — Caching & Base de données
4. Mettre en cache shopSettings et produits actifs dans Redis
5. Auditer et corriger les requêtes N+1 dans les pages de listing
6. Pagination serveur sur les routes qui chargent tout (commandes, comptes, clients)

### Phase 3 — Bundle & Assets
7. Tree-shaking des imports Lucide (imports individuels par icône)
8. Analyser le bundle et fragmenter les gros chunks
9. Systématiser l'optimisation d'images sur toutes les pages
