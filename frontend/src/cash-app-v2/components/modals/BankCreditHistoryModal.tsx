/**
 * Bank Credit History Modal
 * Shows historical bank credit collection data with date selection
 * Professional, subdued enterprise styling
 */

import React, { useState, useMemo } from 'react'
import { X, Calendar, Landmark, TrendingUp, TrendingDown, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'

interface DailyBankCredit {
  date: string
  dateDisplay: string
  totalAmount: number
  currency: string
  grabpayAmount: number
  stripeAmount: number
  creditCount: number
  reconciledCount: number
  reconciledPct: number
}

interface BankCreditHistoryModalProps {
  isOpen: boolean
  onClose: () => void
  historicalData: DailyBankCredit[]
  currency: string
}

export const BankCreditHistoryModal: React.FC<BankCreditHistoryModalProps> = ({
  isOpen,
  onClose,
  historicalData,
  currency
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(historicalData[0]?.date || '')
  const [viewMode, setViewMode] = useState<'daily' | 'weekly'>('daily')
  const [loading, setLoading] = useState(false)

  const selectedData = useMemo(() => {
    return historicalData.find(d => d.date === selectedDate) || historicalData[0]
  }, [historicalData, selectedDate])

  const formatCurrency = (amount: number): string => {
    if (amount >= 1000000) {
      return `${currency} ${(amount / 1000000).toFixed(2)}M`
    } else if (amount >= 1000) {
      return `${currency} ${(amount / 1000).toFixed(0)}K`
    }
    return `${currency} ${amount.toLocaleString()}`
  }

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const formatDayOfWeek = (dateStr: string): string => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-GB', { weekday: 'short' })
  }

  // Calculate trend vs previous day
  const getTrend = (currentIdx: number): number | null => {
    if (currentIdx >= historicalData.length - 1) return null
    const current = historicalData[currentIdx].totalAmount
    const previous = historicalData[currentIdx + 1].totalAmount
    if (previous === 0) return null
    return ((current - previous) / previous) * 100
  }

  const currentIdx = historicalData.findIndex(d => d.date === selectedDate)
  const trend = getTrend(currentIdx)

  // Navigate between dates
  const goToPrevious = () => {
    if (currentIdx < historicalData.length - 1) {
      setLoading(true)
      setTimeout(() => {
        setSelectedDate(historicalData[currentIdx + 1].date)
        setLoading(false)
      }, 500)
    }
  }

  const goToNext = () => {
    if (currentIdx > 0) {
      setLoading(true)
      setTimeout(() => {
        setSelectedDate(historicalData[currentIdx - 1].date)
        setLoading(false)
      }, 500)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Neutral slate */}
        <div className="bg-slate-700 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center">
              <Landmark size={16} className="text-white" />
            </div>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Bank Credit History</span>
              <p style={{ fontSize: 9, color: '#cbd5e1', marginTop: 1 }}>
                Daily collection summary
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded transition-colors">
            <X size={16} className="text-white/70" />
          </button>
        </div>

        {/* Date Selector */}
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center justify-between">
            {/* Date Navigation */}
            <div className="flex items-center gap-2">
              <button
                onClick={goToPrevious}
                disabled={currentIdx >= historicalData.length - 1 || loading}
                className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} className="text-slate-600" />
              </button>

              <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-300 rounded-lg min-w-[180px] justify-center">
                <Calendar size={14} className="text-slate-500" />
                {loading ? (
                  <Loader2 size={14} className="animate-spin text-slate-500" />
                ) : (
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>
                    {formatDayOfWeek(selectedDate)}, {formatDate(selectedDate)}
                  </span>
                )}
              </div>

              <button
                onClick={goToNext}
                disabled={currentIdx <= 0 || loading}
                className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={16} className="text-slate-600" />
              </button>
            </div>

            {/* Quick Date Buttons */}
            <div className="flex items-center gap-1">
              {historicalData.slice(0, 5).map((data, idx) => (
                <button
                  key={data.date}
                  onClick={() => {
                    setLoading(true)
                    setTimeout(() => {
                      setSelectedDate(data.date)
                      setLoading(false)
                    }, 500)
                  }}
                  disabled={loading}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    selectedDate === data.date
                      ? 'bg-slate-700 text-white'
                      : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-100'
                  }`}
                  style={{ fontSize: 9 }}
                >
                  {idx === 0 ? 'Yesterday' : `${idx + 1}d ago`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content */}
        {selectedData && (
          <div className="p-4 space-y-4">
            {/* Total Amount Card - Neutral background */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>
                    Total Bank Credits Received
                  </p>
                  <div className="flex items-baseline gap-3">
                    <p style={{ fontSize: 28, fontWeight: 700, color: '#1e293b', fontFamily: 'monospace', margin: 0 }}>
                      {formatCurrency(selectedData.totalAmount)}
                    </p>
                    {trend !== null && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 2,
                          padding: '2px 8px',
                          borderRadius: 4,
                          backgroundColor: trend >= 0 ? '#f0fdf4' : '#fef2f2',
                          border: `1px solid ${trend >= 0 ? '#bbf7d0' : '#fecaca'}`,
                        }}
                      >
                        {trend >= 0 ? (
                          <TrendingUp size={12} style={{ color: '#16a34a' }} />
                        ) : (
                          <TrendingDown size={12} style={{ color: '#dc2626' }} />
                        )}
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: trend >= 0 ? '#16a34a' : '#dc2626',
                          }}
                        >
                          {trend >= 0 ? '+' : ''}{trend.toFixed(1)}%
                        </span>
                        <span style={{ fontSize: 9, color: '#64748b', marginLeft: 2 }}>vs prev</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p style={{ fontSize: 9, color: '#64748b', marginBottom: 2 }}>Credits</p>
                  <p style={{ fontSize: 18, fontWeight: 700, color: '#334155' }}>{selectedData.creditCount}</p>
                </div>
              </div>
            </div>

            {/* PSP Breakdown - Neutral styling */}
            <div className="grid grid-cols-2 gap-3">
              {/* GrabPay */}
              <div className="bg-white border border-slate-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#475569' }}>GrabPay</span>
                  <span style={{ fontSize: 9, color: '#64748b' }}>
                    {((selectedData.grabpayAmount / selectedData.totalAmount) * 100).toFixed(0)}%
                  </span>
                </div>
                <p style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', fontFamily: 'monospace' }}>
                  {formatCurrency(selectedData.grabpayAmount)}
                </p>
                <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-slate-400 rounded-full"
                    style={{ width: `${(selectedData.grabpayAmount / selectedData.totalAmount) * 100}%` }}
                  />
                </div>
              </div>

              {/* Stripe */}
              <div className="bg-white border border-slate-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#475569' }}>Stripe</span>
                  <span style={{ fontSize: 9, color: '#64748b' }}>
                    {((selectedData.stripeAmount / selectedData.totalAmount) * 100).toFixed(0)}%
                  </span>
                </div>
                <p style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', fontFamily: 'monospace' }}>
                  {formatCurrency(selectedData.stripeAmount)}
                </p>
                <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-slate-500 rounded-full"
                    style={{ width: `${(selectedData.stripeAmount / selectedData.totalAmount) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Reconciliation Status - Minimal color */}
            <div className="bg-white border border-slate-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>
                    Reconciliation Status
                  </p>
                  <p style={{ fontSize: 12, color: '#475569' }}>
                    <span style={{ fontWeight: 700, color: '#1e293b' }}>{selectedData.reconciledCount}</span> of{' '}
                    <span style={{ fontWeight: 600 }}>{selectedData.creditCount}</span> credits reconciled
                  </p>
                </div>
                <div className="text-right">
                  <p style={{ fontSize: 24, fontWeight: 700, color: '#1e293b' }}>
                    {selectedData.reconciledPct.toFixed(0)}%
                  </p>
                </div>
              </div>
              <div className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${selectedData.reconciledPct}%`,
                    backgroundColor: '#64748b'
                  }}
                />
              </div>
            </div>

            {/* Historical Summary Table - Clean monochrome */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="bg-slate-100 px-3 py-2 border-b border-slate-200">
                <p style={{ fontSize: 10, fontWeight: 600, color: '#475569' }}>Last 7 Days Summary</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th style={{ fontSize: 9, fontWeight: 600, color: '#64748b', padding: '6px 10px', textAlign: 'left' }}>Date</th>
                      <th style={{ fontSize: 9, fontWeight: 600, color: '#64748b', padding: '6px 10px', textAlign: 'right' }}>Total</th>
                      <th style={{ fontSize: 9, fontWeight: 600, color: '#64748b', padding: '6px 10px', textAlign: 'right' }}>GrabPay</th>
                      <th style={{ fontSize: 9, fontWeight: 600, color: '#64748b', padding: '6px 10px', textAlign: 'right' }}>Stripe</th>
                      <th style={{ fontSize: 9, fontWeight: 600, color: '#64748b', padding: '6px 10px', textAlign: 'right' }}>Recon %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historicalData.slice(0, 7).map((data) => (
                      <tr
                        key={data.date}
                        className={`border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors ${
                          data.date === selectedDate ? 'bg-slate-100' : ''
                        }`}
                        onClick={() => {
                          setLoading(true)
                          setTimeout(() => {
                            setSelectedDate(data.date)
                            setLoading(false)
                          }, 500)
                        }}
                      >
                        <td style={{ fontSize: 10, padding: '8px 10px', fontWeight: data.date === selectedDate ? 600 : 400, color: '#334155' }}>
                          {formatDayOfWeek(data.date)}, {formatDate(data.date)}
                        </td>
                        <td style={{ fontSize: 10, padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#1e293b' }}>
                          {formatCurrency(data.totalAmount)}
                        </td>
                        <td style={{ fontSize: 10, padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', color: '#475569' }}>
                          {formatCurrency(data.grabpayAmount)}
                        </td>
                        <td style={{ fontSize: 10, padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', color: '#475569' }}>
                          {formatCurrency(data.stripeAmount)}
                        </td>
                        <td style={{ fontSize: 10, padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#334155' }}>
                          {data.reconciledPct.toFixed(0)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-slate-200 px-4 py-3 flex items-center justify-between bg-slate-50">
          <p style={{ fontSize: 9, color: '#64748b' }}>
            Showing bank credits received in SGD
          </p>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-700 text-white rounded hover:bg-slate-600 transition-colors"
            style={{ fontSize: 11, fontWeight: 600 }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// Export type for use in Dashboard
export type { DailyBankCredit }
