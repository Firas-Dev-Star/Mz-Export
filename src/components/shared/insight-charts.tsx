'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatMoney, formatNumber } from '@/lib/format'
import type { MarginBreakdown, OutstandingPoint, UnitPricePoint, WeightPoint } from '@/services/insight.service'

/**
 * Graphiques complementaires a sales-chart.tsx : meme palette, memes reglages
 * d'axes et de tooltip, pour que l'ensemble reste homogene.
 */

const NAVY = '#132038'
const STEEL = '#2f5b96'
const SKY = '#5b8dd0'
const AMBER = '#b45309'
const EMERALD = '#047857'
const PALETTE = [NAVY, STEEL, SKY, '#93b4e0', '#c2d5ef']

const AXIS = { tickLine: false, axisLine: false, tick: { fontSize: 11, fill: '#64748b' } } as const
const TOOLTIP = {
  contentStyle: { borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 },
} as const

/** Poids achete contre poids vendu : le rapprochement fait a la main jusqu'ici. */
export function WeightReconciliationChart({ data }: { data: WeightPoint[] }) {
  if (data.length === 0) return null
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
        <XAxis dataKey="label" {...AXIS} />
        <YAxis width={70} {...AXIS} tickFormatter={(v: number) => formatNumber(v, 0)} />
        <Tooltip
          cursor={{ fill: 'rgba(19,32,56,0.05)' }}
          {...TOOLTIP}
          formatter={(value: number, name: string) => [`${formatNumber(value, 0)} kg`, name]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="achats" name="Achetés" fill={NAVY} radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey="ventes" name="Vendus" fill={SKY} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/**
 * Reste a encaisser par client. Les barres sont horizontales : les raisons
 * sociales sont longues et illisibles sur un axe vertical.
 */
export function OutstandingChart({ data }: { data: OutstandingPoint[] }) {
  if (data.length === 0) return null
  const currencyCode = data[0]?.currencyCode ?? 'EUR'
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 34 + 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
        <XAxis type="number" {...AXIS} tickFormatter={(v: number) => formatNumber(v, 0)} />
        <YAxis type="category" dataKey="name" width={130} {...AXIS} />
        <Tooltip
          cursor={{ fill: 'rgba(19,32,56,0.05)' }}
          {...TOOLTIP}
          formatter={(value: number) => [formatMoney(value, currencyCode), 'Reste à encaisser']}
        />
        <Bar dataKey="total" fill={AMBER} radius={[0, 4, 4, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/**
 * Resultat simplifie. Presente en barres et non en cascade : la cascade impose
 * des valeurs cumulees invisibles qui rendent le survol trompeur.
 * Les charges sont en teintes chaudes, le resultat en vert.
 */
export function MarginChart({ data }: { data: MarginBreakdown }) {
  const rows = [
    { name: 'Ventes export', value: data.ventesExport, fill: NAVY },
    { name: 'Achat fouta', value: data.achatsFouta, fill: '#7c2d12' },
    { name: 'Transport', value: data.transport, fill: AMBER },
    { name: 'Divers', value: data.divers, fill: '#a16207' },
    { name: 'Résultat', value: data.resultat, fill: data.resultat >= 0 ? EMERALD : '#b91c1c' },
  ]
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
        <XAxis dataKey="name" {...AXIS} />
        <YAxis width={80} {...AXIS} tickFormatter={(v: number) => formatNumber(v, 0)} />
        <Tooltip
          cursor={{ fill: 'rgba(19,32,56,0.05)' }}
          {...TOOLTIP}
          formatter={(value: number) => [formatMoney(value, 'TND'), 'Montant']}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={56}>
          {rows.map((row) => (
            <Cell key={row.name} fill={row.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Prix unitaire avant et apres transport : l'ecart entre les deux, c'est la marge. */
export function UnitPriceChart({ data, currencyCode = 'EUR' }: { data: UnitPricePoint[]; currencyCode?: string }) {
  if (data.length === 0) return null
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" />
        <YAxis width={70} {...AXIS} domain={['auto', 'auto']} tickFormatter={(v: number) => formatNumber(v, 2)} />
        <Tooltip
          {...TOOLTIP}
          formatter={(value: number, name: string) => [formatMoney(value, currencyCode), name]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="prixUnitaire"
          name="Prix / pièce"
          stroke={NAVY}
          strokeWidth={2}
          dot={{ r: 2 }}
        />
        <Line
          type="monotone"
          dataKey="prixHorsTransport"
          name="Hors transport"
          stroke={AMBER}
          strokeWidth={2}
          strokeDasharray="4 3"
          dot={{ r: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

/** Repartition des achats par fournisseur. */
export function SupplierShareChart({ data }: { data: Array<{ name: string; total: number }> }) {
  if (data.length === 0) return null
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={data} dataKey="total" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
          {data.map((entry, index) => (
            <Cell key={entry.name} fill={PALETTE[index % PALETTE.length]} />
          ))}
        </Pie>
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Tooltip {...TOOLTIP} formatter={(value: number, name: string) => [formatMoney(value, 'TND'), name]} />
      </PieChart>
    </ResponsiveContainer>
  )
}
