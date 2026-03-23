# Feature Specification: Refonte CatalogueView Kiosk

**Feature Branch**: `001-catalogue-view-redesign`
**Created**: 2026-03-23
**Status**: Draft

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Parcourir et ajouter un produit (Priority: P1)

Un client devant la borne kiosk voit le catalogue en grille. Il peut chercher un produit par nom et toucher le bouton `+` pour ouvrir le modal de sélection de variante. Son panier se met à jour en temps réel dans la sidebar droite (desktop) ou via le badge FAB (mobile).

**Why this priority**: Flux principal — sans ça la borne est inutilisable.

**Independent Test**: Ouvrir CATALOGUE → toucher `+` d'un produit disponible → le `ProductModal` s'ouvre → sélectionner une variante → le panier se met à jour.

**Acceptance Scenarios**:

1. **Given** le catalogue est chargé, **When** le client touche `+` d'un produit disponible, **Then** le `ProductModal` s'ouvre.
2. **Given** un produit est en rupture, **When** le client voit sa carte, **Then** le bouton `+` est absent et "Out of stock" s'affiche en gris.
3. **Given** le client tape dans la recherche, **When** le texte change, **Then** seuls les produits dont le nom correspond s'affichent.

---

### User Story 2 - Filtrer par catégorie (Priority: P2)

Le client touche un chip de catégorie (Gaming, Streaming, Cartes Cadeaux) pour voir uniquement les produits de cette catégorie. Le chip actif est en orange.

**Why this priority**: Accélère la navigation pour les clients qui savent ce qu'ils veulent.

**Independent Test**: Toucher un chip → grille filtrée → toucher "Tout" → tous les produits réapparaissent.

**Acceptance Scenarios**:

1. **Given** plusieurs catégories existent, **When** le client touche un chip, **Then** la grille filtre et le chip devient orange.
2. **Given** une catégorie est active, **When** le client touche "Tout", **Then** tous les produits réapparaissent.

---

### User Story 3 - Gérer le panier (desktop sidebar) (Priority: P3)

Sur un grand écran, la sidebar droite (25%) affiche en permanence le panier avec image, nom, prix, contrôles quantité +/−, total et bouton "Terminer et Commander".

**Why this priority**: Évite de naviguer vers une vue séparée sur grand écran.

**Independent Test**: Ajouter 2 produits → sidebar affiche items + total → toucher "Terminer et Commander" → transition vers CART.

**Acceptance Scenarios**:

1. **Given** des items sont dans le panier, **When** la sidebar est visible, **Then** chaque item affiche image, nom, prix et boutons +/−.
2. **Given** le panier est non vide, **When** le client touche "Terminer et Commander", **Then** `setStep("CART")` est appelé.
3. **Given** le panier est vide, **When** la sidebar est affichée, **Then** "Votre panier est vide" s'affiche.

---

### Edge Cases

- `products` vide → "Aucun produit disponible" dans la grille.
- Produit sans image → placeholder gris avec icône produit.
- Recherche sans résultat → "Aucun résultat pour '…'".
- `product.variants` vide ou indéfini → masquer le prix, désactiver le bouton `+`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le système DOIT afficher une barre de recherche large avec icône Material Symbols `search`.
- **FR-002**: Le système DOIT afficher des chips de catégories en scroll horizontal avec icônes Material Symbols (`apps`, `sports_esports`, `live_tv`, `redeem`). Le chip "Tout" est toujours présent en premier.
- **FR-003**: Le système DOIT afficher les produits en grille — 4 colonnes sur desktop (zone 75%), 2 colonnes sur mobile.
- **FR-004**: Chaque carte produit DOIT afficher : image aspect-square, nom, "From" + prix minimum en orange, bouton `+` rond orange (stock > 0) ou label "Out of stock" gris (stock = 0).
- **FR-005**: Toucher le bouton `+` DOIT ouvrir le `ProductModal` existant (logique inchangée).
- **FR-006**: Sur desktop (lg+), le système DOIT afficher une sidebar fixe droite (25%) "Ma Sélection" avec items, quantités modifiables +/−, total et bouton "Terminer et Commander".
- **FR-007**: Sur mobile, le système DOIT afficher un FAB panier avec badge de comptage et une BottomNavBar fixe.
- **FR-008**: Toute la logique métier existante (`useKioskStore`, `ProductModal`, filtrage, `formatCurrency`) DOIT être conservée.
- **FR-009**: Le design DOIT utiliser les tokens : primary `#FF8000`, background `#F5F5F7`, cards `#FFFFFF`, shadow `0 4px 24px rgba(0,0,0,0.06)`, border-radius cards `24px`.

### Key Entities

- **Product**: `id, name, imageUrl, categoryId, variants[]` — affiché en carte.
- **CartItem**: `variantId, productId, name, productName, price, quantity, imageUrl` — affiché en sidebar/FAB.
- **Category**: `id, name` — utilisé pour les chips de filtre.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un client peut trouver et ajouter un produit au panier en moins de 10 secondes depuis l'affichage du catalogue.
- **SC-002**: La grille affiche tous les produits sans troncature ni overflow visible.
- **SC-003**: Le filtre par catégorie s'applique instantanément (synchrone, aucun chargement).
- **SC-004**: La sidebar desktop reflète en temps réel toute modification du panier.
- **SC-005**: Le rendu visuel correspond au mockup Stitch — layout 75/25, couleurs orange `#FF8000`, arrondis `24px`.

## Assumptions

- Les données `products` et `categories` sont déjà chargées et passées en props par `KioskContent.tsx`.
- `formatCurrency` de `@/lib/formatters` est conservé pour l'affichage des prix en DZD.
- Le `ProductModal` existant est conservé sans modification.
- L'écran kiosk est en mode paysage (landscape) ≥ 1024px — layout desktop prioritaire.
- Les icônes Material Symbols sont déjà disponibles via `globals.css`.
- La sauvegarde `CatalogueView.tsx.bak` est conservée avant toute modification.
