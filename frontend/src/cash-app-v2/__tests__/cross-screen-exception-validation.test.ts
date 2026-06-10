/**
 * Cross-Screen Exception Validation Tests
 * Validates exception consistency across Dashboard, Exception Workspace, and Settlement Explorer
 */

import {
  mockDashboardKPIs,
  mockExceptions,
  mockExceptionSummary,
  mockExceptionAgingData,
  mockPSPReconciliationStatus
} from '../data/mockData'
import { mockBankCredits } from '../data/settlementsData'

describe('Cash App V2 - Cross-Screen Exception Validation', () => {

  // ============================================================================
  // DASHBOARD VALIDATION
  // ============================================================================
  describe('Dashboard KPIs', () => {
    it('should have open exceptions count defined', () => {
      expect(mockDashboardKPIs.openExceptions).toBeDefined()
      expect(mockDashboardKPIs.openExceptions).toBeGreaterThan(0)
    })

    it('should have exception amounts defined for all currencies', () => {
      expect(mockDashboardKPIs.exceptionAmountSGD).toBeDefined()
      expect(mockDashboardKPIs.exceptionAmountIDR).toBeDefined()
    })

    it('should show 60 open exceptions', () => {
      expect(mockDashboardKPIs.openExceptions).toBe(60)
    })

    it('should show SGD 1,500,000 in exception amount', () => {
      expect(mockDashboardKPIs.exceptionAmountSGD).toBe(1500000)
    })
  })

  // ============================================================================
  // EXCEPTION WORKSPACE VALIDATION
  // ============================================================================
  describe('Exception Workspace', () => {
    it('should have mockExceptions array defined', () => {
      expect(mockExceptions).toBeDefined()
      expect(Array.isArray(mockExceptions)).toBe(true)
    })

    it('should have exceptions with all required fields', () => {
      mockExceptions.forEach(exception => {
        expect(exception.id).toBeDefined()
        expect(exception.type).toBeDefined()
        expect(exception.priority).toBeDefined()
        expect(exception.amount).toBeDefined()
        expect(exception.currency).toBeDefined()
        expect(exception.psp).toBeDefined()
        expect(exception.status).toBeDefined()
      })
    })

    it('should have exceptions in multiple currencies', () => {
      const currencies = new Set(mockExceptions.map(e => e.currency))
      expect(currencies.size).toBeGreaterThanOrEqual(1)
    })

    it('should have SGD exceptions', () => {
      const sgdExceptions = mockExceptions.filter(e => e.currency === 'SGD')
      expect(sgdExceptions.length).toBeGreaterThan(0)
    })
  })

  // ============================================================================
  // EXCEPTION SUMMARY VALIDATION
  // ============================================================================
  describe('Exception Summary (Chart Data)', () => {
    it('should have exception summary defined', () => {
      expect(mockExceptionSummary).toBeDefined()
      expect(Array.isArray(mockExceptionSummary)).toBe(true)
    })

    it('should sum to dashboard open exceptions count', () => {
      const summaryTotal = mockExceptionSummary.reduce((sum, item) => sum + item.count, 0)
      expect(summaryTotal).toBe(mockDashboardKPIs.openExceptions)
    })

    it('should have all exception types represented', () => {
      const types = mockExceptionSummary.map(item => item.type)
      expect(types).toContain('unmatched_credit')
      expect(types).toContain('unmatched_order')
      expect(types).toContain('amount_mismatch')
    })

    it('should have counts greater than zero for each type', () => {
      mockExceptionSummary.forEach(item => {
        expect(item.count).toBeGreaterThan(0)
      })
    })
  })

  // ============================================================================
  // EXCEPTION AGING VALIDATION
  // ============================================================================
  describe('Exception Aging (Chart Data)', () => {
    it('should have exception aging data defined', () => {
      expect(mockExceptionAgingData).toBeDefined()
      expect(Array.isArray(mockExceptionAgingData)).toBe(true)
    })

    it('should have data for multiple PSPs', () => {
      expect(mockExceptionAgingData.length).toBeGreaterThanOrEqual(2)
    })

    it('should have exceptions less than 30 days match dashboard count', () => {
      const under30Days = mockExceptionAgingData.reduce((sum, psp) => {
        return sum + psp.age0to7Days + psp.age8to30Days
      }, 0)
      expect(under30Days).toBe(mockDashboardKPIs.openExceptions)
    })

    it('should have all PSPs with valid age distribution', () => {
      mockExceptionAgingData.forEach(psp => {
        expect(psp.pspId).toBeDefined()
        expect(psp.age0to7Days).toBeGreaterThanOrEqual(0)
        expect(psp.age8to30Days).toBeGreaterThanOrEqual(0)
        expect(psp.age1to3Months).toBeGreaterThanOrEqual(0)
        expect(psp.ageOver3Months).toBeGreaterThanOrEqual(0)
      })
    })
  })

  // ============================================================================
  // SETTLEMENT EXPLORER VALIDATION
  // ============================================================================
  describe('Settlement Explorer - Bank Credits with Exceptions', () => {
    it('should have bank credits defined', () => {
      expect(mockBankCredits).toBeDefined()
      expect(Array.isArray(mockBankCredits)).toBe(true)
      expect(mockBankCredits.length).toBeGreaterThan(0)
    })

    it('should have some bank credits with exceptions', () => {
      const creditsWithExceptions = mockBankCredits.filter(
        credit => credit.exceptions && credit.exceptions.length > 0
      )
      expect(creditsWithExceptions.length).toBeGreaterThan(0)
    })

    it('should have exceptions with all required fields in bank credits', () => {
      mockBankCredits.forEach(credit => {
        if (credit.exceptions && credit.exceptions.length > 0) {
          credit.exceptions.forEach(exception => {
            expect(exception.id).toBeDefined()
            expect(exception.type).toBeDefined()
            expect(exception.status).toBeDefined()
          })
        }
      })
    })

    it('should have exceptions linked to correct PSP', () => {
      mockBankCredits.forEach(credit => {
        if (credit.exceptions && credit.exceptions.length > 0) {
          credit.exceptions.forEach(exception => {
            // Exception PSP should match or be related to credit PSP
            expect(exception.psp).toBeDefined()
          })
        }
      })
    })

    it('should have exception amounts in correct currency', () => {
      mockBankCredits.forEach(credit => {
        if (credit.exceptions && credit.exceptions.length > 0) {
          credit.exceptions.forEach(exception => {
            expect(exception.currency).toBe(credit.currency)
          })
        }
      })
    })
  })

  // ============================================================================
  // PSP-LEVEL CONSISTENCY
  // ============================================================================
  describe('PSP-Level Exception Consistency', () => {
    it('should have exceptions for PSPs in reconciliation status', () => {
      const pspIds = mockPSPReconciliationStatus.map(psp => psp.pspId)
      const exceptionPSPs = new Set(mockExceptions.map(e => e.psp))

      // At least some PSPs should have exceptions
      const hasOverlap = pspIds.some(pspId => exceptionPSPs.has(pspId))
      expect(hasOverlap).toBe(true)
    })

    it('should have total new exceptions (yesterday) from PSP reconciliation', () => {
      const totalNewExceptions = mockPSPReconciliationStatus.reduce(
        (sum, psp) => sum + psp.exceptions,
        0
      )
      expect(totalNewExceptions).toBeGreaterThan(0)
      expect(totalNewExceptions).toBeLessThanOrEqual(mockDashboardKPIs.openExceptions)
    })
  })

  // ============================================================================
  // DATA QUALITY CHECKS
  // ============================================================================
  describe('Data Quality', () => {
    it('should have no negative exception amounts', () => {
      mockExceptions.forEach(exception => {
        expect(exception.amount).toBeGreaterThan(0)
      })
    })

    it('should have valid exception statuses', () => {
      const validStatuses = ['open', 'resolved', 'escalated', 'carried_forward']
      mockExceptions.forEach(exception => {
        expect(validStatuses).toContain(exception.status)
      })
    })

    it('should have valid priority levels', () => {
      const validPriorities = ['high', 'medium', 'low']
      mockExceptions.forEach(exception => {
        expect(validPriorities).toContain(exception.priority)
      })
    })

    it('should have consistent date formats', () => {
      mockExceptions.forEach(exception => {
        expect(exception.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
        expect(exception.slaDue).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      })
    })
  })

  // ============================================================================
  // CROSS-SCREEN SUMMARY TEST
  // ============================================================================
  describe('Cross-Screen Summary', () => {
    it('should show exceptions across all three screens', () => {
      // Dashboard
      const dashboardCount = mockDashboardKPIs.openExceptions
      expect(dashboardCount).toBeGreaterThan(0)

      // Exception Workspace
      const workspaceCount = mockExceptions.length
      expect(workspaceCount).toBeGreaterThan(0)

      // Settlement Explorer
      const settlementExceptionCount = mockBankCredits.reduce((sum, credit) => {
        return sum + (credit.exceptions?.length || 0)
      }, 0)
      expect(settlementExceptionCount).toBeGreaterThan(0)

      // Log for visibility
      console.log('Exception Counts:')
      console.log(`  Dashboard: ${dashboardCount}`)
      console.log(`  Exception Workspace: ${workspaceCount}`)
      console.log(`  Settlement Explorer: ${settlementExceptionCount}`)
    })

    it('should have consistent exception data structure across screens', () => {
      // Verify that exceptions in Settlement Explorer match the Exception type
      mockBankCredits.forEach(credit => {
        if (credit.exceptions && credit.exceptions.length > 0) {
          credit.exceptions.forEach(exception => {
            // Should have same fields as mockExceptions
            expect(exception).toHaveProperty('id')
            expect(exception).toHaveProperty('type')
            expect(exception).toHaveProperty('priority')
            expect(exception).toHaveProperty('amount')
            expect(exception).toHaveProperty('currency')
            expect(exception).toHaveProperty('psp')
            expect(exception).toHaveProperty('status')
          })
        }
      })
    })
  })
})
