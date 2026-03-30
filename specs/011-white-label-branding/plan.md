# Implementation Plan: White-Label Branding Configuration

**Branch**: `011-white-label-branding` | **Date**: 2026-03-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-white-label-branding/spec.md`

## Summary

Most branding infrastructure already exists in the database (`shopSettings` table has `shopName`, `logoUrl`, `dashboardLogoUrl`, `faviconUrl`, `accentColor`). The gap is **propagation**: `accentColor` is never applied as a CSS variable at runtime, 529+ Tailwind classes still reference the hardcoded literal `#ec5b13`, and ~25 places across source files hardcode "FLEXBOX"/"FLEXBOX DIRECT". This plan wires the existing DB fields into all rendering surfaces via CSS custom properties and shop-name token injection.

## Technical Context

**Language/Version**: TypeScript 5 + Next.js 14.2 App Router
**Primary Dependencies**: Drizzle ORM, Zustand (`useSettingsStore`), Tailwind CSS, Zod
**Storage**: PostgreSQL — `shop_settings` table (all required columns already exist)
**Testing**: Manual E2E (no automated test suite in this project)
**Target Platform**: Web (admin + kiosk running in the same Next.js app)
**Project Type**: Web application (monorepo — no separate frontend/backend)
**Performance Goals**: Settings load once per session; CSS var injection is synchronous, zero layout shift
**Constraints**: Must not break existing functionality; all components must still compile and render
**Scale/Scope**: Single-tenant — one `shopSettings` row, one branding config

## Constitution Check

Constitution file is a blank template — no formal gates defined. Applying standard code quality principles:

- ✅ No new tables needed (existing schema is sufficient)
- ✅ No new external dependencies needed
- ✅ Minimal surface area — reuse `useSettingsStore`, existing Drizzle queries, existing CSS var `--primary`
- ✅ No backwards-breaking API changes

## Project Structure

### Documentation (this feature)

```text
specs/011-white-label-branding/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (affected files)

```text
src/
├── app/
│   ├── globals.css                              # --primary fallback already exists; add --primary-rgb
│   ├── layout.tsx                               # Add server-side BrandingInjector + dynamic metadata
│   ├── admin/
│   │   └── layout.tsx                           # Apply --primary from accentColor on settings fetch
│   ├── kiosk/
│   │   ├── KioskContent.tsx                     # Apply --primary from accentColor on mount
│   │   └── views/IdleView.tsx                   # Already uses shopName — update fallback from "FLEXBOX"
│   ├── admin/login/page.tsx                     # Replace hardcoded "FLEXBOX" → dynamic or neutral
│   ├── admin/analytics/page.tsx                 # Replace "Flexbox Admin" in metadata
│   ├── admin/settings/
│   │   ├── SettingsContent.tsx                  # Add accentColor to fetchSettings sync
│   │   └── actions.ts                           # Replace "FLEXBOX DIRECT" in test message + TOTP issuer
│   ├── api/webhooks/whatsapp/route.ts           # Replace hardcoded "FLEXBOX DIRECT" with settings.shopName
│   ├── b2b/page.tsx                             # Replace hardcoded "FLEXBOX DIRECT"
│   ├── reseller/
│   │   ├── layout.tsx                           # Replace hardcoded "FLEXBOX DIRECT"
│   │   └── login/page.tsx                       # Replace hardcoded "FLEXBOX DIRECT"
│   └── suivi/[orderNumber]/page.tsx             # Check for hardcoded brand
├── components/
│   ├── admin/
│   │   ├── AdminSidebar.tsx                     # [#ec5b13] → [var(--primary)]
│   │   ├── MobileNavbar.tsx                     # [#ec5b13] → [var(--primary)]
│   │   ├── receipt/ThermalReceipt.tsx           # Replace "FLEXBOX II" with shopName prop
│   │   ├── ClientsContent.tsx                   # Replace "FLEXBOX DIRECT" in receipt WA message
│   │   └── settings/ApiBotSettings.tsx         # Replace "FLEXBOX DIRECT" in default prompts
│   └── reseller/ResellerSidebar.tsx             # Replace "FLEXBOX" fallback
├── lib/
│   └── delivery.ts                             # Already dynamic (shopName from settings) ✓
├── services/queries/
│   └── system.queries.ts                       # Add accentColor + logoUrl to getPublicSettings
└── store/
    └── useSettingsStore.ts                     # Add accentColor field; apply --primary on fetch
```

**Structure Decision**: Single Next.js web application. No backend/frontend split.

---

## Phase 0: Research

### Decision 1 — CSS Custom Property Strategy

**Decision**: Inject `--primary` as a CSS custom property at two levels:
1. **Server-side (SSR)**: A `BrandingInjector` server component reads `accentColor` from DB and writes an inline `<style>` tag in the `<head>` → zero flash on first render for server-rendered pages (admin login, b2b, reseller, suivi)
2. **Client-side (hydration)**: `useSettingsStore.fetchSettings()` calls `document.documentElement.style.setProperty('--primary', accentColor)` after hydration → updates admin + kiosk panels immediately

**Rationale**: Tailwind classes using `[#ec5b13]` literal cannot be changed at runtime. The replacement strategy is to change them to `[var(--primary)]` — this syntax is fully supported by Tailwind 3+ arbitrary value syntax and resolves correctly at runtime when the CSS var is set.

**Alternatives considered**:
- Tailwind theme `primary` token (`bg-primary`) — would require renaming 529 classes AND ensuring theme is configured. Higher migration risk.
- CSS-in-JS injection — not in stack, unnecessary dependency.
- Dynamic class generation — not possible with Tailwind (build-time purging).

### Decision 2 — Color Replacement Strategy

**Decision**: Batch-replace all `[#ec5b13]` Tailwind arbitrary values with `[var(--primary)]` using a targeted sed/replace script. The replacement is safe because:
- `[#ec5b13]` only appears as a Tailwind color utility suffix
- `var(--primary)` is valid CSS and Tailwind arbitrary value syntax
- The CSS fallback `--primary: #ec5b13` in globals.css ensures zero visual change if the script is the only change

**Files with the highest concentration**:
- `CaisseContent.tsx` (~50 occurrences)
- `SettingsContent.tsx` (~20 occurrences)
- All admin modals (~100 occurrences across 10 files)
- `login/page.tsx` (~15 occurrences)

### Decision 3 — "FLEXBOX" Name Replacement Strategy

**Decision**: Context-dependent approach:
- **Dynamic from store** (client components): Use `useSettingsStore().shopName`
- **Dynamic from server query** (server components/pages): Use `SystemQueries.getPublicSettings()` then pass as prop
- **WhatsApp webhook** (server action): Read `settings.shopName` from DB via `SystemQueries.getSettings()` — already done for delivery messages, extend to `closingMsg` and `defaultRole`
- **TOTP issuer in settings/actions.ts**: Use `settings.shopName` (already fetched in the same function)
- **Static/marketing pages** (b2b, reseller): Fetch from `SystemQueries.getPublicSettings()` — these are `export const revalidate = 60` pages

### Decision 4 — `BrandingInjector` Server Component

```text
src/components/shared/BrandingInjector.tsx
```

A server component that:
1. Calls `SystemQueries.getSettings()` (cached via React `cache()`)
2. Returns `<style dangerouslySetInnerHTML={{ __html: `:root { --primary: ${accentColor}; }` }} />`
3. Rendered inside `<head>` in `src/app/layout.tsx`

This handles SSR flash prevention for all routes without needing client JS.

### Decision 5 — `useSettingsStore` Extension

Add `accentColor: string` to the store interface and state. In `fetchSettings()`, after `set({...})`, call:
```ts
document.documentElement.style.setProperty('--primary', res.data.accentColor || '#ec5b13');
```

This ensures the CSS var is updated after every settings fetch/refresh on the client.

---

## Phase 1: Data Model

### `shop_settings` Table — Current State (no migration needed)

All required columns already exist:

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `shop_name` | text | "FLEXBOX DIRECT" | Brand name displayed everywhere |
| `logo_url` | text | null | Logo for kiosk, receipt, admin header |
| `dashboard_logo_url` | text | null | Separate logo for admin dashboard |
| `favicon_url` | text | null | Browser tab icon |
| `accent_color` | text | "#ec5b13" | Primary CSS color applied as `--primary` var |

**No DB migration required.** Schema is complete.

### Drizzle ORM Mapping (already in schema.ts)

```ts
// Already exists in src/db/schema.ts:
shopName: text("shop_name").default("FLEXBOX DIRECT"),
logoUrl: text("logo_url"),
dashboardLogoUrl: text("dashboard_logo_url"),
faviconUrl: text("favicon_url"),
accentColor: text("accent_color").default("#ec5b13"),
```

---

## Phase 1: Interface Contracts

### Zustand Store Interface Extension

**File**: `src/store/useSettingsStore.ts`

Add to `SettingsState`:
```ts
accentColor: string;   // hex color, e.g. "#ec5b13"
```

Default value: `"#ec5b13"`

In `fetchSettings()` after `set({...})`:
```ts
const color = res.data.accentColor || "#ec5b13";
document.documentElement.style.setProperty('--primary', color);
```

### SystemQueries.getPublicSettings Extension

**File**: `src/services/queries/system.queries.ts`

Add to returned object:
```ts
{
  isB2bEnabled: boolean,
  isMaintenanceMode: boolean,
  shopName: string,
  accentColor: string,   // NEW
  logoUrl: string | null, // NEW
  faviconUrl: string | null, // NEW
}
```

### Server Action `getShopSettingsAction` — already returns `accentColor`

Verified in `src/app/admin/settings/actions.ts` line 54: `accentColor: z.string().optional()` — the field is already returned by the server action, just not consumed in the store.

---

## Phase 1: Quickstart Scenarios

### Scenario 1: Admin changes primary color to blue
1. Admin opens `/admin/settings` → Branding section
2. Selects `#1a73e8` from color picker
3. Clicks Save → `updateShopSettings` server action persists `accentColor = "#1a73e8"`
4. `useSettingsStore.fetchSettings()` re-runs → `set({ accentColor: "#1a73e8" })` + `document.documentElement.style.setProperty('--primary', '#1a73e8')`
5. All elements using `[var(--primary)]` instantly update to blue — no reload needed

### Scenario 2: Admin changes shop name
1. Admin sets `shopName = "TechShop Pro"` → Save
2. `useSettingsStore` updates → all components reading `shopName` re-render
3. Admin layout title updates: "TechShop Pro | Dashboard Admin"
4. Kiosk idle screen shows "TechShop Pro" instead of "FLEXBOX"
5. Next WhatsApp message reads from settings → includes "TechShop Pro"

### Scenario 3: First install (empty settings)
1. No `accentColor` in DB → defaults to `#ec5b13` (existing default in schema)
2. `BrandingInjector` renders `--primary: #ec5b13` → app looks identical to today
3. No broken images (no logo set → components show text fallback)

---

## Implementation Checklist

### P0 — CSS Variable Wiring (MVP, unblocks everything else)
- [ ] Create `src/components/shared/BrandingInjector.tsx` server component
- [ ] Add `BrandingInjector` to `src/app/layout.tsx` inside `<head>`
- [ ] Add `accentColor` to `useSettingsStore` interface + state + fetchSettings CSS var setter
- [ ] Add `accentColor`, `logoUrl`, `faviconUrl` to `SystemQueries.getPublicSettings()`

### P1 — Color Token Replacement (529 occurrences)
- [ ] Batch-replace `[#ec5b13]` → `[var(--primary)]` across all `.tsx`/`.ts` files
- [ ] Verify no regressions in key pages: admin dashboard, caisse, kiosk, settings

### P2 — "FLEXBOX" Name Replacement
- [ ] `src/app/admin/login/page.tsx` — use `SystemQueries.getPublicSettings()` for shop name
- [ ] `src/app/admin/analytics/page.tsx` — use `getPublicSettings()` for metadata title
- [ ] `src/app/admin/settings/actions.ts` — use `settings.shopName` for test message + TOTP issuer
- [ ] `src/app/api/webhooks/whatsapp/route.ts` — use `settings.shopName` for `closingMsg` and `defaultRole`
- [ ] `src/app/b2b/page.tsx` — use `getPublicSettings()` for brand name in copy
- [ ] `src/app/reseller/layout.tsx` + `src/app/reseller/login/page.tsx` — use `getPublicSettings()`
- [ ] `src/components/admin/receipt/ThermalReceipt.tsx` — use `shopName` prop (or read from store)
- [ ] `src/components/admin/ClientsContent.tsx` — use `shopName` from store for WA receipt message
- [ ] `src/components/admin/settings/ApiBotSettings.tsx` — use settings `shopName` for default prompts
- [ ] `src/components/reseller/ResellerSidebar.tsx` — use `shopName` from settings

### P3 — Default Fallbacks Cleanup
- [ ] `src/store/useSettingsStore.ts` — change hardcoded "FLEXBOX Direct" default to a neutral placeholder or read from env
- [ ] `src/services/queries/system.queries.ts` — change "FLEXBOX DIRECT" defaults to empty string (let UI handle display)
- [ ] `src/db/schema.ts` — optionally change schema default to empty string (requires migration, low priority)

### P4 — Logo & Favicon in Kiosk/Receipts
- [ ] `src/app/kiosk/views/IdleView.tsx` — show `logoUrl` image if set, fallback to shopName text
- [ ] `src/components/admin/receipt/ThermalReceipt.tsx` — show logo if `showLogoOnReceipt` AND `logoUrl` set
- [ ] Update `SystemQueries.getPublicSettings()` to include `logoUrl` for SSR pages

## Complexity Tracking

No constitution violations. All changes are within existing file structure with no new abstractions beyond `BrandingInjector` (a simple ~15-line server component).
