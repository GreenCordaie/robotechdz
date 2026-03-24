# Quickstart: Workflow Retours & Remboursements

**Feature**: 002-refund-return-workflow

## Test Scenarios (Manual)

### Scenario 1 — Initier un retour (P1)
1. Se connecter en tant que CAISSIER ou ADMIN
2. Aller sur `/admin/caisse`
3. Trouver une commande avec statut `PAYE` ou `LIVRE`
4. Cliquer sur le bouton "Retour / Remboursement"
5. Remplir : motif (ex: "Client insatisfait"), type = Espèces, montant = total
6. Soumettre
7. **Vérifier** : badge "En attente d'approbation" sur la commande, statut inchangé

### Scenario 2 — Approuver un retour (P2 succès)
1. Se connecter en tant que SUPER_ADMIN
2. Aller sur `/admin/caisse` → section "Retours en attente"
3. Cliquer "Approuver" sur la demande du scenario 1
4. Confirmer
5. **Vérifier** :
   - `orders.status = REMBOURSE`
   - Enregistrement dans `clientPayments` créé
   - Codes digitaux VENDU → DISPONIBLE
   - Notification Telegram reçue
   - AuditLog créé

### Scenario 3 — Approuver retour avec crédit wallet (P2 wallet)
1. Idem scenario 1 mais avec une commande liée à un client et type = "Crédit wallet"
2. Approuver en tant que SUPER_ADMIN
3. **Vérifier** : `clients.totalDetteDzd` réduit du montant remboursé

### Scenario 4 — Rejeter un retour (P2 rejet)
1. Initier un retour (scenario 1)
2. Se connecter en SUPER_ADMIN → cliquer "Rejeter"
3. Remplir motif de rejet
4. **Vérifier** : commande revenue à son statut précédent (PAYE/LIVRE), motif visible

### Scenario 5 — Tentative sur commande TERMINE (edge case)
1. Trouver une commande avec statut `TERMINE` ou `ANNULE`
2. **Vérifier** : bouton "Retour" absent ou désactivé

### Scenario 6 — Historique retours client (P3)
1. Aller sur `/admin/clients` → ouvrir une fiche client avec des retours
2. **Vérifier** : section "Retours" listant tous les retours avec statut, montant, date

### Scenario 7 — Commande anonyme (edge case)
1. Trouver une commande kiosk sans clientId
2. Initier un retour
3. **Vérifier** : option "Crédit wallet" désactivée, seul "Espèces" disponible

## Expected Database State After Scenario 2

```sql
-- orders
SELECT status, return_request FROM orders WHERE id = X;
-- status = 'REMBOURSE'
-- return_request.status = 'APPROUVE'

-- clientPayments
SELECT * FROM client_payments WHERE order_id = X;
-- 1 row: type_action = 'REMBOURSEMENT', montant_dzd = <montant>

-- auditLogs
SELECT action FROM audit_logs WHERE entity_id = 'X' AND entity_type = 'ORDER';
-- 'INITIATE_RETURN', 'APPROVE_RETURN'

-- digitalCodes (if codes existed)
SELECT status FROM digital_codes WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = X);
-- status = 'DISPONIBLE' (was VENDU)
```
