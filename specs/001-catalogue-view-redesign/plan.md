# Implementation Plan: Refonte CatalogueView Kiosk

**Branch**: `001-catalogue-view-redesign` | **Date**: 2026-03-23 | **Spec**: [spec.md](spec.md)

## Summary

Remplacement complet de l'UI de `CatalogueView.tsx` pour correspondre au design Stitch fourni : layout 75/25 desktop (grille produits + sidebar cart), chips catégories avec icônes, cartes produits avec image aspect-square et bouton `+` orange, FAB + BottomNav mobile. Toute la logique métier existante (store, modal, formatters) est conservée.

## Technical Context

**Language/Version**: TypeScript 5 / React 19 (Next.js 15 App Router)
**Primary Dependencies**: Tailwind CSS, Zustand (`useKioskStore`, `useSettingsStore`), `next/image`, `@/lib/formatters`
**Storage**: N/A (state en mémoire via Zustand)
**Testing**: Visuel / manuel (borne kiosk)
**Target Platform**: Navigateur Chromium, écran kiosk paysage ≥ 1024px (prioritaire) + mobile
**Project Type**: Web application — composant React kiosk
**Performance Goals**: Rendu instantané, filtre synchrone < 100ms
**Constraints**: `select-none touch-none` (borne tactile), pas de navigation clavier, `overflow-hidden` sur le root
**Scale/Scope**: 1 fichier modifié (`CatalogueView.tsx`), composants internes

## Constitution Check

*Constitution non remplie pour ce projet — pas de gates bloquantes applicables.*

- Logique métier existante conservée : ✅
- Sauvegarde `.bak` créée avant modification : ✅
- Aucune nouvelle dépendance introduite : ✅

## Project Structure

### Documentation (this feature)

```text
specs/001-catalogue-view-redesign/
├── plan.md              # Ce fichier
├── research.md          # Phase 0 — décisions de design
├── data-model.md        # Phase 1 — entités et contrats UI
├── checklists/
│   └── requirements.md  # Checklist spec validée
└── tasks.md             # Phase 2 (/speckit.tasks)
```

### Source Code (repository root)

```text
src/app/kiosk/views/
├── CatalogueView.tsx           # Fichier à modifier (UI remplacée)
├── CatalogueView.tsx.bak       # Sauvegarde de l'original
├── IdleView.tsx
├── CartView.tsx
└── ConfirmationView.tsx

src/app/kiosk/components/
└── ProductModal.tsx             # Conservé sans modification

src/store/
└── useKioskStore.ts             # Conservé sans modification

src/lib/
└── formatters.ts                # Conservé sans modification

src/app/
└── globals.css                  # Material Symbols déjà chargés
```

**Structure Decision**: Single file modification. Seul `CatalogueView.tsx` est réécrit. Tous les autres fichiers sont conservés à l'identique.
