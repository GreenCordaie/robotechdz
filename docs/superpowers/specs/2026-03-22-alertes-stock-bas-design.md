# Alertes Stock Bas — UI Admin

**Date :** 2026-03-22
**Statut :** En révision
**Fichiers concernés :**
- `src/lib/stock-alerts.ts` — lire le seuil depuis DB au lieu de constante
- `src/db/schema.ts` — ajouter `stockAlertThreshold` à `shopSettings`
- `src/app/admin/settings/` — ajouter champ de config seuil
- `src/app/admin/dashboard/` — ajouter panneau alertes stock
- `src/app/admin/catalogue/` — ajouter badges + filtre stock bas
- `src/services/queries/dashboard.queries.ts` — brancher seuil dynamique

---

## Contexte

La logique d'alerte stock existe déjà (`checkStockAndAlert` dans `orders.ts`), les notifications Telegram + n8n fonctionnent. Ce qui manque :
- Seuil hardcodé à `5` dans le code — pas configurable
- Pas de panneau UI pour voir les variantes en rupture
- Pas de filtre "Stock bas" dans le Catalogue

---

## Design

### 1. Seuil global configurable

**Migration DB :** Ajouter le champ `stockAlertThreshold` à la table `shopSettings` :
```sql
stock_alert_threshold integer DEFAULT 5 NOT NULL
```

**`src/lib/stock-alerts.ts` :** Remplacer la constante hardcodée :
```typescript
// AVANT
const STOCK_THRESHOLD = 5;

// APRÈS — lire depuis shopSettings
const settings = await db.query.shopSettings.findFirst();
const threshold = settings?.stockAlertThreshold ?? 5;
```

**UI Paramètres :** Nouvelle entrée dans la section existante des paramètres :
- Label : "Seuil d'alerte stock bas"
- Input numérique (min: 1, max: 999)
- Valeur par défaut : 5
- Description : "Une alerte Telegram est envoyée quand le stock d'une variante passe sous ce nombre."
- Sauvegardé via l'action `updateSettings` existante

---

### 2. Dashboard — panneau alertes stock

**Emplacement :** En bas du Dashboard, après les sections existantes.

**Visibilité :** Section cachée si aucune variante n'est sous le seuil (`lowStockItems.length === 0`).

**Structure :**
```
┌─────────────────────────────────────────────────┐
│ ⚠ STOCK BAS  3 variantes sous le seuil         │
├─────────────────────────────────────────────────┤
│ Netflix 1 Mois      ██░░░░░░  2 / seuil 5  [+ Stock] │
│ Spotify Premium     █░░░░░░░  1 / seuil 5  [+ Stock] │
│ Free Fire 100 Dia   ███░░░░░  3 / seuil 5  [+ Stock] │
└─────────────────────────────────────────────────┘
```

**Données :** `getLowStockList` dans `dashboard.queries.ts` — modifier pour :
1. Accepter le seuil dynamique en paramètre (remplacer `< 5` par `< threshold`)
2. Opérateur : `<=` (cohérent avec `checkStockAndAlert` qui utilise `<=`)
3. Gérer les variantes `isSharing` : compter les `digitalCodeSlots` disponibles (via JOIN) au lieu des `digitalCodes` directement — même logique que `checkStockAndAlert`
4. Retirer le `cache()` sur cette fonction (ou appeler `revalidatePath("/admin/dashboard")` dans `updateSettings` après sauvegarde du seuil)

**Bouton [+ Stock] :** Redirige vers `/admin/catalogue` (navigation simple). L'admin ouvre le modal d'import manuellement. **Pas** d'ouverture automatique du modal.

**Barre de progression :** `value = (stockActuel / seuil) * 100`, couleur rouge.

---

### 3. Catalogue — badges + filtre

**Badge par variante :**
- Si `stockCount < threshold` → badge `⚠ N en stock` rouge à côté du badge stock existant
- Si `stockCount >= threshold` → badge vert inchangé
- Le seuil est chargé une fois au montage depuis `shopSettings`

**Nouveau filtre "Stock bas" :**
- Ajouté dans la barre de filtres existante (`status` filter) — nouveau bouton `⚠ Stock bas`
- Quand actif : n'affiche que les produits ayant au moins une variante avec `stockCount < threshold`
- Filtre appliqué côté client sur les données déjà chargées (pas de nouveau appel API)

**Clic sur badge ⚠ :** Ouvre directement le modal d'import de codes (`MassImportModal`) pour la variante concernée.

---

## Actions backend

| Action | Changement |
|--------|-----------|
| `updateSettings` | Ajouter `stockAlertThreshold` dans le schéma Zod de validation |
| `getLowStockAlerts` (dashboard) | Passer le seuil dynamique en paramètre |
| `getLowStockList` (query) | Remplacer `< 5` hardcodé par paramètre `threshold` |
| `checkStockAndAlert` | Lire `stockAlertThreshold` depuis DB |
| `getShopSettings` | Retourner `stockAlertThreshold` dans la réponse |

---

## Flux de données

```
shopSettings.stockAlertThreshold
    ↓
[Settings UI] ← admin configure le seuil
    ↓
[stock-alerts.ts] — lit le seuil à chaque vente
    ↓ si stock < seuil
Telegram + n8n (existants)
    ↓
[Dashboard] — getLowStockList(threshold) → panneau alertes
[Catalogue] — badge ⚠ + filtre "Stock bas"
```

---

## Critères de succès

- L'admin peut changer le seuil depuis les Paramètres sans modifier le code
- Le Dashboard affiche la liste des variantes en rupture avec leur stock actuel
- Le Catalogue signale visuellement les variantes sous le seuil
- Le filtre "Stock bas" dans le Catalogue fonctionne immédiatement
- Cliquer [+ Stock] redirige vers `/admin/catalogue` (pas d'ouverture automatique de modal)
