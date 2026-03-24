# API Contract: GET /api/health

**Feature**: 003-monitoring-observability
**File**: `src/app/api/health/route.ts`

---

## Endpoint

`GET /api/health`

**Auth**: Public — aucune authentification requise
**Cache**: `no-store` (toujours fraîche)
**Timeout global**: 5 secondes (tous les checks en parallèle via Promise.allSettled)

---

## Response Schema

### Success (200)

```json
{
    "status": "ok" | "degraded",
    "uptime": 12345.6,
    "timestamp": "2026-03-23T21:00:00.000Z",
    "services": [
        {
            "name": "database",
            "isUp": true,
            "responseTimeMs": 12,
            "lastChecked": "2026-03-23T21:00:00.000Z"
        },
        {
            "name": "telegram",
            "isUp": true,
            "responseTimeMs": 234,
            "lastChecked": "2026-03-23T21:00:00.000Z"
        },
        {
            "name": "whatsapp",
            "isUp": false,
            "responseTimeMs": 3001,
            "lastChecked": "2026-03-23T21:00:00.000Z",
            "errorMessage": "Connection timeout"
        },
        {
            "name": "print",
            "isUp": true,
            "responseTimeMs": 45,
            "lastChecked": "2026-03-23T21:00:00.000Z",
            "detail": "0 jobs bloqués"
        }
    ]
}
```

- `status = "ok"` si tous les services sont up
- `status = "degraded"` si au moins un service est down
- HTTP status toujours 200 (même si services down — pour éviter fausses alertes load balancer)

---

## Health Check Logic per Service

### Database
```typescript
const start = Date.now();
await Promise.race([
    db.execute(sql`SELECT 1`),
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000))
]);
responseTimeMs = Date.now() - start;
```

### Telegram
```typescript
const settings = await getCachedSettings();
const url = `https://api.telegram.org/bot${settings.telegramBotToken}/getMe`;
// GET with AbortController timeout 3s
```

### WhatsApp (WAHA)
```typescript
const settings = await getCachedSettings();
const url = `${settings.whatsappApiUrl}/api/instance/${settings.whatsappInstanceName}`;
// GET with AbortController timeout 3s
// isUp = response.ok && data.instance.status === "open" (or similar)
```

### Print Service
```typescript
// Indirect check: count orders stuck in print_pending > 10 minutes
const stuckJobs = await db.query.orders.findMany({
    where: and(
        eq(orders.printStatus, "print_pending"),
        lt(orders.createdAt, new Date(Date.now() - 10 * 60 * 1000))
    )
});
isUp = stuckJobs.length === 0;
detail = `${stuckJobs.length} jobs bloqués`;
```
