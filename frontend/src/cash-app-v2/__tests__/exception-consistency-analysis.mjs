/**
 * Exception Consistency Analysis
 * Analyzes exceptions across Dashboard, Exception Workspace, and Settlement Explorer
 */

import {
  mockDashboardKPIs,
  mockExceptions,
  mockExceptionSummary,
  mockExceptionAgingData
} from '../data/mockData.ts'
import { mockBankCredits } from '../data/settlementsData.ts'

console.log('\n╔════════════════════════════════════════════════════════════════╗')
console.log('║  EXCEPTION CONSISTENCY ANALYSIS                                ║')
console.log('╚════════════════════════════════════════════════════════════════╝\n')

// ============================================================================
// SECTION 1: DASHBOARD KPIs
// ============================================================================
console.log('═══════════════════════════════════════════════════════════════')
console.log('SECTION 1: DASHBOARD KPIs')
console.log('═══════════════════════════════════════════════════════════════\n')

console.log(`Open Exceptions Count: ${mockDashboardKPIs.openExceptions}`)
console.log(`Exception Amount (SGD): ${mockDashboardKPIs.exceptionAmountSGD.toLocaleString()}`)
console.log(`Exception Amount (IDR): ${mockDashboardKPIs.exceptionAmountIDR.toLocaleString()}\n`)

// ============================================================================
// SECTION 2: EXCEPTION WORKSPACE (mockExceptions array)
// ============================================================================
console.log('═══════════════════════════════════════════════════════════════')
console.log('SECTION 2: EXCEPTION WORKSPACE (mockExceptions array)')
console.log('═══════════════════════════════════════════════════════════════\n')

console.log(`Total Exceptions in Array: ${mockExceptions.length}`)

const sgdExceptions = mockExceptions.filter(e => e.currency === 'SGD')
const idrExceptions = mockExceptions.filter(e => e.currency === 'IDR')

console.log(`SGD Exceptions: ${sgdExceptions.length}`)
console.log(`SGD Total Amount: ${sgdExceptions.reduce((sum, e) => sum + e.amount, 0).toLocaleString()}`)
console.log(`IDR Exceptions: ${idrExceptions.length}`)
console.log(`IDR Total Amount: ${idrExceptions.reduce((sum, e) => sum + e.amount, 0).toLocaleString()}\n`)

// Exception types breakdown
const byType = {}
mockExceptions.forEach(e => {
  byType[e.type] = (byType[e.type] || 0) + 1
})
console.log('By Type:')
Object.keys(byType).forEach(type => {
  console.log(`  ${type}: ${byType[type]}`)
})
console.log('')

// ============================================================================
// SECTION 3: EXCEPTION SUMMARY (Chart Data)
// ============================================================================
console.log('═══════════════════════════════════════════════════════════════')
console.log('SECTION 3: EXCEPTION SUMMARY (Chart Data)')
console.log('═══════════════════════════════════════════════════════════════\n')

const summaryTotal = mockExceptionSummary.reduce((sum, e) => sum + e.count, 0)
console.log(`Exception Summary Total: ${summaryTotal}`)
mockExceptionSummary.forEach(item => {
  console.log(`  ${item.type}: ${item.count}`)
})
console.log('')

// ============================================================================
// SECTION 4: EXCEPTION AGING (Chart Data)
// ============================================================================
console.log('═══════════════════════════════════════════════════════════════')
console.log('SECTION 4: EXCEPTION AGING (Chart Data)')
console.log('═══════════════════════════════════════════════════════════════\n')

let age0to7 = 0
let age8to30 = 0
let age1to3M = 0
let ageOver3M = 0

mockExceptionAgingData.forEach(psp => {
  age0to7 += psp.age0to7Days
  age8to30 += psp.age8to30Days
  age1to3M += psp.age1to3Months
  ageOver3M += psp.ageOver3Months
  console.log(`${psp.pspName}: 0-7d=${psp.age0to7Days}, 8-30d=${psp.age8to30Days}, 1-3m=${psp.age1to3Months}, >3m=${psp.ageOver3Months}`)
})

const under30Days = age0to7 + age8to30
const over30Days = age1to3M + ageOver3M
const agingTotal = under30Days + over30Days

console.log(`\nTotals:`)
console.log(`  0-7 days: ${age0to7}`)
console.log(`  8-30 days: ${age8to30}`)
console.log(`  < 30 days: ${under30Days}`)
console.log(`  1-3 months: ${age1to3M}`)
console.log(`  > 3 months: ${ageOver3M}`)
console.log(`  >= 30 days: ${over30Days}`)
console.log(`  Grand Total: ${agingTotal}\n`)

// ============================================================================
// SECTION 5: SETTLEMENT EXPLORER (Bank Credits with Exceptions)
// ============================================================================
console.log('═══════════════════════════════════════════════════════════════')
console.log('SECTION 5: SETTLEMENT EXPLORER (Bank Credits with Exceptions)')
console.log('═══════════════════════════════════════════════════════════════\n')

let settlementExceptionCount = 0
let settlementExceptionAmountSGD = 0

mockBankCredits.forEach(credit => {
  if (credit.exceptions && credit.exceptions.length > 0) {
    settlementExceptionCount += credit.exceptions.length
    credit.exceptions.forEach(ex => {
      if (credit.currency === 'SGD') {
        settlementExceptionAmountSGD += (ex.amount || credit.amount)
      }
    })
    console.log(`  ${credit.id}: ${credit.exceptions.length} exception(s)`)
  }
})

console.log(`\nTotal Exceptions in Settlement Explorer: ${settlementExceptionCount}`)
console.log(`Total SGD Amount: ${settlementExceptionAmountSGD.toLocaleString()}\n`)

// ============================================================================
// SECTION 6: INCONSISTENCIES DETECTED
// ============================================================================
console.log('═══════════════════════════════════════════════════════════════')
console.log('SECTION 6: INCONSISTENCIES DETECTED')
console.log('═══════════════════════════════════════════════════════════════\n')

const issues = []

// Check 1: Dashboard vs Exception Workspace count
if (mockDashboardKPIs.openExceptions !== mockExceptions.length) {
  issues.push({
    issue: 'Exception Count Mismatch',
    expected: `${mockDashboardKPIs.openExceptions} (Dashboard)`,
    actual: `${mockExceptions.length} (Exception Workspace)`,
    severity: 'HIGH'
  })
}

// Check 2: Dashboard vs Exception Summary
if (mockDashboardKPIs.openExceptions !== summaryTotal) {
  issues.push({
    issue: 'Dashboard vs Summary Mismatch',
    expected: `${mockDashboardKPIs.openExceptions} (Dashboard)`,
    actual: `${summaryTotal} (Exception Summary)`,
    severity: 'MEDIUM'
  })
}

// Check 3: Dashboard vs Aging (< 30 days)
if (mockDashboardKPIs.openExceptions !== under30Days) {
  issues.push({
    issue: 'Dashboard vs Aging < 30 days Mismatch',
    expected: `${mockDashboardKPIs.openExceptions} (Dashboard)`,
    actual: `${under30Days} (Aging < 30 days)`,
    severity: 'MEDIUM'
  })
}

// Check 4: SGD Amount mismatch
const sgdAmountActual = sgdExceptions.reduce((sum, e) => sum + e.amount, 0)
if (mockDashboardKPIs.exceptionAmountSGD !== sgdAmountActual) {
  issues.push({
    issue: 'SGD Amount Mismatch',
    expected: `SGD ${mockDashboardKPIs.exceptionAmountSGD.toLocaleString()} (Dashboard)`,
    actual: `SGD ${sgdAmountActual.toLocaleString()} (Exception Workspace)`,
    severity: 'HIGH'
  })
}

// Check 5: Settlement Explorer has exceptions
if (settlementExceptionCount === 0) {
  issues.push({
    issue: 'No Exceptions in Settlement Explorer',
    expected: `${mockDashboardKPIs.openExceptions} exceptions`,
    actual: `0 exceptions`,
    severity: 'CRITICAL'
  })
}

if (issues.length === 0) {
  console.log('✅ NO INCONSISTENCIES FOUND - All exception data is consistent!\n')
} else {
  console.log(`❌ ${issues.length} INCONSISTENCIES FOUND:\n`)
  issues.forEach((issue, index) => {
    console.log(`${index + 1}. [${issue.severity}] ${issue.issue}`)
    console.log(`   Expected: ${issue.expected}`)
    console.log(`   Actual:   ${issue.actual}\n`)
  })
}

// ============================================================================
// SECTION 7: RECOMMENDATIONS
// ============================================================================
console.log('═══════════════════════════════════════════════════════════════')
console.log('SECTION 7: RECOMMENDATIONS')
console.log('═══════════════════════════════════════════════════════════════\n')

if (issues.length > 0) {
  console.log('To fix these inconsistencies:')
  console.log('1. Update mockExceptions array to have exactly 60 exceptions (< 30 days old)')
  console.log('2. Ensure SGD exceptions total exactly SGD 1,500,000')
  console.log('3. Link these 60 exceptions to bank credits in Settlement Explorer')
  console.log('4. Verify mockExceptionSummary totals to 60')
  console.log('5. Verify mockExceptionAgingData < 30 days totals to 60')
  console.log('')
}

console.log('╚════════════════════════════════════════════════════════════════╝\n')

process.exit(issues.length > 0 ? 1 : 0)
