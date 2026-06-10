/**
 * Transaction Lines Comparison Modal - Compact Enterprise Edition
 * L2 Reconciliation: PSP Settlement File ↔ OMS Order Records
 */

import React, { useState, useMemo } from 'react'
import {
  X, Search, Download, CheckCircle2, AlertTriangle, XCircle,
  ChevronDown, ChevronRight, ArrowUpDown, FileText, Database,
  RefreshCw, Clock, Layers, BookOpen
} from 'lucide-react'
import type { SettlementPayoutDetail, L2ComparisonLine, BankCreditRecordDetail } from '../../types/domain'
import { AccountingEntriesModal } from './AccountingEntriesModal'

interface TransactionLinesComparisonModalProps {
  settlement: SettlementPayoutDetail | null
  isOpen: boolean
  onClose: () => void
  currency: string
  // Optional: pass the full credit data for accounting entries
  credit?: BankCreditRecordDetail | null
}

type SortField = 'pspTxnId' | 'orderId' | 'pspGross' | 'omsGross' | 'delta' | 'status'
type SortDirection = 'asc' | 'desc'

export const TransactionLinesComparisonModal: React.FC<TransactionLinesComparisonModalProps> = ({
  settlement, isOpen, onClose, currency, credit
}) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'matched' | 'mismatch' | 'no_oms_record'>('all')
  const [displayCount, setDisplayCount] = useState(100)
  const [sortField, setSortField] = useState<SortField>('pspTxnId')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [showAccountingModal, setShowAccountingModal] = useState(false)
  const [loadingAccountingModal, setLoadingAccountingModal] = useState(false)

  // Check if accounting entries are available
  const hasAccountingEntries = credit?.accountingEntries && credit.accountingEntries.journalEntries.length > 0

  // Handler for opening accounting modal with delay
  const handleOpenAccountingModal = async () => {
    setLoadingAccountingModal(true)
    await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000)) // 2-3s delay
    setLoadingAccountingModal(false)
    setShowAccountingModal(true)
  }

  const comparisonLines = useMemo((): L2ComparisonLine[] => {
    if (!settlement?.orderLines) return []

    // Transaction dates spread across the settlement date (T) and day before (T-1)
    const settlementDate = new Date(settlement.date)
    const dayBefore = new Date(settlementDate)
    dayBefore.setDate(dayBefore.getDate() - 1)
    const dateFmt = (d: Date) => d.toISOString().split('T')[0]

    return settlement.orderLines
      .filter(line => !line.pspTxnId.startsWith('...'))
      .map((line, idx) => {
        let omsGross: number | null = null
        let grossDelta: number | null = null
        let matchStatus: 'matched' | 'mismatch' | 'no_oms_record' = 'matched'

        if (line.matchStatus === 'no_order') {
          matchStatus = 'no_oms_record'
        } else if (line.matchStatus === 'mismatch') {
          matchStatus = 'mismatch'
          omsGross = Math.round((line.gross + (Math.random() - 0.5) * 10) * 100) / 100
          grossDelta = Math.round((line.gross - omsGross) * 100) / 100
        } else {
          omsGross = line.omsGross ?? line.gross
          grossDelta = line.omsGross !== undefined && line.omsGross !== null
            ? Math.round((line.gross - line.omsGross) * 100) / 100 : 0
        }

        // ~70% on settlement date, ~30% on day before
        const txnDate = idx % 3 === 0 ? dateFmt(dayBefore) : dateFmt(settlementDate)

        return { pspTxnId: line.pspTxnId, pspOrderId: line.orderId, pspGross: line.gross,
          txnDate, omsOrderId: line.orderId, omsGross, grossDelta, matchStatus }
      })
  }, [settlement])

  const filteredLines = useMemo(() => {
    let result = comparisonLines.filter(line => {
      if (statusFilter !== 'all' && line.matchStatus !== statusFilter) return false
      if (searchTerm) {
        const s = searchTerm.toLowerCase()
        return line.pspTxnId.toLowerCase().includes(s) || (line.pspOrderId?.toLowerCase().includes(s) ?? false)
      }
      return true
    })
    result.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'pspTxnId': cmp = a.pspTxnId.localeCompare(b.pspTxnId); break
        case 'orderId': cmp = (a.pspOrderId || '').localeCompare(b.pspOrderId || ''); break
        case 'pspGross': cmp = a.pspGross - b.pspGross; break
        case 'omsGross': cmp = (a.omsGross || 0) - (b.omsGross || 0); break
        case 'delta': cmp = Math.abs(a.grossDelta || 0) - Math.abs(b.grossDelta || 0); break
        case 'status': cmp = ({ matched: 0, mismatch: 1, no_oms_record: 2 }[a.matchStatus]) - ({ matched: 0, mismatch: 1, no_oms_record: 2 }[b.matchStatus]); break
      }
      return sortDirection === 'asc' ? cmp : -cmp
    })
    return result
  }, [comparisonLines, statusFilter, searchTerm, sortField, sortDirection])

  const displayedLines = filteredLines.slice(0, displayCount)
  const hasMore = displayCount < filteredLines.length

  const stats = useMemo(() => {
    const matched = comparisonLines.filter(l => l.matchStatus === 'matched')
    const mismatch = comparisonLines.filter(l => l.matchStatus === 'mismatch')
    const noOms = comparisonLines.filter(l => l.matchStatus === 'no_oms_record')
    return {
      total: comparisonLines.length, matched: matched.length, mismatch: mismatch.length, noOms: noOms.length,
      totalPspGross: comparisonLines.reduce((s, l) => s + l.pspGross, 0),
      totalOmsGross: comparisonLines.reduce((s, l) => s + (l.omsGross || 0), 0),
      matchRate: comparisonLines.length > 0 ? (matched.length / comparisonLines.length) * 100 : 0
    }
  }, [comparisonLines])

  if (!isOpen || !settlement) return null

  const fmt = (n: number | null, compact = false): string => {
    if (n === null) return '—'
    if (compact && Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`
    if (compact && Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}K`
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const handleSort = (f: SortField) => {
    if (sortField === f) setSortDirection(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(f); setSortDirection('asc') }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60]" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-2xl max-w-6xl w-full max-h-[85vh] overflow-hidden mx-4 flex flex-col" onClick={e => e.stopPropagation()}>

        {/* HEADER - Compact */}
        <div className="bg-slate-800 px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded bg-white/10 flex items-center justify-center">
              <Layers size={14} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>L2 Transaction Reconciliation</span>
                <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, backgroundColor: 'rgba(56,189,248,0.2)', color: '#7dd3fc' }}>{settlement.pspName}</span>
              </div>
              <p style={{ fontSize: 9, color: '#94a3b8', marginTop: 1 }}>
                <span style={{ fontFamily: 'monospace' }}>{settlement.payoutRef}</span> • {settlement.date}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded transition-colors">
            <X size={14} className="text-white/70" />
          </button>
        </div>

        {/* PROGRESS BAR */}
        <div className="px-4 py-2 bg-slate-700 flex items-center gap-4">
          <div className="flex-1">
            <div className="h-1.5 bg-slate-600 rounded-full overflow-hidden flex">
              <div className="bg-emerald-500" style={{ width: `${(stats.matched / stats.total) * 100}%` }} />
              <div className="bg-red-500" style={{ width: `${(stats.mismatch / stats.total) * 100}%` }} />
              <div className="bg-amber-500" style={{ width: `${(stats.noOms / stats.total) * 100}%` }} />
            </div>
          </div>
          <span style={{ fontSize: 9, color: '#fff', fontWeight: 600 }}>{stats.matchRate.toFixed(1)}%</span>
        </div>

        {/* SUMMARY - Compact inline */}
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span style={{ fontSize: 9, color: '#64748b' }}>Total:</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#334155' }}>{stats.total.toLocaleString()}</span>
          </div>
          <div className="w-px h-3 bg-slate-300" />
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-sky-500" />
            <span style={{ fontSize: 9, color: '#64748b' }}>PSP:</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#0369a1' }}>{currency} {fmt(stats.totalPspGross, true)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-500" />
            <span style={{ fontSize: 9, color: '#64748b' }}>OMS:</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#7c3aed' }}>{currency} {fmt(stats.totalOmsGross, true)}</span>
          </div>
          <div className="w-px h-3 bg-slate-300" />
          <div className="flex items-center gap-1">
            <CheckCircle2 size={10} className="text-emerald-600" />
            <span style={{ fontSize: 9, fontWeight: 600, color: '#059669' }}>{stats.matched.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1">
            <AlertTriangle size={10} className="text-red-600" />
            <span style={{ fontSize: 9, fontWeight: 600, color: '#dc2626' }}>{stats.mismatch.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1">
            <XCircle size={10} className="text-amber-600" />
            <span style={{ fontSize: 9, fontWeight: 600, color: '#d97706' }}>{stats.noOms.toLocaleString()}</span>
          </div>
        </div>

        {/* TOOLBAR - Compact */}
        <div className="px-4 py-2 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text" placeholder="Search..." value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setDisplayCount(100) }}
                style={{ fontSize: 10, width: 160, paddingLeft: 24, paddingRight: 8, paddingTop: 4, paddingBottom: 4 }}
                className="border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <div className="flex items-center gap-0.5 bg-slate-100 rounded p-0.5">
              {[
                { key: 'all', label: 'All' },
                { key: 'matched', label: 'Match' },
                { key: 'mismatch', label: 'Var' },
                { key: 'no_oms_record', label: 'No OMS' }
              ].map(item => (
                <button key={item.key}
                  onClick={() => { setStatusFilter(item.key as typeof statusFilter); setDisplayCount(100) }}
                  style={{ fontSize: 9, padding: '3px 8px', borderRadius: 3, fontWeight: statusFilter === item.key ? 600 : 400 }}
                  className={statusFilter === item.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}
                >{item.label}</button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => {}} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded" title="Refresh">
              <RefreshCw size={12} />
            </button>
            <button onClick={() => {}} className="flex items-center gap-1 px-2 py-1 bg-white border border-slate-300 text-slate-600 rounded hover:bg-slate-50" style={{ fontSize: 9 }}>
              <Download size={10} /> Export
            </button>
          </div>
        </div>

        {/* TABLE */}
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse" style={{ fontSize: 9 }}>
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-100">
                <th style={{ width: 28, padding: '6px 4px', borderBottom: '1px solid #e2e8f0' }}>#</th>
                <th colSpan={4} style={{ padding: '4px 8px', borderBottom: '1px solid #e2e8f0', borderLeft: '2px solid #38bdf8' }}>
                  <div className="flex items-center gap-1">
                    <FileText size={9} className="text-sky-600" />
                    <span style={{ fontSize: 8, fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.05em' }}>PSP File</span>
                  </div>
                </th>
                <th colSpan={2} style={{ padding: '4px 8px', borderBottom: '1px solid #e2e8f0', borderLeft: '2px solid #8b5cf6' }}>
                  <div className="flex items-center gap-1">
                    <Database size={9} className="text-violet-600" />
                    <span style={{ fontSize: 8, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.05em' }}>OMS</span>
                  </div>
                </th>
                <th colSpan={2} style={{ padding: '4px 8px', borderBottom: '1px solid #e2e8f0', borderLeft: '2px solid #cbd5e1' }}>
                  <span style={{ fontSize: 8, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Result</span>
                </th>
              </tr>
              <tr className="bg-slate-50">
                <th style={{ padding: '4px', borderBottom: '1px solid #e2e8f0' }} />
                <th onClick={() => handleSort('pspTxnId')} className="cursor-pointer hover:bg-slate-100"
                  style={{ padding: '4px 6px', textAlign: 'left', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' }}>
                  Txn ID {sortField === 'pspTxnId' && <ArrowUpDown size={8} className="inline ml-0.5 text-sky-600" />}
                </th>
                <th style={{ padding: '4px 6px', textAlign: 'left', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' }}>Txn Date</th>
                <th style={{ padding: '4px 6px', textAlign: 'left', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' }}>Order</th>
                <th onClick={() => handleSort('pspGross')} className="cursor-pointer hover:bg-slate-100"
                  style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', borderLeft: '1px solid #e2e8f0' }}>
                  Gross {sortField === 'pspGross' && <ArrowUpDown size={8} className="inline ml-0.5 text-sky-600" />}
                </th>
                <th style={{ padding: '4px 6px', textAlign: 'left', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', borderLeft: '2px solid #8b5cf6' }}>Order</th>
                <th onClick={() => handleSort('omsGross')} className="cursor-pointer hover:bg-slate-100"
                  style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' }}>
                  Gross {sortField === 'omsGross' && <ArrowUpDown size={8} className="inline ml-0.5 text-violet-600" />}
                </th>
                <th onClick={() => handleSort('delta')} className="cursor-pointer hover:bg-slate-100"
                  style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', borderLeft: '2px solid #cbd5e1' }}>
                  Delta {sortField === 'delta' && <ArrowUpDown size={8} className="inline ml-0.5" />}
                </th>
                <th style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {displayedLines.map((line, i) => {
                const isExpanded = expandedRow === line.pspTxnId
                return (
                  <React.Fragment key={`${line.pspTxnId}-${i}`}>
                    <tr className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                      line.matchStatus === 'mismatch' ? 'bg-red-50/40' : line.matchStatus === 'no_oms_record' ? 'bg-amber-50/40' : ''
                    }`}>
                      <td style={{ padding: '4px 6px', color: '#94a3b8', textAlign: 'center' }}>{i + 1}</td>
                      <td style={{ padding: '4px 6px', borderLeft: '2px solid #e0f2fe' }}>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setExpandedRow(isExpanded ? null : line.pspTxnId)} className="p-0.5 hover:bg-slate-200 rounded">
                            {isExpanded ? <ChevronDown size={10} className="text-slate-400" /> : <ChevronRight size={10} className="text-slate-400" />}
                          </button>
                          <span style={{ fontFamily: 'monospace', color: '#0284c7', fontWeight: 500 }}>{line.pspTxnId}</span>
                        </div>
                      </td>
                      <td style={{ padding: '4px 6px', fontFamily: 'monospace', color: '#64748b' }}>
                        {new Date(line.txnDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                      </td>
                      <td style={{ padding: '4px 6px', fontFamily: 'monospace', color: '#475569' }}>{line.pspOrderId || '—'}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#0369a1', borderLeft: '1px solid #f1f5f9' }}>{fmt(line.pspGross)}</td>
                      <td style={{ padding: '4px 6px', fontFamily: 'monospace', color: line.matchStatus === 'no_oms_record' ? '#94a3b8' : '#475569', fontStyle: line.matchStatus === 'no_oms_record' ? 'italic' : 'normal', borderLeft: '2px solid #ede9fe' }}>
                        {line.matchStatus === 'no_oms_record' ? 'Not found' : (line.omsOrderId || '—')}
                      </td>
                      <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: line.omsGross !== null ? '#7c3aed' : '#94a3b8' }}>{fmt(line.omsGross)}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, borderLeft: '2px solid #f1f5f9',
                        color: line.grossDelta === null ? '#94a3b8' : line.grossDelta === 0 ? '#059669' : '#dc2626' }}>
                        {line.grossDelta === null ? '—' : line.grossDelta === 0 ? '0.00' : (line.grossDelta > 0 ? '+' : '') + fmt(line.grossDelta)}
                      </td>
                      <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                        {line.matchStatus === 'matched' && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '1px 5px', borderRadius: 9999, fontSize: 8, fontWeight: 600, backgroundColor: '#d1fae5', color: '#047857' }}>
                            <CheckCircle2 size={8} /> OK
                          </span>
                        )}
                        {line.matchStatus === 'mismatch' && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '1px 5px', borderRadius: 9999, fontSize: 8, fontWeight: 600, backgroundColor: '#fee2e2', color: '#b91c1c' }}>
                            <AlertTriangle size={8} /> Var
                          </span>
                        )}
                        {line.matchStatus === 'no_oms_record' && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '1px 5px', borderRadius: 9999, fontSize: 8, fontWeight: 600, backgroundColor: '#fef3c7', color: '#b45309' }}>
                            <XCircle size={8} /> Miss
                          </span>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50">
                        <td colSpan={9} style={{ padding: '8px 12px' }}>
                          <div className="grid grid-cols-3 gap-4" style={{ marginLeft: 24 }}>
                            <div className="bg-white rounded border border-slate-200 p-2">
                              <p style={{ fontSize: 8, fontWeight: 600, color: '#0369a1', marginBottom: 4 }}>PSP Record</p>
                              <div style={{ fontSize: 9, color: '#475569' }}>
                                <div className="flex justify-between"><span>Txn ID:</span><span style={{ fontFamily: 'monospace' }}>{line.pspTxnId}</span></div>
                                <div className="flex justify-between"><span>Order:</span><span style={{ fontFamily: 'monospace' }}>{line.pspOrderId || '—'}</span></div>
                                <div className="flex justify-between"><span>Gross:</span><span style={{ fontWeight: 600, color: '#0369a1' }}>{currency} {fmt(line.pspGross)}</span></div>
                              </div>
                            </div>
                            <div className="bg-white rounded border border-slate-200 p-2">
                              <p style={{ fontSize: 8, fontWeight: 600, color: '#7c3aed', marginBottom: 4 }}>OMS Record</p>
                              {line.matchStatus === 'no_oms_record' ? (
                                <p style={{ fontSize: 9, color: '#d97706', fontStyle: 'italic' }}>No matching record</p>
                              ) : (
                                <div style={{ fontSize: 9, color: '#475569' }}>
                                  <div className="flex justify-between"><span>Order:</span><span style={{ fontFamily: 'monospace' }}>{line.omsOrderId || '—'}</span></div>
                                  <div className="flex justify-between"><span>Gross:</span><span style={{ fontWeight: 600, color: '#7c3aed' }}>{currency} {fmt(line.omsGross)}</span></div>
                                </div>
                              )}
                            </div>
                            <div className={`rounded border p-2 ${line.matchStatus === 'matched' ? 'bg-emerald-50 border-emerald-200' : line.matchStatus === 'mismatch' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                              <p style={{ fontSize: 8, fontWeight: 600, color: line.matchStatus === 'matched' ? '#047857' : line.matchStatus === 'mismatch' ? '#b91c1c' : '#b45309', marginBottom: 4 }}>
                                {line.matchStatus === 'matched' ? 'Matched' : line.matchStatus === 'mismatch' ? 'Variance' : 'Missing'}
                              </p>
                              {line.grossDelta !== null && line.grossDelta !== 0 && (
                                <p style={{ fontSize: 9, color: '#dc2626' }}>Delta: {currency} {fmt(Math.abs(line.grossDelta))}</p>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* FOOTER - Compact */}
        <div className="border-t border-slate-200 px-4 py-2 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span style={{ fontSize: 9, color: '#64748b' }}>
              {displayedLines.length.toLocaleString()} of {filteredLines.length.toLocaleString()}
            </span>
            {hasMore && (
              <button onClick={() => setDisplayCount(p => Math.min(p + 200, filteredLines.length))}
                style={{ fontSize: 9, padding: '2px 8px' }}
                className="bg-white border border-slate-300 text-slate-600 rounded hover:bg-slate-50">
                Load More
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1" style={{ fontSize: 9, color: '#94a3b8' }}>
              <Clock size={10} /> Just now
            </div>
            {hasAccountingEntries && (
              <button
                onClick={handleOpenAccountingModal}
                disabled={loadingAccountingModal}
                style={{ fontSize: 10, padding: '4px 12px' }}
                className={`flex items-center gap-1.5 rounded font-medium transition-colors ${
                  loadingAccountingModal
                    ? 'bg-emerald-400 text-white cursor-wait'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                {loadingAccountingModal ? (
                  <>
                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Loading...
                  </>
                ) : (
                  <>
                    <BookOpen size={12} />
                    View Accounting Entries
                  </>
                )}
              </button>
            )}
            <button onClick={onClose} style={{ fontSize: 10, padding: '4px 12px' }}
              className="bg-slate-700 text-white rounded hover:bg-slate-600 font-medium">
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Accounting Entries Modal */}
      {hasAccountingEntries && credit?.accountingEntries && (
        <AccountingEntriesModal
          isOpen={showAccountingModal}
          onClose={() => setShowAccountingModal(false)}
          creditId={credit.id}
          creditAmount={credit.amount}
          currency={credit.currency}
          journalEntries={credit.accountingEntries.journalEntries}
          postedDate={credit.accountingEntries.postedDate}
          postedBy={credit.accountingEntries.postedBy}
        />
      )}
    </div>
  )
}
