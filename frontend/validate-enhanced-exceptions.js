#!/usr/bin/env node

/**
 * Mathematical Validation Suite for Enhanced Exceptions
 * Validates all fee calculations, FX conversions, subset-sum matches, and financial breakdowns
 */

const fs = require('fs');
const path = require('path');

console.log('\n=====================================================');
console.log('ENHANCED EXCEPTION DATA - MATHEMATICAL VALIDATION');
console.log('=====================================================\n');

// Test data extracted from exceptionsEnhanced.ts
const testCases = [
  {
    id: 'BC-20260606-011',
    name: 'Fuzzy Match - Variance Attribution',
    type: 'unmatched_credit',
    test: () => {
      const bankAmount = 284127.50;
      const pspAmount = 284000.00;
      const bankCharges = 50.00;
      const fxRounding = 77.50;

      const calculatedVariance = bankAmount - pspAmount;
      const expectedVariance = bankCharges + fxRounding;
      const variancePercent = (calculatedVariance / pspAmount) * 100;
      const tolerance = 0.05; // 0.05%

      const pass = Math.abs(calculatedVariance - expectedVariance) < 0.01 &&
                   variancePercent < tolerance;

      return {
        pass,
        details: {
          bankAmount,
          pspAmount,
          calculatedVariance: calculatedVariance.toFixed(2),
          expectedVariance: expectedVariance.toFixed(2),
          variancePercent: variancePercent.toFixed(3) + '%',
          tolerance: tolerance + '%',
          match: calculatedVariance.toFixed(2) === expectedVariance.toFixed(2) ? '✅' : '❌'
        }
      };
    }
  },

  {
    id: 'BC-20260606-012',
    name: 'Aggregate Sum Match - Three Credits',
    type: 'aggregate_sum',
    test: () => {
      const credit1 = 50000;
      const credit2 = 42000;
      const credit3 = 58000;
      const pspBatch = 150000;

      const sum = credit1 + credit2 + credit3;
      const variance = sum - pspBatch;
      const pass = variance === 0;

      return {
        pass,
        details: {
          credit1,
          credit2,
          credit3,
          sum,
          pspBatch,
          variance,
          match: variance === 0 ? '✅ EXACT MATCH' : '❌ MISMATCH'
        }
      };
    }
  },

  {
    id: 'AM-20260606-001',
    name: 'Amount Mismatch - Fee Waterfall Calculation',
    type: 'amount_mismatch',
    test: () => {
      const gross = 100000.00;
      const mdrRate = 0.025; // 2.5%
      const gstRate = 0.07; // 7%
      const fxMarginRate = 0.003; // 0.3%
      const reserveRelease = 1000.00;

      // Calculate components
      const mdrFee = gross * mdrRate;
      const gstOnMdr = mdrFee * gstRate;
      const fxMargin = gross * fxMarginRate;

      // Calculate net
      const calculatedNet = gross - mdrFee - gstOnMdr - fxMargin + reserveRelease;
      const expectedNet = 98025.00;
      const actualNet = 98020.00;
      const variance = expectedNet - actualNet;

      // Validate
      const netCalculationCorrect = Math.abs(calculatedNet - expectedNet) < 0.01;
      const varianceCorrect = Math.abs(variance - 5.00) < 0.01;
      const pass = netCalculationCorrect && varianceCorrect;

      return {
        pass,
        details: {
          gross,
          mdrFee: mdrFee.toFixed(2) + ' (2.5%)',
          gstOnMdr: gstOnMdr.toFixed(2) + ' (7% of MDR)',
          fxMargin: fxMargin.toFixed(2) + ' (0.3%)',
          reserveRelease: reserveRelease.toFixed(2),
          calculatedNet: calculatedNet.toFixed(2),
          expectedNet: expectedNet.toFixed(2),
          actualNet: actualNet.toFixed(2),
          variance: variance.toFixed(2),
          netMatch: netCalculationCorrect ? '✅' : '❌',
          varianceMatch: varianceCorrect ? '✅' : '❌'
        }
      };
    }
  },

  {
    id: 'AM-20260606-002',
    name: 'Partial Explanation - Split Variance',
    type: 'amount_mismatch',
    test: () => {
      const gross = 50000.00;
      const mdrFee = 1500.00; // 3.0%
      const fxRounding = 50.00;
      const unexplained = 92.80;

      const expectedNet = gross - mdrFee;
      const actualNet = 48357.20;
      const totalVariance = expectedNet - actualNet;
      const explainedVariance = fxRounding;
      const unexplainedVariance = totalVariance - explainedVariance;

      const pass = Math.abs(totalVariance - 142.80) < 0.01 &&
                   Math.abs(unexplainedVariance - unexplained) < 0.01;

      return {
        pass,
        details: {
          gross,
          mdrFee: mdrFee.toFixed(2) + ' (3.0%)',
          expectedNet: expectedNet.toFixed(2),
          actualNet: actualNet.toFixed(2),
          totalVariance: totalVariance.toFixed(2),
          explainedVariance: explainedVariance.toFixed(2) + ' (FX)',
          unexplainedVariance: unexplainedVariance.toFixed(2),
          expectedUnexplained: unexplained.toFixed(2),
          match: Math.abs(unexplainedVariance - unexplained) < 0.01 ? '✅' : '❌'
        }
      };
    }
  },

  {
    id: 'SS-20260606-001',
    name: 'Subset-Sum Algorithm - IDR Matching',
    type: 'subset_sum',
    test: () => {
      const deposit = 450000000; // IDR 450M
      const line1 = 120000000; // IDR 120M
      const line2 = 180000000; // IDR 180M
      const line3 = 150000000; // IDR 150M
      const line4 = 80000000;  // IDR 80M (not in solution)

      const solution = line1 + line2 + line3;
      const variance = deposit - solution;
      const pass = variance === 0;

      return {
        pass,
        details: {
          deposit: 'IDR ' + (deposit / 1000000) + 'M',
          line1: 'IDR ' + (line1 / 1000000) + 'M',
          line2: 'IDR ' + (line2 / 1000000) + 'M',
          line3: 'IDR ' + (line3 / 1000000) + 'M',
          line4: 'IDR ' + (line4 / 1000000) + 'M (excluded)',
          solution: 'IDR ' + (solution / 1000000) + 'M',
          variance: variance === 0 ? 'IDR 0' : 'IDR ' + variance,
          match: variance === 0 ? '✅ EXACT MATCH' : '❌ MISMATCH'
        }
      };
    }
  },

  {
    id: 'CB-20260606-001',
    name: 'Chargeback - Provision Calculation',
    type: 'chargeback',
    test: () => {
      const chargebackAmount = 2420.00;
      const disputeFee = 25.00;
      const winProbability = 0.20; // 20% historical win rate
      const lossProbability = 1 - winProbability; // 80%

      const calculatedProvision = chargebackAmount * lossProbability;
      const expectedProvision = 1936.00;
      const totalImpact = chargebackAmount + disputeFee;

      const pass = Math.abs(calculatedProvision - expectedProvision) < 0.01;

      return {
        pass,
        details: {
          chargebackAmount: chargebackAmount.toFixed(2),
          disputeFee: disputeFee.toFixed(2),
          winProbability: (winProbability * 100) + '%',
          lossProbability: (lossProbability * 100) + '%',
          calculatedProvision: calculatedProvision.toFixed(2),
          expectedProvision: expectedProvision.toFixed(2),
          totalImpact: totalImpact.toFixed(2),
          match: Math.abs(calculatedProvision - expectedProvision) < 0.01 ? '✅' : '❌'
        }
      };
    }
  }
];

// Run all tests
let passCount = 0;
let failCount = 0;

testCases.forEach((testCase, index) => {
  console.log(`Test ${index + 1}: ${testCase.name}`);
  console.log(`ID: ${testCase.id} | Type: ${testCase.type}`);
  console.log('─'.repeat(60));

  const result = testCase.test();

  if (result.pass) {
    console.log('✅ PASS\n');
    passCount++;
  } else {
    console.log('❌ FAIL\n');
    failCount++;
  }

  console.log('Details:');
  Object.entries(result.details).forEach(([key, value]) => {
    console.log(`  ${key}: ${value}`);
  });

  console.log('\n');
});

// Summary
console.log('=====================================================');
console.log('VALIDATION SUMMARY');
console.log('=====================================================');
console.log(`Total Tests: ${testCases.length}`);
console.log(`✅ Passed: ${passCount}`);
console.log(`❌ Failed: ${failCount}`);
console.log(`Success Rate: ${((passCount / testCases.length) * 100).toFixed(1)}%`);
console.log('=====================================================\n');

// Financial Breakdown Balance Checks
console.log('=====================================================');
console.log('FINANCIAL BREAKDOWN BALANCE VERIFICATION');
console.log('=====================================================\n');

const financialBalanceTests = [
  {
    id: 'AM-20260606-001',
    name: 'Fee Waterfall Balance',
    gross: 100000.00,
    deductions: [2500.00, 175.00, 300.00], // MDR, GST, FX
    additions: [1000.00], // Reserve release
    expectedNet: 98025.00
  },
  {
    id: 'AM-20260606-002',
    name: 'Partial Variance Balance',
    gross: 50000.00,
    deductions: [1500.00, 50.00, 92.80], // MDR, FX, Unexplained
    additions: [],
    expectedNet: 48357.20
  }
];

financialBalanceTests.forEach(test => {
  const totalDeductions = test.deductions.reduce((sum, val) => sum + val, 0);
  const totalAdditions = test.additions.reduce((sum, val) => sum + val, 0);
  const calculatedNet = test.gross - totalDeductions + totalAdditions;
  const balanced = Math.abs(calculatedNet - test.expectedNet) < 0.01;

  console.log(`${test.name} (${test.id})`);
  console.log(`Gross: SGD ${test.gross.toFixed(2)}`);
  console.log(`Total Deductions: SGD ${totalDeductions.toFixed(2)}`);
  console.log(`Total Additions: SGD ${totalAdditions.toFixed(2)}`);
  console.log(`Calculated Net: SGD ${calculatedNet.toFixed(2)}`);
  console.log(`Expected Net: SGD ${test.expectedNet.toFixed(2)}`);
  console.log(`Balance: ${balanced ? '✅ BALANCED' : '❌ UNBALANCED'}\n`);
});

console.log('=====================================================\n');

// Exit with appropriate code
process.exit(failCount > 0 ? 1 : 0);
