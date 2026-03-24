# 100-pc-IA Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-03-24

## Active Technologies
- TypeScript 5 + Next.js 14.2 App Router, Drizzle ORM, Zod, `src/lib/telegram.ts`, `src/lib/security.ts` (withAuth) (002-refund-return-workflow)
- PostgreSQL — table `orders` (ajout champ JSONB), tables existantes `clientPayments`, `auditLogs`, `digitalCodes`, `clients` (002-refund-return-workflow)
- TypeScript 5 + Next.js 14.2 App Router, Drizzle ORM, `src/lib/telegram.ts` (existant), `src/lib/security.ts` (withAuth, getCurrentUser) (003-monitoring-observability)
- Mémoire uniquement (tableau circulaire 1000 entrées) — zero migration DB (003-monitoring-observability)
- [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION] + [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION] (003-monitoring-observability)
- [if applicable, e.g., PostgreSQL, CoreData, files or N/A] (003-monitoring-observability)

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
- 003-monitoring-observability: Added [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION] + [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION]
- 003-monitoring-observability: Added [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION] + [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION]
- 003-monitoring-observability: Added [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION] + [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION]


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
