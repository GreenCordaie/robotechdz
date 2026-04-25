# Changelog - FLEXBOX DIRECT

Toutes les modifications notables de ce projet seront documentées dans ce fichier.

## [12.2.0] - 2026-04-25

### 🚀 Iron Max TV — Second Provider IPTV

#### Multi-Provider IPTV
- **Iron Max TV** ajouté comme second provider IPTV aux côtés de King365TV
- 5 variantes : 12 Mois, 6 Mois, 3 Mois, 1 Mois, Trial 2 Jours
- Slugs : `ironmax-12m`, `ironmax-6m`, `ironmax-3m`, `ironmax-1m`, `ironmax-trial`
- Mappings LoadBrain créés — provisioning automatique (~25s)
- Webhook Iron Max → credentials en clair (username, password, M3U, EPG)
- Architecture multi-provider validée — aucun code modifié, tout fonctionne par configuration

#### Corrections additionnelles
- Nettoyage DB : suppression produits test "karim test king365"
- Nettoyage LoadBrain : doublons de mappings identifiés (à supprimer côté LoadBrain)
- Commandes orphelines nettoyées (8 tests supprimés, 2 annulées)
- SDK LoadBrain v3.1.0 — `createNextWebhookHandler` + `expiresAt` DD-MM-YYYY parsing

## [12.1.0] - 2026-04-25

### 🔒 Audit de Sécurité & Corrections — 21 fixes

#### CRITIQUES (9 corrigés)
- **HMAC constant-time** — `timingSafeEqual` au lieu de `!==` dans webhook LoadBrain
- **Idempotency TOCTOU** — check déplacé dans la transaction DB
- **Rate-limit atomique** — EXPIRE toujours appelé + try/catch anti-lockout permanent
- **Telegram fallback hardcodé** — `"flexbox_secure_token_2026"` supprimé, fail si absent
- **IPTV credentials masquées** — password `••••••••` dans Telegram (plus de plaintext)
- **PIN verification** — `session.user.id` → `session.userId` (écran PIN fonctionnel)
- **Settings publics** — `/api/v1/public/settings` filtre les tokens/secrets/clés API
- **require() client** — remplacé par `fetch()` dans la page Modules
- **deliveryMethod case** — `"whatsapp"` → `"WHATSAPP"` (bouton resend visible)

#### HIGH (10 corrigés)
- **decrypt null-check** — guard `s.digitalCode?.code` avant décryptage (2 endroits)
- **/api/health** — détails protégés par CRON_SECRET (public = juste "ok")
- **IPTV retry** — provisions `queued` bloquées maintenant retryable
- **OrderStatus.TERMINE** — enum au lieu de string hardcodé
- **JSON.parse** — try/catch retourne 400 au lieu de 500
- **checkExpiringProvisions** — utilise `expiresAt` avec threshold réel
- **Turnstile** — token requis si configuré (plus de bypass)
- **CredentialCard** — `screen.expiresAt` au lieu de `completedAt`
- **n8n event** — `ORDER_PAID` au lieu de `ORDER_PRINTED`
- **Dashboard mobile** — +/- pourcentage avec couleur conditionnelle

#### MEDIUM (2 corrigés)
- **useSettingsStore** — appel unique au lieu de double souscription
- **expiresAt date format** — parsing DD-MM-YYYY (format LoadBrain)

## [12.0.0] - 2026-04-24

### 🚀 Release v12.0.0 — LoadBrain IPTV Integration

Intégration complète du module LoadBrain pour le provisionnement automatique IPTV (King365).

#### 📦 Module LoadBrain SDK v3.0.1
- `@loadbrain/sdk@3.0.1` + `@loadbrain/site-integration@3.0.1` installés
- Proxy sécurisé via `createNextRouteHandler()` — API key jamais exposée au navigateur
- `ProductManager` avec `apiBasePath` — mapping produits → plans LoadBrain
- Config `siteUrl` pour les webhooks automatiques

#### 🗄️ Schema DB
- `loadbrainSlug` sur `product_variants` — liaison variante → plan LoadBrain
- Table `iptv_provisions` — suivi provisioning (taskId, status, credentials encryptées)

#### ⚡ Pipeline Commande IPTV
- `allocateOrderStock()` skip les items IPTV (provisionnés via LoadBrain)
- `payOrder()` dispatch automatique `provisionIptvOrder()` après paiement
- **Polling automatique** — vérifie le task LoadBrain toutes les 5s pendant 60s
- Si le task est `completed`, injecte les credentials en DB + marque TERMINE + envoie WhatsApp
- Guard `ORDER_DELIVERED` — empêche l'envoi WhatsApp prématuré pour les commandes IPTV

#### 📡 Webhook Handler
- `/api/loadbrain/webhook` — vérifie signature HMAC, crée `digital_codes`, complète la commande
- Fallback HMAC avec 3 variantes de body (raw, trimmed, re-stringified)
- Validation idempotency — skip si credentials déjà existantes
- Events `IPTV_PROVISION_COMPLETED` et `IPTV_PROVISION_FAILED` publiés

#### 📱 WhatsApp IPTV
- Message formaté : username, mot de passe, M3U URL, EPG URL
- M3U construit automatiquement si LoadBrain retourne vide
- Instructions IPTV (Smarters, TiviMate) envoyées après les credentials

#### 🖥️ Pages Admin
- **`/admin/iptv`** — liste des lignes provisionnées avec credentials, filtres, statuts
- Boutons : Relancer, Renvoyer webhook, Annuler, Renouveler, Saisie manuelle
- Statut "cancelled" ajouté
- **`/admin/modules`** — ProductManager LoadBrain v3.0.0, exports listés
- **Dashboard** — carte IPTV sur desktop + mobile
- **Traitement** — items IPTV affichent "IPTV LoadBrain — Provisionnement automatique" au lieu des champs code
- **Commandes** — statut IPTV dans le détail commande

#### 🛒 Kiosk
- Produits IPTV visibles avec badge cyan "Auto"
- Stock IPTV = "Disponible — Instant" (pas de compteur)
- `loadbrainSlug` exposé au frontend pour détection

#### 📋 Catalogue Admin
- Champ "LoadBrain Slug (IPTV)" dans le formulaire variante
- Validation slug — vérifie que le slug existe dans LoadBrain avant création
- Visible uniquement quand "Livraison manuelle" est désactivé

#### 🔒 Sécurité
- Proxy `/api/loadbrain/[...path]` avec path allowlist
- `/api/loadbrain/provision-status` avec auth session
- `/admin/iptv` dans le middleware RBAC whitelist (ADMIN, SUPER_ADMIN, CAISSIER, TRAITEUR)

#### ⏰ Cron Expiration
- `/api/admin/cron/iptv-expiry` — alerte Telegram pour lignes expirant dans 3 jours

## [11.1.0] - 2026-04-11

### 🔔 Notifications Push & PWA + Netflix Multi-Compte

#### Notifications Push (Badge icône)
- **Badge compteur** sur l'icône de l'app (comme WhatsApp/Facebook) via Badging API
- **Push automatiques** : nouvelle commande payée → notification ADMIN + CAISSIER
- **Auto-subscribe** au login si permission déjà accordée
- **Clear badge** à l'ouverture de l'app
- **Toggle dans Paramètres** : switch ON/OFF avec liste des événements notifiés

#### PWA Double Manifest (Admin + Kiosk)
- **2 manifests séparés** : `/api/admin-manifest` (scope `/admin`) et `/api/kiosk-manifest` (scope `/kiosk`)
- Installables **indépendamment** — installer le kiosk ne bloque pas l'installation admin
- Chaque manifest a son propre `id`, `scope`, `start_url`
- Suppression du `manifest.ts` racine (remplacé par les routes API)

#### Icônes PWA
- **4 icônes générées** via Sharp : 192px + 512px, versions `maskable` (padding 20%) et `any`
- **Badge notification** : `badge-96.png` pour la barre des tâches du téléphone
- Logo correctement dimensionné, plus de rognage

#### Bandeau Installation Kiosk
- Bannière orange "Installez [nom boutique] sur votre appareil" avec bouton Installer
- Disparaît si déjà installé ou fermé

#### Netflix Multi-Compte (Disambiguation)
- **Sélection par index** : client répond "1", "2" pour choisir le bon compte
- **Match partiel email** : client tape "john" → match `john@outlook.com` (min 4 chars)
- **Message amélioré** : liste numérotée claire avec instructions
- Conserve aussi le match par n° commande et profil

## [11.0.1] - 2026-04-11

### 🐛 Fix: Livraison WhatsApp automatique

**Problème** : Les messages WhatsApp ne partaient pas automatiquement après paiement/validation d'une commande, mais le bouton "Renvoyer" fonctionnait.

**Cause racine** (2 bugs) :
1. **EventBus double instance** : En production, `AppEventBus.instance` (variable statique) et `globalThis.__eventBus` créaient 2 instances séparées. L'événement `ORDER_DELIVERED` était émis sur une instance, le worker écoutait sur l'autre.
2. **BullMQ inaccessible** : Le bundle standalone Next.js n'inclut pas `ioredis`/`bullmq` — la queue échouait silencieusement sans jamais exécuter le job de livraison.

**Corrections** :
- **`src/lib/events.ts`** : EventBus utilise `globalThis` en production aussi (plus de double instance)
- **`src/workers/notification.worker.ts`** : `ORDER_DELIVERED` appelle `triggerOrderDelivery()` directement (bypass BullMQ). Idem pour `ORDER_PAID` et `ORDER_PRINTED` → appels directs à `N8nService`

## [11.0.0] - 2026-04-10

### 🚀 Release v11.0.0 — Production VPS

Migration complète de l'infrastructure locale vers un VPS dédié (Ubuntu 24.04, 8 Go RAM). L'application tourne désormais 24/7 sans dépendance au PC local.

#### 🏗️ Infrastructure & Déploiement
- **VPS Production** : Déploiement Docker complet sur serveur dédié (187.124.191.30)
- **Docker Compose Production** : `docker-compose.prod.yml` avec 6 services (App, PostgreSQL, Redis, n8n, WAHA, MongoDB)
- **Dockerfile optimisé** : Build multi-stage Next.js standalone, user non-root (`nextjs`)
- **Cloudflare Tunnel** : Installé en service systemd sur le VPS (plus besoin de cloudflared local)
- **Tailscale VPN** : Réseau privé entre VPS et PC caisse pour l'impression thermique
- **Script de déploiement** : `deploy.sh` (setup, deploy, update, status, logs, backup, restore)
- **`.env.production.example`** : Template documenté pour toutes les variables d'environnement

#### 🔒 Audit de Sécurité & Corrections
- **CRITICAL** : Endpoints debug (`/api/debug-codes`, `/api/diag-netflix`, `/api/list-all-emails`) protégés par `CRON_SECRET`
- **CRITICAL** : Validation `SESSION_SECRET` ≥ 32 caractères au démarrage (`jwt.ts`)
- **HIGH** : SSH durci — `PasswordAuthentication no`, clé SSH uniquement
- **HIGH** : Fail2ban configuré — 3 tentatives max, ban 1h
- **HIGH** : Rate-limit fail-closed — bloque quand Redis est indisponible (au lieu de laisser passer)
- **HIGH** : Healthchecks Docker sur tous les services (app, db, redis, n8n)
- **HIGH** : Limites CPU/RAM par container (prévention DoS)
- **HIGH** : WAHA `WHATSAPP_API_KEY` sans valeur par défaut (crash si non configuré)
- **MEDIUM** : Port PostgreSQL exposé uniquement en `127.0.0.1` (+ Tailscale pour le build)
- **MEDIUM** : Firewall UFW — ports 22, 80, 443 uniquement

#### 🖨️ Impression Thermique via Tailscale
- **`printer.ts`** : `PRINT_SERVICE_URL` configurable via variable d'environnement (plus de `127.0.0.1` en dur)
- **`print-service/server.js`** : Écoute sur `0.0.0.0`, autorise le réseau Tailscale (`100.x.x.x`)
- **`print-service/config.json`** : `serverUrl` pointe vers le VPS via Tailscale (`http://100.97.177.62:3000`)

#### 📱 Corrections UI
- **MobileNavbar** : Texte qui dépasse corrigé — `"Validation"` → `"Traiter"`, `flex-1` + `truncate` sur les labels

#### ⚙️ Configuration Next.js
- **`next.config.mjs`** : Ajout `output: 'standalone'` pour le build Docker
- **`.dockerignore`** : Exclusion node_modules, .git, backups, tmp

#### 📝 Fichiers modifiés
- `docker-compose.prod.yml` (nouveau)
- `deploy.sh` (nouveau)
- `.env.production.example` (nouveau)
- `.dockerignore` (nouveau)
- `next.config.mjs`
- `Dockerfile`
- `start.bat`
- `src/app/api/debug-codes/route.ts`
- `src/app/api/diag-netflix/route.ts`
- `src/app/api/list-all-emails/route.ts`
- `src/lib/jwt.ts`
- `src/lib/printer.ts`
- `src/services/rate-limit.service.ts`
- `src/components/admin/MobileNavbar.tsx`
- `print-service/config.json`
- `print-service/server.js`

## [10.1.1] - 2026-04-06

### 🚀 Release v10.1.1 (Stable)
- **Sauvegarde Stable** : Snapshot global de la version de production 10.1.1.
- **Automatisation & Netflix** : Intégration complète de la livraison automatisée des codes via WhatsApp et Node.js.
- **Corrections Frontend** : Résolution des avertissements pour les balises méta, les images et les erreurs Service Worker (Cloudflare beacon).
- **Core SaaS** : Déploiement et finalisation de l'infrastructure Aurum Terminal.

## [9.0.1] - 2026-03-30

### ⚡ Performance & Optimisation (Stable)
Implémentation complète — build OK, zéro régression.

**Phase 1 — Skeletons (13 fichiers créés)**
- `src/components/admin/PageSkeleton.tsx` : composants réutilisables (`SkeletonBlock`, `SkeletonStat`, `SkeletonRow`, `SkeletonCard`, `SkeletonPageHeader`).
- Ajout de `loading.tsx` sur toutes les routes : `admin/`, `dashboard`, `analytics`, `catalogue`, `clients`, `commandes`, `support`, `fournisseurs`, `traitement`, `b2b`, `comptes-partages`, `monitoring`, `settings`.

**Phase 2 — Lazy loading (10 fichiers modifiés)**
- Les 17 modals sont maintenant des chunks séparés, chargés uniquement à l'ouverture : `CommandesContent`, `ClientsContent`, `CatalogueMobile`, `SuppliersContent`, `SuppliersMobile`, `TraitementContent`, `TraitementMobile`, `B2bMobile`, `CaisseContent`, `CaisseMobile`.

**Phase 3 — Incremental Static Regeneration (ISR) (7 pages modifiées)**
- `dashboard` : revalidate=300 (au lieu de rien)
- `analytics` : revalidate=300 (au lieu de rien)
- `catalogue` : revalidate=60 (au lieu de force-dynamic)
- `clients` : revalidate=60 (au lieu de force-dynamic)
- `fournisseurs` : revalidate=60 (au lieu de force-dynamic)
- `b2b` : revalidate=60 (au lieu de force-dynamic)
- `commandes` : revalidate=120 (au lieu de rien)

**Résultat attendu** : Navigation < 300ms, zéro écran blanc, bundle JS réduit de ~35–40% sur les pages avec modals.

## [9.0.0] - 2026-03-29

### 🚀 Release Majeure v9.0.0 (Stable)
- **UI & Clients** : Améliorations majeures de l'interface utilisateur et gestion complète CRUD pour les clients.
- **Automatisation** : Implémentation des mécanismes d'automatisation (webhook, tunnels).
- **Achats & Commandes** : Implémentation complète de la gestion des achats.
- **Base de données** : Nouvelles actions et résolveurs de données.
- **Stabilisation** : Préparation de la version finale v9.

## [8.0.1] - 2026-03-28

### 🛡️ Architecture & Synchronisation (Stable Release)
- **Auto-Sync n8n** : L'orchestrateur (`scripts/start-dev.js`) détecte et sauvegarde désormais automatiquement l'URL Cloudflare de n8n en base de données.
- **Chemin Unifié** : Alignement du service n8n sur le gateway de production (`flexbox-gateway`) et passage à un format de données "plat" pour une compatibilité totale.
- **Garantie Livraison** : Implémentation d'un fallback direct WhatsApp (WAHA) si le workflow n8n est injoignable.
- **Persistance Singletons** : Correction des fuites de mémoire et pertes d'écouteurs d'événements grâce au pattern `globalThis`.
- **Fix Monitoring** : Résolution de l'erreur de compilation sur le tableau de bord de monitoring (Client Component).
 
## [8.0.0] - 2026-03-28

### 🛡️ Robustesse & Notifications (Stable Core)
- **Pattern "N8n + Fallback"** : Implémentation d'une architecture de notification redondante. Si n8n est indisponible, le système bascule automatiquement sur l'API WhatsApp directe pour garantir la livraison.
- **Versements Dettes** : Les remboursements manuels déclenchent désormais une notification immédiate incluant le montant versé et le **solde actualisé (Reste à payer)**.
- **Centralisation** : Création de `src/lib/notifications.ts` pour uniformiser les alertes système.

## [7.3.6] - 2026-03-28

### 🖨️ Logique d'Impression & WhatsApp
- **Impression Intelligente** : Désactivation de l'impression automatique pour les commandes avec livraison "WhatsApp" afin d'éviter le gaspillage de papier.
- **Visibilité Totale** : Le montant final est désormais affiché sous le libellé "**TOTAL A PAYER**" en majuscules et en grand format (Gras + Double Taille) pour les commandes soldées ou avec remise.
- **Correction Kiosk** : Suppression du déclenchement d'impression prématuré lors de la création d'une commande au Kiosk.
- **WhatsApp Enrichment** : Ajout du "Total Dette Client" dans les notifications de paiement WhatsApp pour une meilleure transparence.

### 🛠️ Corrections de Stabilité
- **Encoding Repair** : Correction globale des caractères corrompus (UTF-8) dans les messages de succès et de retour du module Caisse.


## [7.3.5] - 2026-03-24

### 🖨️ Synchronisation Impression
- **Automatisme Traitement** : Le module de traitement utilise désormais la file d'impression centralisée (`requeueForPrint`), éliminant les boîtes de dialogue manuelles du navigateur.
- **Expérience Unifiée** : Alignement de la logique d'impression Desktop et Mobile sur celle du module Caisse pour une meilleure fiabilité.

### 📊 Profit → Analytics (Rentabilité)
- **Catalogue** : Suppression de la colonne/carte "Profit Estimé" — les estimations ne reflétaient pas les ventes réelles.
- **Analytics > Rentabilité Produits** : Nouveau tableau avec **CA**, **Coût Total**, **Profit Net** et **Marge %** par produit vendu, trié par profit décroissant.
- **Marge Nette corrigée** : Les coûts d'achat en USD sont désormais convertis en DZD (×245) dans `getFinancialOverview`, `getProfitTrend` et `getTopProducts`.
- **Export CSV** : L'export du catalogue reflète les prix d'achat convertis en DZD.

## [7.3.4] - 2026-03-24

### ✨ Flexibilité Caisse
- **Édition Prix d'Achat** : Le caissier peut désormais modifier manuellement le prix d'achat d'un article lors de l'encaissement pour une précision comptable totale.
- **Réconciliation Dynamique** : Les surcharges de prix impactent directement les débits fournisseur et l'historique analytique de la vente.

## [7.3.3] - 2026-03-24

### 💱 Devises & Statistiques
- **Support Multi-devises** : Ajout du sélecteur DZD / $ pour le prix d'achat des comptes.
- **Précision Analytique** : Les statistiques de commande utilisent désormais la devise spécifique de chaque compte pour le calcul de la marge.

## [7.3.2] - 2026-03-24

### 🚀 Production & Profits
- **Purge de Production** : Suppression sécurisée de toutes les données de test (produits, commandes, clients) tout en conservant les configurations système.
- **Suivi des Profits Réels** : Implémentation du suivi du prix d'achat par compte (shared accounts).
- **Proratisation Automatique** : Calcul automatique des marges par slot vendu basé sur le coût réel du compte parent.
- **Interface Admin** : Nouveaux champs de saisie pour le prix de revient dans les formulaires d'ajout et de modification (unique et bulk).

## [7.3.1] - 2026-03-24

### 🚀 Orchestration & Robustesse
- **Orchestrateur v6.1** : Amélioration du démarrage de la session WAHA avec un fallback automatique de 15s.
- **Synchronisation Hybride** : Support de la synchronisation partielle (WhatsApp locale) en attendant les tunnels Cloudflare.
- **Auto-Start Logiciel** : Automatisation complète du lancement de la session WhatsApp dans `start.bat`.

## [7.3.0] - 2026-03-23

### 🛡️ Sécurité & Hardening
- **Audit de Sécurité Majeur** : Évaluation de 40 points de contrôle sur l'ensemble de la stack.
- **Correction Critique (SEC-001)** : Suppression de la clé de chiffrement fallback pour garantir l'utilisation de `ENCRYPTION_KEY`.
- **Protection Webhook** : Suppression du bypass en mode développement pour les webhooks WhatsApp (SEC-002).
- **Hardening API** : Migration vers `timingSafeEqual` pour la file d'impression et suppression des secrets dans les logs et URLs CRON.
- **Rate-Limiting** : Renforcement des politiques anti-force brute (5 tentatives / 15 min).
- **Filtrage Export** : Sécurisation de l'export de base de données par masquage des secrets et tokens.

### 🖥️ Expérience Kiosk (UI/UX)
- **Fluid Layout scaling** : Ajustement global de la taille des éléments pour une interface plus compacte et lisible sur les écrans tactiles.
- **Catalogue & Idle Views** : Raffinement visuel des marges et des typographies pour éviter la fatigue visuelle.

### 📚 Documentation & Specs
- **GitHub Spec Kit** : Initialisation des spécifications techniques dans le dossier `/specs`.
- **Agent Context** : Mise en place du `CLAUDE.md` pour optimiser la mémoire et les routines d'assistance IA.

## [7.2.1] - 2026-03-22

### 💫 Spec-Driven Development
- **Spec Kit Integration** : Installation et initialisation du GitHub Spec Kit pour une gestion structurée des spécifications techniques.
- **Agent Optimization** : Configuration d'Antigravity pour le support natif des routines Spec Kit via `.specify`.

## [7.2.0] - 2026-03-22

### 🏪 Module Caisse (POS)
- **POS Overhaul** : Refonte complète de l'interface de caisse pour une saisie ultra-rapide des ventes.
- **Support Mobile Caisse** : Adaptation du module de caisse pour les terminaux mobiles et tablettes.
- **Server Actions POS** : Nouvelles actions pour la gestion des transactions, des tickets et des stocks en temps réel.

### 🖨️ Écosystème d'Impression
- **Print Service v2** : Amélioration du service Node.js pour une gestion plus fiable des files d'attente d'impression.
- **Library Refactor** : Simplification de `src/lib/printer.ts` pour faciliter l'intégration de nouvelles imprimantes.

### 📦 Services & Data
- **Order Service Update** : Extension du service de commandes pour supporter les flux spécifiques à la vente directe.
- **Database Alignment** : Mise à jour du schéma Drizzle pour la synchronisation des données de caisse.

### 🛠️ Maintenance & Dev
- **Start Scripts** : Optimisation finale des scripts de démarrage pour l'environnement de production locale.

## [7.1.1] - 2026-03-22

### 📊 Analytics & Insights
- **Dashboard Booster** : Amélioration des graphiques et des indicateurs de performance clés (KPI) pour une meilleure visibilité des ventes.
- **Actions Analytiques** : Optimisation des Server Actions dédiées au traitement des données statistiques.

### ⚙️ Paramètres & FAQ
- **Module FaqBot** : Intégration du composant `FaqBotSettings` permettant de configurer finement l'IA pour répondre aux questions fréquentes des clients.
- **Settings Sync** : Meilleure synchronisation entre les versions Desktop et Mobile des paramètres.

### 🛡️ Sécurité & Résilience
- **Security Core Refresh** : Mise à jour du module `lib/security.ts` pour une protection accrue contre les injections et attaques par force brute.
- **Optimization Rate-Limit** : Affinement des seuils de limitation de débit sur les routes critiques.

### 🛠️ Maintenance & Dev
- **Workflow Dev** : Mise à jour des scripts de démarrage (`scripts/start-dev.js`) pour un support multi-plateforme amélioré.

## [7.1.0] - 2026-03-22

### 🛡️ Sécurité & API
- **Hardening Webhook** : Nouveau middleware de validation HMAC et signatures de sécurité pour les webhooks entrants.
- **Rate-Limiting v2** : Service de limitation de débit granulaire pour protéger les endpoints sensibles.
- **Correction Tracking** : Résolution des erreurs de types TypeScript dans le module de suivi des commandes.

### 🤖 Automation & Intelligence
- **Intégration n8n Native** : Nouveau module de synchronisation bidirectionnelle (`n8n.service.ts`) pour automatiser les workflows complexes.
- **Brain Integration** : Optimisation des routines de prompt IA pour les agents de support.

### 🖥️ Expérience Kiosk & Client
- **Kiosk Refresh** : Refonte visuelle majeure des vues `Catalogue`, `Confirmation` et `Idle` pour optimiser le parcours utilisateur.
- **Suivi Temps Réel** : Amélioration de la page de suivi client avec mise à jour du statut en direct.

### ⚙️ Admin & Écosystème
- **Mobile First Admin** : Mise en conformité de la Sidebar et des paramètres Bot pour une expérience 100% fonctionnelle sur tablette et smartphone.
- **Print Core** : Lancement du service `print-service` autonome pour une gestion robuste des impressions sans drivers locaux.

### 🛠️ Améliorations Techniques
- Déploiement d'une suite de 30+ scripts utilitaires pour le monitoring DB et les tests d'intégration.
- Optimisation du `middleware.ts` pour une meilleure gestion des sessions et de la sécurité des routes.

## [7.0.0] - 2026-03-18

### 🚀 WhatsApp & Automatisation
- **Nouveau Moteur Evolution API (v1.8.2)** : Intégration complète via Docker pour une stabilité maximale.
- **Livraison Automatique** : Envoi instantané des codes d'accès et profils dès la validation du paiement.
- **Moteur de Template Dynamique** : Personnalisation totale du message client via l'admin avec balises intelligentes (`{{items}}`, `{{customer}}`, `{{orderId}}`, `{{shopName}}`).
- **Dashboard de Connexion** : Interface de scan QR-Code et monitoring de santé en temps réel (Orange/Vert).
- **Actions Rapides** : Ajout de boutons "Renvoyer WhatsApp" dans le module de traitement des commandes.

### 🖨️ Révolution Impression (WebUSB)
- **Pilote ESC/POS Natif** : Passage d'une génération PDF lente à un flux binaire ultra-rapide directement via USB.
- **Optimisation Xprinter 80C** : Mise en page sur 48 colonnes, grille d'alignement parfaite et commande de découpe (Cut) automatique.
- **Thermal Receipt V2** : Nouveau design "Style Supermarché" plus compact et professionnel.
- **Support Multi-Profils** : Affichage optimisé des identifiants (Email/Pass | Profil | PIN) sur le ticket.

### 🛡️ Sécurité & Intégrité (God Mode)
- **Hardening Financier** : Verrouillage des transactions (`Row Locking`) pour éviter les doubles débits sur les portefeuilles B2B.
- **Audit Logs Avancés** : Traçabilité totale des actions administratives sensibles.
- **MFA & IP Whitelisting** : Renforcement des accès "God Mode" pour le panneau d'administration.

### 🛠️ Améliorations Techniques
- Migration vers une structure de données centralisée (`src/app/actions.ts`).
- Système de cache et revalidation Cloudflare optimisé.
- Correction des bugs de collision d'ID sur le Kiosk.

---
*Généré avec expertise par Antigravity - Version de Production Stable.*
