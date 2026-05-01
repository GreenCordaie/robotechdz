# Intégration IBOSOL dans le kiosk ROBOTECH — Design

**Date** : 2026-05-01
**Statut** : Design validé, prêt pour planification d'implémentation
**Stack** : Next.js 14 App Router · Drizzle ORM · Zustand (cart) · HeroUI · Tailwind · LoadBrain SDK 3.2.0

## Contexte

LoadBrain orchestre 4 panels IPTV en production : King365TV, Iron Max TV, Atlas Pro DZ, et **IBOSOL Principal**. Les 3 premiers sont des panels IPTV classiques (créent une ligne avec username/password/M3U). IBOSOL est différent : il **active des appareils** (TV box / IBO Player) et peut **injecter des playlists IPTV** dans ces appareils.

IBOSOL expose 4 plans :

| Plan (slug) | Rôle | Prix DZD (à définir admin) | Combo IPTV |
|-------------|------|------|-----------|
| `ibo-check` | Vérifie le statut d'un device par MAC | 0 DZD (gratuit, hors panier) | ❌ Impossible |
| `ibo-activate-yearly` | Active un device pour 1 an | À fixer dans `/admin/catalogue` | ✅ Optionnel |
| `ibo-activate-lifetime` | Active un device à vie | À fixer dans `/admin/catalogue` | ✅ Optionnel |
| `ibo-inject` | Injecte une playlist IPTV dans un device déjà activé | Admin only — prix éditable au cas par cas | ✅ Obligatoire |

> Note : LoadBrain expose des prix de référence en EUR dans son catalog (5€ activation 1 an, 10€ lifetime), mais ROBOTECH applique ses propres prix DZD stockés dans `product_variants.sale_price_dzd`. Les variantes 120-123 sont actuellement à 0 DZD et doivent être configurées par l'admin avant mise en production du kiosk.

Le mode **combo** est une particularité d'IBOSOL : sur les plans `ibo-activate-*` et `ibo-inject`, on peut passer dans `customerInfo` les champs `iptvProvider`, `iptvProviderId`, `iptvPlanId`. Le worker IBOSOL active alors le device, crée la ligne IPTV chez le provider choisi, et injecte la playlist — le tout en une seule commande LoadBrain.

Côté ROBOTECH la ressource est déjà mappée : produit `IBO Player` (id 38) avec 4 variantes liées aux 4 slugs LoadBrain. Mais aucune UI kiosk n'existe pour saisir la MAC, choisir un combo IPTV, ou faire un check standalone.

## Objectifs

1. **Vendre les activations IBO Player** (1 an / Lifetime) au tunnel d'achat kiosk client, avec option de bundler un abonnement IPTV en un seul clic.
2. **Permettre au client de vérifier son device** gratuitement avant achat, via une UX dédiée hors panier.
3. **Outiller l'admin/SAV** pour injecter manuellement une IPTV dans un device existant (`ibo-inject`) et relancer les commandes combo partiellement échouées.

## Non-objectifs

- Pas de remise / pricing dynamique sur le combo (somme des 2 variantes, transparence totale)
- Pas de catalogue de bundles pré-pack côté admin (YAGNI — on peut migrer plus tard)
- Pas de gestion stock IBOSOL (les crédits sont gérés côté LoadBrain)

## Décisions prises (résumé brainstorming)

| Question | Décision |
|----------|----------|
| Comment exposer le combo IBO + IPTV ? | **Modal séquentiel** : MAC → Combo (oui/non + picker) |
| Quels plans IPTV dans le picker ? | **Tous les payants** des 3 providers IPTV, groupés par provider, triés par durée décroissante (trials exclus) |
| Combien d'items dans le panier ? | **1 seul item combiné** avec prix sommé |
| Quels variants IBO au kiosk ? | **Activations seulement** ; Check accessible via bouton dédié ; Inject réservé admin |
| Filtre des variants par durée combo ? | **Aucun** (tous les payants visibles) |
| Quantité par item IBO ? | **1 par commande** (1 device = 1 MAC) |
| Échec partiel du combo ? | **Gracieux** : on livre ce qui a marché, status `completed_partial`, alerte SAV Telegram |
| Check device livré comment ? | **Synchrone via SDK** `IbosolModule.checkDevice()` ; résultat affiché en modal kiosk ; pas de commande créée |
| Inject SAV admin → emplacement ? | Section "Outils Ibosol" en tête de `/admin/iptv` |

## Architecture

### Composants frontend

```
src/app/kiosk/components/
├── ProductModal.tsx               # existant — câble les modaux séquentiels Ibosol
├── IbosolDeviceModal.tsx          # existant — étape 1 : MAC + appId
├── IbosolComboModal.tsx           # NOUVEAU — étape 2 : "voulez-vous IPTV ?" + picker
├── IbosolCheckModal.tsx           # NOUVEAU — modal autonome saisie MAC pour check
├── IbosolCheckResultModal.tsx     # NOUVEAU — modal résultat synchrone du check
└── DeliveryMethodModal.tsx        # existant — déjà adapté pour cacher l'option credentials/code sur Ibosol

src/app/admin/iptv/
├── IptvContent.tsx                # existant — ajouter section "Outils Ibosol" en tête
├── components/
│   ├── IbosolToolsBar.tsx         # NOUVEAU — boutons Vérifier device / Injecter IPTV manuel
│   ├── AdminInjectIptvModal.tsx   # NOUVEAU — modal admin pour ibo-inject
│   └── AdminCheckDeviceModal.tsx  # NOUVEAU — modal admin pour vérifier device
└── actions.ts                     # existant — ajouter checkIbosolDevice, manualInjectIptv, retryPartialIptv
```

### Composants backend

```
src/lib/iptv.ts
  ├── parse customData JSON pour items ibosol
  ├── envoie customerInfo.mac, appId
  ├── envoie customerInfo.iptvProvider/iptvProviderId/iptvPlanId si combo
  └── PROVIDER_SLUGS const : providerId → slug technique LoadBrain

src/app/api/loadbrain/webhook/route.ts
  ├── déjà adapté pour payload Ibosol plat (mac, activationCode, etc.)
  ├── AJOUT : détection succès partiel → status `completed_partial` au lieu de `completed`
  └── notification Telegram différenciée

src/lib/delivery.ts
  └── 3 nouveaux templates WhatsApp pour Ibosol :
      - IBO seul (Activation)
      - IBO + IPTV combo OK
      - IBO + IPTV combo partiel

src/app/kiosk/actions.ts
  ├── createKioskOrder gère customData JSON pour Ibosol
  ├── préserve combo dans customData (pas écrasé par iptvDeliveryMethod)
  └── calcul prix combiné (variant.salePriceDzd + combo.iptvPrice)
```

### Modèle de données

#### Migration SQL

```sql
ALTER TABLE product_variants
  ADD COLUMN kiosk_visible boolean NOT NULL DEFAULT true;

UPDATE product_variants
  SET kiosk_visible = false
  WHERE loadbrain_slug IN ('ibo-check', 'ibo-inject');
```

Le query catalogue kiosk (`getKioskData`) filtre `kiosk_visible = true`. L'admin catalogue garde tout.

#### Format `order_items.customData` (JSON sérialisé)

```typescript
// IBO seul (Activation 1y/Lifetime sans combo)
type IbosolSoloCustomData = {
    type: "ibosol";
    mac: string;
    appId: number;
};

// IBO + IPTV combo
type IbosolComboCustomData = {
    type: "ibosol";
    mac: string;
    appId: number;
    combo: {
        iptvVariantId: number;
        iptvProviderId: string;
        iptvPlanId: string;
        iptvProductName: string;
        iptvPrice: string;  // DZD format string
    };
};

// IPTV classique (King/IronMax/Atlas) — inchangé
type IptvCustomData = "credentials" | "code";

// Manual SAV inject (admin)
type AdminInjectCustomData = IbosolComboCustomData;  // identique au flow client
```

#### Type `CartItem` enrichi (Zustand store)

```typescript
interface CartItem {
    // existant...
    variantId: number;
    productId: number;
    name: string;
    productName: string;
    price: string;
    quantity: number;
    customData?: string;  // JSON Ibosol ou string IPTV ou player ID
    loadbrainSlug?: string | null;

    // NOUVEAU
    combo?: {
        iptvVariantId: number;
        iptvProviderId: string;
        iptvPlanId: string;
        iptvProductName: string;
        iptvPrice: string;
    };
}
```

`combo` est dénormalisé sur `CartItem` pour faciliter l'affichage et le calcul prix dans le UI. À la persistance (`createKioskOrder`), `combo` est sérialisé dans `customData.combo` JSON. Au chargement (provision), on parse `customData` pour reconstruire.

#### Status `iptv_provisions.status`

Existant : `queued | processing | completed | failed | cancelled`
**Ajout** : `completed_partial`

Aucune migration enum (colonne déjà varchar). Filtre admin "Partiels" sur `/admin/iptv`.

### Mapping providers (statique)

```typescript
// src/lib/iptv.ts
const PROVIDER_SLUGS: Record<string, string> = {
    "0eb51cbb-ba96-452d-b0a1-87b71d6cbea4": "panelking365",
    "46346069-075f-44f4-bf38-d1b876af3c6a": "ironmax",
    "7865ebe3-a204-4c1c-aba7-de17aef1193d": "atlaspro",
};
```

Utilisé pour mapper le `iptvProviderId` (UUID stocké dans `customData`) vers le slug technique attendu par LoadBrain dans `customerInfo.iptvProvider`.

## Flow UX kiosk

### 1. Achat Activation IBO (avec ou sans combo)

```
ProductModal (IBO Player)
    |
    | client clique "Ajouter au panier" sur Activation 1 an
    ↓
IbosolDeviceModal (étape 1/2)
    | saisie MAC + appId
    | clic Suivant
    ↓
IbosolComboModal (étape 2/2)
    | choix : NON IBO seul (5000 DZD)
    |     ou OUI + provider + plan IPTV (5000 + N DZD)
    | clic "Ajouter au panier"
    ↓
addToCart({
    variantId: 120,
    productId: 38,
    name: "Activation 1 an",
    productName: "IBO Player",
    price: "5000.00",
    quantity: 1,
    customData: '{"type":"ibosol","mac":"AA:BB:CC:DD:EE:FF","appId":1,"combo":{...}}',
    loadbrainSlug: "ibo-activate-yearly",
    combo: { iptvVariantId, iptvProviderId, iptvPlanId, iptvProductName, iptvPrice },
})
    ↓
Cart affiche un seul item avec le total combiné, suivi de la liste des composants
    ├─ Activation 1 an              5 000 DZD
    └─ IPTV King365 12 mois         9 000 DZD
       Total :                     14 000 DZD
       MAC: AA:BB:CC:DD:EE:FF
```

#### Garde "1 IBO max par commande"

`ProductModal.handleAddToCart` :
```typescript
const cart = useKioskStore.getState().cart;
const hasIboInCart = cart.some(it => it.loadbrainSlug?.startsWith("ibo-"));
if (hasIboInCart && hasIbosolSelected) {
    toast.error("Vous avez déjà un IBO Player au panier. Pour activer un autre device, faites une commande séparée.");
    return;
}
```

#### Quantité forcée à 1

Pour les variantes Ibosol, le contrôle quantity dans `ProductModal` est masqué ou bloqué à 1 :
```tsx
{isIbosolVariant ? (
    <span className="text-xs text-slate-500">1 par commande</span>
) : (
    <QuantityControl ... />
)}
```

### 2. Vérification device (standalone)

```
ProductModal (IBO Player) — bouton secondaire en bas
    |
    | clic "🔍 Vérifier mon device gratuitement"
    ↓
IbosolCheckModal
    | saisie MAC + appId
    | clic "Vérifier"
    ↓
server action checkIbosolDevice(mac, appId)
    | IbosolModule.checkDevice() via SDK 3.2.0
    | retour synchrone (~3-5s)
    ↓
IbosolCheckResultModal
    affiche : MAC, app, isActivated, expiresAt, ip, playlistInjected
    bouton [Fermer]
    bouton [Activer ce device →] (UX bonus, optionnel)
        → si cliqué : ouvre IbosolDeviceModal pré-rempli + saute à IbosolComboModal
```

Aucune commande créée, aucun digital_code, aucune trace DB. Pure utilité info.

## Flow provisioning

### `iptv.ts` — étapes par item Ibosol

1. **Parse customData**
   ```typescript
   const parsed = JSON.parse(item.customData);
   // { type: "ibosol", mac, appId, combo? }
   ```

2. **Construction payload**
   ```typescript
   const customerInfo: Record<string, unknown> = {
       name, phone, orderNumber,
       mac: parsed.mac,
       appId: parsed.appId ?? 1,
   };

   if (parsed.combo) {
       customerInfo.iptvProvider = PROVIDER_SLUGS[parsed.combo.iptvProviderId];
       customerInfo.iptvProviderId = parsed.combo.iptvProviderId;
       customerInfo.iptvPlanId = parsed.combo.iptvPlanId;
   }
   ```

3. **Appel `POST /api/v1/provision`** avec `providerId` IBOSOL et `planId` du plan IBO. Pas de `deliveryMethod` (Ibosol n'en a pas).

4. **Cooldown 5s** entre items (existant — Iron Max Chrome cooldown).

### Webhook handler — détection succès partiel

```typescript
const creds = event.credentials || {};
const isIbosolPayload = !!(creds.mac || creds.activationCode || creds.playlistInjected !== undefined);

if (isIbosolPayload) {
    const wasComboRequested = !!targetItem.customData?.includes('"combo"');
    const iptvCredsPresent = !!(creds.iptvUsername && creds.iptvPassword);
    const isPartial = wasComboRequested && !iptvCredsPresent;

    const finalStatus = isPartial ? "completed_partial" : "completed";

    // ... insertion digital_codes + update iptv_provisions.status = finalStatus
    // ... si isPartial : Telegram alert SAV (priorité ADMIN)
}
```

## Flow livraison client

### Templates WhatsApp (3 cas Ibosol)

```
[Cas 1] IBO seul — Activation 1y/Lifetime
🎉 Votre activation IBO Player

📱 Device
MAC : <mac>
Application : <appName>

🔑 Code activation
<activationCode>

📅 Expire le : <DD/MM/YYYY>

💡 Comment activer :
1. Ouvrez <appName> sur votre device
2. Allez dans Paramètres → Activer
3. Entrez le code ci-dessus
4. Profitez !

[Cas 2] Combo OK
🎉 Votre IBO Player + IPTV est prêt

📱 Device activé
MAC : <mac>
Code activation : <activationCode>
Expire le : <DD/MM/YYYY>

📺 Abonnement <iptvProviderName> <iptvPlanName>
Identifiant : <iptvUsername>
Mot de passe : <iptvPassword>
URL M3U : <m3uUrl>

✅ La playlist est déjà injectée dans votre device — il suffit d'ouvrir <appName>.

[Cas 3] Combo partiel
🎉 Activation IBO Player réussie

📱 Device activé
MAC : <mac>
Code activation : <activationCode>
Expire le : <DD/MM/YYYY>

⚠️ IPTV en cours de traitement
Notre service va vous recontacter sous peu pour finaliser votre abonnement IPTV.
```

### Notification Telegram interne

| Cas | Message | Priorité |
|-----|---------|----------|
| Activation seule OK | `✅ IBO activé\n📋 #C123\n👤 X\n🔑 <mac> activé` | ADMIN |
| Combo OK | `✅ IBO + IPTV livré\n📋 #C123\n👤 X\n📱 <mac>` | ADMIN |
| Combo partiel | `⚠️ IBO activé, IPTV échouée\n📋 #C123\n👤 X\n❗ ACTION SAV requise` | ADMIN priorité haute |
| Échec total | `❌ IBO échoué` (existant) | ADMIN |

## Admin SAV

### Section "Outils Ibosol" sur `/admin/iptv`

```tsx
<IbosolToolsBar>
  [🔍 Vérifier device]      → AdminCheckDeviceModal (réutilise IbosolCheckResultModal)
  [💉 Injecter IPTV manuel]  → AdminInjectIptvModal
</IbosolToolsBar>

<Filters>
  [Tout] [Actifs] [En attente] [Échoués] [Partiels ←nouveau filtre]
</Filters>
```

### Modal `AdminInjectIptvModal`

Crée une commande SAV avec :
- `orderNumber` préfixé `#ADM-`
- `totalAmount` éditable (admin saisit le prix négocié)
- `customerPhone` optionnel
- `order_items` : 1 item avec `variantId` du `ibo-inject` (id 123) + `customData` JSON `{type, mac, appId, combo}` complet
- `payOrder()` standard → provisioning → webhook → WhatsApp si phone fourni

### Action "Relancer IPTV manquant" sur provision `completed_partial`

Bouton sur la carte de provision dans `IptvContent.tsx`. Comportement :

1. Lit `order_item.customData.combo` → récupère `iptvVariantId, iptvProviderId, iptvPlanId, iptvProductName, iptvPrice`
2. Crée un **nouvel order_item** dans la même commande, avec `variantId = combo.iptvVariantId` et `customData = "credentials"` (flow IPTV classique)
3. Lance `provisionIptvOrder` ciblé sur ce nouvel item
4. Webhook normal → nouveau `digital_code` séparé pour l'IPTV
5. Met à jour la provision Ibosol originale : `status = completed` (plus partiel)
6. Le client voit dans sa commande **2 lignes côte à côte** : l'activation IBO + l'IPTV séparée

Stratégie **nouveau digital_code** plutôt que mise à jour rétroactive : plus traçable, plus simple, moins de risque de corruption.

### Permissions

Toutes les actions admin sont guardées par `withAuth({ roles: [ADMIN, CAISSIER] })`.

## Tests

### Tests E2E manuels obligatoires (avant prod)

1. **Activation seule** : achat Activation 1 an au kiosk, sans combo, livraison WhatsApp + ticket. Vérifier que le code activation arrive au format attendu.
2. **Combo OK** : achat Activation 1 an + IPTV King365 12 mois. Vérifier que le webhook IBOSOL renvoie les 2 sets de creds, qu'ils sont stockés en 1 seul digital_code, et que le WhatsApp affiche les 2 sections.
3. **Combo partiel** : à reproduire en simulant une panne IPTV (ex. Iron Max Cloudflare). Vérifier que le status passe à `completed_partial`, que le client reçoit le message dégradé, et que l'admin reçoit l'alerte Telegram.
4. **Check device** : flow standalone, vérifier le délai (~3-5s) et l'affichage modal résultat.
5. **Garde 1 IBO/commande** : tenter d'ajouter un 2e IBO au panier, vérifier le toast d'erreur.
6. **Inject SAV admin** : depuis `/admin/iptv`, créer un inject manuel, vérifier la chaîne complète.
7. **Relancer IPTV manquant** : sur une commande `completed_partial`, cliquer le bouton et vérifier la création de l'IPTV séparée + l'update du status.

### Tests unitaires

- Webhook handler : 4 cas (Activation seule / Combo OK / Combo partiel / Échec total)
- delivery.ts : 3 templates WhatsApp Ibosol
- iptv.ts : parse customData JSON Ibosol vs string IPTV classique vs JSON corrompu
- Mapping `PROVIDER_SLUGS` : tous les UUIDs prod connus

## Sécurité

- API key LoadBrain en `.env`, jamais exposée au front (déjà OK)
- Webhook secret HMAC vérification (déjà OK, fonctionne avec le secret existant `whsec_robotech_loadbrain_2026`)
- MAC validation regex stricte côté front (déjà OK dans `IbosolDeviceModal`) + revalidation server-side dans la server action
- Permissions Drizzle : aucun changement (mêmes tables, mêmes RLS)

## Performance

- SDK `IbosolModule.checkDevice()` est synchrone côté SDK mais asynchrone côté LoadBrain (peut prendre 3-10s). Le modal kiosk doit afficher un loader avec timeout 30s + message d'erreur si pas de réponse.
- Le combo modal charge le catalog LoadBrain au mount — utiliser un cache 5 min (Redis ou in-memory) pour éviter de re-fetcher à chaque ouverture.

## Plan de rollout

1. Migration DB : ajouter `kiosk_visible` + UPDATE des 2 variantes
2. Implémenter modaux kiosk + check standalone
3. Adapter webhook handler (status partiel)
4. Adapter delivery.ts (3 templates)
5. Implémenter admin SAV (inject + relance partial)
6. Tests E2E manuels en dev
7. Déploiement prod après validation user
8. Monitoring 1 semaine : vérifier ratio `completed_partial` (si > 5% → diagnostic LoadBrain)

## Risques & mitigations

| Risque | Probabilité | Mitigation |
|--------|-------------|------------|
| Iron Max Cloudflare → combo partiel fréquent | Moyenne | Status partial + relance manuelle SAV. Long terme : réécrire client Iron Max en HTTP pur (hors scope ce sprint). |
| Client confus par 1 item combiné dans le panier | Faible | UI affichera clairement les 2 composants en sous-bullets sous l'item principal. |
| MAC invalide / déjà activée chez un autre revendeur | Moyenne | LoadBrain renvoie un `errorCode` explicite, le webhook affiche le message au client. Pas de remboursement auto (case par case). |
| Catalog LoadBrain change (ajout/retrait de plan) | Faible | Le picker combo charge le catalog dynamiquement, donc auto-update. Les UUID sont stables prod. |

## Ouvertures (post-MVP, hors scope)

- Bundles pré-pack avec remise (option C de la Q2)
- Réécriture client Iron Max en HTTP pur (résout instabilité Cloudflare)
- Page client "Mes devices" affichant l'historique des MAC activées
- Renouvellement automatique avant expiration (cron + alerting client)
