/**
 * Settlement Detail Modal
 * 3-Level Drill-Down: Bank Credit → PSP Settlements → Transaction Lines
 *
 * Shows:
 * - Bank credit summary
 * - Matched PSP settlements (expandable accordions)
 * - Gross-to-net waterfall for each settlement
 * - Transaction line items
 * - Reconciliation summary and variance analysis
 */

import React, { useState, useEffect } from 'react'
import { X, ChevronDown, ChevronRight, AlertCircle, CheckCircle, TrendingDown, Ticket, MessageSquare, Clock, Table2, BookOpen, HelpCircle, Loader2 } from 'lucide-react'
import { ticketsService } from '../../services'
import type { Ticket as TicketType, SettlementPayoutDetail } from '../../types/domain'
import type { BankCreditRecordDetail } from '../../types/domain'
import type { JournalEntry, ApprovalMetadata } from '../../types/exceptions'
import { Badge, type BadgeVariant } from '../ui/Badge'
import { WaterfallChart } from '../ui/WaterfallChart'
import { JournalEntryPreviewModal } from './JournalEntryPreviewModal'
import { TransactionLinesComparisonModal } from './TransactionLinesComparisonModal'
import { AccountingEntriesModal } from './AccountingEntriesModal'
import { RaiseQueryModal, type NewTicketData } from './RaiseQueryModal'

interface SettlementDetailModalProps {
  credit: BankCreditRecordDetail | null
  isOpen: boolean
  onClose: () => void
  onAction: (action: string, creditId: string, data?: any) => void
}

export const SettlementDetailModal: React.FC<SettlementDetailModalProps> = ({
  credit,
  isOpen,
  onClose,
  onAction
}) => {
  const [expandedSettlements, setExpandedSettlements] = useState<Set<string>>(new Set())
  const [showTransactions, setShowTransactions] = useState<Set<string>>(new Set())
  const [relatedTickets, setRelatedTickets] = useState<TicketType[]>([])
  const [showVarianceJournalModal, setShowVarianceJournalModal] = useState(false)
  const [showL2ComparisonModal, setShowL2ComparisonModal] = useState(false)
  const [selectedSettlementForComparison, setSelectedSettlementForComparison] = useState<SettlementPayoutDetail | null>(null)
  const [showAccountingModal, setShowAccountingModal] = useState(false)
  const [loadingL2Modal, setLoadingL2Modal] = useState(false)
  const [loadingAccountingModal, setLoadingAccountingModal] = useState(false)
  const [showRaiseQueryModal, setShowRaiseQueryModal] = useState(false)
  const [loadingRaiseQuery, setLoadingRaiseQuery] = useState(false)
  const [createdTicketId, setCreatedTicketId] = useState<string | null>(null)
  const [isPostingToERP, setIsPostingToERP] = useState(false)
  const [erpPostingSuccess, setErpPostingSuccess] = useState<{
    materialDocNo: string
    postingDate: string
    companyCode: string
    variance: number
    currency: string
  } | null>(null)
  const [l2ReconStarted, setL2ReconStarted] = useState(false)

  // Handler for opening raise query modal with delay
  const handleOpenRaiseQueryModal = async () => {
    setLoadingRaiseQuery(true)
    await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000)) // 2-3s delay
    setLoadingRaiseQuery(false)
    setShowRaiseQueryModal(true)
  }

  // Handler for ticket creation
  const handleCreateTicket = async (ticketData: NewTicketData) => {
    try {
      const newTicket = await ticketsService.createTicket({
        subject: ticketData.subject,
        description: ticketData.description,
        category: ticketData.category,
        priority: ticketData.priority,
        pspId: ticketData.pspId,
        pspName: ticketData.pspName,
        relatedRecordId: ticketData.creditId,
        relatedRecordType: 'bank_credit',
        amount: ticketData.creditAmount,
        currency: ticketData.currency,
      })
      setCreatedTicketId(newTicket.id)
      setShowRaiseQueryModal(false)
      // Refresh related tickets
      const allTickets = await ticketsService.getTickets({})
      const related = allTickets.filter(t =>
        t.relatedRecordId === credit?.id ||
        t.relatedRecordId?.includes(credit?.id.split('-').slice(-1)[0] || '')
      )
      setRelatedTickets(related)
    } catch (error) {
      console.error('Failed to create ticket:', error)
    }
  }

  // Check if accounting entries are available
  const hasAccountingEntries = credit?.accountingEntries && credit.accountingEntries.journalEntries.length > 0

  // Handler for opening L2 comparison modal with delay
  const handleOpenL2Modal = async (settlement: SettlementPayoutDetail) => {
    setLoadingL2Modal(true)
    setSelectedSettlementForComparison(settlement)
    await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000)) // 2-3s delay
    setLoadingL2Modal(false)
    setShowL2ComparisonModal(true)
  }

  // Handler for opening accounting modal with delay
  const handleOpenAccountingModal = async () => {
    setLoadingAccountingModal(true)
    await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000)) // 2-3s delay
    setLoadingAccountingModal(false)
    setShowAccountingModal(true)
  }

  // Export reconciliation data as CSV
  const handleExportCSV = () => {
    if (!credit) return

    const rows: string[][] = []
    const addRow = (...cells: (string | number)[]) => rows.push(cells.map(c => String(c)))
    const addBlank = () => rows.push([])
    const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

    // -- Header --
    addRow('RECONCILIATION EXPORT REPORT')
    addRow('Generated', new Date().toISOString().replace('T', ' ').substring(0, 19))
    addRow('Credit ID', credit.id)
    addBlank()

    // -- Bank Credit Summary --
    addRow('BANK CREDIT SUMMARY')
    addRow('Field', 'Value')
    addRow('Credit ID', credit.id)
    addRow('Bank Account', credit.bankAccount)
    addRow('Value Date', credit.valueDate)
    addRow('Bank Credit Amount', `${credit.currency} ${fmt(credit.amount)}`)
    addRow('PSP', credit.mappedPSP?.toUpperCase() || 'N/A')
    addRow('Payout Reference', credit.payoutRef || 'N/A')
    addRow('Narration', credit.narration || '')
    addRow('Reconciliation Status', credit.reconciliationStatus.replace(/_/g, ' ').toUpperCase())
    addRow('L1 Status', credit.l1Status.replace(/_/g, ' ').toUpperCase())
    addRow('L1 Variance', `${credit.currency} ${fmt(credit.l1Variance)}`)
    addRow('L2 Status', credit.l2Status.replace(/_/g, ' ').toUpperCase())
    addRow('L2 Exception Count', credit.l2ExceptionCount)
    addRow('PSP Net Amount', credit.pspNetAmount !== null ? `${credit.currency} ${fmt(credit.pspNetAmount)}` : 'N/A')
    addRow('PSP File Received', credit.pspFileReceived ? 'Yes' : 'No')
    addRow('Mapping Confidence', `${credit.mappingConfidence}%`)
    addRow('Age', credit.age)

    const settlementTotal = credit.matchedSettlements.reduce((sum, s) => sum + (s.settlementTotal || 0), 0)
    addRow('Sum of Settlement Nets', `${credit.currency} ${fmt(settlementTotal)}`)
    addRow('Variance (Bank - Settlements)', `${credit.currency} ${fmt(credit.amount - settlementTotal)}`)
    addBlank()

    // -- Settlement Details --
    if (credit.matchedSettlements.length > 0) {
      addRow('MATCHED SETTLEMENTS', `(${credit.matchedSettlements.length} total)`)
      addRow(
        'Payout Ref', 'PSP', 'Date', 'Currency',
        'Gross Txn Value', 'MDR Fee', 'MDR %',
        'Tax on MDR', 'Tax %',
        'FX Margin', 'FX %',
        'Rolling Reserve', 'Reserve %',
        'Reserve Release',
        'Expected Net', 'Actual Net (Settlement Total)',
        'L1 Variance', 'Order Count', 'Status'
      )

      credit.matchedSettlements.forEach(s => {
        const w = s.grossToNet
        addRow(
          s.payoutRef, s.pspName, s.date, s.currency,
          fmt(w.grossTransactionValue), fmt(w.mdrFee), `${w.mdrFeePercent.toFixed(2)}%`,
          fmt(w.taxOnMDR), `${w.taxOnMDRPercent.toFixed(2)}%`,
          fmt(w.fxMargin), `${w.fxMarginPercent.toFixed(2)}%`,
          fmt(w.rollingReserve), `${w.rollingReservePercent.toFixed(2)}%`,
          fmt(w.reserveRelease),
          fmt(w.expectedNet), fmt(s.settlementTotal || 0),
          fmt(w.l1Variance), s.orderCount, s.status
        )
      })
      addBlank()

      // -- Transaction Lines per settlement --
      credit.matchedSettlements.forEach(s => {
        if (s.orderLines && s.orderLines.length > 0) {
          addRow(`TRANSACTION LINES - ${s.payoutRef}`, `(${s.orderLines.length} transactions)`)
          addRow('PSP Txn ID', 'Order ID', 'Gross', 'MDR', 'Net', 'Match Status', 'OMS Gross', 'Variance')

          // Export all lines (capped at 5000 for file size sanity)
          const linesToExport = s.orderLines.slice(0, 5000)
          linesToExport.forEach(line => {
            const omsGross = line.omsGross !== undefined && line.omsGross !== null ? fmt(line.omsGross) : ''
            const lineVariance = line.varianceDetail
              ? fmt(line.varianceDetail.variance)
              : (line.omsGross !== undefined && line.omsGross !== null ? fmt(line.gross - line.omsGross) : '')
            addRow(
              line.pspTxnId,
              line.orderId || 'N/A',
              fmt(line.gross),
              fmt(line.mdr),
              fmt(line.net),
              line.matchStatus,
              omsGross,
              lineVariance
            )
          })
          if (s.orderLines.length > 5000) {
            addRow(`... ${s.orderLines.length - 5000} more transactions truncated`)
          }
          addBlank()
        }
      })
    } else {
      addRow('MATCHED SETTLEMENTS', 'None')
      addBlank()
    }

    // -- Journal Entries --
    if (credit.accountingEntries && credit.accountingEntries.journalEntries.length > 0) {
      addRow('JOURNAL ENTRIES')
      addRow('Posted Date', credit.accountingEntries.postedDate)
      addRow('Posted By', credit.accountingEntries.postedBy)
      addBlank()

      credit.accountingEntries.journalEntries.forEach(je => {
        addRow(`Entry #${je.entryNumber}: ${je.description}`)
        addRow('Posting Date', je.postingDate, 'Document Type', je.documentType)
        addRow('Line #', 'Account', 'Account Name', 'Debit/Credit', 'Amount', 'Currency', 'Reference')
        je.lines.forEach(line => {
          addRow(
            line.lineNumber,
            line.account,
            line.accountName,
            line.debitCredit.toUpperCase(),
            fmt(line.amount),
            line.currency,
            line.reference || ''
          )
        })
        addBlank()
      })
    }

    // Build CSV string with proper escaping
    const csvContent = rows.map(row =>
      row.map(cell => {
        const str = String(cell)
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`
        }
        return str
      }).join(',')
    ).join('\n')

    // Trigger download
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `reconciliation_${credit.id}_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Fetch related tickets when modal opens
  useEffect(() => {
    const fetchRelatedTickets = async () => {
      if (isOpen && credit) {
        try {
          const allTickets = await ticketsService.getTickets({})
          // Filter tickets that reference this bank credit
          const related = allTickets.filter(t =>
            t.relatedRecordId === credit.id ||
            t.relatedRecordId?.includes(credit.id.split('-').slice(-1)[0]) // Match by credit number suffix
          )
          setRelatedTickets(related)
        } catch (error) {
          console.error('Failed to fetch related tickets:', error)
        }
      }
    }
    fetchRelatedTickets()
  }, [isOpen, credit])

  if (!isOpen || !credit) return null

  // Toggle settlement accordion
  const toggleSettlement = (payoutRef: string) => {
    const newExpanded = new Set(expandedSettlements)
    if (newExpanded.has(payoutRef)) {
      newExpanded.delete(payoutRef)
      // Also hide transactions when collapsing settlement
      const newShowTxn = new Set(showTransactions)
      newShowTxn.delete(payoutRef)
      setShowTransactions(newShowTxn)
    } else {
      newExpanded.add(payoutRef)
    }
    setExpandedSettlements(newExpanded)
  }

  // Toggle transaction table visibility
  const toggleTransactions = (payoutRef: string) => {
    const newShowTxn = new Set(showTransactions)
    if (newShowTxn.has(payoutRef)) {
      newShowTxn.delete(payoutRef)
    } else {
      newShowTxn.add(payoutRef)
    }
    setShowTransactions(newShowTxn)
  }

  // Calculate settlement totals
  const settlementSum = credit.matchedSettlements.reduce((sum, s) => sum + (s.settlementTotal || 0), 0)
  const variance = credit.amount - settlementSum
  const variancePercent = credit.amount > 0 ? (variance / credit.amount) * 100 : 0

  const formatCurrency = (amount: number, currency: string = credit.currency): string => {
    if (currency === 'IDR') {
      return `${currency} ${(amount / 1000000).toFixed(2)}M`
    }
    return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const getStatusBadgeVariant = (status: string): BadgeVariant => {
    switch (status) {
      case 'reconciled':
        return 'matched'
      case 'matched_l1':
        return 'in_transit'
      case 'unmatched':
        return 'exception'
      case 'partial':
        return 'pending'
      default:
        return 'pending'
    }
  }

  const getMatchStatusBadgeVariant = (status: string): BadgeVariant => {
    switch (status) {
      case 'matched':
        return 'matched'
      case 'unmatched':
        return 'exception'
      case 'mismatched':
        return 'pending'
      default:
        return 'pending'
    }
  }

  // Group settlements by PSP for better display
  const groupedSettlements = credit.matchedSettlements.reduce((acc, settlement) => {
    if (!acc[settlement.pspId]) {
      acc[settlement.pspId] = []
    }
    acc[settlement.pspId].push(settlement)
    return acc
  }, {} as Record<string, typeof credit.matchedSettlements>)

  const uniquePSPs = Object.keys(groupedSettlements)

  return (
    <div
      className="fixed inset-0 bg-white/20 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[80vh] overflow-y-auto mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between z-10">
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#101828', marginBottom: 2 }}>
              Bank Credit Detail
            </h2>
            <p style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace' }}>
              {credit.id} • {formatDate(credit.valueDate)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Bank Credit Summary Card */}
          <div className="grid grid-cols-4 gap-3">
            <div>
              <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>
                Bank Account
              </p>
              <p style={{ fontSize: 10, fontWeight: 600, color: '#101828', fontFamily: 'monospace' }}>
                {credit.bankAccount}
              </p>
              <p style={{ fontSize: 9, color: '#64748b', marginTop: 1 }}>
                {formatDate(credit.valueDate)}
              </p>
            </div>
            <div>
              <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>
                Credit Amount
              </p>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#0369a1', fontFamily: 'monospace' }}>
                {formatCurrency(credit.amount)}
              </p>
            </div>
            <div>
              <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>
                PSP
              </p>
              <div className="flex items-center gap-1.5">
                {credit.mappedPSP ? (
                  <>
                    <Badge variant="in_transit">{credit.mappedPSP.toUpperCase()}</Badge>
                    <span style={{ fontSize: 9, color: '#64748b' }}>
                      {credit.mappingConfidence}%
                    </span>
                  </>
                ) : (
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>—</span>
                )}
              </div>
              {uniquePSPs.length > 1 && (
                <p style={{ fontSize: 9, color: '#64748b', marginTop: 1 }}>
                  Multiple ({uniquePSPs.join(', ')})
                </p>
              )}
            </div>
            <div>
              <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>
                Status
              </p>
              {l2ReconStarted ? (
                <Badge variant="in_transit">L2 RECON IN PROGRESS</Badge>
              ) : (
                <Badge variant={getStatusBadgeVariant(credit.reconciliationStatus)}>
                  {credit.reconciliationStatus.toUpperCase().replace('_', ' ')}
                </Badge>
              )}
              <p style={{ fontSize: 9, color: '#64748b', marginTop: 1 }}>
                Age: {credit.age}
              </p>
            </div>
          </div>

          {/* Reconciliation Summary Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <h3 style={{ fontSize: 10, fontWeight: 700, color: '#475569', marginBottom: 10, textTransform: 'uppercase' }}>
              Reconciliation Summary
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>
                  Bank Credit
                </p>
                <p style={{ fontSize: 16, fontWeight: 700, color: '#0369a1', fontFamily: 'monospace' }}>
                  {formatCurrency(credit.amount)}
                </p>
              </div>
              <div>
                <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>
                  Settlement Total
                </p>
                <p style={{ fontSize: 16, fontWeight: 700, color: '#475569', fontFamily: 'monospace' }}>
                  {formatCurrency(settlementSum)}
                </p>
                <p style={{ fontSize: 9, color: '#64748b', marginTop: 1 }}>
                  {credit.matchedSettlements.length} settlement{credit.matchedSettlements.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div>
                <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>
                  Variance
                </p>
                <p style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: Math.abs(variance) < 0.01 ? '#059669' : Math.abs(variancePercent) < 0.5 ? '#d97706' : '#dc2626',
                  fontFamily: 'monospace'
                }}>
                  {variance >= 0 ? '+' : ''}{formatCurrency(variance)}
                </p>
                <p style={{ fontSize: 9, color: '#64748b', marginTop: 1 }}>
                  {variancePercent >= 0 ? '+' : ''}{variancePercent.toFixed(2)}%
                  {Math.abs(variancePercent) < 0.5 && ' ✓ Within tolerance'}
                </p>
              </div>
            </div>
          </div>

          {/* L2 Reconciliation Started Banner */}
          {l2ReconStarted && (
            <div className="bg-sky-50 border border-sky-200 rounded-lg p-3">
              <div className="flex items-center gap-3">
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', backgroundColor: '#e0f2fe',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  <Loader2 size={16} className="animate-spin text-sky-600" />
                </div>
                <div className="flex-1">
                  <h4 style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', marginBottom: 2 }}>
                    L2 Reconciliation Started
                  </h4>
                  <p style={{ fontSize: 10, color: '#0c4a6e' }}>
                    Matching {credit.matchedSettlements.reduce((sum, s) => sum + s.orderCount, 0).toLocaleString()} PSP transaction lines against OMS order records. This process typically takes 2-5 minutes.
                  </p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: 9, fontWeight: 600, color: '#0369a1', textTransform: 'uppercase' }}>Status</p>
                  <p style={{ fontSize: 10, fontWeight: 600, color: '#d97706' }}>In Progress</p>
                </div>
              </div>
            </div>
          )}

          {/* Matched Settlements Section */}
          {credit.matchedSettlements.length > 0 ? (
            <div>
              <h3 style={{ fontSize: 11, fontWeight: 700, color: '#101828', marginBottom: 8 }}>
                Matched Settlements ({credit.matchedSettlements.length})
              </h3>

              <div className="space-y-2">
                {credit.matchedSettlements.map((settlement) => {
                  const isExpanded = expandedSettlements.has(settlement.payoutRef)
                  const showTxn = showTransactions.has(settlement.payoutRef)

                  return (
                    <div key={settlement.payoutRef} className="border border-slate-200 rounded-lg overflow-hidden">
                      {/* Settlement Summary Row - Clickable */}
                      <div
                        className="flex items-center justify-between p-2.5 cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => toggleSettlement(settlement.payoutRef)}
                      >
                        <div className="flex items-center gap-2 flex-1">
                          {/* Expand/Collapse Icon */}
                          <div className="text-slate-400">
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </div>

                          {/* PSP Badge */}
                          <Badge variant="in_transit">{settlement.pspName}</Badge>

                          {/* Payout Ref */}
                          <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#0ea5e9', fontWeight: 600 }}>
                            {settlement.payoutRef}
                          </span>

                          {/* Order Count */}
                          {settlement.orderCount > 0 && (
                            <span style={{ fontSize: 9, color: '#64748b' }}>
                              • {settlement.orderCount.toLocaleString()} orders
                            </span>
                          )}

                          {/* Settlement Date */}
                          <span style={{ fontSize: 9, color: '#94a3b8' }}>
                            • {formatDate(settlement.date)}
                          </span>
                        </div>

                        {/* Net Amount */}
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase' }}>
                              Net Amount
                            </p>
                            <p style={{ fontSize: 12, fontWeight: 700, color: '#0369a1', fontFamily: 'monospace' }}>
                              {formatCurrency(settlement.settlementTotal || 0, settlement.currency)}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Expanded Content - Waterfall + Transactions */}
                      {isExpanded && (
                        <div className="border-t border-slate-200 bg-slate-50 p-3">
                          {/* Gross-to-Net Waterfall */}
                          <WaterfallChart
                            waterfall={settlement.grossToNet}
                            currency={settlement.currency}
                            compact={false}
                          />

                          {/* Transaction Lines Toggle */}
                          {settlement.orderLines && settlement.orderLines.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-200">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleTransactions(settlement.payoutRef)
                                }}
                                className="flex items-center gap-1.5 px-2 py-1.5 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors"
                                style={{ fontSize: 10, fontWeight: 600, color: '#475569' }}
                              >
                                {showTxn ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                {showTxn ? 'Hide' : 'View'} Transaction Lines ({settlement.orderLines.length})
                              </button>

                              {/* Transaction Table */}
                              {showTxn && (
                                <div className="mt-3 overflow-x-auto">
                                  <table className="w-full text-left border-collapse">
                                    <thead>
                                      <tr className="border-b border-slate-300 bg-white">
                                        <th style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', padding: '6px 8px' }}>
                                          PSP Txn ID
                                        </th>
                                        <th style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', padding: '6px 8px' }}>
                                          Order ID
                                        </th>
                                        <th style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', padding: '6px 8px', textAlign: 'right' }}>
                                          Gross
                                        </th>
                                        <th style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', padding: '6px 8px', textAlign: 'right' }}>
                                          MDR
                                        </th>
                                        <th style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', padding: '6px 8px', textAlign: 'right' }}>
                                          Net
                                        </th>
                                        <th style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', padding: '6px 8px' }}>
                                          Status
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {settlement.orderLines.map((line, index) => {
                                        const isSummaryRow = line.pspTxnId.startsWith('...')
                                        return (
                                          <tr
                                            key={line.pspTxnId}
                                            className={`border-b border-slate-200 ${isSummaryRow ? 'bg-sky-50 font-semibold' : 'hover:bg-white'} transition-colors`}
                                          >
                                            <td style={{ fontSize: 9, fontFamily: 'monospace', color: isSummaryRow ? '#0369a1' : '#0ea5e9', padding: '6px 8px', fontWeight: isSummaryRow ? 600 : 400 }}>
                                              {line.pspTxnId}
                                            </td>
                                            <td style={{ fontSize: 9, fontFamily: 'monospace', color: '#475569', padding: '6px 8px', fontStyle: isSummaryRow ? 'italic' : 'normal' }}>
                                              {line.orderId || '—'}
                                            </td>
                                            <td style={{ fontSize: 9, fontFamily: 'monospace', color: '#475569', padding: '6px 8px', textAlign: 'right', fontWeight: isSummaryRow ? 700 : 400 }}>
                                              {formatCurrency(line.gross, settlement.currency)}
                                            </td>
                                            <td style={{ fontSize: 9, fontFamily: 'monospace', color: '#dc2626', padding: '6px 8px', textAlign: 'right', fontWeight: isSummaryRow ? 700 : 400 }}>
                                              {formatCurrency(line.mdr, settlement.currency)}
                                            </td>
                                            <td style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: isSummaryRow ? 700 : 600, color: '#0369a1', padding: '6px 8px', textAlign: 'right' }}>
                                              {formatCurrency(line.net, settlement.currency)}
                                            </td>
                                            <td style={{ padding: '6px 8px' }}>
                                              {!isSummaryRow && (
                                                <Badge variant={getMatchStatusBadgeVariant(line.matchStatus)}>
                                                  {line.matchStatus}
                                                </Badge>
                                              )}
                                            </td>
                                          </tr>
                                        )
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            // No Settlements Found
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
              <AlertCircle size={24} className="text-amber-600 mx-auto mb-2" />
              <h3 style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>
                No Settlements Matched
              </h3>
              <p style={{ fontSize: 10, color: '#78350f' }}>
                This bank credit has not been matched to any settlement reports yet.
              </p>
            </div>
          )}

          {/* Related Exceptions (if any) */}
          {credit.exceptions && credit.exceptions.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertCircle size={14} className="text-red-600 mt-0.5" />
                <div className="flex-1">
                  <h3 style={{ fontSize: 10, fontWeight: 700, color: '#991b1b', marginBottom: 8 }}>
                    🔗 Related Exceptions ({credit.exceptions.length})
                  </h3>
                  <div className="space-y-1.5">
                    {credit.exceptions.map((exception, index) => (
                      <a
                        key={index}
                        href={`/cash-app-v2/exceptions?exceptionId=${exception.id}`}
                        className="flex items-center justify-between p-2 bg-white rounded border border-red-300 hover:border-red-500 hover:bg-red-50 transition-all cursor-pointer group"
                        onClick={(e) => {
                          e.preventDefault()
                          window.location.href = `/cash-app-v2/exceptions?exceptionId=${exception.id}`
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded bg-red-100 flex items-center justify-center">
                            <AlertCircle size={12} className="text-red-700" />
                          </div>
                          <div>
                            <p style={{ fontSize: 10, fontWeight: 600, color: '#991b1b' }}>
                              {exception.type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                            </p>
                            <p style={{ fontSize: 9, color: '#7f1d1d' }}>
                              Ref: {exception.referenceId}
                            </p>
                            <p style={{ fontSize: 9, color: '#991b1b', fontFamily: 'monospace', marginTop: 1 }}>
                              {exception.id}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Badge variant={exception.status === 'open' ? 'exception' : exception.status === 'escalated' ? 'pending' : 'matched'}>
                            {exception.status.toUpperCase().replace('_', ' ')}
                          </Badge>
                          <span className="text-red-600 group-hover:translate-x-1 transition-transform">→</span>
                        </div>
                      </a>
                    ))}
                  </div>
                  <div className="mt-2 pt-2 border-t border-red-200">
                    <p style={{ fontSize: 9, color: '#7f1d1d' }}>
                      💡 Click to view full exception details
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Related Tickets (if any) */}
          {relatedTickets.length > 0 && (
            <div className="bg-sky-50 border border-sky-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <Ticket size={14} className="text-sky-600 mt-0.5" />
                <div className="flex-1">
                  <h3 style={{ fontSize: 10, fontWeight: 700, color: '#0369a1', marginBottom: 8 }}>
                    🎫 Related Tickets ({relatedTickets.length})
                  </h3>
                  <div className="space-y-1.5">
                    {relatedTickets.map((ticket) => (
                      <a
                        key={ticket.id}
                        href={`/cash-app-v2/audit?tab=tickets&ticketId=${ticket.id}`}
                        className="flex items-center justify-between p-2 bg-white rounded border border-sky-300 hover:border-sky-500 hover:bg-sky-50 transition-all cursor-pointer group"
                        onClick={(e) => {
                          e.preventDefault()
                          window.location.href = `/cash-app-v2/audit?tab=tickets&ticketId=${ticket.id}`
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded bg-sky-100 flex items-center justify-center">
                            <MessageSquare size={12} className="text-sky-700" />
                          </div>
                          <div>
                            <p style={{ fontSize: 10, fontWeight: 600, color: '#0369a1' }}>
                              {ticket.subject}
                            </p>
                            <p style={{ fontSize: 9, color: '#0c4a6e' }}>
                              {ticket.pspName} • {ticket.responseCount} messages
                            </p>
                            <p style={{ fontSize: 9, color: '#0369a1', fontFamily: 'monospace', marginTop: 1 }}>
                              {ticket.id}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 600,
                              padding: '2px 6px',
                              borderRadius: 3,
                              backgroundColor: ticket.status === 'escalated' ? '#fee2e2' : ticket.status === 'in_progress' ? '#ffedd5' : ticket.status === 'pending_psp' ? '#ede9fe' : '#e0f2fe',
                              color: ticket.status === 'escalated' ? '#dc2626' : ticket.status === 'in_progress' ? '#c2410c' : ticket.status === 'pending_psp' ? '#7c3aed' : '#0369a1',
                              textTransform: 'uppercase',
                            }}
                          >
                            {ticket.status.replace('_', ' ')}
                          </span>
                          {ticket.slaBreach && (
                            <span style={{ fontSize: 8, fontWeight: 600, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 2 }}>
                              <Clock size={10} /> SLA BREACH
                            </span>
                          )}
                          <span className="text-sky-600 group-hover:translate-x-1 transition-transform">→</span>
                        </div>
                      </a>
                    ))}
                  </div>
                  <div className="mt-2 pt-2 border-t border-sky-200">
                    <p style={{ fontSize: 9, color: '#0c4a6e' }}>
                      💡 Click to view full ticket conversation and history
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            <div className="flex gap-2">
              {/* Context-Sensitive Actions */}
              {/* Reconciled credits: Show View Transaction Lines and Accounting Entries buttons */}
              {credit.reconciliationStatus === 'reconciled' && credit.matchedSettlements.length > 0 && (
                <>
                  <button
                    onClick={() => handleOpenL2Modal(credit.matchedSettlements[0])}
                    disabled={loadingL2Modal}
                    className={`px-3 py-1.5 rounded transition-colors flex items-center gap-1.5 ${
                      loadingL2Modal
                        ? 'bg-sky-400 text-white cursor-wait'
                        : 'bg-sky-600 text-white hover:bg-sky-700'
                    }`}
                    style={{ fontSize: 10, fontWeight: 600 }}
                  >
                    {loadingL2Modal ? (
                      <>
                        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Loading...
                      </>
                    ) : (
                      <>
                        <Table2 size={12} />
                        View Transaction Lines
                      </>
                    )}
                  </button>
                  {hasAccountingEntries && (
                    <button
                      onClick={handleOpenAccountingModal}
                      disabled={loadingAccountingModal}
                      className={`px-3 py-1.5 rounded transition-colors flex items-center gap-1.5 ${
                        loadingAccountingModal
                          ? 'bg-emerald-400 text-white cursor-wait'
                          : 'bg-emerald-600 text-white hover:bg-emerald-700'
                      }`}
                      style={{ fontSize: 10, fontWeight: 600 }}
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
                </>
              )}

              {credit.reconciliationStatus === 'matched_l1' && (
                <button
                  onClick={() => onAction('reconcile_l1', credit.id)}
                  className="px-3 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors"
                  style={{ fontSize: 10, fontWeight: 600 }}
                >
                  <CheckCircle size={12} className="inline mr-1.5" />
                  Reconcile L1
                </button>
              )}

              {credit.reconciliationStatus === 'unmatched_no_psp_file' && (
                <>
                  <button
                    onClick={handleOpenRaiseQueryModal}
                    disabled={loadingRaiseQuery || !!createdTicketId}
                    className={`px-3 py-1.5 rounded transition-colors flex items-center gap-1.5 ${
                      createdTicketId
                        ? 'bg-slate-100 text-slate-500 cursor-not-allowed'
                        : loadingRaiseQuery
                        ? 'bg-amber-400 text-white cursor-wait'
                        : 'bg-amber-600 text-white hover:bg-amber-700'
                    }`}
                    style={{ fontSize: 10, fontWeight: 600 }}
                  >
                    {loadingRaiseQuery ? (
                      <>
                        <Loader2 size={12} className="animate-spin" />
                        Loading...
                      </>
                    ) : createdTicketId ? (
                      <>
                        <CheckCircle size={12} />
                        Query Raised ({createdTicketId})
                      </>
                    ) : (
                      <>
                        <HelpCircle size={12} />
                        Raise Query
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => onAction('upload_psp_file', credit.id)}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors"
                    style={{ fontSize: 10, fontWeight: 600 }}
                  >
                    Upload PSP Settlement File
                  </button>
                </>
              )}


              {credit.reconciliationStatus === 'unmatched_variance' && !l2ReconStarted && (
                <>
                  <button
                    onClick={() => setShowVarianceJournalModal(true)}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors"
                    style={{ fontSize: 10, fontWeight: 600 }}
                  >
                    <CheckCircle size={12} className="inline mr-1.5" />
                    Accept Variance & Post
                  </button>
                  <button
                    onClick={handleOpenRaiseQueryModal}
                    disabled={loadingRaiseQuery || !!createdTicketId}
                    className={`px-3 py-1.5 rounded transition-colors flex items-center gap-1.5 ${
                      createdTicketId
                        ? 'bg-slate-100 text-slate-500 cursor-not-allowed'
                        : loadingRaiseQuery
                        ? 'bg-amber-400 text-white cursor-wait'
                        : 'bg-amber-600 text-white hover:bg-amber-700'
                    }`}
                    style={{ fontSize: 10, fontWeight: 600 }}
                  >
                    {loadingRaiseQuery ? (
                      <>
                        <Loader2 size={12} className="animate-spin" />
                        Loading...
                      </>
                    ) : createdTicketId ? (
                      <>
                        <CheckCircle size={12} />
                        Query Raised ({createdTicketId})
                      </>
                    ) : (
                      <>
                        <HelpCircle size={12} />
                        Raise Query
                      </>
                    )}
                  </button>
                </>
              )}

              {credit.reconciliationStatus === 'unmatched_variance' && l2ReconStarted && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded" style={{ fontSize: 10, fontWeight: 600, color: '#166534' }}>
                  <CheckCircle size={12} />
                  L1 Variance Posted to ERP · L2 Reconciliation In Progress
                </div>
              )}

              {credit.reconciliationStatus === 'partial' && (
                <button
                  onClick={() => onAction('resolve_partial', credit.id)}
                  className="px-3 py-1.5 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
                  style={{ fontSize: 10, fontWeight: 600 }}
                >
                  Resolve Partial Match
                </button>
              )}
            </div>

            {/* Secondary Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleExportCSV}
                className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded hover:bg-slate-50 transition-colors flex items-center gap-1.5"
                style={{ fontSize: 10, fontWeight: 600 }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export CSV
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* L1 Variance Journal Entry Modal */}
      {showVarianceJournalModal && credit.reconciliationStatus === 'unmatched_variance' && !isPostingToERP && !erpPostingSuccess && (
        <JournalEntryPreviewModal
          isOpen={showVarianceJournalModal}
          onClose={() => setShowVarianceJournalModal(false)}
          onConfirm={async () => {
            setShowVarianceJournalModal(false)
            setIsPostingToERP(true)
            // Synthetic delay 2-3s
            await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000))
            setIsPostingToERP(false)
            // Generate ERP posting success data
            const today = new Date()
            setErpPostingSuccess({
              materialDocNo: `49${String(Math.floor(Math.random() * 10000000)).padStart(7, '0')}`,
              postingDate: today.toISOString().split('T')[0],
              companyCode: 'SG01',
              variance: credit.l1Variance,
              currency: credit.currency
            })
          }}
          actionLabel="Post to ERP"
          exceptionId={credit.id}
          amount={Math.abs(credit.l1Variance)}
          currency={credit.currency}
          journalEntries={getL1VarianceJournalEntries(credit)}
        />
      )}

      {/* ERP Posting In Progress Overlay */}
      {isPostingToERP && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-white rounded-lg shadow-2xl p-8 flex flex-col items-center gap-4" style={{ minWidth: 320 }}>
            <Loader2 size={36} className="animate-spin text-sky-600" />
            <p style={{ fontSize: 13, fontWeight: 600, color: '#101828' }}>Posting to ERP...</p>
            <p style={{ fontSize: 10, color: '#64748b' }}>Creating journal entries and material document</p>
          </div>
        </div>
      )}

      {/* ERP Posting Success Screen */}
      {erpPostingSuccess && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-white rounded-lg shadow-2xl" style={{ minWidth: 400, maxWidth: 460 }}>
            {/* Success Header */}
            <div style={{ padding: '20px 24px 16px', textAlign: 'center', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%', backgroundColor: '#dcfce7',
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px'
              }}>
                <CheckCircle size={28} className="text-emerald-600" />
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#101828', marginBottom: 4 }}>
                Successfully Posted to ERP
              </h3>
              <p style={{ fontSize: 10, color: '#64748b' }}>
                Variance journal entry has been posted
              </p>
            </div>

            {/* Posting Details */}
            <div style={{ padding: '16px 24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', backgroundColor: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Material Document No.</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#0369a1', fontFamily: 'monospace' }}>{erpPostingSuccess.materialDocNo}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', backgroundColor: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Posting Date</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#101828', fontFamily: 'monospace' }}>{erpPostingSuccess.postingDate}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', backgroundColor: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Company Code</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#101828', fontFamily: 'monospace' }}>{erpPostingSuccess.companyCode}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', backgroundColor: '#f0fdf4', borderRadius: 6, border: '1px solid #bbf7d0' }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#166534', textTransform: 'uppercase' }}>Variance Posted</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#166534', fontFamily: 'monospace' }}>
                    {erpPostingSuccess.currency} {Math.abs(erpPostingSuccess.variance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Close Button */}
            <div style={{ padding: '12px 24px 20px', textAlign: 'center' }}>
              <button
                onClick={() => {
                  setErpPostingSuccess(null)
                  setL2ReconStarted(true)
                }}
                className="px-6 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors"
                style={{ fontSize: 11, fontWeight: 600 }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* L2 Transaction Lines Comparison Modal */}
      {showL2ComparisonModal && selectedSettlementForComparison && (
        <TransactionLinesComparisonModal
          isOpen={showL2ComparisonModal}
          onClose={() => {
            setShowL2ComparisonModal(false)
            setSelectedSettlementForComparison(null)
          }}
          settlement={selectedSettlementForComparison}
          currency={credit.currency}
          credit={credit}
        />
      )}

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

      {/* Raise Query Modal */}
      <RaiseQueryModal
        isOpen={showRaiseQueryModal}
        onClose={() => setShowRaiseQueryModal(false)}
        onSubmit={handleCreateTicket}
        creditId={credit.id}
        creditAmount={credit.amount}
        currency={credit.currency}
        pspId={credit.mappedPSP?.toLowerCase() || 'grabpay'}
        pspName={credit.mappedPSP === 'grabpay' ? 'GrabPay' : credit.mappedPSP === 'stripe' ? 'Stripe' : credit.mappedPSP || 'GrabPay'}
        valueDate={credit.valueDate}
      />
    </div>
  )
}

/**
 * Generate journal entries for L1 variance booking
 * When Bank Credit > PSP Net: Book the difference as PSP Fee Recovery / Suspense
 * When Bank Credit < PSP Net: Book the difference as Settlement Variance Expense
 */
function getL1VarianceJournalEntries(credit: BankCreditRecordDetail): JournalEntry[] {
  const variance = credit.l1Variance
  const absVariance = Math.abs(variance)
  const today = new Date().toISOString().split('T')[0]

  if (variance > 0) {
    // Bank received MORE than PSP reported (positive variance)
    // This could be a fee recovery or PSP underpayment correction
    return [{
      entryNumber: 1,
      description: `L1 Variance - Bank Credit exceeds PSP Net for ${credit.id}`,
      postingDate: today,
      documentType: 'variance_adjustment',
      lines: [
        {
          lineNumber: 1,
          account: '1100',
          accountName: 'Bank - Settlement Account',
          debitCredit: 'debit',
          amount: absVariance,
          currency: credit.currency,
          reference: credit.id
        },
        {
          lineNumber: 2,
          account: '2150',
          accountName: 'PSP Settlement Suspense',
          debitCredit: 'credit',
          amount: absVariance,
          currency: credit.currency,
          reference: credit.id
        }
      ]
    }]
  } else {
    // Bank received LESS than PSP reported (negative variance)
    // This is a settlement shortfall that needs investigation or write-off
    return [{
      entryNumber: 1,
      description: `L1 Variance - PSP Net exceeds Bank Credit for ${credit.id}`,
      postingDate: today,
      documentType: 'variance_adjustment',
      lines: [
        {
          lineNumber: 1,
          account: '6500',
          accountName: 'Settlement Variance Expense',
          debitCredit: 'debit',
          amount: absVariance,
          currency: credit.currency,
          reference: credit.id
        },
        {
          lineNumber: 2,
          account: '1100',
          accountName: 'Bank - Settlement Account',
          debitCredit: 'credit',
          amount: absVariance,
          currency: credit.currency,
          reference: credit.id
        }
      ]
    }]
  }
}
