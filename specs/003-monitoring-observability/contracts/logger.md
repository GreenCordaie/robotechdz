# Module Contract: src/lib/logger.ts

**Feature**: 003-monitoring-observability

---

## Public API

```typescript
import { logger } from "@/lib/logger";

// Log levels
logger.info("Message", { userId: 1, action: "LOGIN" });
logger.warn("Message", { action: "STOCK_LOW", metadata: { productId: 5 } });
logger.error("Message", { userId: 1, action: "PAY_ORDER_FAILED", metadata: { error: "DB timeout" } });
logger.critical("Message", { action: "STOCK_ALLOCATION_FAILED", metadata: { orderId: 42 } });

// Read logs (for admin dashboard)
const logs = logger.getLogs();              // Last 50, all levels
const errors = logger.getLogs("error", 20); // Last 20 errors
const counts = logger.getCounts();          // { info: N, warn: N, error: N, critical: N }
```

---

## Critical Level Behavior

`logger.critical()` déclenche en plus :
1. Log dans le buffer (comme les autres niveaux)
2. Envoi Telegram via `sendTelegramNotification()` — fire-and-forget
3. Anti-spam : si même errorKey dans les 10 dernières minutes → pas de Telegram, juste incrémente le compteur

```typescript
// errorKey = simple hash or concat
const errorKey = `${message}:${ctx?.action || ""}`;
const throttle = alertThrottle.get(errorKey);
const now = new Date();

if (!throttle || (now.getTime() - throttle.lastAlertSentAt.getTime()) > 10 * 60 * 1000) {
    // Send Telegram
    sendTelegramNotification(`🚨 *Erreur Critique*\n${message}\nAction: ${ctx?.action}\nUser: ${ctx?.userId}`, ["ADMIN"]).catch(console.error);
    alertThrottle.set(errorKey, { count: 1, firstSeenAt: now, lastAlertSentAt: now });
} else {
    // Just increment counter, no Telegram
    throttle.count++;
}
```

---

## Server Actions Contract

**File**: `src/app/admin/monitoring/actions.ts`

```typescript
export const getMonitoringLogs = withAuth(
    { roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN] },
    async ({ level, limit }: { level?: LogLevel; limit?: number }) => {
        return {
            logs: logger.getLogs(level, limit ?? 50),
            counts: logger.getCounts(),
            uptime: process.uptime(),
        };
    }
);
```

---

## UI Components Contract

### MonitoringContent.tsx (Client Component)

**Props**:
```typescript
interface MonitoringContentProps {
    initialLogs: LogEntry[];
    initialCounts: { info: number; warn: number; error: number; critical: number };
    initialUptime: number;
    initialServices: ServiceStatus[];
}
```

**Features**:
- Affichage uptime (depuis dernier redémarrage)
- Grille statuts services (4 cartes : DB, Telegram, WhatsApp, Print) — vert/rouge
- Filtre niveau logs (Tous / Info / Warn / Error / Critical)
- Liste des 50 derniers logs avec badges colorés
- Bouton refresh (recharge via `getMonitoringLogs()`)
