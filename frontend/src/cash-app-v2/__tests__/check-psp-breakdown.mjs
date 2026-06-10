import { mockExceptions } from '../data/mockData.ts'

const sgdExceptions = mockExceptions.filter(e => e.currency === 'SGD')
const grabpayExceptions = sgdExceptions.filter(e => e.psp === 'grabpay')
const stripeExceptions = sgdExceptions.filter(e => e.psp === 'stripe')

console.log('Total SGD exceptions:', sgdExceptions.length)
console.log('GrabPay SGD exceptions:', grabpayExceptions.length)
console.log('Stripe SGD exceptions:', stripeExceptions.length)

// Check for other PSPs
const otherPSPs = sgdExceptions.filter(e => e.psp !== 'grabpay' && e.psp !== 'stripe')
console.log('Other PSPs SGD exceptions:', otherPSPs.length)

if (otherPSPs.length > 0) {
  console.log('\nOther PSPs found:')
  const pspCounts = {}
  otherPSPs.forEach(e => {
    pspCounts[e.psp] = (pspCounts[e.psp] || 0) + 1
  })
  Object.entries(pspCounts).forEach(([psp, count]) => {
    console.log(`  ${psp}: ${count}`)
  })
}

// Show distribution verification
console.log('\nExpected distribution in Settlement Explorer:')
console.log('  GrabPay (7 credits):', grabpayExceptions.length, 'exceptions')
console.log('  Stripe (2 credits):', stripeExceptions.length, 'exceptions')
console.log('  Total:', grabpayExceptions.length + stripeExceptions.length, 'exceptions')
