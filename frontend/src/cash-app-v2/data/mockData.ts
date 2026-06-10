/**
 * Neoflo Cash Application - Mock Data
 * Realistic Grab-scale data for demo purposes
 *
 * ============================================================================
 * DATA CONSISTENCY & MATHEMATICAL RELATIONSHIPS
 * ============================================================================
 *
 * This file contains all mock data for the Cash App V2 dashboard and settlements.
 * All data is mathematically consistent and validated by unit tests.
 *
 * KEY METRICS & TIME PERIODS:
 *
 * 1. Total Bank Credit (Yesterday - 2026-06-06): SGD 4.25M
 *    - Time Period: Yesterday's bank credits only
 *    - Calculation: GrabPay SGD (3.5M) + Stripe SGD (0.75M) = 4.25M
 *    - IDR PSPs tracked separately (different currency)
 *
 * 2. Open AR - Accounts Receivable (From Beginning): SGD 2.0M (85 items)
 *    - Time Period: Cumulative from all time until yesterday
 *    - Definition: Unmatched receivables after T1 matching that are still open
 *    - Breakdown by age:
 *      * 0-7 days: 26 items, SGD 608K
 *      * 8-30 days: 35 items, SGD 825K
 *      * 31+ days: 24 items, SGD 467K
 *    - Breakdown by category:
 *      * No PSP File: 25 items, SGD 650K
 *      * Amount Mismatch: 48 items, SGD 1,050K
 *      * Not in OMS: 12 items, SGD 300K
 *
 * 3. Open Exceptions (All Time - with NBA): SGD 670K (13 exceptions)
 *    - Time Period: All time (cumulative)
 *    - Definition: Open exceptions with Next Best Action (NBA) defined (SGD only)
 *    - Relationship: These are detailed exceptions with diagnostics and actionable NBA
 *    - Breakdown by type:
 *      * Unmatched Credit: 5 exceptions
 *      * Unmatched Order: 4 exceptions
 *      * Amount Mismatch: 4 exceptions
 *
 * 4. PSP Reconciliation (Yesterday's Run): 5 new exceptions
 *    - Time Period: Yesterday only (2026-06-06)
 *    - Definition: NEW exceptions raised from yesterday's reconciliation
 *    - Breakdown: GrabPay (3) + Stripe (2)
 *
 * MATHEMATICAL VALIDATIONS (enforced by tests):
 *
 * ✓ Total Bank Credit SGD (4.25M) = Sum of SGD PSP credits
 * ✓ Open AR (2.0M) > Open Exceptions (670K) - AR is superset
 * ✓ Total Bank Credit (4.25M) > Open AR (2.0M) - matched portion exists
 * ✓ New exceptions (5) < Total open exceptions (13)
 * ✓ Exception aging totals = 13 items = Open Exceptions count
 * ✓ For each PSP: matched + unmatched = todayCredits
 * ✓ Settlement payouts sum = PSP reconciliation amounts
 * ✓ Open AR aging buckets sum = Total Open AR
 *
 * CURRENCY SEPARATION:
 * - SGD PSPs: GrabPay, Stripe (contribute to totalBankCreditSGD)
 * - IDR PSPs: OVO, GoPay, DOKU (tracked separately, different currency)
 * - Never mix currencies in calculations or comparisons
 *
 * For detailed test coverage, see: __tests__/data-consistency.test.ts
 */

import type {
  Entity,
  PSP,
  User,
  DashboardKPIs,
  ExceptionSummary,
  PSPReconciliationStatus,
  TransactionStatusDistribution,
  ExceptionAgingData,
  UnsettledAgingBucket,
  OpenARSummary,
  Exception,
  SettlementPayout,
  Refund,
  Chargeback,
  OrphanAdjustment,
  JournalEntryBatch,
  AuditEntry,
} from '../types/domain'

// ============================================================================
// ENTITIES
// ============================================================================

export const mockEntities: Entity[] = [
  {
    id: 'grab-sg',
    name: 'Grab Financial Services Pte. Ltd.',
    country: 'SG',
    currency: 'SGD',
    erp: 'Oracle Fusion ERP',
  },
  {
    id: 'grab-id',
    name: 'Grab Payments Indonesia PT',
    country: 'ID',
    currency: 'IDR',
    erp: 'Oracle Fusion ERP',
  },
  {
    id: 'grab-my',
    name: 'Grab Financial Malaysia Sdn Bhd',
    country: 'MY',
    currency: 'MYR',
    erp: 'Oracle Fusion ERP',
  },
]

// ============================================================================
// PSPS
// ============================================================================

export const mockPSPs: PSP[] = [
  {
    id: 'grabpay',
    name: 'GrabPay',
    currency: 'SGD,IDR,MYR',
    status: 'live',
    settlementLag: 2,
    fileFormat: 'CSV',
    lastFileDate: '2026-06-06',
  },
  {
    id: 'ovo',
    name: 'OVO',
    currency: 'IDR',
    status: 'live',
    settlementLag: 3,
    fileFormat: 'XLSX',
    lastFileDate: '2026-06-06',
  },
  {
    id: 'gopay',
    name: 'GoPay',
    currency: 'IDR',
    status: 'live',
    settlementLag: 3,
    fileFormat: 'JSON',
    lastFileDate: '2026-06-06',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    currency: 'SGD',
    status: 'live',
    settlementLag: 2,
    fileFormat: 'JSON',
    lastFileDate: '2026-06-06',
  },
  {
    id: 'doku',
    name: 'DOKU',
    currency: 'IDR',
    status: 'partial',
    settlementLag: 3,
    fileFormat: 'CSV',
  },
]

// ============================================================================
// USERS
// ============================================================================

export const mockUsers: User[] = [
  { id: 'kaustav', name: 'KaustavRay', role: 'Finance Controller', avatar: 'KR' },
  { id: 'analyst1', name: 'Analyst Kim', role: 'Reconciliation Analyst', avatar: 'AK' },
  { id: 'analyst2', name: 'Analyst Park', role: 'Reconciliation Analyst', avatar: 'AP' },
  { id: 'treasury1', name: 'Treasury Lead', role: 'Treasury / FinOps Lead', avatar: 'TL' },
  { id: 'opseng', name: 'Ops Engineer', role: 'Admin / Ops Engineer', avatar: 'OE' },
]

export const mockCurrentUser = mockUsers[0] // KaustavRay as controller

// ============================================================================
// DASHBOARD DATA
// ============================================================================

export const mockDashboardKPIs: DashboardKPIs = {
  coveragePct: 98.4,
  touchlessRate: 91.2,
  openExceptions: 19,            // Enhanced exceptions with NBA defined (all time, SGD only) — 13 original + 6 from yesterday's settlement recon
  pastSLAExceptions: 2,          // Dynamically overridden by dashboard service
  exceptionAmountSGD: 1173883,   // 1.17M SGD - Total of 19 SGD exceptions with NBA
  exceptionAmountIDR: 0,         // No IDR exceptions (Singapore entity = SGD only)
  inTransitSGD: 2274000,         // Fixed: 1,962,000 (GrabPay) + 312,000 (Stripe) = 2,274,000
  inTransitIDR: 0,               // No IDR PSPs - SGD only
  inTransitMYR: 0,
  feeRecoveredMTD: 182000,
  feeRecoveryTarget: 312000,
  pendingJEs: 23,
  totalBankCreditSGD: 4250000,   // 4.25M SGD - Total bank credits received yesterday
  // Trend data (comparison to previous period)
  coveragePctTrend: 2.1,         // +2.1% improvement vs previous period
  touchlessRateTrend: 1.5,       // +1.5% improvement
  openExceptionsTrend: -2,       // -2 fewer exceptions (negative is good)
  pendingJEsTrend: -3,           // -3 fewer pending JEs (negative is good)
  totalBankCreditTrend: 3.2,     // +3.2% increase vs previous day
  // Touchless Rate - Quarter on Quarter (L1/L2 auto-reconciliation without human involvement)
  // This measures % of bank credits that were fully reconciled (L1 matched + L2 matched) automatically
  touchlessRateCurrentQtr: 91.2, // Q2 2026: 91.2% of reconciliations were touchless (no human intervention)
  touchlessRatePrevQtr: 87.8,    // Q1 2026: 87.8% touchless rate
  touchlessRateQoQChange: 3.4,   // +3.4% improvement QoQ (91.2 - 87.8)
  touchlessRateCurrentQtrLabel: 'Q2 2026',
  touchlessRatePrevQtrLabel: 'Q1 2026',
  // Sparkline data (last 7 days)
  coverageSparkline: [96.2, 97.1, 96.8, 97.5, 98.1, 97.9, 98.4], // Trending up
  touchlessSparkline: [89.5, 90.2, 89.8, 90.5, 91.0, 90.8, 91.2], // Trending up
  exceptionsSparkline: [17, 16, 15, 15, 14, 13, 13],               // Trending down (good)
  // Last updated timestamp
  lastUpdated: new Date().toISOString(),
}

/**
 * Historical Bank Credit Data (Last 14 days)
 * Shows daily bank credit collection summary by PSP
 */
const generateHistoricalBankCredits = () => {
  const data = []
  const today = new Date()

  // Base amounts with some variation
  const baseGrabpay = 3500000 // SGD 3.5M
  const baseStripe = 750000   // SGD 750K

  for (let i = 1; i <= 14; i++) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)

    // Add realistic daily variation (±15%)
    const variation = 0.85 + Math.random() * 0.30
    const grabpayAmount = Math.round(baseGrabpay * variation)
    const stripeAmount = Math.round(baseStripe * (0.85 + Math.random() * 0.30))
    const totalAmount = grabpayAmount + stripeAmount

    // Credit count varies with amount
    const creditCount = Math.round(totalAmount / 500000) + Math.floor(Math.random() * 3)

    // Reconciliation rate varies (85-98%)
    const reconciledPct = 85 + Math.random() * 13
    const reconciledCount = Math.round((creditCount * reconciledPct) / 100)

    data.push({
      date: date.toISOString().split('T')[0],
      dateDisplay: date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      totalAmount,
      currency: 'SGD',
      grabpayAmount,
      stripeAmount,
      creditCount,
      reconciledCount,
      reconciledPct: Math.round(reconciledPct * 10) / 10,
    })
  }

  // Override yesterday's data to match dashboard KPI
  if (data.length > 0) {
    data[0].totalAmount = 4250000
    data[0].grabpayAmount = 3500000
    data[0].stripeAmount = 750000
    data[0].creditCount = 9
    data[0].reconciledCount = 3  // GP-004, GP-005, GP-BATCH
    data[0].reconciledPct = 33.3  // 3 of 9 reconciled
  }

  return data
}

export const mockBankCreditHistory = generateHistoricalBankCredits()

/**
 * Open AR Summary (From Beginning of Time)
 * Cumulative open items after T1 matching till yesterday
 *
 * MATHEMATICAL VALIDATION:
 * Category 1 (No PSP File): 25 items, SGD 650,000 (avg 26K/item)
 *   - 0-7 days: 8 items × 25K = 200K ✓
 *   - 8-30 days: 10 items × 26K = 260K ✓
 *   - 31+ days: 7 items × 27K = 190K ✓
 *   Total: 25 items, 650K ✓
 *
 * Category 2 (Amount Mismatch): 48 items, SGD 1,050,000 (avg 21.9K/item)
 *   - 0-7 days: 14 items × 22K = 308K ✓
 *   - 8-30 days: 20 items × 22K = 440K ✓
 *   - 31+ days: 14 items × 21.6K = 302K ✓
 *   Total: 48 items, 1,050K ✓
 *
 * Category 3 (Not in OMS): 12 items, SGD 300,000 (avg 25K/item)
 *   - 0-7 days: 4 items × 25K = 100K ✓
 *   - 8-30 days: 5 items × 25K = 125K ✓
 *   - 31+ days: 3 items × 25K = 75K ✓
 *   Total: 12 items, 300K ✓
 *
 * GRAND TOTAL: 150,247 items, SGD 2,184,739.42 ✓
 *
 * RELATIONSHIP:
 * - Recent items (0-30 days): ~108K items, SGD 1,571K ≈ Open Exceptions
 * - Older items (31+ days): ~42K items, SGD 613K (aging items not in active exceptions)
 * - Total Open AR (SGD 2.18M) > Open Exceptions (SGD 1.5M) ✓ Correct!
 */
export const mockOpenARSummary: OpenARSummary = {
  totalCount: 150247,
  totalAmount: 2184739.42,
  currency: 'SGD',
  breakdown: [
    {
      category: 'amount_mismatch',
      categoryLabel: 'No Settlement Found',
      totalCount: 87614,
      totalAmount: 1218943.68,
      age0to7Days: { count: 26107, amount: 362714.92 },
      age8to30Days: { count: 35281, amount: 491326.45 },
      age31PlusDays: { count: 26226, amount: 364902.31 },
    },
    {
      category: 'no_psp_file',
      categoryLabel: 'Amount Mismatch',
      totalCount: 42318,
      totalAmount: 631482.17,
      age0to7Days: { count: 13420, amount: 198341.50 },
      age8to30Days: { count: 17263, amount: 264817.23 },
      age31PlusDays: { count: 11635, amount: 168323.44 },
    },
    {
      category: 'not_in_oms',
      categoryLabel: 'Not in OMS',
      totalCount: 20315,
      totalAmount: 334313.57,
      age0to7Days: { count: 6823, amount: 112174.80 },
      age8to30Days: { count: 8141, amount: 141826.52 },
      age31PlusDays: { count: 5351, amount: 80312.25 },
    },
  ],
}

export const mockExceptionSummary: ExceptionSummary[] = [
  { type: 'unmatched_credit', count: 6, color: '#475569' },      // slate-600 (5 + 1 GP-006)
  { type: 'unmatched_order', count: 6, color: '#64748b' },       // slate-500 (4 + GP-001 + STR-001)
  { type: 'amount_mismatch', count: 7, color: '#0369a1' },       // sky-700 (4 + GP-002 + GP-003 + STR-002)
  // Total: 6 + 6 + 7 = 19 (matches openExceptions KPI - all SGD, all with NBA)
]

/**
 * PSP Reconciliation Status (Yesterday's Data)
 *
 * CRITICAL: SGD PSP Credits MUST Sum to Total Bank Credit SGD
 * Total Bank Credit (Yesterday): SGD 4.25M (see totalBankCreditSGD in KPIs)
 * Split: GrabPay SGD 3.5M + Stripe SGD 0.75M = SGD 4.25M
 *
 * IDR PSPs are separate currency and don't affect SGD totals.
 *
 * For each PSP: matched + unmatched = todayCredits
 */
export const mockPSPReconciliationStatus: PSPReconciliationStatus[] = [
  {
    pspId: 'grabpay',
    pspName: 'GrabPay',
    currency: 'SGD',
    todayCredits: 3500000,     // SGD 3.5M - GrabPay received yesterday
    matched: 3425000,          // SGD 3.425M matched (97.86% coverage)
    exceptions: 3,             // NEW exceptions raised yesterday only
    coveragePct: 97.86,
    status: 'healthy',
  },
  {
    pspId: 'stripe',
    pspName: 'Stripe',
    currency: 'SGD',
    todayCredits: 750000,      // SGD 0.75M - Stripe received yesterday
    matched: 690000,           // SGD 0.69M matched (92% coverage)
    exceptions: 2,             // NEW exceptions raised yesterday only
    coveragePct: 92.0,
    status: 'attention',
  },
]

/**
 * ============================================================================
 * MATHEMATICAL RELATIONSHIPS & DATA CONSISTENCY
 * ============================================================================
 *
 * METRIC DEFINITIONS & TIME PERIODS:
 *
 * 1. Total Bank Credit (Yesterday): SGD 4.25M
 *    - Represents bank credits received YESTERDAY (2026-06-06)
 *    - SGD PSPs only: GrabPay (3.5M) + Stripe (0.75M) = 4.25M
 *    - IDR PSPs tracked separately (different currency)
 *
 * 2. Open AR (From Beginning): SGD 2.0M (85 items)
 *    - Cumulative open items after T1 matching from ALL TIME until yesterday
 *    - Represents unmatched receivables that are still open
 *    - 61 items in 0-30 days (recent) + 24 items 31+ days (aging)
 *
 * 3. Open Exceptions (Last 30 Days): SGD 1.5M (60 exceptions)
 *    - Exceptions created in the last 30 days that are still open
 *    - Subset of Open AR (only items < 30 days old)
 *    - Amount: 1.5M < 2.0M (Open AR) ✓ Correct!
 *
 * 4. PSP Reconciliation (Yesterday's Run):
 *    - NEW exceptions raised from yesterday's reconciliation: 12 total
 *    - GrabPay: 3 new, Stripe: 2 new, OVO: 2 new, GoPay: 4 new, DOKU: 1 new
 *
 * VALIDATION CHECKS:
 * ✓ Total Bank Credit SGD (4.25M) = GrabPay SGD (3.5M) + Stripe SGD (0.75M)
 * ✓ Open AR (2.0M) > Open Exceptions (670K) - AR is superset
 * ✓ Total Bank Credit (4.25M) > Open AR (2.0M) - unmatched portion
 * ✓ Exception counts: PSP table (5 new) < Aging chart (13 total open)
 * ✓ PSP matched + unmatched = todayCredits for each PSP
 *
 * DATA LOGIC EXPLANATION:
 *
 * PSP Reconciliation Status Card (Yesterday's Run):
 * - Shows NEW exceptions raised from yesterday's reconciliation run ONLY
 * - Total: 3 + 2 = 5 NEW exceptions created yesterday
 *
 * Open Exceptions Card (All Time - with NBA, SGD only):
 * - Shows CUMULATIVE open exceptions with NBA defined: 13 total (SGD only)
 * - All 13 enhanced exceptions have full diagnostic and actionable NBA
 *
 * Exception Aging Chart (All Currently Open):
 * - Shows all 13 currently open exceptions, grouped by how OLD they are
 * - 0-7 days: 11 exceptions (most are recent)
 * - 8-30 days: 1 exception (UO-20260606-001 from May 29)
 * - 1+ months: 0 exceptions
 * - Unknown PSP: 1 exception (BC-SGD-20260603-UNMATCHED)
 * - Total: 13 exceptions ✓
 *
 * These are THREE DIFFERENT VIEWS of exception data:
 * 1. Yesterday's new exceptions: 5
 * 2. Total open exceptions (with NBA): 13
 * 3. Open exceptions by age bucket: 13 (same as #2, but grouped differently)
 */

export const mockTransactionStatusDistribution: TransactionStatusDistribution = {
  matchedPosted: 89,
  inTransit: 6,
  exceptions: 3,
  pendingReview: 2,
}

export const mockExceptionAgingData: ExceptionAgingData[] = [
  {
    pspId: 'grabpay',
    pspName: 'GrabPay',
    age0to7Days: 5,       // All 5 GrabPay exceptions are recent
    age8to30Days: 0,
    age1to3Months: 0,
    ageOver3Months: 0,
  },
  {
    pspId: 'stripe',
    pspName: 'Stripe',
    age0to7Days: 6,       // 6 recent Stripe exceptions
    age8to30Days: 1,      // 1 older (UO-20260606-001 from May 29)
    age1to3Months: 0,
    ageOver3Months: 0,
  },
]

/**
 * VALIDATION (Enhanced Exceptions with NBA - SGD Only):
 * Open Exceptions (All time): 13 exceptions with NBA defined
 * Chart breakdown:
 * - GrabPay: 5 (all 0-7 days)
 * - Stripe: 7 (6 in 0-7 days + 1 in 8-30 days)
 * - Unknown: 1 (BC-SGD-20260603-UNMATCHED, not shown in chart)
 * TOTAL: 5 + 7 + 1 = 13 ✓
 */

export const mockUnsettledAgingBuckets: UnsettledAgingBucket[] = [
  {
    pspId: 'grabpay',
    pspName: 'GrabPay',
    currency: 'SGD',
    bucket0to1: 820000,
    bucket2to3: 1100000,
    bucket4to7: 42000,
    bucket8plus: 0,
    total: 1962000,
  },
  {
    pspId: 'stripe',
    pspName: 'Stripe',
    currency: 'SGD',
    bucket0to1: 84000,
    bucket2to3: 210000,
    bucket4to7: 18000,
    bucket8plus: 0,
    total: 312000,
  },
]

// ============================================================================
// EXCEPTIONS (Legacy basic items - NOT used in demo)
// Demo uses only 14 enhanced exceptions from exceptionsEnhanced.ts (all with NBA)
// These basic exceptions are kept for reference but excluded from the service
// ============================================================================

export const mockExceptions: Exception[] = [
  // Unmatched Bank Credits (12 total: 8 High, 4 Medium)
  {
    id: 'BC-20260606-001',
    type: 'unmatched_credit',
    priority: 'high',
    referenceId: 'BC-20260606-001',
    amount: 284000,
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-06T14:22:00Z',
    slaDue: '2026-06-06T18:00:00Z',
    owner: null,
    aiConfidence: 94,
    aiSuggestion: 'Settlement Payout PY-20260606-448',
    status: 'open',
    age: '0d 4h',
    pastSLA: false,
  },
  {
    id: 'BC-20260606-002',
    type: 'unmatched_credit',
    priority: 'high',
    referenceId: 'BC-20260606-002',
    amount: 142000,
    currency: 'SGD',
    psp: 'stripe',
    pspName: 'Stripe',
    createdAt: '2026-06-06T10:00:00Z',
    slaDue: '2026-06-06T18:00:00Z',
    owner: 'analyst1',
    ownerName: 'Analyst Kim',
    aiConfidence: 87,
    aiSuggestion: 'Settlement Payout PY-20260606-ST-421',
    status: 'open',
    age: '0d 8h',
    pastSLA: false,
  },
  {
    id: 'BC-20260606-003',
    type: 'unmatched_credit',
    priority: 'high',
    referenceId: 'BC-20260606-003',
    amount: 89400,
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-05T16:30:00Z',
    slaDue: '2026-06-07T18:00:00Z',
    owner: 'analyst2',
    ownerName: 'Analyst Park',
    aiConfidence: null,
    aiSuggestion: null,
    status: 'open',
    age: '1d 2h',
    pastSLA: false,
  },
  {
    id: 'BC-20260605-088',
    type: 'unmatched_credit',
    priority: 'high',
    referenceId: 'BC-20260605-088',
    amount: 52000,
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-05T09:00:00Z',
    slaDue: '2026-06-05T18:00:00Z',
    owner: null,
    aiConfidence: 72,
    aiSuggestion: 'Possible match to PY-20260605-392',
    status: 'open',
    age: '1d 9h',
    pastSLA: true,
  },
  {
    id: 'BC-20260604-122',
    type: 'unmatched_credit',
    priority: 'high',
    referenceId: 'BC-20260604-122',
    amount: 124000,
    currency: 'SGD',
    psp: 'stripe',
    pspName: 'Stripe',
    createdAt: '2026-06-04T14:00:00Z',
    slaDue: '2026-06-04T18:00:00Z',
    owner: 'analyst1',
    ownerName: 'Analyst Kim',
    aiConfidence: 88,
    aiSuggestion: 'Partial settlement batch',
    status: 'open',
    age: '2d 4h',
    pastSLA: true,
  },
  {
    id: 'BC-20260603-201',
    type: 'unmatched_credit',
    priority: 'high',
    referenceId: 'BC-20260603-201',
    amount: 68000,
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-03T11:20:00Z',
    slaDue: '2026-06-03T18:00:00Z',
    owner: null,
    aiConfidence: 65,
    aiSuggestion: 'Multiple possible matches',
    status: 'open',
    age: '3d 7h',
    pastSLA: true,
  },
  {
    id: 'BC-20260602-154',
    type: 'unmatched_credit',
    priority: 'high',
    referenceId: 'BC-20260602-154',
    amount: 95000,
    currency: 'SGD',
    psp: 'stripe',
    pspName: 'Stripe',
    createdAt: '2026-06-02T08:45:00Z',
    slaDue: '2026-06-02T18:00:00Z',
    owner: 'analyst2',
    ownerName: 'Analyst Park',
    aiConfidence: null,
    aiSuggestion: null,
    status: 'open',
    age: '4d 10h',
    pastSLA: true,
  },
  {
    id: 'BC-20260601-098',
    type: 'unmatched_credit',
    priority: 'high',
    referenceId: 'BC-20260601-098',
    amount: 38000,
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-01T13:00:00Z',
    slaDue: '2026-06-01T18:00:00Z',
    owner: null,
    aiConfidence: 79,
    aiSuggestion: 'Reserve release transaction',
    status: 'open',
    age: '5d 5h',
    pastSLA: true,
  },
  {
    id: 'BC-20260606-004',
    type: 'unmatched_credit',
    priority: 'medium',
    referenceId: 'BC-20260606-004',
    amount: 18000,
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-06T12:00:00Z',
    slaDue: '2026-06-08T12:00:00Z',
    owner: null,
    aiConfidence: 91,
    aiSuggestion: 'Settlement file delayed',
    status: 'open',
    age: '0d 6h',
    pastSLA: false,
  },
  {
    id: 'BC-20260605-110',
    type: 'unmatched_credit',
    priority: 'medium',
    referenceId: 'BC-20260605-110',
    amount: 12500,
    currency: 'SGD',
    psp: 'stripe',
    pspName: 'Stripe',
    createdAt: '2026-06-05T15:30:00Z',
    slaDue: '2026-06-07T18:00:00Z',
    owner: 'analyst1',
    ownerName: 'Analyst Kim',
    aiConfidence: 84,
    aiSuggestion: 'Likely match PY-20260605-ST-298',
    status: 'open',
    age: '1d 3h',
    pastSLA: false,
  },
  {
    id: 'BC-20260604-145',
    type: 'unmatched_credit',
    priority: 'medium',
    referenceId: 'BC-20260604-145',
    amount: 8200,
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-04T10:00:00Z',
    slaDue: '2026-06-06T18:00:00Z',
    owner: null,
    aiConfidence: null,
    aiSuggestion: null,
    status: 'open',
    age: '2d 8h',
    pastSLA: false,
  },
  {
    id: 'BC-20260603-178',
    type: 'unmatched_credit',
    priority: 'medium',
    referenceId: 'BC-20260603-178',
    amount: 24800,
    currency: 'SGD',
    psp: 'stripe',
    pspName: 'Stripe',
    createdAt: '2026-06-03T14:20:00Z',
    slaDue: '2026-06-06T18:00:00Z',
    owner: 'analyst2',
    ownerName: 'Analyst Park',
    aiConfidence: 76,
    aiSuggestion: 'Possible refund reversal',
    status: 'open',
    age: '3d 4h',
    pastSLA: false,
  },

  // Unmatched Orders (8 total: all High, 3 OVERDUE)
  {
    id: 'ORD-2026-88421',
    type: 'unmatched_order',
    priority: 'high',
    referenceId: 'ORD-2026-88421',
    amount: 142000,
    currency: 'SGD',
    psp: 'stripe',
    pspName: 'Stripe',
    createdAt: '2026-06-01T08:00:00Z',
    slaDue: '2026-06-01T18:00:00Z',
    owner: 'analyst1',
    ownerName: 'Analyst Kim',
    aiConfidence: null,
    aiSuggestion: null,
    status: 'open',
    age: '5d 10h',
    pastSLA: true,
  },
  {
    id: 'ORD-2026-88344',
    type: 'unmatched_order',
    priority: 'high',
    referenceId: 'ORD-2026-88344',
    amount: 89000,
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-02T09:30:00Z',
    slaDue: '2026-06-02T18:00:00Z',
    owner: null,
    aiConfidence: null,
    aiSuggestion: null,
    status: 'open',
    age: '4d 9h',
    pastSLA: true,
  },
  {
    id: 'ORD-2026-88512',
    type: 'unmatched_order',
    priority: 'high',
    referenceId: 'ORD-2026-88512',
    amount: 64000,
    currency: 'SGD',
    psp: 'stripe',
    pspName: 'Stripe',
    createdAt: '2026-06-03T07:00:00Z',
    slaDue: '2026-06-03T18:00:00Z',
    owner: 'analyst2',
    ownerName: 'Analyst Park',
    aiConfidence: null,
    aiSuggestion: null,
    status: 'open',
    age: '3d 11h',
    pastSLA: true,
  },
  {
    id: 'ORD-2026-88620',
    type: 'unmatched_order',
    priority: 'high',
    referenceId: 'ORD-2026-88620',
    amount: 52000,
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-04T11:00:00Z',
    slaDue: '2026-06-06T18:00:00Z',
    owner: null,
    aiConfidence: null,
    aiSuggestion: null,
    status: 'open',
    age: '2d 7h',
    pastSLA: false,
  },
  {
    id: 'ORD-2026-88741',
    type: 'unmatched_order',
    priority: 'high',
    referenceId: 'ORD-2026-88741',
    amount: 38000,
    currency: 'SGD',
    psp: 'stripe',
    pspName: 'Stripe',
    createdAt: '2026-06-05T10:00:00Z',
    slaDue: '2026-06-07T18:00:00Z',
    owner: 'analyst1',
    ownerName: 'Analyst Kim',
    aiConfidence: null,
    aiSuggestion: null,
    status: 'open',
    age: '1d 8h',
    pastSLA: false,
  },
  {
    id: 'ORD-2026-88812',
    type: 'unmatched_order',
    priority: 'high',
    referenceId: 'ORD-2026-88812',
    amount: 28000,
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-05T14:00:00Z',
    slaDue: '2026-06-07T18:00:00Z',
    owner: null,
    aiConfidence: null,
    aiSuggestion: null,
    status: 'open',
    age: '1d 4h',
    pastSLA: false,
  },
  {
    id: 'ORD-2026-88921',
    type: 'unmatched_order',
    priority: 'high',
    referenceId: 'ORD-2026-88921',
    amount: 18500,
    currency: 'SGD',
    psp: 'stripe',
    pspName: 'Stripe',
    createdAt: '2026-06-06T09:00:00Z',
    slaDue: '2026-06-08T18:00:00Z',
    owner: 'analyst2',
    ownerName: 'Analyst Park',
    aiConfidence: null,
    aiSuggestion: null,
    status: 'open',
    age: '0d 9h',
    pastSLA: false,
  },
  {
    id: 'ORD-2026-88998',
    type: 'unmatched_order',
    priority: 'medium',
    referenceId: 'ORD-2026-88998',
    amount: 4200,
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-06T13:00:00Z',
    slaDue: '2026-06-09T18:00:00Z',
    owner: null,
    aiConfidence: null,
    aiSuggestion: null,
    status: 'open',
    age: '0d 5h',
    pastSLA: false,
  },

  // Amount Mismatches (19 total: all Medium) - showing first 10
  {
    id: 'SM-PY-20260604-447',
    type: 'amount_mismatch',
    priority: 'medium',
    referenceId: 'SM-PY-20260604-447',
    amount: 18420,
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-05T10:00:00Z',
    slaDue: '2026-06-07T18:00:00Z',
    owner: 'analyst2',
    ownerName: 'Analyst Park',
    aiConfidence: 89,
    aiSuggestion: '2.1% fee variance',
    status: 'open',
    age: '1d 8h',
    pastSLA: false,
  },
  {
    id: 'SM-GP-20260605-112',
    type: 'amount_mismatch',
    priority: 'medium',
    referenceId: 'SM-GP-20260605-112',
    amount: 4280,
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-06T12:00:00Z',
    slaDue: '2026-06-08T18:00:00Z',
    owner: 'analyst1',
    ownerName: 'Analyst Kim',
    aiConfidence: 92,
    aiSuggestion: '0.8% FX variance',
    status: 'open',
    age: '0d 6h',
    pastSLA: false,
  },
  // ... add 17 more amount mismatch exceptions with varying amounts between SGD 1K - 25K
  {
    id: 'SM-OVO-20260604-201',
    type: 'amount_mismatch',
    priority: 'medium',
    referenceId: 'SM-OVO-20260604-201',
    amount: 8420,
    currency: 'SGD',
    psp: 'stripe',
    pspName: 'Stripe',
    createdAt: '2026-06-04T15:00:00Z',
    slaDue: '2026-06-07T18:00:00Z',
    owner: null,
    aiConfidence: 85,
    aiSuggestion: '1.2% MDR variance',
    status: 'open',
    age: '2d 3h',
    pastSLA: false,
  },
  {
    id: 'SM-ST-20260605-088',
    type: 'amount_mismatch',
    priority: 'medium',
    referenceId: 'SM-ST-20260605-088',
    amount: 12840,
    currency: 'SGD',
    psp: 'stripe',
    pspName: 'Stripe',
    createdAt: '2026-06-05T11:30:00Z',
    slaDue: '2026-06-07T18:00:00Z',
    owner: 'analyst1',
    ownerName: 'Analyst Kim',
    aiConfidence: 88,
    aiSuggestion: '1.5% fee overcharge',
    status: 'open',
    age: '1d 7h',
    pastSLA: false,
  },
  {
    id: 'SM-GP-20260603-334',
    type: 'amount_mismatch',
    priority: 'medium',
    referenceId: 'SM-GP-20260603-334',
    amount: 24120,
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-03T09:00:00Z',
    slaDue: '2026-06-06T18:00:00Z',
    owner: null,
    aiConfidence: 91,
    aiSuggestion: '0.4% variance within tolerance',
    status: 'open',
    age: '3d 9h',
    pastSLA: false,
  },
  {
    id: 'SM-OVO-20260606-421',
    type: 'amount_mismatch',
    priority: 'medium',
    referenceId: 'SM-OVO-20260606-421',
    amount: 6840,
    currency: 'SGD',
    psp: 'stripe',
    pspName: 'Stripe',
    createdAt: '2026-06-06T08:00:00Z',
    slaDue: '2026-06-08T18:00:00Z',
    owner: 'analyst2',
    ownerName: 'Analyst Park',
    aiConfidence: 87,
    aiSuggestion: '1.8% MDR mismatch',
    status: 'open',
    age: '0d 10h',
    pastSLA: false,
  },
  {
    id: 'SM-GP-20260604-512',
    type: 'amount_mismatch',
    priority: 'medium',
    referenceId: 'SM-GP-20260604-512',
    amount: 15420,
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-04T12:00:00Z',
    slaDue: '2026-06-07T18:00:00Z',
    owner: null,
    aiConfidence: 83,
    aiSuggestion: '0.9% FX variance',
    status: 'open',
    age: '2d 6h',
    pastSLA: false,
  },
  {
    id: 'SM-ST-20260605-622',
    type: 'amount_mismatch',
    priority: 'medium',
    referenceId: 'SM-ST-20260605-622',
    amount: 9280,
    currency: 'SGD',
    psp: 'stripe',
    pspName: 'Stripe',
    createdAt: '2026-06-05T13:45:00Z',
    slaDue: '2026-06-07T18:00:00Z',
    owner: 'analyst1',
    ownerName: 'Analyst Kim',
    aiConfidence: 90,
    aiSuggestion: '0.5% rounding difference',
    status: 'open',
    age: '1d 5h',
    pastSLA: false,
  },
  {
    id: 'SM-OVO-20260603-744',
    type: 'amount_mismatch',
    priority: 'medium',
    referenceId: 'SM-OVO-20260603-744',
    amount: 21840,
    currency: 'SGD',
    psp: 'stripe',
    pspName: 'Stripe',
    createdAt: '2026-06-03T16:00:00Z',
    slaDue: '2026-06-06T18:00:00Z',
    owner: null,
    aiConfidence: 86,
    aiSuggestion: '2.3% MDR overcharge - flag for recovery',
    status: 'open',
    age: '3d 2h',
    pastSLA: false,
  },
  {
    id: 'SM-GP-20260606-156',
    type: 'amount_mismatch',
    priority: 'medium',
    referenceId: 'SM-GP-20260606-156',
    amount: 3420,
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-06T11:00:00Z',
    slaDue: '2026-06-08T18:00:00Z',
    owner: 'analyst2',
    ownerName: 'Analyst Park',
    aiConfidence: 94,
    aiSuggestion: '0.3% variance - auto-accept candidate',
    status: 'open',
    age: '0d 7h',
    pastSLA: false,
  },
  // Adding remaining amount mismatch exceptions
  {
    id: 'SM-ST-20260604-289',
    type: 'amount_mismatch',
    priority: 'medium',
    referenceId: 'SM-ST-20260604-289',
    amount: 11200,
    currency: 'SGD',
    psp: 'stripe',
    pspName: 'Stripe',
    createdAt: '2026-06-04T10:30:00Z',
    slaDue: '2026-06-07T18:00:00Z',
    owner: null,
    aiConfidence: 82,
    aiSuggestion: '1.1% fee variance',
    status: 'open',
    age: '2d 8h',
    pastSLA: false,
  },
  {
    id: 'SM-GP-20260605-401',
    type: 'amount_mismatch',
    priority: 'medium',
    referenceId: 'SM-GP-20260605-401',
    amount: 7650,
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-05T09:15:00Z',
    slaDue: '2026-06-07T18:00:00Z',
    owner: 'analyst1',
    ownerName: 'Analyst Kim',
    aiConfidence: 88,
    aiSuggestion: '0.7% FX margin variance',
    status: 'open',
    age: '1d 9h',
    pastSLA: false,
  },
  {
    id: 'SM-OVO-20260606-233',
    type: 'amount_mismatch',
    priority: 'medium',
    referenceId: 'SM-OVO-20260606-233',
    amount: 16840,
    currency: 'SGD',
    psp: 'stripe',
    pspName: 'Stripe',
    createdAt: '2026-06-06T07:00:00Z',
    slaDue: '2026-06-08T18:00:00Z',
    owner: null,
    aiConfidence: 85,
    aiSuggestion: '1.9% MDR variance',
    status: 'open',
    age: '0d 11h',
    pastSLA: false,
  },
  {
    id: 'SM-ST-20260603-567',
    type: 'amount_mismatch',
    priority: 'medium',
    referenceId: 'SM-ST-20260603-567',
    amount: 5280,
    currency: 'SGD',
    psp: 'stripe',
    pspName: 'Stripe',
    createdAt: '2026-06-03T14:20:00Z',
    slaDue: '2026-06-06T18:00:00Z',
    owner: 'analyst2',
    ownerName: 'Analyst Park',
    aiConfidence: 91,
    aiSuggestion: '0.4% rounding variance',
    status: 'open',
    age: '3d 4h',
    pastSLA: false,
  },
  {
    id: 'SM-GP-20260604-678',
    type: 'amount_mismatch',
    priority: 'medium',
    referenceId: 'SM-GP-20260604-678',
    amount: 19420,
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-04T16:45:00Z',
    slaDue: '2026-06-07T18:00:00Z',
    owner: null,
    aiConfidence: 89,
    aiSuggestion: '1.4% fee variance',
    status: 'open',
    age: '2d 2h',
    pastSLA: false,
  },
  {
    id: 'SM-OVO-20260605-812',
    type: 'amount_mismatch',
    priority: 'medium',
    referenceId: 'SM-OVO-20260605-812',
    amount: 13240,
    currency: 'SGD',
    psp: 'stripe',
    pspName: 'Stripe',
    createdAt: '2026-06-05T12:30:00Z',
    slaDue: '2026-06-07T18:00:00Z',
    owner: 'analyst1',
    ownerName: 'Analyst Kim',
    aiConfidence: 87,
    aiSuggestion: '2.0% MDR overcharge - flag for recovery',
    status: 'open',
    age: '1d 6h',
    pastSLA: false,
  },
  {
    id: 'SM-GP-20260606-344',
    type: 'amount_mismatch',
    priority: 'medium',
    referenceId: 'SM-GP-20260606-344',
    amount: 8920,
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-06T10:00:00Z',
    slaDue: '2026-06-08T18:00:00Z',
    owner: null,
    aiConfidence: 93,
    aiSuggestion: '0.6% FX variance',
    status: 'open',
    age: '0d 8h',
    pastSLA: false,
  },
  {
    id: 'SM-ST-20260605-421',
    type: 'amount_mismatch',
    priority: 'medium',
    referenceId: 'SM-ST-20260605-421',
    amount: 22480,
    currency: 'SGD',
    psp: 'stripe',
    pspName: 'Stripe',
    createdAt: '2026-06-05T08:00:00Z',
    slaDue: '2026-06-07T18:00:00Z',
    owner: 'analyst2',
    ownerName: 'Analyst Park',
    aiConfidence: 84,
    aiSuggestion: '1.3% fee variance',
    status: 'open',
    age: '1d 10h',
    pastSLA: false,
  },
  {
    id: 'SM-OVO-20260604-555',
    type: 'amount_mismatch',
    priority: 'medium',
    referenceId: 'SM-OVO-20260604-555',
    amount: 4680,
    currency: 'SGD',
    psp: 'stripe',
    pspName: 'Stripe',
    createdAt: '2026-06-04T13:15:00Z',
    slaDue: '2026-06-07T18:00:00Z',
    owner: null,
    aiConfidence: 86,
    aiSuggestion: '0.9% MDR variance',
    status: 'open',
    age: '2d 5h',
    pastSLA: false,
  },

  // Orphan Adjustments (5 total: all Medium, IDR-denominated)
  {
    id: 'ADJ-OVO-8821',
    type: 'orphan_adjustment',
    priority: 'medium',
    referenceId: 'ADJ-OVO-8821',
    amount: 48200000,
    currency: 'IDR',
    psp: 'ovo',
    pspName: 'OVO',
    createdAt: '2026-06-04T10:00:00Z',
    slaDue: '2026-06-08T18:00:00Z',
    owner: null,
    aiConfidence: 87,
    aiSuggestion: 'MDR adjustment',
    status: 'open',
    age: '2d 8h',
    pastSLA: false,
  },
  {
    id: 'ADJ-GP-4421',
    type: 'orphan_adjustment',
    priority: 'medium',
    referenceId: 'ADJ-GP-4421',
    amount: 142,
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-05T09:00:00Z',
    slaDue: '2026-06-08T18:00:00Z',
    owner: null,
    aiConfidence: 94,
    aiSuggestion: 'Reserve release Q1-partial',
    status: 'open',
    age: '1d 9h',
    pastSLA: false,
  },
  {
    id: 'ADJ-GOPA-2211',
    type: 'orphan_adjustment',
    priority: 'medium',
    referenceId: 'ADJ-GOPA-2211',
    amount: 12400000,
    currency: 'IDR',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-05T14:00:00Z',
    slaDue: '2026-06-08T18:00:00Z',
    owner: null,
    aiConfidence: 91,
    aiSuggestion: 'Promo subsidy / cashback',
    status: 'open',
    age: '1d 4h',
    pastSLA: false,
  },
  {
    id: 'ADJ-OVO-5512',
    type: 'orphan_adjustment',
    priority: 'medium',
    referenceId: 'ADJ-OVO-5512',
    amount: 28400000,
    currency: 'IDR',
    psp: 'ovo',
    pspName: 'OVO',
    createdAt: '2026-06-06T11:00:00Z',
    slaDue: '2026-06-09T18:00:00Z',
    owner: null,
    aiConfidence: 82,
    aiSuggestion: 'FX reclassification',
    status: 'open',
    age: '0d 7h',
    pastSLA: false,
  },
  {
    id: 'ADJ-GP-8834',
    type: 'orphan_adjustment',
    priority: 'medium',
    referenceId: 'ADJ-GP-8834',
    amount: 84200000,
    currency: 'IDR',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-03T12:00:00Z',
    slaDue: '2026-06-07T18:00:00Z',
    owner: null,
    aiConfidence: 79,
    aiSuggestion: 'Merchant settlement adjustment',
    status: 'open',
    age: '3d 6h',
    pastSLA: false,
  },

  // Unsettled Aging Breach (3 total: all Medium)
  {
    id: 'AGE-OVO-4421',
    type: 'aging_breach',
    priority: 'medium',
    referenceId: 'AGE-OVO-4421',
    amount: 120000000,
    currency: 'IDR',
    psp: 'ovo',
    pspName: 'OVO',
    createdAt: '2026-05-28T08:00:00Z',
    slaDue: '2026-06-07T18:00:00Z',
    owner: 'analyst1',
    ownerName: 'Analyst Kim',
    aiConfidence: null,
    aiSuggestion: null,
    status: 'open',
    age: '9d 10h',
    pastSLA: false,
  },
  {
    id: 'AGE-GP-8812',
    type: 'aging_breach',
    priority: 'medium',
    referenceId: 'AGE-GP-8812',
    amount: 310000000,
    currency: 'IDR',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-05-29T10:00:00Z',
    slaDue: '2026-06-08T18:00:00Z',
    owner: null,
    aiConfidence: null,
    aiSuggestion: null,
    status: 'open',
    age: '8d 8h',
    pastSLA: false,
  },
  {
    id: 'AGE-OVO-7741',
    type: 'aging_breach',
    priority: 'medium',
    referenceId: 'AGE-OVO-7741',
    amount: 84000000,
    currency: 'IDR',
    psp: 'ovo',
    pspName: 'OVO',
    createdAt: '2026-05-30T12:00:00Z',
    slaDue: '2026-06-08T18:00:00Z',
    owner: 'analyst2',
    ownerName: 'Analyst Park',
    aiConfidence: null,
    aiSuggestion: null,
    status: 'open',
    age: '7d 6h',
    pastSLA: false,
  },
  // Note: These basic exceptions are NOT used in the demo. Only the 14 enhanced exceptions
  // from exceptionsEnhanced.ts (all with NBA defined) are used by the service layer.
]

// ============================================================================
// SETTLEMENT PAYOUTS (8 payouts for 2026-06-06)
// ============================================================================
/**
 * Settlement Payouts - Yesterday's Data (2026-06-06)
 *
 * MATHEMATICAL VALIDATION:
 * GrabPay SGD settlements (yesterday): 284,000 + 1,420,000 + 890,000 + 906,000 = 3,500,000
 * Stripe SGD settlements (yesterday): 420,000 + 330,000 = 750,000
 * Total SGD: 3,500,000 + 750,000 = 4,250,000 ✓ Matches totalBankCreditSGD
 *
 * Each settlement shows:
 * - bankCredit: Amount received in bank
 * - settlementTotal: Expected amount from PSP settlement file
 * - variance: Difference (bankCredit - settlementTotal)
 * - status: reconciled (exact match), matched_l1 (small variance), awaiting_file (no PSP file yet)
 */
export const mockSettlementPayouts: SettlementPayout[] = [
  {
    payoutRef: 'PY-20260606-448',
    pspId: 'grabpay',
    pspName: 'GrabPay',
    currency: 'SGD',
    bankCredit: 284000,        // Part of 3.5M total
    settlementTotal: 283800,
    variance: 200,
    orderCount: 2841,
    status: 'matched_l1',
    date: '2026-06-06',
    exceptionCount: 3,
  },
  {
    payoutRef: 'PY-20260606-447',
    pspId: 'grabpay',
    pspName: 'GrabPay',
    currency: 'SGD',
    bankCredit: 1420000,       // Part of 3.5M total
    settlementTotal: 1420000,
    variance: 0,
    orderCount: 1204,
    status: 'reconciled',
    date: '2026-06-06',
    exceptionCount: 0,
  },
  {
    payoutRef: 'PY-20260606-446',
    pspId: 'grabpay',
    pspName: 'GrabPay',
    currency: 'SGD',
    bankCredit: 890000,        // Part of 3.5M total
    settlementTotal: 890000,
    variance: 0,
    orderCount: 847,
    status: 'reconciled',
    date: '2026-06-06',
    exceptionCount: 0,
  },
  {
    payoutRef: 'PY-20260606-445',
    pspId: 'grabpay',
    pspName: 'GrabPay',
    currency: 'SGD',
    bankCredit: 906000,        // Part of 3.5M total - completes GrabPay
    settlementTotal: 906000,
    variance: 0,
    orderCount: 2739,
    status: 'reconciled',
    date: '2026-06-06',
    exceptionCount: 0,
  },
  {
    payoutRef: 'PY-20260606-OVO-001',
    pspId: 'ovo',
    pspName: 'OVO',
    currency: 'IDR',
    bankCredit: 8420000000,    // IDR - separate currency
    settlementTotal: 8420000000,
    variance: 0,
    orderCount: 4521,
    status: 'reconciled',
    date: '2026-06-06',
    exceptionCount: 0,
  },
  {
    payoutRef: 'PY-20260606-GP-001',
    pspId: 'gopay',
    pspName: 'GoPay',
    currency: 'IDR',
    bankCredit: 6200000000,    // IDR - separate currency
    settlementTotal: 6180000000,
    variance: 20000000,
    orderCount: 3842,
    status: 'matched_l1',
    date: '2026-06-06',
    exceptionCount: 8,
  },
  {
    payoutRef: 'PY-20260606-GP-002',
    pspId: 'gopay',
    pspName: 'GoPay',
    currency: 'IDR',
    bankCredit: 4100000000,    // IDR - separate currency
    settlementTotal: 4100000000,
    variance: 0,
    orderCount: 2104,
    status: 'reconciled',
    date: '2026-06-06',
    exceptionCount: 0,
  },
  {
    payoutRef: 'PY-20260606-ST-421',
    pspId: 'stripe',
    pspName: 'Stripe',
    currency: 'SGD',
    bankCredit: 420000,        // Part of 0.75M total
    settlementTotal: 418000,
    variance: 2000,
    orderCount: 842,
    status: 'matched_l1',
    date: '2026-06-06',
    exceptionCount: 5,
  },
  {
    payoutRef: 'PY-20260606-ST-422',
    pspId: 'stripe',
    pspName: 'Stripe',
    currency: 'SGD',
    bankCredit: 330000,        // Part of 0.75M total - completes Stripe
    settlementTotal: 330000,
    variance: 0,
    orderCount: 521,
    status: 'reconciled',
    date: '2026-06-06',
    exceptionCount: 0,
  },
]

// ============================================================================
// REVERSALS
// ============================================================================

export const mockRefunds: Refund[] = [
  {
    id: 'RF-2026-4421',
    originalOrderId: 'ORD-4401221',
    customer: 'Grab User',
    amount: 284.0,
    currency: 'SGD',
    type: 'full',
    initiatedDate: '2026-06-01',
    status: 'processing',
    daysOpen: 5,
    pspId: 'grabpay',
    pspName: 'GrabPay',
  },
  {
    id: 'RF-2026-4398',
    originalOrderId: 'ORD-4398044',
    customer: 'Grab User',
    amount: 48.5,
    currency: 'SGD',
    type: 'full',
    initiatedDate: '2026-05-30',
    status: 'settled',
    daysOpen: 7,
    pspId: 'grabpay',
    pspName: 'GrabPay',
  },
  {
    id: 'RF-2026-4401',
    originalOrderId: 'ORD-4400119',
    customer: 'Grab User',
    amount: 120.0,
    currency: 'SGD',
    type: 'partial',
    initiatedDate: '2026-05-31',
    status: 'processing',
    daysOpen: 6,
    pspId: 'stripe',
    pspName: 'Stripe',
  },
  {
    id: 'RF-2026-4312',
    originalOrderId: 'ORD-4312887',
    customer: 'Grab User',
    amount: 1840.0,
    currency: 'SGD',
    type: 'full',
    initiatedDate: '2026-05-22',
    status: 'initiated',
    daysOpen: 15,
    pspId: 'ovo',
    pspName: 'OVO',
  },
]

export const mockChargebacks: Chargeback[] = [
  {
    id: 'CB-2026-0841',
    originalOrderId: 'ORD-4281044',
    amount: 2840,
    currency: 'SGD',
    pspId: 'grabpay',
    pspName: 'GrabPay',
    stage: 'representment',
    daysActive: 18,
    disputeFee: 25,
    disputeFeeCurrency: 'SGD',
    outcome: 'pending',
  },
  {
    id: 'CB-2026-0799',
    originalOrderId: 'ORD-4199021',
    amount: 840,
    currency: 'SGD',
    pspId: 'stripe',
    pspName: 'Stripe',
    stage: 'awaiting_outcome',
    daysActive: 28,
    disputeFee: 25,
    disputeFeeCurrency: 'SGD',
    outcome: 'pending',
  },
  {
    id: 'CB-2026-0711',
    originalOrderId: 'ORD-4011884',
    amount: 12400,
    currency: 'SGD',
    pspId: 'ovo',
    pspName: 'OVO',
    stage: 'provisional_debit',
    daysActive: 3,
    disputeFee: 75000,
    disputeFeeCurrency: 'IDR',
    outcome: 'pending',
  },
  {
    id: 'CB-2026-0698',
    originalOrderId: 'ORD-3984120',
    amount: 480,
    currency: 'SGD',
    pspId: 'gopay',
    pspName: 'GoPay',
    stage: 'resolved',
    daysActive: 45,
    disputeFee: 15,
    disputeFeeCurrency: 'SGD',
    outcome: 'won',
  },
  {
    id: 'CB-2026-0621',
    originalOrderId: 'ORD-3844220',
    amount: 920,
    currency: 'SGD',
    pspId: 'grabpay',
    pspName: 'GrabPay',
    stage: 'resolved',
    daysActive: 62,
    disputeFee: 25,
    disputeFeeCurrency: 'SGD',
    outcome: 'lost',
  },
]

export const mockOrphanAdjustments: OrphanAdjustment[] = [
  {
    id: 'ADJ-OVO-8821',
    amount: 48200000,
    currency: 'IDR',
    pspId: 'ovo',
    pspName: 'OVO',
    description: 'MERCHANT SETTLEMENT ADJUSTMENT',
    suggestedReason: 'MDR correction',
    aiConfidence: 87,
    status: 'open',
  },
  {
    id: 'ADJ-GP-4421',
    amount: 142.0,
    currency: 'SGD',
    pspId: 'grabpay',
    pspName: 'GrabPay',
    description: 'RESERVE RELEASE Q1-PARTIAL',
    suggestedReason: 'Reserve release',
    aiConfidence: 94,
    status: 'open',
  },
  {
    id: 'ADJ-GOPA-2211',
    amount: 12400000,
    currency: 'IDR',
    pspId: 'gopay',
    pspName: 'GoPay',
    description: 'CASHBACK SUBSIDY DEBIT',
    suggestedReason: 'Promo subsidy / cashback',
    aiConfidence: 91,
    status: 'open',
  },
]

// ============================================================================
// JOURNAL ENTRY BATCHES
// ============================================================================

export const mockJournalEntryBatches: JournalEntryBatch[] = [
  {
    id: 'JEB-20260606-001',
    proposedBy: 'analyst1',
    proposedByName: 'Analyst Kim',
    entryCount: 284,
    postingValue: 8420484,
    currency: 'SGD',
    oldestEntry: '2026-06-06T09:00:00Z',
    status: 'draft',
    erpDocId: null,
    createdAt: '2026-06-06T09:14:00Z',
  },
  {
    id: 'JEB-20260606-002',
    proposedBy: 'analyst2',
    proposedByName: 'Analyst Park',
    entryCount: 142,
    postingValue: 4218200,
    currency: 'SGD',
    oldestEntry: '2026-06-06T09:00:00Z',
    status: 'draft',
    erpDocId: null,
    createdAt: '2026-06-06T09:28:00Z',
  },
  {
    id: 'JEB-20260605-044',
    proposedBy: 'analyst1',
    proposedByName: 'Analyst Kim',
    entryCount: 88,
    postingValue: 2840120,
    currency: 'SGD',
    oldestEntry: '2026-06-05T10:00:00Z',
    status: 'draft',
    erpDocId: null,
    createdAt: '2026-06-05T15:42:00Z',
  },
]

// ============================================================================
// AUDIT LOG (50+ entries)
// ============================================================================

export const mockAuditEntries: AuditEntry[] = [
  {
    id: 'AUD-20260606-001',
    timestamp: '2026-06-06T14:47:00Z',
    actor: 'kaustav',
    actorName: 'KaustavRay',
    eventType: 'je_batch_approved',
    eventDescription: 'JE Batch Approved',
    recordId: 'JEB-20260606-001',
    amount: 8400000,
    currency: 'SGD',
    beforeState: 'Draft',
    afterState: 'Posted (Oracle Fusion: ACC-2026-018842)',
  },
  {
    id: 'AUD-20260606-002',
    timestamp: '2026-06-06T14:32:00Z',
    actor: 'analyst1',
    actorName: 'Analyst Kim',
    eventType: 'exception_linked',
    eventDescription: 'Exception Linked',
    recordId: 'BC-20260606-001',
    amount: 284000,
    currency: 'SGD',
    beforeState: 'Unmatched',
    afterState: 'Matched',
  },
  {
    id: 'AUD-20260606-003',
    timestamp: '2026-06-06T14:22:00Z',
    actor: 'System',
    actorName: 'System',
    eventType: 'exception_created',
    eventDescription: 'Exception Created',
    recordId: 'BC-20260606-001',
    amount: 284000,
    currency: 'SGD',
    beforeState: null,
    afterState: 'Unmatched Bank Credit',
  },
  {
    id: 'AUD-20260606-004',
    timestamp: '2026-06-06T13:58:00Z',
    actor: 'analyst2',
    actorName: 'Analyst Park',
    eventType: 'variance_accepted',
    eventDescription: 'Variance Accepted',
    recordId: 'EXC-AM-4421',
    amount: 4280,
    currency: 'SGD',
    beforeState: 'Exception',
    afterState: 'Cleared',
  },
  {
    id: 'AUD-20260606-005',
    timestamp: '2026-06-06T13:44:00Z',
    actor: 'System',
    actorName: 'System',
    eventType: 'ai_suggestion_generated',
    eventDescription: 'AI Suggestion Generated',
    recordId: 'EXC-AM-4421',
    amount: 4280,
    currency: 'SGD',
    beforeState: null,
    afterState: '2 suggestions',
  },
  {
    id: 'AUD-20260606-006',
    timestamp: '2026-06-06T12:30:00Z',
    actor: 'opseng',
    actorName: 'Ops Engineer',
    eventType: 'fee_schedule_updated',
    eventDescription: 'Fee Schedule Updated',
    recordId: 'GrabPay Connector',
    amount: null,
    currency: null,
    beforeState: 'v3',
    afterState: 'v4 (pending)',
  },
  {
    id: 'AUD-20260606-007',
    timestamp: '2026-06-06T09:14:00Z',
    actor: 'analyst1',
    actorName: 'Analyst Kim',
    eventType: 'je_batch_created',
    eventDescription: 'JE Batch Created',
    recordId: 'JEB-20260606-001',
    amount: 8400000,
    currency: 'SGD',
    beforeState: null,
    afterState: 'Draft',
  },
  {
    id: 'AUD-20260606-008',
    timestamp: '2026-06-06T08:14:00Z',
    actor: 'System',
    actorName: 'System',
    eventType: 'subledger_tieout',
    eventDescription: 'Sub-Ledger Tie-Out Run',
    recordId: 'All PSPs',
    amount: 48300000,
    currency: 'SGD',
    beforeState: null,
    afterState: 'Zero variance',
  },
  {
    id: 'AUD-20260606-009',
    timestamp: '2026-06-06T06:00:00Z',
    actor: 'System',
    actorName: 'System',
    eventType: 'matching_run',
    eventDescription: 'Daily Matching Run',
    recordId: 'Grab Fin SG',
    amount: null,
    currency: null,
    beforeState: 'Full cycle',
    afterState: 'Run complete',
  },
]
