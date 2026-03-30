# Plan: Visual Pixel Audit (God Mode)

## Strategy Overview
The audit is divided into two phases: **Core Hardening** (Global styles and shared components) and **Page-by-Page Refinement**.

## Phase 1: Core Hardening
1. **Globals**: Update `globals.css` with premium utility classes.
2. **Standardization**: Enforce 8px grid logic across Tailwind configurations.
3. **Skeleton Sync**: Update `PageSkeleton.tsx` to match the grid.

## Phase 2: Page-by-Page Audit
1. **Admin Dashboard**: Fix stat card spacing and chart alignments.
2. **Kiosk**: Optimize touch targets and modal depth.
3. **Clients & Orders**: Align tables and action sets.

## Tools
- Browser DevTools (Grid Inspector)
- React DevTools
- Playwright (Visual Regression)
