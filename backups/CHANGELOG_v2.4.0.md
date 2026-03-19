# Changelog - FLEXBOX DIRECT

Toutes les modifications notables de ce projet seront documentées dans ce fichier.

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
