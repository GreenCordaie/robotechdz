# Research: White-Label Branding Configuration

**Feature**: 011-white-label-branding | **Date**: 2026-03-30

## Decision 1 — CSS Custom Property Runtime Injection

**Decision**: Use a dual-layer strategy:
1. Server-side `BrandingInjector` component injects `<style>:root { --primary: {color}; }</style>` in `<head>` for SSR pages
2. Client-side `useSettingsStore.fetchSettings()` calls `document.documentElement.style.setProperty('--primary', color)` after hydration for SPA navigation

**Rationale**:
- The app already has `--primary: #ec5b13` in `globals.css` as a fallback — this is the correct foundation
- Server injection prevents FOUC (flash of unstyled content) on server-rendered pages (login, b2b, reseller, suivi)
- Client injection handles in-session color changes without page reload
- `dangerouslySetInnerHTML` for the style tag is the standard Next.js pattern for injecting dynamic global styles; safe because the input is validated as a hex color

**Alternatives considered**:
- CSS-in-JS (styled-components/emotion) — not in the stack, unnecessary dependency
- Next.js `<Script>` with inline code — executes after render, causes flash
- Tailwind theme `primary` token — requires all 529+ class names to change from `[#ec5b13]` to `primary` naming, higher rename risk

**Implementation note**: The `BrandingInjector` uses React's `cache()` via `SystemQueries.getSettings()` — no extra DB hit.

---

## Decision 2 — Tailwind Arbitrary Value Migration

**Decision**: Replace `[#ec5b13]` with `[var(--primary)]` everywhere using a batch script.

**Rationale**:
- Tailwind 3+ supports CSS variable arbitrary values: `bg-[var(--primary)]`, `text-[var(--primary)]`, `border-[var(--primary)]` — these are valid and will resolve at runtime
- The existing `--primary` fallback in globals.css guarantees the value is always defined
- A single batch sed replacement covers all 529+ occurrences in one pass
- Opacity modifiers like `[#ec5b13]/10` become `[var(--primary)]/10` — Tailwind supports this syntax too

**Replacement map**:
```
bg-[#ec5b13]           → bg-[var(--primary)]
text-[#ec5b13]         → text-[var(--primary)]
border-[#ec5b13]       → border-[var(--primary)]
ring-[#ec5b13]         → ring-[var(--primary)]
shadow-[#ec5b13]       → shadow-[var(--primary)]
from-[#ec5b13]         → from-[var(--primary)]
via-[#ec5b13]          → via-[var(--primary)]
stroke="#ec5b13"       → stroke="var(--primary)"   (SVG props in TSX)
fill=...'#ec5b13'...   → fill="var(--primary)"    (recharts Cell)
stopColor="#ec5b13"    → stopColor="var(--primary)"
```

**SVG/recharts exception**: Props like `stroke="#ec5b13"` are JSX prop strings (not class names). These need manual replacement since they don't support CSS vars directly in some SVG contexts. Strategy: replace with a JS expression reading from a store/context, or use `currentColor` + CSS color.

**Alternatives considered**:
- Tailwind named token `primary` — cleaner long-term but requires config update AND 529 class renames; higher risk
- Manual file-by-file — too slow, high error rate

---

## Decision 3 — "FLEXBOX" String Replacement Strategy

**Decision**: Context-determined approach per file type:

| Context | Source | Strategy |
|---------|--------|----------|
| Client React components | `useSettingsStore().shopName` | Already available — just remove hardcoded fallback "FLEXBOX" and let the store value be used |
| Server components/pages | `SystemQueries.getPublicSettings()` | Fetch and pass as prop |
| Server actions (`settings/actions.ts`) | Already receives `settings` object | Use `settings.shopName` |
| WhatsApp webhook (`route.ts`) | `SystemQueries.getSettings()` | Fetch settings at handler start, replace all static strings |
| Receipt component | Prop `shopName` from parent | Already pattern exists — fix hardcoded "FLEXBOX II" |
| Default strings in queries/store | Change default from "FLEXBOX DIRECT" | Use `"Ma Boutique"` as neutral default |

**Files requiring attention** (25 occurrences total):
- `src/app/admin/login/page.tsx` — 3 occurrences (h1, footer, copyright)
- `src/app/admin/analytics/page.tsx` — 1 occurrence (metadata title)
- `src/app/admin/settings/actions.ts` — 2 occurrences (test message + TOTP issuer)
- `src/app/api/webhooks/whatsapp/route.ts` — 3 occurrences (closingMsg, defaultRole, ticketMsg)
- `src/app/b2b/page.tsx` — 3 occurrences
- `src/app/reseller/layout.tsx` — 2 occurrences
- `src/app/reseller/login/page.tsx` — 2 occurrences
- `src/components/admin/receipt/ThermalReceipt.tsx` — 1 occurrence ("FLEXBOX II")
- `src/components/admin/ClientsContent.tsx` — 1 occurrence (WA receipt message)
- `src/components/admin/settings/ApiBotSettings.tsx` — 4 occurrences (default AI prompts)
- `src/components/reseller/ResellerSidebar.tsx` — 1 occurrence
- `src/lib/escpos.ts` — 1 occurrence (comment, can leave)
- `src/store/useSettingsStore.ts` — 2 occurrences (defaults)
- `src/services/queries/system.queries.ts` — 3 occurrences (defaults)

---

## Decision 4 — Logo Display Strategy

**Decision**: Conditional rendering — show `<img src={logoUrl} />` if `logoUrl` is set and non-empty, else show shop name text. Use `next/image` only for kiosk where we control the domain; for admin and receipts use `<img>` since the URL is user-provided and domain is unknown.

**Rationale**: `next/image` requires domain whitelisting in `next.config.js`. User-supplied logo URLs could be from any domain. Using plain `<img>` avoids config maintenance.

**Exception**: `dashboardLogoUrl` (already in schema and store) is available for the admin sidebar logo specifically.

---

## No NEEDS CLARIFICATION markers remaining

All decisions are resolved with informed choices. The plan can proceed to tasks immediately.
