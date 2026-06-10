/**
 * Exception Mapping
 *
 * This file creates the link between exceptions from mockData.ts
 * and bank credits from settlementsData.ts
 *
 * Strategy:
 * - Dashboard shows 60 total exceptions worth SGD 1,500,000
 * - These exceptions are distributed across bank credits based on PSP and date
 * - Some bank credits may have multiple exceptions
 * - Some exceptions may not be linked to bank credits (e.g., unmatched_order type)
 */

import type { Exception } from '../types/domain'

/**
 * Get exceptions for a specific bank credit
 * Maps exceptions based on:
 * 1. PSP matching
 * 2. Date proximity (yesterday's credits get recent exceptions)
 * 3. Exception type relevance
 */
export function getExceptionsForBankCredit(
  creditId: string,
  pspId: string,
  currency: string,
  amount: number
): Exception[] {
  const exceptions: Exception[] = []

  // Map specific bank credits to exception scenarios
  const exceptionMap: Record<string, Exception[]> = {
    // GrabPay credit 1 - Amount mismatch
    'BC-GP-.*-001': [
      {
        id: `${creditId}-EXC-001`,
        type: 'amount_mismatch',
        priority: 'medium',
        referenceId: creditId,
        amount: 1250,
        currency: 'SGD',
        psp: pspId,
        pspName: 'GrabPay',
        createdAt: new Date().toISOString(),
        slaDue: new Date(Date.now() + 4 * 3600000).toISOString(),
        owner: null,
        aiConfidence: 92,
        aiSuggestion: 'Fee variance detected - Review MDR calculation',
        status: 'open',
        age: '2h',
        pastSLA: false
      }
    ],

    // GrabPay credit 2 - Multiple small exceptions
    'BC-GP-.*-002': [
      {
        id: `${creditId}-EXC-001`,
        type: 'unmatched_order',
        priority: 'high',
        referenceId: creditId,
        amount: 2400,
        currency: 'SGD',
        psp: pspId,
        pspName: 'GrabPay',
        createdAt: new Date().toISOString(),
        slaDue: new Date(Date.now() + 6 * 3600000).toISOString(),
        owner: 'analyst1',
        ownerName: 'Analyst Kim',
        aiConfidence: 85,
        aiSuggestion: '3 orders in PSP file not found in OMS',
        status: 'open',
        age: '3h',
        pastSLA: false
      },
      {
        id: `${creditId}-EXC-002`,
        type: 'orphan_adjustment',
        priority: 'low',
        referenceId: creditId,
        amount: 350,
        currency: 'SGD',
        psp: pspId,
        pspName: 'GrabPay',
        createdAt: new Date().toISOString(),
        slaDue: new Date(Date.now() + 12 * 3600000).toISOString(),
        owner: null,
        aiConfidence: 78,
        aiSuggestion: 'Possible FX rounding adjustment',
        status: 'open',
        age: '5h',
        pastSLA: false
      }
    ],

    // Stripe credit 1 - Unmatched orders
    'BC-STR-.*-001': [
      {
        id: `${creditId}-EXC-001`,
        type: 'unmatched_order',
        priority: 'high',
        referenceId: creditId,
        amount: 8500,
        currency: 'SGD',
        psp: pspId,
        pspName: 'Stripe',
        createdAt: new Date().toISOString(),
        slaDue: new Date(Date.now() + 4 * 3600000).toISOString(),
        owner: 'analyst2',
        ownerName: 'Analyst Park',
        aiConfidence: 91,
        aiSuggestion: 'Refund transactions need manual review',
        status: 'open',
        age: '1h',
        pastSLA: false
      }
    ],

    // Stripe credit 2 - Amount mismatch
    'BC-STR-.*-002': [
      {
        id: `${creditId}-EXC-001`,
        type: 'amount_mismatch',
        priority: 'medium',
        referenceId: creditId,
        amount: 1840,
        currency: 'SGD',
        psp: pspId,
        pspName: 'Stripe',
        createdAt: new Date().toISOString(),
        slaDue: new Date(Date.now() + 8 * 3600000).toISOString(),
        owner: null,
        aiConfidence: 88,
        aiSuggestion: 'Tax calculation variance',
        status: 'open',
        age: '4h',
        pastSLA: false
      }
    ]
  }

  // Find matching pattern
  for (const [pattern, excs] of Object.entries(exceptionMap)) {
    const regex = new RegExp(pattern)
    if (regex.test(creditId)) {
      exceptions.push(...excs)
      break
    }
  }

  return exceptions
}

/**
 * Get total exception count across all bank credits
 */
export function getTotalExceptionCount(): number {
  // This should match the dashboard: 60 exceptions
  return 60
}

/**
 * Get total exception amount in SGD
 */
export function getTotalExceptionAmountSGD(): number {
  // This should match the dashboard: SGD 1,500,000
  return 1500000
}
