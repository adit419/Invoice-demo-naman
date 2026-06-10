/**
 * Data Consistency Validation Script
 * Validates mathematical relationships across all Cash App V2 metrics
 * Run with: node src/cash-app-v2/__tests__/validate-data-consistency.mjs
 */

import { mockDashboardKPIs, mockPSPReconciliationStatus, mockExceptionSummary, mockExceptionAgingData, mockOpenARSummary, mockSettlementPayouts } from '../data/mockData.ts'

const results = {
  passed: 0,
  failed: 0,
  tests: []
}

function test(description, assertion) {
  try {
    if (assertion()) {
      results.passed++
      results.tests.push({ description, status: '✓ PASS', error: null })
      console.log(`✓ ${description}`)
    } else {
      results.failed++
      results.tests.push({ description, status: '✗ FAIL', error: 'Assertion failed' })
      console.error(`✗ ${description}`)
    }
  } catch (error) {
    results.failed++
    results.tests.push({ description, status: '✗ FAIL', error: error.message })
    console.error(`✗ ${description} - ${error.message}`)
  }
}

console.log('\n=== Cash App V2 Data Consistency Validation ===\n')

// ============================================================================
// Test Suite 1: Total Bank Credit Validation
// ============================================================================
console.log('1. Total Bank Credit Validation')
console.log('─────────────────────────────────')

test('Total Bank Credit should match sum of SGD PSP credits', () => {
  const sgdPSPs = mockPSPReconciliationStatus.filter(psp => psp.currency === 'SGD')
  const totalSGDCredits = sgdPSPs.reduce((sum, psp) => sum + psp.todayCredits, 0)
  console.log(`   Expected: ${mockDashboardKPIs.totalBankCreditSGD.toLocaleString()}`)
  console.log(`   Actual:   ${totalSGDCredits.toLocaleString()}`)
  return totalSGDCredits === mockDashboardKPIs.totalBankCreditSGD && totalSGDCredits === 4250000
})

test('Total Bank Credit should match sum of SGD settlement payouts', () => {
  const sgdSettlements = mockSettlementPayouts.filter(s => s.currency === 'SGD')
  const totalSettlementCredits = sgdSettlements.reduce((sum, s) => sum + (s.bankCredit || 0), 0)
  console.log(`   Settlement Credits: ${totalSettlementCredits.toLocaleString()}`)
  console.log(`   Bank Credit KPI:    ${mockDashboardKPIs.totalBankCreditSGD.toLocaleString()}`)
  return totalSettlementCredits === mockDashboardKPIs.totalBankCreditSGD
})

// ============================================================================
// Test Suite 2: PSP Reconciliation Validation
// ============================================================================
console.log('\n2. PSP Reconciliation Validation')
console.log('─────────────────────────────────')

test('Each PSP should have: matched + unmatched = todayCredits', () => {
  let allValid = true
  mockPSPReconciliationStatus.forEach(psp => {
    const unmatched = psp.todayCredits - psp.matched
    if (unmatched < 0 || psp.matched > psp.todayCredits) {
      console.log(`   ✗ ${psp.pspName}: matched=${psp.matched}, credits=${psp.todayCredits}`)
      allValid = false
    } else {
      console.log(`   ✓ ${psp.pspName}: ${psp.matched.toLocaleString()} + ${unmatched.toLocaleString()} = ${psp.todayCredits.toLocaleString()}`)
    }
  })
  return allValid
})

test('Total new exceptions from yesterday should be 12', () => {
  const totalExceptions = mockPSPReconciliationStatus.reduce((sum, psp) => sum + psp.exceptions, 0)
  console.log(`   Total new exceptions: ${totalExceptions}`)
  return totalExceptions === 12
})

test('Coverage percentages should be accurate', () => {
  let allValid = true
  mockPSPReconciliationStatus.forEach(psp => {
    const calculatedCoverage = (psp.matched / psp.todayCredits) * 100
    const diff = Math.abs(calculatedCoverage - psp.coveragePct)
    if (diff >= 0.1) {
      console.log(`   ✗ ${psp.pspName}: calculated=${calculatedCoverage.toFixed(2)}%, stored=${psp.coveragePct}%`)
      allValid = false
    } else {
      console.log(`   ✓ ${psp.pspName}: ${psp.coveragePct}%`)
    }
  })
  return allValid
})

// ============================================================================
// Test Suite 3: Exception Counts Validation
// ============================================================================
console.log('\n3. Exception Counts Validation')
console.log('─────────────────────────────────')

test('Exception summary should sum to 60 total open exceptions', () => {
  const totalExceptions = mockExceptionSummary.reduce((sum, ex) => sum + ex.count, 0)
  console.log(`   Exception Summary Total: ${totalExceptions}`)
  console.log(`   Open Exceptions KPI:     ${mockDashboardKPIs.openExceptions}`)
  return totalExceptions === 60 && totalExceptions === mockDashboardKPIs.openExceptions
})

test('Exception aging (< 30 days) should sum to 60 total', () => {
  const total = mockExceptionAgingData.reduce((sum, psp) => {
    return sum + psp.age0to7Days + psp.age8to30Days
  }, 0)
  console.log(`   0-7 days + 8-30 days: ${total}`)
  console.log(`   Open Exceptions KPI:  ${mockDashboardKPIs.openExceptions}`)
  return total === 60 && total === mockDashboardKPIs.openExceptions
})

test('Exception aging breakdown by PSP', () => {
  let allValid = true
  let total0to7 = 0
  let total8to30 = 0
  mockExceptionAgingData.forEach(psp => {
    total0to7 += psp.age0to7Days
    total8to30 += psp.age8to30Days
    console.log(`   ${psp.pspName}: 0-7d=${psp.age0to7Days}, 8-30d=${psp.age8to30Days}`)
  })
  console.log(`   Total: 0-7d=${total0to7}, 8-30d=${total8to30}, Sum=${total0to7 + total8to30}`)
  return (total0to7 + total8to30) === 60
})

// ============================================================================
// Test Suite 4: Open AR Validation
// ============================================================================
console.log('\n4. Open AR Validation')
console.log('─────────────────────────────────')

test('Open AR amount should be greater than Open Exceptions amount', () => {
  console.log(`   Open AR Amount:        ${mockOpenARSummary.totalAmount.toLocaleString()}`)
  console.log(`   Open Exceptions Amount: ${mockDashboardKPIs.exceptionAmountSGD.toLocaleString()}`)
  return mockOpenARSummary.totalAmount > mockDashboardKPIs.exceptionAmountSGD &&
         mockOpenARSummary.totalAmount === 2000000 &&
         mockDashboardKPIs.exceptionAmountSGD === 1500000
})

test('Open AR count should be greater than Open Exceptions count', () => {
  console.log(`   Open AR Count:        ${mockOpenARSummary.totalCount}`)
  console.log(`   Open Exceptions Count: ${mockDashboardKPIs.openExceptions}`)
  return mockOpenARSummary.totalCount > mockDashboardKPIs.openExceptions &&
         mockOpenARSummary.totalCount === 85 &&
         mockDashboardKPIs.openExceptions === 60
})

// ============================================================================
// Test Suite 5: Amount Relationships
// ============================================================================
console.log('\n5. Amount Relationships')
console.log('─────────────────────────────────')

test('Total Bank Credit should be greater than Open AR', () => {
  console.log(`   Total Bank Credit: ${mockDashboardKPIs.totalBankCreditSGD.toLocaleString()}`)
  console.log(`   Open AR Amount:    ${mockOpenARSummary.totalAmount.toLocaleString()}`)
  return mockDashboardKPIs.totalBankCreditSGD > mockOpenARSummary.totalAmount &&
         mockDashboardKPIs.totalBankCreditSGD === 4250000 &&
         mockOpenARSummary.totalAmount === 2000000
})

// ============================================================================
// Test Suite 6: Settlement Payouts Validation
// ============================================================================
console.log('\n6. Settlement Payouts Validation')
console.log('─────────────────────────────────')

test('GrabPay settlements should sum to GrabPay PSP credit', () => {
  const grabpayPSP = mockPSPReconciliationStatus.find(psp => psp.pspId === 'grabpay')
  const grabpaySettlements = mockSettlementPayouts.filter(s => s.pspId === 'grabpay' && s.currency === 'SGD')
  const totalBankCredit = grabpaySettlements.reduce((sum, s) => sum + (s.bankCredit || 0), 0)
  console.log(`   GrabPay Settlements: ${totalBankCredit.toLocaleString()}`)
  console.log(`   GrabPay PSP Credit:  ${grabpayPSP?.todayCredits.toLocaleString()}`)
  return totalBankCredit === grabpayPSP?.todayCredits && totalBankCredit === 3500000
})

test('Stripe settlements should sum to Stripe PSP credit', () => {
  const stripePSP = mockPSPReconciliationStatus.find(psp => psp.pspId === 'stripe')
  const stripeSettlements = mockSettlementPayouts.filter(s => s.pspId === 'stripe')
  const totalBankCredit = stripeSettlements.reduce((sum, s) => sum + (s.bankCredit || 0), 0)
  console.log(`   Stripe Settlements: ${totalBankCredit.toLocaleString()}`)
  console.log(`   Stripe PSP Credit:  ${stripePSP?.todayCredits.toLocaleString()}`)
  return totalBankCredit === stripePSP?.todayCredits && totalBankCredit === 750000
})

// ============================================================================
// Final Results
// ============================================================================
console.log('\n═══════════════════════════════════════════════')
console.log('VALIDATION RESULTS')
console.log('═══════════════════════════════════════════════')
console.log(`Total Tests: ${results.passed + results.failed}`)
console.log(`Passed:      ${results.passed} ✓`)
console.log(`Failed:      ${results.failed} ✗`)
console.log(`Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`)
console.log('═══════════════════════════════════════════════\n')

if (results.failed > 0) {
  console.error('⚠️  VALIDATION FAILED - Data inconsistencies detected!')
  process.exit(1)
} else {
  console.log('✅ ALL VALIDATIONS PASSED - Data is consistent across dashboard and settlements!')
  process.exit(0)
}
