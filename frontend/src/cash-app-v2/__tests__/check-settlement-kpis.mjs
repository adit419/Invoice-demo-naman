import { mockBankCredits } from '../data/settlementsData.ts'

console.log('═══════════════════════════════════════════════════════════════')
console.log('SETTLEMENT EXPLORER KPI EVALUATION')
console.log('═══════════════════════════════════════════════════════════════\n')

// Calculate metrics
const totalBankCredits = mockBankCredits.length

const reconciledCount = mockBankCredits.filter(c => c.reconciliationStatus === 'reconciled').length
const reconciledPercent = totalBankCredits > 0
  ? Math.round((reconciledCount / totalBankCredits) * 100)
  : 0

const unmatchedCount = mockBankCredits.filter(c => c.reconciliationStatus === 'unmatched').length

// Calculate total amounts by currency
const totalBankCreditAmount = mockBankCredits.reduce((acc, credit) => {
  const currency = credit.currency
  acc[currency] = (acc[currency] || 0) + credit.amount
  return acc
}, { SGD: 0, IDR: 0, MYR: 0 })

// Calculate unmatched amounts by currency
const unmatchedAmount = mockBankCredits
  .filter(c => c.reconciliationStatus === 'unmatched')
  .reduce((acc, credit) => {
    const currency = credit.currency
    acc[currency] = (acc[currency] || 0) + credit.amount
    return acc
  }, { SGD: 0, IDR: 0, MYR: 0 })

// Calculate total variance by currency
const totalVariance = mockBankCredits.reduce((acc, credit) => {
  const currency = credit.currency
  acc[currency] = (acc[currency] || 0) + Math.abs(credit.variance)
  return acc
}, { SGD: 0, IDR: 0, MYR: 0 })

// Count exceptions
const totalExceptions = mockBankCredits.reduce((sum, credit) => {
  return sum + (credit.exceptions?.length || 0)
}, 0)

console.log('📊 CARD 1: Total Bank Credits')
console.log('  Main Value:', totalBankCredits)
console.log('  Subtitle:', 'SGD', totalBankCreditAmount.SGD.toLocaleString())
console.log('  ✓ Shows count of yesterday\'s bank credits')
console.log('  ✓ Shows total SGD amount')
console.log('')

console.log('📊 CARD 2: Reconciliation Rate')
console.log('  Main Value:', reconciledPercent + '%')
console.log('  Subtitle:', reconciledCount, 'of', totalBankCredits, 'reconciled')
console.log('  Breakdown:')
mockBankCredits.forEach(c => {
  console.log('    ' + c.id + ':', c.reconciliationStatus)
})
console.log('')

console.log('📊 CARD 3: Unmatched Credits')
console.log('  Main Value:', unmatchedCount)
console.log('  Subtitle: SGD', unmatchedAmount.SGD.toLocaleString())
console.log('  ✓ Shows count of unmatched credits')
console.log('  ✓ Shows total unmatched amount')
console.log('')

console.log('📊 CARD 4: Total Variance')
console.log('  Main Value: SGD', totalVariance.SGD.toLocaleString())
console.log('  Subtitle: Avg reconciliation: 2.1 days')
console.log('  ✓ Shows sum of absolute variances')
console.log('')

console.log('═══════════════════════════════════════════════════════════════')
console.log('ADDITIONAL METRICS')
console.log('═══════════════════════════════════════════════════════════════\n')

console.log('Exceptions linked to yesterday\'s credits:', totalExceptions)
console.log('Bank credits with exceptions:', mockBankCredits.filter(c => c.exceptions && c.exceptions.length > 0).length)
console.log('')

console.log('Status Distribution:')
const statusCounts = mockBankCredits.reduce((acc, c) => {
  acc[c.reconciliationStatus] = (acc[c.reconciliationStatus] || 0) + 1
  return acc
}, {})
Object.entries(statusCounts).forEach(([status, count]) => {
  console.log('  ' + status + ':', count)
})
console.log('')

console.log('Currency Distribution:')
Object.entries(totalBankCreditAmount).forEach(([currency, amount]) => {
  if (amount > 0) {
    console.log('  ' + currency + ':', amount.toLocaleString())
  }
})
console.log('')

console.log('═══════════════════════════════════════════════════════════════')
console.log('VALIDATION CHECKS')
console.log('═══════════════════════════════════════════════════════════════\n')

// Check if total matches dashboard expectation
const dashboardTotal = 4250000 // SGD 4.25M
const difference = Math.abs(totalBankCreditAmount.SGD - dashboardTotal)
const match = difference < 1

console.log('✓ Total Bank Credit SGD:', totalBankCreditAmount.SGD.toLocaleString())
console.log('✓ Expected (Dashboard):', dashboardTotal.toLocaleString())
console.log('✓ Match:', match ? 'YES ✓' : 'NO ✗')
console.log('')

// Check if reconciliation rate is reasonable
const reasonableRate = reconciledPercent >= 70 && reconciledPercent <= 100
console.log('✓ Reconciliation Rate:', reconciledPercent + '%')
console.log('✓ Reasonable (70-100%):', reasonableRate ? 'YES ✓' : 'NO ✗')
console.log('')

// Check if variance is low
const lowVariance = totalVariance.SGD < (totalBankCreditAmount.SGD * 0.01) // Less than 1%
console.log('✓ Total Variance: SGD', totalVariance.SGD.toLocaleString())
console.log('✓ Low variance (<1%):', lowVariance ? 'YES ✓' : 'NO ✗')
console.log('')
