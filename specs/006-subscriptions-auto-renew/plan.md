# Implementation Plan: Abonnements & Renouvellement Automatique

**Branch**: `006-subscriptions-auto-renew` | **Date**: 2026-03-24 | **Spec**: [spec.md](spec.md)

## Summary

Ajouter un système d'abonnements mensuels récurrents : création admin depuis la fiche client, cron quotidien de renouvellement automatique avec allocation de codes via `allocateOrderStock()` existant, notifications Telegram/WhatsApp, logs d'historique, et gestion pause/résiliation.

## Technical Context

**Language/Version**: TypeScript 5
**Primary Dependencies**: Next.js 14.2 App Router, Drizzle ORM, Zod, `src/lib/orders.ts` (allocateOrderStock existant), `src/lib/telegram.ts` (sendTelegramNotification), `src/lib/logger.ts` (003), `CRON_SECRET` env var (déjà configuré)
**Storage**: 2 nouvelles tables (`subscriptions`, `subscriptionLogs`) + 2 colonnes sur tables existantes (`products.isSubscribable`, `orders.subscriptionId`) — migration `npm run db:push`
**Testing**: Manuel (quickstart.md)
**Target Platform**: Next.js full-stack, Node.js
**Performance Goals**: Cron traite 100 abonnements en < 5 minutes
**Constraints**: Idempotence obligatoire (FR-010). Renouvellement via `allocateOrderStock()` existant — zéro duplication logique.
**Scale/Scope**: Faible volume attendu (< 500 abonnements actifs)

## Constitution Check

Constitution non configurée — pas de gates à évaluer.

## Project Structure

### Documentation (this feature)

```text
specs/006-subscriptions-auto-renew/
├── plan.md              ✅ Ce fichier
├── research.md          ✅ 10 décisions techniques
├── data-model.md        ✅ Tables subscriptions + subscriptionLogs, types, cycle de vie
├── contracts/
│   └── subscriptions.md ✅ Server actions + cron endpoint + UI contract
├── quickstart.md        ✅ 10 scénarios de test
└── tasks.md             (à générer par /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── db/
│   └── schema.ts                              MODIFY — ajouter tables subscriptions + subscriptionLogs + colonnes isSubscribable + subscriptionId
├── lib/
│   └── constants.ts                           MODIFY — ajouter types SubscriptionStatus, SubscriptionEvent, SUBSCRIPTION_PERIOD_DAYS
├── app/
│   ├── api/
│   │   └── admin/
│   │       └── cron/
│   │           └── renew-subscriptions/
│   │               └── route.ts               CREATE — job quotidien renouvellement (CRON_SECRET auth)
│   └── admin/
│       └── clients/
│           └── actions.ts                     MODIFY — ajouter createSubscription, pauseSubscription, resumeSubscription, cancelSubscription, getClientSubscriptions
└── components/
    └── admin/
        ├── SubscriptionsSection.tsx           CREATE — Client Component (liste + création + actions)
        └── ClientsContent.tsx                 MODIFY — intégrer SubscriptionsSection dans le modal client
```

**Structure Decision**: Cron dans `/api/admin/cron/` (pattern existant). Actions dans `clients/actions.ts` (les abonnements sont gérés depuis la fiche client). UI en composant séparé pour isolation.

## Implementation Phases

### Phase 1 — DB Schema + Types
- Ajouter colonnes + tables dans `schema.ts`, exécuter `db:push`
- Ajouter types dans `constants.ts`

### Phase 2 — US1 : Création abonnements (+ US3 : gestion)
- Ajouter server actions dans `clients/actions.ts` (create, pause, resume, cancel, getClientSubscriptions)
- Créer `SubscriptionsSection.tsx`
- Modifier `ClientsContent.tsx`

### Phase 3 — US2 : Cron renouvellement automatique
- Créer `renew-subscriptions/route.ts` avec algo idempotent + notifications Telegram + récapitulatif

## Complexity Tracking

2 nouvelles tables + 2 colonnes + 1 cron endpoint + 1 composant UI + modifications ciblées. Zéro nouvelle dépendance externe.
