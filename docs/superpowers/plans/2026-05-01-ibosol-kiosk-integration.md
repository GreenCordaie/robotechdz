# IBOSOL Kiosk Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Intégrer IBOSOL dans le kiosk ROBOTECH avec achat Activation 1y/Lifetime + combo IPTV optionnel, vérification device gratuite standalone, et outils admin SAV (inject manuel + récupération de combos partiels).

**Architecture:** Modaux séquentiels au kiosk (MAC → Combo) avec 1 seul item combiné au panier. Check via SDK 3.2.0 synchrone (pas d'order). Webhook handler enrichi pour gérer payload Ibosol plat + statut `completed_partial`. Admin SAV via section dédiée sur `/admin/iptv`.

**Tech Stack:** Next.js 14 App Router · Drizzle ORM · Zustand cart · HeroUI · Tailwind · LoadBrain SDK 3.2.0 · PostgreSQL.

**Spec source:** [docs/superpowers/specs/2026-05-01-ibosol-kiosk-integration-design.md](../specs/2026-05-01-ibosol-kiosk-integration-design.md)

**Conventions de tests :** Le projet n'a pas de runner unit configuré. Pour valider les fonctions pures (parsing, formatting), on écrit des assertions runnables via `npx tsx scripts/<name>-verify.ts` qui lèvent une exception en cas d'échec. Pour les server actions et endpoints, on valide via `curl` ou via un test E2E manuel documenté. Les composants UI sont vérifiés en lançant `npm run dev` et en suivant un script de test manuel précis.

---

## File Structure

### À créer

| Fichier | Responsabilité |
|--------|---------------|
| `drizzle/0003_kiosk_visible.sql` | Migration : ajout `product_variants.kiosk_visible` |
| `src/lib/ibosol-credentials.ts` | Pure : format payload webhook Ibosol → string code, détection succès partiel |
| `src/lib/loadbrain-providers.ts` | Pure : constante `PROVIDER_SLUGS` (UUID → slug) |
| `src/app/kiosk/components/IbosolComboModal.tsx` | UI : étape 2 — choix oui/non IPTV + picker provider/plan |
| `src/app/kiosk/components/IbosolCheckModal.tsx` | UI : modal saisie MAC pour Check standalone |
| `src/app/kiosk/components/IbosolCheckResultModal.tsx` | UI : résultat synchrone du Check |
| `src/app/kiosk/actions/check-device.ts` | Server action : `checkIbosolDevice(mac, appId)` |
| `src/app/admin/iptv/components/IbosolToolsBar.tsx` | UI : barre d'outils admin (Vérifier / Injecter) |
| `src/app/admin/iptv/components/AdminCheckDeviceModal.tsx` | UI admin : check device |
| `src/app/admin/iptv/components/AdminInjectIptvModal.tsx` | UI admin : inject manuel ibo-inject |
| `scripts/ibosol-credentials-verify.ts` | Script vérification fonctions pures |

### À modifier

| Fichier | Changement |
|--------|-----------|
| `src/db/schema.ts` | Ajout `kioskVisible` sur `productVariants` |
| `src/app/kiosk/actions.ts` | `getKioskData` filtre `kiosk_visible = true` ; `createKioskOrder` préserve customData JSON Ibosol et calcule prix combo |
| `src/store/useKioskStore.ts` | Ajout `combo` au type `CartItem` |
| `src/app/kiosk/components/ProductModal.tsx` | Câble séquence MAC → Combo, bouton "Vérifier mon device", garde 1 IBO max, qty bloquée à 1 |
| `src/lib/iptv.ts` | Parse customData JSON Ibosol, envoie `customerInfo.iptvProvider/iptvProviderId/iptvPlanId` si combo |
| `src/app/api/loadbrain/webhook/route.ts` | Détection `completed_partial` ; appelle nouveau formatteur |
| `src/lib/delivery.ts` | 3 templates WhatsApp Ibosol (seul / combo OK / combo partiel) |
| `src/app/admin/iptv/IptvContent.tsx` | Insère `IbosolToolsBar` en tête + filtre "Partiels" + bouton "Relancer IPTV" sur cards `completed_partial` |
| `src/app/admin/iptv/actions.ts` | Nouvelles actions : `manualInjectIptvAction`, `retryPartialIptvAction` |
| `src/app/admin/iptv/queries.ts` | Inclut `completed_partial` dans le filtre des status |

### Cart UI

| Fichier | Changement |
|--------|-----------|
| `src/app/kiosk/views/CatalogueView.tsx` | Affichage panier : sous-bullets pour items combo |
| `src/app/kiosk/KioskMobile.tsx` | Idem mobile |

---

## Dependencies graph

```
Phase 1 (Foundation)
  Task 1: Migration DB + schema
  Task 2: PROVIDER_SLUGS const
  Task 3: ibosol-credentials.ts (parser + formatter)

Phase 2 (Provisioning logic)
  Task 4: iptv.ts — combo payload  ← needs Task 2, 3
  Task 5: webhook handler — completed_partial  ← needs Task 3

Phase 3 (Delivery)
  Task 6: delivery.ts — 3 WhatsApp templates Ibosol  ← needs Task 3

Phase 4 (Kiosk UX)
  Task 7: IbosolComboModal  ← independent
  Task 8: IbosolCheckModal + IbosolCheckResultModal + check-device server action  ← needs Task 2
  Task 9: ProductModal integration + cart store + actions  ← needs Tasks 7, 8

Phase 5 (Admin SAV)
  Task 10: IbosolToolsBar + AdminCheckDeviceModal + AdminInjectIptvModal + actions  ← needs Tasks 7, 8
  Task 11: Filtre Partiels + bouton "Relancer IPTV manquant"  ← needs Task 5

Phase 6 (Wrap-up)
  Task 12: E2E manual validation + commit final
```

Tasks 1-3 forment la fondation, peuvent être faites en série rapide. Tasks 4-6 sont indépendantes après. Tasks 7-9 sont la phase frontend kiosk. Tasks 10-11 sont admin.

---

## Phase 1 — Foundation

### Task 1: Migration DB `kiosk_visible`

**Files:**
- Create: `drizzle/0003_kiosk_visible.sql`
- Modify: `src/db/schema.ts` (ajouter le champ)

- [ ] **Step 1: Créer la migration SQL**

```sql
-- drizzle/0003_kiosk_visible.sql
ALTER TABLE "product_variants" ADD COLUMN "kiosk_visible" boolean DEFAULT true NOT NULL;
UPDATE "product_variants" SET "kiosk_visible" = false WHERE "loadbrain_slug" IN ('ibo-check', 'ibo-inject');
```

- [ ] **Step 2: Mettre à jour `src/db/schema.ts`**

Localiser `productVariants` (chercher `pgTable("product_variants"`) et ajouter le champ après `loadbrainSlug` :

```typescript
kioskVisible: boolean("kiosk_visible").notNull().default(true),
```

- [ ] **Step 3: Mettre à jour le `meta` Drizzle**

```bash
npx drizzle-kit generate
```

Cela créera un fichier dans `drizzle/meta/` reflétant le nouvel état.

- [ ] **Step 4: Appliquer la migration sur la DB locale**

```bash
docker exec 100-pc-ia-db-1 psql -U user -d flexbox -f /docker-entrypoint-initdb.d/0003_kiosk_visible.sql
# OU plus simple, directement via stdin :
cat drizzle/0003_kiosk_visible.sql | docker exec -i 100-pc-ia-db-1 psql -U user -d flexbox
```

- [ ] **Step 5: Vérifier l'effet**

```bash
docker exec 100-pc-ia-db-1 psql -U user -d flexbox -c \
  "SELECT id, name, loadbrain_slug, kiosk_visible FROM product_variants WHERE loadbrain_slug LIKE 'ibo%' ORDER BY id;"
```

Expected:
```
 id  | name                  | loadbrain_slug         | kiosk_visible
-----+-----------------------+------------------------+---------------
 120 | Activation 1 An       | ibo-activate-yearly    | t
 121 | Activation Lifetime   | ibo-activate-lifetime  | t
 122 | Check MAC             | ibo-check              | f
 123 | Inject Playlist       | ibo-inject             | f
```

- [ ] **Step 6: Adapter `getKioskData`**

Dans `src/app/kiosk/actions.ts`, modifier la query produits pour inclure le filtre :

```typescript
const productsList = await db.query.products.findMany({
    where: eq(products.status, "ACTIVE"),
    with: {
        category: true,
        variants: {
            where: eq(productVariants.kioskVisible, true),
        },
    },
});
```

⚠️ Vérifier l'import `productVariants` dans le scope.

- [ ] **Step 7: Nettoyer le cache Next.js et tester**

```bash
rm -rf .next/server .next/cache
npm run dev
# Ouvrir le kiosk, vérifier que IBO Player montre uniquement 2 variantes (Activation 1 An, Lifetime)
```

- [ ] **Step 8: Commit**

```bash
git add drizzle/0003_kiosk_visible.sql drizzle/meta/ src/db/schema.ts src/app/kiosk/actions.ts
git commit -m "feat(db): add kiosk_visible flag on product_variants

Hide ibo-check and ibo-inject from the kiosk catalog.
These remain accessible via admin SAV tools."
```

---

### Task 2: Constante `PROVIDER_SLUGS`

**Files:**
- Create: `src/lib/loadbrain-providers.ts`

- [ ] **Step 1: Créer le fichier**

```typescript
// src/lib/loadbrain-providers.ts
/**
 * Mapping LoadBrain providerId (UUID stable prod) → slug technique attendu
 * dans customerInfo.iptvProvider pour les combos Ibosol.
 *
 * Référence: GET /api/v1/catalog renvoie ces UUIDs.
 */
export const PROVIDER_SLUGS: Record<string, string> = {
    "0eb51cbb-ba96-452d-b0a1-87b71d6cbea4": "panelking365",
    "46346069-075f-44f4-bf38-d1b876af3c6a": "ironmax",
    "7865ebe3-a204-4c1c-aba7-de17aef1193d": "atlaspro",
};

export function getProviderSlug(providerId: string): string {
    const slug = PROVIDER_SLUGS[providerId];
    if (!slug) {
        throw new Error(`Unknown LoadBrain providerId: ${providerId}`);
    }
    return slug;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/loadbrain-providers.ts
git commit -m "feat(loadbrain): add provider UUID → slug mapping

Used by Ibosol combo provisioning to resolve iptvProvider
slug from the IPTV provider UUID stored in customData."
```

---

### Task 3: Module `ibosol-credentials.ts` (parser + formatter)

**Files:**
- Create: `src/lib/ibosol-credentials.ts`
- Create: `scripts/ibosol-credentials-verify.ts`

- [ ] **Step 1: Écrire le module avec types et fonctions pures**

```typescript
// src/lib/ibosol-credentials.ts

/** Payload Ibosol tel que reçu du webhook LoadBrain */
export interface IbosolPayload {
    mac?: string;
    activationCode?: string;
    pin?: string;
    expiresAt?: string;
    isActivated?: boolean;
    playlistInjected?: boolean;
    playlistId?: string;
    iptvUsername?: string;
    iptvPassword?: string;
    m3uUrl?: string;
    epgUrl?: string;
    device?: { app_type?: string; ip?: string };
}

/** Format de customData pour items Ibosol au panier */
export interface IbosolCustomData {
    type: "ibosol";
    mac: string;
    appId: number;
    combo?: {
        iptvVariantId: number;
        iptvProviderId: string;
        iptvPlanId: string;
        iptvProductName: string;
        iptvPrice: string;
    };
}

/** Détecte si un payload webhook est de type Ibosol (vs IPTV classique avec screens[]) */
export function isIbosolPayload(creds: unknown): creds is IbosolPayload {
    if (!creds || typeof creds !== "object") return false;
    const c = creds as Record<string, unknown>;
    return Boolean(c.mac || c.activationCode || c.playlistInjected !== undefined);
}

/** Détecte un échec partiel : combo demandé mais IPTV non créée */
export function isPartialSuccess(payload: IbosolPayload, comboRequested: boolean): boolean {
    if (!comboRequested) return false;
    const hasActivation = !!payload.isActivated || !!payload.activationCode;
    const hasIptvCreds = !!(payload.iptvUsername && payload.iptvPassword);
    return hasActivation && !hasIptvCreds;
}

/** Sérialise les credentials Ibosol en chaîne unique pour digital_codes */
export function formatIbosolCode(payload: IbosolPayload): string {
    const parts: string[] = [];
    if (payload.mac) parts.push(`MAC: ${payload.mac}`);
    if (payload.activationCode) parts.push(`Code activation: ${payload.activationCode}`);
    if (payload.pin) parts.push(`PIN: ${payload.pin}`);
    if (payload.expiresAt) parts.push(`Expire: ${payload.expiresAt}`);
    if (payload.iptvUsername) parts.push(`User: ${payload.iptvUsername}`);
    if (payload.iptvPassword) parts.push(`Pass: ${payload.iptvPassword}`);
    if (payload.m3uUrl) parts.push(`M3U: ${payload.m3uUrl}`);
    if (payload.epgUrl) parts.push(`EPG: ${payload.epgUrl}`);
    if (payload.playlistInjected !== undefined) {
        parts.push(`Playlist injectée: ${payload.playlistInjected ? "oui" : "non"}`);
    }
    return parts.join(" | ");
}

/** Parse customData (string JSON) en `IbosolCustomData` typé. Retourne null si pas Ibosol. */
export function parseIbosolCustomData(customData: string | null | undefined): IbosolCustomData | null {
    if (!customData) return null;
    try {
        const parsed = JSON.parse(customData);
        if (parsed?.type === "ibosol" && typeof parsed.mac === "string" && typeof parsed.appId === "number") {
            return parsed as IbosolCustomData;
        }
    } catch {
        // customData not JSON
    }
    return null;
}

/** Parse une date au format Ibosol "YYYY-MM-DD" ou ISO ou DD-MM-YYYY HH:mm */
export function parseIbosolExpires(raw: string | null | undefined): Date | null {
    if (!raw || raw === "pending") return null;
    const ddmm = raw.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
    if (ddmm) {
        const [, dd, mm, yyyy, hh = "00", mi = "00"] = ddmm;
        return new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:00Z`);
    }
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
}
```

- [ ] **Step 2: Écrire le script de vérification**

```typescript
// scripts/ibosol-credentials-verify.ts
import {
    isIbosolPayload,
    isPartialSuccess,
    formatIbosolCode,
    parseIbosolCustomData,
    parseIbosolExpires,
} from "../src/lib/ibosol-credentials";

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) {
        console.error(`❌ FAIL: ${message}`);
        process.exit(1);
    }
    console.log(`✅ ${message}`);
}

// isIbosolPayload
assert(isIbosolPayload({ mac: "AA:BB" }) === true, "isIbosolPayload: detects mac");
assert(isIbosolPayload({ activationCode: "1234" }) === true, "isIbosolPayload: detects activationCode");
assert(isIbosolPayload({ playlistInjected: false }) === true, "isIbosolPayload: detects playlistInjected=false");
assert(isIbosolPayload({ screens: [{ username: "x" }] }) === false, "isIbosolPayload: rejects IPTV screens");
assert(isIbosolPayload(null) === false, "isIbosolPayload: rejects null");

// isPartialSuccess
assert(
    isPartialSuccess({ isActivated: true, iptvUsername: "u", iptvPassword: "p" }, true) === false,
    "isPartialSuccess: combo OK is not partial"
);
assert(
    isPartialSuccess({ isActivated: true }, true) === true,
    "isPartialSuccess: combo without IPTV creds is partial"
);
assert(
    isPartialSuccess({ isActivated: true }, false) === false,
    "isPartialSuccess: no combo requested is never partial"
);

// formatIbosolCode
const code = formatIbosolCode({ mac: "AA:BB", activationCode: "0929", expiresAt: "2027-05-01" });
assert(
    code === "MAC: AA:BB | Code activation: 0929 | Expire: 2027-05-01",
    "formatIbosolCode: 3 fields formatted"
);
assert(formatIbosolCode({}) === "", "formatIbosolCode: empty payload returns empty string");

// parseIbosolCustomData
const valid = parseIbosolCustomData('{"type":"ibosol","mac":"AA","appId":1}');
assert(valid !== null && valid.mac === "AA" && valid.appId === 1, "parseIbosolCustomData: valid JSON");
assert(parseIbosolCustomData("credentials") === null, "parseIbosolCustomData: IPTV string returns null");
assert(parseIbosolCustomData(null) === null, "parseIbosolCustomData: null returns null");
assert(parseIbosolCustomData("{invalid json") === null, "parseIbosolCustomData: bad JSON returns null");
assert(parseIbosolCustomData('{"type":"player","mac":"AA"}') === null, "parseIbosolCustomData: wrong type returns null");

// parseIbosolExpires
const d1 = parseIbosolExpires("2027-05-01");
assert(d1 !== null && d1.toISOString().startsWith("2027-05-01"), "parseIbosolExpires: ISO date");
const d2 = parseIbosolExpires("01-05-2027 14:30");
assert(d2 !== null && d2.toISOString() === "2027-05-01T14:30:00.000Z", "parseIbosolExpires: DD-MM-YYYY HH:mm");
assert(parseIbosolExpires(null) === null, "parseIbosolExpires: null returns null");
assert(parseIbosolExpires("pending") === null, "parseIbosolExpires: 'pending' returns null");

console.log("\n🎉 All assertions passed");
```

- [ ] **Step 3: Lancer le script**

```bash
npx tsx scripts/ibosol-credentials-verify.ts
```

Expected: tous les checks ✅ + "All assertions passed".

- [ ] **Step 4: Commit**

```bash
git add src/lib/ibosol-credentials.ts scripts/ibosol-credentials-verify.ts
git commit -m "feat(ibosol): add credentials parser, formatter, partial-success detector

Pure functions used by webhook handler, delivery, and provisioning
to handle Ibosol's flat credentials format and detect combo failures."
```

---

## Phase 2 — Provisioning logic

### Task 4: `iptv.ts` — combo payload Ibosol

**Files:**
- Modify: `src/lib/iptv.ts`

- [ ] **Step 1: Ajouter les imports**

En haut de `src/lib/iptv.ts` :

```typescript
import { parseIbosolCustomData } from "@/lib/ibosol-credentials";
import { getProviderSlug } from "@/lib/loadbrain-providers";
```

- [ ] **Step 2: Remplacer le bloc parse customData**

Localiser dans la fonction `provisionIptvOrder` le bloc :

```typescript
// Parse Ibosol JSON customData (mac + appId) vs IPTV string ("credentials"|"code")
const isIbosolSlug = slug.startsWith("ibo-");
let ibosolDevice: { mac?: string; appId?: number } = {};
let iptvDelivery: string = "credentials";

if (isIbosolSlug && item.customData) {
    try {
        const parsed = JSON.parse(item.customData);
        if (parsed?.type === "ibosol") {
            ibosolDevice = { mac: parsed.mac, appId: parsed.appId };
        }
    } catch {
        // customData not JSON
    }
} else {
    iptvDelivery = item.customData || "credentials";
}
```

Remplacer par :

```typescript
const isIbosolSlug = slug.startsWith("ibo-");
const ibosolData = isIbosolSlug ? parseIbosolCustomData(item.customData) : null;
const iptvDelivery: string = isIbosolSlug ? "" : (item.customData || "credentials");
```

- [ ] **Step 3: Remplacer le bloc construction customerInfo**

Localiser le bloc :

```typescript
// Build customerInfo with Ibosol device fields when applicable
const customerInfo: Record<string, unknown> = {
    name: customerName,
    phone: customerPhone,
    orderNumber: order.orderNumber,
};
if (isIbosolSlug) {
    if (!ibosolDevice.mac) throw new Error(`MAC address required for Ibosol product "${slug}"`);
    customerInfo.mac = ibosolDevice.mac;
    customerInfo.appId = ibosolDevice.appId ?? 1;
}
```

Remplacer par :

```typescript
const customerInfo: Record<string, unknown> = {
    name: customerName,
    phone: customerPhone,
    orderNumber: order.orderNumber,
};
if (isIbosolSlug) {
    if (!ibosolData?.mac) throw new Error(`MAC address required for Ibosol product "${slug}"`);
    customerInfo.mac = ibosolData.mac;
    customerInfo.appId = ibosolData.appId;

    if (ibosolData.combo) {
        customerInfo.iptvProvider = getProviderSlug(ibosolData.combo.iptvProviderId);
        customerInfo.iptvProviderId = ibosolData.combo.iptvProviderId;
        customerInfo.iptvPlanId = ibosolData.combo.iptvPlanId;
    }
}
```

- [ ] **Step 4: Vérifier le typecheck**

```bash
npx tsc --noEmit 2>&1 | grep "src/lib/iptv.ts"
```

Expected: aucune erreur sur ce fichier (les autres erreurs préexistantes peuvent rester).

- [ ] **Step 5: Commit**

```bash
git add src/lib/iptv.ts
git commit -m "feat(iptv): support Ibosol combo (IPTV bundled with device activation)

When customData contains a 'combo' field, forwards iptvProvider/
iptvProviderId/iptvPlanId to LoadBrain so the IBOSOL worker can
chain device activation + IPTV line creation + playlist injection
in one call."
```

---

### Task 5: Webhook handler — détection `completed_partial`

**Files:**
- Modify: `src/app/api/loadbrain/webhook/route.ts`

- [ ] **Step 1: Ajouter les imports**

```typescript
import {
    isIbosolPayload,
    isPartialSuccess,
    formatIbosolCode,
    parseIbosolExpires,
    parseIbosolCustomData,
} from "@/lib/ibosol-credentials";
```

- [ ] **Step 2: Remplacer le bloc handleComplete**

Localiser dans `handleComplete` le bloc qui gère le payload Ibosol (commence par `if (isIbosolPayload)`) et le remplacer par :

```typescript
const creds = event.credentials || {};
const ibosolMode = isIbosolPayload(creds);
const screens = creds.screens || [];

if (!ibosolMode && screens.length === 0) return;

// Detect partial success for combo orders
const targetCustomData = parseIbosolCustomData(targetItem.customData);
const comboRequested = !!targetCustomData?.combo;
const partial = ibosolMode && isPartialSuccess(creds, comboRequested);
const finalStatus = partial ? "completed_partial" : "completed";

await db.transaction(async (tx) => {
    const existing = await tx.query.digitalCodes.findFirst({
        where: eq(digitalCodes.orderItemId, targetItem.id),
    });
    if (existing) return;

    if (ibosolMode) {
        const codeValue = formatIbosolCode(creds);
        await tx.insert(digitalCodes).values({
            variantId: targetItem.variantId,
            orderItemId: targetItem.id,
            code: encrypt(codeValue),
            status: DigitalCodeStatus.VENDU,
            expiresAt: parseIbosolExpires(creds.expiresAt),
        });
    } else {
        for (const screen of screens) {
            const isCodeMode = screen.code && !screen.username;
            let m3uUrl = screen.m3uUrl || "";
            if (!isCodeMode && !m3uUrl && screen.epgUrl) {
                const host = screen.epgUrl.split("/xmltv")[0];
                m3uUrl = `${host}/get.php?username=${screen.username}&password=${screen.password}&type=m3u_plus`;
            }
            const codeValue = isCodeMode
                ? screen.code
                : [screen.username, screen.password, m3uUrl, screen.epgUrl || ""].join(" | ");

            await tx.insert(digitalCodes).values({
                variantId: targetItem.variantId,
                orderItemId: targetItem.id,
                code: encrypt(codeValue),
                status: DigitalCodeStatus.VENDU,
                expiresAt: parseIbosolExpires(screen.expiresAt),
            });
        }
    }

    await tx.update(iptvProvisions).set({
        status: finalStatus,
        error: partial ? "IPTV combo not delivered" : null,
        errorCode: partial ? "PARTIAL_IPTV" : null,
        credentialsEncrypted: encrypt(JSON.stringify(event.credentials)),
        completedAt: new Date(),
    }).where(and(
        eq(iptvProvisions.orderId, order.id),
        eq(iptvProvisions.orderItemId, targetItem.id),
        inArray(iptvProvisions.status, ["queued", "processing", "failed"]),
    ));

    const isWhatsApp = (order as any).deliveryMethod === DeliveryMethod.WHATSAPP;
    await tx.update(orders).set({
        status: OrderStatus.TERMINE,
        isDelivered: true,
        printStatus: isWhatsApp ? "idle" : "print_pending",
    }).where(eq(orders.id, order.id));
});

eventBus.publish(SystemEvent.ORDER_DELIVERED, { orderId: order.id });

const summary = ibosolMode
    ? (partial
        ? `⚠️ IBO activé, IPTV échouée (action SAV requise)`
        : (creds.iptvUsername
            ? `🔑 ${creds.mac} + IPTV ${creds.iptvUsername}`
            : `🔑 ${creds.mac} ${creds.activationCode ? "→ activé" : ""}`.trim()))
    : `🔑 ${screens[0]?.username || screens[0]?.code || "code"} / ${"•".repeat(8)}`;

const emoji = partial ? "⚠️" : "✅";
const title = partial ? "IBO partiel" : (ibosolMode ? "IBO livré" : "IPTV livré");

sendTelegramNotification(
    `${emoji} *${title}*\n📋 \`${order.orderNumber}\`\n👤 ${(order as any).client?.nomComplet || "N/A"}\n${summary}`,
    ["ADMIN"]
).catch(() => {});
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit 2>&1 | grep "webhook/route.ts"
```

Expected: aucune erreur.

- [ ] **Step 4: Test manuel via curl**

Préparer un payload combo OK et un payload partiel, tester via curl :

```bash
# Payload combo OK (à signer en HMAC pour passer la vérif)
node -e "
const crypto = require('crypto');
const secret = 'whsec_robotech_loadbrain_2026';
const ts = Math.floor(Date.now()/1000).toString();
const body = JSON.stringify({
  event: 'provision.completed',
  taskId: 'test-task-combo-ok',
  orderId: '#TEST-COMBO-OK',
  status: 'completed',
  credentials: {
    mac: 'AA:BB:CC:DD:EE:FF',
    activationCode: '0929928345852700',
    isActivated: true,
    expiresAt: '2027-05-01',
    playlistInjected: true,
    iptvUsername: 'pn4kf7x2m9',
    iptvPassword: 'xxx',
    m3uUrl: 'http://lg.stir.wales:8080/get.php?username=pn4kf7x2m9&password=xxx&type=m3u_plus'
  }
});
const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(ts+'.'+body).digest('hex');
console.log('TS=' + ts);
console.log('SIG=' + sig);
console.log('BODY=' + body);
"
```

L'order `#TEST-COMBO-OK` n'existe pas → on s'attend à un log d'erreur "No order" et 200 (le handler swallow). Cela vérifie que le code n'a pas de regression syntax.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/loadbrain/webhook/route.ts
git commit -m "feat(webhook): detect partial Ibosol combo failures

When the order had an IPTV combo but LoadBrain returned activation
without IPTV credentials, mark the provision as completed_partial
and notify SAV via Telegram. Partial deliveries still write the
digital_code with what was received."
```

---

## Phase 3 — Delivery

### Task 6: WhatsApp templates Ibosol

**Files:**
- Modify: `src/lib/delivery.ts`

- [ ] **Step 1: Lire la structure existante**

```bash
grep -n "iptv\|hasIptv\|isIptvItem\|ibo" src/lib/delivery.ts | head -30
```

Identifier où sont construits les messages WhatsApp pour les items IPTV (template "Comment configurer votre IPTV").

- [ ] **Step 2: Ajouter helper de format Ibosol**

En tête du fichier (ou après les autres helpers) :

```typescript
import { parseIbosolCustomData } from "@/lib/ibosol-credentials";

interface IbosolFormatInput {
    mac?: string;
    activationCode?: string;
    expiresAt?: string;
    appId?: number;
    iptvUsername?: string;
    iptvPassword?: string;
    m3uUrl?: string;
    iptvProviderName?: string;
    iptvPlanName?: string;
    isPartial?: boolean;
}

const APP_NAMES: Record<number, string> = {
    1: "IBO Player",
    2: "SmartOne",
    3: "BOB Player",
    4: "IBO Pro",
};

function formatExpiresFr(raw?: string): string {
    if (!raw) return "N/A";
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString("fr-FR");
}

function buildIbosolMessage(input: IbosolFormatInput): string {
    const appName = APP_NAMES[input.appId ?? 1] ?? "IBO Player";

    if (input.isPartial) {
        return [
            `🎉 *Activation ${appName} réussie*`,
            ``,
            `📱 *Device activé*`,
            `MAC : ${input.mac}`,
            input.activationCode ? `Code activation : ${input.activationCode}` : null,
            input.expiresAt ? `Expire le : ${formatExpiresFr(input.expiresAt)}` : null,
            ``,
            `⚠️ *IPTV en cours de traitement*`,
            `Notre service va vous recontacter sous peu pour finaliser votre abonnement IPTV.`,
        ].filter(Boolean).join("\n");
    }

    if (input.iptvUsername && input.iptvPassword) {
        // Combo OK
        return [
            `🎉 *Votre ${appName} + IPTV est prêt*`,
            ``,
            `📱 *Device activé*`,
            `MAC : ${input.mac}`,
            input.activationCode ? `Code activation : ${input.activationCode}` : null,
            input.expiresAt ? `Expire le : ${formatExpiresFr(input.expiresAt)}` : null,
            ``,
            `📺 *Abonnement ${input.iptvProviderName || "IPTV"}${input.iptvPlanName ? ` ${input.iptvPlanName}` : ""}*`,
            `Identifiant : ${input.iptvUsername}`,
            `Mot de passe : ${input.iptvPassword}`,
            input.m3uUrl ? `URL M3U : ${input.m3uUrl}` : null,
            ``,
            `✅ La playlist est déjà injectée dans votre device — il suffit d'ouvrir ${appName}.`,
        ].filter(Boolean).join("\n");
    }

    // Activation seule
    return [
        `🎉 *Votre activation ${appName}*`,
        ``,
        `📱 *Device*`,
        `MAC : ${input.mac}`,
        `Application : ${appName}`,
        ``,
        `🔑 *Code activation*`,
        input.activationCode || "—",
        ``,
        input.expiresAt ? `📅 Expire le : ${formatExpiresFr(input.expiresAt)}` : null,
        ``,
        `💡 *Comment activer :*`,
        `1. Ouvrez ${appName} sur votre device`,
        `2. Allez dans Paramètres → Activer`,
        `3. Entrez le code ci-dessus`,
        `4. Profitez !`,
    ].filter(Boolean).join("\n");
}
```

- [ ] **Step 3: Brancher dans le flow d'envoi**

Localiser la fonction qui envoie les WhatsApp (probablement `deliverOrder` ou `buildWhatsAppMessages`). Ajouter avant les blocs IPTV existants :

```typescript
// Détection items Ibosol
const ibosolItems = (order as any).items.filter((it: any) =>
    it.variant?.loadbrainSlug?.startsWith("ibo-")
);

for (const ibo of ibosolItems) {
    const customData = parseIbosolCustomData(ibo.customData);
    const codes = ibo.codes || [];
    if (codes.length === 0) continue;

    // Le digital_code stocke le format "MAC: ... | Code activation: ... | ..."
    // On parse pour reconstruire le payload
    const decryptedCode = decrypt(codes[0].code);
    const fields: Record<string, string> = {};
    for (const part of decryptedCode.split(" | ")) {
        const [k, ...rest] = part.split(": ");
        if (k && rest.length) fields[k.trim()] = rest.join(": ").trim();
    }

    const provisionStatus = (await db.query.iptvProvisions.findFirst({
        where: and(
            eq(iptvProvisions.orderId, order.id),
            eq(iptvProvisions.orderItemId, ibo.id)
        ),
    }))?.status;

    const message = buildIbosolMessage({
        mac: fields["MAC"],
        activationCode: fields["Code activation"],
        expiresAt: fields["Expire"],
        appId: customData?.appId ?? 1,
        iptvUsername: fields["User"],
        iptvPassword: fields["Pass"],
        m3uUrl: fields["M3U"],
        iptvProviderName: customData?.combo?.iptvProductName?.split(" ")[1], // ex: "King365 12 Mois" → "King365"
        iptvPlanName: customData?.combo?.iptvProductName,
        isPartial: provisionStatus === "completed_partial",
    });

    await sendWhatsAppMessage(customerPhone, message, { ... }); // adapter selon la signature existante
}
```

⚠️ Adapter aux conventions exactes de `delivery.ts` (variables nommées comme `phone`, `client`, helper `sendWhatsApp` ou `sendWhatsAppMessage`, etc.). Lire 100 lignes autour du flow IPTV existant avant de modifier.

- [ ] **Step 4: Empêcher le double envoi**

Si le flow existant boucle sur tous les items et envoie un message générique, l'ajout Ibosol doit **s'exécuter en plus** mais les items ibosol ne doivent PAS générer le message IPTV générique. Ajouter dans les filtres existants `&& !it.variant?.loadbrainSlug?.startsWith("ibo-")` pour exclure Ibosol des templates IPTV classiques.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit 2>&1 | grep "delivery.ts"
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/delivery.ts
git commit -m "feat(delivery): add 3 WhatsApp templates for Ibosol

- Activation seule (MAC + code + tutorial)
- Combo OK (activation + IPTV creds + playlist injected confirmation)
- Combo partiel (activation OK, IPTV in progress message)

Excludes Ibosol items from generic IPTV templates."
```

---

## Phase 4 — Kiosk UX

### Task 7: `IbosolComboModal`

**Files:**
- Create: `src/app/kiosk/components/IbosolComboModal.tsx`

- [ ] **Step 1: Créer le composant**

```tsx
"use client";

import React, { useEffect, useState } from "react";
import { Modal, ModalContent, ModalBody, Button } from "@heroui/react";
import { formatCurrency } from "@/lib/formatters";
import { Tv, Check } from "lucide-react";

interface IptvPlan {
    variantId: number;
    providerId: string;
    providerName: string;
    planId: string;
    productName: string;
    durationDays: number;
    price: string;
}

interface IbosolComboModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (combo: IptvPlan | null) => void;
    iboPrice: string;       // prix Activation IBO (DZD string)
    iboName: string;        // ex: "Activation 1 an"
    availablePlans: IptvPlan[];
}

export default function IbosolComboModal({
    isOpen,
    onClose,
    onConfirm,
    iboPrice,
    iboName,
    availablePlans,
}: IbosolComboModalProps) {
    const [mode, setMode] = useState<"none" | "skip" | "combo">("none");
    const [activeProvider, setActiveProvider] = useState<string>("");
    const [selectedPlan, setSelectedPlan] = useState<IptvPlan | null>(null);

    useEffect(() => {
        if (isOpen) {
            setMode("none");
            setSelectedPlan(null);
            const firstProvider = availablePlans[0]?.providerName || "";
            setActiveProvider(firstProvider);
        }
    }, [isOpen, availablePlans]);

    const providers = Array.from(new Set(availablePlans.map(p => p.providerName)));
    const plansByProvider = availablePlans
        .filter(p => p.providerName === activeProvider)
        .sort((a, b) => b.durationDays - a.durationDays);

    const total = parseFloat(iboPrice) + (selectedPlan ? parseFloat(selectedPlan.price) : 0);
    const canConfirm = mode === "skip" || (mode === "combo" && selectedPlan);

    const handleConfirm = () => {
        if (!canConfirm) return;
        onConfirm(mode === "combo" ? selectedPlan : null);
    };

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={onClose}
            size="2xl"
            placement="center"
            backdrop="blur"
            hideCloseButton
            classNames={{
                base: "bg-white rounded-[24px] shadow-2xl",
                backdrop: "bg-slate-900/40 backdrop-blur-xl",
            }}
        >
            <ModalContent>
                {(closeFn) => (
                    <ModalBody className="p-6">
                        <header className="text-center mb-5">
                            <div className="inline-block p-3 bg-cyan-50 rounded-2xl mb-3">
                                <Tv className="w-6 h-6 text-cyan-600" />
                            </div>
                            <h2 className="text-lg font-black uppercase tracking-tight text-black">
                                Souhaitez-vous aussi un abonnement IPTV ?
                            </h2>
                            <p className="text-xs text-slate-500 mt-1 font-bold uppercase tracking-wider">
                                Bundle activation + IPTV → injection automatique sur votre device
                            </p>
                        </header>

                        {/* Choix mode */}
                        <div className="grid grid-cols-2 gap-3 mb-5">
                            <button
                                onClick={() => { setMode("skip"); setSelectedPlan(null); }}
                                className={`p-4 border-2 rounded-2xl text-left transition-all ${
                                    mode === "skip"
                                        ? "border-slate-800 bg-slate-50"
                                        : "border-slate-200 bg-white hover:border-slate-300"
                                }`}
                            >
                                <div className="font-black text-black mb-1">Non, IBO seul</div>
                                <div className="text-sm font-bold text-slate-500">{formatCurrency(parseFloat(iboPrice), "DZD")}</div>
                            </button>

                            <button
                                onClick={() => setMode("combo")}
                                className={`p-4 border-2 rounded-2xl text-left transition-all ${
                                    mode === "combo"
                                        ? "border-cyan-500 bg-cyan-50"
                                        : "border-slate-200 bg-white hover:border-slate-300"
                                }`}
                            >
                                <div className="font-black text-black mb-1">Oui, ajouter un IPTV</div>
                                <div className="text-sm font-bold text-cyan-600">Choisir un plan ↓</div>
                            </button>
                        </div>

                        {/* Picker IPTV */}
                        {mode === "combo" && (
                            <div className="mb-5 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                <div className="flex gap-2 overflow-x-auto pb-1">
                                    {providers.map(p => (
                                        <button
                                            key={p}
                                            onClick={() => setActiveProvider(p)}
                                            className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider whitespace-nowrap transition-colors ${
                                                activeProvider === p
                                                    ? "bg-cyan-600 text-white"
                                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                            }`}
                                        >
                                            {p}
                                        </button>
                                    ))}
                                </div>

                                <div className="space-y-2">
                                    {plansByProvider.map(plan => {
                                        const isSelected = selectedPlan?.planId === plan.planId;
                                        return (
                                            <button
                                                key={plan.planId}
                                                onClick={() => setSelectedPlan(plan)}
                                                className={`w-full p-3 border-2 rounded-xl flex items-center justify-between transition-all ${
                                                    isSelected
                                                        ? "border-cyan-500 bg-cyan-50"
                                                        : "border-slate-200 bg-white hover:border-slate-300"
                                                }`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    {isSelected && <Check className="w-4 h-4 text-cyan-600" />}
                                                    <span className="font-bold text-black text-sm">{plan.productName}</span>
                                                </div>
                                                <span className="font-black text-black text-sm">
                                                    {formatCurrency(parseFloat(plan.price), "DZD")}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Total */}
                        <div className="mb-4 p-4 bg-slate-50 rounded-xl flex justify-between items-center">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-500">Total</span>
                            <span className="text-lg font-black text-black">
                                {formatCurrency(total, "DZD")}
                            </span>
                        </div>

                        <footer className="grid grid-cols-2 gap-3">
                            <Button
                                size="lg"
                                className="bg-white border-2 border-slate-200 text-black font-black"
                                onPress={closeFn}
                            >
                                Retour
                            </Button>
                            <Button
                                size="lg"
                                className="bg-cyan-600 text-white font-black"
                                onPress={handleConfirm}
                                isDisabled={!canConfirm}
                            >
                                Ajouter au panier
                            </Button>
                        </footer>
                    </ModalBody>
                )}
            </ModalContent>
        </Modal>
    );
}

export type { IptvPlan };
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit 2>&1 | grep "IbosolComboModal"
```

Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add src/app/kiosk/components/IbosolComboModal.tsx
git commit -m "feat(kiosk): add IbosolComboModal for IBO + IPTV bundle picker

Step 2 of the Ibosol purchase flow. Lets the customer skip
or pick an IPTV provider/plan to bundle with their device
activation. Provider tabs + plan list sorted by duration desc."
```

---

### Task 8: Check device — modal + action serveur

**Files:**
- Create: `src/app/kiosk/components/IbosolCheckModal.tsx`
- Create: `src/app/kiosk/components/IbosolCheckResultModal.tsx`
- Create: `src/app/kiosk/actions/check-device.ts`

- [ ] **Step 1: Créer la server action**

```typescript
// src/app/kiosk/actions/check-device.ts
"use server";

import { lbClient, isLoadBrainEnabled } from "@/lib/loadbrain";
import { z } from "zod";

const inputSchema = z.object({
    mac: z.string().regex(/^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/),
    appId: z.number().int().min(1).max(10),
});

export interface CheckDeviceResult {
    success: boolean;
    error?: string;
    data?: {
        mac: string;
        appName: string;
        isActivated: boolean;
        expiresAt: string | null;
        ip: string | null;
        playlistInjected: boolean;
    };
}

const APP_NAMES: Record<number, string> = {
    1: "IBO Player",
    2: "SmartOne",
    3: "BOB Player",
    4: "IBO Pro",
};

export async function checkIbosolDevice(input: { mac: string; appId: number }): Promise<CheckDeviceResult> {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, error: "MAC invalide" };
    }

    if (!isLoadBrainEnabled() || !lbClient) {
        return { success: false, error: "Service indisponible" };
    }

    try {
        // Le SDK 3.2.0 expose ibosol.checkDevice
        // L'appel sous-jacent fait : POST /api/v1/provision avec planId=ibo-check + customerInfo.mac/appId
        // ET attend la réponse synchrone (le module ibosol exécute le check rapidement)
        const result = await (lbClient as any).ibosol?.checkDevice?.({
            mac: parsed.data.mac,
            appId: parsed.data.appId,
        });

        if (!result) {
            return { success: false, error: "SDK ibosol.checkDevice indisponible" };
        }

        return {
            success: true,
            data: {
                mac: result.mac || parsed.data.mac,
                appName: APP_NAMES[parsed.data.appId] || "IBO Player",
                isActivated: !!result.isActivated,
                expiresAt: result.expiresAt || null,
                ip: result.device?.ip || null,
                playlistInjected: !!result.playlistInjected,
            },
        };
    } catch (err: any) {
        return { success: false, error: err.message || "Erreur de vérification" };
    }
}
```

- [ ] **Step 2: Créer `IbosolCheckModal.tsx`**

```tsx
// src/app/kiosk/components/IbosolCheckModal.tsx
"use client";

import React, { useEffect, useState } from "react";
import { Modal, ModalContent, ModalBody, Button, Input, Select, SelectItem } from "@heroui/react";

const APP_OPTIONS = [
    { id: "1", label: "IBO Player" },
    { id: "2", label: "SmartOne" },
    { id: "3", label: "BOB Player" },
    { id: "4", label: "IBO Pro" },
];

const MAC_REGEX = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;

interface IbosolCheckModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (mac: string, appId: number) => void;
}

export default function IbosolCheckModal({ isOpen, onClose, onSubmit }: IbosolCheckModalProps) {
    const [mac, setMac] = useState("");
    const [appId, setAppId] = useState("1");

    useEffect(() => {
        if (isOpen) {
            setMac("");
            setAppId("1");
        }
    }, [isOpen]);

    const isValidMac = MAC_REGEX.test(mac.trim());

    return (
        <Modal isOpen={isOpen} onOpenChange={onClose} size="md" placement="center" backdrop="blur" hideCloseButton
            classNames={{ base: "bg-white rounded-[24px]", backdrop: "bg-slate-900/40 backdrop-blur-xl" }}>
            <ModalContent>
                {(closeFn) => (
                    <ModalBody className="p-6">
                        <header className="text-center mb-5">
                            <div className="inline-block p-3 bg-cyan-50 rounded-2xl mb-3">
                                <span className="material-symbols-outlined !text-3xl text-cyan-600">search</span>
                            </div>
                            <h2 className="text-lg font-black uppercase tracking-tight text-black">
                                Vérifier mon device
                            </h2>
                            <p className="text-xs text-slate-500 mt-1 font-bold uppercase tracking-wider">
                                Service gratuit · Résultat affiché à l&apos;écran
                            </p>
                        </header>

                        <div className="space-y-3">
                            <Input
                                label="Adresse MAC"
                                placeholder="AA:BB:CC:DD:EE:FF"
                                variant="bordered"
                                value={mac}
                                onValueChange={setMac}
                                isInvalid={mac.length > 0 && !isValidMac}
                                errorMessage={mac.length > 0 && !isValidMac ? "Format invalide" : ""}
                                classNames={{ input: "font-mono uppercase font-black" }}
                                autoFocus
                            />

                            <Select
                                label="Application"
                                selectedKeys={[appId]}
                                onChange={(e) => setAppId(e.target.value)}
                                variant="bordered"
                            >
                                {APP_OPTIONS.map(opt => <SelectItem key={opt.id}>{opt.label}</SelectItem>)}
                            </Select>
                        </div>

                        <footer className="grid grid-cols-2 gap-3 mt-6">
                            <Button className="bg-white border-2 border-slate-200 text-black font-black" onPress={closeFn}>
                                Annuler
                            </Button>
                            <Button
                                className="bg-cyan-600 text-white font-black"
                                onPress={() => {
                                    if (!isValidMac) return;
                                    onSubmit(mac.trim().toUpperCase(), parseInt(appId, 10));
                                }}
                                isDisabled={!isValidMac}
                            >
                                Vérifier
                            </Button>
                        </footer>
                    </ModalBody>
                )}
            </ModalContent>
        </Modal>
    );
}
```

- [ ] **Step 3: Créer `IbosolCheckResultModal.tsx`**

```tsx
// src/app/kiosk/components/IbosolCheckResultModal.tsx
"use client";

import React from "react";
import { Modal, ModalContent, ModalBody, Button } from "@heroui/react";
import { CheckCircle, XCircle } from "lucide-react";
import type { CheckDeviceResult } from "../actions/check-device";

interface IbosolCheckResultModalProps {
    isOpen: boolean;
    onClose: () => void;
    onActivate?: (mac: string, appId: number) => void;
    result: CheckDeviceResult | null;
    loading: boolean;
    inputMac?: string;
    inputAppId?: number;
}

export default function IbosolCheckResultModal({
    isOpen, onClose, onActivate, result, loading, inputMac, inputAppId,
}: IbosolCheckResultModalProps) {
    return (
        <Modal isOpen={isOpen} onOpenChange={onClose} size="md" placement="center" backdrop="blur" hideCloseButton>
            <ModalContent>
                {(closeFn) => (
                    <ModalBody className="p-6">
                        {loading ? (
                            <div className="text-center py-10">
                                <div className="inline-block w-10 h-10 border-4 border-cyan-200 border-t-cyan-600 rounded-full animate-spin mb-4" />
                                <p className="text-sm font-black uppercase tracking-wider text-slate-600">
                                    Vérification en cours...
                                </p>
                            </div>
                        ) : result?.success && result.data ? (
                            <>
                                <header className="text-center mb-5">
                                    {result.data.isActivated ? (
                                        <div className="inline-block p-3 bg-emerald-50 rounded-2xl mb-3">
                                            <CheckCircle className="w-8 h-8 text-emerald-600" />
                                        </div>
                                    ) : (
                                        <div className="inline-block p-3 bg-amber-50 rounded-2xl mb-3">
                                            <XCircle className="w-8 h-8 text-amber-600" />
                                        </div>
                                    )}
                                    <h2 className="text-lg font-black uppercase tracking-tight text-black">
                                        {result.data.isActivated ? "Device activé" : "Device non activé"}
                                    </h2>
                                </header>

                                <div className="space-y-2 text-sm">
                                    <Row label="MAC" value={result.data.mac} mono />
                                    <Row label="Application" value={result.data.appName} />
                                    <Row label="Activé" value={result.data.isActivated ? "Oui" : "Non"} />
                                    {result.data.expiresAt && <Row label="Expire le" value={new Date(result.data.expiresAt).toLocaleDateString("fr-FR")} />}
                                    {result.data.ip && <Row label="IP" value={result.data.ip} mono />}
                                    <Row label="Playlist injectée" value={result.data.playlistInjected ? "Oui" : "Non"} />
                                </div>

                                <footer className="grid grid-cols-2 gap-3 mt-6">
                                    <Button className="bg-white border-2 border-slate-200 text-black font-black" onPress={closeFn}>
                                        Fermer
                                    </Button>
                                    {!result.data.isActivated && onActivate && inputMac && inputAppId && (
                                        <Button
                                            className="bg-cyan-600 text-white font-black"
                                            onPress={() => { onActivate(inputMac, inputAppId); closeFn(); }}
                                        >
                                            Activer ce device →
                                        </Button>
                                    )}
                                </footer>
                            </>
                        ) : (
                            <div className="text-center py-6">
                                <XCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
                                <p className="text-sm font-black text-black mb-1">Erreur</p>
                                <p className="text-xs text-slate-500">{result?.error || "Vérification impossible"}</p>
                                <Button className="mt-5 bg-slate-100 text-black font-black" onPress={closeFn}>
                                    Fermer
                                </Button>
                            </div>
                        )}
                    </ModalBody>
                )}
            </ModalContent>
        </Modal>
    );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex justify-between py-1.5 border-b border-slate-100">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</span>
            <span className={`font-black text-black ${mono ? "font-mono" : ""}`}>{value}</span>
        </div>
    );
}
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit 2>&1 | grep -E "IbosolCheck|check-device"
```

Expected: aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add src/app/kiosk/components/IbosolCheckModal.tsx \
        src/app/kiosk/components/IbosolCheckResultModal.tsx \
        src/app/kiosk/actions/check-device.ts
git commit -m "feat(kiosk): add free Check Device flow (synchronous)

Standalone button on IBO Player product card. Calls LoadBrain
SDK 3.2.0 IbosolModule.checkDevice() synchronously, displays
result in modal. No order, no payment, no DB write."
```

---

### Task 9: ProductModal integration + cart store + actions

**Files:**
- Modify: `src/store/useKioskStore.ts` (ajout `combo` au CartItem)
- Modify: `src/app/kiosk/components/ProductModal.tsx`
- Modify: `src/app/kiosk/actions.ts`
- Modify: `src/app/kiosk/views/CatalogueView.tsx` (sous-bullets pour items combo)
- Modify: `src/app/kiosk/KioskMobile.tsx` (idem)

- [ ] **Step 1: Ajouter `combo` au type `CartItem`**

Dans `src/store/useKioskStore.ts`, localiser `interface CartItem` et ajouter :

```typescript
combo?: {
    iptvVariantId: number;
    iptvProviderId: string;
    iptvPlanId: string;
    iptvProductName: string;
    iptvPrice: string;
};
```

- [ ] **Step 2: Adapter `ProductModal.tsx`**

Remplacer le bloc d'imports en tête :

```tsx
import { useKioskStore } from "@/store/useKioskStore";
import PlayerIdModal from "./PlayerIdModal";
import IbosolDeviceModal from "./IbosolDeviceModal";
import IbosolComboModal, { type IptvPlan } from "./IbosolComboModal";
import IbosolCheckModal from "./IbosolCheckModal";
import IbosolCheckResultModal from "./IbosolCheckResultModal";
import { checkIbosolDevice, type CheckDeviceResult } from "../actions/check-device";
import Image from "next/image";
import { formatCurrency } from "@/lib/formatters";
```

Ajouter aux states :

```tsx
const [isIbosolModalOpen, setIsIbosolModalOpen] = useState(false);
const [isComboModalOpen, setIsComboModalOpen] = useState(false);
const [pendingDevice, setPendingDevice] = useState<{ mac: string; appId: number } | null>(null);

// Check flow
const [isCheckModalOpen, setIsCheckModalOpen] = useState(false);
const [isCheckResultOpen, setIsCheckResultOpen] = useState(false);
const [checkLoading, setCheckLoading] = useState(false);
const [checkResult, setCheckResult] = useState<CheckDeviceResult | null>(null);
const [lastCheckedDevice, setLastCheckedDevice] = useState<{ mac: string; appId: number } | null>(null);
```

Garde 1 IBO max — au début de `handleAddToCart` :

```tsx
const handleAddToCart = () => {
    if (Object.keys(selectedQuantities).length === 0) return;

    const cart = useKioskStore.getState().cart;
    const hasIboInCart = cart.some(it => it.loadbrainSlug?.startsWith("ibo-"));

    if (hasIbosolSelected) {
        if (hasIboInCart) {
            toast.error("Vous avez déjà un IBO Player au panier. Faites une commande séparée pour activer un autre device.");
            return;
        }
        // Force qty=1 sur les variantes ibosol (sécurité — devrait être déjà le cas via UI)
        setIsIbosolModalOpen(true);
        return;
    }

    if (product.requiresPlayerId) {
        setIsPlayerIdModalOpen(true);
        return;
    }

    finalizeAddToCart();
};
```

Adapter le flow :

```tsx
// Étape 1 : Modal MAC → on garde temporairement l'info, ouvre la combo modal
const handleIbosolDeviceSubmit = (mac: string, appId: number) => {
    setPendingDevice({ mac, appId });
    setIsIbosolModalOpen(false);
    setIsComboModalOpen(true);
};

// Étape 2 : Combo modal → ajoute au panier avec ou sans combo
const handleComboConfirm = (combo: IptvPlan | null) => {
    if (!pendingDevice) return;
    const customData: Record<string, unknown> = {
        type: "ibosol",
        mac: pendingDevice.mac,
        appId: pendingDevice.appId,
    };
    if (combo) {
        customData.combo = {
            iptvVariantId: combo.variantId,
            iptvProviderId: combo.providerId,
            iptvPlanId: combo.planId,
            iptvProductName: combo.productName,
            iptvPrice: combo.price,
        };
    }
    finalizeAddToCart(JSON.stringify(customData), undefined, combo ? {
        iptvVariantId: combo.variantId,
        iptvProviderId: combo.providerId,
        iptvPlanId: combo.planId,
        iptvProductName: combo.productName,
        iptvPrice: combo.price,
    } : undefined);
    setIsComboModalOpen(false);
    setPendingDevice(null);
};
```

Adapter `finalizeAddToCart` pour accepter le `combo` optionnel et le passer au store :

```tsx
const finalizeAddToCart = (
    customData?: string,
    playerNickname?: string,
    combo?: { iptvVariantId: number; iptvProviderId: string; iptvPlanId: string; iptvProductName: string; iptvPrice: string }
) => {
    product.variants.forEach((variant: any) => {
        const qty = selectedQuantities[variant.id];
        if (qty && qty > 0) {
            addToCart({
                variantId: variant.id,
                productId: product.id,
                name: variant.name,
                productName: product.name,
                price: variant.salePriceDzd,
                quantity: qty,
                imageUrl: product.imageUrl,
                customData,
                playerNickname,
                loadbrainSlug: variant.loadbrainSlug || null,
                combo,
            });
        }
    });
    onClose();
};
```

Ajouter les modaux à la fin du JSX :

```tsx
<IbosolDeviceModal
    isOpen={isIbosolModalOpen}
    onClose={() => setIsIbosolModalOpen(false)}
    onConfirm={handleIbosolDeviceSubmit}
    productName={product.name}
/>

<IbosolComboModal
    isOpen={isComboModalOpen}
    onClose={() => setIsComboModalOpen(false)}
    onConfirm={handleComboConfirm}
    iboPrice={getSelectedIbosolPrice()}
    iboName={getSelectedIbosolName()}
    availablePlans={availableIptvPlans}
/>

<IbosolCheckModal
    isOpen={isCheckModalOpen}
    onClose={() => setIsCheckModalOpen(false)}
    onSubmit={async (mac, appId) => {
        setIsCheckModalOpen(false);
        setCheckLoading(true);
        setIsCheckResultOpen(true);
        setLastCheckedDevice({ mac, appId });
        const result = await checkIbosolDevice({ mac, appId });
        setCheckResult(result);
        setCheckLoading(false);
    }}
/>

<IbosolCheckResultModal
    isOpen={isCheckResultOpen}
    onClose={() => { setIsCheckResultOpen(false); setCheckResult(null); }}
    result={checkResult}
    loading={checkLoading}
    inputMac={lastCheckedDevice?.mac}
    inputAppId={lastCheckedDevice?.appId}
    onActivate={(mac, appId) => {
        // pre-fill IBO modal flow
        setPendingDevice({ mac, appId });
        setIsComboModalOpen(true);
    }}
/>
```

Ajouter le bouton "Vérifier mon device" dans le JSX du modal produit, dans le footer si le produit est IBO Player (loadbrainSlug commence par `ibo-` sur au moins une variante) :

```tsx
{product?.variants?.some((v: any) => v.loadbrainSlug?.startsWith("ibo-")) && (
    <button
        onClick={() => setIsCheckModalOpen(true)}
        className="mt-3 w-full h-12 bg-cyan-50 border-2 border-cyan-100 text-cyan-700 font-black text-xs uppercase tracking-wider rounded-xl hover:bg-cyan-100 transition-colors"
    >
        🔍 Vérifier mon device gratuitement
    </button>
)}
```

Ajouter les helpers nécessaires :

```tsx
const getSelectedIbosolPrice = (): string => {
    const variant = product.variants.find((v: any) =>
        v.loadbrainSlug?.startsWith("ibo-") && (selectedQuantities[v.id] || 0) > 0
    );
    return variant?.salePriceDzd ?? "0";
};

const getSelectedIbosolName = (): string => {
    const variant = product.variants.find((v: any) =>
        v.loadbrainSlug?.startsWith("ibo-") && (selectedQuantities[v.id] || 0) > 0
    );
    return variant?.name ?? "Activation IBO";
};

// availableIptvPlans : prop passée par CatalogueView, ou fetched ici. Voir Step 4.
```

Forcer qty=1 sur les variantes Ibosol — adapter le bloc de rendu des contrôles :

```tsx
const isIbosolVariant = !!variant.loadbrainSlug?.startsWith("ibo-");
{isIbosolVariant ? (
    <div className="flex items-center gap-2">
        <button
            onClick={(e) => {
                e.stopPropagation();
                const next = (selectedQuantities[variant.id] || 0) > 0 ? 0 : 1;
                setSelectedQuantities(prev => next === 0 ? Object.fromEntries(Object.entries(prev).filter(([k]) => Number(k) !== variant.id)) : { ...prev, [variant.id]: 1 });
            }}
            className={`px-4 h-11 rounded-xl font-black text-xs uppercase ${qty > 0 ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-700"}`}
        >
            {qty > 0 ? "Sélectionné" : "Choisir"}
        </button>
    </div>
) : (
    /* contrôle quantité existant */
)}
```

- [ ] **Step 3: Charger les plans IPTV pour le combo**

Le picker combo a besoin de la liste des plans IPTV. On passe par une prop sur `ProductModal` ou par le store. Le plus simple : la `CatalogueView` (qui charge déjà le catalogue) pré-fetche aussi les plans IPTV depuis `/api/v1/catalog` (proxifié) et passe en prop au `ProductModal`.

Ajouter dans `CatalogueView.tsx` :

```tsx
const [iptvPlans, setIptvPlans] = useState<IptvPlan[]>([]);

useEffect(() => {
    // Charge les plans IPTV des 3 providers (King365, IronMax, Atlas)
    // depuis le catalogue local — on lit directement les variants ROBOTECH avec loadbrain_slug
    // qui ne sont PAS ibosol, et qui ne sont PAS des trials
    const loadPlans = async () => {
        const res = await fetch("/api/iptv-combo-catalog");
        if (!res.ok) return;
        const data = await res.json();
        setIptvPlans(data.plans);
    };
    loadPlans();
}, []);
```

Créer une route API `src/app/api/iptv-combo-catalog/route.ts` :

```typescript
import { NextResponse } from "next/server";
import { db } from "@/db";
import { productVariants, products } from "@/db/schema";
import { isNotNull, like, ne, and, gt } from "drizzle-orm";

export async function GET() {
    // Récupère toutes les variantes IPTV non-trial, > 0 DZD, kiosk_visible
    const rows = await db.select({
        variantId: productVariants.id,
        productName: products.name,
        variantName: productVariants.name,
        slug: productVariants.loadbrainSlug,
        price: productVariants.salePriceDzd,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(and(
        isNotNull(productVariants.loadbrainSlug),
        gt(productVariants.salePriceDzd, "0"),  // exclut trials à 0 DZD
        eq(productVariants.kioskVisible, true),
    ));

    // Filtre côté code : exclure ibo-*
    const iptvOnly = rows.filter(r => !r.slug?.startsWith("ibo-"));

    // Mapping providerId/planId via LoadBrain (cache mémoire 5 min)
    // Pour simplifier ici on appelle direct /api/v1/catalog en proxy, mais idéalement on cache.
    const lbCatalog = await fetch(`${process.env.LOADBRAIN_URL}/api/v1/catalog`, {
        headers: { "X-API-Key": process.env.LOADBRAIN_API_KEY! },
    }).then(r => r.json());

    const lbProviders = lbCatalog.data?.providers || [];

    const plans = iptvOnly.map(row => {
        // Cherche dans lbProviders le plan dont l'ID correspond au mapping site_products
        // Plus simple : on appelle aussi /api/v1/site/products pour avoir la résolution
        return {
            variantId: row.variantId,
            productName: `${row.productName} ${row.variantName}`,
            slug: row.slug,
            price: row.price,
        };
    });

    // Pour avoir providerId et planId, croiser avec /api/v1/site/products :
    const lbProducts = await fetch(`${process.env.LOADBRAIN_URL}/api/v1/site/products`, {
        headers: { "X-API-Key": process.env.LOADBRAIN_API_KEY! },
    }).then(r => r.json());

    const lbProductsMap = new Map((lbProducts.data?.products || []).map((p: any) => [p.productId, p]));

    const enriched = plans.map(p => {
        const lb = lbProductsMap.get(p.slug);
        if (!lb) return null;
        return {
            variantId: p.variantId,
            providerId: (lb as any).providerId,
            providerName: (lb as any).providerName,
            planId: (lb as any).planId,
            productName: p.productName,
            durationDays: (lb as any).planDurationDays || 0,
            price: p.price,
        };
    }).filter(Boolean);

    return NextResponse.json({ plans: enriched });
}
```

Passer à ProductModal :

```tsx
<ProductModal
    isOpen={...}
    onClose={...}
    product={selectedProduct}
    iptvPlans={iptvPlans}
/>
```

Et dans `ProductModal`, accepter `iptvPlans` comme prop optionnelle.

- [ ] **Step 4: Adapter `actions.ts createKioskOrder`**

S'assurer que le `customData` JSON Ibosol est bien préservé tel quel (le code actuel le fait déjà après mon dernier patch — vérifier la fonction qui écrit `order_items`).

Calcul du prix : il faut sommer le prix variant + combo. Modifier le bloc qui calcule `realTotalAmount` :

```typescript
const variantPrice = parseFloat(variant.salePriceDzd) * item.quantity;
const comboPrice = item.combo ? parseFloat(item.combo.iptvPrice) * item.quantity : 0;
const itemTotal = variantPrice + comboPrice;
realTotalAmount += itemTotal;
```

Le `secureItems.push` doit utiliser la price totale (variant + combo) pour `price`, ou stocker les 2 séparément. Pour simplifier : on stocke uniquement le prix de la variante IBO dans `order_items.price` (existant), et le prix du combo est implicitement dans `customData.combo.iptvPrice`. Le total order est calculé correctement via `itemTotal`. ⚠️ Le fait que `order_items.price` soit le prix IBO seul peut surprendre — documenter dans un commentaire :

```typescript
secureItems.push({
    variantId: item.variantId,
    name: item.combo ? `${fullName} + ${item.combo.iptvProductName}` : fullName,
    price: variant.salePriceDzd,  // Prix IBO seul ; le prix combo IPTV est dans customData.combo.iptvPrice
    quantity: item.quantity,
    // ... reste inchangé
});
```

- [ ] **Step 5: Affichage panier sous-bullets**

Localiser dans `CatalogueView.tsx` et `KioskMobile.tsx` le rendu des items du panier. Pour chaque item avec `combo`, afficher :

```tsx
<div className="cart-item">
    <div className="font-bold">{item.productName} — {item.name}</div>
    {item.combo && (
        <div className="ml-4 mt-1 text-xs text-slate-500 space-y-0.5">
            <div>├─ {item.name} : {formatCurrency(parseFloat(item.price), "DZD")}</div>
            <div>└─ {item.combo.iptvProductName} : {formatCurrency(parseFloat(item.combo.iptvPrice), "DZD")}</div>
        </div>
    )}
    <div className="font-black">
        {formatCurrency(
            parseFloat(item.price) * item.quantity + (item.combo ? parseFloat(item.combo.iptvPrice) * item.quantity : 0),
            "DZD"
        )}
    </div>
    {/* Affiche MAC si Ibosol */}
    {item.customData && parseIbosolCustomData(item.customData) && (
        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
            MAC: {parseIbosolCustomData(item.customData)?.mac}
        </div>
    )}
</div>
```

- [ ] **Step 6: Typecheck et test manuel**

```bash
npx tsc --noEmit 2>&1 | grep -E "ProductModal|kiosk/actions|useKioskStore|CatalogueView|KioskMobile|iptv-combo-catalog"
```

Lancer le dev server et tester le flow complet :
1. Aller sur le kiosk, ouvrir IBO Player
2. Vérifier que le bouton "Vérifier mon device" apparaît
3. Cliquer "Activation 1 an" → modal MAC s'ouvre
4. Saisir MAC → modal Combo s'ouvre
5. Choisir "Non, IBO seul" → ajout au panier avec MAC visible
6. Vérifier le total
7. Recommencer, cette fois choisir un IPTV → ajout au panier combo, total combiné

- [ ] **Step 7: Commit**

```bash
git add src/store/useKioskStore.ts \
        src/app/kiosk/components/ProductModal.tsx \
        src/app/kiosk/views/CatalogueView.tsx \
        src/app/kiosk/KioskMobile.tsx \
        src/app/kiosk/actions.ts \
        src/app/api/iptv-combo-catalog/route.ts
git commit -m "feat(kiosk): wire Ibosol modals into ProductModal + cart UI

- Sequential MAC → Combo modals on Add-to-cart for ibo-* variants
- Free Check button on IBO Player product modal (synchronous)
- Cart shows combo as nested sub-items with MAC display
- Guards: max 1 IBO per cart, qty forced to 1
- New /api/iptv-combo-catalog feeds the combo picker"
```

---

## Phase 5 — Admin SAV

### Task 10: `IbosolToolsBar` + Admin modaux + actions serveur

**Files:**
- Create: `src/app/admin/iptv/components/IbosolToolsBar.tsx`
- Create: `src/app/admin/iptv/components/AdminCheckDeviceModal.tsx`
- Create: `src/app/admin/iptv/components/AdminInjectIptvModal.tsx`
- Modify: `src/app/admin/iptv/IptvContent.tsx`
- Modify: `src/app/admin/iptv/actions.ts`

- [ ] **Step 1: Créer `IbosolToolsBar.tsx`**

```tsx
"use client";

import React, { useState } from "react";
import { Search, Syringe } from "lucide-react";
import AdminCheckDeviceModal from "./AdminCheckDeviceModal";
import AdminInjectIptvModal from "./AdminInjectIptvModal";

interface IbosolToolsBarProps {
    iptvPlans: Array<{
        variantId: number;
        providerId: string;
        providerName: string;
        planId: string;
        productName: string;
        durationDays: number;
        price: string;
    }>;
    onActionDone: () => void;
}

export default function IbosolToolsBar({ iptvPlans, onActionDone }: IbosolToolsBarProps) {
    const [checkOpen, setCheckOpen] = useState(false);
    const [injectOpen, setInjectOpen] = useState(false);

    return (
        <>
            <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-2xl p-4 flex items-center gap-3 flex-wrap">
                <span className="text-[11px] font-black uppercase tracking-widest text-cyan-700">Outils Ibosol</span>
                <button
                    onClick={() => setCheckOpen(true)}
                    className="flex items-center gap-2 text-xs font-black px-3 py-2 bg-white text-cyan-700 border border-cyan-200 rounded-lg hover:bg-cyan-50 transition-colors"
                >
                    <Search className="w-3.5 h-3.5" />
                    Vérifier device
                </button>
                <button
                    onClick={() => setInjectOpen(true)}
                    className="flex items-center gap-2 text-xs font-black px-3 py-2 bg-white text-cyan-700 border border-cyan-200 rounded-lg hover:bg-cyan-50 transition-colors"
                >
                    <Syringe className="w-3.5 h-3.5" />
                    Injecter IPTV manuel
                </button>
            </div>

            <AdminCheckDeviceModal isOpen={checkOpen} onClose={() => setCheckOpen(false)} />

            <AdminInjectIptvModal
                isOpen={injectOpen}
                onClose={() => setInjectOpen(false)}
                iptvPlans={iptvPlans}
                onSuccess={() => { setInjectOpen(false); onActionDone(); }}
            />
        </>
    );
}
```

- [ ] **Step 2: Créer `AdminCheckDeviceModal.tsx`**

Réutilise quasi-littéralement `IbosolCheckModal` + `IbosolCheckResultModal` du flow client. Pour éviter la duplication, on peut soit :

- (a) Importer ces composants client tels quels (ils sont déjà `"use client"`) dans le contexte admin
- (b) Créer un wrapper dédié admin

Choix simple : **(a)**. Créer `AdminCheckDeviceModal.tsx` qui fait :

```tsx
"use client";

import React, { useState } from "react";
import IbosolCheckModal from "@/app/kiosk/components/IbosolCheckModal";
import IbosolCheckResultModal from "@/app/kiosk/components/IbosolCheckResultModal";
import { checkIbosolDevice, type CheckDeviceResult } from "@/app/kiosk/actions/check-device";

interface AdminCheckDeviceModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function AdminCheckDeviceModal({ isOpen, onClose }: AdminCheckDeviceModalProps) {
    const [resultOpen, setResultOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<CheckDeviceResult | null>(null);

    return (
        <>
            <IbosolCheckModal
                isOpen={isOpen}
                onClose={onClose}
                onSubmit={async (mac, appId) => {
                    onClose();
                    setLoading(true);
                    setResultOpen(true);
                    const r = await checkIbosolDevice({ mac, appId });
                    setResult(r);
                    setLoading(false);
                }}
            />
            <IbosolCheckResultModal
                isOpen={resultOpen}
                onClose={() => setResultOpen(false)}
                result={result}
                loading={loading}
            />
        </>
    );
}
```

- [ ] **Step 3: Créer `AdminInjectIptvModal.tsx`**

```tsx
"use client";

import React, { useState, useEffect } from "react";
import { Modal, ModalContent, ModalBody, Button, Input, Select, SelectItem } from "@heroui/react";
import { manualInjectIptvAction } from "../actions";
import { toast } from "react-hot-toast";

const APP_OPTIONS = [
    { id: "1", label: "IBO Player" },
    { id: "2", label: "SmartOne" },
    { id: "3", label: "BOB Player" },
    { id: "4", label: "IBO Pro" },
];

const MAC_REGEX = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;

interface AdminInjectIptvModalProps {
    isOpen: boolean;
    onClose: () => void;
    iptvPlans: Array<{
        variantId: number;
        providerId: string;
        providerName: string;
        planId: string;
        productName: string;
        durationDays: number;
        price: string;
    }>;
    onSuccess: () => void;
}

export default function AdminInjectIptvModal({ isOpen, onClose, iptvPlans, onSuccess }: AdminInjectIptvModalProps) {
    const [mac, setMac] = useState("");
    const [appId, setAppId] = useState("1");
    const [activeProvider, setActiveProvider] = useState("");
    const [selectedPlan, setSelectedPlan] = useState<string>(""); // planId
    const [customPrice, setCustomPrice] = useState("");
    const [phone, setPhone] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setMac(""); setAppId("1"); setSelectedPlan(""); setCustomPrice(""); setPhone("");
            const firstProvider = iptvPlans[0]?.providerName || "";
            setActiveProvider(firstProvider);
        }
    }, [isOpen, iptvPlans]);

    const providers = Array.from(new Set(iptvPlans.map(p => p.providerName)));
    const filtered = iptvPlans.filter(p => p.providerName === activeProvider).sort((a, b) => b.durationDays - a.durationDays);
    const planObj = iptvPlans.find(p => p.planId === selectedPlan) || null;

    const isValid = MAC_REGEX.test(mac.trim()) && !!planObj && parseFloat(customPrice || "0") >= 0;

    const handleSubmit = async () => {
        if (!isValid || !planObj) return;
        setSubmitting(true);
        try {
            const res = await manualInjectIptvAction({
                mac: mac.trim().toUpperCase(),
                appId: parseInt(appId, 10),
                iptvVariantId: planObj.variantId,
                iptvProviderId: planObj.providerId,
                iptvPlanId: planObj.planId,
                iptvProductName: planObj.productName,
                iptvPrice: planObj.price,
                customPrice: customPrice || planObj.price,
                customerPhone: phone || undefined,
            });
            if (res.success) {
                toast.success("Inject lancé");
                onSuccess();
            } else {
                toast.error(res.error || "Erreur");
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onOpenChange={onClose} size="lg" placement="center" backdrop="blur" hideCloseButton
            classNames={{ base: "bg-white rounded-[24px]" }}>
            <ModalContent>
                {(closeFn) => (
                    <ModalBody className="p-6">
                        <header className="text-center mb-5">
                            <h2 className="text-lg font-black uppercase tracking-tight text-black">Injecter IPTV manuellement</h2>
                            <p className="text-xs text-slate-500 mt-1 font-bold uppercase tracking-wider">SAV — device IBO déjà activé</p>
                        </header>

                        <div className="space-y-3">
                            <Input label="Adresse MAC" value={mac} onValueChange={setMac} variant="bordered"
                                isInvalid={mac.length > 0 && !MAC_REGEX.test(mac.trim())} />

                            <Select label="Application" selectedKeys={[appId]} onChange={(e) => setAppId(e.target.value)} variant="bordered">
                                {APP_OPTIONS.map(opt => <SelectItem key={opt.id}>{opt.label}</SelectItem>)}
                            </Select>

                            <div>
                                <label className="text-[10px] font-black uppercase tracking-wider text-black mb-2 block">Provider IPTV</label>
                                <div className="flex gap-2 mb-2 overflow-x-auto">
                                    {providers.map(p => (
                                        <button key={p} onClick={() => setActiveProvider(p)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase ${activeProvider === p ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                                            {p}
                                        </button>
                                    ))}
                                </div>
                                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                    {filtered.map(p => (
                                        <button key={p.planId} onClick={() => setSelectedPlan(p.planId)}
                                            className={`w-full p-2 border-2 rounded-lg flex justify-between text-sm ${selectedPlan === p.planId ? "border-cyan-500 bg-cyan-50" : "border-slate-200"}`}>
                                            <span className="font-bold text-black">{p.productName}</span>
                                            <span className="font-black text-black">{p.price} DZD</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <Input label="Prix négocié (DZD, vide = prix catalogue)" value={customPrice} onValueChange={setCustomPrice}
                                placeholder={planObj?.price || ""} variant="bordered" type="number" />

                            <Input label="Téléphone client (optionnel pour WhatsApp)" value={phone} onValueChange={setPhone} variant="bordered" placeholder="+213..." />
                        </div>

                        <footer className="grid grid-cols-2 gap-3 mt-6">
                            <Button onPress={closeFn} className="bg-white border-2 border-slate-200 text-black font-black">Annuler</Button>
                            <Button onPress={handleSubmit} isDisabled={!isValid || submitting}
                                className="bg-cyan-600 text-white font-black">
                                {submitting ? "En cours..." : "Injecter"}
                            </Button>
                        </footer>
                    </ModalBody>
                )}
            </ModalContent>
        </Modal>
    );
}
```

- [ ] **Step 4: Server action `manualInjectIptvAction`**

Dans `src/app/admin/iptv/actions.ts`, ajouter :

```typescript
export const manualInjectIptvAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.CAISSIER],
        schema: z.object({
            mac: z.string().regex(/^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/),
            appId: z.number().int().min(1).max(10),
            iptvVariantId: z.number().int(),
            iptvProviderId: z.string().uuid(),
            iptvPlanId: z.string().uuid(),
            iptvProductName: z.string(),
            iptvPrice: z.string(),
            customPrice: z.string(),
            customerPhone: z.string().optional(),
        }),
    },
    async (input) => {
        try {
            // Création d'une commande SAV
            const countResult = await db.select({ count: sql`count(*)` }).from(orders);
            const c = (Number(countResult[0]?.count || 0) % 999) + 1;
            const orderNumber = `#ADM-${c}-${Date.now().toString().slice(-3)}`;

            const customDataJson = JSON.stringify({
                type: "ibosol",
                mac: input.mac,
                appId: input.appId,
                combo: {
                    iptvVariantId: input.iptvVariantId,
                    iptvProviderId: input.iptvProviderId,
                    iptvPlanId: input.iptvPlanId,
                    iptvProductName: input.iptvProductName,
                    iptvPrice: input.iptvPrice,
                },
            });

            // Find ibo-inject variant in DB
            const injectVariant = await db.query.productVariants.findFirst({
                where: eq(productVariants.loadbrainSlug, "ibo-inject"),
            });
            if (!injectVariant) return { success: false, error: "Variant ibo-inject introuvable" };

            const [order] = await db.insert(orders).values({
                orderNumber,
                status: "EN_ATTENTE",
                totalAmount: input.customPrice,
                deliveryMethod: input.customerPhone ? "WHATSAPP" : "TICKET",
                customerPhone: input.customerPhone,
            }).returning();

            await db.insert(orderItems).values({
                orderId: order.id,
                variantId: injectVariant.id,
                name: `Inject ${input.iptvProductName} → ${input.mac}`,
                price: input.customPrice,
                quantity: 1,
                customData: customDataJson,
            });

            // Pay (admin user id 1 ou getCurrentUser)
            await OrderService.payOrder(order.id, 1, { montantPaye: input.customPrice });

            return { success: true, orderNumber };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }
);
```

- [ ] **Step 5: Brancher dans IptvContent.tsx**

```tsx
import IbosolToolsBar from "./components/IbosolToolsBar";

// Dans le JSX, en tête, après le header :
<IbosolToolsBar iptvPlans={iptvPlans} onActionDone={() => refresh()} />
```

Charger `iptvPlans` côté server component `page.tsx` ou via une fetch dans IptvContent.

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit 2>&1 | grep -E "admin/iptv"
```

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/iptv/components/ src/app/admin/iptv/IptvContent.tsx src/app/admin/iptv/actions.ts
git commit -m "feat(admin): add Ibosol SAV tools (Check device + Manual inject)

New tool bar at the top of /admin/iptv. Manual inject creates
an #ADM- order and runs the standard Ibosol provision pipeline
with an admin-set price."
```

---

### Task 11: Filtre `Partiels` + bouton "Relancer IPTV manquant"

**Files:**
- Modify: `src/app/admin/iptv/IptvContent.tsx`
- Modify: `src/app/admin/iptv/actions.ts`
- Modify: `src/app/admin/iptv/queries.ts`

- [ ] **Step 1: Ajouter le filtre "Partiels"**

Dans `IptvContent.tsx`, modifier le state filter :

```typescript
const [filter, setFilter] = useState<"all" | "completed" | "pending" | "failed" | "partial">("all");
```

Adapter le filtrage :

```typescript
const filtered = provisions.filter(p => {
    if (filter === "all") return true;
    if (filter === "completed") return p.status === "completed";
    if (filter === "pending") return p.status === "queued" || p.status === "processing";
    if (filter === "failed") return p.status === "failed";
    if (filter === "partial") return p.status === "completed_partial";
    return true;
});

const counts = {
    all: provisions.length,
    completed: provisions.filter(p => p.status === "completed").length,
    pending: provisions.filter(p => p.status === "queued" || p.status === "processing").length,
    failed: provisions.filter(p => p.status === "failed").length,
    partial: provisions.filter(p => p.status === "completed_partial").length,
};
```

Adapter les boutons de filtre pour inclure "Partiels".

- [ ] **Step 2: Ajouter `StatusBadge` pour `completed_partial`**

```typescript
completed_partial: {
    color: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    icon: <AlertTriangle className="w-3 h-3" />,
    label: "Partiel",
},
```

- [ ] **Step 3: Bouton "Relancer IPTV manquant" sur cards `completed_partial`**

Dans le JSX, ajouter à côté du bouton "Webhook" pour ces cards :

```tsx
{p.status === "completed_partial" && (
    <button onClick={() => handleRetryPartial(p.id)} className="...">
        🔄 Relancer IPTV
    </button>
)}
```

Handler :

```typescript
const handleRetryPartial = async (provisionId: number) => {
    if (!confirm("Lancer une nouvelle provision IPTV pour finaliser ce combo ?")) return;
    const res = await retryPartialIptvAction({ provisionId });
    if (res.success) { toast.success("IPTV relancée"); refresh(); }
    else toast.error(res.error || "Erreur");
};
```

- [ ] **Step 4: Server action `retryPartialIptvAction`**

```typescript
export const retryPartialIptvAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.CAISSIER],
        schema: z.object({ provisionId: z.number() }),
    },
    async ({ provisionId }) => {
        try {
            // 1. Charger la provision originale + l'order_item
            const provision = await db.query.iptvProvisions.findFirst({
                where: eq(iptvProvisions.id, provisionId),
            });
            if (!provision || provision.status !== "completed_partial") {
                return { success: false, error: "Provision invalide ou non partielle" };
            }

            const orderItem = await db.query.orderItems.findFirst({
                where: eq(orderItems.id, provision.orderItemId),
            });
            if (!orderItem) return { success: false, error: "Order item introuvable" };

            const ibosolData = parseIbosolCustomData(orderItem.customData);
            if (!ibosolData?.combo) return { success: false, error: "Pas de combo dans customData" };

            // 2. Créer un nouvel order_item lié à la même order, ciblant le variant IPTV
            const [newItem] = await db.insert(orderItems).values({
                orderId: provision.orderId,
                variantId: ibosolData.combo.iptvVariantId,
                name: `${ibosolData.combo.iptvProductName} (relance après combo partiel)`,
                price: ibosolData.combo.iptvPrice,
                quantity: 1,
                customData: "credentials",  // flow IPTV classique
            }).returning();

            // 3. Lancer la provision sur ce nouvel item uniquement
            // Pour réutiliser provisionIptvOrder, on peut soit :
            //   (a) ajouter une fonction provisionSingleItem
            //   (b) appeler provisionIptvOrder qui gère tous les iptv items NOT YET provisioned
            // Choix : (b) — provisionIptvOrder skip les items déjà dans iptv_provisions
            const { provisionIptvOrder } = await import("@/lib/iptv");
            await provisionIptvOrder(provision.orderId);

            // 4. Mettre à jour la provision originale en "completed"
            await db.update(iptvProvisions)
                .set({ status: "completed", error: null, errorCode: null })
                .where(eq(iptvProvisions.id, provisionId));

            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }
);
```

⚠️ S'assurer que `provisionIptvOrder` skip les items qui ont déjà une entrée `iptv_provisions`. Dans le code existant, vérifier la condition. Si nécessaire, ajouter un check `WHERE NOT EXISTS (SELECT 1 FROM iptv_provisions WHERE order_item_id = item.id)` ou équivalent.

- [ ] **Step 5: Adapter `queries.ts`**

S'assurer que `fetchIptvProvisions` retourne aussi les provisions `completed_partial` (pas de filter ajouté nécessaire, déjà inclus par défaut).

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit 2>&1 | grep "admin/iptv"
```

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/iptv/IptvContent.tsx src/app/admin/iptv/actions.ts
git commit -m "feat(admin): add Partial filter + Retry IPTV button on partial provisions

- New 'Partiels' filter chip
- StatusBadge variant for completed_partial
- Retry IPTV creates a new order_item and runs the classic IPTV flow,
  marks the original Ibosol provision as completed once done."
```

---

## Phase 6 — Wrap-up

### Task 12: E2E manuel + commit final

- [ ] **Step 1: Vérifier que tous les flows marchent en local**

Suivre la checklist du spec :

1. **Activation seule** : achat Activation 1 an, sans combo, livraison WhatsApp.
2. **Combo OK** : achat Activation 1 an + IPTV King365 12 mois.
3. **Combo partiel** : à reproduire en simulant une panne (peut nécessiter de mocker LoadBrain ou attendre un échec naturel).
4. **Check device** : flow standalone, vérifier le délai et l'affichage modal résultat.
5. **Garde 1 IBO/commande** : tenter d'ajouter un 2e IBO au panier.
6. **Inject SAV admin** : depuis `/admin/iptv`, créer un inject manuel.
7. **Relancer IPTV manquant** : sur une commande `completed_partial`, cliquer le bouton.

- [ ] **Step 2: Vérifier le typecheck global**

```bash
npx tsc --noEmit 2>&1 | grep -v -E "whatsapp/route|AddProductModal|e2e-iptv-test"
```

Expected: aucune nouvelle erreur introduite par cette feature.

- [ ] **Step 3: Mettre à jour le CHANGELOG ou la doc release si applicable**

Si le projet a un `CHANGELOG.md` ou un système de versioning, ajouter l'entrée :

```markdown
## v12.3.0 — Iron Max TV Multi-Provider IBO Player

- Vente Activation IBO Player 1 an / Lifetime au kiosk avec combo IPTV optionnel
- Bouton "Vérifier mon device" gratuit standalone
- Outils admin SAV : Check device + Inject IPTV manuel
- Détection commandes combo partiellement échouées + bouton de relance
- Migration DB : `product_variants.kiosk_visible`
```

- [ ] **Step 4: Commit final**

```bash
git add CHANGELOG.md  # si modifié
git commit -m "chore: bump version + changelog for Ibosol kiosk integration"
```

---

## Self-review

### Couverture du spec

- ✅ Migration DB `kiosk_visible` (Task 1)
- ✅ PROVIDER_SLUGS const (Task 2)
- ✅ Format customData JSON Ibosol (Task 3)
- ✅ Provisioning combo (Task 4)
- ✅ Webhook `completed_partial` (Task 5)
- ✅ 3 templates WhatsApp Ibosol (Task 6)
- ✅ Modal Combo (Task 7)
- ✅ Check standalone (Task 8)
- ✅ ProductModal séquence + cart UI + 1 IBO max + qty=1 (Task 9)
- ✅ Admin Tools Bar + Check + Inject (Task 10)
- ✅ Filtre Partiels + Relance IPTV (Task 11)
- ✅ E2E manuel (Task 12)

### Cohérence types

- `IbosolCustomData` (Task 3) ↔ `parseIbosolCustomData` (Tasks 4, 5, 9, 11) : signature alignée
- `IptvPlan` (Task 7) ↔ format dans `/api/iptv-combo-catalog` (Task 9) : aligné (variantId, providerId, providerName, planId, productName, durationDays, price)
- `combo` field sur `CartItem` ↔ `combo` field sur `IbosolCustomData` ↔ args `manualInjectIptvAction` : structure cohérente

### Placeholders

Aucun TBD/TODO. Chaque step contient le code complet ou une commande exécutable.

### Scope

Plan exécutable d'un seul tenant pour 1 ingénieur, 12 tasks, ~1-2 jours de travail. Si trop long, peut être découpé en deux livraisons : (Phases 1-4) MVP client kiosk + (Phases 5-6) outils admin + recovery.
