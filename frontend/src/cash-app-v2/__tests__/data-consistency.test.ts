/**
 * Data Consistency Tests
 * Validates mathematical relationships across all Cash App V2 metrics
 */

import {
  mockDashboardKPIs,
  mockPSPReconciliationStatus,
  mockExceptionSummary,
  mockExceptionAgingData,
  mockOpenARSummary,
  mockSettlementPayouts,
} from '../data/mockData'

describe('Cash App V2 - Data Consistency Tests', () => {

  describe('Total Bank Credit Validation', () => {
    it('should match sum of SGD PSP credits', () => {
      const sgdPSPs = mockPSPReconciliationStatus.filter(psp => psp.currency === 'SGD')
      const totalSGDCredits = sgdPSPs.reduce((sum, psp) => sum + psp.todayCredits, 0)

      expect(totalSGDCredits).toBe(mockDashboardKPIs.totalBankCreditSGD)
      expect(totalSGDCredits).toBe(4250000) // 4.25M SGD
    })

    it('should match sum of SGD settlement payouts', () => {
      const sgdSettlements = mockSettlementPayouts.filter(s => s.currency === 'SGD')
      const totalSettlementCredits = sgdSettlements.reduce((sum, s) => sum + (s.bankCredit || 0), 0)

      expect(totalSettlementCredits).toBe(mockDashboardKPIs.totalBankCreditSGD)
      expect(totalSettlementCredits).toBe(4250000)
    })
  })

  describe('PSP Reconciliation Validation', () => {
    it('should have matched + unmatched = todayCredits for each PSP', () => {
      mockPSPReconciliationStatus.forEach(psp => {
        const unmatched = psp.todayCredits - psp.matched
        expect(unmatched).toBeGreaterThanOrEqual(0)
        expect(psp.matched).toBeLessThanOrEqual(psp.todayCredits)
      })
    })

    it('should have 12 total new exceptions from yesterday', () => {
      const totalExceptions = mockPSPReconciliationStatus.reduce((sum, psp) => sum + psp.exceptions, 0)
      expect(totalExceptions).toBe(12)
    })

    it('should have correct coverage percentages', () => {
      mockPSPReconciliationStatus.forEach(psp => {
        const calculatedCoverage = (psp.matched / psp.todayCredits) * 100
        expect(Math.abs(calculatedCoverage - psp.coveragePct)).toBeLessThan(0.1)
      })
    })
  })

  describe('Exception Counts Validation', () => {
    it('should have exception summary sum to 60 total open exceptions', () => {
      const totalExceptions = mockExceptionSummary.reduce((sum, ex) => sum + ex.count, 0)
      expect(totalExceptions).toBe(60)
      expect(totalExceptions).toBe(mockDashboardKPIs.openExceptions)
    })

    it('should have exception aging (< 30 days) sum to 60 total', () => {
      const total = mockExceptionAgingData.reduce((sum, psp) => {
        return sum + psp.age0to7Days + psp.age8to30Days
      }, 0)
      expect(total).toBe(60)
      expect(total).toBe(mockDashboardKPIs.openExceptions)
    })
  })

  describe('Open AR Validation', () => {
    it('should have Open AR amount greater than Open Exceptions amount', () => {
      expect(mockOpenARSummary.totalAmount).toBeGreaterThan(mockDashboardKPIs.exceptionAmountSGD)
      expect(mockOpenARSummary.totalAmount).toBe(2000000)
      expect(mockDashboardKPIs.exceptionAmountSGD).toBe(1500000)
    })

    it('should have Open AR count greater than Open Exceptions count', () => {
      expect(mockOpenARSummary.totalCount).toBeGreaterThan(mockDashboardKPIs.openExceptions)
      expect(mockOpenARSummary.totalCount).toBe(85)
      expect(mockDashboardKPIs.openExceptions).toBe(60)
    })
  })

  describe('Amount Relationships', () => {
    it('should have Total Bank Credit greater than Open AR', () => {
      expect(mockDashboardKPIs.totalBankCreditSGD).toBeGreaterThan(mockOpenARSummary.totalAmount)
      expect(mockDashboardKPIs.totalBankCreditSGD).toBe(4250000)
      expect(mockOpenARSummary.totalAmount).toBe(2000000)
    })
  })

  describe('Settlement Payouts Validation', () => {
    it('should have GrabPay settlements sum to GrabPay PSP credit', () => {
      const grabpayPSP = mockPSPReconciliationStatus.find(psp => psp.pspId === 'grabpay')
      const grabpaySettlements = mockSettlementPayouts.filter(s => s.pspId === 'grabpay' && s.currency === 'SGD')
      const totalBankCredit = grabpaySettlements.reduce((sum, s) => sum + (s.bankCredit || 0), 0)

      expect(totalBankCredit).toBe(grabpayPSP?.todayCredits)
      expect(totalBankCredit).toBe(3500000)
    })

    it('should have Stripe settlements sum to Stripe PSP credit', () => {
      const stripePSP = mockPSPReconciliationStatus.find(psp => psp.pspId === 'stripe')
      const stripeSettlements = mockSettlementPayouts.filter(s => s.pspId === 'stripe')
      const totalBankCredit = stripeSettlements.reduce((sum, s) => sum + (s.bankCredit || 0), 0)

      expect(totalBankCredit).toBe(stripePSP?.todayCredits)
      expect(totalBankCredit).toBe(750000)
    })
  })
})
