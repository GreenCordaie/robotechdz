# Design — Visibilité de la livraison des codes côté revendeur

**Date :** 2026-05-26
**Statut :** RÉVISÉ — la visibilité de base existe déjà ; périmètre réduit (voir §0)
**Branche cible :** `feat/bsv-mirror-integrated`

## 0. Révision de périmètre (2026-05-26, après lecture du code rendu)

La prémisse initiale (« le revendeur ne voit pas ses codes ») était **fausse** : la page
`/reseller/orders` rend déjà `<G2BulkOrdersSection />` (`src/app/reseller/orders/components/G2BulkOrdersSection.tsx`)
via `getG2BulkOrdersAction` (`src/app/reseller/orders/g2bulk-actions.ts`), qui affiche déjà,
pour les commandes G2Bulk **et** games : statut (En cours/Livré/Échec/Remboursé), codes
**masqués + révéler + copier**, prix, et détails `wonSnapshot`.$m

Les sections §1–§9 ci-dessous décrivent le design *initial* (conservé pour trace) mais sont
**en grande partie déjà implémentées**. Le travail réel restant est limité à 3 correctifs :

1. **Affichage des commandes games cassé** — `createG2BulkGameOrderAction` stocke
   `wonSnapshot = { kind, gameCode, catalogueId, player, lb }` sans `title` ni `playerName`,
   alors que la section lit `snap.title` / `snap.playerName`. → une recharge s'affiche
   « Produit game:1309 » sans le joueur. *(régression introduite par la feature games)*
2. **État Remboursé** : la puce s'affiche mais sans motif ni montant remboursé.
3. **Confort** : pas de bouton « Rafraîchir » pour l'état En cours ; pas de pagination (cap 50).

Le **plan d'implémentation** (`docs/superpowers/plans/`) ne couvre QUE ces 3 points.

## 1. Problème

Quand un revendeur achète une gift card (G2Bulk) ou un game top-up, le flux back-end fonctionne :

- le wallet est débité, un `orders` local (`PAYE`) + une (ou plusieurs) ligne(s) `g2bulk_orders` (`PENDING_LOADBRAIN`) sont créés ;
- le webhook v2 `g2bulk.order.delivered` insère les codes **chiffrés** dans `g2bulk_delivered_codes`, passe `g2bulk_orders` en `COMPLETED` et l'`orders` local en `LIVRE` ;
- le webhook v2 `g2bulk.order.failed` **rembourse automatiquement** le wallet (transaction `REFUND`), passe `g2bulk_orders` en `REFUNDED` et l'`orders` local en `ANNULE`.

**Mais** le revendeur ne voit **rien de tout ça** : `getResellerOrderDetailAction` ne lit que `digital_codes` / `digital_code_slots` / `iptv_provisions` — **pas** `g2bulk_delivered_codes`. Le revendeur paie, le code est livré et stocké, mais reste invisible dans l'UI. De même, la liste « Mes achats » n'affiche pas le statut de livraison.

**Le remboursement automatique existe déjà** (`handleG2BulkFailed`) — ce design ne le reconstruit pas (YAGNI). On comble uniquement la **visibilité**.

## 2. Objectif & périmètre

Rendre visible, côté revendeur :

1. Le **statut de livraison** par commande dans la liste « Mes achats » (badge + indicateur « codes prêts »).
2. Les **codes livrés** (déchiffrés) dans le détail de commande, masqués par défaut.
3. L'état **remboursé** (motif + montant) et l'état **en attente** (avec rafraîchissement manuel).

**Hors périmètre :** logique de remboursement (déjà en place), temps réel/SSE (rafraîchissement manuel retenu), passerelle de paiement, refonte du détail de commande.

## 3. Approche retenue

**Étendre l'existant** (pas de nouvelle route ni de nouveau service) :
- enrichir `getResellerOrdersAction` (liste) et `getResellerOrderDetailAction` (détail) ;
- ajouter un helper pur de dérivation de statut, réutilisé par liste + détail + tests ;
- réutiliser la page détail de commande revendeur existante.

Couvre gift cards **et** games sans branchement : tous deux utilisent `g2bulk_orders` + `g2bulk_delivered_codes`.

## 4. Couche données

### 4.1 Helper pur — `deriveResellerDeliveryStatus`

Module pur (testable, sans IO). Signature :

```
type ResellerDeliveryStatus = "PENDING" | "DELIVERED" | "REFUNDED" | "PARTIAL" | "OTHER";
deriveResellerDeliveryStatus(localOrderStatus: string, g2bRows: { status: string }[]): ResellerDeliveryStatus
```

Règles :
- `g2bRows` vide → `OTHER` (commande IPTV / stock direct ; on garde le mapping de statut local existant).
- toutes `COMPLETED` → `DELIVERED`.
- au moins une `PENDING_LOADBRAIN` → `PENDING`.
- toutes `REFUNDED`/`FAILED` → `REFUNDED`.
- mélange livré + remboursé → `PARTIAL`.

### 4.2 Action liste — `getResellerOrdersAction`

Elle batch déjà les lignes `g2bulk_orders` (pour les titres). On ajoute par commande :
- `deliveryStatus: ResellerDeliveryStatus` (via le helper) ;
- `codesReady: boolean` = `DELIVERED` **et** au moins un `g2bulk_delivered_codes` pour la commande (count batché par `localOrderId`).

### 4.3 Action détail — `getResellerOrderDetailAction`

Après le check de propriété existant (`orders.resellerId === reseller.id`), ajouter :
- fetch batché des `g2bulk_orders` de la commande + leurs `g2bulk_delivered_codes` ;
- **déchiffrement serveur** (`decrypt()`) de `code` et `pin`, avec `try/catch` **par code** (échec → marqueur `unavailable: true`, pas de crash) ;
- retour : `deliveredCodes: Array<{ code: string; redemptionUrl: string | null; pin: string | null; unavailable?: boolean }>`, `deliveryStatus`, et `refund: { amount: string; reason: string } | null` (motif depuis la transaction `REFUND` de la commande, sinon générique).

**Sécurité :** déchiffrement uniquement côté serveur ; jamais de code/PIN en clair dans les logs.

## 5. Interface

### 5.1 Liste « Mes achats » (`/reseller/orders`)

- Puce de statut par ligne : *En attente* (ambre, horloge) · *Livré* (émeraude, check) · *Remboursé* (rouge) · *Partiel* (bleu).
- Indicateur **« Codes prêts »** (icône clé) si `codesReady`.
- Reste de la ligne inchangé (titre, nb articles, total, date).

### 5.2 Détail de commande — section « Codes livrés »

Rendu selon `deliveryStatus` :
- **PENDING** : encart « Livraison en cours… » + bouton **« Rafraîchir »** (relance l'action détail ; pas d'auto-poll).
- **DELIVERED** : liste des codes, chacun **masqué (••••)** + bascule **« Révéler »** + bouton **« Copier »** ; `redemptionUrl` en lien ; `pin` (masqué + révéler) si présent ; code `unavailable` → « Code indisponible, contactez le support ».
- **REFUNDED** : bannière « Commande remboursée sur votre wallet » + montant + motif.
- **PARTIAL** : codes livrés + note « une partie a été remboursée ».
- **OTHER** : section non affichée (les sections existantes codes directs / IPTV s'appliquent).

Réutilise la mise en page actuelle du détail ; la section vit à côté des sections existantes.

## 6. Cas limites & erreurs

- Échec de déchiffrement → géré par code (`unavailable`), pas de crash global.
- `PENDING` bloqué (webhook perdu) → couvert par le cron `/admin/g2bulk/reconcile` ; « Rafraîchir » permet de revoir une fois réconcilié.
- `COMPLETED` sans codes encore visibles (race) → « Livré — rafraîchir pour voir les codes ».
- Plusieurs lignes `g2bulk_orders` → statut agrégé ; codes affichés en **liste plate** (cohérent avec le tableau `deliveredCodes` de §4.3 — une commande revendeur est quasi toujours mono-ligne, le regroupement par ligne n'apporte rien).

## 7. Tests

- **Unitaire (Vitest)** : `deriveResellerDeliveryStatus` — tous COMPLETED / un PENDING / tous REFUNDED / mixte=PARTIAL / sans ligne g2bulk=OTHER.
- **Intégration (Vitest)** : l'action détail renvoie les codes déchiffrés au **propriétaire** et **refuse/masque** pour un non-propriétaire ; l'action liste pose `deliveryStatus` + `codesReady` correctement.
- **E2E (Playwright) — requis** : revendeur se connecte → ouvre une commande **livrée** → révèle + copie un code (vérifier que le presse-papier reçoit la valeur) ; ouvre une commande **en attente** → voit l'état pending + bouton Rafraîchir.

## 8. Fichiers impactés (prévision)

- `src/app/reseller/shop/` ou `src/lib/` : nouveau module pur `reseller-delivery-status.ts` (helper + type).
- `src/app/reseller/actions.ts` : `getResellerOrdersAction` (+ `deliveryStatus`/`codesReady`), `getResellerOrderDetailAction` (+ `deliveredCodes`/`refund`).
- `src/app/reseller/orders/*` : liste (badges) + détail (section « Codes livrés » + reveal/copier).
- Tests : `*.test.ts` (helper, actions) + un test Playwright E2E.

## 9. Non-objectifs

- Pas de logique de remboursement (existe).
- Pas de SSE/temps réel.
- Pas de nouvelle route ni page « Mes codes » dédiée.
