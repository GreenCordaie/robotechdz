# God Mode Audit — Sécurité + CSS/Tailwind Visuel
**Date :** 2026-03-23
**Statut :** Approuvé
**Approche retenue :** A — Audit séquentiel profond avec rapport + remédiation par priorité

---

## 1. Contexte

Application Next.js App Router (POS/Kiosk e-commerce) avec :
- Stack : Next.js, Drizzle ORM, PostgreSQL, HeroUI, Tailwind CSS, Zustand
- Interfaces : Admin (dark mode), Kiosk (light mode forcé), Revendeur
- Intégrations : WhatsApp (WAHA), Telegram, n8n, Groq AI, Evolution API
- Auth : JWT HS256 (jose), rôles ADMIN/RESELLER/CAISSIER
- 6 API routes, 16 server actions, 4 vues kiosk, 12 pages admin

---

## 2. Audit Sécurité

### 2.1 Périmètre

| Zone | Fichiers |
|------|----------|
| Auth & Sessions | `src/lib/jwt.ts`, `src/middleware.ts`, `src/app/admin/login/actions.ts`, `src/app/reseller/login/actions.ts` |
| API Routes | `src/app/api/admin/cron/scan-expiry/route.ts`, `src/app/api/admin/n8n/callback/route.ts`, `src/app/api/orders/track/route.ts`, `src/app/api/webhooks/whatsapp/route.ts`, `src/app/api/telegram/webhook/route.ts`, `src/app/api/print-queue/route.ts` |
| Webhooks | `src/lib/webhook-security.ts` |
| Server Actions | Tous les `actions.ts` (16 fichiers) |
| Données sensibles | `src/db/schema.ts` — colonnes pinCode, tokens, secrets |
| Config & Build | `next.config.mjs`, `.env*` |
| Chiffrement | `src/lib/encryption.ts` |
| Rate Limiting | `src/services/rate-limit.service.ts` |

### 2.2 Checks OWASP Top 10

- **A01 Broken Access Control** — Server actions sans `withAuth`, routes cron/n8n sans auth
- **A02 Cryptographic Failures** — Tokens API et pinCode en clair en DB, string comparison vs timing-safe
- **A03 Injection** — Inputs non validés dans server actions (Zod absent ?)
- **A04 Insecure Design** — WhatsApp webhook sans secret en dev
- **A05 Security Misconfiguration** — `ignoreBuildErrors: true`, `ignoreDuringBuilds: true` dans next.config.mjs
- **A06 Vulnerable Components** — Build flags masquant erreurs TypeScript/ESLint
- **A07 Auth Failures** — JWT algorithm, expiration, token rotation
- **A08 Software Integrity** — CSP unsafe-inline/eval en dev
- **A09 Logging Failures** — Audit logs présents, exhaustivité à vérifier
- **A10 SSRF** — URLs externes dans server actions (n8n, WhatsApp, Telegram)

### 2.3 Rapport produit

Fichier : `docs/audits/2026-03-23-security-audit.md`
Format :
```
| ID | Fichier:Ligne | Sévérité | Description | Fix appliqué |
```

### 2.4 Ordre des fixes

1. 🔴 CRITIQUE — Endpoints non authentifiés, secrets exposés
2. 🟠 ÉLEVÉ — Comparaisons non timing-safe, build flags dangereux
3. 🟡 MOYEN — Validation inputs manquante, webhook dev sans secret
4. 🟢 FAIBLE — Recommandations architecturales (pas forcément fixé)

---

## 3. Audit CSS/Tailwind Visuel

### 3.1 Périmètre

| Zone | Fichiers |
|------|----------|
| Design tokens | `tailwind.config.ts`, `src/app/globals.css` |
| Admin layout | `src/app/admin/layout.tsx`, `src/components/admin/AdminSidebar.tsx` |
| Admin pages (12) | `src/app/admin/*/page.tsx` + Content components |
| Kiosk views (4) | `IdleView.tsx`, `CatalogueView.tsx`, `CartView.tsx`, `ConfirmationView.tsx` |
| Kiosk modals (4) | `ProductModal.tsx`, `DeliveryMethodModal.tsx`, `PlayerIdModal.tsx`, `SupportModal.tsx` |
| Composants partagés | `src/components/admin/**` |

### 3.2 Checks visuels

| Catégorie | Checks |
|-----------|--------|
| Couleurs | Valeurs hex hardcodées (`#FF8000`, `#ec5b13`) au lieu de tokens Tailwind |
| Typographie | Mélange de familles de polices inline vs variables CSS |
| Dark mode | Classes `dark:` manquantes sur composants admin |
| Spacing | Valeurs arbitraires `p-[13px]`, `mt-[37px]` vs scale Tailwind |
| Responsive | Breakpoints incohérents entre pages admin |
| Composants | Patterns UI dupliqués au lieu d'être extraits |
| Animations | Keyframes inline vs classes Tailwind standard |
| Cohérence kiosk | Couleurs et tailles incohérentes entre vues et modals |

### 3.3 Rapport produit

Fichier : `docs/audits/2026-03-23-css-audit.md`
Format :
```
| ID | Fichier:Ligne | Sévérité | Problème | Fix appliqué |
```

### 3.4 Ordre des fixes

1. 🟠 ÉLEVÉ — Incohérences design system majeures (couleurs hardcodées masquant les tokens)
2. 🟡 MOYEN — Spacing arbitraire, typographie inline, dark mode incomplet
3. 🟢 FAIBLE — Suggestions d'extraction de composants, documentation tokens

---

## 4. Livrables

| Livrable | Chemin |
|---------|--------|
| Rapport sécurité | `docs/audits/2026-03-23-security-audit.md` |
| Rapport CSS/Tailwind | `docs/audits/2026-03-23-css-audit.md` |
| Fixes code | Appliqués directement dans les fichiers sources |
| Leçons apprises | `tasks/lessons.md` mis à jour |

---

## 5. Contraintes

- Pas de breaking changes sur les interfaces publiques (API routes)
- Pas de migration DB pour les fixes sécurité (sauf si absolument nécessaire)
- Les fixes CSS ne doivent pas changer le comportement fonctionnel
- Chaque fix doit être référencé par son ID dans le rapport d'audit
