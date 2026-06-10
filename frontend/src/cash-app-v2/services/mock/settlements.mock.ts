/**
 * Settlement Explorer - Mock Service Layer
 *
 * Provides data access methods for bank credits, settlements, and reconciliation
 */

import { getMockBankCredits } from '../../data/settlementsData'
import type { BankCreditRecordDetail, SettlementExplorerKPIs, SettlementOrderLine } from '../../types/domain'

// Simulate network delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// ============================================================================
// FILTERS
// ============================================================================

interface BankCreditsFilters {
  dateFrom?: string
  dateTo?: string
  psp?: string[]
  status?: string[]
  currency?: string
  bankAccount?: string
  unmatchedOnly?: boolean
}

interface KPIFilters {
  dateFrom?: string
  dateTo?: string
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const parseDate = (dateStr: string): Date => {
  return new Date(dateStr)
}

const isWithinDateRange = (valueDate: string, from?: string, to?: string): boolean => {
  const date = parseDate(valueDate)

  if (from && parseDate(from) > date) return false
  if (to && parseDate(to) < date) return false

  return true
}

const matchesPSP = (credit: BankCreditRecordDetail, pspFilter?: string[]): boolean => {
  if (!pspFilter || pspFilter.length === 0) return true

  // Check mapped PSP
  if (pspFilter.includes(credit.mappedPSP)) return true

  // Check PSPs in matched settlements
  const settlementPSPs = credit.matchedSettlements.map(s => s.pspId)
  return pspFilter.some(psp => settlementPSPs.includes(psp))
}

const matchesStatus = (credit: BankCreditRecordDetail, statusFilter?: string[]): boolean => {
  if (!statusFilter || statusFilter.length === 0) return true
  return statusFilter.includes(credit.reconciliationStatus)
}

const matchesCurrency = (credit: BankCreditRecordDetail, currencyFilter?: string): boolean => {
  if (!currencyFilter) return true
  return credit.currency === currencyFilter
}

const matchesBankAccount = (credit: BankCreditRecordDetail, accountFilter?: string): boolean => {
  if (!accountFilter) return true
  return credit.bankAccount.includes(accountFilter)
}

// ============================================================================
// SERVICE METHODS
// ============================================================================

export const settlementsService = {
  /**
   * Get bank credits with optional filters
   */
  async getBankCredits(filters: BankCreditsFilters = {}): Promise<BankCreditRecordDetail[]> {
    await delay(300) // Simulate network latency

    // Generate fresh data on each call - ensures dates are always current
    const bankCredits = getMockBankCredits()
    let filtered = [...bankCredits]

    // Apply date range filter
    if (filters.dateFrom || filters.dateTo) {
      filtered = filtered.filter(credit =>
        isWithinDateRange(credit.valueDate, filters.dateFrom, filters.dateTo)
      )
    }

    // Apply PSP filter
    if (filters.psp && filters.psp.length > 0) {
      filtered = filtered.filter(credit => matchesPSP(credit, filters.psp))
    }

    // Apply status filter
    if (filters.status && filters.status.length > 0) {
      filtered = filtered.filter(credit => matchesStatus(credit, filters.status))
    }

    // Apply currency filter
    if (filters.currency) {
      filtered = filtered.filter(credit => matchesCurrency(credit, filters.currency))
    }

    // Apply bank account filter
    if (filters.bankAccount) {
      filtered = filtered.filter(credit => matchesBankAccount(credit, filters.bankAccount))
    }

    // Apply unmatched only filter (includes both no file and variance cases)
    if (filters.unmatchedOnly) {
      filtered = filtered.filter(credit =>
        credit.reconciliationStatus === 'unmatched_no_psp_file' ||
        credit.reconciliationStatus === 'unmatched_variance'
      )
    }

    // Sort by value date descending (most recent first)
    filtered.sort((a, b) => parseDate(b.valueDate).getTime() - parseDate(a.valueDate).getTime())

    return filtered
  },

  /**
   * Get KPI metrics for Settlement Explorer
   */
  async getSettlementKPIs(filters: KPIFilters = {}): Promise<SettlementExplorerKPIs> {
    await delay(300)

    // Generate fresh data on each call - ensures dates are always current
    const bankCredits = getMockBankCredits()
    let credits = [...bankCredits]

    if (filters.dateFrom || filters.dateTo) {
      credits = credits.filter(credit =>
        isWithinDateRange(credit.valueDate, filters.dateFrom, filters.dateTo)
      )
    }

    // Calculate metrics
    const totalBankCredits = credits.length

    // L1 Matching KPIs
    const l1MatchedCount = credits.filter(c =>
      c.l1Status === 'l1_matched'
    ).length
    const l1MatchedPercent = totalBankCredits > 0
      ? Math.round((l1MatchedCount / totalBankCredits) * 100)
      : 0

    const l1UnmatchedNoFileCount = credits.filter(c =>
      c.l1Status === 'l1_unmatched_no_file'
    ).length

    const l1UnmatchedVarianceCount = credits.filter(c =>
      c.l1Status === 'l1_unmatched_variance'
    ).length

    // L2 Matching KPIs (only for L1 matched credits)
    const l1MatchedCredits = credits.filter(c => c.l1Status === 'l1_matched')
    const l2MatchedCount = l1MatchedCredits.filter(c =>
      c.l2Status === 'l2_matched'
    ).length

    const l2ExceptionCount = l1MatchedCredits.filter(c =>
      c.l2Status === 'l2_exception'
    ).length

    // L2 Parent Level: % of L1 matched credits that are also L2 matched
    const l2ParentMatchedPercent = l1MatchedCount > 0
      ? Math.round((l2MatchedCount / l1MatchedCount) * 100)
      : 0

    // L2 Line Item Level: Use settlement orderCount for totals (not individual line objects)
    // The visible sample lines only show 10 per settlement; orderCount has the real total
    let totalLineItems = 0
    let unmatchedLineItems = 0

    for (const credit of credits) {
      for (const settlement of credit.matchedSettlements) {
        totalLineItems += settlement.orderCount

        // Count unmatched/mismatched from visible lines
        for (const line of settlement.orderLines) {
          if (line.pspTxnId.startsWith('...')) continue
          if (line.matchStatus !== 'matched') {
            unmatchedLineItems++
          }
        }

        // Also count settlement-level exceptions that represent additional unmatched lines
        // beyond the visible sample (e.g., the settlement has 2000 orders but exceptions
        // exist for orders not in the visible 10)
        if (settlement.exceptions && settlement.exceptions.length > 0) {
          // Each exception roughly corresponds to some unmatched order lines
          // Use a realistic multiplier: each exception flag covers ~15-40 affected lines
          for (const exc of settlement.exceptions) {
            const affectedLines = exc.type === 'unmatched_order' ? 18 : exc.type === 'amount_mismatch' ? 24 : 12
            unmatchedLineItems += affectedLines
          }
        }
      }
    }

    const matchedLineItems = totalLineItems - unmatchedLineItems
    const lineItemMatchPercent = totalLineItems > 0
      ? Math.round((matchedLineItems / totalLineItems) * 1000) / 10 // One decimal place
      : 0

    // Overall reconciliation: L1 matched AND L2 matched
    const reconciledCount = credits.filter(c =>
      c.reconciliationStatus === 'reconciled'
    ).length
    const reconciledPercent = totalBankCredits > 0
      ? Math.round((reconciledCount / totalBankCredits) * 100)
      : 0

    // Credits with L2 exceptions
    const creditsWithExceptions = credits.filter(c =>
      c.l2ExceptionCount > 0
    ).length

    // Unmatched count (no file + variance)
    const unmatchedCount = l1UnmatchedNoFileCount + l1UnmatchedVarianceCount

    // Calculate total amounts by currency
    const totalBankCreditAmount = credits.reduce((acc, credit) => {
      const currency = credit.currency as 'SGD' | 'IDR' | 'MYR'
      acc[currency] = (acc[currency] || 0) + credit.amount
      return acc
    }, { SGD: 0, IDR: 0, MYR: 0 })

    // Calculate unmatched amounts by currency (no file + variance)
    const unmatchedAmount = credits
      .filter(c =>
        c.reconciliationStatus === 'unmatched_no_psp_file' ||
        c.reconciliationStatus === 'unmatched_variance'
      )
      .reduce((acc, credit) => {
        const currency = credit.currency as 'SGD' | 'IDR' | 'MYR'
        acc[currency] = (acc[currency] || 0) + credit.amount
        return acc
      }, { SGD: 0, IDR: 0, MYR: 0 })

    // Calculate total variance by currency
    // Includes:
    // - L1 Variance: Difference between bank credit and PSP net (when PSP file exists)
    // - No PSP File: Full bank credit amount (since entire amount is unreconciled)
    const totalVariance = credits
      .filter(c =>
        c.l1Status === 'l1_unmatched_variance' ||
        c.l1Status === 'l1_unmatched_no_file'
      )
      .reduce((acc, credit) => {
        const currency = credit.currency as 'SGD' | 'IDR' | 'MYR'
        // For no PSP file: use full bank credit amount
        // For variance: use the actual variance amount
        const varianceAmount = credit.l1Status === 'l1_unmatched_no_file'
          ? credit.amount  // Full bank credit amount
          : Math.abs(credit.l1Variance)  // Actual variance
        acc[currency] = (acc[currency] || 0) + varianceAmount
        return acc
      }, { SGD: 0, IDR: 0, MYR: 0 })

    // Calculate average reconciliation time (simplified)
    const avgReconciliationTime = '2.1 days'

    return {
      totalBankCredits,
      totalBankCreditAmount,

      // L1 Matching KPIs
      l1MatchedCount,
      l1MatchedPercent,
      l1UnmatchedNoFileCount,
      l1UnmatchedVarianceCount,

      // L2 Parent Level KPIs
      l2MatchedCount,
      l2ExceptionCount,
      l2ParentMatchedPercent,

      // L2 Line Item Level KPIs
      totalLineItems,
      matchedLineItems,
      unmatchedLineItems,
      lineItemMatchPercent,

      // Overall reconciliation
      reconciledCount,
      reconciledPercent,

      // Backward compatibility
      creditsWithExceptions,
      unmatchedCount,
      unmatchedAmount,
      totalVariance,
      avgReconciliationTime
    }
  },

  /**
   * Get detailed bank credit by ID
   */
  async getBankCreditDetail(creditId: string): Promise<BankCreditRecordDetail | null> {
    await delay(200)

    const bankCredits = getMockBankCredits()
    const credit = bankCredits.find(c => c.id === creditId)
    return credit || null
  },

  /**
   * Get order lines for a specific settlement
   */
  async getSettlementOrderLines(settlementRef: string): Promise<SettlementOrderLine[]> {
    await delay(200)

    const bankCredits = getMockBankCredits()
    // Find the settlement across all bank credits
    for (const credit of bankCredits) {
      for (const settlement of credit.matchedSettlements) {
        if (settlement.payoutRef === settlementRef) {
          return settlement.orderLines
        }
      }
    }

    return []
  }
}
