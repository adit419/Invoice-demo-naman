/**
 * Transaction Status Distribution - Donut Chart
 */

import React from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import type { TransactionStatusDistribution } from '../../types/domain'

interface TransactionStatusChartProps {
  data: TransactionStatusDistribution
}

const COLORS = {
  matchedPosted: '#059669', // emerald-600 - professional green
  inTransit: '#0369a1', // sky-700 - professional blue
  exceptions: '#dc2626', // red-600 - muted red
  pendingReview: '#d97706', // amber-600 - muted amber
}

export const TransactionStatusChart: React.FC<TransactionStatusChartProps> = ({ data }) => {
  const chartData = [
    { name: 'Matched & Posted', value: data.matchedPosted, color: COLORS.matchedPosted },
    { name: 'In-Transit', value: data.inTransit, color: COLORS.inTransit },
    { name: 'Exceptions', value: data.exceptions, color: COLORS.exceptions },
    { name: 'Pending Review', value: data.pendingReview, color: COLORS.pendingReview },
  ]

  const renderCustomLabel = ({
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    percent,
    value,
    index,
  }: any) => {
    const RADIAN = Math.PI / 180

    // Position label in the center of the donut ring
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5

    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)

    // Only show label if slice is large enough (>= 5%)
    if (percent < 0.05) return null

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fontSize: 12, fontWeight: 700 }}
      >
        {`${value}%`}
      </text>
    )
  }

  const renderLegend = (props: any) => {
    const { payload } = props
    return (
      <div className="flex flex-wrap justify-center gap-4 mt-2">
        {payload.map((entry: any, index: number) => {
          // Find the corresponding data to get the value
          const dataItem = chartData.find(d => d.name === entry.value)
          return (
            <div key={`legend-${index}`} className="flex items-center gap-2" style={{ fontSize: 11 }}>
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: entry.color }}
              />
              <span style={{ color: '#475569', fontWeight: 500 }}>
                {entry.value}: <span style={{ fontWeight: 600 }}>{dataItem?.value}%</span>
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="w-full h-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={65}
            outerRadius={95}
            paddingAngle={2}
            dataKey="value"
            label={renderCustomLabel}
            labelLine={false}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => {
              // The value here is the raw data value (89, 6, 3, 2)
              // which already represents a percentage
              return value !== undefined && typeof value === 'number' ? `${value}%` : ''
            }}
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '8px 12px',
              fontSize: 12,
            }}
          />
          <Legend content={renderLegend} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
