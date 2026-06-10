/**
 * Open AR Detail Modal
 * Shows breakdown of open AR by category and age buckets
 * Categories: No PSP File, Amount Mismatch, Not in OMS
 */

import React from 'react'
import { X, AlertCircle, FileX, TrendingUp, Database } from 'lucide-react'
import type { OpenARSummary } from '../../types/domain'

interface OpenARDetailModalProps {
  data: OpenARSummary
  isOpen: boolean
  onClose: () => void
  onViewDetails?: (category: string) => void
}

export const OpenARDetailModal: React.FC<OpenARDetailModalProps> = ({
  data,
  isOpen,
  onClose,
  onViewDetails
}) => {
  if (!isOpen) return null

  const formatCurrency = (amount: number): string => {
    return `${data.currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'no_psp_file':
        return <FileX size={18} className="text-slate-600" />
      case 'amount_mismatch':
        return <TrendingUp size={18} className="text-sky-600" />
      case 'not_in_oms':
        return <Database size={18} className="text-amber-600" />
      default:
        return <AlertCircle size={18} />
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'no_psp_file':
        return '#475569' // slate-600
      case 'amount_mismatch':
        return '#0369a1' // sky-700
      case 'not_in_oms':
        return '#d97706' // amber-600
      default:
        return '#64748b'
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: 8,
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.15)',
          maxWidth: 800,
          width: '100%',
          maxHeight: '85vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: '#101828', marginBottom: 2 }}>
              Open AR Breakdown
            </h2>
            <p style={{ fontSize: 10, color: '#64748b' }}>
              Cumulative open items · All time
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ padding: 4, borderRadius: 4, border: 'none', background: 'transparent', cursor: 'pointer' }}
            className="hover:bg-gray-100"
          >
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        <div style={{ padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Summary */}
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ flex: 1, backgroundColor: '#f8fafc', borderRadius: 6, padding: '10px 12px', border: '1px solid #e2e8f0' }}>
              <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>
                Total Items
              </p>
              <p style={{ fontSize: 20, fontWeight: 700, color: '#0369a1' }}>
                {data.totalCount.toLocaleString()}
              </p>
            </div>
            <div style={{ flex: 1, backgroundColor: '#f8fafc', borderRadius: 6, padding: '10px 12px', border: '1px solid #e2e8f0' }}>
              <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>
                Total Amount
              </p>
              <p style={{ fontSize: 20, fontWeight: 700, color: '#0369a1' }}>
                {formatCurrency(data.totalAmount)}
              </p>
            </div>
          </div>

          {/* Breakdown Table */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', padding: '8px 10px', textAlign: 'left' }}>
                      Category
                    </th>
                    <th style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', padding: '8px 10px', textAlign: 'center' }}>
                      0-7d
                    </th>
                    <th style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', padding: '8px 10px', textAlign: 'center' }}>
                      8-30d
                    </th>
                    <th style={{ fontSize: 9, fontWeight: 600, color: '#d97706', textTransform: 'uppercase', padding: '8px 10px', textAlign: 'center' }}>
                      31+d
                    </th>
                    <th style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', padding: '8px 10px', textAlign: 'right' }}>
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.breakdown.map((category) => (
                    <tr key={category.category} style={{ borderBottom: '1px solid #f1f5f9' }} className="hover:bg-slate-50">
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {getCategoryIcon(category.category)}
                          <span style={{ fontSize: 11, fontWeight: 500, color: getCategoryColor(category.category) }}>
                            {category.categoryLabel}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        <p style={{ fontSize: 10, fontWeight: 600, color: '#374151' }}>{category.age0to7Days.count.toLocaleString()}</p>
                        <p style={{ fontSize: 9, color: '#64748b', fontFamily: 'monospace' }}>{formatCurrency(category.age0to7Days.amount)}</p>
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        <p style={{ fontSize: 10, fontWeight: 600, color: '#374151' }}>{category.age8to30Days.count.toLocaleString()}</p>
                        <p style={{ fontSize: 9, color: '#64748b', fontFamily: 'monospace' }}>{formatCurrency(category.age8to30Days.amount)}</p>
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', backgroundColor: '#fffbeb' }}>
                        <p style={{ fontSize: 10, fontWeight: 600, color: '#92400e' }}>{category.age31PlusDays.count.toLocaleString()}</p>
                        <p style={{ fontSize: 9, color: '#92400e', fontFamily: 'monospace' }}>{formatCurrency(category.age31PlusDays.amount)}</p>
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: '#0369a1' }}>{category.totalCount.toLocaleString()}</p>
                        <p style={{ fontSize: 10, color: '#0369a1', fontFamily: 'monospace', fontWeight: 600 }}>{formatCurrency(category.totalAmount)}</p>
                      </td>
                    </tr>
                  ))}
                  {/* Total Row */}
                  <tr style={{ backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 600, fontSize: 10, color: '#374151' }}>TOTAL</td>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#374151' }}>{data.breakdown.reduce((sum, cat) => sum + cat.age0to7Days.count, 0).toLocaleString()}</p>
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#374151' }}>{data.breakdown.reduce((sum, cat) => sum + cat.age8to30Days.count, 0).toLocaleString()}</p>
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center', backgroundColor: '#fffbeb' }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#92400e' }}>{data.breakdown.reduce((sum, cat) => sum + cat.age31PlusDays.count, 0).toLocaleString()}</p>
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#0369a1' }}>{data.totalCount.toLocaleString()}</p>
                      <p style={{ fontSize: 10, color: '#0369a1', fontFamily: 'monospace', fontWeight: 700 }}>{formatCurrency(data.totalAmount)}</p>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Info Footer */}
          <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 10px', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <AlertCircle size={14} style={{ color: '#d97706', marginTop: 1, flexShrink: 0 }} />
            <p style={{ fontSize: 10, color: '#92400e', lineHeight: 1.5 }}>
              Open items from beginning of time. Items close when: PSP file arrives, amounts reconcile, or OMS records are created.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
