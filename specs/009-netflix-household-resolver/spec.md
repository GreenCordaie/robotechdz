# Feature Specification: Netflix Household Auto-Resolver

**Feature Branch**: `009-netflix-household-resolver`
**Created**: 2026-03-29
**Status**: Draft

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Résolution automatique via WhatsApp (Priority: P1)

Un client bloqué par Netflix envoie "foyer" ou "code netflix" via WhatsApp. Le système détecte le keyword, récupère le code de vérification depuis la boîte email Outlook du compte Netflix concerné, et l'envoie au client par WhatsApp en moins de 2 minutes — sans aucune intervention humaine.

**Why this priority**: Cas le plus fréquent et le plus critique. Avec des milliers de comptes, chaque intervention manuelle est insoutenable.

**Independent Test**: Client envoie "foyer" → système répond avec le code Netflix en moins de 2 minutes.

**Acceptance Scenarios**:

1. **Given** un client possède un slot VENDU avec un compte lié et un mot de passe Outlook configuré, **When** il envoie "foyer" par WhatsApp, **Then** le système répond automatiquement avec le code de vérification Netflix dans les 2 minutes
2. **Given** Netflix envoie un lien de vérification (household link), **When** le système le détecte, **Then** le client reçoit le lien cliquable par WhatsApp
3. **Given** l'email Netflix n'est pas encore arrivé, **When** le système ne trouve pas de code, **Then** il retente 3 fois à 30 secondes d'intervalle avant d'informer le client
4. **Given** un client envoie "code netflix", "household", "appareil", "connexion" ou "activer", **When** le message est reçu, **Then** le même flux de résolution est déclenché

---

### User Story 2 - Résolution manuelle par le traiteur (Priority: P2)

Un administrateur ou traiteur clique sur "Résoudre" à côté d'un profil vendu dans la page Comptes Partagés. Le code est récupéré depuis l'email Outlook et envoyé directement au client par WhatsApp.

**Why this priority**: Indispensable pour les clients qui contactent par un autre canal que WhatsApp.

**Independent Test**: Cliquer "Résoudre" sur un slot VENDU → code envoyé par WhatsApp au client.

**Acceptance Scenarios**:

1. **Given** un slot est VENDU et son compte a un mot de passe Outlook, **When** le traiteur clique "Résoudre", **Then** le code est récupéré et envoyé au client par WhatsApp
2. **Given** le compte n'a pas de mot de passe Outlook configuré, **When** le traiteur clique "Résoudre", **Then** un message d'erreur clair indique que le mot de passe Outlook est manquant
3. **Given** le client du slot n'a pas de numéro de téléphone, **When** la résolution est tentée, **Then** un message d'erreur clair est affiché dans l'interface

---

### User Story 3 - Ajout compte avec Outlook password et PINs auto-générés (Priority: P3)

L'administrateur ajoute un nouveau compte partagé Netflix. Le système génère automatiquement un PIN à 4 chiffres unique pour chaque profil, visible en clair. L'admin saisit le mot de passe Outlook dans un champ dédié.

**Why this priority**: Fondation nécessaire pour les résolutions automatiques.

**Independent Test**: Ajouter un compte → PINs générés et affichés → mot de passe Outlook stocké.

**Acceptance Scenarios**:

1. **Given** l'admin remplit le formulaire avec email, mot de passe Netflix et mot de passe Outlook, **When** il clique "Ajouter", **Then** le compte est créé avec un PIN unique auto-généré pour chaque profil
2. **Given** les PINs ont été générés, **When** l'admin consulte le compte, **Then** chaque PIN est affiché en clair avec un bouton de copie
3. **Given** l'admin saisit manuellement un PIN pour un profil, **When** il soumet, **Then** ce PIN est utilisé tel quel
4. **Given** le mode multi-lignes avec format "email | netflix_pass | outlook_pass", **When** l'import est soumis, **Then** le mot de passe Outlook est extrait et stocké séparément

---

### User Story 4 - Première connexion sur nouvel appareil (Priority: P3)

Même flux que le problème foyer pour la vérification de première connexion. Le client envoie "connexion" et reçoit le code Netflix par WhatsApp.

**Why this priority**: Même infrastructure, second cas d'usage fréquent.

**Independent Test**: Client envoie "connexion" → code de vérification Netflix envoyé par WhatsApp.

**Acceptance Scenarios**:

1. **Given** Netflix envoie un code de vérification de première connexion, **When** le client envoie "connexion", **Then** le code est récupéré et envoyé par WhatsApp
2. **Given** Netflix envoie un lien de vérification, **When** le système l'extrait, **Then** le lien est envoyé au client

---

### Edge Cases

- Plusieurs clients du même compte bloqués simultanément → résolutions indépendantes, les deux reçoivent le même code
- Mot de passe Outlook incorrect → message d'erreur "Impossible de se connecter à la boîte email"
- Email Netflix non reçu après 3 retries → client informé "Email non trouvé, réessayez dans quelques minutes"
- Collision de PIN auto-généré → système retente jusqu'à 10 fois pour trouver un PIN unique
- Client sans slot VENDU associé à son numéro → message "Aucun abonnement actif trouvé"
- Compte existant sans mot de passe Outlook → bouton "Résoudre" signale le mot de passe manquant

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le système DOIT stocker un mot de passe Outlook encrypté par compte partagé, séparé du mot de passe Netflix
- **FR-002**: Le système DOIT générer automatiquement un PIN à 4 chiffres unique pour chaque profil lors de la création, si aucun PIN n'est fourni manuellement
- **FR-003**: Le système DOIT garantir l'unicité globale de chaque PIN parmi tous les profils existants
- **FR-004**: Le système DOIT afficher les PINs en clair dans l'interface administrateur avec un bouton de copie par profil
- **FR-005**: Le système DOIT se connecter à la boîte Outlook d'un compte pour récupérer les emails de vérification Netflix
- **FR-006**: Le système DOIT extraire le code 4 chiffres ou le lien de vérification depuis les emails Netflix reçus dans les 15 dernières minutes
- **FR-007**: Le système DOIT retenter la récupération 3 fois à 30 secondes d'intervalle si aucun email n'est trouvé
- **FR-008**: Le système DOIT envoyer le code ou lien extrait au client via WhatsApp avec un message adapté au type de contenu
- **FR-009**: Le système DOIT détecter les mots-clés "foyer", "household", "appareil", "code netflix", "connexion", "activer" dans les messages WhatsApp entrants et déclencher la résolution avant le traitement IA
- **FR-010**: Le système DOIT identifier le slot du client à partir de son numéro de téléphone via l'historique de commandes
- **FR-011**: L'interface DOIT proposer un bouton "Résoudre" sur chaque profil vendu
- **FR-012**: Le format d'import multi-lignes DOIT supporter le format optionnel "email | netflix_pass | outlook_pass"
- **FR-013**: Toutes les tentatives de résolution DOIVENT être enregistrées dans les logs d'audit

### Key Entities

- **Compte partagé**: Compte Netflix avec credentials Netflix + Outlook encryptés et N profils. Nouvel attribut : mot de passe Outlook encrypté.
- **Profil**: Un des N profils d'un compte partagé, identifié par un PIN unique à 4 chiffres visible pour l'admin. Peut être disponible ou vendu.
- **Résolution**: Demande de récupération de code vérification Netflix. Contient le type (CODE/LIEN/NON_TROUVÉ), la valeur extraite, le canal (MANUEL/WHATSAPP) et le résultat.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un client bloqué reçoit le code Netflix par WhatsApp en moins de 2 minutes après envoi du mot-clé, sans intervention humaine
- **SC-002**: 100% des comptes créés après déploiement ont un PIN unique par profil, visible et copiable dans l'interface admin
- **SC-003**: Le nombre d'interventions manuelles pour problèmes de foyer Netflix est réduit de 90%
- **SC-004**: Le système supporte jusqu'à 50 résolutions simultanées sans dégradation
- **SC-005**: Le taux d'échec technique (hors email non reçu côté Netflix) est inférieur à 2%
- **SC-006**: Les PINs sont copiables en un clic, permettant la saisie Netflix en moins de 30 secondes

## Assumptions

- Les comptes Outlook n'ont pas de 2FA — connexion IMAP directe par email + mot de passe
- Le mot de passe Outlook est différent du mot de passe Netflix mais l'adresse email est identique
- Netflix envoie ses emails de vérification dans les 2-3 minutes suivant la demande
- Senders Netflix : info@account.netflix.com, noreply@mailer.netflix.com, noreply@netflix.com
- Si un client a plusieurs slots actifs, le slot le plus récemment acheté est utilisé pour la résolution automatique
- Les comptes existants sans mot de passe Outlook restent fonctionnels ; la résolution sera disponible après ajout du mot de passe Outlook
