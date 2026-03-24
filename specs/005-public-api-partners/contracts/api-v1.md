# API Contract: /api/v1/*

**Feature**: 005-public-api-partners

---

## Authentification (toutes les routes)

**Header requis**: `X-API-Key: rbt_<64-hex-chars>`

**Erreur 401** si absent ou invalide :
```json
{ "error": "Unauthorized", "details": "Invalid or revoked API key" }
```

**Erreur 429** si rate limit dépassé (100 req/min) :
```json
{ "error": "Too Many Requests", "details": "Rate limit exceeded" }
```
+ Header `Retry-After: 60`

---

## GET /api/v1/products

**Auth**: READ ou READ_WRITE
**Query params**: `?category=Gaming` (optionnel)

**Response 200**:
```json
{
    "data": [
        {
            "id": 1,
            "name": "Netflix Premium",
            "description": "Abonnement Netflix 1 mois",
            "category": "Streaming",
            "minPrice": 1200,
            "availableStock": 47,
            "variants": [
                { "id": 3, "name": "1 mois", "price": 1200, "stock": 25 },
                { "id": 4, "name": "3 mois", "price": 3200, "stock": 22 }
            ]
        }
    ],
    "total": 1
}
```

**Règles**:
- Seuls les produits `status = ACTIVE` sont retournés
- `availableStock` = somme des codes DISPONIBLE + slots libres de toutes les variantes
- `minPrice` = prix minimum parmi les variantes actives
- Tri par nom de produit (alphabétique)

---

## GET /api/v1/products/{id}

**Auth**: READ ou READ_WRITE

**Response 200**: Même format que ci-dessus, un seul objet (pas de tableau)

**Response 404**:
```json
{ "error": "Not Found", "details": "Product not found or not available" }
```

---

## POST /api/v1/orders

**Auth**: READ_WRITE uniquement (403 si READ)

**Request Body**:
```json
{
    "variantId": 3,
    "quantity": 2,
    "partnerReference": "ORDER-2026-001"
}
```

**Validation**:
- `variantId`: entier positif, requis
- `quantity`: entier 1..10, requis
- `partnerReference`: string max 100 chars, optionnel

**Response 201** (succès) :
```json
{
    "orderId": 142,
    "orderNumber": "ORD-2026-0142",
    "status": "PAYE",
    "partnerReference": "ORDER-2026-001",
    "items": [
        {
            "variantId": 3,
            "variantName": "Netflix 1 mois",
            "quantity": 2,
            "unitPrice": 1200,
            "codes": ["NETF-XXXX-YYYY", "NETF-AAAA-BBBB"]
        }
    ]
}
```

**Response 422** stock insuffisant :
```json
{ "error": "Unprocessable Entity", "details": "Stock insuffisant", "availableStock": 1 }
```

**Response 403** permissions insuffisantes :
```json
{ "error": "Forbidden", "details": "This API key requires READ_WRITE permissions" }
```

**Response 400** payload invalide :
```json
{ "error": "Bad Request", "details": "variantId is required and must be a positive integer" }
```

---

## GET /api/v1/orders/{id}

**Auth**: READ ou READ_WRITE

**Response 200**:
```json
{
    "orderId": 142,
    "orderNumber": "ORD-2026-0142",
    "status": "PAYE",
    "partnerReference": "ORDER-2026-001",
    "createdAt": "2026-03-23T21:00:00.000Z",
    "items": [
        {
            "variantId": 3,
            "variantName": "Netflix 1 mois",
            "quantity": 2,
            "unitPrice": 1200,
            "codes": ["NETF-XXXX-YYYY", "NETF-AAAA-BBBB"]
        }
    ]
}
```

**Sécurité**: Un partenaire ne peut consulter que les commandes créées avec sa propre clé API (filtre par `apiKeyId` dans la commande).

**Response 404** :
```json
{ "error": "Not Found", "details": "Order not found" }
```

---

## Server Actions Contract (Admin UI)

**File**: `src/app/admin/settings/actions.ts` (ajouts)

```typescript
// SUPER_ADMIN only
createApiKey({ name, permissions }): Promise<{ key: string; record: ApiKeyRecord }>
// key est retourné UNE SEULE FOIS — non stocké en DB
revokeApiKey({ id }): Promise<void>
listApiKeys(): Promise<ApiKeyRecord[]>
```

```typescript
interface ApiKeyRecord {
    id: number;
    name: string;
    permissions: "READ" | "READ_WRITE";
    isActive: boolean;
    createdAt: Date;
    lastUsedAt: Date | null;
    callsThisMonth: number;
    keyPrefix: string; // "rbt_****...****" — premiers/derniers chars pour identification
}
```
