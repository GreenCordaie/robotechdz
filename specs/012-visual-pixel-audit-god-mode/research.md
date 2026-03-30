# Research: Visual Inconsistencies & UI Patterns

## Current UI State Analysis

### 🎨 Color Palette
- **Primary**: Implemented as `--primary` via `BrandingInjector`.
- **Backgrounds**: `--background-dark` (`#221610`) and `--background-light` (`#f8f6f6`).
- **Issue**: Some components still might use hardcoded `gray-XXX` or `slate-XXX` which clash with the custom background tones.

### 📐 Spacing & Alignment
- **Mixed Units**: Project uses a mix of Tailwind's default spacing (e.g., `p-4`, `m-2`).
- **Issue**: No strictly enforced 8px grid. Some modals have 16px padding on top but 12px on bottom.
- **Form Fields**: Inputs have varying heights and border-radius.

### 🍱 Components & Systems
- **Skeleton System**: Recently implemented in v9.0.1. Used for all core routes.
- **Lazy Loading**: Active for all 17 modals.
- **Glassmorphism**: Present in some areas but lacks a unified configuration (variable blur/opacity).

## God Mode Recommendations

### 📍 Fix 1: Universal Spacing Map
Map all Tailwind spacing tokens to a strict 8px logic:
- `1` -> 4px
- `2` -> 8px
- `4` -> 16px
- `6` -> 24px
- `8` -> 32px
- *Avoid usage of 3, 5, 7, 9.*

### 📍 Fix 2: Component Hardening
- **Buttons**: Unified `h-11` (44px) for mobile-first precision.
- **Cards**: Unified `rounded-2xl` (16px) with absolute `p-6` (24px) padding.
- **Typography**: Force `antialiased` globally and use `text-balance` for all titles.

### 📍 Fix 3: Material Depth
- Create a global `.glass-premium` class:
  ```css
  bg-black/20 backdrop-blur-xl border border-white/10 shadow-2xl
  ```
- Use this for all Modals (Mobile & Desktop).
