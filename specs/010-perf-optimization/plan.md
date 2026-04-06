# Implementation Plan: Performance & Réactivité

**Branch**: `010-perf-optimization` | **Date**: 2026-03-30 | **Spec**: [spec.md](./spec.md)

## Summary

Optimisation en 3 phases entièrement additives : création de fichiers `loading.tsx` (skeletons), lazy loading des modals via `dynamic()`, et passage des pages de listing de `force-dynamic` à `revalidate` ISR. Zéro modification aux composants métier existants, zéro risque de régression.

## Technical Context

**Language/Version**: TypeScript 5 + Next.js 14.2 App Router
**Primary Dependencies**: HeroUI (UI), Drizzle ORM, Redis (ioredis), next/dynamic
**Storage**: PostgreSQL (pool:10) + Redis (cache layer déjà en place)
**Testing**: Lighthouse DevTools, Chrome Network tab (before/after)
**Target Platform**: VPS Ubuntu, `next start` production
**Performance Goals**: LCP < 1.5s, navigation < 300ms, Lighthouse > 85
**Constraints**: Zéro modification aux composants métier — additive-only
**Scale/Scope**: 15 routes admin, 17 modals, 37 fichiers use client

## Constitution Check

Constitution non remplie pour ce projet — pas de gates bloquants.
Principes appliqués : Simplicity (minimum de changements pour maximum d'impact), No Regression.

## Project Structure

### Documentation (this feature)

```text
specs/010-perf-optimization/
├── plan.md              # Ce fichier
├── research.md          # Phase 0 — Décisions techniques
├── spec.md              # Feature spec
├── checklists/
│   └── requirements.md
└── tasks.md             # Généré par /speckit.tasks
```

### Source Code — fichiers créés / modifiés

```text
src/app/admin/
├── loading.tsx                    # CRÉER — skeleton global admin (fallback)
├── dashboard/
│   ├── loading.tsx                # CRÉER — skeleton dashboard
│   └── page.tsx                   # MODIFIER — ajouter revalidate = 300
├── analytics/
│   ├── loading.tsx                # CRÉER — skeleton analytics
│   └── page.tsx                   # MODIFIER — ajouter revalidate = 300
├── catalogue/
│   ├── loading.tsx                # CRÉER — skeleton catalogue
│   └── page.tsx                   # MODIFIER — force-dynamic → revalidate = 60
├── clients/
│   ├── loading.tsx                # CRÉER — skeleton clients
│   └── page.tsx                   # MODIFIER — force-dynamic → revalidate = 60
├── commandes/
│   └── loading.tsx                # CRÉER — skeleton commandes
├── support/
│   └── loading.tsx                # CRÉER — skeleton support (garder force-dynamic)
├── fournisseurs/
│   ├── loading.tsx                # CRÉER — skeleton fournisseurs
│   └── page.tsx                   # MODIFIER — force-dynamic → revalidate = 60
├── traitement/
│   └── loading.tsx                # CRÉER — skeleton traitement
├── b2b/
│   ├── loading.tsx                # CRÉER — skeleton b2b
│   └── page.tsx                   # MODIFIER — force-dynamic → revalidate = 60
├── comptes-partages/
│   └── loading.tsx                # CRÉER — skeleton comptes-partages
├── monitoring/
│   └── loading.tsx                # CRÉER — skeleton monitoring
└── settings/
    └── loading.tsx                # CRÉER — skeleton settings

src/components/admin/
├── ClientsContent.tsx             # MODIFIER — lazy load modals
├── CatalogueContent.tsx           # MODIFIER — lazy load modals (si modals dedans)
└── modals/ (17 fichiers)          # PAS MODIFIÉS — lazy-loadés depuis les parents
```

## Complexity Tracking

Aucune violation — changements purement additifs.

---

## Phase 1 — Skeletons loading.tsx

### Stratégie skeleton

Chaque `loading.tsx` exporte un composant React qui reproduit la structure visuelle de la page avec des blocs gris animés. Règles :
- Fond `bg-[#0a0a0a]` (couleur app)
- Blocs `animate-pulse bg-white/5 rounded-xl`
- Reproduire le layout : header stats en haut, tableau/cards en bas
- Hauteurs et largeurs proches du contenu réel (évite CLS)

### Skeleton réutilisable (base)

Tous les skeletons partagent le même pattern de base :
```tsx
// Bloc stat (pour dashboards)
<div className="h-24 bg-white/5 rounded-2xl animate-pulse" />

// Ligne tableau
<div className="h-12 bg-white/5 rounded-xl animate-pulse" />

// Header page
<div className="h-8 w-48 bg-white/5 rounded-xl animate-pulse" />
```

---

## Phase 2 — Lazy loading modals

### Pattern à appliquer

Dans chaque Content component qui importe un modal :

```tsx
// AVANT
import { OrderDetailModal } from "@/components/admin/modals/OrderDetailModal";

// APRÈS
import dynamic from "next/dynamic";
const OrderDetailModal = dynamic(
  () => import("@/components/admin/modals/OrderDetailModal").then(m => m.OrderDetailModal),
  { ssr: false }
);
```

### Modals à lazy-loader par fichier parent

| Modal | Parent probable |
|-------|----------------|
| OrderDetailModal | CommandesContent, TraitementContent |
| RefundOrderModal | CommandesContent, CaisseContent |
| WhatsAppHistoryModal | ClientsContent |
| AddProductModal | CatalogueContent (ou CatalogueViewSwitcher) |
| ManageCategoriesModal | CatalogueContent |
| MassImportModal | CatalogueContent |
| ConfirmModal | Plusieurs — lazy load dans chaque parent |
| SupplierSettingsModal | FournisseursContent |
| AddSupplierModal | FournisseursContent |
| PaySupplierModal | FournisseursContent |
| AddMemberModal | B2b / SettingsContent |
| EditMemberModal | B2b / SettingsContent |
| AddResellerModal | B2bContent |
| RechargeBalanceModal | B2bContent |
| ApproveReturnModal | TraitementContent |
| InitiateReturnModal | ClientsContent |
| AddCategoryModal | CatalogueContent |

---

## Phase 3 — ISR et cache HTTP

### Règle de revalidation

| Page | Actuel | Après | Justification |
|------|--------|-------|---------------|
| dashboard | rien | revalidate=300 | Redis cache 5min déjà en place |
| analytics | rien | revalidate=300 | Même raison |
| catalogue | force-dynamic | revalidate=60 | revalidatePath après mutations |
| clients | force-dynamic | revalidate=60 | revalidatePath après mutations |
| fournisseurs | force-dynamic | revalidate=60 | revalidatePath après mutations |
| b2b | force-dynamic | revalidate=60 | revalidatePath après mutations |
| support | force-dynamic | **garder** | Temps réel nécessaire |
| caisse | use client | **garder** | isMobile hook |
| traitement | rien | **garder** | Server actions déjà optimales |
| commandes | rien | revalidate=120 | Historique, pas temps réel |
| comptes-partages | rien | **garder** | Données sensibles, fraîcheur requise |
| monitoring | rien | **garder** | Métriques temps réel |

### Important : revalidatePath déjà présent

Chaque server action existante appelle déjà `revalidatePath("/admin/catalogue")` etc. Donc le cache ISR est invalidé immédiatement après chaque mutation. Le TTL (60s, 300s) n'est qu'un filet de sécurité.

---

## Ordre d'implémentation (sans risque)

1. **Créer les 13 fichiers loading.tsx** — nouveaux fichiers, zéro risque
2. **Modifier les 6 pages.tsx** pour revalidate — 1 ligne ajoutée ou modifiée par fichier
3. **Lazy loader les modals** — chercher les imports dans chaque Content component et remplacer

## Tests de validation

Avant/après chaque phase :
- Chrome DevTools → Network → Disable cache → mesurer First Load JS
- Lighthouse → Performance score
- Navigation : cliquer entre 3 pages admin et chronométrer
- Vérifier fonctionnellement : ouvrir chaque modal, effectuer une action de test
