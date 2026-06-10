/**
 * Audit Trail - Mock Data
 *
 * Enterprise-grade audit log with:
 * - System events (automated reconciliation, matching runs)
 * - User actions (approvals, resolutions, assignments)
 * - Configuration changes (connector updates, fee schedules)
 * - Full state change tracking
 * - Compliance-ready timestamps
 */

import type { AuditEntry, AuditEventType } from '../types/domain'

// ============================================================================
// DATE HELPERS
// ============================================================================

const getToday = (): Date => new Date()

const getRelativeDate = (daysAgo: number, hoursAgo: number = 0, minutesAgo: number = 0): Date => {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(d.getHours() - hoursAgo)
  d.setMinutes(d.getMinutes() - minutesAgo)
  return d
}

const formatISO = (date: Date): string => date.toISOString()

// ============================================================================
// USERS
// ============================================================================

const USERS = {
  system: { id: 'SYSTEM', name: 'System' },
  sarah: { id: 'USR-001', name: 'Sarah Chen' },
  james: { id: 'USR-002', name: 'James Tan' },
  priya: { id: 'USR-003', name: 'Priya Sharma' },
  michael: { id: 'USR-004', name: 'Michael Wong' },
  lisa: { id: 'USR-005', name: 'Lisa Park' },
  david: { id: 'USR-006', name: 'David Lee' },
}

// ============================================================================
// EVENT TYPE METADATA
// ============================================================================

export const EVENT_TYPE_META: Record<AuditEventType, {
  label: string
  category: 'reconciliation' | 'exception' | 'journal' | 'config' | 'system'
  color: string
  icon: string
}> = {
  'exception_created': { label: 'Exception Created', category: 'exception', color: '#dc2626', icon: 'AlertCircle' },
  'exception_linked': { label: 'Exception Linked', category: 'exception', color: '#f59e0b', icon: 'Link' },
  'exception_resolved': { label: 'Exception Resolved', category: 'exception', color: '#10b981', icon: 'CheckCircle' },
  'variance_accepted': { label: 'Variance Accepted', category: 'reconciliation', color: '#0ea5e9', icon: 'Check' },
  'ai_suggestion_generated': { label: 'AI Suggestion', category: 'system', color: '#8b5cf6', icon: 'Sparkles' },
  'je_batch_created': { label: 'JE Batch Created', category: 'journal', color: '#6366f1', icon: 'FileText' },
  'je_batch_approved': { label: 'JE Batch Approved', category: 'journal', color: '#10b981', icon: 'CheckSquare' },
  'je_batch_rejected': { label: 'JE Batch Rejected', category: 'journal', color: '#dc2626', icon: 'XSquare' },
  'je_batch_posted': { label: 'JE Posted to ERP', category: 'journal', color: '#059669', icon: 'Upload' },
  'fee_schedule_updated': { label: 'Fee Schedule Updated', category: 'config', color: '#f97316', icon: 'DollarSign' },
  'connector_created': { label: 'Connector Created', category: 'config', color: '#0ea5e9', icon: 'Plug' },
  'connector_updated': { label: 'Connector Updated', category: 'config', color: '#64748b', icon: 'Settings' },
  'matching_run': { label: 'Matching Run', category: 'system', color: '#8b5cf6', icon: 'RefreshCw' },
  'subledger_tieout': { label: 'Subledger Tie-out', category: 'reconciliation', color: '#0ea5e9', icon: 'Scale' },
}

// ============================================================================
// GENERATE AUDIT ENTRIES
// ============================================================================

const generateAuditEntries = (): AuditEntry[] => {
  const entries: AuditEntry[] = []
  let idCounter = 1

  const addEntry = (
    daysAgo: number,
    hoursAgo: number,
    minutesAgo: number,
    eventType: AuditEventType,
    actor: typeof USERS[keyof typeof USERS],
    description: string,
    recordId: string | null = null,
    amount: number | null = null,
    currency: string | null = null,
    beforeState: string | null = null,
    afterState: string | null = null,
    metadata?: Record<string, any>
  ) => {
    entries.push({
      id: `AUD-${String(idCounter++).padStart(6, '0')}`,
      timestamp: formatISO(getRelativeDate(daysAgo, hoursAgo, minutesAgo)),
      actor: actor.id,
      actorName: actor.name,
      eventType,
      eventDescription: description,
      recordId,
      amount,
      currency,
      beforeState,
      afterState,
      metadata,
    })
  }

  // ========== TODAY ==========

  // Morning matching run
  addEntry(0, 2, 15, 'matching_run', USERS.system,
    'Daily reconciliation completed. Processed 12,450 transactions. Match rate: 97.2%',
    'RUN-20260610-001', null, null, null, null,
    { transactionsProcessed: 12450, matchRate: 97.2, duration: '4m 32s', newExceptions: 5 }
  )

  // AI suggestions generated
  addEntry(0, 2, 10, 'ai_suggestion_generated', USERS.system,
    'AI analysis completed for 5 new exceptions. High-confidence matches found for 3 items.',
    null, null, null, null, null,
    { exceptionsAnalyzed: 5, highConfidenceMatches: 3, avgConfidence: 87 }
  )

  // Exception resolved by Sarah
  addEntry(0, 1, 45, 'exception_resolved', USERS.sarah,
    'Resolved amount mismatch exception. Root cause: FX rate timing difference.',
    'EXC-20260609-003', 1250.00, 'SGD',
    'open', 'resolved',
    { resolution: 'fx_timing', linkedSettlement: 'PY-GP-09JUN26-002' }
  )

  // Variance accepted
  addEntry(0, 1, 30, 'variance_accepted', USERS.james,
    'Accepted L1 variance of SGD 45.20 (0.03%) for Stripe settlement. Within tolerance threshold.',
    'BC-STR-09JUN26-002', 45.20, 'SGD',
    'matched_l1', 'reconciled',
    { variancePercent: 0.03, toleranceThreshold: 0.5, autoApprovalEligible: true }
  )

  // JE batch created
  addEntry(0, 1, 15, 'je_batch_created', USERS.system,
    'Auto-generated JE batch for 23 resolved exceptions. Total posting value: SGD 156,780.',
    'JEB-20260610-001', 156780.00, 'SGD',
    null, 'draft',
    { entryCount: 23, accounts: ['1200-AR', '4100-Revenue', '2100-Payables'] }
  )

  // ========== YESTERDAY ==========

  // Morning matching run
  addEntry(1, 8, 0, 'matching_run', USERS.system,
    'Daily reconciliation completed. Processed 11,892 transactions. Match rate: 96.8%',
    'RUN-20260609-001', null, null, null, null,
    { transactionsProcessed: 11892, matchRate: 96.8, duration: '4m 18s', newExceptions: 7 }
  )

  // Exception created
  addEntry(1, 7, 45, 'exception_created', USERS.system,
    'Unmatched bank credit detected. GrabPay settlement file pending.',
    'EXC-20260609-001', 491280.13, 'SGD',
    null, 'open',
    { psp: 'GrabPay', bankAccount: 'DBS-SGD-****4521', expectedFileTime: '18:00 SGT' }
  )

  addEntry(1, 7, 44, 'exception_created', USERS.system,
    'Amount mismatch detected. Bank credit vs PSP settlement variance exceeds threshold.',
    'EXC-20260609-002', 11580.00, 'SGD',
    null, 'open',
    { psp: 'GrabPay', variancePercent: 2.48, threshold: 0.5 }
  )

  // AI suggestion
  addEntry(1, 7, 30, 'ai_suggestion_generated', USERS.system,
    'AI identified potential match for unmatched credit. Confidence: 85%. Suggested: Link to settlement PY-GP-09JUN26-003.',
    'EXC-20260609-002', null, null, null, null,
    { confidence: 85, suggestedMatch: 'PY-GP-09JUN26-003', matchReason: 'Amount proximity + date correlation' }
  )

  // JE batch approved
  addEntry(1, 4, 30, 'je_batch_approved', USERS.priya,
    'Approved JE batch with 18 entries. Verified account mappings and amounts.',
    'JEB-20260609-001', 142350.00, 'SGD',
    'draft', 'approved',
    { approverRole: 'Finance Manager', reviewNotes: 'All entries verified against source documents' }
  )

  // JE posted to ERP
  addEntry(1, 4, 15, 'je_batch_posted', USERS.system,
    'JE batch posted to Oracle Fusion ERP. Document ID: JE-2026-06789.',
    'JEB-20260609-001', 142350.00, 'SGD',
    'approved', 'posted',
    { erpSystem: 'Oracle Fusion', documentId: 'JE-2026-06789', postingPeriod: '2026-06' }
  )

  // Subledger tie-out
  addEntry(1, 3, 0, 'subledger_tieout', USERS.system,
    'Daily subledger tie-out completed. AR subledger balanced with GL. Zero variance.',
    'TIEOUT-20260609', null, null, null, null,
    { subledger: 'Accounts Receivable', glAccount: '1200-AR', variance: 0, status: 'balanced' }
  )

  // Exception resolved
  addEntry(1, 2, 30, 'exception_resolved', USERS.michael,
    'Resolved orphan adjustment. Classified as PSP fee correction.',
    'EXC-20260608-005', 890.00, 'SGD',
    'open', 'resolved',
    { classification: 'fee_correction', linkedPSP: 'Stripe' }
  )

  // ========== 2 DAYS AGO ==========

  addEntry(2, 9, 0, 'matching_run', USERS.system,
    'Daily reconciliation completed. Processed 13,105 transactions. Match rate: 97.5%',
    'RUN-20260608-001', null, null, null, null,
    { transactionsProcessed: 13105, matchRate: 97.5, duration: '4m 45s', newExceptions: 4 }
  )

  addEntry(2, 6, 0, 'connector_updated', USERS.david,
    'Updated GrabPay connector. Added new field mapping for refund_reference column.',
    'CONN-GRABPAY-SG', null, null,
    '{"fieldMappings": 12}', '{"fieldMappings": 13}',
    { fieldsAdded: ['refund_reference'], modifiedBy: 'David Lee' }
  )

  addEntry(2, 5, 30, 'fee_schedule_updated', USERS.lisa,
    'Updated Stripe fee schedule. MDR rate changed from 2.90% to 2.85% effective July 1.',
    'FEE-STRIPE-SG', null, null,
    '{"mdrRate": 2.90}', '{"mdrRate": 2.85}',
    { effectiveDate: '2026-07-01', previousRate: 2.90, newRate: 2.85, approvedBy: 'Finance Director' }
  )

  addEntry(2, 4, 0, 'exception_linked', USERS.sarah,
    'Linked exception to settlement. Bank credit matched to PSP file after manual review.',
    'EXC-20260607-001', 283800.00, 'SGD',
    'open', 'linked',
    { linkedSettlement: 'PY-GP-07JUN26-001', matchMethod: 'manual' }
  )

  addEntry(2, 3, 0, 'je_batch_rejected', USERS.priya,
    'Rejected JE batch. Reason: Incorrect GL account mapping for 3 entries.',
    'JEB-20260608-002', 45670.00, 'SGD',
    'draft', 'rejected',
    { rejectionReason: 'incorrect_gl_mapping', affectedEntries: 3 }
  )

  // ========== 3-7 DAYS AGO ==========

  addEntry(3, 8, 0, 'matching_run', USERS.system,
    'Daily reconciliation completed. Processed 12,780 transactions. Match rate: 96.9%',
    'RUN-20260607-001', null, null, null, null,
    { transactionsProcessed: 12780, matchRate: 96.9, duration: '4m 22s', newExceptions: 6 }
  )

  addEntry(3, 2, 0, 'exception_resolved', USERS.james,
    'Bulk resolved 4 exceptions after PSP file re-upload. All items now matched.',
    null, 125400.00, 'SGD',
    'open', 'resolved',
    { bulkAction: true, exceptionsResolved: 4, resolution: 'file_reupload' }
  )

  addEntry(4, 9, 0, 'matching_run', USERS.system,
    'Daily reconciliation completed. Processed 11,456 transactions. Match rate: 97.1%',
    'RUN-20260606-001', null, null, null, null,
    { transactionsProcessed: 11456, matchRate: 97.1, duration: '4m 05s', newExceptions: 5 }
  )

  addEntry(4, 5, 0, 'connector_created', USERS.david,
    'Created new connector for PayNow (Singapore). SFTP integration configured.',
    'CONN-PAYNOW-SG', null, null,
    null, '{"status": "draft"}',
    { protocol: 'SFTP', fileFormat: 'CSV', settlementLag: 1 }
  )

  addEntry(5, 8, 0, 'matching_run', USERS.system,
    'Daily reconciliation completed. Processed 12,234 transactions. Match rate: 97.3%',
    'RUN-20260605-001', null, null, null, null,
    { transactionsProcessed: 12234, matchRate: 97.3, duration: '4m 15s', newExceptions: 4 }
  )

  addEntry(5, 3, 0, 'subledger_tieout', USERS.system,
    'Weekly subledger tie-out completed. Minor variance of SGD 12.50 identified in suspense account.',
    'TIEOUT-20260605-W', 12.50, 'SGD', null, null,
    { subledger: 'Suspense', glAccount: '1900-SUSPENSE', variance: 12.50, status: 'variance_found' }
  )

  addEntry(6, 9, 0, 'matching_run', USERS.system,
    'Daily reconciliation completed. Processed 10,890 transactions. Match rate: 96.5%',
    'RUN-20260604-001', null, null, null, null,
    { transactionsProcessed: 10890, matchRate: 96.5, duration: '3m 58s', newExceptions: 8 }
  )

  addEntry(6, 4, 0, 'je_batch_posted', USERS.system,
    'Weekly JE batch posted to Oracle Fusion ERP. Document ID: JE-2026-06755.',
    'JEB-20260604-001', 567890.00, 'SGD',
    'approved', 'posted',
    { erpSystem: 'Oracle Fusion', documentId: 'JE-2026-06755', postingPeriod: '2026-06' }
  )

  addEntry(7, 8, 0, 'matching_run', USERS.system,
    'Daily reconciliation completed. Processed 11,567 transactions. Match rate: 97.0%',
    'RUN-20260603-001', null, null, null, null,
    { transactionsProcessed: 11567, matchRate: 97.0, duration: '4m 10s', newExceptions: 5 }
  )

  // ========== OLDER (8-30 DAYS) ==========

  for (let day = 8; day <= 30; day++) {
    // Daily matching run
    const txnCount = 10000 + Math.floor(Math.random() * 4000)
    const matchRate = 95 + Math.random() * 3
    const exceptions = Math.floor(Math.random() * 8) + 2

    addEntry(day, 8, 0, 'matching_run', USERS.system,
      `Daily reconciliation completed. Processed ${txnCount.toLocaleString()} transactions. Match rate: ${matchRate.toFixed(1)}%`,
      `RUN-${formatDateForId(day)}-001`, null, null, null, null,
      { transactionsProcessed: txnCount, matchRate: parseFloat(matchRate.toFixed(1)), newExceptions: exceptions }
    )

    // Random events throughout the day
    if (day % 3 === 0) {
      addEntry(day, 4, 0, 'exception_resolved', USERS.sarah,
        'Resolved aging exception. Manual investigation confirmed duplicate payment.',
        `EXC-${formatDateForId(day)}-001`, Math.floor(Math.random() * 50000) + 1000, 'SGD',
        'open', 'resolved',
        { resolution: 'duplicate_payment' }
      )
    }

    if (day % 5 === 0) {
      const batchAmount = Math.floor(Math.random() * 200000) + 50000
      addEntry(day, 3, 0, 'je_batch_posted', USERS.system,
        `JE batch posted to Oracle Fusion ERP. Document ID: JE-2026-${String(6700 - day).padStart(5, '0')}.`,
        `JEB-${formatDateForId(day)}-001`, batchAmount, 'SGD',
        'approved', 'posted',
        { erpSystem: 'Oracle Fusion' }
      )
    }

    if (day % 7 === 0) {
      addEntry(day, 2, 0, 'subledger_tieout', USERS.system,
        'Weekly subledger tie-out completed. All accounts balanced.',
        `TIEOUT-${formatDateForId(day)}-W`, null, null, null, null,
        { status: 'balanced' }
      )
    }
  }

  // Sort by timestamp descending
  return entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

const formatDateForId = (daysAgo: number): string => {
  const date = getRelativeDate(daysAgo, 0, 0)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

// ============================================================================
// EXPORT
// ============================================================================

/**
 * Get audit entries - generated fresh on each call
 */
export const getMockAuditEntries = (): AuditEntry[] => {
  return generateAuditEntries()
}

// Legacy static export
export const mockAuditEntries: AuditEntry[] = getMockAuditEntries()
