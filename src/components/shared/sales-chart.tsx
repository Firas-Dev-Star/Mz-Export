'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatMoney, formatNumber } from '@/lib/format'

const NAVY = '#132038'
const PALETTE = ['#132038', '#2f5b96', '#5b8dd0', '#93b4e0', '#c2d5ef']

export function MonthlySalesChart({
  data,
  currencyCode = 'EUR',
}: {
  data: Array<{ label: string; total: number }>
  currencyCode?: string
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={70}
          tick={{ fontSize: 11, fill: '#64748b' }}
          tickFormatter={(v: number) => formatNumber(v, 0)}
        />
        <Tooltip
          cursor={{ fill: 'rgba(19,32,56,0.05)' }}
          contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
          formatter={(value: number) => [formatMoney(value, currencyCode), 'Ventes']}
        />
        <Bar dataKey="total" fill={NAVY} radius={[4, 4, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function CustomerShareChart({
  data,
  currencyCode = 'EUR',
}: {
  data: Array<{ name: string; total: number }>
  currencyCode?: string
}) {
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
        <Tooltip
          contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
          formatter={(value: number, name: string) => [formatMoney(value, currencyCode), name]}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
