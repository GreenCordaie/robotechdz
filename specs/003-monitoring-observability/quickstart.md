# Quickstart: Monitoring & Observabilité

**Feature**: 003-monitoring-observability

---

## Test Scenarios (Manual)

### Scenario 1 — Health check public (US2)
```bash
curl http://localhost:1556/api/health
```
**Vérifier** : JSON avec `status`, `uptime`, `services` (4 entrées). Réponse < 5 secondes.

### Scenario 2 — Dashboard monitoring (US2)
1. Se connecter en ADMIN ou SUPER_ADMIN
2. Aller sur `/admin/monitoring`
3. **Vérifier** : uptime affiché, 4 cartes services (vert/rouge), liste logs filtrables

### Scenario 3 — Logger un événement critique (US1)
1. Dans n'importe quelle action serveur, appeler :
   ```typescript
   import { logger } from "@/lib/logger";
   logger.critical("Test alerte critique", { action: "TEST_ALERT", userId: 1 });
   ```
2. **Vérifier** : entrée dans les logs du dashboard + notification Telegram reçue

### Scenario 4 — Anti-spam Telegram (US1)
1. Déclencher 3 fois la même erreur critique en < 10 minutes
2. **Vérifier** : seulement 1 notification Telegram reçue (pas 3)

### Scenario 5 — Filtre logs (US3)
1. Aller sur `/admin/monitoring`
2. Cliquer filtre "Error"
3. **Vérifier** : seules les entrées level=error/critical s'affichent

### Scenario 6 — Service indisponible (edge case)
1. Couper la connexion Telegram (mettre un faux token en settings)
2. Appeler `/api/health`
3. **Vérifier** : `status = "degraded"`, service telegram `isUp: false`, HTTP 200 quand même

### Scenario 7 — Accès non autorisé (US2)
1. Accéder à `/admin/monitoring` sans être connecté
2. **Vérifier** : redirect vers `/admin/login`

### Scenario 8 — Item sidebar (US2)
1. Se connecter en ADMIN
2. **Vérifier** : item "Monitoring" visible dans la sidebar avec icône Activity

---

## Expected API Response

```json
GET /api/health

{
    "status": "ok",
    "uptime": 3600.5,
    "timestamp": "2026-03-23T21:00:00.000Z",
    "services": [
        { "name": "database", "isUp": true, "responseTimeMs": 8 },
        { "name": "telegram", "isUp": true, "responseTimeMs": 312 },
        { "name": "whatsapp", "isUp": true, "responseTimeMs": 145 },
        { "name": "print", "isUp": true, "responseTimeMs": 22, "detail": "0 jobs bloqués" }
    ]
}
```
