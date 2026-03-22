# Spec — Workflow Remboursement

**Date :** 2026-03-22
**Statut :** Approuvé

---

## Contexte

L'application gère des ventes de produits numériques (codes de jeux, abonnements streaming). Les server actions de remboursement existent déjà dans le backend (`refundOrderItem`, `refundFullOrder`) mais aucune interface utilisateur ne les expose. L'admin gère aujourd'hui les remboursements entièrement en dehors de l'application.

---

## Objectif

Exposer le workflow de remboursement dans l'interface Caisse :
1. Initier un remboursement (total ou partiel) depuis une commande
2. Réintégrer automatiquement les codes en stock
3. Consulter l'historique des remboursements effectués

---

## Périmètre

**Inclus :**
- Modal de remboursement (total + partiel par article)
- Bouton "Rembourser" dans la liste des commandes de la Caisse
- Onglet "Remboursées" dans la Caisse pour l'historique
- Réintégration automatique des codes en DISPONIBLE

**Exclus :**
- Avoir client (crédit sur compte) — remboursement cash uniquement
- Notification WhatsApp au client
- Page dédiée remboursements
- Remboursement depuis la fiche client

---

## Architecture

### Backend (existant — aucune modification requise)

| Action | Fichier | Signature réelle | Comportement |
|--------|---------|------------------|--------------|
| `refundOrderItem` | `caisse/actions.ts` | `{ orderItemId: number, returnToStock: boolean }` | Remet le code en DISPONIBLE (si `returnToStock: true`), retire l'article de la commande |
| `refundFullOrder` | `caisse/actions.ts` | `{ id: number, returnToStock: boolean }` | Passe la commande en REMBOURSE, libère tous les codes |

> **Note :** `returnToStock` est toujours `true` dans ce workflow — un remboursement n'est accordé que si le code fonctionne (un code défectueux ne donne pas lieu à remboursement, il est traité par `replaceOrderItemCode`).

**Règle métier :** Un remboursement n'est proposé que si le code fonctionne (un code inutilisable = défectueux = pas de remboursement). Les codes remboursés retournent donc toujours en DISPONIBLE.

### Frontend (nouveau)

```
src/components/admin/modals/RefundOrderModal.tsx   ← nouveau composant
src/app/admin/caisse/CaisseContent.tsx             ← modifications
```

---

## Composant RefundOrderModal

### Props
```typescript
interface RefundOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  order: {
    id: number;
    orderNumber: string;
    montantPaye: string;
    items: Array<{
      id: number;
      name: string;
      quantity: number;
      price: string;
    }>;
  };
}
```

### État interne
```typescript
const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(new Set());
const [isRefunding, setIsRefunding] = useState(false);
```

### Structure UI

1. **Header** : "Rembourser la commande #XXXX" + montant total payé
2. **Toggle "Tout sélectionner"** : coche/décoche tous les articles
3. **Liste des articles** : checkbox + nom + prix par article
4. **Montant calculé** : somme des articles sélectionnés, mis à jour en temps réel
5. **Bouton "Confirmer le remboursement"** : orange, désactivé si aucun article sélectionné, affiche un spinner pendant l'opération

### Logique de confirmation

```typescript
const handleConfirm = async () => {
  setIsRefunding(true);
  try {
    const allSelected = selectedItemIds.size === order.items.length;

    if (allSelected) {
      // Signature réelle : { id, returnToStock }
      const res = await refundFullOrder({ id: order.id, returnToStock: true });
      if (!res.success) throw new Error(res.error);
    } else {
      for (const itemId of selectedItemIds) {
        // Signature réelle : { orderItemId, returnToStock }
        const res = await refundOrderItem({ orderItemId: itemId, returnToStock: true });
        if (!res.success) throw new Error(res.error);
      }
    }

    toast.success("Remboursement effectué");
    onSuccess();
    onClose();
  } catch (err) {
    toast.error((err as Error).message || "Erreur lors du remboursement");
  } finally {
    setIsRefunding(false);
  }
};
```

**Gestion d'erreur :** En cas d'erreur, un toast affiche le message d'erreur et l'opération s'arrête. Pas de rollback partiel — les articles déjà remboursés dans la boucle restent remboursés. Ce comportement est acceptable : l'admin peut relancer la modal pour les articles restants.

---

## Modifications CaisseContent

### 1. Bouton "Rembourser" dans le menu d'actions

Ajouté dans le dropdown `MoreVertical` de chaque commande.

**Visibilité :**
- Affiché si `status ∈ [PAYE, TERMINE, LIVRE, PARTIEL]`
- Masqué si `status ∈ [REMBOURSE, ANNULE, EN_ATTENTE]`

**Style :** texte rouge, icône `RotateCcw` (lucide-react)

```tsx
<DropdownItem
  key="refund"
  className="text-red-400 hover:bg-red-500/10"
  startContent={<RotateCcw className="w-4 h-4" />}
  onPress={() => {
    setOrderToRefund(order);
    setIsRefundModalOpen(true);
  }}
>
  Rembourser
</DropdownItem>
```

### 2. État dans CaisseContent

```typescript
const [orderToRefund, setOrderToRefund] = useState<Order | null>(null);
const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
```

### 3. Onglet "Remboursées"

Ajouté dans la barre de navigation des commandes (même pattern que les onglets existants).

- **Filtre :** `status = REMBOURSE`
- **Affichage :** même composant de liste que les autres onglets
- **Colonnes :** Numéro, Client/Téléphone, Montant, Date
- **Pas de bouton "Rembourser"** dans cet onglet (les commandes sont déjà remboursées)

---

## Flux complet

```
Admin ouvre une commande (PAYE/TERMINE/LIVRE/PARTIEL)
  → Clique sur ⋮ → "Rembourser"
  → Modal s'ouvre avec la liste des articles
  → Admin coche les articles à rembourser (ou tous)
  → Montant calculé s'affiche
  → Admin clique "Confirmer"
  → refundFullOrder() OU refundOrderItem() × N
  → Codes → DISPONIBLE (stock restauré)
  → Commande → REMBOURSE (si total) ou inchangée (si partiel)
  → Toast succès + router.refresh()
  → Commande apparaît dans l'onglet "Remboursées"
```

---

## Cas limites

| Cas | Comportement |
|-----|--------------|
| Commande déjà REMBOURSE | Bouton "Rembourser" non affiché, badge "Remboursé" à la place |
| Commande ANNULE | Bouton non affiché |
| Remboursement partiel | Commande reste dans son statut actuel, articles remboursés marqués |
| Erreur réseau en cours d'opération | Toast erreur, opération stoppée, articles déjà traités restent remboursés |
| Commande sans items chargés | Modal désactivée, toast "Impossible de charger les articles" |

---

## Fichiers modifiés

| Fichier | Type de modification |
|---------|---------------------|
| `src/components/admin/modals/RefundOrderModal.tsx` | Création |
| `src/app/admin/caisse/CaisseContent.tsx` (ou équivalent) | Modification : bouton + état + onglet + modal |
