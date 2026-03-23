# Data Model: Refonte CatalogueView Kiosk

**Feature**: 001-catalogue-view-redesign | **Date**: 2026-03-23

## Entités UI

### Product (props)

| Champ | Type | Rôle UI |
|-------|------|---------|
| `id` | `number` | Key React |
| `name` | `string` | Titre carte, filtre recherche |
| `imageUrl` | `string \| null` | Image aspect-square (placeholder si null) |
| `categoryId` | `number \| null` | Filtre par catégorie |
| `variants` | `Variant[]` | Calcul prix minimum, stock total |

### Variant (dans Product)

| Champ | Type | Rôle UI |
|-------|------|---------|
| `id` | `number` | Référence dans CartItem |
| `salePriceDzd` | `string \| number` | Prix affiché ("From X DA") |
| `stockCount` | `number` | 0 = "Out of stock" |

### Category (props)

| Champ | Type | Rôle UI |
|-------|------|---------|
| `id` | `number` | Valeur du filtre actif |
| `name` | `string` | Label chip + mapping icône Material |

### CartItem (Zustand store)

| Champ | Type | Rôle UI |
|-------|------|---------|
| `variantId` | `number` | Key, cible updateQuantity/removeFromCart |
| `productName` | `string` | Nom affiché sidebar |
| `name` | `string` | Variante affichée sidebar |
| `price` | `string` | Prix × quantité dans sidebar |
| `quantity` | `number` | Affiché + boutons +/− |
| `imageUrl` | `string?` | Miniature sidebar |

## State local (CatalogueView)

| State | Type | Valeur initiale | Rôle |
|-------|------|-----------------|------|
| `selectedCategoryId` | `number \| null` | `null` | Filtre catégorie actif ("Tout" si null) |
| `searchTerm` | `string` | `""` | Filtre texte recherche |
| `selectedProduct` | `any \| null` | `null` | Produit ouvert dans ProductModal |

## Icônes Material Symbols par catégorie

| Mot-clé (toLowerCase) | Icône |
|----------------------|-------|
| `gaming`, `jeux`, `game` | `sports_esports` |
| `streaming`, `stream`, `video` | `live_tv` |
| `carte`, `card`, `cadeau`, `gift` | `redeem` |
| `recharge`, `mobile`, `téléphone` | `smartphone` |
| `musique`, `music` | `music_note` |
| *(défaut)* | `apps` |

## Contrats UI (interface entre composants)

### CatalogueView → ProductModal

```typescript
// Props transmises via setSelectedProduct(product)
isOpen: boolean          // !!selectedProduct
onClose: () => void      // () => setSelectedProduct(null)
product: any | null      // selectedProduct
```

### CatalogueView → CartSidebar (interne)

```typescript
cart: CartItem[]                     // useKioskStore
updateQuantity: (variantId, delta) => void
removeFromCart: (variantId) => void
getTotalAmount: () => number
onCheckout: () => void               // () => setStep("CART")
```
