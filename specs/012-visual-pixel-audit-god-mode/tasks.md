# Tasks: Visual Pixel Audit (God Mode)

## Phase 1: Core Hardening (Foundational)

- [x] T001 Update `globals.css` with `.glass-premium` and `.card-premium` utilities using strict backdrop-blur and border-opacity standards.
- [x] T002 Implement global focus reset in `globals.css` to ensure consistent focus rings or zero-outline where appropriate.
- [x] T001 Update `globals.css` with `.glass-premium` and `.card-premium` utilities using strict backdrop-blur and border-opacity standards.
- [x] T002 Implement global focus reset in `globals.css` to ensure consistent focus rings or zero-outline where appropriate.
- [x] T003 Fix `src/components/admin/PageSkeleton.tsx` to use fixed heights (e.g., `h-11`, `h-32`) that align with the 8px grid.

## Phase 2: Page-by-Page Refinement

### Admin Dashboard
- [x] T004 Standardize `p-6` (24px) padding for all StatCards.
- [x] T005 Align chart containers with the grid (ensure equal left/right margins).

### Kiosk
- [ ] T006 Audit all buttons in the kiosk; ensure `h-11` (44px) for touch precision.
- [ ] T007 Apply `.glass-premium` to all kiosk modals.
- [ ] T008 Fix any "floating" elements that aren't perfectly centered.

### Clients & Orders
- [ ] T009 Standardize table row heights across `ClientsContent.tsx` and `CommandesContent.tsx`.
- [ ] T010 Audit spacing between action icons (consistent `gap-4`).

## Phase 3: Verification
- [ ] T011 Full application walkthrough on mobile viewport.
- [ ] T012 Verify all lazy-loaded modals have perfect entry/exit animations.
