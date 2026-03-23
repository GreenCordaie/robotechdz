# Research: Refonte CatalogueView Kiosk

**Feature**: 001-catalogue-view-redesign | **Date**: 2026-03-23

## Décisions de Design

### Layout 75/25 Desktop vs Sidebar fixe

**Decision**: Layout `flex` root — `main` avec `flex-1` (max ~75%) + `aside` fixe droite (`w-[25%]`).

**Rationale**: Correspond exactement au mockup Stitch. La sidebar est `fixed right-0` pour rester visible pendant le scroll de la grille.

**Alternatives considered**: Grid CSS 3/1 columns — rejeté car le sidebar doit être `fixed` (hors flux normal).

---

### Grille produits

**Decision**: `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6` dans la zone principale.

**Rationale**: 4 colonnes sur desktop (borne kiosk ≥ 1024px), 2 sur mobile. Correspond au mockup.

**Alternatives considered**: `auto-fill` avec largeur fixe — rejeté car less responsive sur différentes résolutions de borne.

---

### Image produit

**Decision**: `div` avec `aspect-square` + `object-cover`, `<img>` standard (pas `next/image`) pour les cartes.

**Rationale**: `next/image` nécessite des domaines autorisés en config. Les URLs produits peuvent venir de divers hébergeurs. La carte utilise `<img>` comme dans le code existant.

**Alternatives considered**: `next/image` — possible si les domaines sont configurés dans `next.config.js`, mais introduce une dépendance de config.

---

### Chips catégories avec icônes

**Decision**: Map statique des icônes Material Symbols par nom de catégorie (Gaming → `sports_esports`, Streaming → `live_tv`, etc.). Fallback `apps` pour les catégories inconnues.

**Rationale**: Les icônes Material Symbols sont déjà chargées. Pas de dépendance supplémentaire.

**Alternatives considered**: Stocker l'icône en DB — over-engineering pour une borne.

---

### Sidebar cart (desktop) vs FAB (mobile)

**Decision**: `hidden lg:flex` pour la sidebar, `lg:hidden` pour le FAB + BottomNav mobile.

**Rationale**: Breakpoint `lg` (1024px) correspond à la résolution minimum des bornes kiosk.

**Alternatives considered**: CSS container queries — plus précis mais pas nécessaire ici.

---

### Logique métier conservée

**Decision**: `useKioskStore` (cart, addToCart, updateQuantity, removeFromCart, setStep), `ProductModal`, `formatCurrency` — zéro modification.

**Rationale**: Seule l'UI change. La logique métier est testée et stable.

---

### Token couleurs

| Token | Valeur |
|-------|--------|
| Primary | `#FF8000` → classe Tailwind `text-[#FF8000]` / `bg-[#FF8000]` |
| Primary hover | `#E67300` → `hover:bg-[#E67300]` |
| Background | `#F5F5F7` → `bg-[#F5F5F7]` |
| Card | `#FFFFFF` avec shadow `0 4px 24px rgba(0,0,0,0.06)` |
| Border radius card | `24px` → `rounded-3xl` (= 24px) |
| Texte muted | `#86868B` → `text-[#86868B]` |

> Note : `rounded-3xl` = 24px en Tailwind v3.
