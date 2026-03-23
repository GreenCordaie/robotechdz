# Tasks: Refonte CatalogueView Kiosk

**Input**: Design documents from `/specs/001-catalogue-view-redesign/`
**Branch**: `001-catalogue-view-redesign`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallélisable (fichiers différents, pas de dépendance)
- **[Story]**: User story concernée (US1, US2, US3)

---

## Phase 1: Setup

**Purpose**: Sauvegarde et préparation avant modification

- [x] T001 Vérifier que `src/app/kiosk/views/CatalogueView.tsx.bak` existe (sauvegarde de l'original)
- [x] T002 [P] Lire `src/store/useKioskStore.ts` — noter les actions disponibles (cart, addToCart, updateQuantity, removeFromCart, setStep, getTotalAmount)
- [x] T003 [P] Lire `src/lib/formatters.ts` — confirmer la signature de `formatCurrency`
- [x] T004 [P] Lire `src/app/kiosk/components/ProductModal.tsx` — confirmer les props attendues (isOpen, onClose, product)

---

## Phase 2: Foundational (Bloquant)

**Purpose**: Structure du fichier et tokens de design établis avant toute UI

**⚠️ CRITIQUE**: Doit être terminé avant les phases US

- [x] T005 Réécrire `src/app/kiosk/views/CatalogueView.tsx` — structure root : `div.flex.h-screen.w-screen.overflow-hidden.bg-[#F5F5F7]` avec zone `main` flex-1 + `aside` sidebar (hidden lg:flex)
- [x] T006 Déclarer les states locaux dans `CatalogueView` : `selectedCategoryId`, `searchTerm`, `selectedProduct`
- [x] T007 Brancher `useKioskStore` (cart, addToCart, updateQuantity, removeFromCart, setStep, getTotalAmount) et `useSettingsStore` (shopName)
- [x] T008 Conserver la logique de filtrage `filteredProducts` (useMemo sur products + selectedCategoryId + searchTerm)

**Checkpoint**: Squelette compilé sans erreur TypeScript

---

## Phase 3: User Story 1 — Parcourir et ajouter un produit (P1) 🎯 MVP

**Goal**: Grille de produits fonctionnelle avec search, cartes produits, bouton `+` → ProductModal

**Independent Test**: Ouvrir CATALOGUE → voir la grille → toucher `+` d'un produit dispo → ProductModal s'ouvre

### Implémentation US1

- [x] T009 [US1] SearchBar dans `src/app/kiosk/views/CatalogueView.tsx` — `input` large avec icône `search` Material Symbols, `rounded-3xl`, shadow `0 4px 24px rgba(0,0,0,0.06)`, `onChange → setSearchTerm`
- [x] T010 [US1] Section produits dans la zone `main` — titre "Nos Produits", grille `grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 p-8`
- [x] T011 [US1] Carte produit dans `src/app/kiosk/views/CatalogueView.tsx` — `div rounded-3xl bg-white shadow overflow-hidden hover:scale-[1.02] transition-transform cursor-pointer`
- [x] T012 [US1] Image carte — `div aspect-square` avec `<img>` `object-cover w-full h-full`, placeholder gris avec icône SVG si `!product.imageUrl`
- [x] T013 [US1] Corps carte — nom produit (`font-semibold text-lg line-clamp-2`), label "From" + prix minimum (`text-[#FF8000] font-bold text-xl`) calculé via `formatCurrency(Math.min(...variants.map(v => v.salePriceDzd)))`
- [x] T014 [US1] Bouton `+` carte — `button` rond `bg-[#FF8000] hover:bg-[#E67300] text-white p-3 rounded-full shadow-lg` si `totalStock > 0`, sinon label "Out of stock" en `text-[#86868B]`
- [x] T015 [US1] `onClick` carte → `setSelectedProduct(product)` ; garde anti-crash si `variants` est vide/undefined
- [x] T016 [US1] `<ProductModal isOpen={!!selectedProduct} onClose={() => setSelectedProduct(null)} product={selectedProduct} />` — conservé sans modification à la fin du JSX

**Checkpoint**: Grille visible + ProductModal opérationnel — MVP livrable

---

## Phase 4: User Story 2 — Filtrer par catégorie (P2)

**Goal**: Chips de catégories fonctionnels avec icônes Material Symbols, filtre synchrone

**Independent Test**: Toucher un chip → grille filtrée immédiatement → toucher "Tout" → tout réapparaît

### Implémentation US2

- [x] T017 [P] [US2] Map d'icônes par mot-clé dans `src/app/kiosk/views/CatalogueView.tsx` — helper `getCategoryIcon(name: string): string` selon data-model.md (gaming→sports_esports, streaming→live_tv, carte→redeem, etc., défaut→apps)
- [x] T018 [US2] Chips catégories — scroll horizontal `overflow-x-auto` avec classe `.hide-scrollbar`, chip "Tout" en premier (`selectedCategoryId === null`), puis `categories.map(cat => ...)`
- [x] T019 [US2] Style chip actif — `bg-[#FF8000] text-white font-semibold px-8 py-3 rounded-full` ; chip inactif — `bg-white text-gray-800 border border-gray-200 px-8 py-3 rounded-full hover:bg-gray-100`
- [x] T020 [US2] Icône Material Symbol dans chaque chip — `<span className="material-symbols-outlined text-base">{getCategoryIcon(cat.name)}</span>`
- [x] T021 [US2] `onClick` chip → `setSelectedCategoryId(cat.id)` / `null` pour "Tout"

**Checkpoint**: Filtre par catégorie fonctionnel avec icônes

---

## Phase 5: User Story 3 — Sidebar cart desktop (P3)

**Goal**: Sidebar "Ma Sélection" fixe droite sur desktop (lg+) avec items, quantités +/−, total, bouton checkout

**Independent Test**: lg+ → sidebar visible → ajouter produit → item apparaît → +/− modifie quantité → total correct → "Terminer et Commander" → setStep("CART")

### Implémentation US3

- [x] T022 [US3] `<aside>` dans `CatalogueView.tsx` — `hidden lg:flex flex-col w-[25%] fixed right-0 top-0 bottom-0 bg-white border-l border-gray-200 shadow-2xl`
- [x] T023 [US3] Header sidebar — `<h2>Ma Sélection</h2>` + badge `<span>{cart.length} items</span>` avec style `bg-[#FF8000]/10 text-[#FF8000] rounded-full px-3 py-1`
- [x] T024 [US3] Liste items panier — `cart.map(item => ...)` avec miniature `80×80` (`rounded-xl object-cover`), nom (`font-semibold line-clamp-1`), prix (`text-[#FF8000] font-bold`)
- [x] T025 [US3] Contrôles quantité — boutons `−` / `+` (`w-12 h-12 rounded-xl bg-[#F5F5F7] font-bold`), affichage quantité, `onClick → updateQuantity(item.variantId, ±1)`
- [x] T026 [US3] Total + bouton checkout — section bas sidebar : `"Total"` + montant `getTotalAmount()` formaté + `<button onClick={() => setStep("CART")}>TERMINER ET COMMANDER</button>` en `bg-[#FF8000] rounded-3xl w-full py-6 font-bold text-xl`
- [x] T027 [US3] État vide — si `cart.length === 0` afficher message "Votre panier est vide" centré + bouton désactivé
- [x] T028 [P] [US3] Ajuster `main` pour avoir `padding-right` ou `margin-right` de ~25% sur lg+ afin d'éviter que le contenu passe sous la sidebar fixe

**Checkpoint**: Sidebar desktop complète et fonctionnelle

---

## Phase 6: Polish & Cross-Cutting

- [x] T029 [P] Ajouter classe `.hide-scrollbar` dans `src/app/globals.css` si absente (pour les chips catégories)
- [x] T030 [P] Vérifier état vide de la grille — si `filteredProducts.length === 0` afficher message "Aucun résultat pour '{searchTerm}'" ou "Aucun produit disponible"
- [x] T031 [P] Vérifier que `select-none touch-none` sont présents sur le root pour le contexte borne tactile
- [x] T032 Vérifier la compilation TypeScript — aucune erreur `any` non gérée, aucun import manquant
- [x] T033 Test visuel final — comparer le rendu avec le mockup Stitch (layout 75/25, couleurs, arrondis, shadows)

---

## Dépendances & Ordre d'Exécution

### Dépendances de phase

- **Phase 1 (Setup)**: Pas de dépendance — démarre immédiatement
- **Phase 2 (Foundational)**: Dépend de Phase 1 — **bloque toutes les US**
- **US1 (Phase 3)**: Dépend de Phase 2 — MVP livrable
- **US2 (Phase 4)**: Dépend de Phase 2 — indépendante de US1
- **US3 (Phase 5)**: Dépend de Phase 2 — indépendante de US1 et US2
- **Polish (Phase 6)**: Dépend de toutes les US désirées

### Opportunités de parallélisme

- T002, T003, T004 parallèles (Phase 1)
- T017, T020 parallèles (Phase 4)
- T022–T028 séquentiels (Phase 5, même fichier)
- T029, T030, T031 parallèles (Phase 6)

---

## Stratégie d'Implémentation

### MVP (US1 uniquement)

1. Phase 1 → Phase 2 → Phase 3 (T001–T016)
2. **STOP & VALIDER**: Grille + ProductModal fonctionnels
3. Livrer si satisfaisant

### Livraison incrémentale

1. Phase 1 + 2 → fondation compilée
2. Phase 3 (US1) → grille + modal → **démo**
3. Phase 4 (US2) → filtre catégories → **démo**
4. Phase 5 (US3) → sidebar cart → **démo complète**
5. Phase 6 → polish final

---

## Résumé

| Phase | Tâches | User Story |
|-------|--------|-----------|
| Phase 1 — Setup | T001–T004 | — |
| Phase 2 — Foundational | T005–T008 | — |
| Phase 3 — US1 Grille + Modal | T009–T016 | US1 (P1) 🎯 |
| Phase 4 — US2 Catégories | T017–T021 | US2 (P2) |
| Phase 5 — US3 Sidebar | T022–T028 | US3 (P3) |
| Phase 6 — Polish | T029–T033 | — |
| **Total** | **33 tâches** | |
