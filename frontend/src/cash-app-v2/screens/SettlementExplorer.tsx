/**
 * Settlement Explorer - Main Screen
 *
 * 3-Level drill-down architecture:
 * Level 1: Bank Credits table (this screen)
 * Level 2: PSP Settlements (detail modal)
 * Level 3: Transaction lines (accordion in modal)
 */

import React, { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { SkeletonCard, SkeletonTable } from '../components/ui/Skeleton'
import { settlementsService } from '../services'
import type { BankCreditRecordDetail, SettlementExplorerKPIs } from '../types/domain'
import { SettlementDetailModal } from '../components/modals/SettlementDetailModal'

// ============================================================================
// KPI CARD COMPONENT
// ============================================================================

interface KPICardProps {
  title: string
  value: string
  subtitle: React.ReactNode
  icon?: React.ReactNode
  colorClass: string
  showLiveIndicator?: boolean
}

const KPICard: React.FC<KPICardProps> = ({
  title,
  value,
  subtitle,
  colorClass,
  showLiveIndicator = true
}) => {
  return (
    <div
      style={{
        backgroundColor: 'white',
        borderRadius: 6,
        border: '1px solid #E2E8F0',
        borderLeft: `3px solid ${colorClass}`,
        padding: '10px 12px',
        position: 'relative'
      }}
    >
      {/* Live indicator */}
      {showLiveIndicator && (
        <div style={{ position: 'absolute', top: 8, right: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#10b981' }} />
          <span style={{ fontSize: 8, color: '#94a3b8', whiteSpace: 'nowrap' }}>Yesterday</span>
        </div>
      )}

      <p style={{
        fontSize: 9,
        fontWeight: 600,
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: 4
      }}>
        {title}
      </p>

      <p style={{
        fontSize: 16,
        fontWeight: 700,
        color: '#101828',
        marginBottom: 2
      }}>
        {value}
      </p>

      <div style={{ fontSize: 10, color: '#64748b' }}>
        {subtitle}
      </div>
    </div>
  )
}

// ============================================================================
// FILTER CHIP COMPONENT
// ============================================================================

interface FilterChipProps {
  label: string
  active: boolean
  onClick: () => void
  count?: number
}

const FilterChip: React.FC<FilterChipProps> = ({ label, active, onClick, count }) => {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 10,
        fontWeight: 600,
        padding: '4px 8px',
        borderRadius: '4px',
        border: active ? '1px solid #0369a1' : '1px solid #e5e7eb',
        backgroundColor: active ? '#f0f9ff' : '#fff',
        color: active ? '#0369a1' : '#64748b',
        cursor: 'pointer',
        transition: 'all 0.15s',
        display: 'flex',
        alignItems: 'center',
        gap: '4px'
      }}
      className="hover:border-sky-400"
    >
      {label}
      {count !== undefined && (
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          backgroundColor: active ? '#0369a1' : '#e5e7eb',
          color: active ? '#fff' : '#64748b',
          padding: '1px 4px',
          borderRadius: '3px'
        }}>
          {count}
        </span>
      )}
    </button>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const SettlementExplorer: React.FC = () => {
  // State
  const [bankCredits, setBankCredits] = useState<BankCreditRecordDetail[]>([])
  const [kpis, setKPIs] = useState<SettlementExplorerKPIs | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedCreditId, setSelectedCreditId] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [loadingRowId, setLoadingRowId] = useState<string | null>(null)

  // Filters
  const [dateRange, setDateRange] = useState<'yesterday' | '7d' | '30d' | '90d' | 'all'>('yesterday')
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [pspFilter, setPspFilter] = useState<string[]>([])
  const [currencyFilter, setCurrencyFilter] = useState<string | null>(null)
  const [unmatchedOnly, setUnmatchedOnly] = useState(false)

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 15

  // Calculate date range
  const getDateRange = () => {
    const today = new Date()
    let dateTo = today.toISOString().split('T')[0]
    let dateFrom: string | undefined

    switch (dateRange) {
      case 'yesterday':
        const yesterday = new Date(today)
        yesterday.setDate(today.getDate() - 1)
        dateFrom = yesterday.toISOString().split('T')[0]
        dateTo = yesterday.toISOString().split('T')[0]
        break
      case '7d':
        const sevenDaysAgo = new Date(today)
        sevenDaysAgo.setDate(today.getDate() - 7)
        dateFrom = sevenDaysAgo.toISOString().split('T')[0]
        break
      case '30d':
        const thirtyDaysAgo = new Date(today)
        thirtyDaysAgo.setDate(today.getDate() - 30)
        dateFrom = thirtyDaysAgo.toISOString().split('T')[0]
        break
      case '90d':
        const ninetyDaysAgo = new Date(today)
        ninetyDaysAgo.setDate(today.getDate() - 90)
        dateFrom = ninetyDaysAgo.toISOString().split('T')[0]
        break
      case 'all':
        dateFrom = undefined
        break
    }

    return { dateFrom, dateTo }
  }

  // Data fetching
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setCurrentPage(1) // Reset to first page when filters change
      try {
        const { dateFrom, dateTo } = getDateRange()
        const [creditsData, kpisData] = await Promise.all([
          settlementsService.getBankCredits({
            dateFrom,
            dateTo,
            status: statusFilter.length > 0 ? statusFilter : undefined,
            psp: pspFilter.length > 0 ? pspFilter : undefined,
            currency: currencyFilter || undefined,
            unmatchedOnly
          }),
          settlementsService.getSettlementKPIs({ dateFrom, dateTo })
        ])
        setBankCredits(creditsData)
        setKPIs(kpisData)
      } catch (error) {
        console.error('Failed to fetch settlement data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [dateRange, statusFilter, pspFilter, currencyFilter, unmatchedOnly])

  // Pagination calculations
  const totalRecords = bankCredits.length
  const totalPages = Math.ceil(totalRecords / pageSize)
  const startIndex = (currentPage - 1) * pageSize
  const endIndex = Math.min(startIndex + pageSize, totalRecords)
  const paginatedCredits = bankCredits.slice(startIndex, endIndex)

  // Deep linking support - Check URL parameters and auto-open modal
  useEffect(() => {
    if (bankCredits.length === 0) return

    // Get creditId from URL query parameter
    const urlParams = new URLSearchParams(window.location.search)
    const creditIdParam = urlParams.get('creditId')

    if (creditIdParam) {
      const credit = bankCredits.find(c => c.id === creditIdParam)
      if (credit) {
        setSelectedCreditId(credit.id)
        setIsModalOpen(true)
        // Clear URL parameter after opening modal
        window.history.replaceState({}, '', window.location.pathname)
      }
    }
  }, [bankCredits])

  // Handlers
  const handleRowClick = async (credit: BankCreditRecordDetail) => {
    if (loadingRowId) return // Prevent double-clicks

    setLoadingRowId(credit.id)

    // Synthetic delay for demo (2-3 seconds random)
    const delay = 2000 + Math.random() * 1000
    await new Promise(resolve => setTimeout(resolve, delay))

    setLoadingRowId(null)
    setSelectedCreditId(credit.id)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedCreditId(null)
  }

  const handleAction = (action: string, creditId: string) => {
    console.log('Action:', action, 'Credit:', creditId)
    // TODO: Implement action handlers
  }

  const toggleStatusFilter = (status: string) => {
    setStatusFilter(prev =>
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    )
  }

  const togglePSPFilter = (psp: string) => {
    setPspFilter(prev =>
      prev.includes(psp) ? prev.filter(p => p !== psp) : [...prev, psp]
    )
  }

  const formatCurrency = (amount: number, currency: string) => {
    return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'reconciled': return 'Reconciled'
      case 'matched_l1': return 'Matched (L1)'
      case 'unmatched_no_psp_file': return 'No PSP File'
      case 'unmatched_variance': return 'L1 Variance'
      case 'partial': return 'Partial'
      default: return status
    }
  }

  const selectedCredit = selectedCreditId
    ? bankCredits.find(c => c.id === selectedCreditId)
    : null

  return (
    <div>

      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4" style={{ gap: 10, marginBottom: 12 }}>
          {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : kpis && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4" style={{ gap: 10, marginBottom: 12 }}>
          <KPICard
            title="Total Bank Credits"
            value={kpis.totalBankCredits.toString()}
            subtitle={`SGD ${kpis.totalBankCreditAmount.SGD.toLocaleString()}`}
            colorClass="#0369a1"
          />
          {/* Reconciliation Rate - 3 Level Metrics */}
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: 6,
              border: '1px solid #E2E8F0',
              borderLeft: '3px solid #059669',
              padding: '10px 12px',
              position: 'relative'
            }}
          >
            {/* Live indicator */}
            <div style={{ position: 'absolute', top: 8, right: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#10b981' }} />
              <span style={{ fontSize: 8, color: '#94a3b8', whiteSpace: 'nowrap' }}>Yesterday</span>
            </div>

            <p style={{
              fontSize: 9,
              fontWeight: 600,
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: 8
            }}>
              Reconciliation Rate
            </p>

            {/* 3 Level Metrics */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* L1: Bank Credit vs PSP Net */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    fontSize: 8,
                    fontWeight: 700,
                    color: '#0369a1',
                    backgroundColor: '#e0f2fe',
                    padding: '1px 4px',
                    borderRadius: 2
                  }}>L1</span>
                  <span style={{ fontSize: 10, color: '#475569' }}>Bank ↔ PSP Net</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#059669' }}>
                    {kpis.l1MatchedPercent}%
                  </span>
                  <span style={{ fontSize: 9, color: '#64748b' }}>
                    ({kpis.l1MatchedCount}/{kpis.totalBankCredits})
                  </span>
                </div>
              </div>

              {/* L2 Parent: Fully Reconciled (L1+L2) */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    fontSize: 8,
                    fontWeight: 700,
                    color: '#7c3aed',
                    backgroundColor: '#ede9fe',
                    padding: '1px 4px',
                    borderRadius: 2
                  }}>L2</span>
                  <span style={{ fontSize: 10, color: '#475569' }}>Fully Reconciled</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#059669' }}>
                    {kpis.l2ParentMatchedPercent}%
                  </span>
                  <span style={{ fontSize: 9, color: '#64748b' }}>
                    ({kpis.l2MatchedCount}/{kpis.l1MatchedCount})
                  </span>
                </div>
              </div>

              {/* L2 Line Items: PSP Lines matched with OMS */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4, borderTop: '1px dashed #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    fontSize: 8,
                    fontWeight: 700,
                    color: '#059669',
                    backgroundColor: '#d1fae5',
                    padding: '1px 4px',
                    borderRadius: 2
                  }}>TXN</span>
                  <span style={{ fontSize: 10, color: '#475569' }}>Line Items</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#059669' }}>
                    {kpis.lineItemMatchPercent}%
                  </span>
                  <span style={{ fontSize: 9, color: '#64748b' }}>
                    ({kpis.matchedLineItems.toLocaleString()}/{kpis.totalLineItems.toLocaleString()})
                  </span>
                </div>
              </div>
            </div>
          </div>
          <KPICard
            title="Unmatched Credits"
            value={kpis.unmatchedCount.toString()}
            subtitle={`SGD ${kpis.unmatchedAmount.SGD.toLocaleString()}`}
            colorClass="#dc2626"
          />
          <KPICard
            title="Total Variance"
            value={`SGD ${kpis.totalVariance.SGD.toLocaleString()}`}
            subtitle={`Avg reconciliation: ${kpis.avgReconciliationTime}`}
            colorClass="#d97706"
          />
        </div>
      )}

      {/* Filters Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 14, flexWrap: 'wrap' }}>
        {/* Period - Primary filter as pill buttons */}
        <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 6, padding: 3 }}>
          {(['yesterday', '7d', '30d', '90d', 'all'] as const).map((period) => (
            <button
              key={period}
              onClick={() => setDateRange(period)}
              style={{
                fontSize: 11,
                fontWeight: 500,
                padding: '5px 12px',
                borderRadius: 4,
                border: 'none',
                backgroundColor: dateRange === period ? '#0369a1' : 'transparent',
                color: dateRange === period ? '#fff' : '#64748b',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              className={dateRange !== period ? 'hover:bg-slate-200' : ''}
            >
              {period === 'yesterday' ? 'Yesterday' : period === 'all' ? 'All' : period.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Separator */}
        <div style={{ width: 1, height: 20, backgroundColor: '#e2e8f0' }} />

        {/* Status dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: '#64748b' }}>Status</span>
          <select
            value={statusFilter.length === 0 ? 'all' : statusFilter[0]}
            onChange={(e) => {
              const val = e.target.value
              setStatusFilter(val === 'all' ? [] : [val])
            }}
            style={{
              fontSize: 11,
              fontWeight: 500,
              padding: '5px 8px',
              borderRadius: 4,
              border: '1px solid #e2e8f0',
              backgroundColor: '#fff',
              color: '#374151',
              cursor: 'pointer',
              outline: 'none',
              minWidth: 100,
            }}
          >
            <option value="all">All</option>
            <option value="reconciled">Reconciled</option>
            <option value="matched_l1">Matched (L1)</option>
            <option value="unmatched_no_psp_file">No PSP File</option>
            <option value="unmatched_variance">L1 Variance</option>
            <option value="partial">Partial</option>
          </select>
        </div>

        {/* PSP dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: '#64748b' }}>PSP</span>
          <select
            value={pspFilter.length === 0 ? 'all' : pspFilter[0]}
            onChange={(e) => {
              const val = e.target.value
              setPspFilter(val === 'all' ? [] : [val])
            }}
            style={{
              fontSize: 11,
              fontWeight: 500,
              padding: '5px 8px',
              borderRadius: 4,
              border: '1px solid #e2e8f0',
              backgroundColor: '#fff',
              color: '#374151',
              cursor: 'pointer',
              outline: 'none',
              minWidth: 90,
            }}
          >
            <option value="all">All</option>
            <option value="grabpay">GrabPay</option>
            <option value="stripe">Stripe</option>
          </select>
        </div>

        {/* Unmatched toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={unmatchedOnly}
            onChange={(e) => setUnmatchedOnly(e.target.checked)}
            style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#0369a1' }}
          />
          <span style={{ fontSize: 11, fontWeight: 500, color: '#64748b' }}>Unmatched only</span>
        </label>
      </div>

      {/* Bank Credits Table */}
      <div style={{ backgroundColor: 'white', borderRadius: 6, border: '1px solid #E2E8F0', padding: '10px 12px' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
          <h2 style={{ fontSize: 11, fontWeight: 600, color: '#101828' }}>
            Bank Credits
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Date context indicator */}
            {bankCredits.length > 0 && (() => {
              const uniqueDates = [...new Set(bankCredits.map(c => c.valueDate))].sort().reverse()
              const formatDateLabel = (dateStr: string) => {
                const date = new Date(dateStr)
                const today = new Date()
                const yesterday = new Date(today)
                yesterday.setDate(today.getDate() - 1)

                if (date.toDateString() === today.toDateString()) return 'Today'
                if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
                return date.toLocaleDateString('en-SG', { day: '2-digit', month: 'short' })
              }

              if (uniqueDates.length === 1) {
                return (
                  <span style={{ fontSize: 9, color: '#0369a1', backgroundColor: '#f0f9ff', padding: '2px 6px', borderRadius: 3, fontWeight: 500 }}>
                    {formatDateLabel(uniqueDates[0])}
                  </span>
                )
              } else if (uniqueDates.length <= 3) {
                return (
                  <span style={{ fontSize: 9, color: '#64748b' }}>
                    {uniqueDates.map(d => formatDateLabel(d)).join(', ')}
                  </span>
                )
              } else {
                return (
                  <span style={{ fontSize: 9, color: '#64748b' }}>
                    {formatDateLabel(uniqueDates[uniqueDates.length - 1])} – {formatDateLabel(uniqueDates[0])}
                  </span>
                )
              }
            })()}
            <span style={{ fontSize: 9, color: '#64748b' }}>
              {bankCredits.length} records
            </span>
          </div>
        </div>

        {loading ? (
          <SkeletonTable rows={5} />
        ) : bankCredits.length === 0 ? (
          <div className="text-center py-6">
            <p style={{ fontSize: 10, color: '#64748b' }}>
              No bank credits found. Try adjusting your filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textAlign: 'left', padding: '6px 8px', textTransform: 'uppercase' }}>
                    Date
                  </th>
                  <th style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textAlign: 'left', padding: '6px 8px', textTransform: 'uppercase' }}>
                    Bank Account
                  </th>
                  <th style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textAlign: 'right', padding: '6px 8px', textTransform: 'uppercase' }}>
                    Amount
                  </th>
                  <th style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textAlign: 'left', padding: '6px 8px', textTransform: 'uppercase' }}>
                    PSP
                  </th>
                  <th style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textAlign: 'left', padding: '6px 8px', textTransform: 'uppercase' }}>
                    Payout Ref
                  </th>
                  <th style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textAlign: 'center', padding: '6px 8px', textTransform: 'uppercase' }}>
                    Settlements
                  </th>
                  <th style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textAlign: 'center', padding: '6px 8px', textTransform: 'uppercase' }}>
                    Exceptions
                  </th>
                  <th style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textAlign: 'left', padding: '6px 8px', textTransform: 'uppercase' }}>
                    Status
                  </th>
                  <th style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textAlign: 'right', padding: '6px 8px', textTransform: 'uppercase' }}>
                    Variance
                  </th>
                  <th style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textAlign: 'center', padding: '6px 8px', textTransform: 'uppercase' }}>
                    Age
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedCredits.map((credit) => {
                  const isRowLoading = loadingRowId === credit.id
                  return (
                  <tr
                    key={credit.id}
                    onClick={() => handleRowClick(credit)}
                    className={`cursor-pointer ${isRowLoading ? 'bg-sky-50' : 'hover:bg-slate-50'}`}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      opacity: loadingRowId && !isRowLoading ? 0.5 : 1,
                      pointerEvents: loadingRowId ? 'none' : 'auto',
                      transition: 'all 0.2s',
                    }}
                  >
                    <td style={{ fontSize: 10, padding: '6px 8px', color: '#374151' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {isRowLoading && (
                          <Loader2 size={12} className="animate-spin text-sky-600" />
                        )}
                        {new Date(credit.valueDate).toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </div>
                    </td>
                    <td style={{ fontSize: 10, padding: '6px 8px', color: '#374151' }}>
                      {credit.bankAccount}
                    </td>
                    <td style={{ fontSize: 10, padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#111827' }}>
                      {formatCurrency(credit.amount, credit.currency)}
                    </td>
                    <td style={{ fontSize: 10, padding: '6px 8px', color: '#374151' }}>
                      {credit.matchedSettlements.length > 1 ? (
                        <span>Multiple</span>
                      ) : credit.mappedPSP ? (
                        <span>{credit.matchedSettlements[0]?.pspName || credit.mappedPSP}</span>
                      ) : (
                        <span style={{ color: '#9ca3af' }}>—</span>
                      )}
                    </td>
                    <td style={{ fontSize: 9, padding: '6px 8px', fontFamily: 'monospace', color: '#6b7280' }}>
                      {credit.payoutRef || '—'}
                    </td>
                    <td style={{ fontSize: 10, padding: '6px 8px', textAlign: 'center', color: '#374151' }}>
                      {credit.matchedSettlements.length}
                    </td>
                    <td style={{ fontSize: 10, padding: '6px 8px', textAlign: 'center', color: credit.exceptions && credit.exceptions.length > 0 ? '#dc2626' : '#374151' }}>
                      {credit.exceptions?.length || 0}
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <span style={{
                        fontSize: 9,
                        fontWeight: 600,
                        color: credit.reconciliationStatus === 'reconciled' ? '#059669' :
                               credit.reconciliationStatus === 'matched_l1' ? '#d97706' :
                               credit.reconciliationStatus === 'unmatched_no_psp_file' ? '#dc2626' :
                               credit.reconciliationStatus === 'unmatched_variance' ? '#dc2626' : '#64748b'
                      }}>
                        {getStatusLabel(credit.reconciliationStatus)}
                      </span>
                    </td>
                    <td style={{ fontSize: 10, padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', color: credit.variance === 0 ? '#6b7280' : '#dc2626' }}>
                      {credit.variance === 0 ? '—' : formatCurrency(credit.variance, credit.currency)}
                    </td>
                    <td style={{ fontSize: 9, padding: '6px 8px', textAlign: 'center', color: '#6b7280' }}>
                      {credit.age}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {!loading && bankCredits.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
            <span style={{ fontSize: 9, color: '#64748b' }}>
              Showing {startIndex + 1}–{endIndex} of {totalRecords} records
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                style={{
                  fontSize: 9,
                  padding: '4px 8px',
                  borderRadius: 4,
                  border: '1px solid #e5e7eb',
                  backgroundColor: currentPage === 1 ? '#f9fafb' : '#fff',
                  color: currentPage === 1 ? '#9ca3af' : '#374151',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
                }}
              >
                First
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{
                  fontSize: 9,
                  padding: '4px 8px',
                  borderRadius: 4,
                  border: '1px solid #e5e7eb',
                  backgroundColor: currentPage === 1 ? '#f9fafb' : '#fff',
                  color: currentPage === 1 ? '#9ca3af' : '#374151',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
                }}
              >
                Prev
              </button>
              <span style={{ fontSize: 9, color: '#374151', padding: '0 8px' }}>
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                style={{
                  fontSize: 9,
                  padding: '4px 8px',
                  borderRadius: 4,
                  border: '1px solid #e5e7eb',
                  backgroundColor: currentPage === totalPages ? '#f9fafb' : '#fff',
                  color: currentPage === totalPages ? '#9ca3af' : '#374151',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
                }}
              >
                Next
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                style={{
                  fontSize: 9,
                  padding: '4px 8px',
                  borderRadius: 4,
                  border: '1px solid #e5e7eb',
                  backgroundColor: currentPage === totalPages ? '#f9fafb' : '#fff',
                  color: currentPage === totalPages ? '#9ca3af' : '#374151',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
                }}
              >
                Last
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Settlement Detail Modal */}
      {selectedCredit && (
        <SettlementDetailModal
          credit={selectedCredit}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          onAction={handleAction}
        />
      )}
    </div>
  )
}
