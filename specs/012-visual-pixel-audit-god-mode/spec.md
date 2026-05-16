# Feature Specification: Visual Pixel Audit (God Mode)

**Feature Branch**: `012-visual-pixel-audit`
**Created**: 2026-03-30
**Status**: Draft
**Input**: User description: "Planifie une audit visuel pixel par pixel god mode tu es dev ux ui senior appli web and mobile."

## Objective
Elevate the entire application to "God Mode" visual quality. This means absolute consistency in spacing, alignments, colors, typography, and interactive feedback across all web and mobile surfaces.

## Visual Standards (The "God Mode" Bar)

### 📏 Grid & Spacing
- **Rule**: Strict 8px (4px minor) base unit for all margins, paddings, and gaps.
- **Goal**: No "random" spacing values like `p-3` (12px) next to `p-4` (16px) without purpose.
- **Implementation**: Standardize components using fixed scale: 4, 8, 16, 24, 32, 40, 48, 64px.

### 🎨 Color & Depth
- **Rule**: Proper use of dynamic primary color with tiered surfaces.
- **Glassmorphism**: Consistent backdrop-blur (12px min) and border-opacity (10-20%) for overlays.
- **Shadows**: Usage of "Layered Shadows" (ring + shadow) for depth, avoiding flat appearances.

### 🔠 Typography
- **Hierarchy**: Clear distinction between Display, Heading, Body, and Micro-copy.
- **Font-Smoothing**: Antialiased rendering forced for all text.
- **Line-Height**: Optimized for readability (1.5 for body, 1.2 for headings).

### ✨ Micro-interactions
- **Feedback**: Every click/hover MUST have a visual state change (scale down on click, subtle lift on hover).
- **Motion**: Use `framer-motion` for all state entry/exits (smooth spring physics).
- **Loading**: Zero "pop-in" content; all async data must use the new Skeleton system.

## User Scenarios

### User Story 1 - Unified Visual Language
As a user, when I navigate between the Admin Dashboard and the Kiosk, I should feel it's the same premium product. Colors, radius, and shadows must match perfectly.

### User Story 2 - Mobile Precision
As a mobile user, interactive elements (buttons, inputs) must be perfectly sized for touch (min 44px height) with adequate spacing to avoid misclicks.

## Acceptance Criteria
- [ ] 100% compliance with the 8px grid system.
- [ ] Zero hardcoded color values (use `--primary`, `--background`, etc.).
- [ ] All modals use the dynamic lazy-loading pattern with perfect exit animations.
- [ ] Skeletons are implemented for every single async section.
- [ ] All borders use the same `rounded-xl` (12px) or `rounded-2xl` (16px) standard based on context.

## Measurable Outcomes
- **SC-001**: Navigation through core flows feels instantaneous and "buttery smooth" (60fps animations).
- **SC-002**: Visual consistency score (manual audit) matches across 100% of tested pages.
- **SC-003**: Lighthouse Accessibility score > 95 on all pages.
