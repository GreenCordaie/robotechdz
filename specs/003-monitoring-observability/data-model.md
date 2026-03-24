# Data Model: Monitoring & Observabilité

**Feature**: 003-monitoring-observability
**Date**: 2026-03-23

---

## New In-Memory Structures (no DB changes)

### LogEntry

Stocké dans un tableau circulaire en mémoire (singleton Node.js). Pas de table DB.

```typescript
// src/lib/logger.ts

export type LogLevel = "info" | "warn" | "error" | "critical";

export interface LogEntry {
    id: string;              // nanoid ou crypto.randomUUID()
    level: LogLevel;
    timestamp: string;       // ISO 8601
    message: string;
    userId?: number;
    action?: string;         // ex: "INITIATE_RETURN", "PAY_ORDER"
    metadata?: Record<string, unknown>;
}
```

**Capacité**: 1000 entrées max (circular buffer — les plus anciennes sont écrasées).
**Accès**: Module singleton — une seule instance partagée entre toutes les requêtes du processus Node.

---

### AlertThrottle (in-memory)

```typescript
// Interne au module logger.ts

interface AlertThrottleEntry {
    count: number;
    firstSeenAt: Date;
    lastAlertSentAt: Date;
}

// Map<errorKey, AlertThrottleEntry>
// errorKey = simple hash de (message + action/route)
// Durée fenêtre anti-spam: 10 minutes
```

**Persistence**: Mémoire uniquement — reset au redémarrage serveur.

---

## Read-Only Computed Structures (calculées à la volée)

### ServiceStatus

Calculé par `/api/health` à chaque appel — pas stocké.

```typescript
export interface ServiceStatus {
    name: string;                // "database" | "telegram" | "whatsapp" | "print"
    isUp: boolean;
    responseTimeMs: number;
    lastChecked: string;         // ISO timestamp
    errorMessage?: string;       // Si isUp = false
}
```

---

### MonitoringDashboardData

Agrégat renvoyé par l'action `getMonitoringData()` pour le dashboard.

```typescript
export interface MonitoringDashboardData {
    uptimeSeconds: number;           // process.uptime()
    logs: LogEntry[];                // 50 derniers (filtrables)
    logCounts: {
        info: number;
        warn: number;
        error: number;
        critical: number;
    };
    services: ServiceStatus[];       // Résultat du health check
}
```

---

## No DB Migrations Required

Aucune table DB nouvelle. Le module logger est 100% en mémoire. Le seul accès DB dans cette feature est :
- `db.execute(sql\`SELECT 1\`)` dans le health check (test connectivité)
- `db.query.orders.findMany()` pour compter les jobs print_pending bloqués

---

## Logger Singleton Pattern

```typescript
// src/lib/logger.ts

const MAX_LOGS = 1000;
const ALERT_THROTTLE_MINUTES = 10;

// Module-level state (singleton in Node.js process)
const logBuffer: LogEntry[] = [];
const alertThrottle = new Map<string, AlertThrottleEntry>();

export const logger = {
    info:     (message: string, ctx?: Partial<LogEntry>) => addLog("info", message, ctx),
    warn:     (message: string, ctx?: Partial<LogEntry>) => addLog("warn", message, ctx),
    error:    (message: string, ctx?: Partial<LogEntry>) => addLog("error", message, ctx),
    critical: (message: string, ctx?: Partial<LogEntry>) => addLogAndAlert("critical", message, ctx),
    getLogs:  (level?: LogLevel, limit = 50) => getFilteredLogs(level, limit),
    getCounts: () => getLogCounts(),
};
```
