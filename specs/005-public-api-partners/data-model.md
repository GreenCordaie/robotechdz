# Data Model: API Publique Partenaires

**Feature**: 005-public-api-partners
**Date**: 2026-03-23

---

## Nouvelles tables DB (migration `npm run db:push`)

### Table `partner_api_keys`

```typescript
export const partnerApiKeys = pgTable("partner_api_keys", {
    id:             serial("id").primaryKey(),
    name:           varchar("name", { length: 100 }).notNull(),            // Nom du partenaire
    keyHash:        varchar("key_hash", { length: 64 }).notNull().unique(), // SHA-256 hex
    permissions:    varchar("permissions", { length: 20 }).notNull().default("READ"), // READ | READ_WRITE
    isActive:       boolean("is_active").notNull().default(true),
    createdAt:      timestamp("created_at").notNull().defaultNow(),
    lastUsedAt:     timestamp("last_used_at"),
    callsThisMonth: integer("calls_this_month").notNull().default(0),
});
```

**Règles**:
- `keyHash` est l'unique identifiant de vérification — la clé originale n'est jamais stockée
- `callsThisMonth` est réinitialisé chaque mois (ou calculé depuis `apiLogs`)
- `permissions = "READ"` : accès GET uniquement ; `"READ_WRITE"` : GET + POST

---

### Table `api_logs`

```typescript
export const apiLogs = pgTable("api_logs", {
    id:             serial("id").primaryKey(),
    apiKeyId:       integer("api_key_id").notNull().references(() => partnerApiKeys.id),
    endpoint:       varchar("endpoint", { length: 200 }).notNull(),  // ex: "/api/v1/products"
    method:         varchar("method", { length: 10 }).notNull(),     // GET, POST
    statusCode:     integer("status_code").notNull(),
    responseTimeMs: integer("response_time_ms"),
    createdAt:      timestamp("created_at").notNull().defaultNow(),
});
```

---

## Types TypeScript (DTOs publics)

### ProductDTO — réponse `GET /api/v1/products`

```typescript
interface ProductDTO {
    id: number;
    name: string;
    description: string | null;
    category: string;
    minPrice: number;            // Prix minimum parmi les variantes
    availableStock: number;      // Total codes DISPONIBLE ou slots libres
    variants: VariantDTO[];
}

interface VariantDTO {
    id: number;
    name: string;
    price: number;
    stock: number;               // Codes dispo ou slots libres pour cette variante
}
```

**Champs EXCLUS** : `purchasePrice`, `supplierId`, `stockStatus`, codes numériques bruts

---

### OrderRequest — payload `POST /api/v1/orders`

```typescript
interface OrderRequest {
    variantId: number;           // ID de la variante commandée
    quantity: number;            // Quantité (1..10)
    partnerReference?: string;   // Référence optionnelle du partenaire (max 100 chars)
}
```

---

### OrderResponseDTO — réponse `POST /api/v1/orders`

```typescript
interface OrderResponseDTO {
    orderId: number;
    orderNumber: string;
    status: string;              // "PAYE"
    partnerReference?: string;
    items: OrderItemDTO[];
}

interface OrderItemDTO {
    variantId: number;
    variantName: string;
    quantity: number;
    unitPrice: number;
    codes: string[];             // Codes digitaux alloués (seulement pour cette commande)
}
```

---

### ApiErrorResponse — format d'erreur uniforme

```typescript
interface ApiErrorResponse {
    error: string;               // Message court (ex: "Unauthorized")
    details?: string;            // Détail optionnel (ex: "Invalid or revoked API key")
    availableStock?: number;     // Seulement pour les erreurs 422 stock insuffisant
}
```

---

## Relations

```
partnerApiKeys (1) ──── (N) apiLogs
orders (source=API) ──── (via orderItems) ──── digitalCodes
```

---

## Constantes

```typescript
export const API_KEY_PREFIX = "rbt_";
export const API_KEY_LENGTH = 68; // "rbt_" + 64 hex chars
export const API_RATE_LIMIT = 100; // req/min par clé
export const API_MAX_QUANTITY = 10; // max par commande
```
