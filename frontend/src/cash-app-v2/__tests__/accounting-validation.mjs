/**
 * Comprehensive Accounting Validation
 * Validates consistency between Dashboard KPIs and Settlement Explorer KPIs
 */

import { mockDashboardKPIs, mockPSPReconciliationStatus, mockSettlementPayouts } from '../data/mockData.ts'
import { mockBankCredits, mockSettlements } from '../data/settlementsData.ts'

console.log('\n╔════════════════════════════════════════════════════════════════╗')
console.log('║  COMPREHENSIVE ACCOUNTING VALIDATION REPORT                    ║')
console.log('║  Cash App V2 - Dashboard vs Settlement Explorer               ║')
console.log('╚════════════════════════════════════════════════════════════════╝\n')

const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  tests: []
}

function test(description, assertion, expected, actual) {
  try {
    const pass = assertion()
    if (pass) {
      results.passed++
      results.tests.push({ description, status: 'PASS', expected, actual })
      console.log(`✓ PASS: ${description}`)
      if (expected !== undefined) {
        console.log(`  Expected: ${expected}`)
        console.log(`  Actual:   ${actual}`)
      }
    } else {
      results.failed++
      results.tests.push({ description, status: 'FAIL', expected, actual })
      console.error(`✗ FAIL: ${description}`)
      console.error(`  Expected: ${expected}`)
      console.error(`  Actual:   ${actual}`)
    }
  } catch (error) {
    results.failed++
    results.tests.push({ description, status: 'ERROR', error: error.message })
    console.error(`✗ ERROR: ${description}`)
    console.error(`  ${error.message}`)
  }
  console.log('')
}

function warning(description, message) {
  results.warnings++
  console.warn(`⚠ WARNING: ${description}`)
  console.warn(`  ${message}\n`)
}

// ============================================================================
// SECTION 1: TOTAL BANK CREDIT VALIDATION
// ============================================================================
console.log('═══════════════════════════════════════════════════════════════')
console.log('SECTION 1: TOTAL BANK CREDIT VALIDATION')
console.log('═══════════════════════════════════════════════════════════════\n')

// Test 1.1: Settlement Explorer total should match Dashboard total
const settlementTotal = mockBankCredits.reduce((sum, credit) => sum + credit.amount, 0)
test(
  'Settlement Explorer total matches Dashboard Total Bank Credit',
  () => settlementTotal === mockDashboardKPIs.totalBankCreditSGD,
  `SGD ${mockDashboardKPIs.totalBankCreditSGD.toLocaleString()}`,
  `SGD ${settlementTotal.toLocaleString()}`
)

// Test 1.2: PSP Reconciliation totals should match Dashboard total
const pspTotalSGD = mockPSPReconciliationStatus
  .filter(psp => psp.currency === 'SGD')
  .reduce((sum, psp) => sum + psp.todayCredits, 0)

test(
  'PSP Reconciliation totals match Dashboard Total Bank Credit',
  () => pspTotalSGD === mockDashboardKPIs.totalBankCreditSGD,
  `SGD ${mockDashboardKPIs.totalBankCreditSGD.toLocaleString()}`,
  `SGD ${pspTotalSGD.toLocaleString()}`
)

// Test 1.3: Three-way reconciliation (Dashboard = PSP = Settlements)
test(
  'Three-way reconciliation: Dashboard = PSP = Settlements',
  () => mockDashboardKPIs.totalBankCreditSGD === pspTotalSGD && pspTotalSGD === settlementTotal,
  `All equal to SGD ${mockDashboardKPIs.totalBankCreditSGD.toLocaleString()}`,
  `Dashboard: ${mockDashboardKPIs.totalBankCreditSGD.toLocaleString()}, PSP: ${pspTotalSGD.toLocaleString()}, Settlements: ${settlementTotal.toLocaleString()}`
)

// ============================================================================
// SECTION 2: PSP-LEVEL RECONCILIATION
// ============================================================================
console.log('═══════════════════════════════════════════════════════════════')
console.log('SECTION 2: PSP-LEVEL RECONCILIATION')
console.log('═══════════════════════════════════════════════════════════════\n')

// Test 2.1: GrabPay reconciliation
const grabpayPSP = mockPSPReconciliationStatus.find(psp => psp.pspId === 'grabpay')
const grabpaySettlements = mockBankCredits.filter(c => c.mappedPSP === 'grabpay')
const grabpayTotal = grabpaySettlements.reduce((sum, c) => sum + c.amount, 0)

test(
  'GrabPay: Settlement total matches PSP reconciliation',
  () => grabpayTotal === grabpayPSP?.todayCredits,
  `SGD ${grabpayPSP?.todayCredits.toLocaleString()}`,
  `SGD ${grabpayTotal.toLocaleString()}`
)

console.log(`  GrabPay Details:`)
console.log(`  - PSP Reconciliation: SGD ${grabpayPSP?.todayCredits.toLocaleString()}`)
console.log(`  - Settlement Records:  ${grabpaySettlements.length} credits`)
console.log(`  - Settlement Total:    SGD ${grabpayTotal.toLocaleString()}`)
console.log(`  - Matched Amount:      SGD ${grabpayPSP?.matched.toLocaleString()}`)
console.log(`  - Coverage:            ${grabpayPSP?.coveragePct}%\n`)

// Test 2.2: Stripe reconciliation
const stripePSP = mockPSPReconciliationStatus.find(psp => psp.pspId === 'stripe')
const stripeSettlements = mockBankCredits.filter(c => c.mappedPSP === 'stripe')
const stripeTotal = stripeSettlements.reduce((sum, c) => sum + c.amount, 0)

test(
  'Stripe: Settlement total matches PSP reconciliation',
  () => stripeTotal === stripePSP?.todayCredits,
  `SGD ${stripePSP?.todayCredits.toLocaleString()}`,
  `SGD ${stripeTotal.toLocaleString()}`
)

console.log(`  Stripe Details:`)
console.log(`  - PSP Reconciliation: SGD ${stripePSP?.todayCredits.toLocaleString()}`)
console.log(`  - Settlement Records:  ${stripeSettlements.length} credits`)
console.log(`  - Settlement Total:    SGD ${stripeTotal.toLocaleString()}`)
console.log(`  - Matched Amount:      SGD ${stripePSP?.matched.toLocaleString()}`)
console.log(`  - Coverage:            ${stripePSP?.coveragePct}%\n`)

// ============================================================================
// SECTION 3: MATHEMATICAL ACCURACY OF SETTLEMENTS
// ============================================================================
console.log('═══════════════════════════════════════════════════════════════')
console.log('SECTION 3: MATHEMATICAL ACCURACY OF SETTLEMENTS')
console.log('═══════════════════════════════════════════════════════════════\n')

// Test 3.1: Each settlement's waterfall calculations are correct
let waterfallErrors = 0
mockSettlements.forEach((settlement, index) => {
  const waterfall = settlement.grossToNet
  const calculatedNet = waterfall.grossTransactionValue -
                        waterfall.mdrFee -
                        waterfall.taxOnMDR -
                        waterfall.fxMargin +
                        waterfall.reserveRelease

  const diff = Math.abs(calculatedNet - waterfall.expectedNet)
  if (diff > 0.01) { // Allow 1 cent tolerance for rounding
    waterfallErrors++
    console.error(`  ✗ Settlement ${settlement.payoutRef}: Calculation mismatch`)
    console.error(`    Calculated: ${calculatedNet.toFixed(2)}, Expected: ${waterfall.expectedNet.toFixed(2)}`)
  }
})

test(
  'All settlement waterfall calculations are mathematically correct',
  () => waterfallErrors === 0,
  '0 calculation errors',
  `${waterfallErrors} calculation errors`
)

// Test 3.2: Bank credit matches settlement sum for each credit
let creditMatchErrors = 0
mockBankCredits.forEach(credit => {
  if (credit.matchedSettlements.length > 0) {
    const settlementSum = credit.matchedSettlements.reduce((sum, s) => sum + (s.settlementTotal || 0), 0)
    const diff = Math.abs(credit.amount - settlementSum)
    if (diff > 0.01) {
      creditMatchErrors++
      console.error(`  ✗ Credit ${credit.id}: Amount mismatch`)
      console.error(`    Bank Credit: ${credit.amount.toFixed(2)}, Settlements Sum: ${settlementSum.toFixed(2)}`)
    }
  }
})

test(
  'All bank credits match their settlement sums',
  () => creditMatchErrors === 0,
  '0 mismatches',
  `${creditMatchErrors} mismatches`
)

// ============================================================================
// SECTION 4: DATA QUALITY CHECKS
// ============================================================================
console.log('═══════════════════════════════════════════════════════════════')
console.log('SECTION 4: DATA QUALITY CHECKS')
console.log('═══════════════════════════════════════════════════════════════\n')

// Test 4.1: No negative amounts
const negativeAmounts = mockBankCredits.filter(c => c.amount < 0)
test(
  'No bank credits with negative amounts',
  () => negativeAmounts.length === 0,
  '0 negative amounts',
  `${negativeAmounts.length} negative amounts`
)

// Test 4.2: All credits have reconciliation status
const missingStatus = mockBankCredits.filter(c => !c.reconciliationStatus)
test(
  'All bank credits have reconciliation status',
  () => missingStatus.length === 0,
  '0 missing status',
  `${missingStatus.length} missing status`
)

// Test 4.3: Variance calculations are correct
let varianceErrors = 0
mockBankCredits.forEach(credit => {
  if (credit.matchedSettlements.length > 0) {
    const settlementSum = credit.matchedSettlements.reduce((sum, s) => sum + (s.settlementTotal || 0), 0)
    const calculatedVariance = credit.amount - settlementSum
    const diff = Math.abs(calculatedVariance - credit.variance)
    if (diff > 0.01) {
      varianceErrors++
      console.error(`  ✗ Credit ${credit.id}: Variance calculation error`)
      console.error(`    Calculated: ${calculatedVariance.toFixed(2)}, Stored: ${credit.variance.toFixed(2)}`)
    }
  }
})

test(
  'All variance calculations are correct',
  () => varianceErrors === 0,
  '0 variance errors',
  `${varianceErrors} variance errors`
)

// ============================================================================
// SECTION 5: CONSISTENCY WITH MOCKDATA.TS
// ============================================================================
console.log('═══════════════════════════════════════════════════════════════')
console.log('SECTION 5: CONSISTENCY WITH MOCKDATA.TS')
console.log('═══════════════════════════════════════════════════════════════\n')

// Test 5.1: mockSettlementPayouts should align with settlementsData
const mockPayoutTotal = mockSettlementPayouts
  .filter(p => p.currency === 'SGD')
  .reduce((sum, p) => sum + (p.bankCredit || 0), 0)

console.log(`  mockData.ts Settlement Payouts Total: SGD ${mockPayoutTotal.toLocaleString()}`)
console.log(`  settlementsData.ts Bank Credits Total: SGD ${settlementTotal.toLocaleString()}`)

if (mockPayoutTotal !== settlementTotal) {
  warning(
    'mockData.ts vs settlementsData.ts mismatch',
    `mockSettlementPayouts (${mockPayoutTotal.toLocaleString()}) does not match mockBankCredits (${settlementTotal.toLocaleString()}). Consider updating mockData.ts to use settlementsData.ts exports.`
  )
} else {
  console.log(`  ✓ Both sources are consistent\n`)
}

// ============================================================================
// SECTION 6: SETTLEMENT EXPLORER KPI CALCULATIONS
// ============================================================================
console.log('═══════════════════════════════════════════════════════════════')
console.log('SECTION 6: SETTLEMENT EXPLORER KPI CALCULATIONS')
console.log('═══════════════════════════════════════════════════════════════\n')

const totalBankCredits = mockBankCredits.length
const reconciledCount = mockBankCredits.filter(c => c.reconciliationStatus === 'reconciled').length
const reconciledPercent = Math.round((reconciledCount / totalBankCredits) * 100)
const unmatchedCount = mockBankCredits.filter(c => c.reconciliationStatus === 'unmatched').length
const totalVariance = mockBankCredits.reduce((sum, c) => sum + Math.abs(c.variance), 0)

console.log(`Settlement Explorer KPIs (Calculated):`)
console.log(`─────────────────────────────────────────`)
console.log(`Total Bank Credits:    ${totalBankCredits}`)
console.log(`Total Amount:          SGD ${settlementTotal.toLocaleString()}`)
console.log(`Reconciled Count:      ${reconciledCount}`)
console.log(`Reconciliation Rate:   ${reconciledPercent}%`)
console.log(`Unmatched Count:       ${unmatchedCount}`)
console.log(`Total Variance:        SGD ${totalVariance.toLocaleString()}`)
console.log(``)

test(
  'Settlement Explorer: 100% reconciliation rate achieved',
  () => reconciledPercent === 100,
  '100%',
  `${reconciledPercent}%`
)

test(
  'Settlement Explorer: Zero unmatched credits',
  () => unmatchedCount === 0,
  '0 unmatched',
  `${unmatchedCount} unmatched`
)

test(
  'Settlement Explorer: Zero total variance',
  () => totalVariance === 0,
  'SGD 0',
  `SGD ${totalVariance.toLocaleString()}`
)

// ============================================================================
// FINAL REPORT
// ============================================================================
console.log('\n╔════════════════════════════════════════════════════════════════╗')
console.log('║  VALIDATION SUMMARY                                            ║')
console.log('╚════════════════════════════════════════════════════════════════╝\n')

console.log(`Total Tests Run:     ${results.passed + results.failed}`)
console.log(`✓ Passed:           ${results.passed}`)
console.log(`✗ Failed:           ${results.failed}`)
console.log(`⚠ Warnings:         ${results.warnings}`)
console.log(`Success Rate:       ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`)

console.log('\n╔════════════════════════════════════════════════════════════════╗')
console.log('║  KEY METRICS CONSISTENCY                                       ║')
console.log('╚════════════════════════════════════════════════════════════════╝\n')

console.log('┌─────────────────────────────────────┬──────────────────────────┐')
console.log('│ Metric                              │ Value                    │')
console.log('├─────────────────────────────────────┼──────────────────────────┤')
console.log(`│ Dashboard Total Bank Credit         │ SGD ${mockDashboardKPIs.totalBankCreditSGD.toLocaleString().padEnd(17)}│`)
console.log(`│ PSP Reconciliation Total (SGD)      │ SGD ${pspTotalSGD.toLocaleString().padEnd(17)}│`)
console.log(`│ Settlement Explorer Total           │ SGD ${settlementTotal.toLocaleString().padEnd(17)}│`)
console.log('├─────────────────────────────────────┼──────────────────────────┤')
console.log(`│ GrabPay PSP Reconciliation          │ SGD ${grabpayPSP?.todayCredits.toLocaleString().padEnd(17)}│`)
console.log(`│ GrabPay Settlement Total            │ SGD ${grabpayTotal.toLocaleString().padEnd(17)}│`)
console.log('├─────────────────────────────────────┼──────────────────────────┤')
console.log(`│ Stripe PSP Reconciliation           │ SGD ${stripePSP?.todayCredits.toLocaleString().padEnd(17)}│`)
console.log(`│ Stripe Settlement Total             │ SGD ${stripeTotal.toLocaleString().padEnd(17)}│`)
console.log('└─────────────────────────────────────┴──────────────────────────┘\n')

if (results.failed === 0 && results.warnings === 0) {
  console.log('╔════════════════════════════════════════════════════════════════╗')
  console.log('║  ✅ EXCELLENT - ALL VALIDATIONS PASSED                         ║')
  console.log('║  Data is 100% consistent across Dashboard and Settlements      ║')
  console.log('║  Production-ready with zero discrepancies                      ║')
  console.log('╚════════════════════════════════════════════════════════════════╝\n')
  process.exit(0)
} else if (results.failed === 0) {
  console.log('╔════════════════════════════════════════════════════════════════╗')
  console.log('║  ⚠️  GOOD - All tests passed with warnings                      ║')
  console.log('║  Review warnings and consider addressing them                  ║')
  console.log('╚════════════════════════════════════════════════════════════════╝\n')
  process.exit(0)
} else {
  console.log('╔════════════════════════════════════════════════════════════════╗')
  console.log('║  ❌ FAILED - Data inconsistencies detected                      ║')
  console.log('║  Please review and fix the failed tests above                  ║')
  console.log('╚════════════════════════════════════════════════════════════════╝\n')
  process.exit(1)
}
