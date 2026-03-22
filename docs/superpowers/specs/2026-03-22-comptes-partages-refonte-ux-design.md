# Refonte UX — Comptes Partagés

**Date :** 2026-03-22
**Statut :** En révision
**Fichiers concernés :**
- `src/app/admin/comptes-partages/SharedAccountsContent.tsx`
- `src/app/admin/comptes-partages/actions.ts` (lecture seule — aucune modification)

---

## Contexte

La page "Comptes Partagés" gère des abonnements streaming (Netflix, Spotify, etc.) avec plusieurs profils/slots par compte. L'admin ajoute les comptes manuellement (email + password + slots), et le système assigne automatiquement un slot à chaque client qui achète.

### Problèmes identifiés

1. **Intégration difficile** : deux interfaces séparées (modal "Nouveau" + panel "Insertion rapide"), chacune incomplète
2. **Sync Notion inutilisée** : les comptes sont ajoutés manuellement, la sync Notion ne sert pas
3. **Email affiché sur les cartes** : information sensible inutile visuellement

---

## Design

### 1. Structure générale de la page

```
┌─────────────────────────────────────────────────────┐
│ HEADER : titre + 4 stats cards (inchangé)           │
├─────────────────────────────────────────────────────┤
│ ZONE D'AJOUT UNIFIÉE (toujours visible, pas modal)  │
│  [Compte unique]  [Multi-lignes]   ← 2 onglets      │
├─────────────────────────────────────────────────────┤
│ TABS PRODUITS + RECHERCHE (inchangé)                │
├─────────────────────────────────────────────────────┤
│ INVENTAIRE — cartes simplifiées (#1, #2, #3...)     │
└─────────────────────────────────────────────────────┘
```

---

### 2. Zone d'ajout unifiée

Remplace : bouton "Nouveau" (modal), card "Insertion rapide", bouton "Notion".

Zone toujours visible en haut de page (pas de modal pour l'ajout). Deux onglets HeroUI `Tabs`.

#### Onglet "Compte unique"

**Flux :**
1. Dropdown sélection produit/variante (obligatoire, en premier)
2. Avant toute sélection : champs email, password et slots sont **absents du DOM** (non rendus conditionnellement via `selectedVariantId`)
3. Dès sélection d'une variante → champs email + password + slots apparaissent
4. Slots générés automatiquement selon `variant.totalSlots` — noms `Profil 1`, `Profil 2`..., PIN vide
5. **Si la variante change après édition des slots → les slots sont réinitialisés** — `useEffect` déclenché sur `selectedVariantId`. L'ancien guard `modalMode !== "ADD"` (plus de modal) est supprimé ; le `useEffect` s'applique directement à la zone inline
6. Bouton "Ajouter" → appelle `addSharedAccount({ variantId, email, password, slots })` → recharge inventaire

**État vide (aucune variante liée) :** si `sharingVariants.length === 0`, afficher un message inline :
> "Aucun SKU partagé configuré. Utilisez le bouton **Lier SKU** pour commencer."

#### Onglet "Multi-lignes"

**Flux :**
1. Dropdown sélection produit/variante (obligatoire — `variantId` **toujours fourni**, jamais `undefined`)
2. Textarea : une ligne = `email | password`
3. Bouton label dynamique : **"Importer X comptes"** où X = nombre de lignes non vides contenant au moins un `|` (calculé en temps réel à chaque frappe)
4. Lignes vides ou sans `|` → ignorées silencieusement (pas d'erreur bloquante)
5. Appelle `addSharedAccountQuick({ variantId: parseInt(quickVariantId), rawInput, autoClassify: false })` — `autoClassify` est toujours `false`, `variantId` est toujours défini
6. Les slots sont créés par l'action avec noms par défaut (`Profil 1`, `Profil 2`...), PIN vide

**Note backend :** Le paramètre `autoClassify` dans l'action `addSharedAccountQuick` devient code mort côté frontend (toujours `false`), mais **ne pas le supprimer de l'action** — nettoyage backend séparé si besoin. Le schéma Zod garde `variantId` optionnel — risque accepté, le frontend garantit toujours sa présence.

**Limitations connues du parser backend (inchangées) :**
- Les mots de passe contenant `|`, `:` ou espaces peuvent être tronqués par le parser `split(/[|:\s]+/)` de l'action
- Les lignes de moins de 6 caractères sont ignorées par l'action (filtre existant conservé)
- Ces limitations sont dans le périmètre backend existant, hors scope de cette refonte UI

**État vide (aucune variante liée) :** même message que onglet "Compte unique".

#### États d'erreur et loading

**Onglet "Compte unique" :**
- Bouton "Ajouter" : état `isLoading` pendant l'appel action
- Erreur → toast d'erreur, formulaire **non vidé** (permet de corriger et re-soumettre)
- Succès → toast succès + formulaire vidé + inventaire rechargé

**Onglet "Multi-lignes" :**
- Bouton "Importer" : état `isLoading` pendant l'appel
- Erreur partielle (certaines lignes échouent) → afficher un bloc d'erreurs inline sous le textarea (conserver le composant `quickErrors` existant)
- Succès total → toast succès + textarea vidé + inventaire rechargé
- Succès partiel (res.errors présents) → toast succès avec "(N erreurs)" + affichage du bloc erreurs

#### Responsive
- Desktop : zone en deux colonnes (dropdown à gauche, form/textarea à droite)
- Mobile (`< md`) : disposition en colonne, dropdown en haut, form/textarea en dessous

---

### 3. Cartes d'inventaire simplifiées

#### Numérotation `#N`
- Calculée au **render** : index séquentiel par groupe produit (`accIndex + 1`)
- Pas de champ base de données — purement visuel
- Si un compte est supprimé, les numéros se réordonnent automatiquement

#### Structure d'une carte

```
┌──────────────────────────────────┐
│  #3          [Netflix 5P]  PLEIN │
│                                  │
│  ●●●●●  5/5                     │
│  ████████████████  100%          │
│                                  │
│  ● Slot 1 — Jean Dupont  #0042  │
│  ● Slot 2 — Sara M.      #0039  │
│  ○ Slot 3 — Disponible          │
│  ○ Slot 4 — Disponible          │
│  ● Slot 5 — Fatima L.    #0047  │
│                                  │
│  15/03/2026             [✏] [🗑] │
└──────────────────────────────────┘
```

**Changements clés :**
- `#N` = `accIndex + 1` par groupe produit — pas d'email affiché
- Email accessible uniquement via le modal d'édition (bouton ✏)
- Slots occupés affichent : nom du client + numéro de commande (directement visibles, sans tooltip)
- Slots libres : `○ Disponible`

#### Calcul `soldCount` et `isFull`
- `soldCount` = nombre de slots avec `slot.status === "VENDU"` (calculé client-side, comportement existant)
- `totalSlots` = `account.slots.length`
- `isFull` = `soldCount === totalSlots && totalSlots > 0`

#### Progress bar — seuils de couleur
| Taux d'occupation | Couleur |
|---|---|
| 0–59% | Vert (`emerald-500`) |
| 60–89% | Orange (`orange-400`) |
| 90–100% | Rouge (`red-500`) |

---

### 4. Header — changements

**Supprimé :**
- Bouton "Notion" (sync Notion retirée du frontend)
- Bouton "Nouveau" (remplacé par zone inline)

**Conservé :**
- Bouton "Lier SKU"
- Champ recherche
- 4 stats cards

---

### 5. Ce qui ne change pas

- Modal d'édition (`EDIT`) — inchangé
- Modal de suppression — inchangé
- Modal "Lier SKU" — inchangé
- `attribuerSlotAutomatiqueAction` — inchangée
- Tabs produits et filtre recherche — inchangés
- Stats globales — inchangées
- `getSharedAccountsInventory` — inchangée

---

## Actions backend — résumé des changements

| Action | Changement frontend |
|--------|-------------------|
| `addSharedAccount` | Aucun |
| `addSharedAccountQuick` | Appelée avec `autoClassify: false` et `variantId` **toujours défini** |
| `syncWithNotion` | Retirée du frontend (import supprimé, bouton supprimé) |
| `deleteSharedAccount` | Aucun |
| `updateSharedAccount` | Aucun |

---

## Critères de succès

- L'admin peut ajouter un compte en moins de 3 clics (sélect produit → email → password → Ajouter)
- L'admin peut importer N comptes d'un coup via l'onglet "Multi-lignes"
- Les cartes n'affichent aucune information sensible (email/password masqués)
- Les slots occupés montrent immédiatement quel client et quelle commande
- La zone d'ajout est toujours visible sans ouvrir de modal
