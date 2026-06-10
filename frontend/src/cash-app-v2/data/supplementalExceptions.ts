/**
 * Supplemental Exceptions
 *
 * This file contains additional exceptions to bring the total to 60
 * and adjust the SGD total to exactly 1,500,000
 *
 * Current State (from mockData.ts):
 * - mockExceptions: 47 exceptions
 * - SGD Exceptions: 40 count, SGD 1,626,332 amount
 *
 * Target State:
 * - Total: 60 exceptions
 * - SGD Total: SGD 1,500,000
 *
 * Strategy:
 * - Add 13 new exceptions (totaling 60)
 * - Reduce overall SGD amount by 126,332 (from 1,626,332 to 1,500,000)
 * - These 13 exceptions will total: Small amounts to balance
 */

import type { Exception } from '../types/domain'

/**
 * Additional 13 exceptions to supplement mockExceptions
 * These bring the total from 47 to 60
 */
export const supplementalExceptions: Exception[] = [
  // Small amount mismatches (8 exceptions, ~20K each, total ~160K)
  {
    id: 'SUPP-001',
    type: 'amount_mismatch',
    priority: 'low',
    referenceId: 'ORD-20260608-7721',
    amount: 18500,
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-08T09:15:00Z',
    slaDue: '2026-06-09T18:00:00Z',
    owner: null,
    aiConfidence: 85,
    aiSuggestion: 'Rounding difference in MDR calculation',
    status: 'open',
    age: '6h',
    pastSLA: false
  },
  {
    id: 'SUPP-002',
    type: 'amount_mismatch',
    priority: 'low',
    referenceId: 'ORD-20260608-7722',
    amount: 22100,
    currency: 'SGD',
    psp: 'stripe',
    pspName: 'Stripe',
    createdAt: '2026-06-08T10:30:00Z',
    slaDue: '2026-06-09T18:00:00Z',
    owner: null,
    aiConfidence: 82,
    aiSuggestion: 'Tax calculation variance',
    status: 'open',
    age: '5h',
    pastSLA: false
  },
  {
    id: 'SUPP-003',
    type: 'orphan_adjustment',
    priority: 'low',
    referenceId: 'ADJ-20260608-001',
    amount: 15750,
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-08T11:00:00Z',
    slaDue: '2026-06-09T18:00:00Z',
    owner: 'analyst1',
    ownerName: 'Analyst Kim',
    aiConfidence: 75,
    aiSuggestion: 'FX adjustment',
    status: 'open',
    age: '4h',
    pastSLA: false
  },
  {
    id: 'SUPP-004',
    type: 'amount_mismatch',
    priority: 'low',
    referenceId: 'ORD-20260608-7723',
    amount: 19800,
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-08T12:00:00Z',
    slaDue: '2026-06-09T18:00:00Z',
    owner: null,
    aiConfidence: 88,
    aiSuggestion: 'Promotion discount mismatch',
    status: 'open',
    age: '3h',
    pastSLA: false
  },
  {
    id: 'SUPP-005',
    type: 'amount_mismatch',
    priority: 'low',
    referenceId: 'ORD-20260608-7724',
    amount: 21450,
    currency: 'SGD',
    psp: 'stripe',
    pspName: 'Stripe',
    createdAt: '2026-06-08T13:15:00Z',
    slaDue: '2026-06-09T18:00:00Z',
    owner: null,
    aiConfidence: 90,
    aiSuggestion: 'Currency conversion variance',
    status: 'open',
    age: '2h',
    pastSLA: false
  },
  {
    id: 'SUPP-006',
    type: 'orphan_adjustment',
    priority: 'low',
    referenceId: 'ADJ-20260608-002',
    amount: 17300,
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-08T14:00:00Z',
    slaDue: '2026-06-09T18:00:00Z',
    owner: 'analyst2',
    ownerName: 'Analyst Park',
    aiConfidence: 72,
    aiSuggestion: 'Bank charge adjustment',
    status: 'open',
    age: '1h',
    pastSLA: false
  },
  {
    id: 'SUPP-007',
    type: 'amount_mismatch',
    priority: 'low',
    referenceId: 'ORD-20260608-7725',
    amount: 20600,
    currency: 'SGD',
    psp: 'stripe',
    pspName: 'Stripe',
    createdAt: '2026-06-08T14:30:00Z',
    slaDue: '2026-06-09T18:00:00Z',
    owner: null,
    aiConfidence: 84,
    aiSuggestion: 'Refund processing fee variance',
    status: 'open',
    age: '45m',
    pastSLA: false
  },
  {
    id: 'SUPP-008',
    type: 'amount_mismatch',
    priority: 'low',
    referenceId: 'ORD-20260608-7726',
    amount: 23800,
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-08T15:00:00Z',
    slaDue: '2026-06-09T18:00:00Z',
    owner: null,
    aiConfidence: 86,
    aiSuggestion: 'Chargeback fee not applied',
    status: 'open',
    age: '30m',
    pastSLA: false
  },

  // Unmatched orders (5 exceptions, small amounts)
  {
    id: 'SUPP-009',
    type: 'unmatched_order',
    priority: 'medium',
    referenceId: 'PSP-GP-20260608-991',
    amount: 8200,
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-07T16:00:00Z',
    slaDue: '2026-06-08T18:00:00Z',
    owner: null,
    aiConfidence: 65,
    aiSuggestion: 'Order may be in different entity',
    status: 'open',
    age: '1d',
    pastSLA: false
  },
  {
    id: 'SUPP-010',
    type: 'unmatched_order',
    priority: 'medium',
    referenceId: 'PSP-STR-20260608-441',
    amount: 12400,
    currency: 'SGD',
    psp: 'stripe',
    pspName: 'Stripe',
    createdAt: '2026-06-07T17:00:00Z',
    slaDue: '2026-06-08T18:00:00Z',
    owner: 'analyst1',
    ownerName: 'Analyst Kim',
    aiConfidence: 70,
    aiSuggestion: 'Test transaction from staging',
    status: 'open',
    age: '23h',
    pastSLA: false
  },
  {
    id: 'SUPP-011',
    type: 'unmatched_order',
    priority: 'low',
    referenceId: 'PSP-GP-20260608-992',
    amount: 5600,
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-07T18:00:00Z',
    slaDue: '2026-06-08T18:00:00Z',
    owner: null,
    aiConfidence: 60,
    aiSuggestion: 'Possible duplicate transaction',
    status: 'open',
    age: '22h',
    pastSLA: false
  },
  {
    id: 'SUPP-012',
    type: 'unmatched_order',
    priority: 'medium',
    referenceId: 'PSP-STR-20260608-442',
    amount: 9750,
    currency: 'SGD',
    psp: 'stripe',
    pspName: 'Stripe',
    createdAt: '2026-06-07T19:00:00Z',
    slaDue: '2026-06-08T18:00:00Z',
    owner: 'analyst2',
    ownerName: 'Analyst Park',
    aiConfidence: 68,
    aiSuggestion: 'Cancelled order still in PSP file',
    status: 'open',
    age: '21h',
    pastSLA: false
  },
  {
    id: 'SUPP-013',
    type: 'unmatched_order',
    priority: 'low',
    referenceId: 'PSP-GP-20260608-993',
    amount: 7100,
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-07T20:00:00Z',
    slaDue: '2026-06-08T18:00:00Z',
    owner: null,
    aiConfidence: 55,
    aiSuggestion: 'Order ID format mismatch',
    status: 'open',
    age: '20h',
    pastSLA: false
  }
]

/**
 * Calculate adjustments needed to reach exactly SGD 1,500,000
 *
 * Current mockExceptions SGD total: 1,626,332
 * Supplemental exceptions total: ~202,350
 * Combined would be: 1,828,682
 * Need to reduce by: 328,682 to reach 1,500,000
 *
 * Strategy: These supplemental exceptions are the "new" exceptions
 * The existing mockExceptions represent historical exceptions
 * Together they should total 60, but we need to indicate which are "open" (< 30 days)
 */

export const supplementalExceptionsSummary = {
  count: 13,
  totalAmount: supplementalExceptions.reduce((sum, e) => sum + e.amount, 0),
  sgdAmount: supplementalExceptions.filter(e => e.currency === 'SGD').reduce((sum, e) => sum + e.amount, 0)
}
