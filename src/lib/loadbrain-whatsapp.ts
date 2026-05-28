import "server-only";

/**
 * Thin client to LoadBrain's centralized WhatsApp module (`lb-whatsapp`).
 *
 * Why this exists: B2B/reseller WhatsApp notifications are being centralized
 * through LoadBrain (single template store + WAHA delivery + audit) instead of
 * the boutique's local `lib/whatsapp.ts` → WAHA path. Templates live in
 * LoadBrain (`whatsapp.templates`, keyed by siteId+key+locale); we send by
 * `templateKey` + `vars` and LoadBrain renders + delivers.
 *
 * AUTH (important): the whatsapp module does not wire an API-key validator, so
 * `X-API-Key` resolves to siteId="unknown" and `/send` would 403 on the
 * tenant-scope check. The working first-party path is `X-Internal-Token` +
 * `X-Site-Id`. This means the boutique holds LoadBrain's INTERNAL_TOKEN, which
 * bypasses module auth — acceptable here because the boutique is first-party,
 * but the cleaner long-term fix is to expose whatsapp on the authenticated v2
 * surface (or wire an api-key validator into the module).
 *
 * Failures never throw: callers (reseller-notifications) fall back to the local
 * WAHA path so a LoadBrain outage never drops a business notification.
 */

export interface LoadBrainWhatsappConfig {
  baseUrl: string;
  internalToken: string;
  siteId: string;
}

export interface SendViaLoadBrainInput {
  recipientPhone: string;
  /** Stable template key in LoadBrain (e.g. "wallet.recharged"). */
  templateKey: string;
  locale?: string;
  vars?: Record<string, string | number | null | undefined>;
  /** Optional dedup key — repeat sends with the same key are no-ops. */
  idempotencyKey?: string;
}

export interface LoadBrainSendResult {
  ok: boolean;
  status?: number;
  externalId?: string;
  error?: string;
}

const SEND_TIMEOUT_MS = 8_000;

/**
 * Resolve config from env. Returns null when not configured so the caller can
 * cleanly fall back to the local WAHA path.
 *   LOADBRAIN_URL             gateway base (e.g. https://api.loadbrain.shop)
 *   LOADBRAIN_INTERNAL_TOKEN  shared internal token (X-Internal-Token)
 *   LOADBRAIN_SITE_ID         this boutique's site id bound in LoadBrain
 */
export function loadLoadBrainWhatsappConfig(): LoadBrainWhatsappConfig | null {
  const baseUrl = process.env.LOADBRAIN_URL;
  const internalToken = process.env.LOADBRAIN_INTERNAL_TOKEN;
  const siteId = process.env.LOADBRAIN_SITE_ID;
  if (!baseUrl || !internalToken || !siteId) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), internalToken, siteId };
}

export async function sendViaLoadBrain(
  input: SendViaLoadBrainInput,
  config: LoadBrainWhatsappConfig | null = loadLoadBrainWhatsappConfig(),
  fetchFn: typeof fetch = fetch
): Promise<LoadBrainSendResult> {
  if (!config) {
    return { ok: false, error: "LoadBrain WhatsApp not configured (LOADBRAIN_URL/INTERNAL_TOKEN/SITE_ID)" };
  }

  const url = `${config.baseUrl}/api/v1/whatsapp/send`;
  const cleanVars: Record<string, string | number | null> = {};
  for (const [k, v] of Object.entries(input.vars ?? {})) {
    cleanVars[k] = v === undefined ? null : v;
  }

  try {
    const res = await fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": config.internalToken,
        "X-Site-Id": config.siteId,
      },
      body: JSON.stringify({
        siteId: config.siteId,
        recipientPhone: input.recipientPhone,
        templateKey: input.templateKey,
        locale: input.locale ?? "fr",
        vars: cleanVars,
        idempotencyKey: input.idempotencyKey,
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    const json = (await res.json().catch(() => ({}))) as {
      data?: { message?: { externalId?: string | null } };
      error?: string;
    };

    // 202 = queued, 200 = idempotent replay. Both are success.
    if (res.ok) {
      return { ok: true, status: res.status, externalId: json.data?.message?.externalId ?? undefined };
    }
    return { ok: false, status: res.status, error: json.error ?? `LoadBrain HTTP ${res.status}` };
  } catch (err) {
    const e = err as Error;
    if (e.name === "TimeoutError" || e.name === "AbortError") {
      return { ok: false, error: "LoadBrain WhatsApp timeout (8s)" };
    }
    return { ok: false, error: `LoadBrain WhatsApp network error: ${e.message}` };
  }
}
