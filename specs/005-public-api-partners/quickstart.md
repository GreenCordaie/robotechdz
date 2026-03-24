# Quickstart: API Publique Partenaires

**Feature**: 005-public-api-partners

---

## Setup

1. Créer une clé API depuis `/admin/settings` (SUPER_ADMIN) → copier la clé affichée
2. Stocker la clé : `export API_KEY="rbt_votre_clé_ici"`

---

## Test Scenarios (Manuel)

### Scenario 1 — GET catalogue produits (US1)

```bash
curl -H "X-API-Key: $API_KEY" http://localhost:1556/api/v1/products
```
**Vérifier**: JSON avec `data` (array produits), chaque produit a `id`, `name`, `category`, `minPrice`, `availableStock`, `variants`.

### Scenario 2 — GET catalogue filtré par catégorie (US1)

```bash
curl -H "X-API-Key: $API_KEY" "http://localhost:1556/api/v1/products?category=Gaming"
```
**Vérifier**: Seuls les produits de la catégorie Gaming retournés.

### Scenario 3 — GET détail produit (US1)

```bash
curl -H "X-API-Key: $API_KEY" http://localhost:1556/api/v1/products/1
```
**Vérifier**: Produit avec ses variantes, `availableStock` correct.

### Scenario 4 — Rejet clé invalide (US1)

```bash
curl -H "X-API-Key: rbt_invalide" http://localhost:1556/api/v1/products
```
**Vérifier**: HTTP 401, `{ "error": "Unauthorized" }`.

### Scenario 5 — Créer une commande (US2)

```bash
curl -X POST \
  -H "X-API-Key: $API_KEY_READWRITE" \
  -H "Content-Type: application/json" \
  -d '{"variantId": 1, "quantity": 1, "partnerReference": "TEST-001"}' \
  http://localhost:1556/api/v1/orders
```
**Vérifier**: HTTP 201, réponse avec `orderId`, `status: "PAYE"`, `items[0].codes` non vide.

### Scenario 6 — Commande avec stock insuffisant (US2)

```bash
# Utiliser un variantId avec 0 stock
curl -X POST \
  -H "X-API-Key: $API_KEY_READWRITE" \
  -H "Content-Type: application/json" \
  -d '{"variantId": 999, "quantity": 100}' \
  http://localhost:1556/api/v1/orders
```
**Vérifier**: HTTP 422, `{ "error": "Unprocessable Entity", "details": "Stock insuffisant" }`.

### Scenario 7 — Clé READ tente un POST (US2)

```bash
curl -X POST \
  -H "X-API-Key: $API_KEY_READONLY" \
  -H "Content-Type: application/json" \
  -d '{"variantId": 1, "quantity": 1}' \
  http://localhost:1556/api/v1/orders
```
**Vérifier**: HTTP 403, `{ "error": "Forbidden" }`.

### Scenario 8 — GET statut commande (US2)

```bash
curl -H "X-API-Key: $API_KEY" http://localhost:1556/api/v1/orders/142
```
**Vérifier**: JSON avec statut, items et codes.

### Scenario 9 — Rate limiting (edge case)

```bash
for i in {1..105}; do curl -s -o /dev/null -w "%{http_code}\n" -H "X-API-Key: $API_KEY" http://localhost:1556/api/v1/products; done
```
**Vérifier**: Les 100 premières → 200, à partir de la 101ème → 429.

### Scenario 10 — Gestion clés admin (US3)

1. Aller sur `/admin/settings` en SUPER_ADMIN
2. Section "Clés API Partenaires" → créer une clé "Test Partner" en READ_WRITE
3. Copier la clé → l'utiliser dans Scenario 5
4. Révoquer la clé
5. **Vérifier**: L'ancienne clé retourne maintenant 401

### Scenario 11 — Données sensibles absentes (edge case)

```bash
curl -H "X-API-Key: $API_KEY" http://localhost:1556/api/v1/products | grep -i "purchasePrice\|keyHash\|password\|code.*DISPONIBLE"
```
**Vérifier**: Aucun résultat (données sensibles absentes).
