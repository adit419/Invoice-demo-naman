/**
 * Exception Workspace Screen
 * Analyst's daily work surface for exception management
 */

import React, { useState, useEffect, useMemo } from 'react'
import { Download, Search, Loader2 } from 'lucide-react'
import { SkeletonCard, SkeletonTable } from '../components/ui/Skeleton'
import { ExceptionDetailModal } from '../components/modals/ExceptionDetailModal'
import { exceptionsService } from '../services'
import type { Exception } from '../types/domain'
import type { ExceptionDetail } from '../types/exceptions'
import { enhancedExceptions } from '../data/exceptionsEnhanced'

// Helper function to format currency
const formatCurrency = (amount: number, currency: string): string => {
  if (currency === 'IDR') {
    return `${currency} ${(amount / 1000000).toFixed(1)}M`
  } else if (currency === 'SGD' || currency === 'MYR') {
    if (amount >= 1000000) {
      return `${currency} ${(amount / 1000000).toFixed(2)}M`
    } else if (amount >= 1000) {
      return `${currency} ${(amount / 1000).toFixed(0)}K`
    }
    return `${currency} ${amount.toLocaleString()}`
  }
  return `${currency} ${amount.toLocaleString()}`
}

// Helper function to format exception type
const formatExceptionType = (type: string): string => {
  return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

// Helper function to format date
const formatDate = (dateString: string): string => {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Helper function to format SLA countdown
const formatSLACountdown = (slaDue: string, pastSLA: boolean): { text: string; color: string } => {
  if (pastSLA) {
    const now = new Date()
    const due = new Date(slaDue)
    const diffMs = now.getTime() - due.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)

    if (diffDays > 0) {
      return { text: `${diffDays}d overdue`, color: '#dc2626' }
    }
    return { text: `${diffHours}h overdue`, color: '#dc2626' }
  }

  const now = new Date()
  const due = new Date(slaDue)
  const diffMs = due.getTime() - now.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)

  if (diffDays > 1) {
    return { text: `${diffDays}d left`, color: '#059669' }
  } else if (diffHours > 4) {
    return { text: `${diffHours}h left`, color: '#d97706' }
  }
  return { text: `${diffHours}h left`, color: '#dc2626' }
}

// Helper function to format transaction type
const formatTransactionType = (type?: string): { label: string; color: string } => {
  const types: Record<string, { label: string; color: string }> = {
    'payment': { label: 'Payment', color: '#0369a1' },
    'refund': { label: 'Refund', color: '#7c3aed' },
    'settlement': { label: 'Settlement', color: '#475569' },
    'chargeback': { label: 'Chargeback', color: '#dc2626' },
    'reversal': { label: 'Reversal', color: '#059669' },
    'adjustment': { label: 'Adjustment', color: '#d97706' },
    'fee_adjustment': { label: 'Fee Adj', color: '#0891b2' },
  }
  return types[type || ''] || { label: '—', color: '#94a3b8' }
}

// Randomized owner names for demo variety
const ANALYST_NAMES = [
  'Sarah Chen',
  'James Tan',
  'Priya Sharma',
  'Michael Wong',
  'Lisa Park',
  'David Lee',
  'Emma Nguyen',
  'Ryan Lim',
]

// Deterministic random name based on exception ID (consistent across renders)
const getRandomOwnerName = (exceptionId: string, hasOwner: boolean): string | null => {
  if (!hasOwner) return null
  // Use exception ID to generate consistent index
  let hash = 0
  for (let i = 0; i < exceptionId.length; i++) {
    hash = ((hash << 5) - hash) + exceptionId.charCodeAt(i)
    hash = hash & hash
  }
  const index = Math.abs(hash) % ANALYST_NAMES.length
  return ANALYST_NAMES[index]
}

interface KPICardProps {
  title: string
  value: string
  subtitle: string
  colorClass: string
}

const KPICard: React.FC<KPICardProps> = ({ title, value, subtitle, colorClass }) => {
  const getBorderColor = () => {
    if (colorClass.includes('emerald')) return '#059669'
    if (colorClass.includes('red')) return '#dc2626'
    if (colorClass.includes('amber')) return '#d97706'
    return '#64748b'
  }

  return (
    <div style={{ backgroundColor: 'white', borderRadius: 6, border: '1px solid #E2E8F0', borderLeft: `3px solid ${getBorderColor()}`, padding: '10px 12px' }}>
      <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>{title}</p>
      <p style={{ fontSize: 16, fontWeight: 700, color: '#101828', marginBottom: 2 }}>{value}</p>
      <p style={{ fontSize: 10, color: '#64748b' }}>{subtitle}</p>
    </div>
  )
}

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
      }}
      className="hover:border-sky-400"
    >
      {label}
      {count !== undefined && (
        <span style={{
          marginLeft: 4,
          padding: '1px 4px',
          borderRadius: '3px',
          backgroundColor: active ? '#0369a1' : '#e5e7eb',
          color: active ? '#fff' : '#64748b',
          fontSize: 9,
          fontWeight: 700,
        }}>
          {count}
        </span>
      )}
    </button>
  )
}

export const ExceptionWorkspace: React.FC = () => {
  const [exceptions, setExceptions] = useState<Exception[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedExceptionId, setSelectedExceptionId] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [loadingRowId, setLoadingRowId] = useState<string | null>(null) // Synthetic loader for demo

  // Filters
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null)
  const [ownerFilter, setOwnerFilter] = useState<string | null | undefined>(undefined)
  const [slaFilter, setSlaFilter] = useState<boolean | null>(null)
  const [pspFilter, setPspFilter] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [exceptionsData, statsData] = await Promise.all([
          exceptionsService.getExceptions({
            status: 'open',
            type: typeFilter || undefined,
            priority: priorityFilter || undefined,
            owner: ownerFilter,
            pastSLA: slaFilter === null ? undefined : slaFilter,
            psp: pspFilter || undefined,
          }),
          exceptionsService.getExceptionStats(),
        ])

        setExceptions(exceptionsData)
        setStats(statsData)
      } catch (error) {
        console.error('Error fetching exception data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [typeFilter, priorityFilter, ownerFilter, slaFilter, pspFilter])

  // Client-side search filtering
  const filteredExceptions = useMemo(() => {
    if (!searchQuery.trim()) return exceptions

    const query = searchQuery.toLowerCase()
    return exceptions.filter(e =>
      e.id.toLowerCase().includes(query) ||
      e.referenceId.toLowerCase().includes(query) ||
      e.pspName.toLowerCase().includes(query) ||
      (e.aiSuggestion && e.aiSuggestion.toLowerCase().includes(query))
    )
  }, [exceptions, searchQuery])

  // Get unique PSPs for filter
  const availablePSPs = useMemo(() => {
    const psps = new Set<string>()
    exceptions.forEach(e => {
      if (e.psp) psps.add(e.psp)
    })
    return Array.from(psps)
  }, [exceptions])

  // Deep linking support - Check URL parameters and auto-open exception modal
  useEffect(() => {
    if (exceptions.length === 0) return

    // Get exceptionId from URL query parameter
    const urlParams = new URLSearchParams(window.location.search)
    const exceptionIdParam = urlParams.get('exceptionId')

    if (exceptionIdParam) {
      const exception = exceptions.find(e => e.id === exceptionIdParam)
      if (exception) {
        setSelectedExceptionId(exception.id)
        setIsModalOpen(true)
        // Clear URL parameter after opening modal
        window.history.replaceState({}, '', window.location.pathname)
      }
    }
  }, [exceptions])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <SkeletonTable />
      </div>
    )
  }

  if (!stats) return null

  const getPriorityColor = (priority: string): string => {
    if (priority === 'high') return '#dc2626'
    if (priority === 'medium') return '#d97706'
    return '#64748b'
  }

  const getPriorityBadgeVariant = (priority: string): 'high' | 'medium' | 'low' => {
    return priority as 'high' | 'medium' | 'low'
  }

  const getTypeBadgeVariant = (type: string): 'exception' | 'pending' | 'in_transit' | 'aging' => {
    if (type === 'unmatched_credit') return 'exception'
    if (type === 'unmatched_order') return 'pending'
    if (type === 'amount_mismatch') return 'in_transit'
    return 'aging'
  }

  // Handle row click - show modal with enhanced data if available
  // Handle row click with synthetic loading for demo feel
  const handleRowClick = async (exception: Exception) => {
    if (loadingRowId) return // Prevent double-clicks

    setLoadingRowId(exception.id)

    // Synthetic delay for demo (2-3 seconds random)
    const delay = 2000 + Math.random() * 1000
    await new Promise(resolve => setTimeout(resolve, delay))

    setLoadingRowId(null)
    setSelectedExceptionId(exception.id)
    setIsModalOpen(true)
  }

  // Get enhanced exception data for modal
  const getEnhancedException = (id: string): ExceptionDetail | null => {
    const enhanced = enhancedExceptions.find(e => e.id === id)
    if (enhanced) return enhanced

    // Fallback: return basic exception data
    const basic = exceptions.find(e => e.id === id)
    return basic as ExceptionDetail | null
  }

  // Handle actions from modal
  const handleAction = (action: string, exceptionId: string) => {
    console.log('Action:', action, 'Exception:', exceptionId)

    // Simulate action with toast notification
    const actionMessages: Record<string, string> = {
      confirm_hold: 'Exception placed on hold. Will auto-retry when PSP file arrives.',
      accept_proposed_match: 'Match accepted. GL entries posted.',
      reject_match: 'Match rejected. Exception moved to investigation queue.',
      accept_aggregate_match: 'Batch match accepted. All credits linked.',
      confirm_auto_clear: 'Auto-clear confirmed. Variance posted to GL.',
      generate_psp_inquiry: 'PSP inquiry generated and sent.',
      confirm_batch_match: 'Subset-sum match confirmed. Records linked.',
      collect_chargeback_evidence: 'Evidence collection task created.',
      accept_chargeback_loss: 'Chargeback accepted. Loss recognized.',
    }

    const message = actionMessages[action] || 'Action completed'

    // Log action for demo (no alert popups)
    console.log('[Action]', message)

    // Close modal
    setIsModalOpen(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <KPICard
          title="Total Open"
          value={`${stats.total}`}
          subtitle={`${formatCurrency(stats.totalAmount.SGD, 'SGD')}`}
          colorClass="text-amber-600"
        />
        <KPICard
          title="Past SLA"
          value={`${stats.pastSLA}`}
          subtitle={`${((stats.pastSLA / stats.total) * 100).toFixed(1)}% of total open`}
          colorClass="text-red-600"
        />
        <KPICard
          title="Unassigned"
          value={`${stats.unassigned}`}
          subtitle={`${((stats.unassigned / stats.total) * 100).toFixed(1)}% need assignment`}
          colorClass="text-slate-600"
        />
        <KPICard
          title="High Priority"
          value={`${stats.byPriority.high || 0}`}
          subtitle={`${stats.byPriority.medium || 0} medium · ${stats.byPriority.low || 0} low`}
          colorClass="text-emerald-600"
        />
      </div>

      {/* Filters */}
      <div style={{ backgroundColor: 'white', borderRadius: 6, border: '1px solid #E2E8F0', padding: '10px 12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Search Box */}
          <div style={{ position: 'relative', maxWidth: 300 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search by ID, reference, PSP..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 10px 6px 32px',
                fontSize: 11,
                border: '1px solid #e2e8f0',
                borderRadius: 4,
                outline: 'none',
              }}
              className="focus:border-sky-400 focus:ring-1 focus:ring-sky-100"
            />
          </div>

          {/* Type Filters */}
          <div>
            <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              Exception Type
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <FilterChip
                label="All Types"
                active={typeFilter === null}
                onClick={() => setTypeFilter(null)}
                count={stats.total}
              />
              <FilterChip
                label="Unmatched Credit"
                active={typeFilter === 'unmatched_credit'}
                onClick={() => setTypeFilter('unmatched_credit')}
                count={stats.byType.unmatched_credit || 0}
              />
              <FilterChip
                label="Unmatched Order"
                active={typeFilter === 'unmatched_order'}
                onClick={() => setTypeFilter('unmatched_order')}
                count={stats.byType.unmatched_order || 0}
              />
              <FilterChip
                label="Amount Mismatch"
                active={typeFilter === 'amount_mismatch'}
                onClick={() => setTypeFilter('amount_mismatch')}
                count={stats.byType.amount_mismatch || 0}
              />
              <FilterChip
                label="Orphan Adjustment"
                active={typeFilter === 'orphan_adjustment'}
                onClick={() => setTypeFilter('orphan_adjustment')}
                count={stats.byType.orphan_adjustment || 0}
              />
              <FilterChip
                label="Aging Breach"
                active={typeFilter === 'aging_breach'}
                onClick={() => setTypeFilter('aging_breach')}
                count={stats.byType.aging_breach || 0}
              />
            </div>
          </div>

          {/* Priority, Assignment, SLA & PSP Filters - Horizontal Layout */}
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Priority
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <FilterChip
                  label="All"
                  active={priorityFilter === null}
                  onClick={() => setPriorityFilter(null)}
                />
                <FilterChip
                  label="High"
                  active={priorityFilter === 'high'}
                  onClick={() => setPriorityFilter('high')}
                  count={stats.byPriority.high || 0}
                />
                <FilterChip
                  label="Medium"
                  active={priorityFilter === 'medium'}
                  onClick={() => setPriorityFilter('medium')}
                  count={stats.byPriority.medium || 0}
                />
              </div>
            </div>

            <div>
              <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                PSP
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <FilterChip
                  label="All"
                  active={pspFilter === null}
                  onClick={() => setPspFilter(null)}
                />
                <FilterChip
                  label="GrabPay"
                  active={pspFilter === 'grabpay'}
                  onClick={() => setPspFilter('grabpay')}
                />
                <FilterChip
                  label="Stripe"
                  active={pspFilter === 'stripe'}
                  onClick={() => setPspFilter('stripe')}
                />
              </div>
            </div>

            <div>
              <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Assignment
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <FilterChip
                  label="All"
                  active={ownerFilter === undefined}
                  onClick={() => setOwnerFilter(undefined)}
                />
                <FilterChip
                  label="Unassigned"
                  active={ownerFilter === null}
                  onClick={() => setOwnerFilter(null)}
                  count={stats.unassigned}
                />
                <FilterChip
                  label="Assigned"
                  active={ownerFilter === 'assigned'}
                  onClick={() => setOwnerFilter('assigned')}
                />
              </div>
            </div>

            <div>
              <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                SLA Status
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <FilterChip
                  label="All"
                  active={slaFilter === null}
                  onClick={() => setSlaFilter(null)}
                />
                <FilterChip
                  label="Past SLA"
                  active={slaFilter === true}
                  onClick={() => setSlaFilter(true)}
                  count={stats.pastSLA}
                />
                <FilterChip
                  label="Within SLA"
                  active={slaFilter === false}
                  onClick={() => setSlaFilter(false)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Exception Table */}
      <div style={{ backgroundColor: 'white', borderRadius: 6, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 11, fontWeight: 600, color: '#101828', margin: 0 }}>
            Exceptions ({filteredExceptions.length}{searchQuery && ` of ${exceptions.length}`})
          </h3>
          <button
            style={{
              fontSize: 9,
              fontWeight: 600,
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid #e5e7eb',
              backgroundColor: '#fff',
              color: '#475569',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
            className="hover:bg-gray-50"
          >
            <Download size={10} />
            Export
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '6px 10px', fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'left' }}>ID</th>
                <th style={{ padding: '6px 10px', fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'left' }}>Txn Type</th>
                <th style={{ padding: '6px 10px', fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'left' }}>Exception</th>
                <th style={{ padding: '6px 10px', fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'right' }}>Amount</th>
                <th style={{ padding: '6px 10px', fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'left' }}>PSP</th>
                <th style={{ padding: '6px 10px', fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'left' }}>Created</th>
                <th style={{ padding: '6px 10px', fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'left' }}>SLA Due</th>
                <th style={{ padding: '6px 10px', fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'left' }}>Owner</th>
                <th style={{ padding: '6px 10px', fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'left' }}>AI Suggestion</th>
              </tr>
            </thead>
            <tbody>
              {filteredExceptions.map((exception) => {
                const txnType = formatTransactionType(exception.transactionType)
                const slaInfo = formatSLACountdown(exception.slaDue, exception.pastSLA)
                const ownerName = getRandomOwnerName(exception.id, !!exception.owner)
                const isRowLoading = loadingRowId === exception.id

                return (
                  <tr
                    key={exception.id}
                    onClick={() => handleRowClick(exception)}
                    className={`cursor-pointer ${isRowLoading ? 'bg-sky-50' : 'hover:bg-slate-50'}`}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      opacity: loadingRowId && !isRowLoading ? 0.5 : 1,
                      pointerEvents: loadingRowId ? 'none' : 'auto',
                      transition: 'all 0.2s',
                    }}
                  >
                    <td style={{ padding: '6px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {isRowLoading && (
                          <Loader2 size={14} className="animate-spin text-sky-600" />
                        )}
                        <div>
                          <p style={{ fontSize: 10, fontFamily: 'monospace', color: '#374151', margin: 0 }}>
                            {exception.id}
                          </p>
                          <p style={{ fontSize: 8, color: '#94a3b8', margin: 0, marginTop: 1, fontFamily: 'monospace' }}>
                            {exception.referenceId !== 'N/A' ? exception.referenceId : ''}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '6px 10px' }}>
                      <span style={{
                        fontSize: 9,
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: 3,
                        backgroundColor: `${txnType.color}15`,
                        color: txnType.color,
                      }}>
                        {txnType.label}
                      </span>
                    </td>
                    <td style={{ padding: '6px 10px' }}>
                      <p style={{ fontSize: 10, color: '#374151', margin: 0 }}>
                        {formatExceptionType(exception.type)}
                      </p>
                      <span style={{
                        fontSize: 8,
                        fontWeight: 600,
                        color: exception.priority === 'high' ? '#dc2626' : exception.priority === 'medium' ? '#d97706' : '#64748b'
                      }}>
                        {exception.priority.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                      <p style={{ fontSize: 10, fontFamily: 'monospace', color: '#111827', fontWeight: 600, margin: 0 }}>
                        {formatCurrency(exception.amount, exception.currency)}
                      </p>
                      {exception.amountLabel && (
                        <p style={{ fontSize: 8, color: '#94a3b8', margin: 0, marginTop: 1 }}>
                          {exception.amountLabel}
                        </p>
                      )}
                    </td>
                    <td style={{ padding: '6px 10px', fontSize: 10, color: '#374151' }}>
                      {exception.pspName}
                    </td>
                    <td style={{ padding: '6px 10px', fontSize: 10, color: '#6b7280' }}>
                      {formatDate(exception.createdAt)}
                    </td>
                    <td style={{ padding: '6px 10px' }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: slaInfo.color }}>
                        {slaInfo.text}
                      </span>
                    </td>
                    <td style={{ padding: '6px 10px', fontSize: 10, color: ownerName ? '#374151' : '#9ca3af' }}>
                      {ownerName || 'Unassigned'}
                    </td>
                    <td style={{ padding: '6px 10px', fontSize: 9, color: '#374151', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {exception.aiSuggestion || '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {filteredExceptions.length === 0 && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <p style={{ fontSize: 11, color: '#64748b' }}>
              {searchQuery ? `No exceptions found matching "${searchQuery}"` : 'No exceptions found. Try adjusting your filters.'}
            </p>
          </div>
        )}
      </div>

      {/* Exception Detail Modal */}
      <ExceptionDetailModal
        exception={selectedExceptionId ? getEnhancedException(selectedExceptionId) : null}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAction={handleAction}
      />
    </div>
  )
}
