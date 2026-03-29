# Quickstart: Netflix Household Auto-Resolver

**Feature**: 009-netflix-household-resolver

---

## 1. Installer les dépendances

```bash
cd c:/Users/PC/Desktop/100-pc-IA
npm install imapflow mailparser
npm install -D @types/mailparser
```

---

## 2. Migration DB

```bash
npx drizzle-kit push
```

Ajoute la colonne `outlook_password` à `digital_codes`.

---

## 3. Fichiers à créer / modifier

### CRÉER
- `src/services/netflix-resolver.service.ts`

### MODIFIER
- `src/db/schema.ts` — +1 colonne `outlookPassword`
- `src/services/account.service.ts` — auto-PIN + outlookPassword
- `src/app/admin/comptes-partages/actions.ts` — outlookPassword + resolveHouseholdAction
- `src/app/admin/comptes-partages/SharedAccountsContent.tsx` — champ Outlook + PIN visible + bouton Résoudre
- `src/app/api/webhooks/whatsapp/route.ts` — détection keywords household

---

## 4. Tester la résolution manuelle

1. Aller sur `/admin/comptes-partages`
2. Sélectionner un slot VENDU avec mot de passe Outlook configuré
3. Cliquer "Résoudre"
4. Vérifier que le code arrive sur le WhatsApp du client

## 5. Tester la résolution automatique

1. Depuis un numéro client avec un slot actif, envoyer "foyer" sur WhatsApp
2. Vérifier que la réponse automatique arrive en moins de 2 minutes

---

## 6. Variables d'environnement

Aucune variable supplémentaire requise. Les credentials Outlook sont stockés en DB.
