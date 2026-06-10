/**
 * Support Tickets - Mock Data
 *
 * Tracks PSP communications, escalations, disputes, and follow-ups
 * with full SLA tracking and conversation history.
 */

import type { Ticket, TicketComment, TicketCategory, TicketStatus, TicketPriority } from '../types/domain'

// ============================================================================
// DATE HELPERS
// ============================================================================

const getRelativeDate = (daysAgo: number, hoursAgo: number = 0): Date => {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(d.getHours() - hoursAgo)
  return d
}

const formatISO = (date: Date): string => date.toISOString()

const addDays = (date: Date, days: number): Date => {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

const getYesterday = (): Date => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d
}

const formatDateDisplay = (date: Date): string => {
  const day = String(date.getDate()).padStart(2, '0')
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  const month = months[date.getMonth()]
  const year = String(date.getFullYear()).slice(-2)
  return `${day}${month}${year}`
}

// ============================================================================
// USERS
// ============================================================================

// Finance & Ops Team
const USERS = {
  sarah: { id: 'USR-001', name: 'Sarah Chen', role: 'Finance Manager' },
  james: { id: 'USR-002', name: 'James Tan', role: 'Reconciliation Lead' },
  priya: { id: 'USR-003', name: 'Priya Sharma', role: 'Finance Analyst' },
  michael: { id: 'USR-004', name: 'Michael Wong', role: 'Treasury Analyst' },
  lisa: { id: 'USR-005', name: 'Lisa Park', role: 'AR Specialist' },
}

// Internal Tech & Engineering Team
const TECH_TEAM = {
  kevin: { id: 'TECH-001', name: 'Kevin Ng', role: 'Integration Engineer' },
  rachel: { id: 'TECH-002', name: 'Rachel Lim', role: 'DevOps Lead' },
  amit: { id: 'TECH-003', name: 'Amit Patel', role: 'Data Engineer' },
  david: { id: 'TECH-004', name: 'David Ong', role: 'Tech Lead' },
}

// PSP Contacts
const PSP_CONTACTS = {
  grabpay: { id: 'PSP-GP-001', name: 'GrabPay Support' },
  grabpay_am: { id: 'PSP-GP-002', name: 'Marcus Lee (GrabPay AM)' },
  stripe: { id: 'PSP-STR-001', name: 'Stripe Support' },
  stripe_am: { id: 'PSP-STR-002', name: 'Jennifer Wu (Stripe AM)' },
  adyen: { id: 'PSP-ADY-001', name: 'Adyen Support' },
}

// Bank Contacts
const BANK_CONTACTS = {
  dbs: { id: 'BANK-DBS-001', name: 'DBS Corporate Banking' },
  ocbc: { id: 'BANK-OCBC-001', name: 'OCBC Treasury Services' },
}

// ============================================================================
// CATEGORY METADATA
// ============================================================================

export const TICKET_CATEGORY_META: Record<TicketCategory, { label: string; color: string; icon: string }> = {
  'psp_inquiry': { label: 'PSP Inquiry', color: '#0ea5e9', icon: 'HelpCircle' },
  'settlement_dispute': { label: 'Settlement Dispute', color: '#f59e0b', icon: 'Scale' },
  'fee_dispute': { label: 'Fee Dispute', color: '#ef4444', icon: 'DollarSign' },
  'file_missing': { label: 'Missing File', color: '#8b5cf6', icon: 'FileX' },
  'technical_issue': { label: 'Technical Issue', color: '#64748b', icon: 'AlertTriangle' },
  'escalation': { label: 'Escalation', color: '#dc2626', icon: 'AlertOctagon' },
  'general': { label: 'General', color: '#94a3b8', icon: 'MessageSquare' },
}

export const TICKET_STATUS_META: Record<TicketStatus, { label: string; color: string; bgColor: string }> = {
  'open': { label: 'Open', color: '#0369a1', bgColor: '#e0f2fe' },
  'in_progress': { label: 'In Progress', color: '#c2410c', bgColor: '#ffedd5' },
  'pending_psp': { label: 'Pending PSP', color: '#7c3aed', bgColor: '#ede9fe' },
  'escalated': { label: 'Escalated', color: '#dc2626', bgColor: '#fee2e2' },
  'resolved': { label: 'Resolved', color: '#059669', bgColor: '#d1fae5' },
  'closed': { label: 'Closed', color: '#64748b', bgColor: '#f1f5f9' },
}

export const TICKET_PRIORITY_META: Record<TicketPriority, { label: string; color: string; bgColor: string }> = {
  'critical': { label: 'Critical', color: '#dc2626', bgColor: '#fee2e2' },
  'high': { label: 'High', color: '#ea580c', bgColor: '#ffedd5' },
  'medium': { label: 'Medium', color: '#ca8a04', bgColor: '#fef9c3' },
  'low': { label: 'Low', color: '#64748b', bgColor: '#f1f5f9' },
}

// ============================================================================
// GENERATE TICKETS
// ============================================================================

const generateTickets = (): Ticket[] => {
  const tickets: Ticket[] = []

  // ========== CRITICAL: SLA Breach - Missing Settlement File ==========
  const ticket1Created = getRelativeDate(3, 0)
  const ticket1Due = addDays(ticket1Created, 1) // 24hr SLA for critical
  tickets.push({
    id: 'TKT-2026-0001',
    subject: 'Missing GrabPay Settlement File - June 7',
    description: 'Daily settlement file for June 7 not received. Bank credit of SGD 491,280.13 cannot be reconciled. PSP file expected at 18:00 SGT but not delivered.',
    category: 'file_missing',
    status: 'escalated',
    priority: 'critical',
    pspId: 'grabpay',
    pspName: 'GrabPay',
    relatedRecordId: 'BC-GP-07JUN26-006',
    relatedRecordType: 'bank_credit',
    assignee: USERS.sarah.id,
    assigneeName: USERS.sarah.name,
    reporter: 'SYSTEM',
    reporterName: 'System',
    createdAt: formatISO(ticket1Created),
    updatedAt: formatISO(getRelativeDate(0, 4)),
    dueDate: formatISO(ticket1Due),
    slaBreach: true,
    slaBreachAt: formatISO(addDays(ticket1Created, 1)),
    amount: 491280.13,
    currency: 'SGD',
    lastResponseFrom: 'psp',
    lastResponseAt: formatISO(getRelativeDate(1, 2)),
    responseCount: 5,
    tags: ['sla-breach', 'blocking', 'month-end'],
  })

  // ========== HIGH: Fee Dispute with Stripe ==========
  const ticket2Created = getRelativeDate(5, 0)
  const ticket2Due = addDays(ticket2Created, 3) // 72hr SLA for high
  tickets.push({
    id: 'TKT-2026-0002',
    subject: 'MDR Overcharge - Stripe May Settlement',
    description: 'MDR charged at 3.2% instead of contracted 2.9%. Affects 1,245 transactions totaling SGD 12,450 in excess fees. Requesting credit note.',
    category: 'fee_dispute',
    status: 'pending_psp',
    priority: 'high',
    pspId: 'stripe',
    pspName: 'Stripe',
    relatedRecordId: 'EXC-20260605-002',
    relatedRecordType: 'exception',
    assignee: USERS.james.id,
    assigneeName: USERS.james.name,
    reporter: USERS.priya.id,
    reporterName: USERS.priya.name,
    createdAt: formatISO(ticket2Created),
    updatedAt: formatISO(getRelativeDate(1, 0)),
    dueDate: formatISO(ticket2Due),
    slaBreach: false,
    amount: 12450.00,
    currency: 'SGD',
    lastResponseFrom: 'internal',
    lastResponseAt: formatISO(getRelativeDate(1, 0)),
    responseCount: 3,
    tags: ['fee-recovery', 'contract-violation'],
  })

  // ========== MEDIUM: Settlement Amount Mismatch ==========
  const ticket3Created = getRelativeDate(2, 0)
  const ticket3Due = addDays(ticket3Created, 5) // 5 day SLA for medium
  tickets.push({
    id: 'TKT-2026-0003',
    subject: 'Settlement Variance - GrabPay June 8 Batch',
    description: 'Bank credit SGD 467,880 but PSP settlement file shows SGD 456,300. Variance of SGD 11,580 (2.48%) exceeds tolerance. Need breakdown from PSP.',
    category: 'settlement_dispute',
    status: 'in_progress',
    priority: 'medium',
    pspId: 'grabpay',
    pspName: 'GrabPay',
    relatedRecordId: `BC-GP-${formatDateDisplay(getYesterday())}-003`,
    relatedRecordType: 'bank_credit',
    assignee: USERS.michael.id,
    assigneeName: USERS.michael.name,
    reporter: USERS.sarah.id,
    reporterName: USERS.sarah.name,
    createdAt: formatISO(ticket3Created),
    updatedAt: formatISO(getRelativeDate(0, 6)),
    dueDate: formatISO(ticket3Due),
    slaBreach: false,
    amount: 11580.00,
    currency: 'SGD',
    lastResponseFrom: 'psp',
    lastResponseAt: formatISO(getRelativeDate(0, 12)),
    responseCount: 4,
    tags: ['variance', 'investigation'],
  })

  // ========== HIGH: Chargeback Representment Support ==========
  const ticket4Created = getRelativeDate(4, 0)
  const ticket4Due = addDays(ticket4Created, 2)
  tickets.push({
    id: 'TKT-2026-0004',
    subject: 'Chargeback Evidence Request - Order ORD-2026-78234',
    description: 'Customer disputed delivery. Need GPS logs and delivery confirmation from PSP to submit representment. Deadline in 3 days.',
    category: 'psp_inquiry',
    status: 'pending_psp',
    priority: 'high',
    pspId: 'grabpay',
    pspName: 'GrabPay',
    relatedRecordId: 'CB-20260606-001',
    relatedRecordType: 'exception',
    assignee: USERS.lisa.id,
    assigneeName: USERS.lisa.name,
    reporter: USERS.james.id,
    reporterName: USERS.james.name,
    createdAt: formatISO(ticket4Created),
    updatedAt: formatISO(getRelativeDate(0, 8)),
    dueDate: formatISO(ticket4Due),
    slaBreach: true,
    slaBreachAt: formatISO(addDays(ticket4Created, 2)),
    amount: 156.80,
    currency: 'SGD',
    lastResponseFrom: 'internal',
    lastResponseAt: formatISO(getRelativeDate(0, 8)),
    responseCount: 2,
    tags: ['chargeback', 'urgent', 'deadline'],
  })

  // ========== LOW: General Inquiry ==========
  const ticket5Created = getRelativeDate(7, 0)
  const ticket5Due = addDays(ticket5Created, 7)
  tickets.push({
    id: 'TKT-2026-0005',
    subject: 'New Field Mapping Request - Refund Reference',
    description: 'GrabPay added new column "refund_reference" in settlement file. Need mapping specification for connector update.',
    category: 'technical_issue',
    status: 'in_progress',
    priority: 'low',
    pspId: 'grabpay',
    pspName: 'GrabPay',
    assignee: USERS.michael.id,
    assigneeName: USERS.michael.name,
    reporter: USERS.priya.id,
    reporterName: USERS.priya.name,
    createdAt: formatISO(ticket5Created),
    updatedAt: formatISO(getRelativeDate(2, 0)),
    dueDate: formatISO(ticket5Due),
    slaBreach: false,
    lastResponseFrom: 'psp',
    lastResponseAt: formatISO(getRelativeDate(3, 0)),
    responseCount: 6,
    tags: ['connector', 'enhancement'],
  })

  // ========== RESOLVED: Historical Fee Recovery ==========
  const ticket6Created = getRelativeDate(14, 0)
  const ticket6Due = addDays(ticket6Created, 5)
  tickets.push({
    id: 'TKT-2026-0006',
    subject: 'Fee Recovery Confirmed - Stripe Q1 Overcharges',
    description: 'Credit note received for SGD 8,920 covering Q1 MDR overcharges. Applied to June settlement.',
    category: 'fee_dispute',
    status: 'resolved',
    priority: 'medium',
    pspId: 'stripe',
    pspName: 'Stripe',
    assignee: USERS.james.id,
    assigneeName: USERS.james.name,
    reporter: USERS.priya.id,
    reporterName: USERS.priya.name,
    createdAt: formatISO(ticket6Created),
    updatedAt: formatISO(getRelativeDate(7, 0)),
    dueDate: formatISO(ticket6Due),
    slaBreach: false,
    amount: 8920.00,
    currency: 'SGD',
    lastResponseFrom: 'psp',
    lastResponseAt: formatISO(getRelativeDate(7, 0)),
    responseCount: 8,
    tags: ['fee-recovery', 'credit-note', 'closed'],
  })

  // ========== OPEN: New Ticket Today ==========
  const ticket7Created = getRelativeDate(0, 2)
  const ticket7Due = addDays(ticket7Created, 3)
  tickets.push({
    id: 'TKT-2026-0007',
    subject: 'Duplicate Transaction Investigation',
    description: 'Two identical settlements detected for order ORD-2026-89012. Need PSP confirmation if this is intentional split or duplicate.',
    category: 'psp_inquiry',
    status: 'open',
    priority: 'medium',
    pspId: 'grabpay',
    pspName: 'GrabPay',
    relatedRecordId: 'EXC-20260610-001',
    relatedRecordType: 'exception',
    assignee: USERS.sarah.id,
    assigneeName: USERS.sarah.name,
    reporter: 'SYSTEM',
    reporterName: 'System',
    createdAt: formatISO(ticket7Created),
    updatedAt: formatISO(ticket7Created),
    dueDate: formatISO(ticket7Due),
    slaBreach: false,
    amount: 2340.00,
    currency: 'SGD',
    responseCount: 0,
    tags: ['duplicate', 'investigation'],
  })

  // ========== ESCALATED: Long-running Dispute ==========
  const ticket8Created = getRelativeDate(21, 0)
  const ticket8Due = addDays(ticket8Created, 5)
  tickets.push({
    id: 'TKT-2026-0008',
    subject: 'ESCALATION: Unresolved Reserve Release - Stripe',
    description: 'Rolling reserve of SGD 45,000 due for release on May 15. Multiple follow-ups with no resolution. Escalated to account manager.',
    category: 'escalation',
    status: 'escalated',
    priority: 'critical',
    pspId: 'stripe',
    pspName: 'Stripe',
    assignee: USERS.priya.id,
    assigneeName: USERS.priya.name,
    reporter: USERS.james.id,
    reporterName: USERS.james.name,
    createdAt: formatISO(ticket8Created),
    updatedAt: formatISO(getRelativeDate(0, 12)),
    dueDate: formatISO(ticket8Due),
    slaBreach: true,
    slaBreachAt: formatISO(addDays(ticket8Created, 5)),
    amount: 45000.00,
    currency: 'SGD',
    lastResponseFrom: 'internal',
    lastResponseAt: formatISO(getRelativeDate(0, 12)),
    responseCount: 12,
    tags: ['escalation', 'reserve', 'account-manager'],
  })

  // Sort by priority and then by created date
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
  return tickets.sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
    if (priorityDiff !== 0) return priorityDiff
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}

// ============================================================================
// GENERATE COMMENTS
// ============================================================================

const generateComments = (): TicketComment[] => {
  const comments: TicketComment[] = []

  // ========================================================================
  // TICKET 1: Missing GrabPay Settlement File (Finance ↔ Tech ↔ PSP)
  // ========================================================================
  comments.push(
    {
      id: 'CMT-001',
      ticketId: 'TKT-2026-0001',
      author: 'SYSTEM',
      authorName: 'System',
      authorType: 'system',
      content: 'Ticket auto-created: Settlement file not received by expected time (18:00 SGT). Bank credit BC-GP-07JUN26-006 cannot be reconciled.',
      timestamp: formatISO(getRelativeDate(3, 0)),
      isInternal: false,
    },
    {
      id: 'CMT-002',
      ticketId: 'TKT-2026-0001',
      author: USERS.sarah.id,
      authorName: USERS.sarah.name,
      authorType: 'internal',
      content: '@Kevin - Can you check if there were any SFTP connection issues on our side? The daily GrabPay file didn\'t come through.',
      timestamp: formatISO(getRelativeDate(2, 22)),
      isInternal: true,
    },
    {
      id: 'CMT-003',
      ticketId: 'TKT-2026-0001',
      author: TECH_TEAM.kevin.id,
      authorName: TECH_TEAM.kevin.name,
      authorType: 'internal',
      content: '@Sarah - Checked our SFTP logs. Connection was stable, no timeouts. Last successful poll was at 17:45 SGT, directory was empty. Issue is on GrabPay\'s side - they didn\'t upload the file.',
      timestamp: formatISO(getRelativeDate(2, 21)),
      isInternal: true,
    },
    {
      id: 'CMT-004',
      ticketId: 'TKT-2026-0001',
      author: USERS.sarah.id,
      authorName: USERS.sarah.name,
      authorType: 'internal',
      content: 'Contacted GrabPay support via email. Reference: GP-SUP-2026-45678. Awaiting response.',
      timestamp: formatISO(getRelativeDate(2, 20)),
      isInternal: false,
    },
    {
      id: 'CMT-005',
      ticketId: 'TKT-2026-0001',
      author: PSP_CONTACTS.grabpay.id,
      authorName: PSP_CONTACTS.grabpay.name,
      authorType: 'psp',
      content: 'Thank you for reaching out. We are investigating the file delivery issue. Our SFTP logs show successful upload at 18:15 SGT to path /incoming/settlements/. Can you confirm the directory path configured on your end?',
      timestamp: formatISO(getRelativeDate(2, 14)),
      isInternal: false,
    },
    {
      id: 'CMT-006',
      ticketId: 'TKT-2026-0001',
      author: USERS.sarah.id,
      authorName: USERS.sarah.name,
      authorType: 'internal',
      content: '@Kevin - GrabPay says they uploaded to /incoming/settlements/. Can you verify our polling path?',
      timestamp: formatISO(getRelativeDate(2, 12)),
      isInternal: true,
    },
    {
      id: 'CMT-007',
      ticketId: 'TKT-2026-0001',
      author: TECH_TEAM.kevin.id,
      authorName: TECH_TEAM.kevin.name,
      authorType: 'internal',
      content: 'Confirmed - we poll /incoming/daily_settlements/ as per the original integration spec. Looks like GrabPay changed their upload path without notifying us. This is a breaking change on their side.',
      timestamp: formatISO(getRelativeDate(2, 10)),
      isInternal: true,
      attachments: [
        { id: 'ATT-001A', fileName: 'sftp_config_screenshot.png', fileSize: 85000, fileType: 'image/png', uploadedAt: formatISO(getRelativeDate(2, 10)), uploadedBy: TECH_TEAM.kevin.id }
      ]
    },
    {
      id: 'CMT-008',
      ticketId: 'TKT-2026-0001',
      author: USERS.sarah.id,
      authorName: USERS.sarah.name,
      authorType: 'internal',
      content: 'Our configured path is /incoming/daily_settlements/ per the original integration spec from March 2025. It appears your team changed the upload directory to /incoming/settlements/ without prior notification. Please either: (1) Re-upload the file to the correct path, or (2) Provide official change notice so we can update our connector.',
      timestamp: formatISO(getRelativeDate(1, 8)),
      isInternal: false,
    },
    {
      id: 'CMT-009',
      ticketId: 'TKT-2026-0001',
      author: USERS.sarah.id,
      authorName: USERS.sarah.name,
      authorType: 'internal',
      content: '[INTERNAL] Escalated to Finance Director. This is blocking month-end close. Need resolution by EOD. Also looped in @David from Tech to ensure we have a permanent fix.',
      timestamp: formatISO(getRelativeDate(1, 6)),
      isInternal: true,
    },
    {
      id: 'CMT-010',
      ticketId: 'TKT-2026-0001',
      author: TECH_TEAM.david.id,
      authorName: TECH_TEAM.david.name,
      authorType: 'internal',
      content: '@Sarah - Once we get the file, I\'ll update the connector to poll both paths as a fallback. We should also add monitoring alerts for missing files. Creating a separate task for @Rachel to implement.',
      timestamp: formatISO(getRelativeDate(1, 4)),
      isInternal: true,
    },
    {
      id: 'CMT-011',
      ticketId: 'TKT-2026-0001',
      author: PSP_CONTACTS.grabpay.id,
      authorName: PSP_CONTACTS.grabpay.name,
      authorType: 'psp',
      content: 'Apologies for the confusion. Our infrastructure team made changes last week and the path update was not communicated properly. File has been re-uploaded to /incoming/daily_settlements/. Please confirm receipt. We will send official change notice for future reference.',
      timestamp: formatISO(getRelativeDate(1, 2)),
      isInternal: false,
      attachments: [
        { id: 'ATT-001B', fileName: 'grabpay_settlement_07JUN2026.csv', fileSize: 2450000, fileType: 'text/csv', uploadedAt: formatISO(getRelativeDate(1, 2)), uploadedBy: PSP_CONTACTS.grabpay.id }
      ]
    },
    {
      id: 'CMT-012',
      ticketId: 'TKT-2026-0001',
      author: TECH_TEAM.kevin.id,
      authorName: TECH_TEAM.kevin.name,
      authorType: 'internal',
      content: 'File received and processed. 4,521 transactions parsed. Handing off to Finance for reconciliation.',
      timestamp: formatISO(getRelativeDate(0, 22)),
      isInternal: true,
    }
  )

  // ========================================================================
  // TICKET 2: Fee Dispute with Stripe (Finance ↔ PSP back-and-forth)
  // ========================================================================
  comments.push(
    {
      id: 'CMT-020',
      ticketId: 'TKT-2026-0002',
      author: USERS.priya.id,
      authorName: USERS.priya.name,
      authorType: 'internal',
      content: 'Identified MDR overcharge during monthly fee reconciliation. Contract rate is 2.9% but we\'re being charged 3.2% on 1,245 transactions. Total impact: SGD 12,450. Attached transaction-level breakdown.',
      timestamp: formatISO(getRelativeDate(5, 0)),
      isInternal: false,
      attachments: [
        { id: 'ATT-002', fileName: 'stripe_mdr_analysis_may2026.xlsx', fileSize: 245000, fileType: 'application/xlsx', uploadedAt: formatISO(getRelativeDate(5, 0)), uploadedBy: USERS.priya.id }
      ]
    },
    {
      id: 'CMT-021',
      ticketId: 'TKT-2026-0002',
      author: USERS.james.id,
      authorName: USERS.james.name,
      authorType: 'internal',
      content: '[INTERNAL] @Priya - Good catch. I\'ve pulled our signed contract from March 2025. Section 4.2 clearly states 2.9% for card-present transactions. Screenshot attached.',
      timestamp: formatISO(getRelativeDate(4, 20)),
      isInternal: true,
      attachments: [
        { id: 'ATT-003', fileName: 'stripe_contract_section4.pdf', fileSize: 320000, fileType: 'application/pdf', uploadedAt: formatISO(getRelativeDate(4, 20)), uploadedBy: USERS.james.id }
      ]
    },
    {
      id: 'CMT-022',
      ticketId: 'TKT-2026-0002',
      author: USERS.james.id,
      authorName: USERS.james.name,
      authorType: 'internal',
      content: 'Submitted dispute to Stripe via merchant portal. Case ID: STR-DISP-2026-12345. Attached our contract as evidence.',
      timestamp: formatISO(getRelativeDate(4, 12)),
      isInternal: false,
    },
    {
      id: 'CMT-023',
      ticketId: 'TKT-2026-0002',
      author: PSP_CONTACTS.stripe.id,
      authorName: PSP_CONTACTS.stripe.name,
      authorType: 'psp',
      content: 'Thank you for your dispute submission. Case STR-DISP-2026-12345 has been assigned to our billing team. We will review and respond within 5 business days.',
      timestamp: formatISO(getRelativeDate(4, 8)),
      isInternal: false,
    },
    {
      id: 'CMT-024',
      ticketId: 'TKT-2026-0002',
      author: PSP_CONTACTS.stripe.id,
      authorName: PSP_CONTACTS.stripe.name,
      authorType: 'psp',
      content: 'Update on Case STR-DISP-2026-12345: Our review shows that the 3.2% rate was applied to transactions flagged as "card-not-present" (online/keyed). Per your contract, the 2.9% rate applies to card-present (chip/contactless) only. Can you confirm the transaction types in your submission?',
      timestamp: formatISO(getRelativeDate(3, 0)),
      isInternal: false,
    },
    {
      id: 'CMT-025',
      ticketId: 'TKT-2026-0002',
      author: USERS.james.id,
      authorName: USERS.james.name,
      authorType: 'internal',
      content: '[INTERNAL] @Priya - Can you pull the POS terminal logs for these transactions? We need to prove they were chip/contactless, not keyed.',
      timestamp: formatISO(getRelativeDate(2, 20)),
      isInternal: true,
    },
    {
      id: 'CMT-026',
      ticketId: 'TKT-2026-0002',
      author: USERS.priya.id,
      authorName: USERS.priya.name,
      authorType: 'internal',
      content: '@James - Pulled the logs. All 1,245 transactions show entry_mode="chip" or entry_mode="contactless". These were definitely card-present. Stripe\'s system must have mis-categorized them. Attaching evidence.',
      timestamp: formatISO(getRelativeDate(2, 16)),
      isInternal: true,
      attachments: [
        { id: 'ATT-004', fileName: 'pos_terminal_logs_may2026.csv', fileSize: 890000, fileType: 'text/csv', uploadedAt: formatISO(getRelativeDate(2, 16)), uploadedBy: USERS.priya.id }
      ]
    },
    {
      id: 'CMT-027',
      ticketId: 'TKT-2026-0002',
      author: USERS.james.id,
      authorName: USERS.james.name,
      authorType: 'internal',
      content: 'We have reviewed our POS terminal logs. All 1,245 transactions were processed as chip or contactless (entry_mode field attached). It appears these were incorrectly categorized as CNP on your side. Requesting you review your transaction classification logic and issue the credit note for SGD 12,450.',
      timestamp: formatISO(getRelativeDate(2, 12)),
      isInternal: false,
      attachments: [
        { id: 'ATT-005', fileName: 'entry_mode_evidence.xlsx', fileSize: 156000, fileType: 'application/xlsx', uploadedAt: formatISO(getRelativeDate(2, 12)), uploadedBy: USERS.james.id }
      ]
    },
    {
      id: 'CMT-028',
      ticketId: 'TKT-2026-0002',
      author: PSP_CONTACTS.stripe.id,
      authorName: PSP_CONTACTS.stripe.name,
      authorType: 'psp',
      content: 'Thank you for the additional evidence. We have escalated this to our technical team to investigate the entry_mode classification discrepancy. We will update you within 48 hours.',
      timestamp: formatISO(getRelativeDate(1, 0)),
      isInternal: false,
    }
  )

  // ========================================================================
  // TICKET 3: Settlement Variance (Finance ↔ Tech ↔ PSP)
  // ========================================================================
  comments.push(
    {
      id: 'CMT-030',
      ticketId: 'TKT-2026-0003',
      author: USERS.sarah.id,
      authorName: USERS.sarah.name,
      authorType: 'internal',
      content: 'Variance detected during T1 matching. Bank credit shows SGD 467,880 but PSP settlement file totals SGD 456,300. Variance: SGD 11,580 (2.48%).',
      timestamp: formatISO(getRelativeDate(2, 0)),
      isInternal: false,
    },
    {
      id: 'CMT-031',
      ticketId: 'TKT-2026-0003',
      author: USERS.sarah.id,
      authorName: USERS.sarah.name,
      authorType: 'internal',
      content: '[INTERNAL] @Amit - Can you run a query against our raw transaction data to see if we have any orders that match this gap? Maybe some transactions weren\'t included in the PSP file.',
      timestamp: formatISO(getRelativeDate(1, 22)),
      isInternal: true,
    },
    {
      id: 'CMT-032',
      ticketId: 'TKT-2026-0003',
      author: TECH_TEAM.amit.id,
      authorName: TECH_TEAM.amit.name,
      authorType: 'internal',
      content: '@Sarah - Ran the query. Found 47 transactions totaling SGD 11,580 that were settled on June 7 (evening batch) but not included in the June 8 settlement file. These are likely the missing transactions. Query output attached.',
      timestamp: formatISO(getRelativeDate(1, 20)),
      isInternal: true,
      attachments: [
        { id: 'ATT-006', fileName: 'missing_txn_query_results.csv', fileSize: 45000, fileType: 'text/csv', uploadedAt: formatISO(getRelativeDate(1, 20)), uploadedBy: TECH_TEAM.amit.id }
      ]
    },
    {
      id: 'CMT-033',
      ticketId: 'TKT-2026-0003',
      author: USERS.michael.id,
      authorName: USERS.michael.name,
      authorType: 'internal',
      content: 'Thanks @Amit. I\'ll contact GrabPay to confirm these 47 transactions and request a corrected settlement file.',
      timestamp: formatISO(getRelativeDate(1, 18)),
      isInternal: true,
    },
    {
      id: 'CMT-034',
      ticketId: 'TKT-2026-0003',
      author: USERS.michael.id,
      authorName: USERS.michael.name,
      authorType: 'internal',
      content: 'Hi GrabPay Support, we have identified a variance of SGD 11,580 between our bank credit and your settlement file dated June 8. Our internal analysis shows 47 transactions from the June 7 evening batch appear to be missing from the settlement file. Transaction IDs attached. Please confirm and provide corrected file.',
      timestamp: formatISO(getRelativeDate(1, 16)),
      isInternal: false,
      attachments: [
        { id: 'ATT-007', fileName: 'missing_transactions_list.xlsx', fileSize: 28000, fileType: 'application/xlsx', uploadedAt: formatISO(getRelativeDate(1, 16)), uploadedBy: USERS.michael.id }
      ]
    },
    {
      id: 'CMT-035',
      ticketId: 'TKT-2026-0003',
      author: PSP_CONTACTS.grabpay.id,
      authorName: PSP_CONTACTS.grabpay.name,
      authorType: 'psp',
      content: 'Thank you for the detailed breakdown. We have verified your analysis is correct. These 47 transactions were processed in the June 7 evening batch but incorrectly included in the bank payout for June 8 without being added to the settlement file. Root cause: timing issue in our batch processing. Corrected settlement file attached.',
      timestamp: formatISO(getRelativeDate(0, 12)),
      isInternal: false,
      attachments: [
        { id: 'ATT-008', fileName: 'grabpay_settlement_jun8_corrected.csv', fileSize: 2890000, fileType: 'text/csv', uploadedAt: formatISO(getRelativeDate(0, 12)), uploadedBy: PSP_CONTACTS.grabpay.id },
        { id: 'ATT-009', fileName: 'grabpay_variance_breakdown_jun8.pdf', fileSize: 156000, fileType: 'application/pdf', uploadedAt: formatISO(getRelativeDate(0, 12)), uploadedBy: PSP_CONTACTS.grabpay.id }
      ]
    },
    {
      id: 'CMT-036',
      ticketId: 'TKT-2026-0003',
      author: USERS.michael.id,
      authorName: USERS.michael.name,
      authorType: 'internal',
      content: '[INTERNAL] @Kevin - Can you re-ingest the corrected file? Should auto-resolve the exception once processed.',
      timestamp: formatISO(getRelativeDate(0, 8)),
      isInternal: true,
    },
    {
      id: 'CMT-037',
      ticketId: 'TKT-2026-0003',
      author: TECH_TEAM.kevin.id,
      authorName: TECH_TEAM.kevin.name,
      authorType: 'internal',
      content: 'Corrected file ingested. Reconciliation complete - variance now at 0. Exception auto-resolved.',
      timestamp: formatISO(getRelativeDate(0, 6)),
      isInternal: true,
    },
    {
      id: 'CMT-038',
      ticketId: 'TKT-2026-0003',
      author: USERS.michael.id,
      authorName: USERS.michael.name,
      authorType: 'internal',
      content: 'Confirmed. Corrected file received and processed. Variance resolved. Thank you for the quick turnaround.',
      timestamp: formatISO(getRelativeDate(0, 5)),
      isInternal: false,
    }
  )

  // ========================================================================
  // TICKET 5: Technical Issue - Field Mapping (Finance ↔ Tech team)
  // ========================================================================
  comments.push(
    {
      id: 'CMT-050',
      ticketId: 'TKT-2026-0005',
      author: USERS.priya.id,
      authorName: USERS.priya.name,
      authorType: 'internal',
      content: 'Noticed a new column "refund_reference" appearing in today\'s GrabPay settlement file. This field wasn\'t in the original spec. We need to map this for proper refund tracking.',
      timestamp: formatISO(getRelativeDate(7, 0)),
      isInternal: false,
    },
    {
      id: 'CMT-051',
      ticketId: 'TKT-2026-0005',
      author: USERS.priya.id,
      authorName: USERS.priya.name,
      authorType: 'internal',
      content: '@Michael - Can you confirm with GrabPay what this field represents? Is it the original transaction ID for refunds?',
      timestamp: formatISO(getRelativeDate(6, 20)),
      isInternal: true,
    },
    {
      id: 'CMT-052',
      ticketId: 'TKT-2026-0005',
      author: USERS.michael.id,
      authorName: USERS.michael.name,
      authorType: 'internal',
      content: 'Submitted inquiry to GrabPay. Also looping in @Kevin for the connector update once we get the spec.',
      timestamp: formatISO(getRelativeDate(6, 16)),
      isInternal: true,
    },
    {
      id: 'CMT-053',
      ticketId: 'TKT-2026-0005',
      author: USERS.michael.id,
      authorName: USERS.michael.name,
      authorType: 'internal',
      content: 'Hi GrabPay, we noticed a new field "refund_reference" in the latest settlement file format. Could you please provide: (1) Field specification and data type, (2) Business meaning of this field, (3) Whether this is mandatory going forward.',
      timestamp: formatISO(getRelativeDate(6, 14)),
      isInternal: false,
    },
    {
      id: 'CMT-054',
      ticketId: 'TKT-2026-0005',
      author: PSP_CONTACTS.grabpay.id,
      authorName: PSP_CONTACTS.grabpay.name,
      authorType: 'psp',
      content: 'Thank you for your inquiry. The "refund_reference" field was added as part of our June 2026 file format update. Specification: (1) VARCHAR(50), nullable (2) Contains the original transaction_id for refund records, null for regular transactions (3) Optional field, will be populated for all refunds going forward. Full updated spec document attached.',
      timestamp: formatISO(getRelativeDate(5, 0)),
      isInternal: false,
      attachments: [
        { id: 'ATT-010', fileName: 'grabpay_settlement_spec_v2.4.pdf', fileSize: 520000, fileType: 'application/pdf', uploadedAt: formatISO(getRelativeDate(5, 0)), uploadedBy: PSP_CONTACTS.grabpay.id }
      ]
    },
    {
      id: 'CMT-055',
      ticketId: 'TKT-2026-0005',
      author: TECH_TEAM.kevin.id,
      authorName: TECH_TEAM.kevin.name,
      authorType: 'internal',
      content: '[INTERNAL] Got the spec. This is useful - we can now automatically link refunds to original orders. @Rachel can you create a ticket for the connector update? Low priority, but good to have before month-end.',
      timestamp: formatISO(getRelativeDate(4, 12)),
      isInternal: true,
    },
    {
      id: 'CMT-056',
      ticketId: 'TKT-2026-0005',
      author: TECH_TEAM.rachel.id,
      authorName: TECH_TEAM.rachel.name,
      authorType: 'internal',
      content: 'Created JIRA ticket CASH-1234 for the connector update. @Kevin will implement next sprint. @Priya - once deployed, the refund reconciliation should be much smoother.',
      timestamp: formatISO(getRelativeDate(4, 8)),
      isInternal: true,
    },
    {
      id: 'CMT-057',
      ticketId: 'TKT-2026-0005',
      author: USERS.priya.id,
      authorName: USERS.priya.name,
      authorType: 'internal',
      content: 'Great, thanks team! For now, I\'ll manually track refund references in Excel. Let me know when the update goes live.',
      timestamp: formatISO(getRelativeDate(4, 4)),
      isInternal: true,
    },
    {
      id: 'CMT-058',
      ticketId: 'TKT-2026-0005',
      author: TECH_TEAM.kevin.id,
      authorName: TECH_TEAM.kevin.name,
      authorType: 'internal',
      content: 'Update: Connector change deployed to staging. Testing with sample files now. Should go live by end of week.',
      timestamp: formatISO(getRelativeDate(2, 0)),
      isInternal: true,
    }
  )

  // ========================================================================
  // TICKET 6: Resolved Fee Recovery (Full trail showing resolution)
  // ========================================================================
  comments.push(
    {
      id: 'CMT-060',
      ticketId: 'TKT-2026-0006',
      author: USERS.priya.id,
      authorName: USERS.priya.name,
      authorType: 'internal',
      content: 'Following up on the Q1 MDR overcharge analysis. Stripe confirmed they overbilled us by SGD 8,920 due to incorrect rate tier application.',
      timestamp: formatISO(getRelativeDate(14, 0)),
      isInternal: false,
    },
    {
      id: 'CMT-061',
      ticketId: 'TKT-2026-0006',
      author: USERS.james.id,
      authorName: USERS.james.name,
      authorType: 'internal',
      content: 'Submitted formal credit request with supporting documentation. Case ID: STR-CR-2026-5678.',
      timestamp: formatISO(getRelativeDate(13, 0)),
      isInternal: false,
    },
    {
      id: 'CMT-062',
      ticketId: 'TKT-2026-0006',
      author: PSP_CONTACTS.stripe.id,
      authorName: PSP_CONTACTS.stripe.name,
      authorType: 'psp',
      content: 'Credit request STR-CR-2026-5678 approved. Credit note for SGD 8,920 will be applied to your next settlement (June payout).',
      timestamp: formatISO(getRelativeDate(10, 0)),
      isInternal: false,
      attachments: [
        { id: 'ATT-011', fileName: 'stripe_credit_note_CN-2026-5678.pdf', fileSize: 89000, fileType: 'application/pdf', uploadedAt: formatISO(getRelativeDate(10, 0)), uploadedBy: PSP_CONTACTS.stripe.id }
      ]
    },
    {
      id: 'CMT-063',
      ticketId: 'TKT-2026-0006',
      author: USERS.james.id,
      authorName: USERS.james.name,
      authorType: 'internal',
      content: '[INTERNAL] Great news! Credit note received. @Sarah - FYI this will show up as a positive adjustment in the June 5 settlement.',
      timestamp: formatISO(getRelativeDate(9, 12)),
      isInternal: true,
    },
    {
      id: 'CMT-064',
      ticketId: 'TKT-2026-0006',
      author: USERS.sarah.id,
      authorName: USERS.sarah.name,
      authorType: 'internal',
      content: 'Confirmed. Created GL adjustment entry to recognize the fee recovery. Will book as misc income per accounting policy.',
      timestamp: formatISO(getRelativeDate(8, 0)),
      isInternal: true,
    },
    {
      id: 'CMT-065',
      ticketId: 'TKT-2026-0006',
      author: USERS.james.id,
      authorName: USERS.james.name,
      authorType: 'internal',
      content: 'June 5 settlement received. Verified credit note of SGD 8,920 applied correctly. Marking ticket as resolved.',
      timestamp: formatISO(getRelativeDate(7, 0)),
      isInternal: false,
    }
  )

  // ========================================================================
  // TICKET 8: Long-running Escalation (Finance ↔ PSP Account Manager)
  // ========================================================================
  comments.push(
    {
      id: 'CMT-080',
      ticketId: 'TKT-2026-0008',
      author: USERS.james.id,
      authorName: USERS.james.name,
      authorType: 'internal',
      content: 'Rolling reserve of SGD 45,000 was due for release on May 15 per our contract (90-day holding period). It\'s now been 21 days overdue. Submitted release request via portal.',
      timestamp: formatISO(getRelativeDate(21, 0)),
      isInternal: false,
    },
    {
      id: 'CMT-081',
      ticketId: 'TKT-2026-0008',
      author: PSP_CONTACTS.stripe.id,
      authorName: PSP_CONTACTS.stripe.name,
      authorType: 'psp',
      content: 'Reserve release request received. Your account is currently under review. We will process once the review is complete.',
      timestamp: formatISO(getRelativeDate(20, 0)),
      isInternal: false,
    },
    {
      id: 'CMT-082',
      ticketId: 'TKT-2026-0008',
      author: USERS.james.id,
      authorName: USERS.james.name,
      authorType: 'internal',
      content: 'What review? Our account has been active since 2024 with no chargebacks or disputes. Please clarify or release the funds immediately.',
      timestamp: formatISO(getRelativeDate(18, 0)),
      isInternal: false,
    },
    {
      id: 'CMT-083',
      ticketId: 'TKT-2026-0008',
      author: PSP_CONTACTS.stripe.id,
      authorName: PSP_CONTACTS.stripe.name,
      authorType: 'psp',
      content: 'We apologize for the delay. Our risk team conducts periodic reviews on merchant accounts. We are unable to provide specific details but expect the review to complete within 7-10 business days.',
      timestamp: formatISO(getRelativeDate(15, 0)),
      isInternal: false,
    },
    {
      id: 'CMT-084',
      ticketId: 'TKT-2026-0008',
      author: USERS.james.id,
      authorName: USERS.james.name,
      authorType: 'internal',
      content: '[INTERNAL] @Priya - This is unacceptable. SGD 45K tied up for no clear reason. Can you escalate to our Account Manager?',
      timestamp: formatISO(getRelativeDate(14, 12)),
      isInternal: true,
    },
    {
      id: 'CMT-085',
      ticketId: 'TKT-2026-0008',
      author: USERS.priya.id,
      authorName: USERS.priya.name,
      authorType: 'internal',
      content: 'Escalating to Jennifer Wu (our Stripe AM). She\'s been responsive in the past.',
      timestamp: formatISO(getRelativeDate(14, 8)),
      isInternal: true,
    },
    {
      id: 'CMT-086',
      ticketId: 'TKT-2026-0008',
      author: USERS.priya.id,
      authorName: USERS.priya.name,
      authorType: 'internal',
      content: 'Hi Jennifer, we\'re experiencing a significant issue with reserve release (SGD 45,000 due May 15, now 14 days overdue). Standard support says our account is "under review" but cannot provide details. This is impacting our cash flow. Can you help expedite?',
      timestamp: formatISO(getRelativeDate(14, 6)),
      isInternal: false,
    },
    {
      id: 'CMT-087',
      ticketId: 'TKT-2026-0008',
      author: PSP_CONTACTS.stripe_am.id,
      authorName: PSP_CONTACTS.stripe_am.name,
      authorType: 'psp',
      content: 'Hi Priya, thank you for reaching out directly. I\'ve looked into your account and see the reserve release is stuck in our periodic risk review queue. This appears to be a backlog issue, not any concern with your account. I\'ve flagged this for expedited review and will follow up within 48 hours.',
      timestamp: formatISO(getRelativeDate(13, 0)),
      isInternal: false,
    },
    {
      id: 'CMT-088',
      ticketId: 'TKT-2026-0008',
      author: USERS.priya.id,
      authorName: USERS.priya.name,
      authorType: 'internal',
      content: '[INTERNAL] Good progress with AM. She confirmed it\'s a backlog issue, not a real risk concern.',
      timestamp: formatISO(getRelativeDate(12, 12)),
      isInternal: true,
    },
    {
      id: 'CMT-089',
      ticketId: 'TKT-2026-0008',
      author: PSP_CONTACTS.stripe_am.id,
      authorName: PSP_CONTACTS.stripe_am.name,
      authorType: 'psp',
      content: 'Update: Risk review cleared. Reserve release of SGD 45,000 has been queued for the next settlement batch (June 10). I apologize for the delay - we\'re working on improving our reserve release SLAs.',
      timestamp: formatISO(getRelativeDate(7, 0)),
      isInternal: false,
    },
    {
      id: 'CMT-090',
      ticketId: 'TKT-2026-0008',
      author: USERS.priya.id,
      authorName: USERS.priya.name,
      authorType: 'internal',
      content: 'Hi Jennifer, it\'s now June 10 and we haven\'t seen the reserve release in today\'s settlement. Can you please check?',
      timestamp: formatISO(getRelativeDate(1, 8)),
      isInternal: false,
    },
    {
      id: 'CMT-091',
      ticketId: 'TKT-2026-0008',
      author: PSP_CONTACTS.stripe_am.id,
      authorName: PSP_CONTACTS.stripe_am.name,
      authorType: 'psp',
      content: 'Checking with settlements team now. Will revert within the hour.',
      timestamp: formatISO(getRelativeDate(1, 4)),
      isInternal: false,
    },
    {
      id: 'CMT-092',
      ticketId: 'TKT-2026-0008',
      author: USERS.priya.id,
      authorName: USERS.priya.name,
      authorType: 'internal',
      content: '[INTERNAL] Still waiting. If not resolved by EOD, we should escalate to legal/procurement to review the contract terms around reserve release.',
      timestamp: formatISO(getRelativeDate(0, 12)),
      isInternal: true,
    }
  )

  // ========================================================================
  // TICKET 4: Chargeback (Finance coordinating evidence gathering)
  // ========================================================================
  comments.push(
    {
      id: 'CMT-040',
      ticketId: 'TKT-2026-0004',
      author: USERS.james.id,
      authorName: USERS.james.name,
      authorType: 'internal',
      content: 'Received chargeback notification for order ORD-2026-78234. Customer claims non-delivery but our records show delivered. Need to gather evidence for representment.',
      timestamp: formatISO(getRelativeDate(4, 0)),
      isInternal: false,
    },
    {
      id: 'CMT-041',
      ticketId: 'TKT-2026-0004',
      author: USERS.lisa.id,
      authorName: USERS.lisa.name,
      authorType: 'internal',
      content: '[INTERNAL] Checked our order system. Order was marked delivered on June 2, 14:35. Driver: Ahmad Bin Ismail. Need GPS log and photo proof from GrabPay.',
      timestamp: formatISO(getRelativeDate(3, 18)),
      isInternal: true,
    },
    {
      id: 'CMT-042',
      ticketId: 'TKT-2026-0004',
      author: USERS.lisa.id,
      authorName: USERS.lisa.name,
      authorType: 'internal',
      content: 'Hi GrabPay, we need delivery evidence for chargeback representment. Order: ORD-2026-78234, delivered June 2. Please provide: (1) GPS coordinates at delivery, (2) Delivery photo if available, (3) Driver confirmation timestamp. Representment deadline: June 12.',
      timestamp: formatISO(getRelativeDate(3, 16)),
      isInternal: false,
    },
    {
      id: 'CMT-043',
      ticketId: 'TKT-2026-0004',
      author: PSP_CONTACTS.grabpay.id,
      authorName: PSP_CONTACTS.grabpay.name,
      authorType: 'psp',
      content: 'Request received. We are retrieving the delivery logs from our driver app. Will respond within 24-48 hours.',
      timestamp: formatISO(getRelativeDate(3, 8)),
      isInternal: false,
    },
    {
      id: 'CMT-044',
      ticketId: 'TKT-2026-0004',
      author: USERS.lisa.id,
      authorName: USERS.lisa.name,
      authorType: 'internal',
      content: '[INTERNAL] Still waiting on GrabPay. Deadline is in 2 days. @James - should we escalate?',
      timestamp: formatISO(getRelativeDate(1, 12)),
      isInternal: true,
    },
    {
      id: 'CMT-045',
      ticketId: 'TKT-2026-0004',
      author: USERS.james.id,
      authorName: USERS.james.name,
      authorType: 'internal',
      content: 'Yes, send a follow-up and cc their escalation email. We can\'t miss this deadline.',
      timestamp: formatISO(getRelativeDate(1, 10)),
      isInternal: true,
    },
    {
      id: 'CMT-046',
      ticketId: 'TKT-2026-0004',
      author: USERS.lisa.id,
      authorName: USERS.lisa.name,
      authorType: 'internal',
      content: 'URGENT: Follow-up on order ORD-2026-78234 delivery evidence. Representment deadline is June 12 (tomorrow). We have not received the requested GPS/photo evidence. Please expedite or we will lose SGD 156.80 to an invalid chargeback.',
      timestamp: formatISO(getRelativeDate(0, 8)),
      isInternal: false,
    }
  )

  return comments
}

// ============================================================================
// EXPORTS
// ============================================================================

export const getMockTickets = (): Ticket[] => {
  return generateTickets()
}

export const getMockTicketComments = (ticketId?: string): TicketComment[] => {
  const comments = generateComments()
  if (ticketId) {
    return comments.filter(c => c.ticketId === ticketId)
  }
  return comments
}

// Legacy exports
export const mockTickets = getMockTickets()
export const mockTicketComments = getMockTicketComments()
