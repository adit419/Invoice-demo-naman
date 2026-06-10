import { mockBankCredits } from '../data/settlementsData.ts'

console.log('═══════════════════════════════════════════════════════════════')
console.log('TOTAL VARIANCE VERIFICATION')
console.log('═══════════════════════════════════════════════════════════════\n')

// Filter SGD credits only (yesterday's credits)
const sgdCredits = mockBankCredits.filter(c => c.currency === 'SGD')

console.log(`Total SGD Bank Credits: ${sgdCredits.length}`)
console.log('')

let totalVariance = 0

sgdCredits.forEach(credit => {
  console.log(`${credit.id}:`)
  console.log(`  Bank Credit: SGD ${credit.amount.toLocaleString()}`)
  console.log(`  Variance: SGD ${credit.variance.toLocaleString()} (${credit.variancePercent.toFixed(2)}%)`)
  console.log(`  Status: ${credit.reconciliationStatus}`)
  console.log('')
  
  totalVariance += Math.abs(credit.variance)
})

console.log('═══════════════════════════════════════════════════════════════')
console.log(`TOTAL VARIANCE (SGD): ${totalVariance.toLocaleString()}`)
console.log('═══════════════════════════════════════════════════════════════')

// Compare with KPI card value
const expectedFromKPI = 503260.13
console.log('')
console.log(`Expected (from KPI card): SGD ${expectedFromKPI.toLocaleString()}`)
console.log(`Calculated (from data): SGD ${totalVariance.toLocaleString()}`)
console.log(`Difference: SGD ${Math.abs(totalVariance - expectedFromKPI).toLocaleString()}`)
console.log(`Match: ${totalVariance === expectedFromKPI ? '✅ YES' : '❌ NO'}`)
