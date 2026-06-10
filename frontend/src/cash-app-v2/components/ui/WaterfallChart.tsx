/**
 * Waterfall Chart Component
 *
 * Visualizes the gross-to-net fee decomposition in a clean table format
 * Shows: Gross → Deductions → Net
 */

import React from 'react'
import type { GrossToNetWaterfall } from '../../types/domain'

interface WaterfallChartProps {
  waterfall: GrossToNetWaterfall
  currency: string
  showComparison?: boolean
  compact?: boolean
}

export const WaterfallChart: React.FC<WaterfallChartProps> = ({
  waterfall,
  currency,
  showComparison = false,
  compact = false
}) => {
  const formatAmount = (amount: number): string => {
    return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const formatPercent = (percent: number): string => {
    return `${percent.toFixed(2)}%`
  }

  return (
    <div className={`${compact ? 'py-1' : 'py-2'}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h4 style={{ fontSize: compact ? 10 : 11, fontWeight: 700, color: '#101828' }}>
          Gross-to-Net Breakdown
        </h4>
        {showComparison && waterfall.l1Variance !== 0 && (
          <span
            className="px-1.5 py-0.5 rounded text-[9px] font-semibold"
            style={{ backgroundColor: '#fef2f2', color: '#dc2626' }}
          >
            Variance: {formatAmount(waterfall.l1Variance)}
          </span>
        )}
      </div>

      {/* Table Layout */}
      <table className="w-full" style={{ borderCollapse: 'collapse' }}>
        <tbody>
          {/* Gross */}
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            <td style={{ padding: '6px 0', fontSize: 10, fontWeight: 600, color: '#374151' }}>
              Gross Transaction Value
            </td>
            <td style={{ padding: '6px 0', fontSize: 10, color: '#6b7280', textAlign: 'center', width: '60px' }}>
              —
            </td>
            <td style={{ padding: '6px 0', fontSize: 11, fontWeight: 600, color: '#0369a1', fontFamily: 'monospace', textAlign: 'right' }}>
              {formatAmount(waterfall.grossTransactionValue)}
            </td>
          </tr>

          {/* MDR Fee */}
          <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
            <td style={{ padding: '6px 0', paddingLeft: '12px', fontSize: 10, color: '#6b7280' }}>
              − MDR Fee
            </td>
            <td style={{ padding: '6px 0', fontSize: 10, color: '#9ca3af', textAlign: 'center' }}>
              {formatPercent(waterfall.mdrFeePercent)}
            </td>
            <td style={{ padding: '6px 0', fontSize: 10, fontWeight: 500, color: '#dc2626', fontFamily: 'monospace', textAlign: 'right' }}>
              ({formatAmount(waterfall.mdrFee)})
            </td>
          </tr>

          {/* Tax on MDR */}
          <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
            <td style={{ padding: '6px 0', paddingLeft: '12px', fontSize: 10, color: '#6b7280' }}>
              − Tax on MDR (GST)
            </td>
            <td style={{ padding: '6px 0', fontSize: 10, color: '#9ca3af', textAlign: 'center' }}>
              {formatPercent(waterfall.taxOnMDRPercent)}
            </td>
            <td style={{ padding: '6px 0', fontSize: 10, fontWeight: 500, color: '#dc2626', fontFamily: 'monospace', textAlign: 'right' }}>
              ({formatAmount(waterfall.taxOnMDR)})
            </td>
          </tr>

          {/* FX Margin */}
          <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
            <td style={{ padding: '6px 0', paddingLeft: '12px', fontSize: 10, color: '#6b7280' }}>
              − FX Margin
            </td>
            <td style={{ padding: '6px 0', fontSize: 10, color: '#9ca3af', textAlign: 'center' }}>
              {formatPercent(waterfall.fxMarginPercent)}
            </td>
            <td style={{ padding: '6px 0', fontSize: 10, fontWeight: 500, color: '#dc2626', fontFamily: 'monospace', textAlign: 'right' }}>
              ({formatAmount(waterfall.fxMargin)})
            </td>
          </tr>

          {/* Rolling Reserve (if applicable) */}
          {waterfall.rollingReserve > 0 && (
            <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '6px 0', paddingLeft: '12px', fontSize: 10, color: '#6b7280' }}>
                − Rolling Reserve
              </td>
              <td style={{ padding: '6px 0', fontSize: 10, color: '#9ca3af', textAlign: 'center' }}>
                {formatPercent(waterfall.rollingReservePercent)}
              </td>
              <td style={{ padding: '6px 0', fontSize: 10, fontWeight: 500, color: '#dc2626', fontFamily: 'monospace', textAlign: 'right' }}>
                ({formatAmount(waterfall.rollingReserve)})
              </td>
            </tr>
          )}

          {/* Reserve Release (if applicable) */}
          {waterfall.reserveRelease > 0 && (
            <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '6px 0', paddingLeft: '12px', fontSize: 10, color: '#6b7280' }}>
                + Reserve Release
              </td>
              <td style={{ padding: '6px 0', fontSize: 10, color: '#9ca3af', textAlign: 'center' }}>
                —
              </td>
              <td style={{ padding: '6px 0', fontSize: 10, fontWeight: 500, color: '#059669', fontFamily: 'monospace', textAlign: 'right' }}>
                {formatAmount(waterfall.reserveRelease)}
              </td>
            </tr>
          )}

          {/* Expected Net */}
          <tr style={{ borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
            <td style={{ padding: '8px 0', fontSize: 10, fontWeight: 600, color: '#374151' }}>
              Expected Net
            </td>
            <td style={{ padding: '8px 0', fontSize: 10, color: '#6b7280', textAlign: 'center' }}>
              {formatPercent((waterfall.expectedNet / waterfall.grossTransactionValue) * 100)}
            </td>
            <td style={{ padding: '8px 0', fontSize: 11, fontWeight: 700, color: '#0369a1', fontFamily: 'monospace', textAlign: 'right' }}>
              {formatAmount(waterfall.expectedNet)}
            </td>
          </tr>

          {/* Actual Net (if different) */}
          {waterfall.actualNet !== waterfall.expectedNet && (
            <tr style={{ backgroundColor: '#fef2f2' }}>
              <td style={{ padding: '8px 0', fontSize: 10, fontWeight: 600, color: '#991b1b' }}>
                Actual Net (Bank Credit)
              </td>
              <td style={{ padding: '8px 0', fontSize: 10, color: '#991b1b', textAlign: 'center' }}>
                —
              </td>
              <td style={{ padding: '8px 0', fontSize: 11, fontWeight: 700, color: '#991b1b', fontFamily: 'monospace', textAlign: 'right' }}>
                {formatAmount(waterfall.actualNet)}
              </td>
            </tr>
          )}

          {/* L1 Variance (if exists) */}
          {waterfall.l1Variance !== 0 && (
            <tr style={{ backgroundColor: '#fef2f2' }}>
              <td style={{ padding: '6px 0', fontSize: 10, fontWeight: 600, color: '#dc2626' }}>
                Variance
              </td>
              <td style={{ padding: '6px 0', fontSize: 10, color: '#dc2626', textAlign: 'center' }}>
                —
              </td>
              <td style={{ padding: '6px 0', fontSize: 11, fontWeight: 700, color: '#dc2626', fontFamily: 'monospace', textAlign: 'right' }}>
                {waterfall.l1Variance > 0 ? '+' : ''}{formatAmount(waterfall.l1Variance)}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
