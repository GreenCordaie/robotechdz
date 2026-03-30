# Tasks: White-Label Branding Configuration

**Input**: Design documents from `/specs/011-white-label-branding/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓

**No tests requested.** No TDD phase.

**Organization**: Tasks grouped by user story (US1→US5) following spec priorities.

---

## Phase 1: Setup

**Purpose**: No new infrastructure — DB schema complete, project exists. Verify starting point.

- [X] T001 Confirm `accentColor`, `logoUrl`, `dashboardLogoUrl`, `faviconUrl` columns exist in `src/db/schema.ts` and the `getShopSettingsAction` Zod schema in `src/app/admin/settings/actions.ts` already returns `accentColor` (read-only verification, no code change needed)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core CSS variable infrastructure that MUST exist before any user story is testable.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Add `accentColor: string` field to `SettingsState` interface (default `"#ec5b13"`), add it to the initial store state, and in `fetchSettings()` after `set({...})` call `document.documentElement.style.setProperty('--primary', accentColor)` in `src/store/useSettingsStore.ts`

- [X] T003 Create server component `src/components/shared/BrandingInjector.tsx` that calls `SystemQueries.getSettings()`, reads `accentColor`, and returns `<style dangerouslySetInnerHTML={{ __html: \`:root { --primary: \${settings.accentColor || '#ec5b13'}; }\` }} />` — import from `"server-only"`

- [X] T004 Import and render `<BrandingInjector />` inside the `<head>` element in `src/app/layout.tsx` so all SSR pages get the correct `--primary` value with zero flash

- [X] T005 Extend `SystemQueries.getPublicSettings()` in `src/services/queries/system.queries.ts` to return `accentColor: settings?.accentColor || "#ec5b13"`, `logoUrl: settings?.logoUrl || null`, and `faviconUrl: settings?.faviconUrl || null` in addition to existing fields

- [X] T006 Batch-replace all 529+ instances of the hardcoded Tailwind color token `[#ec5b13]` with `[var(--primary)]` across all `.tsx` and `.ts` files under `src/` — run: `find src -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i 's/\[#ec5b13\]/[var(--primary)]/g' {} +` — also replace `[#ec5b13` opacity modifiers (e.g., `[#ec5b13]/10` becomes `[var(--primary)]/10`)

- [X] T007 Replace JSX SVG/recharts prop values that hardcode `"#ec5b13"` as a string (e.g. `stroke="#ec5b13"`, `stopColor="#ec5b13"`, `fill={... '#ec5b13' ...}` in `src/app/admin/analytics/AnalyticsContent.tsx`) — change to use a JS variable reading from `useSettingsStore().accentColor` passed as a prop, since SVG presentation attributes cannot use CSS `var()` in all browsers

**Checkpoint**: Foundation ready — all components now reference `var(--primary)` and the BrandingInjector injects the correct value at SSR time. User story implementation can begin.

---

## Phase 3: User Story 1 — Configure Shop Identity (Priority: P1) 🎯 MVP

**Goal**: Admin saves branding (name, color, logo, favicon) in `/admin/settings`; admin panel immediately reflects the new values.

**Independent Test**: Update shopName to "AcmeCorp" and accentColor to `#1a73e8` in `/admin/settings`, save, reload — verify "AcmeCorp" appears in admin header and all orange accents turn blue.

### Implementation

- [X] T008 [US1] Add hex color regex validation to the `accentColor` field in the `updateShopSettings` Zod schema in `src/app/admin/settings/actions.ts`: `.regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Couleur invalide")` — prevent non-hex values from persisting

- [X] T009 [US1] In `src/app/admin/layout.tsx`, add `accentColor` to the destructured store values from `useSettingsStore()`, and in the existing `useEffect([shopName, faviconUrl])` also call `document.documentElement.style.setProperty('--primary', accentColor)` so the color updates live when settings change

- [X] T010 [P] [US1] In `src/app/admin/login/page.tsx`, replace the 3 hardcoded "FLEXBOX"/"FLEXBOX DIRECT" display strings — make the page an `async` server component, call `SystemQueries.getPublicSettings()`, and pass `shopName` to the relevant `<h1>`, footer, and copyright text

- [X] T011 [P] [US1] In `src/app/admin/analytics/page.tsx`, replace the hardcoded `"Tableau de Bord Analytique | Flexbox Admin"` metadata title — convert to `generateMetadata` async function that fetches `SystemQueries.getPublicSettings()` and returns `{ title: \`Analytique | \${shopName}\` }`

**Checkpoint**: US1 complete — admin can configure identity and the admin UI reflects it instantly.

---

## Phase 4: User Story 2 — Branding in the Kiosk (Priority: P2)

**Goal**: Kiosk shows configured shop logo/name and uses primary color for all accents. Zero hardcoded orange or "FLEXBOX" visible in kiosk.

**Independent Test**: With US1 settings saved (name="AcmeCorp", color="#1a73e8"), open `/kiosk` — verify name, logo (if set), and blue color appear. No orange, no "FLEXBOX".

### Implementation

- [X] T012 [US2] In `src/app/kiosk/KioskContent.tsx`, extract `accentColor` from `useSettingsStore()` and add a `useEffect([accentColor])` that calls `document.documentElement.style.setProperty('--primary', accentColor)` when the kiosk mounts and whenever the color changes

- [X] T013 [P] [US2] In `src/app/kiosk/views/IdleView.tsx`, update the logo display: if `logoUrl` is set (from `useSettingsStore`), render `<img src={logoUrl} alt={shopName} className="h-10 object-contain" />` else render the existing shopName text; change the `|| "FLEXBOX"` fallback to `|| shopName` (shopName is already dynamic from the store)

- [X] T014 [P] [US2] Audit remaining kiosk component files (`src/app/kiosk/components/PlayerIdModal.tsx`, `src/app/kiosk/components/ProductModal.tsx`, `src/app/kiosk/components/SupportModal.tsx`) and confirm all `[#ec5b13]` instances have been replaced by T006; fix any remaining hardcoded values

**Checkpoint**: US2 complete — kiosk is fully white-labeled.

---

## Phase 5: User Story 3 — Branding on Thermal Receipts (Priority: P3)

**Goal**: Receipts show configured shop name (and logo if enabled) instead of "FLEXBOX II".

**Independent Test**: With shopName="AcmeCorp" configured, trigger any order receipt — verify "AcmeCorp" appears at the top, not "FLEXBOX II".

### Implementation

- [X] T015 [US3] In `src/components/admin/receipt/ThermalReceipt.tsx`, replace the hardcoded `<h1>FLEXBOX II</h1>` — read `shopName` from `useSettingsStore()` (or accept it as a prop from the parent that already has it) and render `<h1>{shopName}</h1>`; also conditionally render `<img>` if the `showLogo` setting and `logoUrl` are both set

**Checkpoint**: US3 complete — receipts reflect the configured shop name.

---

## Phase 6: User Story 4 — Branding in WhatsApp Notifications (Priority: P3)

**Goal**: All WhatsApp messages sent by the system reference the configured shop name, not "FLEXBOX DIRECT".

**Independent Test**: Configure shopName="AcmeCorp", trigger a WhatsApp delivery/support message — verify "AcmeCorp" appears, not "FLEXBOX DIRECT".

### Implementation

- [X] T016 [US4] In `src/app/api/webhooks/whatsapp/route.ts`, at the start of the relevant handler function, fetch `await SystemQueries.getSettings()` to get `shopName`, then replace the 3 hardcoded "FLEXBOX DIRECT" string literals in `closingMsg`, `ticketMsg`, and `defaultRole` with template literals using the fetched `shopName`

- [X] T017 [P] [US4] In `src/components/admin/ClientsContent.tsx`, replace the hardcoded `"FLEXBOX DIRECT"` in the WhatsApp receipt message template (line ~267) with `shopName` from `useSettingsStore()`

**Checkpoint**: US4 complete — all outbound WhatsApp messages use the configured shop name.

---

## Phase 7: User Story 5 — Dynamic Favicon and Browser Tab Title (Priority: P4)

**Goal**: Browser tab shows configured favicon and shop name in page title for all app routes.

**Independent Test**: Configure faviconUrl and shopName, reload `/admin` — browser tab icon and title both reflect configured values.

### Implementation

- [X] T018 [US5] In `src/app/layout.tsx`, convert `export const metadata` from a static object to `export async function generateMetadata()` — fetch `SystemQueries.getSettings()`, return dynamic `title` using `shopName`, dynamic `icons.icon` using `faviconUrl` (fallback to `/favicon.ico`), and dynamic `viewport.themeColor` using `accentColor` (replacing hardcoded `"#ec5b13"`)

**Checkpoint**: US5 complete — browser tab is fully branded.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Remaining "FLEXBOX" string cleanup across non-admin pages and default value normalization.

- [X] T019 [P] In `src/app/b2b/page.tsx`, replace the 3 hardcoded "FLEXBOX DIRECT"/"FLEXBOX B2B" display strings — make the page or parent server component fetch `SystemQueries.getPublicSettings()` and pass `shopName` to the JSX

- [X] T020 [P] In `src/app/reseller/layout.tsx` and `src/app/reseller/login/page.tsx`, replace the 4 hardcoded "FLEXBOX DIRECT"/"FLEXBOX BUSINESS SOLUTION" strings — fetch `SystemQueries.getPublicSettings()` in each server component and inject `shopName`

- [X] T021 [P] In `src/components/admin/settings/ApiBotSettings.tsx`, replace the 4 hardcoded "FLEXBOX DIRECT" strings in the default AI prompt templates — read `shopName` from `useSettingsStore()` and interpolate into the default prompt strings (or read `shopData.shopName` which is already in the component's local state from the settings form)

- [X] T022 [P] In `src/components/reseller/ResellerSidebar.tsx`, replace the hardcoded `"FLEXBOX"` fallback text in the sidebar logo area — use `shopName` from `useSettingsStore()`

- [X] T023 [P] In `src/app/admin/settings/actions.ts`, replace the 2 hardcoded "FLEXBOX DIRECT" strings in the test WhatsApp message body and the TOTP `issuer` field — use `settings.shopName` (the settings object is already fetched earlier in the same function)

- [X] T024 Update the hardcoded "FLEXBOX Direct" default strings in `src/store/useSettingsStore.ts` (initial state + fetchSettings fallback) and `src/services/queries/system.queries.ts` (fallback strings) — change to `"Ma Boutique"` as a neutral, non-branded placeholder

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — **BLOCKS all user stories**
- **Phase 3–7 (User Stories)**: All depend on Phase 2 completion
  - US1 must complete before US2 (kiosk reads from same store)
  - US3, US4, US5 are independent of each other and of US2
- **Phase 8 (Polish)**: Can begin any time after Phase 2; all tasks are independent

### User Story Dependencies

- **US1 (P1)**: Requires Foundational — no other story dependency
- **US2 (P2)**: Requires US1 (admin must first save settings for kiosk to reflect them in testing)
- **US3 (P3)**: Requires Foundational only — independent of US1/US2
- **US4 (P3)**: Requires Foundational only — independent
- **US5 (P4)**: Requires Foundational only — independent

### Within Each Phase

- T002 → T003 → T004 (sequential: store first, then injector, then layout)
- T005 parallel with T006, T007 (different files, no dependency)
- T006 is the largest single task (sed batch) — complete before any color-dependent visual validation

### Parallel Opportunities

- T005, T006, T007 can run in parallel (different files)
- T010, T011 within US1 can run in parallel (different files)
- T013, T014 within US2 can run in parallel
- T016, T017 within US4 can run in parallel
- All Phase 8 tasks (T019–T024) are fully independent and can run in parallel

---

## Parallel Example: Phase 2 (Foundational)

```
Sequential:
  T002 (store extension) → T003 (BrandingInjector) → T004 (add to layout)

Parallel batch:
  T005 (extend SystemQueries) ── can run alongside T002/T003/T004
  T006 (batch color replace)  ── can run alongside T005
  T007 (SVG/recharts fixes)   ── can run alongside T006
```

---

## Implementation Strategy

### MVP First (US1 Only — ~8 tasks)

1. Complete Phase 1 (T001)
2. Complete Phase 2 (T002–T007)
3. Complete Phase 3/US1 (T008–T011)
4. **STOP and VALIDATE**: Open `/admin/settings`, change name + color, verify admin panel updates
5. Ship MVP — admin identity configuration works

### Full Delivery Order

```
Phase 1 → Phase 2 → US1 → US2 → (US3 ‖ US4 ‖ US5) → Polish
```

### Total: 24 tasks across 8 phases
- Phase 1: 1 task
- Phase 2: 6 tasks (foundational — highest leverage)
- US1: 4 tasks
- US2: 3 tasks
- US3: 1 task
- US4: 2 tasks
- US5: 1 task
- Polish: 6 tasks

---

## Notes

- T006 (batch sed replace) is the highest-impact single task — 529+ occurrences, zero logic change
- T007 (SVG fixes) requires reading component code to understand data flow before editing
- T018 (`generateMetadata`) requires converting static export to async function — Next.js supports this
- All Phase 8 tasks are optional for MVP but required for SC-003 (zero "FLEXBOX" in user-facing output)
- After T006, run `npm run build` to confirm no TypeScript errors from the replacement
