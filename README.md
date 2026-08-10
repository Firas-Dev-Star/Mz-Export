# MZ EXPORT — Gestion Commerciale

Application de gestion commerciale complète pour MZ EXPORT SARL (Monastir, Tunisie) :
**ventes export en euros**, **achats fournisseurs en dinars** et **gestion de stock**
avec traçabilité intégrale des mouvements.

---

## 1. Ce que fait l'application

| Module | Contenu |
|---|---|
| Tableau de bord | Ventes EUR et achats TND présentés **séparément**, encaissé, restant dû, retards, valeur du stock, alertes, ventes sur 12 mois, répartition par client |
| Clients | CRUD complet, recherche, filtres, fiche client avec CA / impayés / historique de factures |
| Fournisseurs | CRUD complet, fiche avec total des achats, réglé, restant dû et historique |
| Produits | CRUD, prix de vente EUR **et** prix d'achat TND, suivi de stock, stock minimum, NGP, origine, poids, dimensions, colisage, TVA |
| Factures de vente | Multi-lignes, remises, frais (transport / transit / assurance / autres), TVA configurable, timbre fiscal, statuts, numérotation atomique, **sortie de stock automatique** |
| Factures d'achat | Achats en dinars (3 décimales), numérotation FAC-A, TVA 19 %, timbre, règlements fournisseurs, **entrée en stock automatique** |
| Stock | État valorisé au prix d'achat, historique complet et filtrable des mouvements, ajustements manuels, alertes rupture et stock faible |
| PDF | Facture A4 reprenant la mise en page MZ EXPORT — aperçu, téléchargement, impression |
| Règlements | Clients et fournisseurs : virement / espèces / chèque / autre, statuts recalculés automatiquement |
| Rapports | Ventes et achats par mois, par client, par fournisseur, produits les plus vendus, impayés clients et fournisseurs |
| Export | Excel (.xlsx) et CSV : clients, fournisseurs, produits, factures de vente et d'achat, lignes, règlements, état du stock, mouvements |
| Paramètres | Société, banque, mentions, TVA et timbre par défaut, logo, numérotation, utilisateurs, journal d'audit |

### Ce que l'application ne fait pas

Le module **expéditions** (suivi logistique détaillé des envois) n'est pas implémenté.
Les informations de transport figurent en revanche sur chaque facture de vente
(incoterm, colisage, poids, port de départ, destination).

> **Avertissement fiscal.** Ce logiciel ne garantit aucune conformité fiscale ou douanière
> tunisienne ou européenne. Les taux de TVA, le timbre fiscal et les mentions légales sont
> **entièrement configurables** et doivent être validés par le comptable de l'entreprise.

---

## 2. Stack technique

- **Next.js 15** (App Router, Server Components, Server Actions) + **React 19** + **TypeScript strict**
- **Tailwind CSS 3** + composants de type shadcn/ui (Radix UI, CVA) + **Lucide Icons**
- **PostgreSQL** + **Prisma 7** (adaptateur `pg`, moteur WASM — pas de binaire Rust)
- **Zod** (validation client *et* serveur) + **React Hook Form**
- **decimal.js** pour tous les calculs monétaires
- **@react-pdf/renderer** pour les PDF, **ExcelJS** pour les exports
- **Recharts** pour les graphiques, **Vitest** pour les tests
- Authentification maison : sessions **JWT signées (jose)** dans un cookie `httpOnly`, mots de passe **bcrypt**

---

## 3. Démarrage rapide

### Prérequis
Node.js 20+ et une base PostgreSQL 14+.

### Installation

```bash
npm install
cp .env.example .env      # puis renseignez les variables
npx prisma generate
npx prisma migrate deploy # applique les deux migrations
npm run db:seed
npm run dev
```

Le seed ne crée **que les données réelles indispensables** : les deux devises (EUR, TND),
les paramètres de la société repris de la facture papier, les deux séquences de
numérotation et le compte administrateur. Aucun client, produit, fournisseur ni facture
de démonstration n'est créé — tout se saisit depuis l'application via les boutons
« Nouveau client », « Nouveau produit », « Nouvel achat », « Nouvelle facture »…

Le script est idempotent : le rejouer ne duplique rien et n'écrase pas les paramètres
déjà modifiés depuis l'interface.

### Mise à jour depuis la version « facturation clients »

Si vous aviez déjà installé la première version, une seconde migration ajoute les
fournisseurs, les achats et le stock **sans toucher aux données existantes** :

```bash
npm install
npx prisma generate
npx prisma migrate deploy
```

Les produits déjà créés démarrent avec un stock à zéro, un prix d'achat à zéro et
le suivi de stock activé. Renseignez leur prix d'achat et leur stock minimum dans la
fiche produit, puis constituez le stock initial soit par une facture d'achat, soit par
un ajustement manuel (Stock → Ajuster le stock).

### Nettoyer d'anciennes données de démonstration

Si une version antérieure du seed a rempli votre base avec des données de démonstration
(client WIDA IMPORT, produit FOUTA COTON, facture n° 49, fournisseur SOTEX, achat
FAC-A-0001…), ouvrez **Paramètres → Données de démonstration** et cliquez sur
« Supprimer les données de démonstration ».

L'opération supprime, dans une seule transaction : les factures de vente et d'achat
marquées « démo » avec leurs lignes et règlements, les mouvements de stock qu'elles ont
générés, puis les clients, fournisseurs et produits « démo » devenus orphelins.
Le stock de chaque produit conservé est ensuite **recalculé à partir des mouvements
restants**. Si un produit conservé avait été approvisionné par un achat de démonstration
mais reste vendu par un document réel, son stock devient négatif : l'application vous le
signale nommément pour que vous régularisiez par un ajustement.

Les paramètres de société, les utilisateurs et la numérotation ne sont jamais touchés.

L'application est disponible sur http://localhost:3000.

### Variables d'environnement

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Connexion applicative (pooler en production) |
| `DIRECT_URL` | Connexion directe, utilisée par les migrations Prisma |
| `AUTH_SECRET` | Clé de signature des sessions — `openssl rand -base64 48` |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Compte administrateur créé par le seed |

**Ne committez jamais le fichier `.env`.** Il est déjà dans `.gitignore`.

### Compte par défaut

Le seed crée un administrateur avec les identifiants de `.env`
(par défaut `admin@mzexport.tn`). **Changez ce mot de passe dès la première connexion**
depuis Paramètres → Utilisateurs.

### Commandes

```bash
npm run dev          # serveur de développement
npm run build        # build de production (lance prisma generate)
npm run start        # serveur de production
npm run lint         # ESLint
npm run test         # Vitest (calculs, TVA, timbre, numérotation, montants en lettres)
npm run db:migrate   # nouvelle migration
npm run db:seed      # données initiales + démonstration
npm run db:studio    # explorateur de base Prisma Studio
```

---

## 4. Règles métier importantes

### Devises
Les ventes export sont libellées en **EUR** (2 décimales), les achats en **TND**
(3 décimales, les millimes sont conservés). L'application **n'additionne jamais deux
devises** : tous les cumuls (tableau de bord, rapports, listes) sont regroupés par code
devise, affichés dans des blocs distincts, et la devise accompagne toujours le montant.
Le moteur de calcul reçoit la précision de la devise en paramètre — un montant en dinars
n'est jamais arrondi au centime.

### Frais : compris ou ajoutés
La facture papier n° 49 de MZ EXPORT applique la logique suivante :
6 615 kg × 2,00 € = 13 230 €, dont 13 000 € de marchandise, 200 € de transport et 30 € de transit.
Les frais sont donc **compris dans le prix unitaire**, pas ajoutés.

Chaque facture propose les deux modes :

- **Compris dans le prix** (défaut) — les frais servent uniquement à produire la mention
  « CE PRIX S'APPLIQUE : … » ; `Total HT = total des lignes`.
- **Ajoutés au total marchandise** — `Total HT = total des lignes + frais`.

La mention affiche **toujours** marchandise, transport et transit (même à zéro) ; assurance et
autres frais n'apparaissent que s'ils sont renseignés. Le texte reste modifiable manuellement.

### TVA et timbre fiscal
Trois régimes : **exonéré (export)**, **TVA 0 %**, **TVA au taux défini**.
Des raccourcis 19 % / 13 % / 7 % sont proposés dans le formulaire.
Le **timbre fiscal** (bouton « + 1 € ») s'ajoute **après** la TVA :

```
Total HT  →  + TVA  →  Montant TTC  →  + Timbre  →  Net à payer
```

### Calculs monétaires
Aucun montant n'est calculé avec un `number` JavaScript. Tout passe par `decimal.js`
(`src/lib/money.ts`) et est stocké en colonnes `DECIMAL` PostgreSQL.
La fonction de calcul `computeInvoiceTotals` (`src/lib/invoice-totals.ts`) est **partagée**
entre l'aperçu du navigateur et l'enregistrement serveur — mais **seul le serveur fait foi** :
les totaux envoyés par le client sont systématiquement ignorés et recalculés.

### Numérotation
- Un **brouillon ne consomme aucun numéro** (identifiant provisoire `BROUILLON-XXXXXXXX`).
- Le numéro définitif est attribué **à la confirmation**, via un `SELECT … FOR UPDATE`
  à l'intérieur de la transaction : deux utilisateurs simultanés ne peuvent pas obtenir
  le même numéro (vérifié par test de concurrence).
- La séquence est initialisée à **50**, dans la continuité de la facture papier n° 49.
  Format, préfixe, longueur et année sont modifiables dans Paramètres → Numérotation
  (par exemple `FAC-V-0001`).

### Stock

**Règle absolue : la quantité en stock d'un produit n'est jamais modifiée sans qu'un
mouvement soit enregistré dans la même transaction.** Tout passe par `applyStockMovement`
(`src/lib/stock.ts`), qui verrouille la ligne produit (`SELECT … FOR UPDATE`) avant d'écrire.

Six types de mouvement : entrée achat, sortie vente, ajustement positif, ajustement négatif,
retour client, retour fournisseur. Chaque mouvement conserve le **stock résultant**, le
document d'origine, le motif et l'utilisateur.

- **Validation d'un achat** → entrée en stock des lignes rattachées à un produit.
- **Confirmation d'une facture de vente** → contrôle de disponibilité puis sortie de stock.
  Si le stock est insuffisant, la confirmation échoue avec le détail :
  *« Stock insuffisant pour FOUTA COTON. Stock disponible : 100 KG. Quantité demandée : 150 KG »*.
- **Annulation d'un document** → les mouvements sont **contre-passés**, jamais supprimés :
  l'historique reste complet et vérifiable.

Un produit peut être marqué « non suivi en stock » (service, prestation) : il ne génère
alors aucun mouvement et n'apparaît pas dans les alertes. Les lignes libres, sans produit
rattaché, n'affectent jamais le stock.

Trois niveaux sont affichés : **rupture** (stock ≤ 0), **stock faible** (stock ≤ stock minimum)
et **stock normal**. La valorisation se fait au prix d'achat, en dinars.

### Cycle de vie d'une facture

```
BROUILLON → CONFIRMÉE → PARTIELLEMENT PAYÉE → PAYÉE
                ↓                ↓
             ANNULÉE         EN RETARD
```

Le même cycle s'applique aux factures d'achat.

- Un brouillon est librement modifiable et supprimable ; il ne consomme aucun numéro
  et n'a aucun effet sur le stock.
- Une facture confirmée n'est **ni modifiable ni supprimable** : elle porte un numéro
  définitif et a déjà impacté le stock. Pour la corriger : annuler puis dupliquer.
- Une facture comportant des règlements ne peut pas être annulée tant que ceux-ci
  n'ont pas été supprimés.
- Un client, un fournisseur ou un produit rattaché à un document est **désactivé**
  et non supprimé.

### Transactions
La création, la modification, la confirmation et l'annulation d'une facture de vente ou
d'achat, l'enregistrement et la suppression d'un règlement, ainsi que tout ajustement de
stock s'exécutent dans une transaction PostgreSQL unique (contrôle de stock, numéro, lignes,
totaux, mouvements de stock, quantités produits, statut, journal d'audit).
En cas d'échec à n'importe quelle étape : `ROLLBACK` complet, aucune écriture partielle.

---

## 5. Rôles et sécurité

| Permission | ADMIN | MANAGER | USER |
|---|:--:|:--:|:--:|
| Consulter clients / fournisseurs / produits / factures / stock | ✅ | ✅ | ✅ |
| Créer et modifier clients / fournisseurs / produits | ✅ | ✅ | — |
| Créer et modifier des factures de vente | ✅ | ✅ | ✅ |
| Créer et modifier des factures d'achat | ✅ | ✅ | — |
| Confirmer / annuler une facture (vente ou achat) | ✅ | ✅ | — |
| Ajuster le stock manuellement | ✅ | ✅ | — |
| Enregistrer des règlements | ✅ | ✅ | — |
| Rapports et exports | ✅ | ✅ | — |
| Paramètres et utilisateurs | ✅ | lecture | — |
| Suppressions définitives | ✅ | — | — |

Mesures en place : sessions JWT `httpOnly` + `SameSite=Lax` (`Secure` en production),
mots de passe bcrypt (12 tours), middleware de protection des routes, **vérification du rôle
refaite côté serveur dans chaque action** (le middleware seul n'est jamais considéré suffisant),
validation Zod systématique côté serveur, requêtes paramétrées via Prisma (pas d'injection SQL),
échappement React (pas de XSS), Server Actions Next.js (protection CSRF intégrée),
message d'erreur générique à la connexion (pas d'énumération d'emails),
journal d'audit horodaté avec adresse IP.

---

## 6. Arborescence

```
prisma/
  schema.prisma            modèles et enums
  migrations/              20260810120000_init  +  20260810130000_purchases_stock
  seed.ts                  société, devises, séquences, admin — données réelles uniquement
src/
  app/
    (app)/                 pages authentifiées (layout + sidebar)
      dashboard/ customers/ suppliers/ products/ invoices/ purchases/
      stock/ payments/ reports/ settings/
    api/                   auth, PDF de facture, exports Excel/CSV
    login/
  actions/                 Server Actions (mutations, validées et journalisées)
  components/
    ui/                    primitives (button, input, table, dialog, toast…)
    layout/ shared/        sidebar, en-têtes, recherche, pagination, graphiques
    customers/ suppliers/ products/ invoices/ purchases/ stock/ payments/ settings/
  lib/                     money, invoice-totals, stock, stock-labels, format, auth, session,
                           audit, numbering, number-to-words-fr, price-breakdown, errors, prisma
  services/                accès données, préparation des documents, maintenance
  validations/             schémas Zod partagés client / serveur
tests/                     Vitest — calculs, TVA, timbre, stock, numérotation, montants en lettres
```

---

## 7. Le PDF de facture

Le PDF reproduit la structure de la facture MZ EXPORT : en-tête société encadré,
bloc client encadré, adresse de livraison, tableau `Qté | Désignation | P.U. | Total`,
bloc des informations export (NGP, origine, colisage, poids, incoterm, mode de paiement),
coordonnées bancaires, totaux, ventilation du prix, montant en toutes lettres et pied de page.

**Aucun cachet ni signature manuscrite n'est généré.**

Un filigrane « BROUILLON » ou « ANNULÉE » apparaît selon le statut.
Le logo est stocké **en base64 dans la base de données** (et non sur le disque) : l'upload
fonctionne donc aussi sur un hébergement sans système de fichiers persistant comme Vercel.

Trois accès depuis la fiche facture : **Aperçu / Imprimer** (rendu HTML A4 imprimable),
**Voir le PDF** (ouverture dans un onglet) et **Télécharger**.

---

## 8. Déploiement

### Base de données (Supabase ou tout PostgreSQL)
1. Créez le projet et récupérez les deux chaînes de connexion.
2. `DATABASE_URL` → connexion *pooler* (port 6543 chez Supabase, avec `?pgbouncer=true`).
3. `DIRECT_URL` → connexion *directe* (port 5432), utilisée par les migrations.
4. Appliquez le schéma : `npx prisma migrate deploy`.
5. Initialisez les données : `npm run db:seed`.

### Application (Vercel)
1. Poussez le dépôt sur GitHub puis importez-le dans Vercel.
2. Renseignez `DATABASE_URL`, `DIRECT_URL` et `AUTH_SECRET` dans les variables
   d'environnement du projet (jamais dans le code).
3. La commande de build par défaut suffit : `npm run build` exécute `prisma generate`.

### Sauvegarde et restauration

```bash
# Sauvegarde complète
pg_dump "$DATABASE_URL" -Fc -f sauvegarde-mz-export-$(date +%F).dump

# Restauration
pg_restore -d "$DATABASE_URL" --clean --if-exists sauvegarde-mz-export-2026-08-10.dump
```

Sur Supabase, des sauvegardes automatiques quotidiennes sont disponibles selon le plan.
Il est recommandé de planifier un `pg_dump` hebdomadaire conservé hors du serveur,
et de tester la restauration au moins une fois par trimestre.
*Une interface de sauvegarde/restauration intégrée à l'application n'est pas implémentée :
ces opérations passent par les outils PostgreSQL ci-dessus.*

---

## 9. Points de vigilance

- **Informations à vérifier.** Certaines données de la facture scannée sont partiellement
  lisibles (numéros de téléphone et de fax notamment). Elles ont été saisies au plus proche
  et sont **toutes modifiables** dans Paramètres → Société. Aucune information illisible
  n'a été inventée.
- **Référence produit `6615`.** Sur la facture papier, `6615` figure dans la colonne
  « Qté/KG » — c'est la **quantité en kilogrammes**. Elle a également été reprise comme
  référence produit selon votre indication ; modifiez-la dans la fiche produit si vous
  utilisez une autre codification.
- **Données de démonstration.** Le seed n'en crée plus. Si votre base en contient encore
  (ancien seed), nettoyez-la depuis Paramètres → Données de démonstration.
- **Reprise du stock existant.** Le stock initial doit être constitué explicitement
  (facture d'achat ou ajustement manuel). L'application ne devine jamais un stock :
  toute quantité provient d'un mouvement enregistré.
- **Vulnérabilités npm.** `npm audit` signale des alertes transitives provenant de
  dépendances internes à Next.js et à ExcelJS. Elles ne sont pas corrigeables sans
  changement de version majeure et ne concernent pas le code applicatif.

---

## 10. Tests

```bash
npm run test
```

74 tests couvrent : totaux de ligne (`100 × 2 EUR = 200 EUR`, `100 × 35 TND = 3 500 TND`,
`6 615 × 2,00 € = 13 230,00 €`), remises, arrondis au centime et au millime, absence
d'erreurs de virgule flottante, saisie au format français, frais compris / ajoutés,
TVA 19 % / 13 % / 7 % / 0 % / exonéré, timbre fiscal, précision distincte EUR (2 déc.)
et TND (3 déc.), sens des mouvements de stock, niveaux rupture / faible / normal,
chaîne `1000 → +500 → −250 = 1250`, soldes et transitions de statut, formats de
numérotation vente et achat, conversion des montants en toutes lettres.

Vérifications complémentaires effectuées en conditions réelles sur PostgreSQL :
numérotation atomique sous concurrence (5 confirmations simultanées → 5 numéros distincts),
achat validé → entrée en stock, vente confirmée → sortie de stock, blocage d'une vente
sur stock insuffisant, annulations → contre-passation, invariant *stock = somme des
mouvements*, cycle règlement partiel → soldé, génération du PDF, exports Excel et CSV.
