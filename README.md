# Robotech Admin Platform - Enterprise Edition 🏗️

Système de gestion administrative de haute performance conçu pour la robustesse, la sécurité et la scalabilité. Propulsé par une architecture à couches (Service Layer) et une isolation environnementale stricte.

## 🚀 Stack Technique

- **Framework**: [Next.js 14 (App Router)](https://nextjs.org/)
- **Langage**: TypeScript (Typage strict "Enterprise")
- **Base de Données**: PostgreSQL avec [Drizzle ORM](https://orm.drizzle.team/)
- **UI/UX**: [HeroUI (v2)](https://heroui.com/) & Tailwind CSS
- **Sécurisation**: JWT (JOSE), MFA (Otplib), RBAC (Security Wrappers)
- **Notifications**: Webhooks Telegram & WhatsApp

## 🏗️ Architecture "Enterprise"

Le projet suit des principes de design avancés pour garantir une maintenance facile et une sécurité maximale :

### 1. Service Layer (Couche Métier)
Située dans `src/services/`, cette couche encapsule toute la logique métier complexe. Les Server Actions ne sont que des contrôleurs qui délèguent le travail aux services, évitant la duplication de code.

### 2. Query System (Optimisation Lecture)
Les lectures de données sont isolées dans `src/services/queries/`. Elles utilisent le pattern `cache()` de React pour la mémoïsation au sein d'une même requête, optimisant ainsi les performances de la base de données.

### 3. Isolation Environnementale (Anti-Leakage)
Pour prévenir les erreurs de bundling Webpack (`ChunkLoadError`), toutes les dépendances lourdes coté serveur (DB, Auth) sont chargées via des **Imports Dynamiques** au sein des fonctions. Les proxies client ne "voient" jamais le code serveur.

### 4. Sécurité RBAC & Audit
Toutes les actions sensibles sont protégées par le wrapper `withAuth` qui vérifie :
- La validité de la session.
- Les permissions de rôle (ADMIN vs RESELLER).
- Le mode maintenance.
- La whitelisting d'IP (pour les administrateurs).
- Journalisation automatique dans la table `audit_logs`.

## 🛠️ Installation & Développement

1.  **Dépendances** :
    ```bash
    npm install
    ```

2.  **Environnement** :
    Copiez `.env.example` vers `.env` et remplissez les variables.

3.  **Lancement** :
    ```bash
    npm run dev
    ```

4.  **Base de données** :
    ```bash
    npx drizzle-kit push
    ```

## 🔐 Sécurité & Maintenance

- **CSP (Content Security Policy)** : Configuré dans `middleware.ts`, il est détendu en mode développement pour permettre l'hydratation Next.js et strict en production.
- **Service Worker** : Gère la mise en cache des assets pour une expérience fluide. *Note: En cas de mise à jour majeure des chunks, videz les "Site Data" dans l'onglet Application du navigateur.*

---
Documenté par Antigravity Agent.
