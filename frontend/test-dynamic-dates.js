#!/usr/bin/env node

/**
 * Test Dynamic Date Calculation in Exception NBAs
 *
 * This script simulates what BC-20260607-001 and CB-20260606-001 will show
 * on different demo dates.
 */

// Simulate the date helper functions
function getMockReferenceDate() {
  // Change this to test different demo dates
  return new Date() // Or: new Date('2026-06-11T12:00:00Z') for specific date
}

function calculateExpectedFileArrival(transactionDate, settlementLag = 1, arrivalTime = '18:00') {
  const txnDate = new Date(transactionDate)
  const expectedDate = new Date(txnDate)
  expectedDate.setDate(expectedDate.getDate() + settlementLag)

  const [hours, minutes] = arrivalTime.split(':').map(Number)
  expectedDate.setHours(hours, minutes, 0, 0)

  const now = getMockReferenceDate()
  const diffMs = expectedDate.getTime() - now.getTime()
  const hoursRemaining = diffMs / (1000 * 60 * 60)

  const formattedDate = expectedDate.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })

  const formattedTime = `${arrivalTime} SGT`

  let inHoursText
  if (hoursRemaining < 0) {
    const absHours = Math.abs(Math.round(hoursRemaining * 10) / 10)
    inHoursText = `overdue by ${absHours} hours`
  } else if (hoursRemaining < 24) {
    inHoursText = `in ${Math.round(hoursRemaining * 10) / 10} hours`
  } else {
    const days = Math.floor(hoursRemaining / 24)
    const hours = Math.round((hoursRemaining % 24) * 10) / 10
    inHoursText = `in ${days}d ${hours}h`
  }

  return { formattedDate, formattedTime, hoursRemaining, inHoursText }
}

function calculateChargebackDeadline(chargebackDate, windowDays = 7) {
  const cbDate = new Date(chargebackDate)
  const deadline = new Date(cbDate)
  deadline.setDate(deadline.getDate() + windowDays)
  deadline.setHours(23, 59, 59, 999)

  const now = getMockReferenceDate()
  const diffMs = deadline.getTime() - now.getTime()
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  const formattedDeadline = deadline.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })

  let statusText
  if (daysRemaining < 0) {
    statusText = `deadline passed ${Math.abs(daysRemaining)} days ago`
  } else if (daysRemaining === 0) {
    statusText = `deadline today`
  } else if (daysRemaining === 1) {
    statusText = `1 day remaining`
  } else {
    statusText = `${daysRemaining} days remaining`
  }

  return { formattedDeadline, daysRemaining, statusText }
}

console.log('\n=====================================================')
console.log('DYNAMIC DATE CALCULATION TEST')
console.log('=====================================================\n')

const now = getMockReferenceDate()
console.log(`Demo Date: ${now.toDateString()} ${now.toLocaleTimeString()}\n`)

// Test BC-20260607-001
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('BC-20260607-001: PSP File Expected')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

const createdAt = '2026-06-07T08:30:00Z'
const fileArrival = calculateExpectedFileArrival(createdAt, 1, '18:00')

console.log(`Created: ${new Date(createdAt).toLocaleString()}`)
console.log(`\nExpected PSP File Arrival:`)
console.log(`  Date: ${fileArrival.formattedDate}`)
console.log(`  Time: ${fileArrival.formattedTime}`)
console.log(`  Status: ${fileArrival.inHoursText}`)
console.log(`  Hours: ${fileArrival.hoursRemaining.toFixed(1)}h`)

console.log(`\n📋 Diagnostic Finding:`)
console.log(`  "${`PSP settlement file GrabPay-SGD-Daily-20260607.csv expected ${fileArrival.formattedDate} ${fileArrival.formattedTime} (${fileArrival.inHoursText})`}"`)

console.log(`\n🎯 NBA Description:`)
if (fileArrival.hoursRemaining > 0) {
  console.log(`  "System will automatically re-attempt matching when GrabPay settlement file arrives`)
  console.log(`   (expected ${fileArrival.formattedDate} at ${fileArrival.formattedTime}, ${fileArrival.inHoursText}).`)
  console.log(`   No manual intervention required unless file does not arrive."`)
  console.log(`\n  Priority: AUTO`)
  console.log(`  Action: hold_and_retry`)
} else {
  console.log(`  "PSP settlement file was expected ${fileArrival.formattedDate} at ${fileArrival.formattedTime}`)
  console.log(`   but has not been received (${fileArrival.inHoursText}).`)
  console.log(`   Generate inquiry to GrabPay settlement team to provide missing file."`)
  console.log(`\n  Priority: HUMAN_INVESTIGATE`)
  console.log(`  Action: escalate_missing_file`)
}

// Test CB-20260606-001
console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('CB-20260606-001: Chargeback Deadline')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

const chargebackDate = '2026-06-06T14:00:00Z'
const cbDeadline = calculateChargebackDeadline(chargebackDate, 7)

console.log(`Chargeback Received: ${new Date(chargebackDate).toLocaleString()}`)
console.log(`\nRepresentment Deadline:`)
console.log(`  Date: ${cbDeadline.formattedDeadline}`)
console.log(`  Status: ${cbDeadline.statusText}`)
console.log(`  Days Remaining: ${cbDeadline.daysRemaining}`)

console.log(`\n📋 Diagnostic Finding:`)
console.log(`  "Stage: First chargeback. Reason code: 13.1 (Merchandise/Services Not Received).`)
console.log(`   Representment deadline: ${cbDeadline.formattedDeadline} (${cbDeadline.statusText})"`)

console.log(`\n🎯 NBA Description:`)
console.log(`  "First chargeback received. Customer claims non-delivery.`)
console.log(`   Evidence deadline: ${cbDeadline.formattedDeadline} (${cbDeadline.statusText}).`)
console.log(`   Evidence available: delivery confirmation, driver GPS log.`)
console.log(`   Win probability: 65% based on similar cases with GPS evidence. Submit representment."`)

console.log('\n\n=====================================================')
console.log('KEY INSIGHTS')
console.log('=====================================================\n')

if (fileArrival.hoursRemaining > 0) {
  console.log('✅ PSP File: Still pending - shows AUTO-HOLD with precise countdown')
} else {
  console.log('⚠️  PSP File: OVERDUE - automatically switches to escalation workflow')
}

if (cbDeadline.daysRemaining > 0) {
  console.log(`✅ Chargeback: ${cbDeadline.daysRemaining} days to respond - shows deadline clearly`)
} else if (cbDeadline.daysRemaining === 0) {
  console.log('⚠️  Chargeback: Deadline TODAY - urgent action required')
} else {
  console.log('❌ Chargeback: Deadline PASSED - shows how many days overdue')
}

console.log('\n=====================================================')
console.log('DEMO TALKING POINTS')
console.log('=====================================================\n')

console.log('For BC-20260607-001:')
if (fileArrival.hoursRemaining > 0) {
  console.log(`  "The system knows GrabPay settles T+1 at 18:00 SGT. It calculated the`)
  console.log(`   file will arrive ${fileArrival.formattedDate} at ${fileArrival.formattedTime} - that's ${fileArrival.inHoursText}.`)
  console.log(`   Instead of having an analyst monitor this, the system auto-holds and will`)
  console.log(`   retry matching when the file arrives. Zero manual intervention."`)
} else {
  console.log(`  "The system expected the file ${fileArrival.formattedDate} at ${fileArrival.formattedTime}.`)
  console.log(`   It's now ${fileArrival.inHoursText}. The system automatically detected this`)
  console.log(`   and switched from auto-hold to escalation mode, generating an inquiry`)
  console.log(`   to the PSP team. It adapts based on real-time conditions."`)
}

console.log(`\nFor CB-20260606-001:`)
console.log(`  "Chargeback for SGD 2,420. Deadline is ${cbDeadline.formattedDeadline} - that's ${cbDeadline.statusText}.`)
console.log(`   System pulled evidence automatically: driver confirmed, GPS proof available.`)
console.log(`   Based on historical data, cases with GPS evidence have 65% win probability.`)
console.log(`   System recommends fighting this instead of accepting the loss. This is`)
console.log(`   data-driven decision making that saves money."`)

console.log('\n=====================================================\n')
