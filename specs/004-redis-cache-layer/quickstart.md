# Quickstart: Cache Redis Layer

**Feature**: 004-redis-cache-layer

---

## Prérequis

Redis doit tourner (Docker Compose) :
```bash
docker compose up -d redis
```

`.env` doit contenir :
```
REDIS_URL=redis://localhost:6379
```

---

## Test Scenarios (Manuel)

### Scenario 1 — Cache kiosk : cache miss → cache hit (US1)

1. Vider le cache : `redis-cli DEL kiosk:catalogue`
2. Charger le kiosk → noter le temps de réponse (requête DB)
3. Recharger le kiosk → noter le temps de réponse
4. **Vérifier** : 2ème chargement < 200ms (vs > 500ms au 1er)

### Scenario 2 — Invalidation cache kiosk sur modification produit (US1)

1. Vérifier que le cache existe : `redis-cli EXISTS kiosk:catalogue` → `1`
2. Modifier un produit dans `/admin/catalogue`
3. **Vérifier** : `redis-cli EXISTS kiosk:catalogue` → `0` (clé supprimée)
4. Recharger le kiosk → données fraîches

### Scenario 3 — Cache dashboard stats (US2)

1. Ouvrir `/admin/dashboard` → noter le temps de chargement
2. Ouvrir à nouveau → **Vérifier** : 2ème chargement < 500ms

### Scenario 4 — Invalidation dashboard sur paiement (US2)

1. **Vérifier** : `redis-cli EXISTS admin:dashboard:today` → `1`
2. Payer une commande depuis la caisse
3. **Vérifier** : `redis-cli EXISTS admin:dashboard:today` → `0`

### Scenario 5 — Rate limiting Redis multi-instances (US3)

1. Tenter 5 connexions admin échouées depuis la même IP
2. **Vérifier** : `redis-cli GET ratelimit:127.0.0.1:login` → `"5"`
3. 6ème tentative → **Vérifier** : bloquée immédiatement
4. **Vérifier** : `redis-cli TTL ratelimit:127.0.0.1:login` → valeur positive (max 900)

### Scenario 6 — Dégradation gracieuse (Redis down) (US1 edge case)

1. Arrêter Redis : `docker compose stop redis`
2. Charger le kiosk
3. **Vérifier** : Le kiosk charge normalement (via DB), pas d'erreur 500
4. Redémarrer Redis : `docker compose start redis`

### Scenario 7 — Vérification données sensibles absentes du cache

1. `redis-cli KEYS "*"` → lister toutes les clés
2. `redis-cli GET kiosk:catalogue` → inspecter le JSON
3. **Vérifier** : Aucun champ `codeValue`, `password`, `hashedPassword` dans les données

---

## Inspection Redis CLI

```bash
# Toutes les clés
redis-cli KEYS "*"

# Contenu cache kiosk
redis-cli GET kiosk:catalogue | python -m json.tool

# TTL restant
redis-cli TTL kiosk:catalogue

# Vider tout le cache (dev only)
redis-cli FLUSHDB
```
