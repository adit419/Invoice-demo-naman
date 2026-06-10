/**
 * Neoflo Cash Application - Domain Types
 * These interfaces are the API contract. Backend must match these shapes.
 */

// ============================================================================
// ENTITIES & CONFIGURATION
// ============================================================================

export interface Entity {
  id: string
  name: string
  country: 'SG' | 'ID' | 'MY'
  currency: 'SGD' | 'IDR' | 'MYR'
  erp: string
}

export interface PSP {
  id: string
  name: string
  currency: string // comma-separated: "SGD,IDR,MYR"
  status: 'live' | 'partial' | 'inactive'
  settlementLag: number // T+n days
  fileFormat: 'CSV' | 'XLSX' | 'JSON' | 'XML'
  lastFileDate?: string
}

export interface User {
  id: string
  name: string
  role: string
  avatar: string
}

// ============================================================================
// DASHBOARD
// ============================================================================

export interface DashboardKPIs {
  coveragePct: number
  touchlessRate: number
  openExceptions: number
  pastSLAExceptions: number
  exceptionAmountSGD: number
  exceptionAmountIDR: number
  inTransitSGD: number
  inTransitIDR: number
  inTransitMYR?: number
  feeRecoveredMTD: number
  feeRecoveryTarget: number
  pendingJEs: number
  totalBankCreditSGD: number // Total bank credits received yesterday
  // Trend data (comparison to previous period)
  coveragePctTrend?: number // e.g., +2.1 means +2.1% improvement
  touchlessRateTrend?: number
  openExceptionsTrend?: number
  pendingJEsTrend?: number
  totalBankCreditTrend?: number
  // Touchless Rate - Quarter on Quarter (L1/L2 auto-reconciliation without human involvement)
  touchlessRateCurrentQtr: number // Current quarter touchless rate %
  touchlessRatePrevQtr: number // Previous quarter touchless rate %
  touchlessRateQoQChange: number // QoQ change (positive = improvement)
  touchlessRateCurrentQtrLabel: string // e.g., "Q2 2026"
  touchlessRatePrevQtrLabel: string // e.g., "Q1 2026"
  // Sparkline data (last 7 days)
  coverageSparkline?: number[]
  touchlessSparkline?: number[]
  exceptionsSparkline?: number[]
  // Last updated timestamp
  lastUpdated?: string
}

export interface ExceptionSummary {
  type: ExceptionType
  count: number
  color: string
}

export interface PSPReconciliationStatus {
  pspId: string
  pspName: string
  currency: string
  todayCredits: number
  matched: number
  exceptions: number
  coveragePct: number
  status: 'healthy' | 'attention' | 'warning'
}

export interface TransactionStatusDistribution {
  matchedPosted: number
  inTransit: number
  exceptions: number
  pendingReview: number
}

export interface ExceptionAgingData {
  pspId: string
  pspName: string
  age0to7Days: number
  age8to30Days: number
  age1to3Months: number
  ageOver3Months: number
}

export interface UnsettledAgingBucket {
  pspId: string
  pspName: string
  currency: string
  bucket0to1: number
  bucket2to3: number
  bucket4to7: number
  bucket8plus: number
  total: number
}

export interface OpenARAgeBucket {
  age0to7Days: { count: number; amount: number }
  age8to30Days: { count: number; amount: number }
  age31PlusDays: { count: number; amount: number }
}

export interface OpenARCategoryBreakdown extends OpenARAgeBucket {
  category: 'no_psp_file' | 'amount_mismatch' | 'not_in_oms'
  categoryLabel: string
  totalCount: number
  totalAmount: number
}

export interface OpenARSummary {
  totalCount: number
  totalAmount: number
  currency: string
  breakdown: OpenARCategoryBreakdown[]
}

// ============================================================================
// EXCEPTIONS
// ============================================================================

export type ExceptionType =
  | 'unmatched_credit'
  | 'unmatched_order'
  | 'amount_mismatch'
  | 'orphan_adjustment'
  | 'aging_breach'

export type ExceptionPriority = 'high' | 'medium' | 'low'

export type ExceptionStatus = 'open' | 'resolved' | 'escalated' | 'carried_forward'

// Transaction type for exception context - helps accountants understand the nature of each exception
export type TransactionType = 'payment' | 'refund' | 'settlement' | 'chargeback' | 'reversal' | 'adjustment' | 'fee_adjustment'

export interface Exception {
  id: string
  type: ExceptionType
  priority: ExceptionPriority
  referenceId: string
  amount: number
  currency: 'SGD' | 'IDR' | 'MYR'
  psp: string
  pspName: string
  createdAt: string // ISO 8601
  slaDue: string // ISO 8601
  owner: string | null
  ownerName?: string
  aiConfidence: number | null // 0-100
  aiSuggestion: string | null
  status: ExceptionStatus
  age: string // e.g., "2d 4h"
  pastSLA: boolean
  transactionType?: TransactionType // payment, refund, settlement, chargeback, reversal, adjustment, fee_adjustment
  amountLabel?: string // Describes what the amount represents (e.g., "Bank Credit", "Variance", "PSP Refund")
}

export interface ExceptionDetail extends Exception {
  bankCreditDetails?: BankCreditRecord
  aiMatchSuggestions?: AIMatchSuggestion[]
  auditThread?: AuditEntry[]
}

export interface BankCreditRecord {
  bankAccount: string
  valueDate: string
  amount: number
  currency: string
  narration: string
  payoutRef: string | null
  mappedPSP: string
}

export interface AIMatchSuggestion {
  rank: number
  confidence: number
  settlementRef: string
  psp: string
  amount: number
  variance: number
  date: string
  description: string
}

// ============================================================================
// SETTLEMENTS
// ============================================================================

/**
 * L1 Status: Bank Credit to PSP Net matching
 * - l1_matched: Bank credit amount exactly matches PSP Net amount
 * - l1_unmatched_no_file: No PSP settlement file found for this bank credit
 * - l1_unmatched_variance: PSP file exists but Bank Net ≠ PSP Net (variance)
 */
export type L1Status = 'l1_matched' | 'l1_unmatched_no_file' | 'l1_unmatched_variance'

/**
 * L2 Status: PSP items to Order level matching
 * - l2_matched: All PSP line items match with orders without variance
 * - l2_exception: Has L2 exceptions (unmatched order, orphaned order, amount mismatch)
 * - l2_pending: L2 matching not yet performed (waiting for L1)
 */
export type L2Status = 'l2_matched' | 'l2_exception' | 'l2_pending'

/**
 * Overall Reconciliation Status (derived from L1 + L2)
 * - reconciled: L1 matched AND L2 matched (fully reconciled)
 * - matched_l1: L1 matched but L2 has exceptions
 * - unmatched_no_psp_file: L1 unmatched - no PSP file found (Unmatched Credit - No PSP File)
 * - unmatched_variance: L1 unmatched - variance between bank and PSP net (Unmatched Credit with Variance)
 * - partial: Partial match (some settlements matched, some not)
 */
export type ReconciliationStatus =
  | 'reconciled'
  | 'matched_l1'
  | 'unmatched_no_psp_file'
  | 'unmatched_variance'
  | 'partial'

// Legacy type for backward compatibility
export type SettlementStatus =
  | 'reconciled'
  | 'matched_l1'
  | 'awaiting_file'
  | 'exception'
  | 'partial'

export interface SettlementPayout {
  payoutRef: string
  pspId: string
  pspName: string
  currency: string
  bankCredit: number | null
  settlementTotal: number | null
  variance: number | null
  orderCount: number
  status: SettlementStatus
  date: string // ISO 8601
  exceptionCount?: number
}

export interface SettlementPayoutDetail extends SettlementPayout {
  grossToNet: GrossToNetWaterfall
  orderLines: SettlementOrderLine[]
  feeBreakdown: FeeBreakdown
  exceptions: Exception[]
}

export interface GrossToNetWaterfall {
  grossTransactionValue: number
  mdrFee: number
  mdrFeePercent: number
  taxOnMDR: number
  taxOnMDRPercent: number
  fxMargin: number
  fxMarginPercent: number
  rollingReserve: number
  rollingReservePercent: number
  reserveRelease: number
  reserveReleasePercent: number
  expectedNet: number
  actualNet: number
  bankCredit: number
  l1Variance: number
  notes?: string
}

export interface SettlementOrderLine {
  pspTxnId: string
  orderId: string | null
  gross: number
  mdr: number
  net: number
  matchStatus: 'matched' | 'mismatch' | 'no_order'
  varianceDetail?: OrderLineVarianceDetail
  // L2 Comparison: OMS gross amount for comparison
  omsGross?: number | null // OMS gross amount (null if no OMS record found)
}

/**
 * L2 Comparison Line for Transaction Lines Comparison Modal
 * Shows PSP gross vs OMS gross comparison for order-level reconciliation
 */
export interface L2ComparisonLine {
  // PSP File data
  pspTxnId: string
  pspOrderId: string | null
  pspGross: number
  txnDate: string // Transaction date (e.g., "2026-06-09")

  // OMS data
  omsOrderId: string | null
  omsGross: number | null // null if no OMS record found

  // Comparison
  grossDelta: number | null // PSP Gross - OMS Gross (null if no OMS record)
  matchStatus: 'matched' | 'mismatch' | 'no_oms_record'
}

export interface OrderLineVarianceDetail {
  grossAmount: number
  mdrChargedInFile: number
  mdrChargedPercent: number
  mdrPerContract: number
  mdrPerContractPercent: number
  actualNet: number
  expectedNet: number
  variance: number
  variancePercent: number
  tolerancePercent: number
  breached: boolean
  aiSuggestion: string
}

export interface FeeBreakdown {
  components: FeeComponent[]
  notes?: string
}

export interface FeeComponent {
  name: string
  contractRate: string
  actualRate: string
  variance: string
  status: 'match' | 'within_tolerance' | 'mismatch'
}

// Settlement Explorer - Extended bank credit with matched settlements
export interface BankCreditRecordDetail extends BankCreditRecord {
  id: string
  matchedSettlements: SettlementPayoutDetail[]

  // L1 Status: Bank Credit to PSP Net matching
  l1Status: L1Status
  l1Variance: number // Bank Credit - PSP Net (0 if matched, >0 or <0 if variance)

  // L2 Status: PSP items to Order level matching
  l2Status: L2Status
  l2ExceptionCount: number // Count of L2 exceptions (unmatched order, orphaned, amount mismatch)
  l2ExceptionTypes: string[] // Types of L2 exceptions present

  // Overall reconciliation status (derived from L1 + L2)
  reconciliationStatus: ReconciliationStatus

  // Additional fields
  variance: number // Same as l1Variance for backward compatibility
  variancePercent: number
  mappingConfidence: number // 0-100
  age: string // e.g., "2d"
  exceptions: Exception[]

  // PSP details
  pspNetAmount: number | null // Total PSP net amount (null if no PSP file)
  pspFileReceived: boolean // Whether PSP file was received

  // Accounting entries (for reconciled credits with cash applied)
  accountingEntries?: {
    journalEntries: Array<{
      entryNumber: number
      description: string
      postingDate: string
      documentType: 'customer_refund' | 'bank_matching' | 'variance_adjustment' | 'write_off' | 'correction'
      lines: Array<{
        lineNumber: number
        account: string
        accountName: string
        debitCredit: 'debit' | 'credit'
        amount: number
        currency: string
        reference?: string
      }>
    }>
    postedDate: string
    postedBy: string
  }
}

// Settlement Explorer - KPI metrics
export interface SettlementExplorerKPIs {
  totalBankCredits: number
  totalBankCreditAmount: { SGD: number; IDR: number; MYR: number }

  // L1 Matching KPIs (Bank Credit vs PSP Net)
  l1MatchedCount: number // Bank credits where Bank = PSP Net
  l1MatchedPercent: number
  l1UnmatchedNoFileCount: number // No PSP file found
  l1UnmatchedVarianceCount: number // PSP file exists but variance

  // L2 Parent Level KPIs (L1+L2 fully matched = Reconciled)
  l2MatchedCount: number // PSP items fully matched to orders (out of L1 matched)
  l2ExceptionCount: number // Has L2 exceptions
  l2ParentMatchedPercent: number // l2MatchedCount / l1MatchedCount (% of L1 matched that are also L2 matched)

  // L2 Line Item Level KPIs (Individual PSP lines matched with OMS)
  totalLineItems: number // Total PSP order lines across all settlements
  matchedLineItems: number // Lines matched with OMS
  unmatchedLineItems: number // Lines not matched (exceptions)
  lineItemMatchPercent: number // matchedLineItems / totalLineItems

  // Overall reconciliation
  reconciledCount: number // L1 matched AND L2 matched
  reconciledPercent: number

  // Backward compatibility
  creditsWithExceptions: number
  unmatchedCount: number
  unmatchedAmount: { SGD: number; IDR: number; MYR: number }
  totalVariance: { SGD: number; IDR: number; MYR: number }
  avgReconciliationTime: string
}

// ============================================================================
// REVERSALS
// ============================================================================

export type RefundType = 'full' | 'partial'
export type RefundStatus = 'initiated' | 'processing' | 'settled' | 'reversed'

export interface Refund {
  id: string
  originalOrderId: string
  customer: string
  amount: number
  currency: string
  type: RefundType
  initiatedDate: string
  status: RefundStatus
  daysOpen: number
  pspId: string
  pspName: string
}

export type ChargebackStage =
  | 'provisional_debit'
  | 'representment'
  | 'awaiting_outcome'
  | 'resolved'

export type ChargebackOutcome = 'won' | 'lost' | 'pending'

export interface Chargeback {
  id: string
  originalOrderId: string
  amount: number
  currency: string
  pspId: string
  pspName: string
  stage: ChargebackStage
  daysActive: number
  disputeFee: number
  disputeFeeCurrency: string
  outcome: ChargebackOutcome
}

export interface OrphanAdjustment {
  id: string
  amount: number
  currency: string
  pspId: string
  pspName: string
  description: string
  suggestedReason: string
  aiConfidence: number
  status: 'open' | 'classified' | 'resolved'
}

// ============================================================================
// REPORTS & CLOSE
// ============================================================================

export interface SubLedgerTieOut {
  accounts: SubLedgerAccount[]
  totalVariance: number
  totalVarianceCurrency: string
  lastReconciled: string
  nextRun: string
  status: 'zero_variance' | 'variance_found'
}

export interface SubLedgerAccount {
  accountName: string
  subLedgerBalance: number
  glBalance: number
  currency: string
  variance: number
}

export interface FeeRecoveryLog {
  mtdFlagged: number
  confirmedRecovered: number
  pendingDispute: number
  currency: string
  items: FeeRecoveryItem[]
}

export interface FeeRecoveryItem {
  pspId: string
  pspName: string
  amount: number
  currency: string
  transactionCount: number
  status: 'flagged' | 'disputed' | 'recovered'
}

export interface JournalEntryBatch {
  id: string
  proposedBy: string
  proposedByName: string
  entryCount: number
  postingValue: number
  currency: string
  oldestEntry: string // ISO 8601
  status: 'draft' | 'approved' | 'posted' | 'rejected'
  erpDocId: string | null
  createdAt: string
}

export interface JournalEntry {
  id: string
  description: string
  lines: JournalEntryLine[]
}

export interface JournalEntryLine {
  account: string
  debit: number
  credit: number
}

// ============================================================================
// CONNECTOR STUDIO (Legacy - for reference, being replaced by new ConnectorConfig below)
// ============================================================================

export interface LegacyConnectorConfig {
  id: string
  pspId: string
  pspName: string
  status: 'live' | 'partial' | 'inactive'
  currencies: string[]
  fileFormat: string
  channel: 'SFTP' | 'API' | 'Email'
  lastFile: string | null
  fieldMapping: LegacyFieldMapping[]
  settlementWindow: number // T+n
  agingThreshold: number
  bankNarrationPatterns: string[]
}

export interface LegacyFieldMapping {
  sourceColumn: string
  canonicalField: string
  mapped: boolean
}

export interface FeeSchedule {
  pspId: string
  pspName: string
  effectiveDate: string
  version: string
  tiers: FeeScheduleTier[]
  fxMarginMax: number
  reserve: number
  disputeFee: number
  disputeFeeCurrency: string
}

export interface FeeScheduleTier {
  method: string
  bandMin: number | null
  bandMax: number | null
  mdrRate: number
  mdrCap: number | null
  taxRate: number
  taxName: string
}

export interface ToleranceConfig {
  pspId: string | null // null = global default
  absoluteTolerance: number
  percentTolerance: number
  dateWindowDays: number
  fuzzyMatchThreshold: number
  notes?: string
}

export interface SandboxTestResult {
  timestamp: string
  pspId: string
  rowsReceived: number
  rowsParsed: number
  rowsNormalized: number
  rowsMatched: number
  rowsMatchedPercent: number
  exceptions: number
  exceptionsPercent: number
  fieldMappingStatus: 'complete' | 'incomplete'
  feeComputationStatus: string
}

// ============================================================================
// AUDIT TRAIL
// ============================================================================

export type AuditEventType =
  | 'exception_created'
  | 'exception_linked'
  | 'exception_resolved'
  | 'variance_accepted'
  | 'ai_suggestion_generated'
  | 'je_batch_created'
  | 'je_batch_approved'
  | 'je_batch_rejected'
  | 'je_batch_posted'
  | 'fee_schedule_updated'
  | 'connector_created'
  | 'connector_updated'
  | 'matching_run'
  | 'subledger_tieout'

export interface AuditEntry {
  id: string
  timestamp: string // ISO 8601
  actor: string // user ID or 'System'
  actorName: string
  eventType: AuditEventType
  eventDescription: string
  recordId: string | null
  amount: number | null
  currency: string | null
  beforeState: string | null
  afterState: string | null
  metadata?: Record<string, any>
}

// ============================================================================
// SUPPORT TICKETS
// ============================================================================

export type TicketStatus = 'open' | 'in_progress' | 'pending_psp' | 'escalated' | 'resolved' | 'closed'
export type TicketPriority = 'critical' | 'high' | 'medium' | 'low'
export type TicketCategory = 'psp_inquiry' | 'settlement_dispute' | 'fee_dispute' | 'file_missing' | 'technical_issue' | 'escalation' | 'general'

export interface Ticket {
  id: string
  subject: string
  description: string
  category: TicketCategory
  status: TicketStatus
  priority: TicketPriority

  // PSP Details
  pspId: string
  pspName: string

  // Related Records
  relatedRecordId?: string // Exception ID, Settlement ID, etc.
  relatedRecordType?: 'exception' | 'settlement' | 'bank_credit' | 'je_batch'

  // Assignment
  assignee: string
  assigneeName: string
  reporter: string
  reporterName: string

  // SLA Tracking
  createdAt: string
  updatedAt: string
  dueDate: string
  slaBreach: boolean
  slaBreachAt?: string

  // Financials
  amount?: number
  currency?: string

  // Communication
  lastResponseFrom?: 'internal' | 'psp'
  lastResponseAt?: string
  responseCount: number

  // Tags
  tags?: string[]
}

export interface TicketComment {
  id: string
  ticketId: string
  author: string
  authorName: string
  authorType: 'internal' | 'psp' | 'system'
  content: string
  timestamp: string
  attachments?: TicketAttachment[]
  isInternal: boolean // Internal notes not visible to PSP
}

export interface TicketAttachment {
  id: string
  fileName: string
  fileSize: number
  fileType: string
  uploadedAt: string
  uploadedBy: string
}

export interface TicketStats {
  total: number
  open: number
  inProgress: number
  pendingPsp: number
  escalated: number
  slaBreach: number
  avgResolutionTime: string
  byPsp: Record<string, number>
  byCategory: Record<string, number>
}

// ============================================================================
// COMMON/SHARED
// ============================================================================

export interface PaginationInfo {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface ApiResponse<T> {
  data: T
  pagination?: PaginationInfo
  error?: string
}

export type Currency = 'SGD' | 'IDR' | 'MYR'

export interface DateRange {
  from: string
  to: string
}

// ============================================================================
// CONNECTOR STUDIO
// ============================================================================

export type ConnectorType = 'bank' | 'psp' | 'internal' | 'erp'
export type ConnectorProtocol = 'sftp' | 'rest' | 'soap' | 'graphql' | 'email' | 'webhook' | 's3'
export type ConnectorStatus = 'active' | 'inactive' | 'draft' | 'error'
export type ExecutionStatus = 'running' | 'success' | 'partial' | 'failed' | 'cancelled'
export type TriggerType = 'scheduled' | 'manual' | 'webhook' | 'retry'

export interface ConnectorConfig {
  id: string
  name: string
  type: ConnectorType
  subType: string // 'adyen', 'stripe', 'dbs_bank', 'oracle_fusion', 'oms', etc.
  description: string
  status: ConnectorStatus
  protocol: ConnectorProtocol
  legalEntityId: string
  currencies: string[]

  // Connection details
  connection: {
    baseUrl?: string
    authMethod?: 'api_key' | 'bearer_token' | 'oauth2' | 'basic_auth'
    host?: string
    port?: number
    timeout?: number
    rateLimit?: { requests: number; per: string }
  }

  // Schedule
  schedule: {
    mode: 'scheduled' | 'manual' | 'realtime'
    frequency?: 'hourly' | 'daily' | 'weekly' | 'monthly'
    runTimes?: string[]
    timezone?: string
    runOnWeekends?: boolean
  }

  // Metadata
  lastRunAt?: string
  lastRunStatus?: ExecutionStatus
  lastRunDuration?: number
  successRate?: number
  createdAt: string
  updatedAt: string
  createdBy: string
}

export interface ExecutionRun {
  id: string
  connectorId: string
  connectorName: string
  status: ExecutionStatus
  startTime: string
  endTime?: string
  duration?: number // seconds

  trigger: {
    type: TriggerType
    userId?: string
    userName?: string
  }

  stats: {
    totalRecords: number
    successfulRecords: number
    failedRecords: number
    skippedRecords: number
    dataVolumeMB: number
    apiCalls?: number
    avgResponseTime?: number
  }

  errors?: ExecutionError[]
  logs?: LogEntry[]
}

export interface ExecutionError {
  errorType: string
  errorMessage: string
  count: number
  affectedRecords?: string[]
}

export interface LogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
}
