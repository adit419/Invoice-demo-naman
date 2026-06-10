/**
 * Dashboard Mock Service
 */

import type {
  DashboardKPIs,
  ExceptionSummary,
  PSPReconciliationStatus,
  TransactionStatusDistribution,
  ExceptionAgingData,
  UnsettledAgingBucket,
} from '../../types/domain'

import {
  mockDashboardKPIs,
  mockExceptionSummary,
  mockTransactionStatusDistribution,
  mockExceptionAgingData,
  mockUnsettledAgingBuckets,
} from '../../data/mockData'
import { exceptionsService } from './exceptions.mock'
import { settlementsService } from './settlements.mock'

// Simulate API latency
const delay = (ms: number = 200) => new Promise((resolve) => setTimeout(resolve, ms))

export const dashboardService = {
  getKPIs: async (entityId?: string, date?: string): Promise<DashboardKPIs> => {
    await delay(300)
    // Dynamically compute pastSLAExceptions from exception service
    // so dashboard stays in sync with the Exception Workspace
    const stats = await exceptionsService.getExceptionStats()
    return {
      ...mockDashboardKPIs,
      pastSLAExceptions: stats.pastSLA,
    }
  },

  getExceptionSummary: async (entityId?: string): Promise<ExceptionSummary[]> => {
    await delay(200)
    return mockExceptionSummary
  },

  getPSPReconciliationStatus: async (
    entityId?: string,
    date?: string
  ): Promise<PSPReconciliationStatus[]> => {
    await delay(250)

    // Dynamically compute from bank credits so Dashboard stays in sync
    // with the Settlement Explorer screen
    const credits = await settlementsService.getBankCredits({})

    // Group by PSP
    const pspMap: Record<string, {
      pspId: string; pspName: string; currency: string;
      totalAmount: number; matchedAmount: number; exceptionCount: number
    }> = {}

    for (const credit of credits) {
      const pspId = credit.mappedPSP || 'unknown'
      const pspName = pspId === 'grabpay' ? 'GrabPay' : pspId === 'stripe' ? 'Stripe' : pspId.charAt(0).toUpperCase() + pspId.slice(1)

      if (!pspMap[pspId]) {
        pspMap[pspId] = { pspId, pspName, currency: credit.currency, totalAmount: 0, matchedAmount: 0, exceptionCount: 0 }
      }

      pspMap[pspId].totalAmount += credit.amount

      // "matched" = credits where L1 variance is zero or near-zero (reconciled or matched_l1)
      if (credit.reconciliationStatus === 'reconciled' || credit.reconciliationStatus === 'matched_l1') {
        pspMap[pspId].matchedAmount += credit.amount
      }

      // Count L2 exceptions + settlement-level exceptions for this credit
      pspMap[pspId].exceptionCount += credit.l2ExceptionCount

      // Count credit-level exceptions (unmatched_variance, unmatched_no_psp_file are L1 exceptions)
      if (credit.reconciliationStatus === 'unmatched_variance' || credit.reconciliationStatus === 'unmatched_no_psp_file') {
        pspMap[pspId].exceptionCount += 1
      }
    }

    return Object.values(pspMap).map(psp => {
      const coveragePct = psp.totalAmount > 0
        ? Math.round((psp.matchedAmount / psp.totalAmount) * 1000) / 10
        : 0
      return {
        pspId: psp.pspId,
        pspName: psp.pspName,
        currency: psp.currency,
        todayCredits: Math.round(psp.totalAmount * 100) / 100,
        matched: Math.round(psp.matchedAmount * 100) / 100,
        exceptions: psp.exceptionCount,
        coveragePct,
        status: coveragePct >= 95 ? 'healthy' as const : coveragePct >= 85 ? 'attention' as const : 'warning' as const,
      }
    })
  },

  getTransactionStatusDistribution: async (
    entityId?: string
  ): Promise<TransactionStatusDistribution> => {
    await delay(200)
    return mockTransactionStatusDistribution
  },

  getExceptionAgingData: async (entityId?: string): Promise<ExceptionAgingData[]> => {
    await delay(200)
    return mockExceptionAgingData
  },

  getUnsettledAgingBuckets: async (entityId?: string): Promise<UnsettledAgingBucket[]> => {
    await delay(250)
    return mockUnsettledAgingBuckets
  },
}
