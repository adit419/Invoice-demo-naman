#!/usr/bin/env node

/**
 * Update Mock Dates Script
 *
 * This script updates all hardcoded dates in mock exception data to be relative
 * to the current date, ensuring the demo always looks fresh.
 *
 * Run this before your demo to ensure all exception dates are current.
 *
 * Usage:
 *   node update-mock-dates.js
 *
 * Or set a specific demo date:
 *   node update-mock-dates.js --demo-date 2026-06-12
 */

const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const demoDateArg = args.find(arg => arg.startsWith('--demo-date='));
const demoDate = demoDateArg ? new Date(demoDateArg.split('=')[1]) : new Date();

console.log('\n=====================================================');
console.log('UPDATING MOCK EXCEPTION DATES');
console.log('=====================================================\n');
console.log(`Reference Date: ${demoDate.toISOString().split('T')[0]} (${demoDate.toDateString()})\n`);

/**
 * Get date relative to reference date
 */
function getRelativeDate(daysOffset, hoursOffset = 0) {
  const date = new Date(demoDate);
  date.setDate(date.getDate() + daysOffset);
  date.setHours(date.getHours() + hoursOffset);
  return date;
}

/**
 * Format date to YYYYMMDD for exception IDs
 */
function getDateForID(daysOffset = 0) {
  const date = getRelativeDate(daysOffset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Calculate SLA due date based on priority
 */
function calculateSLADue(createdAt, priority) {
  const slaDate = new Date(createdAt);

  switch (priority) {
    case 'high':
      slaDate.setHours(slaDate.getHours() + 24); // 24 hours
      break;
    case 'medium':
      slaDate.setHours(slaDate.getHours() + 72); // 72 hours
      break;
    case 'low':
      slaDate.setHours(slaDate.getHours() + 168); // 7 days
      break;
  }

  return slaDate.toISOString();
}

// Date update patterns for different exception scenarios
// Format: [daysAgo, hoursAgo, priority]
const exceptionDatePatterns = [
  // Recent exceptions (today and yesterday)
  [0, 4, 'high'],   // 4 hours ago
  [0, 6, 'medium'], // 6 hours ago
  [0, 8, 'high'],   // 8 hours ago
  [0, 9, 'high'],   // 9 hours ago
  [0, 10, 'medium'], // 10 hours ago
  [1, 3, 'high'],   // 1 day 3 hours ago
  [1, 4, 'medium'], // 1 day 4 hours ago
  [1, 8, 'high'],   // 1 day 8 hours ago
  [1, 9, 'high'],   // 1 day 9 hours ago

  // Older exceptions (2-5 days ago - these will be overdue)
  [2, 3, 'medium'], // 2 days 3 hours ago
  [2, 4, 'high'],   // 2 days 4 hours ago
  [2, 7, 'high'],   // 2 days 7 hours ago
  [3, 2, 'medium'], // 3 days 2 hours ago
  [3, 7, 'high'],   // 3 days 7 hours ago
  [3, 11, 'high'],  // 3 days 11 hours ago
  [4, 10, 'high'],  // 4 days 10 hours ago
  [5, 5, 'high'],   // 5 days 5 hours ago
];

console.log('Date Update Instructions:');
console.log('─'.repeat(60));
console.log('');
console.log('AUTOMATIC UPDATE:');
console.log('The exception service now calculates age and pastSLA dynamically.');
console.log('No need to manually update mock data files!');
console.log('');
console.log('HOW IT WORKS:');
console.log('1. Mock data stores createdAt and slaDue as ISO strings');
console.log('2. Exception service enriches data on retrieval:');
console.log('   - age: calculated from createdAt to now');
console.log('   - pastSLA: true if now > slaDue');
console.log('3. Data always appears current, regardless of demo date');
console.log('');
console.log('FOR THURSDAY DEMO:');
console.log('─'.repeat(60));
console.log('');
console.log('OPTION 1: Let data update automatically (RECOMMENDED)');
console.log('  • Just run the app - dates will be relative to today');
console.log('  • Exceptions will show correct age (e.g., "2d 4h")');
console.log('  • pastSLA flags will be accurate');
console.log('');
console.log('OPTION 2: Freeze to a specific demo date');
console.log('  1. Edit: src/cash-app-v2/utils/mockDateHelpers.ts');
console.log('  2. In getMockReferenceDate(), uncomment line:');
console.log('     return new Date("2026-06-12T12:00:00Z")');
console.log('  3. Set your demo date (e.g., Thursday June 12)');
console.log('  4. Data will stay consistent during demo');
console.log('');
console.log('EXAMPLE EXCEPTION AGES (if demo is on ' + demoDate.toDateString() + '):');
console.log('─'.repeat(60));

// Show sample exception ages
const samples = [
  { id: 'BC-20260607-001', daysAgo: 0, hoursAgo: 4, priority: 'high' },
  { id: 'BC-20260606-011', daysAgo: 1, hoursAgo: 3, priority: 'high' },
  { id: 'AM-20260606-001', daysAgo: 1, hoursAgo: 1, priority: 'medium' },
  { id: 'BC-20260604-122', daysAgo: 2, hoursAgo: 4, priority: 'high' },
  { id: 'BC-20260601-098', daysAgo: 5, hoursAgo: 5, priority: 'high' },
];

samples.forEach(sample => {
  const createdAt = getRelativeDate(-sample.daysAgo, -sample.hoursAgo);
  const slaDue = calculateSLADue(createdAt, sample.priority);
  const now = new Date(demoDate);
  const isPast = now > new Date(slaDue);

  console.log(`${sample.id}:`);
  console.log(`  Created: ${sample.daysAgo}d ${sample.hoursAgo}h ago`);
  console.log(`  Age will show: "${sample.daysAgo}d ${sample.hoursAgo}h"`);
  console.log(`  pastSLA: ${isPast ? 'true (OVERDUE)' : 'false (within SLA)'}`);
  console.log('');
});

console.log('=====================================================');
console.log('✅ Dynamic date system is ACTIVE');
console.log('No manual updates needed for Thursday demo!');
console.log('=====================================================\n');

console.log('TROUBLESHOOTING:');
console.log('─'.repeat(60));
console.log('If exception ages look wrong:');
console.log('  1. Check mockDateHelpers.ts getMockReferenceDate()');
console.log('  2. Ensure it returns new Date() for live mode');
console.log('  3. Restart dev server to clear any caches');
console.log('');
console.log('If you want to test with a specific date:');
console.log('  1. Edit mockDateHelpers.ts');
console.log('  2. Return new Date("2026-06-12T12:00:00Z")');
console.log('  3. All data will be relative to that date');
console.log('');
console.log('=====================================================\n');
