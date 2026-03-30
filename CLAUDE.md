# 100-pc-IA Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-03-30

## Active Technologies
- TypeScript 5 + Next.js 14.2 App Router, Drizzle ORM, Zod, `src/lib/telegram.ts`, `src/lib/security.ts` (withAuth) (002-refund-return-workflow)
- PostgreSQL — table `orders` (ajout champ JSONB), tables existantes `clientPayments`, `auditLogs`, `digitalCodes`, `clients` (002-refund-return-workflow)
- TypeScript 5 + Next.js 14.2 App Router, Drizzle ORM, `src/lib/telegram.ts` (existant), `src/lib/security.ts` (withAuth, getCurrentUser) (003-monitoring-observability)
- Mémoire uniquement (tableau circulaire 1000 entrées) — zero migration DB (003-monitoring-observability)
- [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION] + [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION] (003-monitoring-observability)
- [if applicable, e.g., PostgreSQL, CoreData, files or N/A] (003-monitoring-observability)
- TypeScript 5 / Next.js 14.2 App Router + Drizzle ORM, Zod, BullMQ, imapflow (NEW), mailparser (NEW) (009-netflix-household-resolver)
- PostgreSQL — ajout colonne `outlook_password` dans `digital_codes` (009-netflix-household-resolver)
- TypeScript 5 + Next.js 14.2 App Router + Drizzle ORM, Zustand (`useSettingsStore`), Tailwind CSS, Zod (011-white-label-branding)
- PostgreSQL — `shop_settings` table (all required columns already exist) (011-white-label-branding)

- TypeScript 5 / React 19 (Next.js 15 App Router) + Tailwind CSS, Zustand (`useKioskStore`, `useSettingsStore`), `next/image`, `@/lib/formatters` (001-catalogue-view-redesign)

## Project Structure

```text
backend/
frontend/
tests/
```

## Commands

npm test; npm run lint

## Code Style

TypeScript 5 / React 19 (Next.js 15 App Router): Follow standard conventions

## Recent Changes
- 011-white-label-branding: Added TypeScript 5 + Next.js 14.2 App Router + Drizzle ORM, Zustand (`useSettingsStore`), Tailwind CSS, Zod
- 009-netflix-household-resolver: Added TypeScript 5 / Next.js 14.2 App Router + Drizzle ORM, Zod, BullMQ, imapflow (NEW), mailparser (NEW)
- 007-support-nav-notifications: Improved Support UI with cross-view navigation and unread status tracking.


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
