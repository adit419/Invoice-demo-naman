/**
 * Exception Service - Mock Implementation
 */

import type { Exception, ApiResponse } from '../../types/domain'
import type { ExceptionDetail } from '../../types/exceptions'
import { enhancedExceptions } from '../../data/exceptionsEnhanced'
import {
  calculateAge,
  isPastSLA,
  calculateExpectedFileArrival,
  calculateChargebackDeadline
} from '../../utils/mockDateHelpers'

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Use only enhanced exceptions (all have NBA defined for demo purposes)
// This ensures consistency across Dashboard, Exception Workspace, and Settlement Explorer
const allExceptions = [...enhancedExceptions]

/**
 * Enrich exception with dynamically calculated fields
 * This ensures age, pastSLA, and time-sensitive text are always current
 */
const enrichException = (exception: Exception): Exception => {
  let enriched: any = {
    ...exception,
    age: calculateAge(exception.createdAt),
    pastSLA: isPastSLA(exception.slaDue)
  }

  // For enhanced exceptions with diagnostics, inject dynamic dates
  if ('diagnostic' in exception && exception.diagnostic) {
    enriched = enrichDiagnosticText(enriched)
  }

  return enriched
}

/**
 * Enrich diagnostic findings and NBA descriptions with dynamic date calculations
 */
const enrichDiagnosticText = (exception: ExceptionDetail): ExceptionDetail => {
  const enriched = { ...exception }

  // BC-20260607-001: PSP File Expected Date
  if (exception.id === 'BC-20260607-001') {
    const fileArrival = calculateExpectedFileArrival(exception.createdAt, 1, '18:00')

    // Update diagnostic finding detail
    if (enriched.diagnostic?.findings?.[0]) {
      enriched.diagnostic.findings[0].detail =
        `PSP settlement file GrabPay-SGD-Daily-${exception.createdAt.substring(0, 10).replace(/-/g, '')}.csv expected ${fileArrival.formattedDate} ${fileArrival.formattedTime} (${fileArrival.inHoursText})`

      // Update evidence
      if (enriched.diagnostic.findings[0].evidence) {
        enriched.diagnostic.findings[0].evidence.dueTime = fileArrival.date.toISOString()
        enriched.diagnostic.findings[0].evidence.hoursRemaining = fileArrival.hoursRemaining
      }
    }

    // Update NBA description
    if (enriched.nba) {
      if (fileArrival.hoursRemaining > 0) {
        enriched.nba.description =
          `System will automatically re-attempt matching when GrabPay settlement file arrives (expected ${fileArrival.formattedDate} at ${fileArrival.formattedTime}, ${fileArrival.inHoursText}). No manual intervention required unless file does not arrive.`
        enriched.nba.estimatedTime = fileArrival.inHoursText
        enriched.nba.action = 'hold_and_retry'
        enriched.nba.priority = 'auto'
      } else {
        // File is overdue
        enriched.nba.description =
          `PSP settlement file was expected ${fileArrival.formattedDate} at ${fileArrival.formattedTime} but has not been received (${fileArrival.inHoursText}). Generate inquiry to GrabPay settlement team to provide missing file.`
        enriched.nba.action = 'escalate_missing_file'
        enriched.nba.priority = 'human_investigate'
      }
    }
  }

  // CB-20260606-001: Chargeback Deadline
  if (exception.id === 'CB-20260606-001') {
    const cbDeadline = calculateChargebackDeadline(exception.createdAt, 7)

    // Update diagnostic finding detail
    if (enriched.diagnostic?.findings?.[0]) {
      enriched.diagnostic.findings[0].detail =
        `Stage: First chargeback. Reason code: 13.1 (Merchandise/Services Not Received). Representment deadline: ${cbDeadline.formattedDeadline} (${cbDeadline.statusText})`

      // Update evidence
      if (enriched.diagnostic.findings[0].evidence) {
        enriched.diagnostic.findings[0].evidence.deadline = cbDeadline.deadline.toISOString()
        enriched.diagnostic.findings[0].evidence.daysRemaining = cbDeadline.daysRemaining
      }
    }

    // Update NBA description
    if (enriched.nba) {
      enriched.nba.description =
        `First chargeback received. Customer claims non-delivery. Evidence deadline: ${cbDeadline.formattedDeadline} (${cbDeadline.statusText}). Evidence available: delivery confirmation, driver GPS log. Win probability: 65% based on similar cases with GPS evidence. Submit representment.`
      enriched.nba.estimatedTime = cbDeadline.statusText
      enriched.nba.dueDate = cbDeadline.deadline.toISOString()
    }
  }

  return enriched
}

export const exceptionsService = {
  /**
   * Get all exceptions with optional filters
   * Dynamically calculates age and pastSLA based on current time
   */
  async getExceptions(filters?: {
    status?: string
    type?: string
    priority?: string
    psp?: string
    owner?: string | null
    pastSLA?: boolean
  }): Promise<Exception[]> {
    await delay(300)

    // Enrich all exceptions with dynamic calculations
    let enriched = allExceptions.map(enrichException)

    if (filters) {
      if (filters.status) {
        enriched = enriched.filter(e => e.status === filters.status)
      }
      if (filters.type) {
        enriched = enriched.filter(e => e.type === filters.type)
      }
      if (filters.priority) {
        enriched = enriched.filter(e => e.priority === filters.priority)
      }
      if (filters.psp) {
        enriched = enriched.filter(e => e.psp === filters.psp)
      }
      if (filters.owner !== undefined) {
        if (filters.owner === null) {
          enriched = enriched.filter(e => e.owner === null)
        } else {
          enriched = enriched.filter(e => e.owner === filters.owner)
        }
      }
      if (filters.pastSLA !== undefined) {
        enriched = enriched.filter(e => e.pastSLA === filters.pastSLA)
      }
    }

    return enriched
  },

  /**
   * Get exception by ID
   * Dynamically calculates age and pastSLA based on current time
   */
  async getExceptionById(id: string): Promise<Exception | null> {
    await delay(200)
    const exception = allExceptions.find(e => e.id === id)
    return exception ? enrichException(exception) : null
  },

  /**
   * Assign exception to owner
   */
  async assignException(id: string, ownerId: string): Promise<Exception> {
    await delay(300)
    const exception = allExceptions.find(e => e.id === id)
    if (!exception) throw new Error('Exception not found')

    // In real implementation, this would update the backend
    exception.owner = ownerId
    return exception
  },

  /**
   * Resolve exception
   */
  async resolveException(id: string, resolution: string): Promise<Exception> {
    await delay(300)
    const exception = allExceptions.find(e => e.id === id)
    if (!exception) throw new Error('Exception not found')

    exception.status = 'resolved'
    return exception
  },

  /**
   * Get exception statistics
   * Dynamically calculates pastSLA count based on current time
   */
  async getExceptionStats(): Promise<{
    total: number
    byType: Record<string, number>
    byPriority: Record<string, number>
    byStatus: Record<string, number>
    pastSLA: number
    unassigned: number
    totalAmount: { SGD: number, IDR: number, MYR: number }
  }> {
    await delay(200)

    // Enrich exceptions with dynamic calculations before filtering
    const enrichedExceptions = allExceptions.map(enrichException)
    const openExceptions = enrichedExceptions.filter(e => e.status === 'open')

    const byType: Record<string, number> = {}
    const byPriority: Record<string, number> = {}
    const byStatus: Record<string, number> = {}
    const totalAmount = { SGD: 0, IDR: 0, MYR: 0 }

    openExceptions.forEach(e => {
      byType[e.type] = (byType[e.type] || 0) + 1
      byPriority[e.priority] = (byPriority[e.priority] || 0) + 1
      byStatus[e.status] = (byStatus[e.status] || 0) + 1

      if (e.currency === 'SGD') totalAmount.SGD += e.amount
      else if (e.currency === 'IDR') totalAmount.IDR += e.amount
      else if (e.currency === 'MYR') totalAmount.MYR += e.amount
    })

    return {
      total: openExceptions.length,
      byType,
      byPriority,
      byStatus,
      pastSLA: openExceptions.filter(e => e.pastSLA).length,
      unassigned: openExceptions.filter(e => e.owner === null).length,
      totalAmount,
    }
  },
}
