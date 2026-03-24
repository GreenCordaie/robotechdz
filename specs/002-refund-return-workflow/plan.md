# Implementation Plan: Workflow Retours & Remboursements

**Branch**: `002-refund-return-workflow` | **Date**: 2026-03-23 | **Spec**: [spec.md](spec.md)

## Summary

Ajouter un workflow d'approbation pour les retours/remboursements : les caissiers initient une demande, les SUPER_ADMIN approuvent ou rejettent. L'approbation déclenche : remboursement dans clientPayments, remise en stock des codes, notification Telegram, audit log. Implémenté par ajout d'un champ JSONB `returnRequest` sur la table `orders` et de 3 nouvelles server actions.

## Technical Context

**Language/Version**: TypeScript 5
**Primary Dependencies**: Next.js 14.2 App Router, Drizzle ORM, Zod, `src/lib/telegram.ts`, `src/lib/security.ts` (withAuth)
**Storage**: PostgreSQL — table `orders` (ajout champ JSONB), tables existantes `clientPayments`, `auditLogs`, `digitalCodes`, `clients`
**Testing**: Manuel (quickstart.md)
**Target Platform**: Web — admin panel Next.js
**Project Type**: Web application (full-stack Next.js)
**Performance Goals**: Actions < 2s (transactions DB locales)
**Constraints**: Transactions atomiques pour l'approbation ; pas de rollback partiel visible
**Scale/Scope**: Faible volume (quelques retours/semaine) — pas de considérations de perf spécifiques

## Constitution Check

Constitution non configurée pour ce projet — pas de gates à évaluer.

## Project Structure

### Documentation (this feature)

```text
specs/002-refund-return-workflow/
├── plan.md              ✅ Ce fichier
├── research.md          ✅ Décisions techniques
├── data-model.md        ✅ Modèle de données
├── contracts/
│   ├── server-actions.md   ✅ Contrats des 3 actions
│   └── ui-components.md    ✅ Contrats des composants
├── quickstart.md        ✅ Scénarios de test
└── tasks.md             (généré par /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── db/
│   └── schema.ts                          MODIFY — ajout returnRequest JSONB sur orders
├── lib/
│   └── constants.ts                       MODIFY — ajout types ReturnRequest, ReturnRequestStatus
├── app/
│   └── admin/
│       ├── caisse/
│       │   ├── actions.ts                 MODIFY — ajout initiateReturn, approveReturn, rejectReturn
│       │   └── CaisseContent.tsx          MODIFY — bouton retour + section approbation SUPER_ADMIN
│       └── clients/
│           ├── actions.ts                 MODIFY — ajout getReturnsByClient
│           └── [ClientDetails component]  MODIFY — ajout section historique retours
└── components/
    └── admin/
        └── modals/
            ├── InitiateReturnModal.tsx    CREATE
            └── ApproveReturnModal.tsx     CREATE
```

**Structure Decision**: Projet Next.js full-stack existant — pas de nouveaux répertoires, ajouts dans les fichiers existants selon les conventions du projet.

## Implementation Phases

### Phase 1 — Fondation (DB + Types)
- Migration Drizzle : ajout champ `returnRequest` JSONB nullable sur `orders`
- Ajout des types TypeScript `ReturnRequest`, `ReturnRequestStatus`, `RemboursementType` dans `src/lib/constants.ts`

### Phase 2 — Server Actions
- `initiateReturn` — ADMIN/CAISSIER
- `approveReturn` — SUPER_ADMIN (transaction : clientPayments + codes + status + auditLog + Telegram)
- `rejectReturn` — SUPER_ADMIN
- `getReturnsByClient` — ADMIN/CAISSIER/SUPER_ADMIN

### Phase 3 — UI Composants
- `InitiateReturnModal` — formulaire d'initiation
- `ApproveReturnModal` — récapitulatif + approbation/rejet

### Phase 4 — Intégration UI
- `CaisseContent.tsx` : bouton "Retour" sur PAYE/LIVRE + section "Retours en attente" (SUPER_ADMIN)
- `ClientDetails` (ou page clients) : section historique retours

## Complexity Tracking

Aucune violation de complexité — ajouts dans les fichiers existants, pattern identique aux actions existantes.
