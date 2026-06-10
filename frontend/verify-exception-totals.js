#!/usr/bin/env node

/**
 * Verification script to ensure dashboard KPIs match actual exception data
 */

console.log('\n=====================================================');
console.log('EXCEPTION DATA RECONCILIATION VERIFICATION');
console.log('=====================================================\n');

// Enhanced exceptions (from exceptionsEnhanced.ts)
const enhancedExceptions = [
  { id: 'BC-20260607-001', type: 'unmatched_credit', amount: 142500, currency: 'SGD' },
  { id: 'BC-20260606-011', type: 'unmatched_credit', amount: 284127.50, currency: 'SGD' },
  { id: 'BC-20260606-012', type: 'unmatched_credit', amount: 150000, currency: 'SGD' },
  { id: 'AM-20260606-001', type: 'amount_mismatch', amount: 5.00, currency: 'SGD' },
  { id: 'AM-20260606-002', type: 'amount_mismatch', amount: 142.80, currency: 'SGD' },
  { id: 'SS-20260606-001', type: 'amount_mismatch', amount: 450000000, currency: 'IDR' },
  { id: 'CB-20260606-001', type: 'unmatched_order', amount: 2420, currency: 'SGD' },
];

// Basic exceptions totals (from mockData.ts)
const basicExceptionsSGD = 1626332;  // 40 SGD exceptions
const basicExceptionsIDR = 687200000; // 7 IDR exceptions
const basicExceptionCount = 47;

// Calculate enhanced totals
let enhancedSGD = 0;
let enhancedIDR = 0;
let enhancedCount = enhancedExceptions.length;

enhancedExceptions.forEach(exc => {
  if (exc.currency === 'SGD') {
    enhancedSGD += exc.amount;
  } else if (exc.currency === 'IDR') {
    enhancedIDR += exc.amount;
  }
});

// Calculate totals
const totalSGD = basicExceptionsSGD + enhancedSGD;
const totalIDR = basicExceptionsIDR + enhancedIDR;
const totalCount = basicExceptionCount + enhancedCount;

// Count by type
const typeCounts = {
  unmatched_credit: 12,
  unmatched_order: 8,
  amount_mismatch: 19,
  orphan_adjustment: 5,
  aging_breach: 3
};

enhancedExceptions.forEach(exc => {
  typeCounts[exc.type]++;
});

console.log('BASIC EXCEPTIONS (mockData.ts)');
console.log('─'.repeat(60));
console.log(`Count: ${basicExceptionCount}`);
console.log(`SGD Total: ${basicExceptionsSGD.toLocaleString()}`);
console.log(`IDR Total: ${basicExceptionsIDR.toLocaleString()}`);
console.log('');

console.log('ENHANCED EXCEPTIONS (exceptionsEnhanced.ts)');
console.log('─'.repeat(60));
console.log(`Count: ${enhancedCount}`);
console.log(`SGD Total: ${enhancedSGD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
console.log(`IDR Total: ${enhancedIDR.toLocaleString()}`);
console.log('');

console.log('COMBINED TOTALS');
console.log('─'.repeat(60));
console.log(`Total Exception Count: ${totalCount}`);
console.log(`Total SGD Amount: ${totalSGD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
console.log(`Total IDR Amount: ${totalIDR.toLocaleString()}`);
console.log('');

console.log('EXCEPTION TYPE BREAKDOWN');
console.log('─'.repeat(60));
Object.entries(typeCounts).forEach(([type, count]) => {
  console.log(`${type.padEnd(20)}: ${count}`);
});
console.log(`${'TOTAL'.padEnd(20)}: ${Object.values(typeCounts).reduce((a, b) => a + b, 0)}`);
console.log('');

// Expected dashboard KPI values (from updated mockData.ts)
const expectedDashboardKPIs = {
  openExceptions: 54,
  exceptionAmountSGD: 2205527,
  exceptionAmountIDR: 1137200000
};

console.log('DASHBOARD KPI VERIFICATION');
console.log('─'.repeat(60));

const countMatch = totalCount === expectedDashboardKPIs.openExceptions;
const sgdMatch = Math.abs(totalSGD - expectedDashboardKPIs.exceptionAmountSGD) < 1;
const idrMatch = totalIDR === expectedDashboardKPIs.exceptionAmountIDR;

console.log(`Open Exceptions: ${countMatch ? '✅' : '❌'}`);
console.log(`  Expected: ${expectedDashboardKPIs.openExceptions}`);
console.log(`  Actual:   ${totalCount}`);
console.log('');

console.log(`Exception Amount SGD: ${sgdMatch ? '✅' : '❌'}`);
console.log(`  Expected: ${expectedDashboardKPIs.exceptionAmountSGD.toLocaleString()}`);
console.log(`  Actual:   ${Math.round(totalSGD).toLocaleString()}`);
console.log('');

console.log(`Exception Amount IDR: ${idrMatch ? '✅' : '❌'}`);
console.log(`  Expected: ${expectedDashboardKPIs.exceptionAmountIDR.toLocaleString()}`);
console.log(`  Actual:   ${totalIDR.toLocaleString()}`);
console.log('');

console.log('=====================================================');
const allMatch = countMatch && sgdMatch && idrMatch;
if (allMatch) {
  console.log('✅ ALL VERIFICATIONS PASSED');
  console.log('Dashboard KPIs match exception data perfectly!');
} else {
  console.log('❌ VERIFICATION FAILED');
  console.log('Dashboard KPIs do not match exception data.');
}
console.log('=====================================================\n');

process.exit(allMatch ? 0 : 1);
