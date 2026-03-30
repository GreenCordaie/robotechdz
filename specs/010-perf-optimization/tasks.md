# Tasks: Performance & Réactivité — 010

**Input**: `specs/010-perf-optimization/plan.md`, `spec.md`, `research.md`
**Approche**: Additive-only — nouveaux fichiers + 1 ligne modifiée par page. Zéro touche aux composants métier.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Peut être fait en parallèle (fichiers indépendants)
- **[Story]**: User story cible (US1=skeletons, US2=lazy modals, US3=ISR cache, US4=polish)

---

## Phase 1: Setup

**Purpose**: Vérifier l'état de base et créer le composant skeleton réutilisable.

- [x] T001 Créer le composant skeleton de base `src/components/admin/PageSkeleton.tsx` (blocs animate-pulse réutilisables : SkeletonRow, SkeletonStat, SkeletonCard)
- [x] T002 Créer `src/app/admin/loading.tsx` — skeleton générique fallback pour toutes les routes admin non couvertes

---

## Phase 2: Foundational

**Purpose**: Aucun prérequis bloquant — les phases suivantes sont toutes indépendantes.

*Aucune tâche fondamentale bloquante — chaque phase est livrable séparément.*

---

## Phase 3: US1 — Skeletons loading.tsx par route

**Story Goal**: Chaque page admin affiche immédiatement un skeleton pendant le chargement des données.
**Independent Test**: Throttler Chrome à "Slow 3G", naviguer vers `/admin/dashboard` → un skeleton apparaît en < 200ms, pas d'écran blanc.

- [x] T003 [P] [US1] Créer `src/app/admin/dashboard/loading.tsx` — skeleton : 4 stats cards en haut + lignes de graphique
- [x] T004 [P] [US1] Créer `src/app/admin/analytics/loading.tsx` — skeleton : 4 stats cards + barres de graphique
- [x] T005 [P] [US1] Créer `src/app/admin/catalogue/loading.tsx` — skeleton : header + grille de 6 product cards
- [x] T006 [P] [US1] Créer `src/app/admin/clients/loading.tsx` — skeleton : header + 8 lignes de tableau
- [x] T007 [P] [US1] Créer `src/app/admin/commandes/loading.tsx` — skeleton : header + 10 lignes de tableau
- [x] T008 [P] [US1] Créer `src/app/admin/support/loading.tsx` — skeleton : header + 6 cards tickets
- [x] T009 [P] [US1] Créer `src/app/admin/fournisseurs/loading.tsx` — skeleton : 3 stat cards + tableau fournisseurs
- [x] T010 [P] [US1] Créer `src/app/admin/traitement/loading.tsx` — skeleton : header + 2 colonnes commandes
- [x] T011 [P] [US1] Créer `src/app/admin/b2b/loading.tsx` — skeleton : header + tableau revendeurs
- [x] T012 [P] [US1] Créer `src/app/admin/comptes-partages/loading.tsx` — skeleton : tabs + grille comptes
- [x] T013 [P] [US1] Créer `src/app/admin/monitoring/loading.tsx` — skeleton : header + métriques cards
- [x] T014 [P] [US1] Créer `src/app/admin/settings/loading.tsx` — skeleton : tabs + formulaire champs

---

## Phase 4: US2 — Lazy loading des modals

**Story Goal**: Les 17 modals sont splittés en chunks séparés, chargés uniquement à l'ouverture.
**Independent Test**: DevTools Network → filtrer par "Modal" → aucun fichier modal téléchargé au chargement de la page, seulement à l'ouverture.

- [x] T015 Identifier les imports statiques de modals dans `src/app/admin/commandes/CommandesContent.tsx` et convertir en `dynamic()` (OrderDetailModal, RefundOrderModal, ConfirmModal)
- [x] T016 [P] [US2] Convertir les imports de modals dans `src/components/admin/ClientsContent.tsx` en `dynamic()` (WhatsAppHistoryModal, InitiateReturnModal, ConfirmModal)
- [x] T017 [P] [US2] Identifier et convertir les imports de modals dans le composant parent de `AddProductModal`, `ManageCategoriesModal`, `MassImportModal`, `AddCategoryModal` (probablement `CatalogueContent` ou `CatalogueViewSwitcher`)
- [x] T018 [P] [US2] Identifier et convertir les imports de modals dans le composant parent de `SupplierSettingsModal`, `AddSupplierModal`, `PaySupplierModal` (probablement `FournisseursContent` ou `SuppliersViewSwitcher`)
- [x] T019 [P] [US2] Identifier et convertir les imports de modals dans le composant parent de `AddResellerModal`, `RechargeBalanceModal`, `AddMemberModal`, `EditMemberModal` (B2bManagementContent ou B2bContainer)
- [x] T020 [P] [US2] Identifier et convertir les imports de `ApproveReturnModal` dans `TraitementContent.tsx` en `dynamic()`
- [x] T021 [US2] Vérifier TypeScript (`npx tsc --noEmit`) — s'assurer que tous les types des modals sont correctement résolus avec dynamic imports

---

## Phase 5: US3 — ISR / Revalidate (remplacement force-dynamic)

**Story Goal**: Les pages de listing ne sont plus regénérées à chaque requête — elles utilisent le cache Next.js avec invalidation automatique via revalidatePath.
**Independent Test**: Ouvrir `/admin/catalogue` → F12 → Response Headers → vérifier `Cache-Control: s-maxage=60`. Ajouter un produit → revisiter la page → les nouvelles données apparaissent.

- [x] T022 [P] [US3] Modifier `src/app/admin/dashboard/page.tsx` : supprimer `force-dynamic` si présent, ajouter `export const revalidate = 300`
- [x] T023 [P] [US3] Modifier `src/app/admin/analytics/page.tsx` : ajouter `export const revalidate = 300`
- [x] T024 [P] [US3] Modifier `src/app/admin/catalogue/page.tsx` : remplacer `force-dynamic` par `export const revalidate = 60`
- [x] T025 [P] [US3] Modifier `src/app/admin/clients/page.tsx` : remplacer `force-dynamic` par `export const revalidate = 60`
- [x] T026 [P] [US3] Modifier `src/app/admin/fournisseurs/page.tsx` : remplacer `force-dynamic` par `export const revalidate = 60`
- [x] T027 [P] [US3] Modifier `src/app/admin/b2b/page.tsx` : remplacer `force-dynamic` par `export const revalidate = 60`
- [x] T028 [P] [US3] Modifier `src/app/admin/commandes/page.tsx` : ajouter `export const revalidate = 120`
- [x] T029 [US3] Vérifier que chaque action de mutation dans `src/app/admin/catalogue/actions.ts`, `clients/actions.ts`, `fournisseurs/actions.ts`, `b2b/actions.ts` appelle bien `revalidatePath()` — ajouter si manquant

---

## Phase 6: Polish & Validation

**Purpose**: Build final, vérification TypeScript, mesures Lighthouse avant/après.

- [x] T030 Lancer `npx tsc --noEmit` sur tout le projet et corriger les éventuelles erreurs introduites
- [x] T031 Lancer le build de production `npm run build` et vérifier l'absence d'erreurs
- [x] T032 Mesurer avec Lighthouse (mode Incognito) les pages : `/admin/dashboard`, `/admin/catalogue`, `/admin/clients` — documenter les scores avant/après dans `specs/010-perf-optimization/results.md`
- [x] T033 [P] Test fonctionnel manuel : ouvrir chaque modal converti (T015→T020) et vérifier qu'ils fonctionnent correctement
- [x] T034 [P] Test fonctionnel manuel : vérifier que les mutations (ajout produit, paiement commande, ajout client) revalidatent bien le cache et que les nouvelles données apparaissent

---

## Dependency Graph

```
T001 → T002 (skeleton base → fallback global)
T003-T014 peuvent tous être faits en parallèle (fichiers distincts)
T015-T020 peuvent être faits en parallèle après T001
T021 dépend de T015-T020
T022-T028 peuvent tous être faits en parallèle
T029 dépend de T022-T028
T030 → T031 → T032-T034
```

## Exécution parallèle suggérée

**Round 1** (simultané) :
- T001 + T002

**Round 2** (simultané — tous indépendants) :
- T003, T004, T005, T006, T007, T008, T009, T010, T011, T012, T013, T014
- T015, T016, T017, T018, T019, T020
- T022, T023, T024, T025, T026, T027, T028

**Round 3** :
- T021, T029

**Round 4** :
- T030 → T031 → T032, T033, T034

## MVP Scope

**Livrable minimum** : Phase 3 seule (T003→T014) — 12 fichiers loading.tsx.
Impact immédiat : zéro écran blanc, skeleton sur toutes les pages. Zéro risque.

**Livrable complet** : Toutes les phases — gain bundle ~40% + navigation < 300ms + Lighthouse > 85.
