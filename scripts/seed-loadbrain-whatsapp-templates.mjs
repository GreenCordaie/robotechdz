#!/usr/bin/env node
/**
 * Seed the B2B/reseller WhatsApp templates into LoadBrain's centralized
 * whatsapp module (`whatsapp.templates`, keyed by siteId+key+locale) and
 * approve them. Idempotent: re-running skips templates that already exist and
 * (re)sets their status to "approved".
 *
 * Why: Option B centralizes B2B notifications through LoadBrain — the boutique
 * sends by `templateKey` + `vars` and LoadBrain renders. These templates are
 * the source of truth there; the boutique keeps fr copies only as a local
 * WAHA fallback.
 *
 * Auth: X-Internal-Token + X-Site-Id (first-party path — the whatsapp module
 * has no api-key validator). Run from the boutique host or anywhere that can
 * reach the LoadBrain gateway.
 *
 * Usage:
 *   LOADBRAIN_URL=https://api.loadbrain.shop \
 *   LOADBRAIN_INTERNAL_TOKEN=... \
 *   LOADBRAIN_SITE_ID=<boutique site id in LoadBrain> \
 *   node scripts/seed-loadbrain-whatsapp-templates.mjs
 *
 * NOTE: ar/en bodies are first-draft translations — review before production.
 * Vars computed boutique-side and passed through (methodLabel, deliveryStatus)
 * are currently French strings, so they appear in FR inside ar/en messages
 * until those vars are localized at the call site.
 */

const BASE_URL = (process.env.LOADBRAIN_URL || "").replace(/\/$/, "");
const INTERNAL_TOKEN = process.env.LOADBRAIN_INTERNAL_TOKEN || "";
const SITE_ID = process.env.LOADBRAIN_SITE_ID || "";

if (!BASE_URL || !INTERNAL_TOKEN || !SITE_ID) {
  console.error(
    "Missing env. Required: LOADBRAIN_URL, LOADBRAIN_INTERNAL_TOKEN, LOADBRAIN_SITE_ID"
  );
  process.exit(1);
}

const FOOTER_FR = "_FLEXBOX DIRECT — partenaire B2B_";

/** key → { category, bodies: { fr, ar, en } }. All vars use {{mustache}} form. */
const TEMPLATES = {
  "wallet.recharged": {
    category: "utility",
    bodies: {
      fr:
        "🟢 *{{companyName}}* — Recharge confirmée\n\n" +
        "Mode : {{methodLabel}}\n" +
        "Montant ajouté : *+{{amount}}*\n" +
        "Nouveau solde : *{{newBalance}}*\n\n" +
        "Merci pour votre confiance.\n" +
        FOOTER_FR,
      ar:
        "🟢 *{{companyName}}* — تم تأكيد الشحن\n\n" +
        "الطريقة : {{methodLabel}}\n" +
        "المبلغ المضاف : *+{{amount}}*\n" +
        "الرصيد الجديد : *{{newBalance}}*\n\n" +
        "شكرًا على ثقتكم.\n" +
        "_FLEXBOX DIRECT — شريك B2B_",
      en:
        "🟢 *{{companyName}}* — Top-up confirmed\n\n" +
        "Method: {{methodLabel}}\n" +
        "Amount added: *+{{amount}}*\n" +
        "New balance: *{{newBalance}}*\n\n" +
        "Thank you for your trust.\n" +
        "_FLEXBOX DIRECT — B2B partner_",
    },
  },

  "wallet.low_balance": {
    category: "utility",
    bodies: {
      fr:
        "🔔 *{{companyName}}* — Solde bas\n\n" +
        "Votre solde est de *{{balance}}* (seuil d'alerte : {{threshold}}).\n\n" +
        "Pensez à recharger pour continuer à commander sans interruption.\n" +
        FOOTER_FR,
      ar:
        "🔔 *{{companyName}}* — رصيد منخفض\n\n" +
        "رصيدكم الحالي *{{balance}}* (حد التنبيه : {{threshold}}).\n\n" +
        "يرجى إعادة الشحن لمواصلة الطلب دون انقطاع.\n" +
        "_FLEXBOX DIRECT — شريك B2B_",
      en:
        "🔔 *{{companyName}}* — Low balance\n\n" +
        "Your balance is *{{balance}}* (alert threshold: {{threshold}}).\n\n" +
        "Top up to keep ordering without interruption.\n" +
        "_FLEXBOX DIRECT — B2B partner_",
    },
  },

  "signup.approved": {
    category: "utility",
    bodies: {
      fr:
        "🎉 *{{companyName}}* — Compte partenaire activé\n\n" +
        "Email : {{email}}\n" +
        "Mot de passe : *{{password}}*\n" +
        "PIN : *{{pin}}*\n\n" +
        "Connectez-vous sur le portail revendeur pour commencer à commander.\n\n" +
        "⚠️ *Gardez ce message confidentiel* — ces identifiants ne seront pas renvoyés.\n" +
        FOOTER_FR,
      ar:
        "🎉 *{{companyName}}* — تم تفعيل حساب الشريك\n\n" +
        "البريد : {{email}}\n" +
        "كلمة السر : *{{password}}*\n" +
        "الرمز السري : *{{pin}}*\n\n" +
        "سجّل الدخول إلى بوابة الموزّعين لبدء الطلب.\n\n" +
        "⚠️ *احتفظ بهذه الرسالة سرية* — لن يتم إرسال هذه البيانات مرة أخرى.\n" +
        "_FLEXBOX DIRECT — شريك B2B_",
      en:
        "🎉 *{{companyName}}* — Partner account activated\n\n" +
        "Email: {{email}}\n" +
        "Password: *{{password}}*\n" +
        "PIN: *{{pin}}*\n\n" +
        "Log in to the reseller portal to start ordering.\n\n" +
        "⚠️ *Keep this message confidential* — these credentials won't be resent.\n" +
        "_FLEXBOX DIRECT — B2B partner_",
    },
  },

  "signup.rejected": {
    category: "utility",
    bodies: {
      fr:
        "📋 *{{companyName}}* — Demande partenaire\n\n" +
        "Bonjour,\n\nNous avons étudié votre demande pour devenir partenaire B2B ({{email}}).\n\n" +
        "Malheureusement nous ne pouvons pas y donner suite pour la raison suivante :\n_{{reason}}_\n\n" +
        "N'hésitez pas à nous recontacter si votre situation évolue.\n" +
        "_FLEXBOX DIRECT_",
      ar:
        "📋 *{{companyName}}* — طلب الشراكة\n\n" +
        "مرحبًا،\n\nلقد درسنا طلبكم لتصبحوا شريكًا B2B ({{email}}).\n\n" +
        "للأسف لا يمكننا قبوله للسبب التالي :\n_{{reason}}_\n\n" +
        "لا تترددوا في التواصل معنا إذا تغيّر وضعكم.\n" +
        "_FLEXBOX DIRECT_",
      en:
        "📋 *{{companyName}}* — Partner application\n\n" +
        "Hello,\n\nWe have reviewed your B2B partner application ({{email}}).\n\n" +
        "Unfortunately we cannot proceed for the following reason:\n_{{reason}}_\n\n" +
        "Feel free to reach out again if your situation changes.\n" +
        "_FLEXBOX DIRECT_",
    },
  },

  "order.confirmed": {
    category: "utility",
    bodies: {
      fr:
        "🛒 *{{companyName}}* — Commande confirmée\n\n" +
        "N° de commande : *{{orderNumber}}*\n" +
        "Articles : {{itemCount}}\n" +
        "Total débité : *{{totalAmount}}*\n\n" +
        "{{deliveryStatus}}\n\n" +
        "Consulter sur le portail : /reseller/orders\n" +
        FOOTER_FR,
      ar:
        "🛒 *{{companyName}}* — تم تأكيد الطلب\n\n" +
        "رقم الطلب : *{{orderNumber}}*\n" +
        "العناصر : {{itemCount}}\n" +
        "المبلغ المخصوم : *{{totalAmount}}*\n\n" +
        "{{deliveryStatus}}\n\n" +
        "اطّلع على البوابة : /reseller/orders\n" +
        "_FLEXBOX DIRECT — شريك B2B_",
      en:
        "🛒 *{{companyName}}* — Order confirmed\n\n" +
        "Order no.: *{{orderNumber}}*\n" +
        "Items: {{itemCount}}\n" +
        "Total charged: *{{totalAmount}}*\n\n" +
        "{{deliveryStatus}}\n\n" +
        "View on the portal: /reseller/orders\n" +
        "_FLEXBOX DIRECT — B2B partner_",
    },
  },

  "order.credentials.ready": {
    category: "utility",
    bodies: {
      fr:
        "✅ *{{companyName}}* — Credentials prêtes\n\n" +
        "Commande : *{{orderNumber}}*\n" +
        "{{credentialSummary}}\n\n" +
        "Accès complets sur le portail : /reseller/orders\n" +
        'Bouton "Envoyer au client" disponible.\n\n' +
        FOOTER_FR,
      ar:
        "✅ *{{companyName}}* — بيانات الدخول جاهزة\n\n" +
        "الطلب : *{{orderNumber}}*\n" +
        "{{credentialSummary}}\n\n" +
        "الوصول الكامل على البوابة : /reseller/orders\n" +
        'زر "إرسال إلى العميل" متاح.\n\n' +
        "_FLEXBOX DIRECT — شريك B2B_",
      en:
        "✅ *{{companyName}}* — Credentials ready\n\n" +
        "Order: *{{orderNumber}}*\n" +
        "{{credentialSummary}}\n\n" +
        "Full access on the portal: /reseller/orders\n" +
        'A "Send to customer" button is available.\n\n' +
        "_FLEXBOX DIRECT — B2B partner_",
    },
  },

  "support.reply": {
    category: "utility",
    bodies: {
      fr:
        "💬 *{{companyName}}* — Réponse support\n\n" +
        "Ticket : *{{ticketRef}}*\n\n" +
        "{{preview}}\n\n" +
        "Répondez depuis le portail : /reseller/support\n" +
        FOOTER_FR,
      ar:
        "💬 *{{companyName}}* — رد الدعم\n\n" +
        "التذكرة : *{{ticketRef}}*\n\n" +
        "{{preview}}\n\n" +
        "ردّوا من البوابة : /reseller/support\n" +
        "_FLEXBOX DIRECT — شريك B2B_",
      en:
        "💬 *{{companyName}}* — Support reply\n\n" +
        "Ticket: *{{ticketRef}}*\n\n" +
        "{{preview}}\n\n" +
        "Reply from the portal: /reseller/support\n" +
        "_FLEXBOX DIRECT — B2B partner_",
    },
  },
};

const LOCALES = ["fr", "ar", "en"];

function headers() {
  return {
    "Content-Type": "application/json",
    "X-Internal-Token": INTERNAL_TOKEN,
    "X-Site-Id": SITE_ID,
  };
}

async function listTemplates() {
  const res = await fetch(
    `${BASE_URL}/api/v1/whatsapp/templates?siteId=${encodeURIComponent(SITE_ID)}`,
    { headers: headers() }
  );
  if (!res.ok) throw new Error(`list templates HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return Array.isArray(json.data) ? json.data : [];
}

async function createTemplate(key, locale, category, body) {
  const res = await fetch(`${BASE_URL}/api/v1/whatsapp/templates`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      siteId: SITE_ID,
      name: `${key} (${locale})`,
      key,
      locale,
      language: locale,
      category,
      body,
    }),
  });
  if (!res.ok) throw new Error(`create ${key}/${locale} HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()).data.template;
}

async function approveTemplate(id) {
  const res = await fetch(`${BASE_URL}/api/v1/whatsapp/templates/${id}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ status: "approved" }),
  });
  if (!res.ok) throw new Error(`approve ${id} HTTP ${res.status}: ${await res.text()}`);
}

async function main() {
  console.log(`Seeding reseller WhatsApp templates → ${BASE_URL} (siteId=${SITE_ID})`);
  const existing = await listTemplates();
  const index = new Map(existing.map((t) => [`${t.key}::${t.locale}`, t]));

  let created = 0;
  let approved = 0;
  for (const [key, def] of Object.entries(TEMPLATES)) {
    for (const locale of LOCALES) {
      const body = def.bodies[locale];
      if (!body) continue;
      let row = index.get(`${key}::${locale}`);
      if (!row) {
        row = await createTemplate(key, locale, def.category, body);
        created++;
        console.log(`  + created ${key} (${locale})`);
      } else {
        console.log(`  = exists  ${key} (${locale})`);
      }
      if (row.status !== "approved") {
        await approveTemplate(row.id);
        approved++;
        console.log(`    → approved`);
      }
    }
  }
  console.log(`Done. created=${created}, approved=${approved}.`);
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
