# Changelog - FLEXBOX DIRECT

Toutes les modifications notables de ce projet seront documentées dans ce fichier.

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
