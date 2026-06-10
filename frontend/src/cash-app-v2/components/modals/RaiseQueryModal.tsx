/**
 * Raise Query Modal
 * Allows users to raise a support ticket/query for unmatched bank credits
 */

import React, { useState } from 'react'
import { X, AlertCircle, Send, Loader2 } from 'lucide-react'
import type { TicketCategory, TicketPriority } from '../../types/domain'

interface RaiseQueryModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (ticketData: NewTicketData) => void
  creditId: string
  creditAmount: number
  currency: string
  pspId: string
  pspName: string
  valueDate: string
}

export interface NewTicketData {
  subject: string
  description: string
  category: TicketCategory
  priority: TicketPriority
  creditId: string
  creditAmount: number
  currency: string
  pspId: string
  pspName: string
}

const CATEGORY_OPTIONS: { value: TicketCategory; label: string }[] = [
  { value: 'settlement_dispute', label: 'Settlement Dispute' },
  { value: 'file_missing', label: 'Missing Settlement File' },
  { value: 'psp_inquiry', label: 'PSP Inquiry' },
  { value: 'fee_dispute', label: 'Fee Dispute' },
  { value: 'technical_issue', label: 'Technical Issue' },
  { value: 'general', label: 'General Query' },
]

const PRIORITY_OPTIONS: { value: TicketPriority; label: string; color: string }[] = [
  { value: 'critical', label: 'Critical', color: '#dc2626' },
  { value: 'high', label: 'High', color: '#ea580c' },
  { value: 'medium', label: 'Medium', color: '#ca8a04' },
  { value: 'low', label: 'Low', color: '#64748b' },
]

export const RaiseQueryModal: React.FC<RaiseQueryModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  creditId,
  creditAmount,
  currency,
  pspId,
  pspName,
  valueDate,
}) => {
  const [subject, setSubject] = useState(`Unmatched Bank Credit - ${creditId}`)
  const [description, setDescription] = useState(
    `Bank credit ${creditId} for ${currency} ${creditAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} received on ${valueDate} has no matching PSP settlement file. Please investigate and provide settlement details.`
  )
  const [category, setCategory] = useState<TicketCategory>('settlement_dispute')
  const [priority, setPriority] = useState<TicketPriority>('medium')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<{ subject?: string; description?: string }>({})

  const validate = (): boolean => {
    const newErrors: { subject?: string; description?: string } = {}

    if (!subject.trim()) {
      newErrors.subject = 'Subject is required'
    } else if (subject.length < 10) {
      newErrors.subject = 'Subject must be at least 10 characters'
    }

    if (!description.trim()) {
      newErrors.description = 'Description is required'
    } else if (description.length < 20) {
      newErrors.description = 'Description must be at least 20 characters'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return

    setIsSubmitting(true)

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 2000))

    onSubmit({
      subject: subject.trim(),
      description: description.trim(),
      category,
      priority,
      creditId,
      creditAmount,
      currency,
      pspId,
      pspName,
    })

    setIsSubmitting(false)
  }

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-amber-600 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center">
              <AlertCircle size={16} className="text-white" />
            </div>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Raise Query</span>
              <p style={{ fontSize: 9, color: '#fef3c7', marginTop: 1 }}>
                Create support ticket for PSP
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 hover:bg-white/10 rounded transition-colors disabled:opacity-50"
          >
            <X size={16} className="text-white/70" />
          </button>
        </div>

        {/* Credit Info Summary */}
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Credit ID</p>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#0369a1', fontFamily: 'monospace' }}>{creditId}</p>
            </div>
            <div>
              <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Amount</p>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#101828', fontFamily: 'monospace' }}>
                {currency} {creditAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>PSP</p>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>{pspName}</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="p-4 space-y-4 max-h-[50vh] overflow-y-auto">
          {/* Subject */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
              Subject <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value)
                if (errors.subject) setErrors({ ...errors, subject: undefined })
              }}
              disabled={isSubmitting}
              placeholder="Brief summary of the issue..."
              className={`w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100 ${
                errors.subject ? 'border-red-500' : 'border-slate-300'
              }`}
              style={{ fontSize: 11 }}
            />
            {errors.subject && (
              <p style={{ fontSize: 10, color: '#dc2626', marginTop: 2 }}>{errors.subject}</p>
            )}
          </div>

          {/* Category & Priority Row */}
          <div className="grid grid-cols-2 gap-3">
            {/* Category */}
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TicketCategory)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100"
                style={{ fontSize: 11 }}
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TicketPriority)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100"
                style={{ fontSize: 11 }}
              >
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
              Description <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => {
                setDescription(e.target.value)
                if (errors.description) setErrors({ ...errors, description: undefined })
              }}
              disabled={isSubmitting}
              placeholder="Detailed description of the issue..."
              rows={5}
              className={`w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none disabled:bg-slate-100 ${
                errors.description ? 'border-red-500' : 'border-slate-300'
              }`}
              style={{ fontSize: 11, lineHeight: 1.5 }}
            />
            {errors.description && (
              <p style={{ fontSize: 10, color: '#dc2626', marginTop: 2 }}>{errors.description}</p>
            )}
            <p style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>
              {description.length} characters
            </p>
          </div>

          {/* Info Note */}
          <div className="bg-sky-50 border border-sky-200 rounded p-3">
            <p style={{ fontSize: 10, color: '#0369a1', lineHeight: 1.5 }}>
              <strong>Note:</strong> This ticket will be assigned to the finance team and routed to {pspName} support.
              You can track progress in the <strong>Audit &gt; Open Tickets</strong> section.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-4 py-3 flex items-center justify-between bg-slate-50">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-1.5 bg-white border border-slate-300 text-slate-700 rounded hover:bg-slate-50 transition-colors disabled:opacity-50"
            style={{ fontSize: 11, fontWeight: 600 }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`px-4 py-1.5 rounded transition-colors flex items-center gap-2 ${
              isSubmitting
                ? 'bg-amber-400 text-white cursor-wait'
                : 'bg-amber-600 text-white hover:bg-amber-700'
            }`}
            style={{ fontSize: 11, fontWeight: 600 }}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Creating Ticket...
              </>
            ) : (
              <>
                <Send size={14} />
                Raise Query
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
