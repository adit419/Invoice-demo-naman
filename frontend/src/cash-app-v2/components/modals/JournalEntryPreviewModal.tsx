/**
 * Journal Entry Preview Modal
 * Compact modal showing journal entries and approval requirements
 */

import React from 'react'
import { X, AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { JournalEntry, ApprovalMetadata } from '../../types/exceptions'

interface JournalEntryPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  actionLabel: string
  exceptionId: string
  amount: number
  currency: string
  journalEntries?: JournalEntry[]
  approval?: ApprovalMetadata
}

export const JournalEntryPreviewModal: React.FC<JournalEntryPreviewModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  actionLabel,
  exceptionId,
  amount,
  currency,
  journalEntries,
  approval
}) => {
  if (!isOpen) return null

  const formatAmount = (value: number, curr: string) => {
    return `${curr} ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <div>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#101828' }}>
              Journal Entry Preview
            </h2>
            <p style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace' }}>
              {exceptionId}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto max-h-[60vh]">
          {/* Journal Entries */}
          {journalEntries && journalEntries.length > 0 && (
            <div className="space-y-3">
              {journalEntries.map((entry) => (
                <div key={entry.entryNumber} className="border border-slate-200 rounded-lg overflow-hidden">
                  {/* Entry Header */}
                  <div className="bg-slate-50 px-3 py-2 border-b border-slate-200">
                    <p style={{ fontSize: 10, fontWeight: 600, color: '#475569' }}>
                      {entry.description}
                    </p>
                  </div>

                  {/* Entry Lines - Compact Table */}
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th style={{ fontSize: 9, fontWeight: 600, color: '#94a3b8', textAlign: 'left', padding: '4px 8px', textTransform: 'uppercase' }}>
                          Account
                        </th>
                        <th style={{ fontSize: 9, fontWeight: 600, color: '#94a3b8', textAlign: 'right', padding: '4px 8px', textTransform: 'uppercase' }}>
                          Debit
                        </th>
                        <th style={{ fontSize: 9, fontWeight: 600, color: '#94a3b8', textAlign: 'right', padding: '4px 8px', textTransform: 'uppercase' }}>
                          Credit
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {entry.lines.map((line) => (
                        <tr key={line.lineNumber} className="border-b border-slate-50">
                          <td style={{ fontSize: 10, color: '#475569', padding: '6px 8px' }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0369a1' }}>{line.account}</span>
                            <span style={{ color: '#94a3b8', marginLeft: 4 }}>{line.accountName}</span>
                          </td>
                          <td style={{ fontSize: 10, fontWeight: 600, color: line.debitCredit === 'debit' ? '#059669' : '#e2e8f0', padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>
                            {line.debitCredit === 'debit' ? formatAmount(line.amount, line.currency) : '—'}
                          </td>
                          <td style={{ fontSize: 10, fontWeight: 600, color: line.debitCredit === 'credit' ? '#dc2626' : '#e2e8f0', padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>
                            {line.debitCredit === 'credit' ? formatAmount(line.amount, line.currency) : '—'}
                          </td>
                        </tr>
                      ))}
                      {/* Total Row */}
                      <tr className="bg-slate-50">
                        <td style={{ fontSize: 10, fontWeight: 600, color: '#475569', padding: '6px 8px' }}>
                          Total
                        </td>
                        <td style={{ fontSize: 10, fontWeight: 700, color: '#059669', padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>
                          {formatAmount(entry.totalDebit || 0, currency)}
                        </td>
                        <td style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>
                          {formatAmount(entry.totalCredit || 0, currency)}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Balanced indicator */}
                  {entry.totalDebit === entry.totalCredit && (
                    <div className="px-3 py-1.5 bg-emerald-50 flex items-center gap-1.5">
                      <CheckCircle2 size={12} className="text-emerald-600" />
                      <span style={{ fontSize: 9, fontWeight: 600, color: '#059669' }}>
                        Balanced (DR = CR)
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Approval Requirement */}
          {approval?.approvalRequired && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle size={14} className="text-amber-600 mt-0.5" />
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#92400e', marginBottom: 2 }}>
                    Approval Required
                  </p>
                  <p style={{ fontSize: 10, color: '#78350f', lineHeight: 1.4 }}>
                    {approval.approvalReason}
                  </p>
                  <p style={{ fontSize: 9, color: '#92400e', marginTop: 4 }}>
                    Approver: <span style={{ fontWeight: 600 }}>{approval.approverName}</span> ({approval.approvalLevel})
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* No Journal Entries */}
          {(!journalEntries || journalEntries.length === 0) && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center">
              <p style={{ fontSize: 10, color: '#64748b' }}>
                No journal entries will be posted
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-slate-200 px-4 py-3 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded hover:bg-slate-50 transition-colors"
            style={{ fontSize: 11, fontWeight: 600 }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-3 py-1.5 font-semibold rounded transition-colors ${
              approval?.approvalRequired
                ? 'bg-amber-600 text-white hover:bg-amber-700'
                : 'bg-sky-600 text-white hover:bg-sky-700'
            }`}
            style={{ fontSize: 11 }}
          >
            {approval?.approvalRequired ? 'Submit for Approval' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
