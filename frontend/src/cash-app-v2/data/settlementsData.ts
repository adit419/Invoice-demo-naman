/**
 * Settlement Explorer - Mock Data
 *
 * CRITICAL CONSTRAINTS:
 * - One legal entity = ONE currency only (Grab Singapore = SGD only)
 * - All calculations must be mathematically correct
 * - Gross - MDR - Tax - FX + Reserve Release = Net
 * - Sum of settlements = Bank credit (within ±0.5% tolerance)
 *
 * CONSISTENCY WITH DASHBOARD:
 * - Total Bank Credits (Yesterday): SGD 4,250,000
 * - GrabPay total: SGD 3,500,000
 * - Stripe total: SGD 750,000
 *
 * USE CASES COVERED:
 * - Multi-PSP credits (Adyen aggregating Stripe + PayPal): examples included
 * - Same-PSP batch credits (GrabPay AM/PM/EVE): examples included
 * - Single settlement credits (1:1): majority
 * - Unmatched credits: examples included
 */

import type {
  BankCreditRecordDetail,
  SettlementPayoutDetail,
  SettlementOrderLine,
  GrossToNetWaterfall,
  FeeBreakdown,
  Exception,
  L1Status,
  L2Status,
  ReconciliationStatus
} from '../types/domain'
import { getExceptionsForBankCredit } from './exceptionMapping'
import { mockExceptions } from './mockData'

// ============================================================================
// DATE HELPERS (Dynamic based on system time)
// ============================================================================

const getToday = (): Date => new Date()

const getYesterday = (): Date => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d
}

const getDaysAgo = (days: number): Date => {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d
}

const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0]
}

const formatDateDisplay = (date: Date): string => {
  const day = String(date.getDate()).padStart(2, '0')
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  const month = months[date.getMonth()]
  const year = String(date.getFullYear()).slice(-2)
  return `${day}${month}${year}`
}

const calculateAge = (valueDate: string): string => {
  const today = getToday()
  const value = new Date(valueDate)
  const diffTime = Math.abs(today.getTime() - value.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return `${diffDays}d`
}

// ============================================================================
// CALCULATION HELPERS
// ============================================================================

const round = (num: number): number => Math.round(num * 100) / 100

// ============================================================================
// L1/L2 STATUS CALCULATION HELPERS
// ============================================================================

/**
 * Calculate L1 Status based on Bank Credit vs PSP Net matching
 * L1 = Bank Credit to PSP Net matching
 *
 * L1 Matched: Bank Credit = PSP Net (zero variance)
 * L1 Variance: Bank Credit ≠ PSP Net (any variance exists)
 */
const calculateL1Status = (
  bankAmount: number,
  matchedSettlements: SettlementPayoutDetail[]
): { l1Status: L1Status; l1Variance: number; pspNetAmount: number | null; pspFileReceived: boolean } => {
  // No PSP file found
  if (matchedSettlements.length === 0) {
    return {
      l1Status: 'l1_unmatched_no_file',
      l1Variance: bankAmount,
      pspNetAmount: null,
      pspFileReceived: false
    }
  }

  // Calculate total PSP net amount
  const pspNetAmount = matchedSettlements.reduce(
    (sum, s) => sum + (s.settlementTotal || 0),
    0
  )

  const l1Variance = round(bankAmount - pspNetAmount)

  // L1 Matched only if variance is exactly zero (or negligible rounding < 1)
  if (Math.abs(l1Variance) < 1) {
    return {
      l1Status: 'l1_matched',
      l1Variance: 0,
      pspNetAmount,
      pspFileReceived: true
    }
  }

  // Any variance means L1 is unmatched
  return {
    l1Status: 'l1_unmatched_variance',
    l1Variance,
    pspNetAmount,
    pspFileReceived: true
  }
}

/**
 * Calculate L2 Status based on PSP items to Order level matching
 * L2 = PSP items match with order level details
 */
const calculateL2Status = (
  matchedSettlements: SettlementPayoutDetail[],
  l1Status: L1Status
): { l2Status: L2Status; l2ExceptionCount: number; l2ExceptionTypes: string[] } => {
  // If L1 is not matched, L2 is pending
  if (l1Status === 'l1_unmatched_no_file') {
    return {
      l2Status: 'l2_pending',
      l2ExceptionCount: 0,
      l2ExceptionTypes: []
    }
  }

  // Check all order lines for exceptions
  let exceptionCount = 0
  const exceptionTypes = new Set<string>()

  for (const settlement of matchedSettlements) {
    for (const orderLine of settlement.orderLines) {
      if (orderLine.matchStatus === 'no_order') {
        exceptionCount++
        exceptionTypes.add('unmatched_order')
      } else if (orderLine.matchStatus === 'mismatch') {
        exceptionCount++
        exceptionTypes.add('amount_mismatch')
      }
    }
    // Check settlement-level exceptions
    if (settlement.exceptions && settlement.exceptions.length > 0) {
      exceptionCount += settlement.exceptions.length
      for (const exc of settlement.exceptions) {
        exceptionTypes.add(exc.type)
      }
    }
  }

  if (exceptionCount > 0) {
    return {
      l2Status: 'l2_exception',
      l2ExceptionCount: exceptionCount,
      l2ExceptionTypes: Array.from(exceptionTypes)
    }
  }

  return {
    l2Status: 'l2_matched',
    l2ExceptionCount: 0,
    l2ExceptionTypes: []
  }
}

/**
 * Derive overall reconciliation status from L1 and L2
 */
const deriveReconciliationStatus = (
  l1Status: L1Status,
  l2Status: L2Status
): ReconciliationStatus => {
  if (l1Status === 'l1_unmatched_no_file') {
    return 'unmatched_no_psp_file'
  }

  if (l1Status === 'l1_unmatched_variance') {
    return 'unmatched_variance'
  }

  // L1 is matched
  if (l2Status === 'l2_matched') {
    return 'reconciled'
  }

  if (l2Status === 'l2_exception') {
    return 'matched_l1'
  }

  // L2 is pending (shouldn't happen if L1 is matched, but handle it)
  return 'partial'
}

const calculateWaterfall = (
  grossTotal: number,
  mdrRate: number,
  taxRate: number,
  fxRate: number,
  reserveRelease: number
): GrossToNetWaterfall => {
  const mdrFee = round(grossTotal * mdrRate)
  const taxOnMDR = round(mdrFee * taxRate)
  const fxMargin = round(grossTotal * fxRate)
  const expectedNet = round(grossTotal - mdrFee - taxOnMDR - fxMargin + reserveRelease)

  return {
    grossTransactionValue: grossTotal,
    mdrFee,
    mdrFeePercent: mdrRate * 100,
    taxOnMDR,
    taxOnMDRPercent: taxRate * 100,
    fxMargin,
    fxMarginPercent: fxRate * 100,
    rollingReserve: 0,
    rollingReservePercent: 0,
    reserveRelease,
    reserveReleasePercent: 0,
    expectedNet,
    actualNet: expectedNet,
    bankCredit: expectedNet,
    l1Variance: 0
  }
}

// ============================================================================
// MOCK ORDER LINES
// ============================================================================

/**
 * Generate realistic order lines that sum up EXACTLY to the total gross
 * Uses a seeded random for consistent regeneration
 */
const generateOrderLinesTotalGross = (
  pspPrefix: string,
  totalGross: number,
  orderCount: number,
  mdrRate: number,
  startNum: number = 1,
  sampleSize: number = 10,
  includeOmsData: boolean = true // Include OMS gross amounts for L2 comparison
): SettlementOrderLine[] => {
  const lines: SettlementOrderLine[] = []
  const avgGross = totalGross / orderCount
  let sampleGrossTotal = 0

  for (let i = 0; i < Math.min(sampleSize, orderCount); i++) {
    const variation = 0.5 + (Math.random() * 1.0)
    const gross = round(avgGross * variation)
    const mdr = round(gross * mdrRate)
    const net = round(gross - mdr)
    sampleGrossTotal += gross

    lines.push({
      pspTxnId: `${pspPrefix}-TXN-${String(startNum + i).padStart(6, '0')}`,
      orderId: `ORD-2026-${String(88000 + startNum + i).padStart(5, '0')}`,
      gross,
      mdr,
      net,
      matchStatus: 'matched',
      // L2 Comparison: OMS gross = PSP gross for matched orders
      omsGross: includeOmsData ? gross : undefined
    })
  }

  if (orderCount > sampleSize) {
    const remainingOrders = orderCount - sampleSize
    const remainingGross = totalGross - sampleGrossTotal
    const remainingMdr = round(remainingGross * mdrRate)
    const remainingNet = round(remainingGross - remainingMdr)

    lines.push({
      pspTxnId: `... ${remainingOrders} more orders`,
      orderId: '(Summary)',
      gross: remainingGross,
      mdr: remainingMdr,
      net: remainingNet,
      matchStatus: 'matched',
      omsGross: includeOmsData ? remainingGross : undefined
    })
  }

  return lines
}

/**
 * Generate realistic order lines for L2 reconciliation with exact gross total
 * Creates orders that sum up EXACTLY to the settlement gross amount
 * Generates full dataset for pagination/lazy loading
 */
const generateRealisticOrderLines = (
  pspPrefix: string,
  totalGross: number,
  orderCount: number,
  mdrRate: number,
  startNum: number = 1
): SettlementOrderLine[] => {
  const lines: SettlementOrderLine[] = []

  // Realistic order amount ranges for food delivery/rides
  // Food: SGD 15-80, Rides: SGD 8-45
  const minOrder = 15
  const maxOrder = 120

  // Generate random amounts that we'll normalize to sum to totalGross
  const rawAmounts: number[] = []
  let rawSum = 0

  for (let i = 0; i < orderCount; i++) {
    // Generate realistic order amounts with some variation
    const baseAmount = minOrder + Math.random() * (maxOrder - minOrder)
    rawAmounts.push(baseAmount)
    rawSum += baseAmount
  }

  // Normalize amounts to sum exactly to totalGross
  const scaleFactor = totalGross / rawSum
  let runningTotal = 0

  for (let i = 0; i < orderCount; i++) {
    let gross: number

    if (i === orderCount - 1) {
      // Last order gets the remainder to ensure exact total
      gross = round(totalGross - runningTotal)
    } else {
      gross = round(rawAmounts[i] * scaleFactor)
    }

    runningTotal += gross

    const mdr = round(gross * mdrRate)
    const net = round(gross - mdr)

    lines.push({
      pspTxnId: `${pspPrefix}-TXN-${String(startNum + i).padStart(6, '0')}`,
      orderId: `ORD-2026-${String(88000 + startNum + i).padStart(5, '0')}`,
      gross,
      mdr,
      net,
      matchStatus: 'matched',
      omsGross: gross // L2 matched: OMS gross = PSP gross
    })
  }

  return lines
}

/**
 * Inject some unmatched/mismatched order lines into the visible sample lines
 * to make L2 line-item KPIs realistic.
 * noOrderCount lines become 'no_order', mismatchCount lines become 'mismatch'.
 * Only modifies visible sample lines (not the summary "... N more orders" row).
 */
const injectL2Exceptions = (
  lines: SettlementOrderLine[],
  noOrderCount: number,
  mismatchCount: number
): SettlementOrderLine[] => {
  const result = [...lines]
  let injected = 0

  for (let i = 0; i < result.length && injected < noOrderCount; i++) {
    if (!result[i].pspTxnId.startsWith('...') && result[i].matchStatus === 'matched') {
      result[i] = { ...result[i], matchStatus: 'no_order', orderId: null, omsGross: null }
      injected++
    }
  }

  let mismatchInjected = 0
  for (let i = result.length - 1; i >= 0 && mismatchInjected < mismatchCount; i--) {
    if (!result[i].pspTxnId.startsWith('...') && result[i].matchStatus === 'matched') {
      const omsVariance = round(result[i].gross * (0.02 + Math.random() * 0.03)) // 2-5% off
      result[i] = {
        ...result[i],
        matchStatus: 'mismatch',
        omsGross: round(result[i].gross - omsVariance)
      }
      mismatchInjected++
    }
  }

  return result
}

/**
 * Create a lightweight settlement-level Exception reference
 */
const makeSettlementException = (
  id: string,
  type: Exception['type'],
  referenceId: string,
  amount: number,
  psp: string,
  pspName: string,
  suggestion: string
): Exception => ({
  id,
  type,
  priority: type === 'unmatched_order' ? 'medium' : 'high',
  referenceId,
  amount,
  currency: 'SGD',
  psp,
  pspName,
  createdAt: new Date(getYesterday().getTime() + 14 * 3600000).toISOString(), // yesterday 2pm
  slaDue: new Date(getYesterday().getTime() + 38 * 3600000).toISOString(), // yesterday + 24h
  owner: null,
  aiConfidence: 85,
  aiSuggestion: suggestion,
  status: 'open',
  age: '1d',
  pastSLA: true
})

// ============================================================================
// GRABPAY SETTLEMENTS - Total must = 3,500,000 SGD
// ============================================================================

// GrabPay Settlement 1: 500K
// GP_500K: 500000 - 12500 (MDR) - 875 (Tax) - 1500 (FX) = 485,125
const settlement_GP_500K: SettlementPayoutDetail = {
  payoutRef: `PY-GP-${formatDateDisplay(getYesterday())}-001`,
  pspId: 'grabpay',
  pspName: 'GrabPay',
  currency: 'SGD',
  bankCredit: 485125.00,
  settlementTotal: 485125.00,
  variance: 0,
  orderCount: 2000,
  status: 'reconciled',
  date: formatDate(getYesterday()),
  grossToNet: calculateWaterfall(500000, 0.025, 0.07, 0.003, 0),
  orderLines: injectL2Exceptions(
    generateOrderLinesTotalGross('GP001', 500000, 2000, 0.025, 1, 10),
    2, // 2 no_order (unmatched PSP refund lines)
    1  // 1 mismatch (promo discount diff)
  ),
  feeBreakdown: {
    components: [
      { name: 'MDR', contractRate: '2.50%', actualRate: '2.50%', variance: '0%', status: 'match' },
      { name: 'GST', contractRate: '7.00%', actualRate: '7.00%', variance: '0%', status: 'match' }
    ]
  },
  exceptions: [
    makeSettlementException('SE-GP001-UO-001', 'unmatched_order', 'GP001-TXN-000001', 342, 'grabpay', 'GrabPay', 'PSP refund with no OMS match - check voided orders')
  ]
}

const credit_GP_001: BankCreditRecordDetail = (() => {
  const amount = 487350.00
  const settlements = [settlement_GP_500K]
  const { l1Status, l1Variance, pspNetAmount, pspFileReceived } = calculateL1Status(amount, settlements)
  const { l2Status, l2ExceptionCount, l2ExceptionTypes } = calculateL2Status(settlements, l1Status)
  const reconciliationStatus = deriveReconciliationStatus(l1Status, l2Status)

  return {
    id: `BC-GP-${formatDateDisplay(getYesterday())}-001`,
    bankAccount: 'DBS-SGD-****4521',
    valueDate: formatDate(getYesterday()),
    amount,
    currency: 'SGD',
    narration: `GRABPAY PTE LTD ${settlement_GP_500K.payoutRef}`,
    payoutRef: settlement_GP_500K.payoutRef,
    mappedPSP: 'grabpay',
    matchedSettlements: settlements,
    l1Status,
    l1Variance,
    l2Status,
    l2ExceptionCount,
    l2ExceptionTypes,
    reconciliationStatus,
    variance: l1Variance,
    variancePercent: round((Math.abs(l1Variance) / amount) * 100),
    mappingConfidence: l1Status === 'l1_matched' ? 100 : l1Status === 'l1_unmatched_variance' ? 75 : 0,
    age: calculateAge(formatDate(getYesterday())),
    exceptions: [],
    pspNetAmount,
    pspFileReceived
  }
})()

// GrabPay Settlement 2: 520K
// GP_520K: 520000 - 13000 (MDR) - 910 (Tax) - 1560 (FX) = 504,530
const settlement_GP_520K: SettlementPayoutDetail = {
  payoutRef: `PY-GP-${formatDateDisplay(getYesterday())}-002`,
  pspId: 'grabpay',
  pspName: 'GrabPay',
  currency: 'SGD',
  bankCredit: 504530.00,
  settlementTotal: 504530.00,
  variance: 0,
  orderCount: 2150,
  status: 'reconciled',
  date: formatDate(getYesterday()),
  grossToNet: calculateWaterfall(520000, 0.025, 0.07, 0.003, 0),
  orderLines: injectL2Exceptions(
    generateOrderLinesTotalGross('GP002', 520000, 2150, 0.025, 3000, 10),
    1, // 1 no_order
    1  // 1 mismatch (promo discount)
  ),
  feeBreakdown: {
    components: [
      { name: 'MDR', contractRate: '2.50%', actualRate: '2.50%', variance: '0%', status: 'match' },
      { name: 'GST', contractRate: '7.00%', actualRate: '7.00%', variance: '0%', status: 'match' }
    ]
  },
  exceptions: [
    makeSettlementException('SE-GP002-AM-001', 'amount_mismatch', 'GP002-TXN-003009', 18.75, 'grabpay', 'GrabPay', 'Promo discount GRAB15 not reflected in PSP file')
  ]
}

const credit_GP_002: BankCreditRecordDetail = (() => {
  const amount = 506844.00
  const settlements = [settlement_GP_520K]
  const { l1Status, l1Variance, pspNetAmount, pspFileReceived } = calculateL1Status(amount, settlements)
  const { l2Status, l2ExceptionCount, l2ExceptionTypes } = calculateL2Status(settlements, l1Status)
  const reconciliationStatus = deriveReconciliationStatus(l1Status, l2Status)

  return {
    id: `BC-GP-${formatDateDisplay(getYesterday())}-002`,
    bankAccount: 'DBS-SGD-****4521',
    valueDate: formatDate(getYesterday()),
    amount,
    currency: 'SGD',
    narration: `GRABPAY PTE LTD ${settlement_GP_520K.payoutRef}`,
    payoutRef: settlement_GP_520K.payoutRef,
    mappedPSP: 'grabpay',
    matchedSettlements: settlements,
    l1Status,
    l1Variance,
    l2Status,
    l2ExceptionCount,
    l2ExceptionTypes,
    reconciliationStatus,
    variance: l1Variance,
    variancePercent: round((Math.abs(l1Variance) / amount) * 100),
    mappingConfidence: l1Status === 'l1_matched' ? 100 : l1Status === 'l1_unmatched_variance' ? 75 : 0,
    age: calculateAge(formatDate(getYesterday())),
    exceptions: [],
    pspNetAmount,
    pspFileReceived
  }
})()

// GP_480K_PARTIAL: L1 Variance case for BC-GP-003
// PSP Net: 480000 - 12000 (MDR 2.5%) - 840 (Tax 7%) - 1440 (FX 0.3%) = 465,720
// Bank Credit: 467,880 (received more than PSP says)
// L1 Variance: 467,880 - 465,720 = 2,160
const settlement_GP_480K_PARTIAL: SettlementPayoutDetail = {
  payoutRef: `PY-GP-${formatDateDisplay(getYesterday())}-003`,
  pspId: 'grabpay',
  pspName: 'GrabPay',
  currency: 'SGD',
  bankCredit: 467880.00,
  settlementTotal: 465720.00, // PSP Net from waterfall
  variance: 2160.00, // Bank - PSP = 467880 - 465720
  orderCount: 1900,
  status: 'partial',
  date: formatDate(getYesterday()),
  grossToNet: calculateWaterfall(480000, 0.025, 0.07, 0.003, 0),
  orderLines: generateOrderLinesTotalGross('GP003', 480000, 1900, 0.025, 5000, 10),
  feeBreakdown: {
    components: [
      { name: 'MDR', contractRate: '2.50%', actualRate: '2.50%', variance: '0%', status: 'match' },
      { name: 'GST', contractRate: '7.00%', actualRate: '7.00%', variance: '0%', status: 'match' }
    ]
  },
  exceptions: []
}

// GP_003: L1 Variance case - Bank credit has variance with PSP net
const credit_GP_003: BankCreditRecordDetail = (() => {
  const amount = 467880.00
  const settlements = [settlement_GP_480K_PARTIAL]
  // This is an L1 variance case - Bank credit doesn't match PSP net
  const l1Status: L1Status = 'l1_unmatched_variance'
  const l1Variance = round(amount - (settlements[0].settlementTotal || 0)) // 467880 - 456300 = 11580
  const l2Status: L2Status = 'l2_pending' // L2 is pending since L1 has variance
  const reconciliationStatus: ReconciliationStatus = 'unmatched_variance'

  return {
    id: `BC-GP-${formatDateDisplay(getYesterday())}-003`,
    bankAccount: 'DBS-SGD-****4521',
    valueDate: formatDate(getYesterday()),
    amount,
    currency: 'SGD',
    narration: `GRABPAY PTE LTD ${settlement_GP_480K_PARTIAL.payoutRef}`,
    payoutRef: settlement_GP_480K_PARTIAL.payoutRef,
    mappedPSP: 'grabpay',
    matchedSettlements: settlements,
    l1Status,
    l1Variance,
    l2Status,
    l2ExceptionCount: 0,
    l2ExceptionTypes: [],
    reconciliationStatus,
    variance: l1Variance,
    variancePercent: round((Math.abs(l1Variance) / amount) * 100),
    mappingConfidence: 75,
    age: calculateAge(formatDate(getYesterday())),
    exceptions: [],
    pspNetAmount: settlements[0].settlementTotal,
    pspFileReceived: true
  }
})()

// GrabPay Settlement 4: 510K - Large order count for realistic L2 view
// Waterfall: 510000 - 12750 (MDR 2.5%) - 892.50 (Tax 7%) - 1530 (FX 0.3%) = 494,827.50
const settlement_GP_510K: SettlementPayoutDetail = {
  payoutRef: `PY-GP-${formatDateDisplay(getYesterday())}-004`,
  pspId: 'grabpay',
  pspName: 'GrabPay',
  currency: 'SGD',
  bankCredit: 494827.50,
  settlementTotal: 494827.50,
  variance: 0,
  orderCount: 8500, // Realistic daily order count
  status: 'reconciled',
  date: formatDate(getYesterday()),
  grossToNet: calculateWaterfall(510000, 0.025, 0.07, 0.003, 0), // No reserve release
  // Generate realistic order lines that sum exactly to gross (510000)
  orderLines: generateRealisticOrderLines('GP004', 510000, 8500, 0.025, 7000),
  feeBreakdown: {
    components: [
      { name: 'MDR', contractRate: '2.50%', actualRate: '2.50%', variance: '0%', status: 'match' },
      { name: 'GST', contractRate: '7.00%', actualRate: '7.00%', variance: '0%', status: 'match' }
    ]
  },
  exceptions: []
}

const credit_GP_004: BankCreditRecordDetail = (() => {
  const amount = 497109.00
  const settlements = [settlement_GP_510K]
  const { l1Status, l1Variance, pspNetAmount, pspFileReceived } = calculateL1Status(amount, settlements)
  const { l2Status, l2ExceptionCount, l2ExceptionTypes } = calculateL2Status(settlements, l1Status)
  const reconciliationStatus = deriveReconciliationStatus(l1Status, l2Status)

  return {
    id: `BC-GP-${formatDateDisplay(getYesterday())}-004`,
    bankAccount: 'DBS-SGD-****4521',
    valueDate: formatDate(getYesterday()),
    amount,
    currency: 'SGD',
    narration: `GRABPAY PTE LTD ${settlement_GP_510K.payoutRef}`,
    payoutRef: settlement_GP_510K.payoutRef,
    mappedPSP: 'grabpay',
    matchedSettlements: settlements,
    l1Status,
    l1Variance,
    l2Status,
    l2ExceptionCount,
    l2ExceptionTypes,
    reconciliationStatus,
    variance: l1Variance,
    variancePercent: round((Math.abs(l1Variance) / amount) * 100),
    mappingConfidence: l1Status === 'l1_matched' ? 100 : 75,
    age: calculateAge(formatDate(getYesterday())),
    exceptions: [],
    pspNetAmount,
    pspFileReceived
  }
})()

// GrabPay Settlement 5: 490K (Fully reconciled - L1 and L2 matched)
// Large order count for realistic L2 view with 10k+ orders
// Waterfall: 490000 - 12250 (MDR 2.5%) - 857.50 (Tax 7%) - 1470 (FX 0.3%) = 475,422.50
const settlement_GP_490K: SettlementPayoutDetail = {
  payoutRef: `PY-GP-${formatDateDisplay(getYesterday())}-005`,
  pspId: 'grabpay',
  pspName: 'GrabPay',
  currency: 'SGD',
  bankCredit: 475422.50,
  settlementTotal: 475422.50, // No variance - matches bank credit exactly
  variance: 0,
  orderCount: 10000, // 10k orders for realistic daily volume
  status: 'reconciled',
  date: formatDate(getYesterday()),
  grossToNet: calculateWaterfall(490000, 0.025, 0.07, 0.003, 0),
  // Generate realistic order lines that sum exactly to gross (490000)
  orderLines: generateRealisticOrderLines('GP005', 490000, 10000, 0.025, 9000),
  feeBreakdown: {
    components: [
      { name: 'MDR', contractRate: '2.50%', actualRate: '2.50%', variance: '0%', status: 'match' },
      { name: 'GST', contractRate: '7.00%', actualRate: '7.00%', variance: '0%', status: 'match' }
    ]
  },
  exceptions: []
}

// GP_005: Fully reconciled - L1 matched (zero variance) AND L2 matched (all orders matched)
// Bank credit = PSP Net = 475,422.50 (from GP-490K settlement)
const credit_GP_005: BankCreditRecordDetail = (() => {
  const amount = 475422.50
  const settlements = [settlement_GP_490K]
  // L1 is matched: Bank Credit = PSP Net (zero variance)
  const l1Status: L1Status = 'l1_matched'
  const l1Variance = 0 // No L1 variance - Bank = PSP Net
  // L2 is also matched: All PSP order lines match with OMS orders
  const l2Status: L2Status = 'l2_matched'
  const l2ExceptionCount = 0 // No L2 exceptions
  const l2ExceptionTypes: string[] = []
  const reconciliationStatus: ReconciliationStatus = 'reconciled' // Fully reconciled

  return {
    id: `BC-GP-${formatDateDisplay(getYesterday())}-005`,
    bankAccount: 'DBS-SGD-****4521',
    valueDate: formatDate(getYesterday()),
    amount,
    currency: 'SGD',
    narration: `GRABPAY PTE LTD ${settlement_GP_490K.payoutRef}`,
    payoutRef: settlement_GP_490K.payoutRef,
    mappedPSP: 'grabpay',
    matchedSettlements: settlements,
    l1Status,
    l1Variance,
    l2Status,
    l2ExceptionCount,
    l2ExceptionTypes,
    reconciliationStatus,
    variance: l1Variance,
    variancePercent: 0,
    mappingConfidence: 100,
    age: calculateAge(formatDate(getYesterday())),
    exceptions: [],
    pspNetAmount: amount, // PSP Net = Bank Credit (no variance)
    pspFileReceived: true
  }
})()

// GrabPay Batch Settlement (Morning + Afternoon + Evening)
// GP-AM: 197500 - 4937.50 (MDR 2.5%) - 345.63 (Tax 7%) - 592.50 (FX 0.3%) = 191,624.37
const settlement_GP_AM: SettlementPayoutDetail = {
  payoutRef: `PY-GP-${formatDateDisplay(getYesterday())}-AM`,
  pspId: 'grabpay',
  pspName: 'GrabPay',
  currency: 'SGD',
  bankCredit: null,
  settlementTotal: 191624.37,
  variance: null,
  orderCount: 800,
  status: 'reconciled',
  date: formatDate(getYesterday()),
  grossToNet: calculateWaterfall(197500, 0.025, 0.07, 0.003, 0),
  orderLines: generateOrderLinesTotalGross('GP-AM', 197500, 800, 0.025, 11000, 10),
  feeBreakdown: {
    components: [
      { name: 'MDR', contractRate: '2.50%', actualRate: '2.50%', variance: '0%', status: 'match' },
      { name: 'GST', contractRate: '7.00%', actualRate: '7.00%', variance: '0%', status: 'match' }
    ]
  },
  exceptions: []
}

// GP-PM: 260000 - 6500 (MDR 2.5%) - 455 (Tax 7%) - 780 (FX 0.3%) = 252,265
const settlement_GP_PM: SettlementPayoutDetail = {
  payoutRef: `PY-GP-${formatDateDisplay(getYesterday())}-PM`,
  pspId: 'grabpay',
  pspName: 'GrabPay',
  currency: 'SGD',
  bankCredit: null,
  settlementTotal: 252265.00,
  variance: null,
  orderCount: 1200,
  status: 'reconciled',
  date: formatDate(getYesterday()),
  grossToNet: calculateWaterfall(260000, 0.025, 0.07, 0.003, 0),
  orderLines: generateOrderLinesTotalGross('GP-PM', 260000, 1200, 0.025, 12000, 10),
  feeBreakdown: {
    components: [
      { name: 'MDR', contractRate: '2.50%', actualRate: '2.50%', variance: '0%', status: 'match' },
      { name: 'GST', contractRate: '7.00%', actualRate: '7.00%', variance: '0%', status: 'match' }
    ]
  },
  exceptions: []
}

// GP-EVE: 130000 - 3250 (MDR 2.5%) - 227.50 (Tax 7%) - 390 (FX 0.3%) = 126,132.50
const settlement_GP_EVE: SettlementPayoutDetail = {
  payoutRef: `PY-GP-${formatDateDisplay(getYesterday())}-EVE`,
  pspId: 'grabpay',
  pspName: 'GrabPay',
  currency: 'SGD',
  bankCredit: null,
  settlementTotal: 126132.50,
  variance: null,
  orderCount: 600,
  status: 'reconciled',
  date: formatDate(getYesterday()),
  grossToNet: calculateWaterfall(130000, 0.025, 0.07, 0.003, 0),
  orderLines: generateOrderLinesTotalGross('GP-EVE', 130000, 600, 0.025, 13000, 10),
  feeBreakdown: {
    components: [
      { name: 'MDR', contractRate: '2.50%', actualRate: '2.50%', variance: '0%', status: 'match' },
      { name: 'GST', contractRate: '7.00%', actualRate: '7.00%', variance: '0%', status: 'match' }
    ]
  },
  exceptions: []
}

// GP_BATCH: Multi-settlement batch (AM + PM + EVE) - fully reconciled
const credit_GP_BATCH: BankCreditRecordDetail = (() => {
  const amount = 571921.87
  const settlements = [settlement_GP_AM, settlement_GP_PM, settlement_GP_EVE]
  const { l1Status, l1Variance, pspNetAmount, pspFileReceived } = calculateL1Status(amount, settlements)
  const { l2Status, l2ExceptionCount, l2ExceptionTypes } = calculateL2Status(settlements, l1Status)
  const reconciliationStatus = deriveReconciliationStatus(l1Status, l2Status)

  return {
    id: `BC-GP-${formatDateDisplay(getYesterday())}-BATCH`,
    bankAccount: 'DBS-SGD-****4521',
    valueDate: formatDate(getYesterday()),
    amount,
    currency: 'SGD',
    narration: `GRABPAY PTE LTD BATCH SETTLEMENT ${formatDateDisplay(getYesterday())}`,
    payoutRef: `PY-GP-${formatDateDisplay(getYesterday())}-BATCH`,
    mappedPSP: 'grabpay',
    matchedSettlements: settlements,
    l1Status,
    l1Variance,
    l2Status,
    l2ExceptionCount,
    l2ExceptionTypes,
    reconciliationStatus,
    variance: l1Variance,
    variancePercent: round((Math.abs(l1Variance) / amount) * 100),
    mappingConfidence: l1Status === 'l1_matched' ? 100 : 75,
    age: calculateAge(formatDate(getYesterday())),
    exceptions: [],
    pspNetAmount,
    pspFileReceived
  }
})()

// GrabPay Credit 6: L1 UNMATCHED - No PSP File
// Bank received money but NO PSP settlement file found!
// This is a critical L1 failure scenario that needs investigation
// Amount: 502,193.13 (adjusts GrabPay total to 3,500,000)
const credit_GP_006: BankCreditRecordDetail = (() => {
  const amount = 502193.13
  const settlements: SettlementPayoutDetail[] = []
  // L1 unmatched - no PSP file
  const l1Status: L1Status = 'l1_unmatched_no_file'
  const l1Variance = amount // Full amount is unmatched variance
  const l2Status: L2Status = 'l2_pending' // Can't do L2 matching without PSP file
  const reconciliationStatus: ReconciliationStatus = 'unmatched_no_psp_file'

  return {
    id: `BC-GP-${formatDateDisplay(getYesterday())}-006`,
    bankAccount: 'DBS-SGD-****4521',
    valueDate: formatDate(getYesterday()),
    amount,
    currency: 'SGD',
    narration: `GRABPAY PTE LTD SETTLEMENT`,
    payoutRef: null, // No PSP file reference found!
    mappedPSP: 'grabpay',
    matchedSettlements: settlements,
    l1Status,
    l1Variance,
    l2Status,
    l2ExceptionCount: 0,
    l2ExceptionTypes: [],
    reconciliationStatus,
    variance: l1Variance, // Full amount is unmatched
    variancePercent: 100,
    mappingConfidence: 0, // Zero confidence - can't match to any PSP file
    age: calculateAge(formatDate(getYesterday())),
    exceptions: [],
    pspNetAmount: null,
    pspFileReceived: false
  }
})()

// ============================================================================
// STRIPE SETTLEMENTS - Total must = 750,000 SGD
// ============================================================================

// Stripe Settlement 1: 380K
// STR-380K: 380000 - 11020 (MDR 2.9%) - 771.40 (Tax 7%) - 1900 (FX 0.5%) = 366,308.60
const settlement_STR_380K: SettlementPayoutDetail = {
  payoutRef: `PY-STR-${formatDateDisplay(getYesterday())}-001`,
  pspId: 'stripe',
  pspName: 'Stripe',
  currency: 'SGD',
  bankCredit: 366308.60,
  settlementTotal: 366308.60,
  variance: 0,
  orderCount: 1500,
  status: 'reconciled',
  date: formatDate(getYesterday()),
  grossToNet: calculateWaterfall(380000, 0.029, 0.07, 0.005, 0),
  orderLines: injectL2Exceptions(
    generateOrderLinesTotalGross('STR001', 380000, 1500, 0.029, 16000, 10),
    1, // 1 no_order (legacy format order ID)
    1  // 1 mismatch
  ),
  feeBreakdown: {
    components: [
      { name: 'MDR', contractRate: '2.90%', actualRate: '2.90%', variance: '0%', status: 'match' },
      { name: 'GST', contractRate: '7.00%', actualRate: '7.00%', variance: '0%', status: 'match' }
    ]
  },
  exceptions: [
    makeSettlementException('SE-STR001-UO-001', 'unmatched_order', 'STR001-TXN-016001', 187.50, 'stripe', 'Stripe', 'Legacy format order IDs - cross-reference partner OMS')
  ]
}

const credit_STR_001: BankCreditRecordDetail = (() => {
  const amount = 365786.00
  const settlements = [settlement_STR_380K]
  const { l1Status, l1Variance, pspNetAmount, pspFileReceived } = calculateL1Status(amount, settlements)
  const { l2Status, l2ExceptionCount, l2ExceptionTypes } = calculateL2Status(settlements, l1Status)
  const reconciliationStatus = deriveReconciliationStatus(l1Status, l2Status)

  return {
    id: `BC-STR-${formatDateDisplay(getYesterday())}-001`,
    bankAccount: 'OCBC-SGD-****7821',
    valueDate: formatDate(getYesterday()),
    amount,
    currency: 'SGD',
    narration: `STRIPE SINGAPORE PTE LTD ${settlement_STR_380K.payoutRef}`,
    payoutRef: settlement_STR_380K.payoutRef,
    mappedPSP: 'stripe',
    matchedSettlements: settlements,
    l1Status,
    l1Variance,
    l2Status,
    l2ExceptionCount,
    l2ExceptionTypes,
    reconciliationStatus,
    variance: l1Variance,
    variancePercent: round((Math.abs(l1Variance) / amount) * 100),
    mappingConfidence: l1Status === 'l1_matched' ? 100 : 75,
    age: calculateAge(formatDate(getYesterday())),
    exceptions: [],
    pspNetAmount,
    pspFileReceived
  }
})()

// Stripe Settlement 2: 399K (L1 matched - no variance, but has L2 exceptions)
// STR-FINAL: 399000 - 11571 (MDR 2.9%) - 809.97 (Tax 7%) - 1995 (FX 0.5%) = 384,623.03
const settlement_STR_FINAL: SettlementPayoutDetail = {
  payoutRef: `PY-STR-${formatDateDisplay(getYesterday())}-002`,
  pspId: 'stripe',
  pspName: 'Stripe',
  currency: 'SGD',
  bankCredit: 384623.03,
  settlementTotal: 384623.03, // No variance - matches bank credit exactly
  variance: 0,
  orderCount: 1550,
  status: 'matched_l1',
  date: formatDate(getYesterday()),
  grossToNet: calculateWaterfall(399000, 0.029, 0.07, 0.005, 0),
  orderLines: injectL2Exceptions(
    generateOrderLinesTotalGross('STR002', 399000, 1550, 0.029, 18000, 10),
    1, // 1 no_order
    1  // 1 mismatch (FX rate difference)
  ),
  feeBreakdown: {
    components: [
      { name: 'MDR', contractRate: '2.90%', actualRate: '2.90%', variance: '0%', status: 'match' },
      { name: 'GST', contractRate: '7.00%', actualRate: '7.00%', variance: '0%', status: 'match' }
    ]
  },
  exceptions: [
    makeSettlementException('SE-STR002-AM-001', 'amount_mismatch', 'STR002-TXN-018009', 4.82, 'stripe', 'Stripe', 'FX rate difference - auto-clear recommended')
  ]
}

// STR_002: L1 matched (zero variance), but has L2 exceptions (amount mismatch at order level)
const credit_STR_002: BankCreditRecordDetail = (() => {
  const amount = 384214.00
  const settlements = [settlement_STR_FINAL]
  // L1 is matched: Bank Credit = PSP Net (zero variance)
  const l1Status: L1Status = 'l1_matched'
  const l1Variance = 0 // No L1 variance - Bank = PSP Net
  // L2 has exceptions (amount mismatch on some order lines)
  const l2Status: L2Status = 'l2_exception'
  const l2ExceptionCount = 2 // 2 amount mismatch order lines
  const l2ExceptionTypes = ['amount_mismatch']
  const reconciliationStatus: ReconciliationStatus = 'matched_l1' // L1 matched but L2 has exceptions

  return {
    id: `BC-STR-${formatDateDisplay(getYesterday())}-002`,
    bankAccount: 'OCBC-SGD-****7821',
    valueDate: formatDate(getYesterday()),
    amount,
    currency: 'SGD',
    narration: `STRIPE SINGAPORE PTE LTD ${settlement_STR_FINAL.payoutRef}`,
    payoutRef: settlement_STR_FINAL.payoutRef,
    mappedPSP: 'stripe',
    matchedSettlements: settlements,
    l1Status,
    l1Variance,
    l2Status,
    l2ExceptionCount,
    l2ExceptionTypes,
    reconciliationStatus,
    variance: l1Variance,
    variancePercent: 0,
    mappingConfidence: 100,
    age: calculateAge(formatDate(getYesterday())),
    exceptions: [],
    pspNetAmount: amount, // PSP Net = Bank Credit (no variance)
    pspFileReceived: true
  }
})()

// ============================================================================
// LINK EXCEPTIONS TO BANK CREDITS
// ============================================================================

/**
 * Link only recent exceptions to yesterday's bank credits
 *
 * IMPORTANT: Settlement Explorer shows YESTERDAY's credits only
 * But 60 exceptions span LAST 30 DAYS
 *
 * So only 5-10 exceptions should be linked to yesterday's credits
 * The rest remain in Exception Workspace but not linked to Settlement Explorer
 */
function linkRecentExceptionsToYesterdayCredits(bankCredits: BankCreditRecordDetail[]) {
  // Filter SGD exceptions from mockExceptions
  const sgdExceptions = mockExceptions.filter(e => e.currency === 'SGD')

  // Sort by date (most recent first)
  const sortedExceptions = [...sgdExceptions].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  // Only take the 10 most recent exceptions
  const recentExceptions = sortedExceptions.slice(0, 10)

  // Split into GrabPay and Stripe
  const recentGrabpay = recentExceptions.filter(e => e.psp === 'grabpay')
  const recentStripe = recentExceptions.filter(e => e.psp === 'stripe')

  // Get yesterday's credits only
  const grabpayCredits = bankCredits.filter(c => c.mappedPSP === 'grabpay' && c.currency === 'SGD')
  const stripeCredits = bankCredits.filter(c => c.mappedPSP === 'stripe' && c.currency === 'SGD')

  // Link a few GrabPay exceptions to first 2-3 GrabPay credits
  if (recentGrabpay.length > 0 && grabpayCredits.length > 0) {
    // First credit gets 2-3 exceptions
    grabpayCredits[0].exceptions = recentGrabpay.slice(0, Math.min(3, recentGrabpay.length))

    // Second credit gets 1-2 exceptions
    if (grabpayCredits.length > 1 && recentGrabpay.length > 3) {
      grabpayCredits[1].exceptions = recentGrabpay.slice(3, Math.min(5, recentGrabpay.length))
    }
  }

  // Link a few Stripe exceptions to first Stripe credit
  if (recentStripe.length > 0 && stripeCredits.length > 0) {
    stripeCredits[0].exceptions = recentStripe.slice(0, Math.min(2, recentStripe.length))

    // Second credit gets remaining if any
    if (stripeCredits.length > 1 && recentStripe.length > 2) {
      stripeCredits[1].exceptions = recentStripe.slice(2, Math.min(4, recentStripe.length))
    }
  }
}

// Collect yesterday's bank credits
const yesterdayCredits = [
  credit_GP_001,
  credit_GP_002,
  credit_GP_003,
  credit_GP_004,
  credit_GP_005,
  credit_GP_006,
  credit_GP_BATCH,
  credit_STR_001,
  credit_STR_002
]

// Link only recent exceptions to yesterday's credits
linkRecentExceptionsToYesterdayCredits(yesterdayCredits)

// ============================================================================
// HISTORICAL DATA GENERATOR
// ============================================================================

/**
 * Generates historical bank credits for the past N days
 * Creates realistic variation in L1/L2 statuses
 *
 * Status Distribution:
 * - 60% L1 matched + L2 matched = reconciled
 * - 15% L1 matched + L2 exceptions = matched_l1
 * - 10% L1 unmatched (no file) = unmatched_no_psp_file
 * - 10% L1 unmatched (variance) = unmatched_variance
 * - 5% partial
 */
function generateHistoricalCredits(daysBack: number): BankCreditRecordDetail[] {
  const historicalCredits: BankCreditRecordDetail[] = []

  type CreditScenario = 'reconciled' | 'matched_l1' | 'unmatched_no_psp_file' | 'unmatched_variance' | 'partial'
  const scenarios: CreditScenario[] = ['reconciled', 'matched_l1', 'unmatched_no_psp_file', 'unmatched_variance', 'partial']
  const scenarioWeights = [0.60, 0.15, 0.10, 0.10, 0.05]

  const getRandomScenario = (): CreditScenario => {
    const rand = Math.random()
    let cumulative = 0
    for (let i = 0; i < scenarios.length; i++) {
      cumulative += scenarioWeights[i]
      if (rand < cumulative) return scenarios[i]
    }
    return 'reconciled'
  }

  // Map scenario to settlement status (for backward compatibility)
  const getSettlementStatus = (scenario: CreditScenario): 'reconciled' | 'matched_l1' | 'awaiting_file' | 'exception' | 'partial' => {
    switch (scenario) {
      case 'reconciled': return 'reconciled'
      case 'matched_l1': return 'matched_l1'
      case 'unmatched_no_psp_file': return 'awaiting_file'
      case 'unmatched_variance': return 'exception'
      case 'partial': return 'partial'
      default: return 'reconciled'
    }
  }

  // Generate 5-12 credits per day for each day going back
  for (let day = 2; day <= daysBack; day++) {
    const date = getDaysAgo(day)
    const dateStr = formatDate(date)
    const dateDisplay = formatDateDisplay(date)
    const creditsPerDay = 5 + Math.floor(Math.random() * 8) // 5-12 credits per day

    for (let i = 0; i < creditsPerDay; i++) {
      const isGrabPay = Math.random() > 0.3 // 70% GrabPay, 30% Stripe
      const psp = isGrabPay ? 'grabpay' : 'stripe'
      const pspName = isGrabPay ? 'GrabPay' : 'Stripe'
      const bankAccount = isGrabPay ? 'DBS-SGD-****4521' : 'OCBC-SGD-****7821'

      // Generate realistic amounts (300K - 600K for GrabPay, 200K - 450K for Stripe)
      const baseAmount = isGrabPay
        ? 300000 + Math.random() * 300000
        : 200000 + Math.random() * 250000
      const amount = round(baseAmount)

      const scenario = getRandomScenario()
      const settlementStatus = getSettlementStatus(scenario)

      // Calculate L1/L2 status based on scenario
      let l1Status: L1Status
      let l2Status: L2Status
      let reconciliationStatus: ReconciliationStatus
      let l1Variance: number
      let l2ExceptionCount: number
      let l2ExceptionTypes: string[]
      let pspNetAmount: number | null
      let pspFileReceived: boolean

      switch (scenario) {
        case 'reconciled':
          l1Status = 'l1_matched'
          l2Status = 'l2_matched'
          reconciliationStatus = 'reconciled'
          l1Variance = 0
          l2ExceptionCount = 0
          l2ExceptionTypes = []
          pspNetAmount = amount
          pspFileReceived = true
          break

        case 'matched_l1':
          // L1 matched (zero variance) but L2 has exceptions
          l1Status = 'l1_matched'
          l2Status = 'l2_exception'
          reconciliationStatus = 'matched_l1'
          l1Variance = 0 // No L1 variance - Bank = PSP Net
          l2ExceptionCount = 1 + Math.floor(Math.random() * 5) // 1-5 L2 exceptions
          l2ExceptionTypes = Math.random() > 0.5 ? ['unmatched_order'] : ['amount_mismatch']
          pspNetAmount = amount // PSP Net = Bank Credit
          pspFileReceived = true
          break

        case 'unmatched_no_psp_file':
          l1Status = 'l1_unmatched_no_file'
          l2Status = 'l2_pending'
          reconciliationStatus = 'unmatched_no_psp_file'
          l1Variance = amount // Full amount is unmatched
          l2ExceptionCount = 0
          l2ExceptionTypes = []
          pspNetAmount = null
          pspFileReceived = false
          break

        case 'unmatched_variance':
          l1Status = 'l1_unmatched_variance'
          l2Status = 'l2_pending' // Can't do L2 until L1 variance is resolved
          reconciliationStatus = 'unmatched_variance'
          l1Variance = round(amount * (0.01 + Math.random() * 0.03)) // 1-4% variance
          l2ExceptionCount = 0
          l2ExceptionTypes = []
          pspNetAmount = amount - l1Variance
          pspFileReceived = true
          break

        case 'partial':
        default:
          l1Status = 'l1_unmatched_variance'
          l2Status = 'l2_exception'
          reconciliationStatus = 'partial'
          l1Variance = round(amount * (0.02 + Math.random() * 0.05)) // 2-7% variance
          l2ExceptionCount = 2 + Math.floor(Math.random() * 8) // 2-10 L2 exceptions
          l2ExceptionTypes = ['unmatched_order', 'amount_mismatch']
          pspNetAmount = amount - l1Variance
          pspFileReceived = true
          break
      }

      const mdrRate = isGrabPay ? 0.025 : 0.029
      const grossAmount = round(amount / (1 - mdrRate - 0.07 * mdrRate - 0.003))

      const settlement: SettlementPayoutDetail = {
        payoutRef: `PY-${isGrabPay ? 'GP' : 'STR'}-${dateDisplay}-${String(i + 1).padStart(3, '0')}`,
        pspId: psp,
        pspName: pspName,
        currency: 'SGD',
        bankCredit: amount,
        settlementTotal: pspNetAmount || 0,
        variance: l1Status === 'l1_unmatched_no_file' ? null : -l1Variance,
        orderCount: Math.floor(1000 + Math.random() * 2000),
        status: settlementStatus,
        date: dateStr,
        grossToNet: calculateWaterfall(grossAmount, mdrRate, 0.07, 0.003, round(Math.random() * 2000)),
        orderLines: generateOrderLinesTotalGross(
          `${isGrabPay ? 'GP' : 'STR'}-${dateDisplay}`,
          grossAmount,
          Math.floor(1000 + Math.random() * 2000),
          mdrRate,
          i * 1000,
          10
        ),
        feeBreakdown: {
          components: [
            { name: 'MDR', contractRate: `${(mdrRate * 100).toFixed(2)}%`, actualRate: `${(mdrRate * 100).toFixed(2)}%`, variance: '0%', status: 'match' },
            { name: 'GST', contractRate: '7.00%', actualRate: '7.00%', variance: '0%', status: 'match' }
          ]
        },
        exceptions: []
      }

      const credit: BankCreditRecordDetail = {
        id: `BC-${isGrabPay ? 'GP' : 'STR'}-${dateDisplay}-${String(i + 1).padStart(3, '0')}`,
        bankAccount: bankAccount,
        valueDate: dateStr,
        amount: amount,
        currency: 'SGD',
        narration: `${pspName.toUpperCase()} PTE LTD ${settlement.payoutRef}`,
        payoutRef: l1Status === 'l1_unmatched_no_file' ? null : settlement.payoutRef,
        mappedPSP: psp,
        matchedSettlements: l1Status === 'l1_unmatched_no_file' ? [] : [settlement],
        l1Status,
        l1Variance,
        l2Status,
        l2ExceptionCount,
        l2ExceptionTypes,
        reconciliationStatus,
        variance: l1Variance,
        variancePercent: l1Status === 'l1_unmatched_no_file' ? 100 : round((l1Variance / amount) * 100),
        mappingConfidence: l1Status === 'l1_matched' ? (l2Status === 'l2_matched' ? 100 : 95) : l1Status === 'l1_unmatched_variance' ? 75 : 0,
        age: calculateAge(dateStr),
        exceptions: [],
        pspNetAmount,
        pspFileReceived
      }

      historicalCredits.push(credit)
    }
  }

  return historicalCredits
}

// Generate 90 days of historical data (excluding yesterday which we have manually created)
const historicalCredits = generateHistoricalCredits(90)

// ============================================================================
// EXPORT ALL DATA
// ============================================================================

// GrabPay Total Verification (Yesterday's Credits):
// GP-001: 485,125.00 + GP-002: 504,530.00 + GP-003: 467,880.00 + GP-004: 494,827.50
// + GP-005: 475,422.50 + GP-BATCH: 570,021.87 + GP-006: 502,193.13 = 3,500,000 ✓

// Stripe Total Verification (Yesterday's Credits):
// STR-001: 366,308.60 + STR-002: 384,623.03 = 750,931.63

// Grand Total: 3,500,000 + 750,931.63 = 4,250,931.63

// GROSS-TO-NET WATERFALL CALCULATIONS (No Reserve Release):
// GP-500K: 500000 - 12500 (MDR 2.5%) - 875 (Tax 7%) - 1500 (FX 0.3%) = 485,125
// GP-520K: 520000 - 13000 - 910 - 1560 = 504,530
// GP-480K: 480000 - 12000 - 840 - 1440 = 465,720 (PSP Net) | Bank: 467,880 | Variance: 2,160
// GP-510K: 510000 - 12750 - 892.50 - 1530 = 494,827.50
// GP-490K: 490000 - 12250 - 857.50 - 1470 = 475,422.50
// GP-AM: 197500 - 4937.50 - 345.63 - 592.50 = 191,624.37
// GP-PM: 260000 - 6500 - 455 - 780 = 252,265
// GP-EVE: 130000 - 3250 - 227.50 - 390 = 126,132.50
// STR-380K: 380000 - 11020 (MDR 2.9%) - 771.40 (Tax 7%) - 1900 (FX 0.5%) = 366,308.60
// STR-399K: 399000 - 11571 - 809.97 - 1995 = 384,623.03

/**
 * Get yesterday's bank credits - generated fresh on each call
 * This ensures dates are always relative to the CURRENT date
 *
 * Yesterday's Credits Summary (9 total):
 * - 4 reconciled (L1 matched + L2 matched)
 * - 2 matched_l1 (L1 matched + L2 exceptions)
 * - 1 unmatched_no_psp_file (No PSP file)
 * - 1 unmatched_variance (PSP file but variance)
 * - 1 partial
 */
const getYesterdayBankCredits = (): BankCreditRecordDetail[] => {
  // Re-generate settlements with fresh dates
  const freshSettlement_GP_500K: SettlementPayoutDetail = {
    ...settlement_GP_500K,
    payoutRef: `PY-GP-${formatDateDisplay(getYesterday())}-001`,
    date: formatDate(getYesterday()),
  }

  const freshSettlement_GP_520K: SettlementPayoutDetail = {
    ...settlement_GP_520K,
    payoutRef: `PY-GP-${formatDateDisplay(getYesterday())}-002`,
    date: formatDate(getYesterday()),
  }

  const freshSettlement_GP_480K_PARTIAL: SettlementPayoutDetail = {
    ...settlement_GP_480K_PARTIAL,
    payoutRef: `PY-GP-${formatDateDisplay(getYesterday())}-003`,
    date: formatDate(getYesterday()),
  }

  const freshSettlement_GP_510K: SettlementPayoutDetail = {
    ...settlement_GP_510K,
    payoutRef: `PY-GP-${formatDateDisplay(getYesterday())}-004`,
    date: formatDate(getYesterday()),
  }

  const freshSettlement_GP_490K: SettlementPayoutDetail = {
    ...settlement_GP_490K,
    payoutRef: `PY-GP-${formatDateDisplay(getYesterday())}-005`,
    date: formatDate(getYesterday()),
  }

  const freshSettlement_GP_AM: SettlementPayoutDetail = {
    ...settlement_GP_AM,
    payoutRef: `PY-GP-${formatDateDisplay(getYesterday())}-AM`,
    date: formatDate(getYesterday()),
  }

  const freshSettlement_GP_PM: SettlementPayoutDetail = {
    ...settlement_GP_PM,
    payoutRef: `PY-GP-${formatDateDisplay(getYesterday())}-PM`,
    date: formatDate(getYesterday()),
  }

  const freshSettlement_GP_EVE: SettlementPayoutDetail = {
    ...settlement_GP_EVE,
    payoutRef: `PY-GP-${formatDateDisplay(getYesterday())}-EVE`,
    date: formatDate(getYesterday()),
  }

  const freshSettlement_STR_380K: SettlementPayoutDetail = {
    ...settlement_STR_380K,
    payoutRef: `PY-STR-${formatDateDisplay(getYesterday())}-001`,
    date: formatDate(getYesterday()),
  }

  const freshSettlement_STR_FINAL: SettlementPayoutDetail = {
    ...settlement_STR_FINAL,
    payoutRef: `PY-STR-${formatDateDisplay(getYesterday())}-002`,
    date: formatDate(getYesterday()),
  }

  // Generate fresh credits with current "yesterday" date
  // Including L1/L2 status fields
  //
  // STATUS SUMMARY (9 bank credits):
  // - Reconciled (L1+L2 matched): GP-004, GP-005, GP-BATCH (3)
  // - L1 Failed (no PSP file): GP-006 (1)
  // - L1 Variance: GP-003 (1)
  // - Matched L1 (L2 exceptions): GP-001, GP-002, STR-001, STR-002 (4)
  //
  const freshCredits: BankCreditRecordDetail[] = [
    // GP_001: L1 matched but L2 shows exceptions = matched_l1
    // Bank credit = PSP Net = 485,125 (from GP-500K settlement)
    {
      id: `BC-GP-${formatDateDisplay(getYesterday())}-001`,
      bankAccount: 'DBS-SGD-****4521',
      valueDate: formatDate(getYesterday()),
      amount: 485125.00,
      currency: 'SGD',
      narration: `GRABPAY PTE LTD ${freshSettlement_GP_500K.payoutRef}`,
      payoutRef: freshSettlement_GP_500K.payoutRef,
      mappedPSP: 'grabpay',
      matchedSettlements: [freshSettlement_GP_500K],
      l1Status: 'l1_matched',
      l1Variance: 0,
      l2Status: 'l2_exception', // L2 has exceptions
      l2ExceptionCount: 3, // Will link exceptions later
      l2ExceptionTypes: ['unmatched_order', 'amount_mismatch'],
      reconciliationStatus: 'matched_l1', // L1 matched but L2 has exceptions
      variance: 0,
      variancePercent: 0,
      mappingConfidence: 100,
      age: calculateAge(formatDate(getYesterday())),
      exceptions: [], // Will link exceptions later
      pspNetAmount: 485125.00,
      pspFileReceived: true
    },
    // GP_002: L1 matched but L2 shows exceptions = matched_l1
    // Bank credit = PSP Net = 504,530 (from GP-520K settlement)
    {
      id: `BC-GP-${formatDateDisplay(getYesterday())}-002`,
      bankAccount: 'DBS-SGD-****4521',
      valueDate: formatDate(getYesterday()),
      amount: 504530.00,
      currency: 'SGD',
      narration: `GRABPAY PTE LTD ${freshSettlement_GP_520K.payoutRef}`,
      payoutRef: freshSettlement_GP_520K.payoutRef,
      mappedPSP: 'grabpay',
      matchedSettlements: [freshSettlement_GP_520K],
      l1Status: 'l1_matched',
      l1Variance: 0,
      l2Status: 'l2_exception', // L2 has exceptions
      l2ExceptionCount: 2, // Will link exceptions later
      l2ExceptionTypes: ['amount_mismatch'],
      reconciliationStatus: 'matched_l1', // L1 matched but L2 has exceptions
      variance: 0,
      variancePercent: 0,
      mappingConfidence: 100,
      age: calculateAge(formatDate(getYesterday())),
      exceptions: [], // Will link exceptions later
      pspNetAmount: 504530.00,
      pspFileReceived: true
    },
    // GP_003: L1 unmatched (variance) = unmatched_variance
    // Bank credit: 467,880 | PSP Net: 465,720 | Variance: 2,160
    {
      id: `BC-GP-${formatDateDisplay(getYesterday())}-003`,
      bankAccount: 'DBS-SGD-****4521',
      valueDate: formatDate(getYesterday()),
      amount: 467880.00,
      currency: 'SGD',
      narration: `GRABPAY PTE LTD ${freshSettlement_GP_480K_PARTIAL.payoutRef}`,
      payoutRef: freshSettlement_GP_480K_PARTIAL.payoutRef,
      mappedPSP: 'grabpay',
      matchedSettlements: [freshSettlement_GP_480K_PARTIAL],
      l1Status: 'l1_unmatched_variance',
      l1Variance: 2160.00, // 467880 - 465720 = 2160
      l2Status: 'l2_pending',
      l2ExceptionCount: 0,
      l2ExceptionTypes: [],
      reconciliationStatus: 'unmatched_variance',
      variance: 2160.00,
      variancePercent: 0.46,
      mappingConfidence: 75,
      age: calculateAge(formatDate(getYesterday())),
      exceptions: [],
      pspNetAmount: 465720.00,
      pspFileReceived: true
    },
    // GP_004: L1 matched + L2 matched = reconciled
    // Bank credit = Settlement net = 494,827.50
    // Gross: 510,000 | MDR: 12,750 | Tax: 892.50 | FX: 1,530
    {
      id: `BC-GP-${formatDateDisplay(getYesterday())}-004`,
      bankAccount: 'DBS-SGD-****4521',
      valueDate: formatDate(getYesterday()),
      amount: 494827.50,
      currency: 'SGD',
      narration: `GRABPAY PTE LTD ${freshSettlement_GP_510K.payoutRef}`,
      payoutRef: freshSettlement_GP_510K.payoutRef,
      mappedPSP: 'grabpay',
      matchedSettlements: [freshSettlement_GP_510K],
      l1Status: 'l1_matched',
      l1Variance: 0,
      l2Status: 'l2_matched',
      l2ExceptionCount: 0,
      l2ExceptionTypes: [],
      reconciliationStatus: 'reconciled',
      variance: 0,
      variancePercent: 0,
      mappingConfidence: 100,
      age: calculateAge(formatDate(getYesterday())),
      exceptions: [],
      pspNetAmount: 494827.50,
      pspFileReceived: true,
      accountingEntries: {
        journalEntries: [{
          entryNumber: 1,
          description: 'Cash Application - GrabPay Settlement',
          postingDate: formatDate(getYesterday()),
          documentType: 'bank_matching',
          lines: [
            { lineNumber: 1, account: '1100', accountName: 'Bank - DBS SGD Settlement', debitCredit: 'debit', amount: 494827.50, currency: 'SGD' },
            { lineNumber: 2, account: '6110', accountName: 'Payment Processing Fee - MDR', debitCredit: 'debit', amount: 12750.00, currency: 'SGD' },
            { lineNumber: 3, account: '6115', accountName: 'GST on Processing Fees', debitCredit: 'debit', amount: 892.50, currency: 'SGD' },
            { lineNumber: 4, account: '6120', accountName: 'FX Margin Expense', debitCredit: 'debit', amount: 1530.00, currency: 'SGD' },
            { lineNumber: 5, account: '1200', accountName: 'Accounts Receivable - GrabPay', debitCredit: 'credit', amount: 510000.00, currency: 'SGD' }
          ]
        }],
        postedDate: formatDate(getYesterday()),
        postedBy: 'System Auto-Reconciliation'
      }
    },
    // GP_005: Fully reconciled - L1 matched + L2 matched
    // Bank credit = PSP Net = 475,422.50 (from GP-490K settlement)
    // Gross: 490,000 | MDR: 12,250 | Tax: 857.50 | FX: 1,470
    {
      id: `BC-GP-${formatDateDisplay(getYesterday())}-005`,
      bankAccount: 'DBS-SGD-****4521',
      valueDate: formatDate(getYesterday()),
      amount: 475422.50,
      currency: 'SGD',
      narration: `GRABPAY PTE LTD ${freshSettlement_GP_490K.payoutRef}`,
      payoutRef: freshSettlement_GP_490K.payoutRef,
      mappedPSP: 'grabpay',
      matchedSettlements: [freshSettlement_GP_490K],
      l1Status: 'l1_matched',
      l1Variance: 0, // No L1 variance - Bank = PSP Net
      l2Status: 'l2_matched',
      l2ExceptionCount: 0,
      l2ExceptionTypes: [],
      reconciliationStatus: 'reconciled',
      variance: 0,
      variancePercent: 0,
      mappingConfidence: 100,
      age: calculateAge(formatDate(getYesterday())),
      exceptions: [],
      pspNetAmount: 475422.50, // PSP Net = Bank Credit
      pspFileReceived: true,
      accountingEntries: {
        journalEntries: [{
          entryNumber: 1,
          description: 'Cash Application - GrabPay Settlement',
          postingDate: formatDate(getYesterday()),
          documentType: 'bank_matching',
          lines: [
            { lineNumber: 1, account: '1100', accountName: 'Bank - DBS SGD Settlement', debitCredit: 'debit', amount: 475422.50, currency: 'SGD' },
            { lineNumber: 2, account: '6110', accountName: 'Payment Processing Fee - MDR', debitCredit: 'debit', amount: 12250.00, currency: 'SGD' },
            { lineNumber: 3, account: '6115', accountName: 'GST on Processing Fees', debitCredit: 'debit', amount: 857.50, currency: 'SGD' },
            { lineNumber: 4, account: '6120', accountName: 'FX Margin Expense', debitCredit: 'debit', amount: 1470.00, currency: 'SGD' },
            { lineNumber: 5, account: '1200', accountName: 'Accounts Receivable - GrabPay', debitCredit: 'credit', amount: 490000.00, currency: 'SGD' }
          ]
        }],
        postedDate: formatDate(getYesterday()),
        postedBy: 'System Auto-Reconciliation'
      }
    },
    // GP_BATCH: L1 matched + L2 matched = reconciled (multi-settlement)
    // Bank credit = Sum of AM + PM + EVE = 191,624.37 + 252,265 + 126,132.50 = 570,021.87
    // Total Gross: 587,500 | Total MDR: 14,687.50 | Total Tax: 1,028.13 | Total FX: 1,762.50
    {
      id: `BC-GP-${formatDateDisplay(getYesterday())}-BATCH`,
      bankAccount: 'DBS-SGD-****4521',
      valueDate: formatDate(getYesterday()),
      amount: 570021.87,
      currency: 'SGD',
      narration: `GRABPAY PTE LTD BATCH SETTLEMENT ${formatDateDisplay(getYesterday())}`,
      payoutRef: `PY-GP-${formatDateDisplay(getYesterday())}-BATCH`,
      mappedPSP: 'grabpay',
      matchedSettlements: [freshSettlement_GP_AM, freshSettlement_GP_PM, freshSettlement_GP_EVE],
      l1Status: 'l1_matched',
      l1Variance: 0,
      l2Status: 'l2_matched',
      l2ExceptionCount: 0,
      l2ExceptionTypes: [],
      reconciliationStatus: 'reconciled',
      variance: 0,
      variancePercent: 0,
      mappingConfidence: 100,
      age: calculateAge(formatDate(getYesterday())),
      exceptions: [],
      pspNetAmount: 570021.87,
      pspFileReceived: true,
      accountingEntries: {
        journalEntries: [
          {
            entryNumber: 1,
            description: 'Cash Application - GrabPay Morning Batch',
            postingDate: formatDate(getYesterday()),
            documentType: 'bank_matching',
            lines: [
              { lineNumber: 1, account: '1100', accountName: 'Bank - DBS SGD Settlement', debitCredit: 'debit', amount: 191624.37, currency: 'SGD' },
              { lineNumber: 2, account: '6110', accountName: 'Payment Processing Fee - MDR', debitCredit: 'debit', amount: 4937.50, currency: 'SGD' },
              { lineNumber: 3, account: '6115', accountName: 'GST on Processing Fees', debitCredit: 'debit', amount: 345.63, currency: 'SGD' },
              { lineNumber: 4, account: '6120', accountName: 'FX Margin Expense', debitCredit: 'debit', amount: 592.50, currency: 'SGD' },
              { lineNumber: 5, account: '1200', accountName: 'Accounts Receivable - GrabPay', debitCredit: 'credit', amount: 197500.00, currency: 'SGD' }
            ]
          },
          {
            entryNumber: 2,
            description: 'Cash Application - GrabPay Afternoon Batch',
            postingDate: formatDate(getYesterday()),
            documentType: 'bank_matching',
            lines: [
              { lineNumber: 1, account: '1100', accountName: 'Bank - DBS SGD Settlement', debitCredit: 'debit', amount: 252265.00, currency: 'SGD' },
              { lineNumber: 2, account: '6110', accountName: 'Payment Processing Fee - MDR', debitCredit: 'debit', amount: 6500.00, currency: 'SGD' },
              { lineNumber: 3, account: '6115', accountName: 'GST on Processing Fees', debitCredit: 'debit', amount: 455.00, currency: 'SGD' },
              { lineNumber: 4, account: '6120', accountName: 'FX Margin Expense', debitCredit: 'debit', amount: 780.00, currency: 'SGD' },
              { lineNumber: 5, account: '1200', accountName: 'Accounts Receivable - GrabPay', debitCredit: 'credit', amount: 260000.00, currency: 'SGD' }
            ]
          },
          {
            entryNumber: 3,
            description: 'Cash Application - GrabPay Evening Batch',
            postingDate: formatDate(getYesterday()),
            documentType: 'bank_matching',
            lines: [
              { lineNumber: 1, account: '1100', accountName: 'Bank - DBS SGD Settlement', debitCredit: 'debit', amount: 126132.50, currency: 'SGD' },
              { lineNumber: 2, account: '6110', accountName: 'Payment Processing Fee - MDR', debitCredit: 'debit', amount: 3250.00, currency: 'SGD' },
              { lineNumber: 3, account: '6115', accountName: 'GST on Processing Fees', debitCredit: 'debit', amount: 227.50, currency: 'SGD' },
              { lineNumber: 4, account: '6120', accountName: 'FX Margin Expense', debitCredit: 'debit', amount: 390.00, currency: 'SGD' },
              { lineNumber: 5, account: '1200', accountName: 'Accounts Receivable - GrabPay', debitCredit: 'credit', amount: 130000.00, currency: 'SGD' }
            ]
          }
        ],
        postedDate: formatDate(getYesterday()),
        postedBy: 'System Auto-Reconciliation'
      }
    },
    // GP_006: L1 unmatched (no file) = unmatched_no_psp_file
    // Bank credit: 502,193.13 (adjusts GrabPay total to 3,500,000)
    // Note: l1Variance is full amount since there's no PSP file to match
    {
      id: `BC-GP-${formatDateDisplay(getYesterday())}-006`,
      bankAccount: 'DBS-SGD-****4521',
      valueDate: formatDate(getYesterday()),
      amount: 502193.13,
      currency: 'SGD',
      narration: `GRABPAY PTE LTD SETTLEMENT`,
      payoutRef: null,
      mappedPSP: 'grabpay',
      matchedSettlements: [],
      l1Status: 'l1_unmatched_no_file',
      l1Variance: 502193.13, // Full amount is unmatched (no PSP file)
      l2Status: 'l2_pending',
      l2ExceptionCount: 0,
      l2ExceptionTypes: [],
      reconciliationStatus: 'unmatched_no_psp_file',
      variance: 502193.13, // Full amount is unmatched
      variancePercent: 100,
      mappingConfidence: 0,
      age: calculateAge(formatDate(getYesterday())),
      exceptions: [],
      pspNetAmount: null,
      pspFileReceived: false
    },
    // STR_001: L1 matched but L2 shows exceptions = matched_l1
    // Bank credit = PSP Net = 366,308.60 (from STR-380K settlement)
    {
      id: `BC-STR-${formatDateDisplay(getYesterday())}-001`,
      bankAccount: 'OCBC-SGD-****7821',
      valueDate: formatDate(getYesterday()),
      amount: 366308.60,
      currency: 'SGD',
      narration: `STRIPE SINGAPORE PTE LTD ${freshSettlement_STR_380K.payoutRef}`,
      payoutRef: freshSettlement_STR_380K.payoutRef,
      mappedPSP: 'stripe',
      matchedSettlements: [freshSettlement_STR_380K],
      l1Status: 'l1_matched',
      l1Variance: 0,
      l2Status: 'l2_exception', // L2 has exceptions
      l2ExceptionCount: 2, // Will link exceptions later
      l2ExceptionTypes: ['unmatched_order'],
      reconciliationStatus: 'matched_l1', // L1 matched but L2 has exceptions
      variance: 0,
      variancePercent: 0,
      mappingConfidence: 100,
      age: calculateAge(formatDate(getYesterday())),
      exceptions: [], // Will link exceptions later
      pspNetAmount: 366308.60,
      pspFileReceived: true
    },
    // STR_002: L1 matched (zero variance) + L2 exceptions = matched_l1
    // Bank credit = PSP Net = 384,623.03 (from STR-FINAL settlement)
    {
      id: `BC-STR-${formatDateDisplay(getYesterday())}-002`,
      bankAccount: 'OCBC-SGD-****7821',
      valueDate: formatDate(getYesterday()),
      amount: 384623.03,
      currency: 'SGD',
      narration: `STRIPE SINGAPORE PTE LTD ${freshSettlement_STR_FINAL.payoutRef}`,
      payoutRef: freshSettlement_STR_FINAL.payoutRef,
      mappedPSP: 'stripe',
      matchedSettlements: [freshSettlement_STR_FINAL],
      l1Status: 'l1_matched',
      l1Variance: 0, // No L1 variance - Bank = PSP Net
      l2Status: 'l2_exception',
      l2ExceptionCount: 2,
      l2ExceptionTypes: ['amount_mismatch'],
      reconciliationStatus: 'matched_l1',
      variance: 0,
      variancePercent: 0,
      mappingConfidence: 100,
      age: calculateAge(formatDate(getYesterday())),
      exceptions: [],
      pspNetAmount: 384623.03, // PSP Net = Bank Credit
      pspFileReceived: true
    }
  ]

  return freshCredits
}

/**
 * Get all bank credits - generates fresh data on each call
 * This ensures "yesterday" is always relative to the current date
 */
export const getMockBankCredits = (): BankCreditRecordDetail[] => {
  const yesterdayCredits = getYesterdayBankCredits()
  const historical = generateHistoricalCredits(90)

  // Link exceptions to yesterday's credits
  linkRecentExceptionsToYesterdayCredits(yesterdayCredits)

  return [
    ...yesterdayCredits,
    ...historical
  ].sort((a, b) => new Date(b.valueDate).getTime() - new Date(a.valueDate).getTime())
}

// Legacy static export for backwards compatibility (but will have stale dates if module cached)
export const mockBankCredits: BankCreditRecordDetail[] = getMockBankCredits()

export const mockSettlements: SettlementPayoutDetail[] = [
  settlement_GP_500K,
  settlement_GP_520K,
  settlement_GP_480K_PARTIAL,
  settlement_GP_510K,
  settlement_GP_490K,
  settlement_GP_AM,
  settlement_GP_PM,
  settlement_GP_EVE,
  // settlement_GP_FINAL removed - credit_GP_006 is now UNMATCHED (no PSP file)
  settlement_STR_380K,
  settlement_STR_FINAL
]
