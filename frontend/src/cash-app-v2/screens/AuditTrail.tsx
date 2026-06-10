/**
 * Audit Trail - Enterprise Activity Log & Support Tickets
 *
 * SOX/SOC2 compliant audit trail with:
 * - Full activity timeline with state changes
 * - Advanced filtering (date, event type, actor, search)
 * - Export functionality for compliance reporting
 * - Real-time activity indicators
 * - Open tickets tracking for PSP communications
 */

import React, { useState, useEffect, useMemo } from 'react'
import {
  Search,
  Download,
  Filter,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  Link,
  FileText,
  CheckSquare,
  XSquare,
  Upload,
  DollarSign,
  Plug,
  Settings,
  RefreshCw,
  Scale,
  Sparkles,
  Clock,
  User,
  Calendar,
  Activity,
  Shield,
  Database,
  ArrowRight,
  ExternalLink,
  Ticket,
  MessageSquare,
  AlertTriangle,
  AlertOctagon,
  HelpCircle,
  FileX,
  Send,
  Paperclip,
} from 'lucide-react'
import { SkeletonCard, SkeletonTable } from '../components/ui/Skeleton'
import { auditService, ticketsService } from '../services'
import { EVENT_TYPE_META } from '../data/auditData'
import { TICKET_STATUS_META, TICKET_PRIORITY_META, TICKET_CATEGORY_META } from '../data/ticketsData'
import type { AuditEntry, AuditEventType, Ticket as TicketType, TicketComment, TicketStats } from '../types/domain'

// ============================================================================
// ICON MAPPING
// ============================================================================

const ICON_MAP: Record<string, React.ReactNode> = {
  'AlertCircle': <AlertCircle size={14} />,
  'Link': <Link size={14} />,
  'CheckCircle': <CheckCircle size={14} />,
  'Check': <CheckCircle size={14} />,
  'Sparkles': <Sparkles size={14} />,
  'FileText': <FileText size={14} />,
  'CheckSquare': <CheckSquare size={14} />,
  'XSquare': <XSquare size={14} />,
  'Upload': <Upload size={14} />,
  'DollarSign': <DollarSign size={14} />,
  'Plug': <Plug size={14} />,
  'Settings': <Settings size={14} />,
  'RefreshCw': <RefreshCw size={14} />,
  'Scale': <Scale size={14} />,
}

// ============================================================================
// KPI CARD
// ============================================================================

interface KPICardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
  colorClass: string
}

const KPICard: React.FC<KPICardProps> = ({ title, value, subtitle, icon, colorClass }) => (
  <div
    style={{
      backgroundColor: 'white',
      borderRadius: 6,
      border: '1px solid #E2E8F0',
      borderLeft: `3px solid ${colorClass}`,
      padding: '12px 14px',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
      <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {title}
      </p>
      <div style={{ color: colorClass, opacity: 0.7 }}>{icon}</div>
    </div>
    <p style={{ fontSize: 20, fontWeight: 700, color: '#101828', marginBottom: 2 }}>{value}</p>
    {subtitle && <p style={{ fontSize: 10, color: '#64748b' }}>{subtitle}</p>}
  </div>
)

// ============================================================================
// CATEGORY BADGE
// ============================================================================

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'reconciliation': { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  'exception': { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  'journal': { bg: '#e0e7ff', text: '#3730a3', border: '#a5b4fc' },
  'config': { bg: '#f3e8ff', text: '#6b21a8', border: '#c4b5fd' },
  'system': { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
}

const CategoryBadge: React.FC<{ category: string }> = ({ category }) => {
  const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS['system']
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 600,
        padding: '2px 6px',
        borderRadius: 4,
        backgroundColor: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        textTransform: 'uppercase',
        letterSpacing: '0.03em',
      }}
    >
      {category}
    </span>
  )
}

// ============================================================================
// AUDIT ENTRY ROW
// ============================================================================

interface AuditEntryRowProps {
  entry: AuditEntry
  isExpanded: boolean
  onToggle: () => void
}

const AuditEntryRow: React.FC<AuditEntryRowProps> = ({ entry, isExpanded, onToggle }) => {
  const meta = EVENT_TYPE_META[entry.eventType]
  const icon = meta ? ICON_MAP[meta.icon] : <Activity size={14} />

  const formatTimestamp = (ts: string) => {
    const date = new Date(ts)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)

    if (diffHours < 1) {
      const diffMins = Math.floor(diffMs / (1000 * 60))
      return `${diffMins}m ago`
    } else if (diffHours < 24) {
      return `${diffHours}h ago`
    } else if (diffDays < 7) {
      return `${diffDays}d ago`
    } else {
      return date.toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' })
    }
  }

  const formatFullTimestamp = (ts: string) => {
    const date = new Date(ts)
    return date.toLocaleString('en-SG', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  }

  const formatCurrency = (amount: number, currency: string) => {
    return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return (
    <div
      style={{
        backgroundColor: isExpanded ? '#f8fafc' : 'white',
        borderBottom: '1px solid #f1f5f9',
        transition: 'background-color 0.15s',
      }}
    >
      {/* Main Row */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          padding: '12px 16px',
          cursor: 'pointer',
          gap: 12,
        }}
        className="hover:bg-slate-50"
      >
        {/* Timeline indicator */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 2 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              backgroundColor: meta?.color || '#64748b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
            }}
          >
            {icon}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#111827' }}>
              {meta?.label || entry.eventType}
            </span>
            <CategoryBadge category={meta?.category || 'system'} />
            {entry.actor === 'SYSTEM' && (
              <span
                style={{
                  fontSize: 8,
                  fontWeight: 600,
                  padding: '1px 5px',
                  borderRadius: 3,
                  backgroundColor: '#f1f5f9',
                  color: '#64748b',
                  border: '1px solid #e2e8f0',
                }}
              >
                AUTOMATED
              </span>
            )}
          </div>

          <p style={{ fontSize: 11, color: '#374151', marginBottom: 6, lineHeight: 1.5 }}>
            {entry.eventDescription}
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <User size={11} style={{ color: '#94a3b8' }} />
              <span style={{ fontSize: 10, color: '#64748b' }}>{entry.actorName}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={11} style={{ color: '#94a3b8' }} />
              <span style={{ fontSize: 10, color: '#64748b' }} title={formatFullTimestamp(entry.timestamp)}>
                {formatTimestamp(entry.timestamp)}
              </span>
            </div>

            {entry.recordId && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Database size={11} style={{ color: '#94a3b8' }} />
                <span style={{ fontSize: 10, color: '#0369a1', fontFamily: 'monospace' }}>
                  {entry.recordId}
                </span>
              </div>
            )}

            {entry.amount !== null && entry.currency && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <DollarSign size={11} style={{ color: '#94a3b8' }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: '#059669', fontFamily: 'monospace' }}>
                  {formatCurrency(entry.amount, entry.currency)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Expand/Collapse */}
        <div style={{ paddingTop: 2, color: '#94a3b8' }}>
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div style={{ padding: '0 16px 16px 56px' }}>
          <div
            style={{
              backgroundColor: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              padding: 12,
            }}
          >
            {/* Metadata Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
              <div>
                <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>
                  Audit ID
                </p>
                <p style={{ fontSize: 11, fontFamily: 'monospace', color: '#374151' }}>{entry.id}</p>
              </div>
              <div>
                <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>
                  Timestamp (UTC)
                </p>
                <p style={{ fontSize: 11, fontFamily: 'monospace', color: '#374151' }}>{entry.timestamp}</p>
              </div>
              <div>
                <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>
                  Actor ID
                </p>
                <p style={{ fontSize: 11, fontFamily: 'monospace', color: '#374151' }}>{entry.actor}</p>
              </div>
              <div>
                <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>
                  Event Type
                </p>
                <p style={{ fontSize: 11, fontFamily: 'monospace', color: '#374151' }}>{entry.eventType}</p>
              </div>
            </div>

            {/* State Change */}
            {(entry.beforeState || entry.afterState) && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>
                  State Change
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      flex: 1,
                      backgroundColor: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: 4,
                      padding: 8,
                    }}
                  >
                    <p style={{ fontSize: 8, fontWeight: 600, color: '#991b1b', marginBottom: 4 }}>BEFORE</p>
                    <code style={{ fontSize: 10, color: '#7f1d1d' }}>{entry.beforeState || '(none)'}</code>
                  </div>
                  <ArrowRight size={16} style={{ color: '#94a3b8', flexShrink: 0 }} />
                  <div
                    style={{
                      flex: 1,
                      backgroundColor: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      borderRadius: 4,
                      padding: 8,
                    }}
                  >
                    <p style={{ fontSize: 8, fontWeight: 600, color: '#166534', marginBottom: 4 }}>AFTER</p>
                    <code style={{ fontSize: 10, color: '#14532d' }}>{entry.afterState || '(none)'}</code>
                  </div>
                </div>
              </div>
            )}

            {/* Metadata */}
            {entry.metadata && Object.keys(entry.metadata).length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>
                  Additional Details
                </p>
                <div
                  style={{
                    backgroundColor: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 4,
                    padding: 8,
                    fontFamily: 'monospace',
                    fontSize: 10,
                    color: '#374151',
                    whiteSpace: 'pre-wrap',
                    overflowX: 'auto',
                  }}
                >
                  {JSON.stringify(entry.metadata, null, 2)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// TICKET ROW COMPONENT
// ============================================================================

interface TicketRowProps {
  ticket: TicketType
  isExpanded: boolean
  onToggle: () => void
  comments: TicketComment[]
  onReply: (ticketId: string, message: string, isInternal: boolean) => void
  onEscalate: (ticketId: string) => void
}

const TicketRow: React.FC<TicketRowProps> = ({ ticket, isExpanded, onToggle, comments, onReply, onEscalate }) => {
  const [replyText, setReplyText] = useState('')
  const [isInternalNote, setIsInternalNote] = useState(false)
  const [showReplyBox, setShowReplyBox] = useState(false)

  const statusMeta = TICKET_STATUS_META[ticket.status]
  const priorityMeta = TICKET_PRIORITY_META[ticket.priority]
  const categoryMeta = TICKET_CATEGORY_META[ticket.category]

  const formatTimestamp = (ts: string) => {
    const date = new Date(ts)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)

    if (diffHours < 1) {
      const diffMins = Math.floor(diffMs / (1000 * 60))
      return `${diffMins}m ago`
    } else if (diffHours < 24) {
      return `${diffHours}h ago`
    } else if (diffDays < 7) {
      return `${diffDays}d ago`
    }
    return date.toLocaleDateString('en-SG', { day: '2-digit', month: 'short' })
  }

  const formatCurrency = (amount: number, currency: string) =>
    `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const getDueStatus = () => {
    const now = new Date()
    const due = new Date(ticket.dueDate)
    const diffMs = due.getTime() - now.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)

    if (ticket.slaBreach) {
      return { text: 'SLA Breached', color: '#dc2626', bgColor: '#fee2e2' }
    } else if (diffHours < 0) {
      return { text: 'Overdue', color: '#dc2626', bgColor: '#fee2e2' }
    } else if (diffHours < 24) {
      return { text: `Due in ${diffHours}h`, color: '#ea580c', bgColor: '#ffedd5' }
    } else if (diffDays < 3) {
      return { text: `Due in ${diffDays}d`, color: '#ca8a04', bgColor: '#fef9c3' }
    }
    return { text: `Due in ${diffDays}d`, color: '#64748b', bgColor: '#f1f5f9' }
  }

  const dueStatus = getDueStatus()

  return (
    <div data-ticket-id={ticket.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: isExpanded ? '#f8fafc' : 'white' }}>
      {/* Main Row */}
      <div
        onClick={onToggle}
        style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12 }}
        className="hover:bg-slate-50"
      >
        {/* Priority Indicator */}
        <div
          style={{
            width: 4,
            height: 40,
            borderRadius: 2,
            backgroundColor: priorityMeta.color,
            flexShrink: 0,
            marginTop: 2,
          }}
        />

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#64748b' }}>{ticket.id}</span>
            <span
              style={{
                fontSize: 8,
                fontWeight: 600,
                padding: '2px 6px',
                borderRadius: 3,
                backgroundColor: statusMeta.bgColor,
                color: statusMeta.color,
                textTransform: 'uppercase',
              }}
            >
              {statusMeta.label}
            </span>
            <span
              style={{
                fontSize: 8,
                fontWeight: 600,
                padding: '2px 6px',
                borderRadius: 3,
                backgroundColor: priorityMeta.bgColor,
                color: priorityMeta.color,
                textTransform: 'uppercase',
              }}
            >
              {priorityMeta.label}
            </span>
            {ticket.slaBreach && (
              <span
                style={{
                  fontSize: 8,
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: 3,
                  backgroundColor: '#fee2e2',
                  color: '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                }}
              >
                <AlertTriangle size={10} /> SLA BREACH
              </span>
            )}
          </div>

          <p style={{ fontSize: 12, fontWeight: 600, color: '#111827', marginBottom: 4 }}>{ticket.subject}</p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 500,
                  padding: '2px 6px',
                  borderRadius: 3,
                  backgroundColor: '#e0f2fe',
                  color: '#0369a1',
                }}
              >
                {ticket.pspName}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <User size={10} style={{ color: '#94a3b8' }} />
              <span style={{ fontSize: 10, color: '#64748b' }}>{ticket.assigneeName}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={10} style={{ color: '#94a3b8' }} />
              <span style={{ fontSize: 10, color: '#64748b' }}>{formatTimestamp(ticket.createdAt)}</span>
            </div>
            <span
              style={{
                fontSize: 9,
                fontWeight: 500,
                padding: '2px 6px',
                borderRadius: 3,
                backgroundColor: dueStatus.bgColor,
                color: dueStatus.color,
              }}
            >
              {dueStatus.text}
            </span>
            {ticket.amount && (
              <span style={{ fontSize: 10, fontWeight: 600, color: '#059669', fontFamily: 'monospace' }}>
                {formatCurrency(ticket.amount, ticket.currency || 'SGD')}
              </span>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <MessageSquare size={10} style={{ color: '#94a3b8' }} />
              <span style={{ fontSize: 10, color: '#64748b' }}>{ticket.responseCount}</span>
            </div>
          </div>
        </div>

        <ChevronRight
          size={16}
          style={{ color: '#94a3b8', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
        />
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div style={{ padding: '0 16px 16px 32px' }}>
          <div style={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden' }}>
            {/* Description */}
            <div style={{ padding: 12, borderBottom: '1px solid #f1f5f9' }}>
              <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>
                Description
              </p>
              <p style={{ fontSize: 11, color: '#374151', lineHeight: 1.5 }}>{ticket.description}</p>
            </div>

            {/* Related Record */}
            {ticket.relatedRecordId && (
              <div style={{ padding: 12, borderBottom: '1px solid #f1f5f9', backgroundColor: '#f8fafc' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Database size={12} style={{ color: '#64748b' }} />
                  <span style={{ fontSize: 10, color: '#64748b' }}>Related Record:</span>
                  <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#0369a1' }}>{ticket.relatedRecordId}</span>
                  <span style={{ fontSize: 9, color: '#94a3b8' }}>({ticket.relatedRecordType})</span>
                </div>
              </div>
            )}

            {/* Conversation History */}
            <div style={{ padding: 12 }}>
              <p style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>
                Conversation ({comments.length} messages)
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                {comments.map(comment => (
                  <div
                    key={comment.id}
                    style={{
                      padding: 10,
                      borderRadius: 6,
                      backgroundColor: comment.authorType === 'psp' ? '#f0fdf4' : comment.isInternal ? '#fef3c7' : '#f1f5f9',
                      borderLeft: `3px solid ${comment.authorType === 'psp' ? '#22c55e' : comment.isInternal ? '#f59e0b' : '#94a3b8'}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: '#374151' }}>{comment.authorName}</span>
                      {comment.authorType === 'psp' && (
                        <span style={{ fontSize: 8, fontWeight: 600, padding: '1px 4px', borderRadius: 2, backgroundColor: '#dcfce7', color: '#166534' }}>
                          PSP
                        </span>
                      )}
                      {comment.isInternal && (
                        <span style={{ fontSize: 8, fontWeight: 600, padding: '1px 4px', borderRadius: 2, backgroundColor: '#fef9c3', color: '#a16207' }}>
                          INTERNAL
                        </span>
                      )}
                      <span style={{ fontSize: 9, color: '#94a3b8' }}>{formatTimestamp(comment.timestamp)}</span>
                    </div>
                    <p style={{ fontSize: 11, color: '#374151', lineHeight: 1.5 }}>{comment.content}</p>
                    {comment.attachments && comment.attachments.length > 0 && (
                      <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>
                        {comment.attachments.map(att => (
                          <div
                            key={att.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '4px 8px',
                              backgroundColor: '#fff',
                              border: '1px solid #e2e8f0',
                              borderRadius: 4,
                              fontSize: 9,
                              color: '#0369a1',
                            }}
                          >
                            <Paperclip size={10} />
                            {att.fileName}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Reply Box */}
              {showReplyBox && (
                <div style={{ marginTop: 12, padding: 12, backgroundColor: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <div style={{ marginBottom: 8 }}>
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Type your reply..."
                      style={{
                        width: '100%',
                        minHeight: 80,
                        padding: 10,
                        fontSize: 11,
                        border: '1px solid #cbd5e1',
                        borderRadius: 4,
                        resize: 'vertical',
                        fontFamily: 'inherit',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={isInternalNote}
                        onChange={(e) => setIsInternalNote(e.target.checked)}
                        style={{ width: 14, height: 14 }}
                      />
                      <span style={{ fontSize: 10, color: '#64748b' }}>Internal note (not visible to PSP)</span>
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => {
                          setShowReplyBox(false)
                          setReplyText('')
                          setIsInternalNote(false)
                        }}
                        style={{
                          padding: '6px 12px',
                          fontSize: 10,
                          fontWeight: 600,
                          color: '#64748b',
                          backgroundColor: 'white',
                          border: '1px solid #cbd5e1',
                          borderRadius: 4,
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        disabled={!replyText.trim()}
                        onClick={() => {
                          if (replyText.trim()) {
                            onReply(ticket.id, replyText.trim(), isInternalNote)
                            setReplyText('')
                            setIsInternalNote(false)
                            setShowReplyBox(false)
                          }
                        }}
                        style={{
                          padding: '6px 12px',
                          fontSize: 10,
                          fontWeight: 600,
                          color: 'white',
                          backgroundColor: replyText.trim() ? '#0369a1' : '#94a3b8',
                          border: 'none',
                          borderRadius: 4,
                          cursor: replyText.trim() ? 'pointer' : 'not-allowed',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <Send size={12} />
                        Send Reply
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8 }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowReplyBox(!showReplyBox)
                  }}
                  style={{
                    padding: '6px 14px',
                    fontSize: 10,
                    fontWeight: 600,
                    color: '#0369a1',
                    backgroundColor: '#e0f2fe',
                    border: '1px solid #7dd3fc',
                    borderRadius: 4,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <MessageSquare size={12} />
                  Reply
                </button>
                {ticket.priority !== 'critical' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onEscalate(ticket.id)
                    }}
                    style={{
                      padding: '6px 14px',
                      fontSize: 10,
                      fontWeight: 600,
                      color: '#dc2626',
                      backgroundColor: '#fee2e2',
                      border: '1px solid #fca5a5',
                      borderRadius: 4,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <AlertTriangle size={12} />
                    Escalate
                  </button>
                )}
                {ticket.priority === 'critical' && (
                  <span style={{ padding: '6px 14px', fontSize: 10, fontWeight: 600, color: '#dc2626', backgroundColor: '#fee2e2', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlertTriangle size={12} />
                    Already Escalated
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const AuditTrail: React.FC = () => {
  // Tab state
  const [activeTab, setActiveTab] = useState<'activity' | 'tickets'>('activity')
  const [initialUrlProcessed, setInitialUrlProcessed] = useState(false)

  // Audit state
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // Ticket state
  const [tickets, setTickets] = useState<TicketType[]>([])
  const [ticketStats, setTicketStats] = useState<TicketStats | null>(null)
  const [ticketsLoading, setTicketsLoading] = useState(true)
  const [expandedTicketIds, setExpandedTicketIds] = useState<Set<string>>(new Set())
  const [ticketComments, setTicketComments] = useState<Record<string, TicketComment[]>>({})

  // Filters
  const [dateRange, setDateRange] = useState<'today' | '7d' | '30d' | '90d' | 'all'>('30d')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [selectedActors, setSelectedActors] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  // Stats
  const [stats, setStats] = useState<{
    total: number
    byCategory: Record<string, number>
    uniqueActors: { id: string; name: string }[]
  } | null>(null)

  // Pagination
  const [displayCount, setDisplayCount] = useState(50)

  // Process URL params on mount (client-side only)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tabParam = params.get('tab')
    if (tabParam === 'tickets') {
      setActiveTab('tickets')
    }
    setInitialUrlProcessed(true)
  }, [])

  // Calculate date range
  const getDateFilters = () => {
    const today = new Date()
    let dateFrom: string | undefined
    const dateTo = today.toISOString().split('T')[0]

    switch (dateRange) {
      case 'today':
        dateFrom = dateTo
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

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      console.log('[AuditTrail] Fetching data with dateRange:', dateRange)
      try {
        const { dateFrom, dateTo } = getDateFilters()
        console.log('[AuditTrail] Date filters:', { dateFrom, dateTo })
        const [entriesData, statsData] = await Promise.all([
          auditService.getAuditEntries({
            dateFrom,
            dateTo,
            categories: selectedCategories.length > 0 ? selectedCategories : undefined,
            actors: selectedActors.length > 0 ? selectedActors : undefined,
            search: searchQuery || undefined,
          }),
          auditService.getAuditStats({ dateFrom, dateTo }),
        ])
        console.log('[AuditTrail] Entries received:', entriesData.length)
        console.log('[AuditTrail] Stats received:', statsData)
        setEntries(entriesData)
        setStats({
          total: statsData.totalEntries,
          byCategory: statsData.entriesByCategory,
          uniqueActors: statsData.uniqueActors,
        })
      } catch (error) {
        console.error('[AuditTrail] Failed to fetch audit data:', error)
      } finally {
        setLoading(false)
        console.log('[AuditTrail] Loading complete')
      }
    }

    fetchData()
  }, [dateRange, selectedCategories, selectedActors, searchQuery])

  // Toggle expansion
  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Handle export
  const handleExport = async () => {
    try {
      const { dateFrom, dateTo } = getDateFilters()
      const csv = await auditService.exportAuditEntries({
        dateFrom,
        dateTo,
        categories: selectedCategories.length > 0 ? selectedCategories : undefined,
        actors: selectedActors.length > 0 ? selectedActors : undefined,
        search: searchQuery || undefined,
      })

      // Download file
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-trail-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Export failed:', error)
    }
  }

  // Fetch tickets
  useEffect(() => {
    const fetchTickets = async () => {
      setTicketsLoading(true)
      try {
        const [ticketsData, statsData] = await Promise.all([
          ticketsService.getOpenTickets(),
          ticketsService.getTicketStats(),
        ])
        setTickets(ticketsData)
        setTicketStats(statsData)
      } catch (error) {
        console.error('[AuditTrail] Failed to fetch tickets:', error)
      } finally {
        setTicketsLoading(false)
      }
    }

    if (activeTab === 'tickets') {
      fetchTickets()
    }
  }, [activeTab])

  // Handle URL param to auto-expand specific ticket
  useEffect(() => {
    const autoExpandTicket = async () => {
      if (!initialUrlProcessed) return

      const params = new URLSearchParams(window.location.search)
      const ticketId = params.get('ticketId')

      if (ticketId && activeTab === 'tickets' && !ticketsLoading && tickets.length > 0) {
        // Check if ticket exists in the list
        const ticketExists = tickets.some(t => t.id === ticketId)
        if (ticketExists && !expandedTicketIds.has(ticketId)) {
          // Expand the ticket and fetch comments
          const newExpanded = new Set(expandedTicketIds)
          newExpanded.add(ticketId)
          setExpandedTicketIds(newExpanded)

          // Fetch comments if not already loaded
          if (!ticketComments[ticketId]) {
            const comments = await ticketsService.getTicketComments(ticketId)
            setTicketComments(prev => ({ ...prev, [ticketId]: comments }))
          }

          // Scroll to the ticket after a short delay
          setTimeout(() => {
            const ticketElement = document.querySelector(`[data-ticket-id="${ticketId}"]`)
            if (ticketElement) {
              ticketElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }
          }, 100)
        }
      }
    }

    autoExpandTicket()
  }, [activeTab, ticketsLoading, tickets, initialUrlProcessed])

  // Toggle ticket expansion and fetch comments
  const toggleTicketExpanded = async (ticketId: string) => {
    const newExpanded = new Set(expandedTicketIds)
    if (newExpanded.has(ticketId)) {
      newExpanded.delete(ticketId)
    } else {
      newExpanded.add(ticketId)
      // Fetch comments if not already loaded
      if (!ticketComments[ticketId]) {
        const comments = await ticketsService.getTicketComments(ticketId)
        setTicketComments(prev => ({ ...prev, [ticketId]: comments }))
      }
    }
    setExpandedTicketIds(newExpanded)
  }

  // Category toggle
  const toggleCategory = (category: string) => {
    setSelectedCategories(prev =>
      prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]
    )
  }

  // Displayed entries
  const displayedEntries = entries.slice(0, displayCount)

  return (
    <div style={{ marginTop: -20 }}>
      {/* Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 12, borderBottom: '2px solid #e2e8f0' }}>
        <button
          onClick={() => setActiveTab('activity')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 20px',
            fontSize: 12,
            fontWeight: 600,
            border: 'none',
            backgroundColor: 'transparent',
            color: activeTab === 'activity' ? '#0369a1' : '#64748b',
            borderBottom: activeTab === 'activity' ? '2px solid #0369a1' : '2px solid transparent',
            marginBottom: -2,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          <Activity size={16} />
          Activity Log
        </button>
        <button
          onClick={() => setActiveTab('tickets')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 20px',
            fontSize: 12,
            fontWeight: 600,
            border: 'none',
            backgroundColor: 'transparent',
            color: activeTab === 'tickets' ? '#0369a1' : '#64748b',
            borderBottom: activeTab === 'tickets' ? '2px solid #0369a1' : '2px solid transparent',
            marginBottom: -2,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          <Ticket size={16} />
          Open Tickets
          {ticketStats && ticketStats.slaBreach > 0 && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: 10,
                backgroundColor: '#fee2e2',
                color: '#dc2626',
              }}
            >
              {ticketStats.slaBreach} SLA
            </span>
          )}
        </button>
      </div>

      {/* ========== ACTIVITY TAB ========== */}
      {activeTab === 'activity' && (
        <>
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5" style={{ gap: 10, marginBottom: 16 }}>
          {[1, 2, 3, 4, 5].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5" style={{ gap: 10, marginBottom: 16 }}>
          <KPICard
            title="Total Events"
            value={stats.total.toLocaleString()}
            subtitle={`Last ${dateRange === 'today' ? '24 hours' : dateRange}`}
            icon={<Activity size={18} />}
            colorClass="#0369a1"
          />
          <KPICard
            title="System Events"
            value={stats.byCategory['system'] || 0}
            subtitle="Automated processes"
            icon={<RefreshCw size={18} />}
            colorClass="#8b5cf6"
          />
          <KPICard
            title="Reconciliation"
            value={stats.byCategory['reconciliation'] || 0}
            subtitle="Matching & variance"
            icon={<Scale size={18} />}
            colorClass="#0ea5e9"
          />
          <KPICard
            title="Exceptions"
            value={stats.byCategory['exception'] || 0}
            subtitle="Created & resolved"
            icon={<AlertCircle size={18} />}
            colorClass="#f59e0b"
          />
          <KPICard
            title="Journal Entries"
            value={stats.byCategory['journal'] || 0}
            subtitle="Created & posted"
            icon={<FileText size={18} />}
            colorClass="#6366f1"
          />
        </div>
      )}

      {/* Filters */}
      <div
        style={{
          backgroundColor: 'white',
          border: '1px solid #e2e8f0',
          borderRadius: 6,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          {/* Date Range */}
          <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 6, padding: 3 }}>
            {(['today', '7d', '30d', '90d', 'all'] as const).map((period) => (
              <button
                key={period}
                onClick={() => setDateRange(period)}
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  padding: '5px 10px',
                  borderRadius: 4,
                  border: 'none',
                  backgroundColor: dateRange === period ? '#0369a1' : 'transparent',
                  color: dateRange === period ? '#fff' : '#64748b',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                className={dateRange !== period ? 'hover:bg-slate-200' : ''}
              >
                {period === 'today' ? 'Today' : period === 'all' ? 'All Time' : period.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Separator */}
          <div style={{ width: 1, height: 24, backgroundColor: '#e2e8f0' }} />

          {/* Category Chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 500, color: '#64748b' }}>Category:</span>
            {['system', 'reconciliation', 'exception', 'journal', 'config'].map(cat => (
              <button
                key={cat}
                onClick={() => toggleCategory(cat)}
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  padding: '4px 8px',
                  borderRadius: 4,
                  border: selectedCategories.includes(cat) ? `1px solid ${CATEGORY_COLORS[cat].border}` : '1px solid #e2e8f0',
                  backgroundColor: selectedCategories.includes(cat) ? CATEGORY_COLORS[cat].bg : '#fff',
                  color: selectedCategories.includes(cat) ? CATEGORY_COLORS[cat].text : '#64748b',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Search */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Search events, actors, record IDs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 10px 7px 32px',
                  fontSize: 11,
                  border: '1px solid #e2e8f0',
                  borderRadius: 4,
                  outline: 'none',
                }}
                className="focus:border-sky-400"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Activity Feed */}
      <div
        style={{
          backgroundColor: 'white',
          border: '1px solid #e2e8f0',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            borderBottom: '1px solid #e2e8f0',
            backgroundColor: '#f8fafc',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield size={14} style={{ color: '#64748b' }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>Activity Timeline</span>
            <span style={{ fontSize: 10, color: '#64748b' }}>
              {entries.length.toLocaleString()} events
            </span>
          </div>
          {selectedCategories.length > 0 || searchQuery ? (
            <button
              onClick={() => {
                setSelectedCategories([])
                setSearchQuery('')
              }}
              style={{
                fontSize: 10,
                color: '#0369a1',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Clear filters
            </button>
          ) : null}
        </div>

        {/* Entries */}
        {loading ? (
          <div style={{ padding: 16 }}>
            <SkeletonTable rows={8} />
          </div>
        ) : entries.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <Activity size={40} style={{ color: '#cbd5e1', marginBottom: 12 }} />
            <p style={{ fontSize: 12, color: '#64748b' }}>No audit events found</p>
            <p style={{ fontSize: 10, color: '#94a3b8' }}>Try adjusting your filters</p>
          </div>
        ) : (
          <>
            {displayedEntries.map(entry => (
              <AuditEntryRow
                key={entry.id}
                entry={entry}
                isExpanded={expandedIds.has(entry.id)}
                onToggle={() => toggleExpanded(entry.id)}
              />
            ))}

            {/* Load More */}
            {displayCount < entries.length && (
              <div style={{ padding: 16, textAlign: 'center', borderTop: '1px solid #f1f5f9' }}>
                <button
                  onClick={() => setDisplayCount(prev => prev + 50)}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '8px 20px',
                    backgroundColor: '#f1f5f9',
                    color: '#374151',
                    border: '1px solid #e2e8f0',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                  className="hover:bg-slate-200"
                >
                  Load More ({entries.length - displayCount} remaining)
                </button>
              </div>
            )}
          </>
        )}
      </div>
        </>
      )}

      {/* ========== TICKETS TAB ========== */}
      {activeTab === 'tickets' && (
        <>
          {/* Ticket KPIs */}
          {ticketsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5" style={{ gap: 10, marginBottom: 16 }}>
              {[1, 2, 3, 4, 5].map(i => <SkeletonCard key={i} />)}
            </div>
          ) : ticketStats && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5" style={{ gap: 10, marginBottom: 16 }}>
              <KPICard
                title="Open Tickets"
                value={ticketStats.open + ticketStats.inProgress}
                subtitle="Requiring action"
                icon={<Ticket size={18} />}
                colorClass="#0369a1"
              />
              <KPICard
                title="Pending PSP"
                value={ticketStats.pendingPsp}
                subtitle="Awaiting response"
                icon={<Clock size={18} />}
                colorClass="#f59e0b"
              />
              <KPICard
                title="Escalated"
                value={ticketStats.escalated}
                subtitle="Requires attention"
                icon={<AlertTriangle size={18} />}
                colorClass="#dc2626"
              />
              <KPICard
                title="SLA Breached"
                value={ticketStats.slaBreach}
                subtitle="Past due date"
                icon={<AlertOctagon size={18} />}
                colorClass="#991b1b"
              />
              <KPICard
                title="Avg Resolution"
                value={ticketStats.avgResolutionTime}
                subtitle="Last 30 days"
                icon={<CheckCircle size={18} />}
                colorClass="#059669"
              />
            </div>
          )}

          {/* Tickets List */}
          <div
            style={{
              backgroundColor: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 16px',
                borderBottom: '1px solid #e2e8f0',
                backgroundColor: '#f8fafc',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <MessageSquare size={14} style={{ color: '#64748b' }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>Open Tickets</span>
                <span style={{ fontSize: 10, color: '#64748b' }}>
                  {tickets.length} tickets
                </span>
              </div>
            </div>

            {/* Ticket Rows */}
            {ticketsLoading ? (
              <div style={{ padding: 16 }}>
                <SkeletonTable rows={5} />
              </div>
            ) : tickets.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <Ticket size={40} style={{ color: '#cbd5e1', marginBottom: 12 }} />
                <p style={{ fontSize: 12, color: '#64748b' }}>No open tickets</p>
                <p style={{ fontSize: 10, color: '#94a3b8' }}>All caught up!</p>
              </div>
            ) : (
              tickets.map(ticket => (
                <TicketRow
                  key={ticket.id}
                  ticket={ticket}
                  isExpanded={expandedTicketIds.has(ticket.id)}
                  onToggle={() => toggleTicketExpanded(ticket.id)}
                  comments={ticketComments[ticket.id] || []}
                  onReply={(ticketId, message, isInternal) => {
                    // Create new comment
                    const newComment: TicketComment = {
                      id: `CMT-${Date.now()}`,
                      ticketId,
                      author: 'USR-001',
                      authorName: 'Sarah Chen (You)',
                      authorType: 'internal',
                      content: message,
                      timestamp: new Date().toISOString(),
                      isInternal,
                    }
                    // Append to existing comments
                    setTicketComments(prev => ({
                      ...prev,
                      [ticketId]: [...(prev[ticketId] || []), newComment]
                    }))
                    // Update ticket response count
                    setTickets(prev => prev.map(t =>
                      t.id === ticketId
                        ? { ...t, responseCount: t.responseCount + 1, lastUpdated: new Date().toISOString() }
                        : t
                    ))
                  }}
                  onEscalate={(ticketId) => {
                    // Update ticket priority to critical
                    setTickets(prev => prev.map(t =>
                      t.id === ticketId
                        ? { ...t, priority: 'critical' as const, lastUpdated: new Date().toISOString() }
                        : t
                    ))
                    // Add escalation comment
                    const escalationComment: TicketComment = {
                      id: `CMT-${Date.now()}`,
                      ticketId,
                      author: 'USR-001',
                      authorName: 'Sarah Chen (You)',
                      authorType: 'internal',
                      content: 'This ticket has been escalated to CRITICAL priority due to urgency.',
                      timestamp: new Date().toISOString(),
                      isInternal: false,
                    }
                    setTicketComments(prev => ({
                      ...prev,
                      [ticketId]: [...(prev[ticketId] || []), escalationComment]
                    }))
                  }}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
