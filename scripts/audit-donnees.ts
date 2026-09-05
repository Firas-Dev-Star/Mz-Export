import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

/**
 * Inventaire de ce qui reste a renseigner dans l'application.
 *
 * Ne modifie RIEN : il lit et il liste. Chaque manque est classe par ce qu'il
 * empeche concretement, pas par ordre alphabetique :
 *
 *   BLOQUANT   ce qui sort imprime sur un document remis a un tiers, ou ce qui
 *              fausse un calcul. A renseigner avant de produire une facture.
 *   COMPTABLE  ce que le comptable reclamera dans le classeur d'export.
 *   UTILE      ce qui ameliore le suivi sans rien empecher.
 *
 * A relancer apres chaque campagne de saisie pour voir ce qui reste.
 *
 * USAGE
 *   npx tsx --require ./scripts/_neutraliser-server-only.cjs scripts/audit-donnees.ts
 */

type Niveau = 'BLOQUANT' | 'COMPTABLE' | 'UTILE'

interface Manque {
  niveau: Niveau
  ou: string
  quoi: string
  detail: string
}

const manques: Manque[] = []

function signaler(niveau: Niveau, ou: string, quoi: string, detail: string) {
  manques.push({ niveau, ou, quoi, detail })
}

/** Champ vide : chaine blanche, ou zero pour un montant. */
function vide(v: unknown) {
  if (v === null || v === undefined) return true
  const s = String(v).trim()
  return s === '' || s === '0' || s === '0.000' || s === '0.0000'
}

async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL / DIRECT_URL manquant')

  console.log(`Base : ${connectionString.includes('127.0.0.1') ? 'LOCALE' : 'SUPABASE'}\n`)
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

  try {
    // ---------------------------------------------------------------- societe
    const societe = await prisma.company.findUnique({ where: { id: 'company' } })
    if (!societe) {
      signaler('BLOQUANT', 'Paramètres', 'fiche société', 'absente')
    } else {
      const imprimes: Array<[string, unknown, string]> = [
        ['matricule fiscal', societe.taxId, "obligatoire sur toute facture tunisienne"],
        ['registre de commerce', societe.tradeRegister, 'mention legale des factures'],
        ['adresse', societe.addressLine1, "en-tete de vos factures"],
        ['ville', societe.city, "en-tete de vos factures"],
        ['telephone', societe.phone, 'en-tete de vos factures'],
        ['email', societe.email, 'en-tete de vos factures'],
      ]
      for (const [nom, valeur, pourquoi] of imprimes) {
        if (vide(valeur)) signaler('BLOQUANT', 'Paramètres › Société', nom, pourquoi)
      }
      const banque: Array<[string, unknown]> = [
        ['banque', societe.bankName],
        ['RIB / compte', societe.bankAccount],
        ['IBAN', societe.iban],
        ['SWIFT', societe.swift],
      ]
      for (const [nom, valeur] of banque) {
        if (vide(valeur)) {
          signaler('BLOQUANT', 'Paramètres › Banque', nom, "sans coordonnees bancaires, un client export ne peut pas vous payer")
        }
      }
      if (vide(societe.legalForm)) signaler('UTILE', 'Paramètres › Société', 'forme juridique', 'mention legale')
      if (vide(societe.capital)) signaler('UTILE', 'Paramètres › Société', 'capital', 'mention legale')
      if (vide(societe.logoPath)) signaler('UTILE', 'Paramètres › Société', 'logo', 'en-tete des PDF')
      if (vide(societe.defaultIncoterm)) signaler('UTILE', 'Paramètres › Défauts', 'incoterm par defaut', 'prerempli les nouvelles factures export')
      if (vide(societe.legalMentions)) signaler('UTILE', 'Paramètres › Mentions', 'mentions legales', 'pied de vos factures')
      if (vide(societe.paymentNotice)) signaler('UTILE', 'Paramètres › Mentions', 'avis de paiement', 'pied de vos factures')
    }

    // -------------------------------------------------------------- referentiel
    const clients = await prisma.customer.findMany({
      select: { code: true, companyName: true, taxId: true, addressLine1: true, city: true, country: true, email: true },
      orderBy: { companyName: 'asc' },
    })
    for (const c of clients) {
      const trous: string[] = []
      if (vide(c.addressLine1)) trous.push('adresse')
      if (vide(c.city)) trous.push('ville')
      if (vide(c.country)) trous.push('pays')
      if (vide(c.taxId)) trous.push('identifiant fiscal')
      if (trous.length > 0) {
        signaler('BLOQUANT', `Client ${c.companyName}`, trous.join(', '), "figure sur la facture de vente et sur les pieces douanieres")
      }
      if (vide(c.email)) signaler('UTILE', `Client ${c.companyName}`, 'email', 'envoi des factures')
    }

    const fournisseurs = await prisma.supplier.findMany({
      select: { companyName: true, taxId: true, addressLine1: true, city: true },
      orderBy: { companyName: 'asc' },
    })
    for (const f of fournisseurs) {
      const trous: string[] = []
      if (vide(f.taxId)) trous.push('matricule fiscal')
      if (vide(f.addressLine1)) trous.push('adresse')
      if (trous.length > 0) {
        signaler('COMPTABLE', `Fournisseur ${f.companyName}`, trous.join(', '), "colonne « Matricule fiscal » du classeur comptable")
      }
    }

    const transporteurs = await prisma.carrier.findMany({
      select: { companyName: true, taxId: true, addressLine1: true, phone: true },
      orderBy: { companyName: 'asc' },
    })
    for (const t of transporteurs) {
      const trous: string[] = []
      if (vide(t.taxId)) trous.push('matricule fiscal')
      if (vide(t.addressLine1)) trous.push('adresse')
      if (vide(t.phone)) trous.push('telephone')
      if (trous.length > 0) {
        signaler('COMPTABLE', `Transporteur ${t.companyName}`, trous.join(', '), 'onglet Transport du classeur comptable')
      }
    }

    const produits = await prisma.product.findMany({
      select: {
        reference: true, salePriceEur: true, purchasePriceTnd: true, minStock: true,
        unitWeightKg: true, ngp: true, unitsPerPackage: true, trackStock: true,
      },
      orderBy: { reference: 'asc' },
    })
    for (const p of produits) {
      if (vide(p.salePriceEur)) {
        signaler('UTILE', `Produit ${p.reference}`, 'prix de vente catalogue', 'prerempli les lignes de facture ; vos prix varient par client')
      }
      if (vide(p.purchasePriceTnd)) {
        signaler('COMPTABLE', `Produit ${p.reference}`, "prix d'achat", 'valorisation du stock')
      }
      if (p.trackStock && vide(p.minStock)) {
        signaler('UTILE', `Produit ${p.reference}`, 'stock minimum', "aucune alerte de reapprovisionnement sans seuil")
      }
      if (vide(p.unitWeightKg)) {
        signaler('COMPTABLE', `Produit ${p.reference}`, 'poids unitaire', 'rapprochement poids achats / ventes')
      }
      if (vide(p.ngp)) {
        signaler('BLOQUANT', `Produit ${p.reference}`, 'code NGP', 'code douanier exige a l\'export')
      }
      if (vide(p.unitsPerPackage)) {
        signaler('UTILE', `Produit ${p.reference}`, 'unites par colis', 'calcul automatique du nombre de colis')
      }
    }

    // ------------------------------------------------------------------ devises
    // Le taux vit dans l'historique `exchange_rates`, pas sur la devise : on
    // regarde s'il existe au moins un taux, et de quand il date.
    const devises = await prisma.currency.findMany({
      where: { isActive: true, code: { not: 'TND' } },
      select: {
        code: true,
        exchangeRates: {
          orderBy: { validFrom: 'desc' },
          take: 1,
          select: { rateToTnd: true, validFrom: true },
        },
      },
      orderBy: { code: 'asc' },
    })
    for (const d of devises) {
      const dernier = d.exchangeRates[0]
      if (!dernier) {
        signaler('BLOQUANT', `Devise ${d.code}`, 'aucun taux de reference',
          "le taux ne sera pas preremplli a la saisie d'une facture")
        continue
      }
      const jours = Math.floor((Date.now() - dernier.validFrom.getTime()) / 86400000)
      if (jours > 31) {
        signaler('UTILE', `Devise ${d.code}`, `taux vieux de ${jours} jours`,
          `dernier taux ${Number(dernier.rateToTnd).toFixed(6)} au ${dernier.validFrom.toISOString().slice(0, 10)}`)
      }
    }

    // --------------------------------------------------------------- documents
    const [docs, ventes, achats, transports] = await Promise.all([
      prisma.document.groupBy({ by: ['kind'], _count: true }),
      prisma.invoice.count({ where: { status: { notIn: ['DRAFT', 'CANCELLED'] } } }),
      prisma.purchase.count({ where: { status: { notIn: ['DRAFT', 'CANCELLED'] } } }),
      prisma.transportInvoice.count({ where: { status: { notIn: ['DRAFT', 'CANCELLED'] } } }),
    ])
    const total = docs.reduce((a, d) => a + d._count, 0)
    if (total === 0) {
      signaler(
        'COMPTABLE',
        'Pièces justificatives',
        `aucun document stocke`,
        `${achats} facture(s) d'achat, ${transports} de transport et ${ventes} de vente sans PDF joint — ce sont les originaux qui ont valeur probante`,
      )
    }

    // ---------------------------------------------------------- reglements dus
    const [dusFournisseurs, dusTransport] = await Promise.all([
      prisma.purchase.aggregate({
        where: { status: { notIn: ['DRAFT', 'CANCELLED'] }, balanceDue: { gt: 0 } },
        _sum: { balanceDue: true }, _count: true,
      }),
      prisma.transportInvoice.aggregate({
        where: { status: { notIn: ['DRAFT', 'CANCELLED'] }, balanceDue: { gt: 0 } },
        _sum: { balanceDue: true }, _count: true,
      }),
    ])
    if (dusFournisseurs._count > 0) {
      signaler('COMPTABLE', 'Règlements fournisseurs', `${dusFournisseurs._count} facture(s) sans reglement`,
        `${Number(dusFournisseurs._sum.balanceDue).toFixed(3)} DT affiches comme dus`)
    }
    if (dusTransport._count > 0) {
      signaler('COMPTABLE', 'Règlements transporteurs', `${dusTransport._count} facture(s) sans reglement`,
        `${Number(dusTransport._sum.balanceDue).toFixed(3)} DT affiches comme dus`)
    }

    // ------------------------------------------------------------ utilisateurs
    const users = await prisma.user.findMany({ select: { name: true, email: true, role: true, isActive: true } })
    console.log(`Comptes : ${users.map((u) => `${u.name} (${u.role}${u.isActive ? '' : ', inactif'})`).join(' · ')}\n`)

    // ------------------------------------------------------------------ sortie
    const ordre: Niveau[] = ['BLOQUANT', 'COMPTABLE', 'UTILE']
    const titres: Record<Niveau, string> = {
      BLOQUANT: 'A RENSEIGNER AVANT DE PRODUIRE UNE FACTURE',
      COMPTABLE: 'RECLAME PAR LE COMPTABLE',
      UTILE: 'AMELIORE LE SUIVI, N\'EMPECHE RIEN',
    }
    for (const niveau of ordre) {
      const liste = manques.filter((m) => m.niveau === niveau)
      console.log(`--- ${titres[niveau]} (${liste.length}) ---`)
      if (liste.length === 0) console.log('  rien a signaler')
      for (const m of liste) {
        console.log(`  ${m.ou}`)
        console.log(`      ${m.quoi} — ${m.detail}`)
      }
      console.log('')
    }
    console.log(`Total : ${manques.length} point(s).`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(`\nECHEC : ${e.message}`)
  process.exit(1)
})
