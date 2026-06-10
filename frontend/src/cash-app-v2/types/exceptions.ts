/**
 * Extended Exception Types for NBA and Diagnostics
 */

import type { Exception } from './domain'

// Diagnostic result from system analysis
export interface DiagnosticResult {
  outcome: string // e.g., "fuzzy_match_found", "psp_file_pending"
  confidence: number // 0-100
  findings: DiagnosticFinding[]
  systemRecommendation: string
  autoAction?: string
  completedAt: string // ISO timestamp
}

export interface DiagnosticFinding {
  category: string // "window_search", "fuzzy_match", "duplicate_check", etc.
  result: 'pass' | 'fail' | 'partial'
  detail: string
  evidence?: any
}

// Next Best Action recommendation
export interface NextBestAction {
  action: string // "hold_and_retry", "propose_match", "escalate", etc.
  priority: 'auto' | 'human_confirm' | 'human_investigate'
  description: string
  actionButtons: ActionButton[]
  estimatedTime?: string
  dueDate?: string
}

export interface ActionButton {
  id: string
  label: string
  action: string
  variant: 'primary' | 'secondary' | 'danger'
  requiresInput?: boolean
  inputType?: 'text' | 'dropdown' | 'date' | 'amount'
  inputOptions?: string[]
  requiresApproval?: boolean // NEW: Requires manager approval
  showJournalPreview?: boolean // NEW: Show journal entries before execution
  showTicketModal?: boolean // Show ticket creation modal with context
  showReconciliationModal?: boolean // Show reconciliation set-off modal
}

// Financial breakdown (for amount mismatches)
export interface FinancialBreakdown {
  gross: number
  components: FinancialComponent[]
  expectedNet: number
  actualNet: number
  variance: number
  varianceExplained: number
  varianceUnexplained: number
  currency: string
}

export interface FinancialComponent {
  name: string
  type: 'deduction' | 'addition'
  amount: number
  percentage?: number
  description: string
}

// Related records (linked transactions)
export interface RelatedRecord {
  type: 'bank_credit' | 'settlement_line' | 'order' | 'refund' | 'chargeback' | 'psp_file'
  id: string
  amount: number
  currency: string
  date: string
  status: string
  reference?: string
  description?: string
}

// Resolution details
export interface Resolution {
  code: 'matched' | 'written_off' | 'psp_recovered' | 'auto_cleared' | 'duplicate' | 'reclassified' | 'escalated'
  timestamp: string
  resolvedBy: string
  resolvedByName: string
  systemRecommendation: string
  humanAction: string
  overrideReason?: string
  financialImpact?: {
    amount: number
    glEntries: GLEntry[]
  }
}

export interface GLEntry {
  account: string
  accountName: string
  debit: number
  credit: number
  description: string
}

// Extended exception with all diagnostic and NBA data
export interface ExceptionDetail extends Exception {
  // Diagnostic results
  diagnostic?: DiagnosticResult

  // NBA recommendation (can use enhanced version with approval/journal entries)
  nba?: NextBestAction | NextBestActionEnhanced

  // Financial breakdown (for amount mismatches)
  financialBreakdown?: FinancialBreakdown

  // Related records
  relatedRecords?: RelatedRecord[]

  // Resolution (if closed)
  resolution?: Resolution

  // Additional metadata
  materiality?: 'critical' | 'high' | 'medium' | 'low'
  escalationLevel?: 0 | 1 | 2 | 3 // 0=none, 1=analyst, 2=team lead, 3=controller
  escalationHistory?: EscalationEvent[]

  // Settlement Explorer Linkages (for bidirectional navigation)
  linkedBankCreditId?: string // Links to BankCreditRecordDetail.id
  linkedSettlementRefs?: string[] // Links to SettlementPayoutDetail.payoutRef[]
  linkedBankCreditAmount?: number // Quick reference for display
  linkedSettlementCount?: number // Quick reference for display
}

export interface EscalationEvent {
  timestamp: string
  from: number
  to: number
  reason: string
  triggeredBy: 'sla_breach' | 'manual' | 'materiality'
}

// Subset-sum matching result
export interface SubsetSumMatch {
  deposit: {
    id: string
    amount: number
    currency: string
    date: string
  }
  matchedLines: {
    id: string
    amount: number
    date: string
  }[]
  totalMatched: number
  variance: number
  confidence: number
}

// Chargeback lifecycle data
export interface ChargebackData {
  stage: 'first_chargeback' | 'representment' | 'second_chargeback' | 'arbitration'
  originalTransactionId: string
  chargebackAmount: number
  chargebackDate: string
  deadline?: string
  evidenceRequired?: string[]
  disputeFee: number
  currentProvision: number
  expectedOutcome: 'win' | 'lose' | 'uncertain'
  winProbability: number
}

// ============================================================================
// APPROVAL WORKFLOW & JOURNAL ENTRIES
// ============================================================================

// Journal Entry (collection of GL lines)
export interface JournalEntry {
  entryNumber: number
  description: string
  postingDate: string // ISO date (YYYY-MM-DD)
  documentType: 'customer_refund' | 'bank_matching' | 'variance_adjustment' | 'write_off' | 'correction'
  lines: JournalEntryLine[]
  totalDebit?: number // Auto-calculated
  totalCredit?: number // Auto-calculated
}

export interface JournalEntryLine {
  lineNumber: number
  account: string // GL account code (e.g., "4100")
  accountName: string // GL account name (e.g., "Sales Revenue")
  debitCredit: 'debit' | 'credit'
  amount: number
  currency: string
  costCenter?: string
  department?: string
  reference?: string
}

// Financial Impact Summary (for approval preview)
export interface FinancialImpact {
  revenueImpact: number // Positive = revenue increase, Negative = revenue decrease
  cashImpact: number // Positive = cash in, Negative = cash out
  plImpact: number // Net P&L impact
  balanceSheetImpact: number // Net balance sheet impact
  affectedAccounts: string[] // List of GL account codes
  affectedSubledgers: string[] // e.g., ['AR', 'Bank', 'Revenue']
  taxImpact?: number // GST/VAT implications
}

// Approval Metadata
export interface ApprovalMetadata {
  approvalRequired: boolean
  approvalReason: string // Why approval is needed
  approvalThreshold: ApprovalThreshold
  approver?: string // User ID of approver
  approverName?: string // Display name
  submittedBy?: string // User ID who submitted
  submittedByName?: string
  submittedAt?: string // ISO timestamp
  approvedAt?: string // ISO timestamp
  rejectedAt?: string
  rejectionReason?: string
  approvalComments?: string
  approvalLevel: 'analyst' | 'manager' | 'controller' | 'cfo' // Escalation level
}

export interface ApprovalThreshold {
  amount?: number // Threshold amount (e.g., 10000)
  percentage?: number // Threshold percentage (e.g., 0.5%)
  currency?: string
  rule: 'revenue_reversal' | 'write_off' | 'variance_acceptance' | 'manual_gl_posting' | 'refund' | 'always'
  description: string
}

// PSP Ticket Information (for exceptions with existing PSP inquiries)
export interface PSPTicket {
  ticketId: string
  ticketStatus: 'pending' | 'in_progress' | 'resolved' | 'escalated' | 'closed'
  raisedDate: string // ISO timestamp
  daysPending: number
  lastFollowUp?: string // ISO timestamp
  pspContact?: string
  inquiryType: string
  description: string
  resolution?: string
  resolvedDate?: string
}

// Original Exception Reference (for linked exceptions)
export interface OriginalExceptionReference {
  exceptionId: string
  exceptionType: string
  exceptionDate: string
  amount: number
  status: string
  description: string
}

// Reconciliation Line Item (for set-off scenarios)
export interface ReconciliationLineItem {
  id: string
  type: string
  date: string
  amount: number
  description: string
  glAccount: string
  glAccountName: string
  orderId?: string
  status?: string
}

// Reconciliation Details (for chargeback reversals, etc.)
export interface ReconciliationDetails {
  // Current exception item (credit to be matched)
  currentItem?: ReconciliationLineItem
  // Selectable past exceptions to match against
  selectableExceptions?: ReconciliationLineItem[]
  // Legacy fields for backward compatibility
  lineItem1: ReconciliationLineItem
  lineItem2: ReconciliationLineItem
  netEffect: number
  glImpact: string
}

// NBA Enhancement with Approval & Journal Entries
export interface NextBestActionEnhanced extends NextBestAction {
  // Approval workflow
  approval?: ApprovalMetadata

  // Journal entries to be posted
  journalEntries?: JournalEntry[]

  // Financial impact summary
  financialImpact?: FinancialImpact

  // PSP ticket information (for existing inquiries)
  pspTicket?: PSPTicket

  // Original exception reference (for linked/reversal scenarios)
  originalException?: OriginalExceptionReference

  // Reconciliation details (for set-off scenarios)
  reconciliation?: ReconciliationDetails

  // Audit trail
  auditLog?: AuditLogEntry[]
}

export interface AuditLogEntry {
  timestamp: string
  action: string
  performedBy: string
  performedByName: string
  details: string
  ipAddress?: string
}
