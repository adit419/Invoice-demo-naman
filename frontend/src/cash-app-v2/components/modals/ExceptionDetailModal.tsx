/**
 * Exception Detail Modal
 * Shows diagnostic results, NBA recommendations, financial breakdowns, and action buttons
 */

import React, { useState } from 'react'
import { X, CheckCircle, AlertCircle, Clock, TrendingUp, FileText, DollarSign, Shield, Ticket, Send, ArrowRightLeft, ArrowRight } from 'lucide-react'
import type { ExceptionDetail, NextBestActionEnhanced } from '../../types/exceptions'
import { Badge } from '../ui/Badge'
import { JournalEntryPreviewModal } from './JournalEntryPreviewModal'

interface ExceptionDetailModalProps {
  exception: ExceptionDetail | null
  isOpen: boolean
  onClose: () => void
  onAction: (action: string, exceptionId: string) => void
}

export const ExceptionDetailModal: React.FC<ExceptionDetailModalProps> = ({
  exception,
  isOpen,
  onClose,
  onAction
}) => {
  const [showJournalPreview, setShowJournalPreview] = useState(false)
  const [showTicketModal, setShowTicketModal] = useState(false)
  const [showReconciliationModal, setShowReconciliationModal] = useState(false)
  const [reconciliationSubmitting, setReconciliationSubmitting] = useState(false)
  const [reconciliationComplete, setReconciliationComplete] = useState(false)
  const [ticketDescription, setTicketDescription] = useState('')
  const [ticketSubmitting, setTicketSubmitting] = useState(false)
  const [ticketSubmitted, setTicketSubmitted] = useState(false)
  const [generatedTicketId, setGeneratedTicketId] = useState<string | null>(null)
  const [selectedAction, setSelectedAction] = useState<{ action: string; buttonLabel: string } | null>(null)
  const [selectedMatchException, setSelectedMatchException] = useState<string | null>(null)
  const [reconciliationSearch, setReconciliationSearch] = useState('')

  if (!isOpen || !exception) return null

  const nbaEnhanced = exception.nba as NextBestActionEnhanced | undefined

  // Generate random ticket ID
  const generateTicketId = () => {
    const timestamp = Date.now().toString(36).toUpperCase()
    const random = Math.random().toString(36).substring(2, 6).toUpperCase()
    return `TKT-${timestamp}-${random}`
  }

  const handleActionClick = (action: string, buttonId: string, showPreview: boolean, buttonLabel: string, showTicket?: boolean, showReconciliation?: boolean) => {
    if (showReconciliation) {
      // Show reconciliation set-off modal
      setSelectedAction({ action, buttonLabel })
      setReconciliationComplete(false)
      setShowReconciliationModal(true)
    } else if (showTicket) {
      // Show ticket creation modal
      setSelectedAction({ action, buttonLabel })
      setTicketSubmitted(false)
      setGeneratedTicketId(null)
      setShowTicketModal(true)
    } else if (showPreview) {
      // Show journal entry preview modal first
      setSelectedAction({ action, buttonLabel })
      setShowJournalPreview(true)
    } else {
      // Execute action immediately
      onAction(action, exception.id)
    }
  }

  const handleConfirmReconciliation = async () => {
    setReconciliationSubmitting(true)
    await new Promise(resolve => setTimeout(resolve, 1000))
    setReconciliationSubmitting(false)
    setReconciliationComplete(true)
  }

  const handleCloseReconciliationModal = () => {
    setShowReconciliationModal(false)
    setReconciliationComplete(false)
    setSelectedAction(null)
    setSelectedMatchException(null)
    setReconciliationSearch('')
  }

  const handleReconciliationDone = () => {
    setShowReconciliationModal(false)
    setReconciliationComplete(false)
    if (selectedAction) {
      onAction(selectedAction.action, exception.id)
      setSelectedAction(null)
    }
  }

  const handleSubmitTicket = async () => {
    setTicketSubmitting(true)
    // Simulate ticket submission
    await new Promise(resolve => setTimeout(resolve, 800))

    // Generate ticket ID
    const ticketId = generateTicketId()
    setGeneratedTicketId(ticketId)
    setTicketSubmitting(false)
    setTicketSubmitted(true)
  }

  const handleCloseTicketModal = () => {
    setShowTicketModal(false)
    setTicketDescription('')
    setTicketSubmitted(false)
    setGeneratedTicketId(null)
    setSelectedAction(null)
  }

  const handleTicketDone = () => {
    setShowTicketModal(false)
    setTicketDescription('')
    setTicketSubmitted(false)
    setGeneratedTicketId(null)
    if (selectedAction) {
      onAction(selectedAction.action, exception.id)
      setSelectedAction(null)
    }
  }

  const handleConfirmAction = () => {
    if (selectedAction) {
      setShowJournalPreview(false)
      onAction(selectedAction.action, exception.id)
      setSelectedAction(null)
    }
  }

  const handleClosePreview = () => {
    setShowJournalPreview(false)
    setSelectedAction(null)
  }

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

  const formatExceptionType = (type: string): string => {
    return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }

  const getResultIcon = (result: 'pass' | 'fail' | 'partial') => {
    if (result === 'pass') return <CheckCircle size={16} className="text-emerald-600" />
    if (result === 'fail') return <X size={16} className="text-slate-400" />
    return <AlertCircle size={16} className="text-amber-600" />
  }

  const getPriorityColor = (priority: string) => {
    if (priority === 'auto') return '#059669' // emerald
    if (priority === 'human_confirm') return '#0369a1' // blue
    return '#d97706' // amber
  }

  return (
    <div
      className="fixed inset-0 bg-white/20 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-y-auto mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10">
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#101828', marginBottom: 2 }}>
              Exception Detail
            </h2>
            <p style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>
              {exception.id}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Summary Section */}
          <div className="grid grid-cols-4 gap-3">
            <div>
              <p style={{ fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>
                Type
              </p>
              <Badge variant={exception.type === 'unmatched_credit' ? 'exception' : exception.type === 'amount_mismatch' ? 'in_transit' : 'pending'}>
                {formatExceptionType(exception.type)}
              </Badge>
            </div>
            <div>
              <p style={{ fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>
                Priority
              </p>
              <Badge variant={exception.priority === 'high' ? 'high' : exception.priority === 'medium' ? 'medium' : 'low'}>
                {exception.priority.toUpperCase()}
              </Badge>
            </div>
            <div>
              <p style={{ fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>
                {exception.amountLabel || 'Amount'}
              </p>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#101828', fontFamily: 'monospace' }}>
                {formatCurrency(exception.amount, exception.currency)}
              </p>
            </div>
            <div>
              <p style={{ fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>
                Age
              </p>
              <p style={{ fontSize: 12, fontWeight: 700, color: exception.pastSLA ? '#dc2626' : '#101828' }}>
                {exception.age}
                {exception.pastSLA && ' ⚠️'}
              </p>
            </div>
          </div>

          {/* Diagnostic Results */}
          {exception.diagnostic && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-3">
                <h3 style={{ fontSize: 12, fontWeight: 700, color: '#101828' }}>
                  Diagnostic Results
                </h3>
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 10, color: '#64748b' }}>Confidence:</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: exception.diagnostic.confidence >= 85 ? '#059669' : exception.diagnostic.confidence >= 70 ? '#d97706' : '#64748b' }}>
                    {exception.diagnostic.confidence}%
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                {exception.diagnostic.findings.map((finding, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-2 p-2 bg-white rounded border border-slate-200"
                  >
                    <div className="mt-0.5">
                      {getResultIcon(finding.result)}
                    </div>
                    <div className="flex-1">
                      <p style={{ fontSize: 10, fontWeight: 600, color: '#475569', marginBottom: 1 }}>
                        {finding.category.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                      </p>
                      <p style={{ fontSize: 10, color: '#64748b', lineHeight: 1.4 }}>
                        {finding.detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Next Best Action */}
          {exception.nba && (
            <div
              className="border rounded-lg p-3"
              style={{ borderColor: getPriorityColor(exception.nba.priority), backgroundColor: `${getPriorityColor(exception.nba.priority)}08` }}
            >
              <div className="flex items-start gap-2 mb-3">
                <div className="p-1.5 bg-white rounded shadow-sm">
                  <TrendingUp size={14} style={{ color: getPriorityColor(exception.nba.priority) }} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 style={{ fontSize: 11, fontWeight: 700, color: '#101828' }}>
                      Next Best Action
                    </h3>
                    <Badge variant={exception.nba.priority === 'auto' ? 'healthy' : exception.nba.priority === 'human_confirm' ? 'attention' : 'warning'}>
                      {exception.nba.priority === 'auto' ? 'AUTO' : exception.nba.priority === 'human_confirm' ? 'CONFIRM' : 'INVESTIGATE'}
                    </Badge>
                  </div>
                  <p style={{ fontSize: 10, color: '#475569', lineHeight: '1.5' }}>
                    {exception.nba.description}
                  </p>
                  {exception.nba.estimatedTime && (
                    <div className="flex items-center gap-1 mt-1.5">
                      <Clock size={12} className="text-slate-500" />
                      <span style={{ fontSize: 10, color: '#64748b' }}>
                        Estimated time: {exception.nba.estimatedTime}
                      </span>
                    </div>
                  )}
                  {exception.nba.dueDate && (
                    <div className="flex items-center gap-1 mt-1">
                      <AlertCircle size={12} className="text-amber-600" />
                      <span style={{ fontSize: 10, color: '#d97706', fontWeight: 600 }}>
                        Due: {new Date(exception.nba.dueDate).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 flex-wrap">
                {exception.nba.actionButtons.map((button) => (
                  <button
                    key={button.id}
                    onClick={() => handleActionClick(button.action, button.id, button.showJournalPreview || false, button.label, button.showTicketModal, button.showReconciliationModal)}
                    className={`px-3 py-1.5 rounded font-semibold transition-all ${
                      button.variant === 'primary'
                        ? 'bg-sky-700 text-white hover:bg-sky-800'
                        : button.variant === 'danger'
                        ? 'bg-red-600 text-white hover:bg-red-700'
                        : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                    style={{ fontSize: 10 }}
                  >
                    {button.label}
                    {button.requiresApproval && ' 🔒'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* PSP Ticket Information */}
          {nbaEnhanced?.pspTicket && (
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Ticket size={14} className="text-amber-700" />
                  <h3 style={{ fontSize: 11, fontWeight: 700, color: '#92400e' }}>
                    PSP Ticket Raised
                  </h3>
                </div>
                <div className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${
                  nbaEnhanced.pspTicket.ticketStatus === 'pending'
                    ? 'bg-amber-200 text-amber-800'
                    : nbaEnhanced.pspTicket.ticketStatus === 'in_progress'
                    ? 'bg-blue-200 text-blue-800'
                    : nbaEnhanced.pspTicket.ticketStatus === 'escalated'
                    ? 'bg-red-200 text-red-800'
                    : 'bg-emerald-200 text-emerald-800'
                }`}>
                  {nbaEnhanced.pspTicket.ticketStatus.toUpperCase().replace('_', ' ')}
                </div>
              </div>

              <div className="bg-white rounded p-2.5 border border-amber-200">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>
                      Ticket ID
                    </p>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#92400e', fontFamily: 'monospace' }}>
                      {nbaEnhanced.pspTicket.ticketId}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>
                      Days Pending
                    </p>
                    <p style={{ fontSize: 11, fontWeight: 700, color: nbaEnhanced.pspTicket.daysPending > 5 ? '#dc2626' : '#92400e' }}>
                      {nbaEnhanced.pspTicket.daysPending} days
                      {nbaEnhanced.pspTicket.daysPending > 5 && (
                        <span className="ml-1 text-[9px] text-red-600 font-normal">(Overdue)</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>
                      Raised Date
                    </p>
                    <p style={{ fontSize: 10, color: '#475569' }}>
                      {new Date(nbaEnhanced.pspTicket.raisedDate).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>
                      Last Follow-up
                    </p>
                    <p style={{ fontSize: 10, color: '#475569' }}>
                      {nbaEnhanced.pspTicket.lastFollowUp
                        ? new Date(nbaEnhanced.pspTicket.lastFollowUp).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })
                        : '—'
                      }
                    </p>
                  </div>
                </div>

                <div className="mt-2 pt-2 border-t border-slate-200">
                  <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>
                    Inquiry Details
                  </p>
                  <p style={{ fontSize: 10, color: '#475569', lineHeight: 1.4 }}>
                    <span className="font-semibold">{nbaEnhanced.pspTicket.inquiryType}:</span> {nbaEnhanced.pspTicket.description}
                  </p>
                  {nbaEnhanced.pspTicket.pspContact && (
                    <p style={{ fontSize: 9, color: '#64748b', marginTop: 4 }}>
                      Contact: {nbaEnhanced.pspTicket.pspContact}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Approval Requirements */}
          {nbaEnhanced?.approval?.approvalRequired && (
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Shield size={14} className="text-amber-700" />
                <h3 style={{ fontSize: 11, fontWeight: 700, color: '#92400e' }}>
                  Approval Required
                </h3>
              </div>
              <p style={{ fontSize: 10, color: '#78350f', marginBottom: 8 }}>
                {nbaEnhanced.approval.approvalReason}
              </p>
              <div className="grid grid-cols-2 gap-2 bg-white rounded p-2 border border-amber-200">
                <div>
                  <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>
                    Threshold
                  </p>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#101828' }}>
                    {nbaEnhanced.approval.approvalThreshold.currency} {nbaEnhanced.approval.approvalThreshold.amount?.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>
                    Approver
                  </p>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#101828' }}>
                    {nbaEnhanced.approval.approverName}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Financial Breakdown */}
          {exception.financialBreakdown && (
            <div className="bg-white border border-slate-200 rounded-lg p-3">
              <h3 style={{ fontSize: 11, fontWeight: 700, color: '#101828', marginBottom: 10 }}>
                Financial Breakdown
              </h3>

              {/* Waterfall */}
              <div className="space-y-1.5 mb-3">
                <div className="flex items-center justify-between py-1.5 border-b border-slate-300">
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#101828' }}>Gross Amount</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#101828', fontFamily: 'monospace' }}>
                    {exception.financialBreakdown.currency} {exception.financialBreakdown.gross.toLocaleString()}
                  </span>
                </div>

                {exception.financialBreakdown.components.map((component, index) => (
                  <div key={index} className="flex items-center justify-between py-1 pl-3">
                    <div className="flex-1">
                      <span style={{ fontSize: 9, color: '#475569' }}>
                        {component.type === 'deduction' ? '−' : '+'} {component.name}
                        {component.percentage && ` (${component.percentage}%)`}
                      </span>
                      <p style={{ fontSize: 9, color: '#64748b', marginTop: 1 }}>
                        {component.description}
                      </p>
                    </div>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: component.type === 'deduction' ? '#dc2626' : '#059669',
                        fontFamily: 'monospace'
                      }}
                    >
                      {component.type === 'deduction' ? '−' : '+'} {exception.financialBreakdown?.currency || exception.currency} {component.amount.toLocaleString()}
                    </span>
                  </div>
                ))}

                <div className="flex items-center justify-between py-1.5 border-t border-slate-300 mt-1">
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#101828' }}>Expected Net</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#101828', fontFamily: 'monospace' }}>
                    {exception.financialBreakdown.currency} {exception.financialBreakdown.expectedNet.toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1">
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#475569' }}>Actual Net</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#101828', fontFamily: 'monospace' }}>
                    {exception.financialBreakdown.currency} {exception.financialBreakdown.actualNet.toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1.5 bg-amber-50 px-2 rounded border border-amber-200">
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#101828' }}>Variance</span>
                    {exception.financialBreakdown.varianceUnexplained > 0 && (
                      <p style={{ fontSize: 9, color: '#d97706', marginTop: 1 }}>
                        Unexplained: {exception.financialBreakdown.currency} {exception.financialBreakdown.varianceUnexplained.toLocaleString()}
                      </p>
                    )}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#d97706', fontFamily: 'monospace' }}>
                    {exception.financialBreakdown.currency} {exception.financialBreakdown.variance.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Related Records */}
          {exception.relatedRecords && exception.relatedRecords.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-lg p-3">
              <h3 style={{ fontSize: 11, fontWeight: 700, color: '#101828', marginBottom: 8 }}>
                Related Records
              </h3>
              <div className="space-y-1.5">
                {exception.relatedRecords.map((record, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 bg-slate-50 rounded border border-slate-200"
                  >
                    <div className="flex items-center gap-2">
                      <FileText size={12} className="text-slate-500" />
                      <div>
                        <p style={{ fontSize: 10, fontWeight: 600, color: '#101828' }}>
                          {record.type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                        </p>
                        <p style={{ fontSize: 9, color: '#64748b', fontFamily: 'monospace' }}>
                          {record.id}
                        </p>
                        {record.description && (
                          <p style={{ fontSize: 9, color: '#64748b', marginTop: 1 }}>
                            {record.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#101828', fontFamily: 'monospace' }}>
                        {formatCurrency(record.amount, record.currency)}
                      </p>
                      <p style={{ fontSize: 9, color: '#64748b' }}>
                        {new Date(record.date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Settlement Explorer Linkages */}
          {exception.linkedBankCreditId && (
            <div className="bg-sky-50 border border-sky-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 style={{ fontSize: 11, fontWeight: 700, color: '#0369a1' }}>
                  🔗 Linked in Settlement Explorer
                </h3>
              </div>

              {/* Bank Credit Link */}
              <div className="mb-2">
                <a
                  href={`/cash-app-v2/settlements?creditId=${exception.linkedBankCreditId}`}
                  className="flex items-center justify-between p-2 bg-white rounded border border-sky-300 hover:border-sky-500 hover:bg-sky-50 transition-all cursor-pointer group"
                  onClick={(e) => {
                    e.preventDefault()
                    window.location.href = `/cash-app-v2/settlements?creditId=${exception.linkedBankCreditId}`
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-sky-100 flex items-center justify-center">
                      <DollarSign size={12} className="text-sky-700" />
                    </div>
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 600, color: '#0369a1' }}>
                        Bank Credit
                      </p>
                      <p style={{ fontSize: 9, color: '#64748b', fontFamily: 'monospace' }}>
                        {exception.linkedBankCreditId}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {exception.linkedBankCreditAmount && (
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#0369a1', fontFamily: 'monospace' }}>
                        {formatCurrency(exception.linkedBankCreditAmount, exception.currency)}
                      </p>
                    )}
                    <span className="text-sky-600 group-hover:translate-x-1 transition-transform">→</span>
                  </div>
                </a>
              </div>

              {/* Settlements Link */}
              {exception.linkedSettlementRefs && exception.linkedSettlementRefs.length > 0 && (
                <div>
                  <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', marginBottom: 4, textTransform: 'uppercase' }}>
                    Linked Settlements ({exception.linkedSettlementCount || exception.linkedSettlementRefs.length})
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {exception.linkedSettlementRefs.map((ref, index) => (
                      <span
                        key={index}
                        className="px-1.5 py-0.5 bg-white border border-sky-300 rounded text-[9px] font-mono text-sky-700"
                      >
                        {ref}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-2 pt-2 border-t border-sky-200">
                <p style={{ fontSize: 9, color: '#64748b' }}>
                  💡 Click to view full reconciliation details in Settlement Explorer
                </p>
              </div>
            </div>
          )}

          {/* Audit Trail */}
          <div className="bg-white border border-slate-200 rounded-lg p-3">
            <h3 style={{ fontSize: 11, fontWeight: 700, color: '#101828', marginBottom: 8 }}>
              Audit Trail
            </h3>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-1.5"></div>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 600, color: '#101828' }}>
                    Exception created
                  </p>
                  <p style={{ fontSize: 9, color: '#64748b' }}>
                    {new Date(exception.createdAt).toLocaleString()} • System
                  </p>
                </div>
              </div>
              {exception.diagnostic && (
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-sky-600 mt-1.5"></div>
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 600, color: '#101828' }}>
                      Diagnostic completed
                    </p>
                    <p style={{ fontSize: 9, color: '#64748b' }}>
                      {new Date(exception.diagnostic.completedAt).toLocaleString()} • System
                    </p>
                    <p style={{ fontSize: 9, color: '#475569', marginTop: 1 }}>
                      Outcome: {exception.diagnostic.outcome}
                    </p>
                  </div>
                </div>
              )}
              {exception.owner && (
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-600 mt-1.5"></div>
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 600, color: '#101828' }}>
                      Assigned to {exception.ownerName}
                    </p>
                    <p style={{ fontSize: 9, color: '#64748b' }}>
                      Manual assignment
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Journal Entry Preview Modal */}
      <JournalEntryPreviewModal
        isOpen={showJournalPreview}
        onClose={handleClosePreview}
        onConfirm={handleConfirmAction}
        actionLabel={selectedAction?.buttonLabel || ''}
        exceptionId={exception.id}
        amount={exception.amount}
        currency={exception.currency}
        journalEntries={nbaEnhanced?.journalEntries}
        approval={nbaEnhanced?.approval}
      />

      {/* Ticket Creation Modal */}
      {showTicketModal && (
        <div
          className="fixed inset-0 bg-white/20 backdrop-blur-sm flex items-center justify-center z-[60]"
          onClick={handleCloseTicketModal}
        >
          <div
            className="bg-white rounded-lg shadow-2xl w-full max-w-md mx-4 max-h-[75vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${ticketSubmitted ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                  {ticketSubmitted ? (
                    <CheckCircle size={16} className="text-emerald-600" />
                  ) : (
                    <Ticket size={16} className="text-amber-600" />
                  )}
                </div>
                <div>
                  <h3 style={{ fontSize: 12, fontWeight: 700, color: '#101828' }}>
                    {ticketSubmitted ? 'Ticket Created' : 'Raise Internal Ticket'}
                  </h3>
                  <p style={{ fontSize: 10, color: '#64748b' }}>
                    {ticketSubmitted ? 'Your ticket has been submitted' : 'Create a ticket for investigation'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseTicketModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-4 py-3 space-y-3">
              {ticketSubmitted && generatedTicketId ? (
                /* Success State */
                <div className="text-center py-2">
                  <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200 mb-3">
                    <p style={{ fontSize: 9, fontWeight: 600, color: '#059669', textTransform: 'uppercase', marginBottom: 4 }}>
                      Ticket ID
                    </p>
                    <p style={{ fontSize: 16, fontWeight: 700, color: '#065f46', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
                      {generatedTicketId}
                    </p>
                  </div>

                  <div className="bg-slate-50 rounded p-3 border border-slate-200 text-left">
                    <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>
                      Ticket Details
                    </p>
                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <span style={{ fontSize: 10, color: '#64748b' }}>Exception ID</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#101828', fontFamily: 'monospace' }}>
                          {exception.id}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span style={{ fontSize: 10, color: '#64748b' }}>Order ID</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#101828', fontFamily: 'monospace' }}>
                          {exception.referenceId}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span style={{ fontSize: 10, color: '#64748b' }}>Amount</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: exception.amount < 0 ? '#dc2626' : '#101828', fontFamily: 'monospace' }}>
                          {exception.currency} {exception.amount.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span style={{ fontSize: 10, color: '#64748b' }}>Status</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#059669' }}>
                          Submitted
                        </span>
                      </div>
                    </div>
                  </div>

                  <p style={{ fontSize: 10, color: '#64748b', marginTop: 12 }}>
                    The investigation team will review this ticket within 1-2 business days.
                  </p>
                </div>
              ) : (
                /* Form State */
                <>
                  {/* Context Section */}
                  <div className="bg-slate-50 rounded p-3 border border-slate-200">
                    <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>
                      Context
                    </p>
                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <span style={{ fontSize: 10, color: '#64748b' }}>Exception ID</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#101828', fontFamily: 'monospace' }}>
                          {exception.id}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span style={{ fontSize: 10, color: '#64748b' }}>Order ID</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#101828', fontFamily: 'monospace' }}>
                          {exception.referenceId}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span style={{ fontSize: 10, color: '#64748b' }}>Amount</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: exception.amount < 0 ? '#dc2626' : '#101828', fontFamily: 'monospace' }}>
                          {exception.currency} {exception.amount.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span style={{ fontSize: 10, color: '#64748b' }}>PSP</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#101828' }}>
                          {exception.pspName}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 600, color: '#344054', display: 'block', marginBottom: 4 }}>
                      Description (optional)
                    </label>
                    <textarea
                      value={ticketDescription}
                      onChange={(e) => setTicketDescription(e.target.value)}
                      placeholder="Add additional context or notes..."
                      className="w-full px-3 py-2 border border-slate-200 rounded text-xs resize-none focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-transparent"
                      rows={2}
                    />
                  </div>

                  {/* AI Summary */}
                  {exception.nba?.description && (
                    <div className="bg-blue-50 rounded p-2.5 border border-blue-200">
                      <p style={{ fontSize: 9, fontWeight: 600, color: '#1e40af', textTransform: 'uppercase', marginBottom: 4 }}>
                        AI Analysis
                      </p>
                      <p style={{ fontSize: 10, color: '#1e40af', lineHeight: 1.4 }}>
                        {exception.nba.description}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-gray-200 px-4 py-3 flex justify-end gap-2">
              {ticketSubmitted ? (
                <button
                  onClick={handleTicketDone}
                  className="px-3 py-1.5 bg-emerald-600 text-white rounded font-semibold text-xs hover:bg-emerald-700 transition-colors flex items-center gap-1.5"
                >
                  <CheckCircle size={12} />
                  Done
                </button>
              ) : (
                <>
                  <button
                    onClick={handleCloseTicketModal}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmitTicket}
                    disabled={ticketSubmitting}
                    className="px-3 py-1.5 bg-amber-600 text-white rounded font-semibold text-xs hover:bg-amber-700 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {ticketSubmitting ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Send size={12} />
                        Submit Ticket
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reconciliation Set-Off Modal */}
      {showReconciliationModal && nbaEnhanced?.reconciliation && (
        <div
          className="fixed inset-0 bg-white/20 backdrop-blur-sm flex items-center justify-center z-[60]"
          onClick={handleCloseReconciliationModal}
        >
          <div
            className="bg-white rounded-lg shadow-2xl w-full max-w-lg mx-4 max-h-[75vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${reconciliationComplete ? 'bg-emerald-100' : 'bg-blue-100'}`}>
                  {reconciliationComplete ? (
                    <CheckCircle size={16} className="text-emerald-600" />
                  ) : (
                    <ArrowRightLeft size={16} className="text-blue-600" />
                  )}
                </div>
                <div>
                  <h3 style={{ fontSize: 12, fontWeight: 700, color: '#101828' }}>
                    {reconciliationComplete ? 'Reconciliation Complete' : 'Reconcile & Set Off'}
                  </h3>
                  <p style={{ fontSize: 10, color: '#64748b' }}>
                    {reconciliationComplete ? 'Line items have been matched' : 'Match two offsetting items'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseReconciliationModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-4 py-3 space-y-3">
              {reconciliationComplete ? (
                /* Success State */
                <div className="text-center py-2">
                  <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200 mb-3">
                    <CheckCircle size={32} className="text-emerald-600 mx-auto mb-2" />
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#065f46', marginBottom: 4 }}>
                      Successfully Reconciled
                    </p>
                    <p style={{ fontSize: 10, color: '#047857' }}>
                      Net effect on books: <span className="font-bold">SGD 0.00</span>
                    </p>
                  </div>

                  <div className="bg-slate-50 rounded p-3 border border-slate-200 text-left">
                    <div className="flex items-center justify-between py-1.5">
                      <div>
                        <p style={{ fontSize: 9, color: '#64748b' }}>{nbaEnhanced.reconciliation.lineItem1.type.replace('_', ' ').toUpperCase()}</p>
                        <p style={{ fontSize: 10, fontWeight: 600, fontFamily: 'monospace' }}>{nbaEnhanced.reconciliation.lineItem1.id}</p>
                      </div>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', fontFamily: 'monospace' }}>
                        {exception.currency} {nbaEnhanced.reconciliation.lineItem1.amount.toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center justify-center py-1">
                      <ArrowRight size={12} className="text-slate-400 rotate-90" />
                    </div>
                    <div className="flex items-center justify-between py-1.5">
                      <div>
                        <p style={{ fontSize: 9, color: '#64748b' }}>{nbaEnhanced.reconciliation.lineItem2.type.replace('_', ' ').toUpperCase()}</p>
                        <p style={{ fontSize: 10, fontWeight: 600, fontFamily: 'monospace' }}>{nbaEnhanced.reconciliation.lineItem2.id}</p>
                      </div>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#059669', fontFamily: 'monospace' }}>
                        {exception.currency} {nbaEnhanced.reconciliation.lineItem2.amount.toLocaleString()}
                      </p>
                    </div>
                    <div className="border-t border-slate-300 mt-2 pt-2 flex items-center justify-between">
                      <p style={{ fontSize: 10, fontWeight: 600, color: '#101828' }}>Net Effect</p>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#101828', fontFamily: 'monospace' }}>
                        {exception.currency} 0.00
                      </p>
                    </div>
                  </div>

                  <p style={{ fontSize: 10, color: '#64748b', marginTop: 12 }}>
                    {nbaEnhanced.reconciliation.glImpact}
                  </p>
                </div>
              ) : (
                /* Form State */
                <>
                  {/* Current Item - Reversal Credit */}
                  <div className="bg-slate-50 rounded p-2.5 border border-slate-200">
                    <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>
                      Current Exception (Credit to Match)
                    </p>

                    <div className="bg-white rounded p-2.5 border border-red-200">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[9px] font-semibold rounded">
                              {(nbaEnhanced.reconciliation.currentItem?.type || nbaEnhanced.reconciliation.lineItem2.type).replace('_', ' ').toUpperCase()}
                            </span>
                          </div>
                          <p style={{ fontSize: 11, fontWeight: 600, color: '#101828', fontFamily: 'monospace' }}>
                            {nbaEnhanced.reconciliation.currentItem?.id || nbaEnhanced.reconciliation.lineItem2.id}
                          </p>
                          <p style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                            {nbaEnhanced.reconciliation.currentItem?.description || nbaEnhanced.reconciliation.lineItem2.description}
                          </p>
                          <p style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>
                            {new Date(nbaEnhanced.reconciliation.currentItem?.date || nbaEnhanced.reconciliation.lineItem2.date).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </p>
                        </div>
                        <div className="text-right">
                          <p style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', fontFamily: 'monospace' }}>
                            {exception.currency} {(nbaEnhanced.reconciliation.currentItem?.amount || nbaEnhanced.reconciliation.lineItem2.amount).toLocaleString()}
                          </p>
                          <p style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>
                            GL: {nbaEnhanced.reconciliation.currentItem?.glAccount || nbaEnhanced.reconciliation.lineItem2.glAccount}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="flex justify-center py-1">
                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                      <ArrowRightLeft size={12} className="text-blue-600" />
                    </div>
                  </div>

                  {/* Select Matching Exception Dropdown */}
                  {nbaEnhanced.reconciliation.selectableExceptions ? (
                    <div className="bg-slate-50 rounded p-2.5 border border-slate-200">
                      <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>
                        Select Matching Exception to Set Off
                      </p>

                      {/* Search Input */}
                      <div className="mb-2">
                        <input
                          type="text"
                          placeholder="Search by ID, amount, or description..."
                          value={reconciliationSearch}
                          onChange={(e) => setReconciliationSearch(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                          style={{ fontSize: 11 }}
                        />
                      </div>

                      {/* Filtered Dropdown */}
                      {(() => {
                        const searchLower = reconciliationSearch.toLowerCase()
                        const filteredExceptions = nbaEnhanced.reconciliation.selectableExceptions.filter((exc: any) => {
                          if (!reconciliationSearch) return true
                          return (
                            exc.id.toLowerCase().includes(searchLower) ||
                            exc.amount.toString().includes(reconciliationSearch) ||
                            exc.description.toLowerCase().includes(searchLower) ||
                            (exc.type && exc.type.toLowerCase().includes(searchLower))
                          )
                        })

                        return (
                          <>
                            <select
                              value={selectedMatchException || ''}
                              onChange={(e) => setSelectedMatchException(e.target.value || null)}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white cursor-pointer"
                              style={{ fontSize: 11 }}
                            >
                              <option value="">-- Select an exception ({filteredExceptions.length} available) --</option>
                              {filteredExceptions.map((exc: any) => (
                                <option key={exc.id} value={exc.id}>
                                  {exc.id} | {exception.currency} +{exc.amount.toLocaleString()} | {exc.description.substring(0, 35)}...
                                </option>
                              ))}
                            </select>
                            {reconciliationSearch && filteredExceptions.length === 0 && (
                              <p style={{ fontSize: 10, color: '#dc2626', marginTop: 4 }}>
                                No exceptions found matching "{reconciliationSearch}"
                              </p>
                            )}
                          </>
                        )
                      })()}

                      {/* Selected Exception Details */}
                      {selectedMatchException && (
                        <div className="bg-white rounded p-2.5 border border-emerald-200 mt-3">
                          {(() => {
                            const selected = nbaEnhanced.reconciliation.selectableExceptions.find((e: any) => e.id === selectedMatchException)
                            if (!selected) return null
                            return (
                              <div className="flex items-start justify-between">
                                <div>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[9px] font-semibold rounded">
                                      {selected.type.replace('_', ' ').toUpperCase()}
                                    </span>
                                    {selected.status && (
                                      <span className={`px-1.5 py-0.5 text-[9px] font-semibold rounded ${
                                        selected.status === 'disputed' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'
                                      }`}>
                                        {selected.status.toUpperCase()}
                                      </span>
                                    )}
                                  </div>
                                  <p style={{ fontSize: 11, fontWeight: 600, color: '#101828', fontFamily: 'monospace' }}>
                                    {selected.id}
                                  </p>
                                  <p style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                                    {selected.description}
                                  </p>
                                  <p style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>
                                    {new Date(selected.date).toLocaleDateString('en-US', {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric'
                                    })}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p style={{ fontSize: 13, fontWeight: 700, color: '#059669', fontFamily: 'monospace' }}>
                                    {exception.currency} +{selected.amount.toLocaleString()}
                                  </p>
                                  <p style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>
                                    GL: {selected.glAccount}
                                  </p>
                                </div>
                              </div>
                            )
                          })()}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Fallback to old lineItem1 display */
                    <div className="bg-slate-50 rounded p-2.5 border border-slate-200">
                      <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>
                        Matching Exception
                      </p>
                      <div className="bg-white rounded p-2.5 border border-emerald-200">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[9px] font-semibold rounded">
                                {nbaEnhanced.reconciliation.lineItem1.type.replace('_', ' ').toUpperCase()}
                              </span>
                            </div>
                            <p style={{ fontSize: 11, fontWeight: 600, color: '#101828', fontFamily: 'monospace' }}>
                              {nbaEnhanced.reconciliation.lineItem1.id}
                            </p>
                            <p style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                              {nbaEnhanced.reconciliation.lineItem1.description}
                            </p>
                          </div>
                          <div className="text-right">
                            <p style={{ fontSize: 13, fontWeight: 700, color: '#059669', fontFamily: 'monospace' }}>
                              {exception.currency} +{nbaEnhanced.reconciliation.lineItem1.amount.toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Net Effect Summary - Calculated based on selection */}
                  {(() => {
                    const currentAmount = nbaEnhanced.reconciliation.currentItem?.amount || nbaEnhanced.reconciliation.lineItem2.amount
                    const selectedExc = nbaEnhanced.reconciliation.selectableExceptions?.find((e: any) => e.id === selectedMatchException)
                    const matchAmount = selectedExc?.amount || (nbaEnhanced.reconciliation.selectableExceptions ? 0 : nbaEnhanced.reconciliation.lineItem1.amount)
                    const netEffect = currentAmount + matchAmount
                    const hasSelection = selectedMatchException || !nbaEnhanced.reconciliation.selectableExceptions

                    return (
                      <div className={`rounded p-3 border ${hasSelection && netEffect === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-blue-50 border-blue-200'}`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <p style={{ fontSize: 9, fontWeight: 600, color: hasSelection && netEffect === 0 ? '#065f46' : '#1e40af', textTransform: 'uppercase' }}>
                              Net Effect on Books
                            </p>
                            {hasSelection && netEffect === 0 ? (
                              <p style={{ fontSize: 10, color: '#047857', marginTop: 2 }}>
                                No P&L impact - internal set-off within AR
                              </p>
                            ) : (
                              <p style={{ fontSize: 10, color: '#1e40af', marginTop: 2 }}>
                                {selectedMatchException ? 'Variance detected' : 'Select an exception to calculate'}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p style={{ fontSize: 16, fontWeight: 700, color: hasSelection && netEffect === 0 ? '#065f46' : netEffect !== 0 ? '#dc2626' : '#1e40af', fontFamily: 'monospace' }}>
                              {exception.currency} {hasSelection ? netEffect.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                            </p>
                            {hasSelection && netEffect === 0 && (
                              <p style={{ fontSize: 9, color: '#059669', marginTop: 2 }}>
                                ✓ Amounts match perfectly
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Original Exception Info */}
                  {nbaEnhanced.originalException && (
                    <div className="bg-amber-50 rounded p-2.5 border border-amber-200">
                      <p style={{ fontSize: 9, fontWeight: 600, color: '#92400e', textTransform: 'uppercase', marginBottom: 4 }}>
                        Original Exception
                      </p>
                      <div className="flex items-center justify-between">
                        <div>
                          <p style={{ fontSize: 10, fontWeight: 600, color: '#92400e', fontFamily: 'monospace' }}>
                            {nbaEnhanced.originalException.exceptionId}
                          </p>
                          <p style={{ fontSize: 9, color: '#b45309' }}>
                            {nbaEnhanced.originalException.description}
                          </p>
                        </div>
                        <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[9px] font-semibold rounded">
                          {nbaEnhanced.originalException.status.replace('_', ' ').toUpperCase()}
                        </span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-gray-200 px-4 py-3 flex justify-end gap-2">
              {reconciliationComplete ? (
                <button
                  onClick={handleReconciliationDone}
                  className="px-3 py-1.5 bg-emerald-600 text-white rounded font-semibold text-xs hover:bg-emerald-700 transition-colors flex items-center gap-1.5"
                >
                  <CheckCircle size={12} />
                  Done
                </button>
              ) : (
                <>
                  <button
                    onClick={handleCloseReconciliationModal}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmReconciliation}
                    disabled={reconciliationSubmitting || (nbaEnhanced?.reconciliation?.selectableExceptions && !selectedMatchException)}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded font-semibold text-xs hover:bg-blue-700 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {reconciliationSubmitting ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <ArrowRightLeft size={12} />
                        Confirm Set Off
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
