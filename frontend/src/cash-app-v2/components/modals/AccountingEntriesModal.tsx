/**
 * Accounting Entries Modal
 * Displays journal entries for reconciled bank credits (cash applied in books)
 */

import React from 'react'
import { X, CheckCircle2, BookOpen, FileText, Calendar, Hash, Building2 } from 'lucide-react'
import type { JournalEntry } from '../../types/exceptions'

interface AccountingEntriesModalProps {
  isOpen: boolean
  onClose: () => void
  creditId: string
  creditAmount: number
  currency: string
  journalEntries: JournalEntry[]
  postedDate: string
  postedBy?: string
}

export const AccountingEntriesModal: React.FC<AccountingEntriesModalProps> = ({
  isOpen,
  onClose,
  creditId,
  creditAmount,
  currency,
  journalEntries,
  postedDate,
  postedBy = 'System'
}) => {
  if (!isOpen) return null

  const formatAmount = (value: number, curr: string) => {
    return `${curr} ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  // Calculate totals
  const totalDebit = journalEntries.reduce((sum, entry) =>
    sum + entry.lines.filter(l => l.debitCredit === 'debit').reduce((s, l) => s + l.amount, 0), 0
  )
  const totalCredit = journalEntries.reduce((sum, entry) =>
    sum + entry.lines.filter(l => l.debitCredit === 'credit').reduce((s, l) => s + l.amount, 0), 0
  )

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-800 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center">
              <BookOpen size={16} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Accounting Entries</span>
                <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, backgroundColor: 'rgba(56,189,248,0.2)', color: '#7dd3fc' }}>
                  POSTED
                </span>
              </div>
              <p style={{ fontSize: 9, color: '#94a3b8', marginTop: 1 }}>
                <span style={{ fontFamily: 'monospace' }}>{creditId}</span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded transition-colors">
            <X size={16} className="text-white/70" />
          </button>
        </div>

        {/* Posted Status Banner */}
        <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={14} className="text-emerald-600" />
            <span style={{ fontSize: 10, fontWeight: 600, color: '#047857' }}>
              Cash Applied & Posted to General Ledger
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Calendar size={10} className="text-emerald-600" />
              <span style={{ fontSize: 9, color: '#065f46' }}>{formatDate(postedDate)}</span>
            </div>
            <div className="flex items-center gap-1">
              <Building2 size={10} className="text-emerald-600" />
              <span style={{ fontSize: 9, color: '#065f46' }}>{postedBy}</span>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
          <div className="grid grid-cols-4 gap-4">
            <div>
              <p style={{ fontSize: 8, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>
                Bank Credit
              </p>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#0369a1', fontFamily: 'monospace' }}>
                {formatAmount(creditAmount, currency)}
              </p>
            </div>
            <div>
              <p style={{ fontSize: 8, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>
                Total Debits
              </p>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#059669', fontFamily: 'monospace' }}>
                {formatAmount(totalDebit, currency)}
              </p>
            </div>
            <div>
              <p style={{ fontSize: 8, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>
                Total Credits
              </p>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', fontFamily: 'monospace' }}>
                {formatAmount(totalCredit, currency)}
              </p>
            </div>
            <div>
              <p style={{ fontSize: 8, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>
                Balance
              </p>
              <p style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: Math.abs(totalDebit - totalCredit) < 0.01 ? '#059669' : '#dc2626' }}>
                {Math.abs(totalDebit - totalCredit) < 0.01 ? 'Balanced ✓' : formatAmount(totalDebit - totalCredit, currency)}
              </p>
            </div>
          </div>
        </div>

        {/* Journal Entries */}
        <div className="p-4 overflow-y-auto max-h-[50vh] space-y-3">
          {journalEntries.map((entry) => (
            <div key={entry.entryNumber} className="border border-slate-200 rounded-lg overflow-hidden">
              {/* Entry Header */}
              <div className="bg-slate-100 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText size={12} className="text-slate-500" />
                  <p style={{ fontSize: 10, fontWeight: 600, color: '#334155' }}>
                    {entry.description}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#64748b' }}>
                    JE-{String(entry.entryNumber).padStart(4, '0')}
                  </span>
                  <span style={{ fontSize: 9, color: '#94a3b8' }}>
                    {formatDate(entry.postingDate)}
                  </span>
                </div>
              </div>

              {/* Entry Lines Table */}
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th style={{ fontSize: 8, fontWeight: 600, color: '#94a3b8', textAlign: 'left', padding: '6px 10px', textTransform: 'uppercase' }}>
                      Account
                    </th>
                    <th style={{ fontSize: 8, fontWeight: 600, color: '#94a3b8', textAlign: 'left', padding: '6px 10px', textTransform: 'uppercase' }}>
                      Description
                    </th>
                    <th style={{ fontSize: 8, fontWeight: 600, color: '#94a3b8', textAlign: 'right', padding: '6px 10px', textTransform: 'uppercase' }}>
                      Debit
                    </th>
                    <th style={{ fontSize: 8, fontWeight: 600, color: '#94a3b8', textAlign: 'right', padding: '6px 10px', textTransform: 'uppercase' }}>
                      Credit
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entry.lines.map((line) => (
                    <tr key={line.lineNumber} className="border-b border-slate-50 hover:bg-slate-50">
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 600, color: '#0369a1' }}>
                          {line.account}
                        </span>
                      </td>
                      <td style={{ fontSize: 10, color: '#475569', padding: '8px 10px' }}>
                        {line.accountName}
                      </td>
                      <td style={{ fontSize: 10, fontWeight: 600, fontFamily: 'monospace', padding: '8px 10px', textAlign: 'right', color: line.debitCredit === 'debit' ? '#059669' : '#e2e8f0' }}>
                        {line.debitCredit === 'debit' ? formatAmount(line.amount, line.currency) : '—'}
                      </td>
                      <td style={{ fontSize: 10, fontWeight: 600, fontFamily: 'monospace', padding: '8px 10px', textAlign: 'right', color: line.debitCredit === 'credit' ? '#dc2626' : '#e2e8f0' }}>
                        {line.debitCredit === 'credit' ? formatAmount(line.amount, line.currency) : '—'}
                      </td>
                    </tr>
                  ))}
                  {/* Entry Totals */}
                  <tr className="bg-slate-100 font-semibold">
                    <td colSpan={2} style={{ fontSize: 10, fontWeight: 600, color: '#334155', padding: '8px 10px' }}>
                      Entry Total
                    </td>
                    <td style={{ fontSize: 10, fontWeight: 700, fontFamily: 'monospace', padding: '8px 10px', textAlign: 'right', color: '#059669' }}>
                      {formatAmount(entry.lines.filter(l => l.debitCredit === 'debit').reduce((s, l) => s + l.amount, 0), currency)}
                    </td>
                    <td style={{ fontSize: 10, fontWeight: 700, fontFamily: 'monospace', padding: '8px 10px', textAlign: 'right', color: '#dc2626' }}>
                      {formatAmount(entry.lines.filter(l => l.debitCredit === 'credit').reduce((s, l) => s + l.amount, 0), currency)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Balanced indicator */}
              {(() => {
                const entryDebit = entry.lines.filter(l => l.debitCredit === 'debit').reduce((s, l) => s + l.amount, 0)
                const entryCredit = entry.lines.filter(l => l.debitCredit === 'credit').reduce((s, l) => s + l.amount, 0)
                return Math.abs(entryDebit - entryCredit) < 0.01 && (
                  <div className="px-3 py-1.5 bg-emerald-50 flex items-center gap-1.5">
                    <CheckCircle2 size={10} className="text-emerald-600" />
                    <span style={{ fontSize: 8, fontWeight: 600, color: '#059669' }}>
                      Entry Balanced (DR = CR)
                    </span>
                  </div>
                )
              })()}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-4 py-3 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Hash size={12} className="text-slate-400" />
            <span style={{ fontSize: 9, color: '#64748b' }}>
              {journalEntries.length} Journal {journalEntries.length === 1 ? 'Entry' : 'Entries'} • {journalEntries.reduce((sum, e) => sum + e.lines.length, 0)} Lines
            </span>
          </div>
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
