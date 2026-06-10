import { settlementsService } from '../services/index.ts'

const kpis = await settlementsService.getSettlementKPIs()

console.log('═══════════════════════════════════════════════════════════════')
console.log('SETTLEMENT EXPLORER KPIs (from Service)')
console.log('═══════════════════════════════════════════════════════════════\n')

console.log('📊 CARD 2: Reconciliation Rate')
console.log('  Main Value:', kpis.reconciledPercent + '%')
console.log('  T1 (Settlement): ' + kpis.reconciledCount + ' of ' + kpis.totalBankCredits + ' matched to PSP')
console.log('  T2 (Orders): ' + kpis.creditsWithExceptions + ' credits have exceptions')
console.log('')

console.log('Calculation Details:')
console.log('  reconciledCount = credits with status "reconciled" OR "matched_l1"')
console.log('  = 5 (reconciled) + 2 (matched_l1)')
console.log('  = 7')
console.log('')
console.log('  reconciledPercent = (7 / 9) × 100 = ' + kpis.reconciledPercent + '%')
console.log('')

console.log('What the UI shows:')
console.log('  Value: ' + kpis.reconciledPercent + '%')
console.log('  Line 1: ' + kpis.reconciledCount + ' of ' + kpis.totalBankCredits + ' matched to PSP (T1)')
console.log('  Line 2: ' + kpis.creditsWithExceptions + ' credits have order exceptions (T2)')
console.log('')

console.log('✅ This clearly separates T1 and T2 metrics!')
