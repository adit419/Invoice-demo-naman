/**
 * Exception Aging - Stacked Bar Chart
 * Shows exceptions by PSP with age buckets: 0-7d, 8-30d, 1-3m, >3m
 */

import React from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { ExceptionAgingData } from '../../types/domain'

interface ExceptionAgingChartProps {
  data: ExceptionAgingData[]
}

export const ExceptionAgingChart: React.FC<ExceptionAgingChartProps> = ({ data }) => {
  console.log('ExceptionAgingChart data:', data)

  const renderLegend = (props: any) => {
    const { payload } = props
    return (
      <div className="flex justify-center gap-4 mt-2">
        {payload.map((entry: any, index: number) => (
          <div key={`legend-${index}`} className="flex items-center gap-1.5" style={{ fontSize: 11 }}>
            <div
              className="w-2.5 h-2.5 rounded"
              style={{ backgroundColor: entry.color }}
            />
            <span style={{ color: '#64748b', fontWeight: 500 }}>{entry.value}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="w-full h-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
          barSize={60}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="pspName"
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={{ stroke: '#d1d5db' }}
          />
          <YAxis
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={{ stroke: '#d1d5db' }}
            allowDecimals={false}
            label={{
              value: 'Exceptions',
              angle: -90,
              position: 'insideLeft',
              style: { fill: '#64748b', fontSize: 11 },
            }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '8px 12px',
              fontSize: 11,
            }}
            labelStyle={{ color: '#111827', fontWeight: 600, marginBottom: 4, fontSize: 11 }}
          />
          <Legend content={renderLegend} />
          <Bar
            dataKey="age0to7Days"
            stackId="a"
            fill="#0891b2"
            name="0-7 days"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="age8to30Days"
            stackId="a"
            fill="#ca8a04"
            name="8-30 days"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="age1to3Months"
            stackId="a"
            fill="#dc2626"
            name="1-3 months"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="ageOver3Months"
            stackId="a"
            fill="#7f1d1d"
            name=">3 months"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
