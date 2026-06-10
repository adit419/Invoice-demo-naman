/**
 * Mock Date Helpers - Dynamic Date Generation for Time-Sensitive Mock Data
 *
 * This ensures mock data stays fresh regardless of when the demo is presented.
 * All dates are calculated relative to "today" so exceptions always appear current.
 */

/**
 * Get the reference date for mock data generation
 * For demo purposes, you can set a fixed date. Otherwise uses actual current date.
 *
 * DEMO MODE: Set this to a specific date to freeze the demo
 * LIVE MODE: Returns current date so data updates daily
 */
export const getMockReferenceDate = (): Date => {
  // OPTION 1: Use actual current date (data updates every day)
  return new Date()

  // OPTION 2: Freeze to specific demo date (uncomment for Thursday demo)
  // return new Date('2026-06-12T12:00:00Z') // Set to your demo date
}

/**
 * Get a date relative to the reference date
 * @param daysOffset - Number of days before (negative) or after (positive) reference date
 * @param hoursOffset - Additional hours offset
 */
export const getRelativeDate = (daysOffset: number, hoursOffset: number = 0): Date => {
  const refDate = getMockReferenceDate()
  const date = new Date(refDate)
  date.setDate(date.getDate() + daysOffset)
  date.setHours(date.getHours() + hoursOffset)
  return date
}

/**
 * Format date to ISO string for exception data
 */
export const toISOString = (date: Date): string => {
  return date.toISOString()
}

/**
 * Calculate age string from creation date to now
 * @param createdAt - ISO date string when exception was created
 * @returns Age string like "2d 4h" or "0d 6h"
 */
export const calculateAge = (createdAt: string): string => {
  const now = getMockReferenceDate()
  const created = new Date(createdAt)
  const diffMs = now.getTime() - created.getTime()

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

  return `${days}d ${hours}h`
}

/**
 * Check if exception is past SLA
 * @param slaDue - ISO date string when SLA is due
 * @returns true if current time is past SLA deadline
 */
export const isPastSLA = (slaDue: string): boolean => {
  const now = getMockReferenceDate()
  const sla = new Date(slaDue)
  return now > sla
}

/**
 * Calculate SLA due date based on priority
 * @param createdAt - When exception was created
 * @param priority - Exception priority (high/medium/low)
 * @returns ISO string of SLA due date
 */
export const calculateSLADue = (createdAt: Date, priority: 'high' | 'medium' | 'low'): string => {
  const slaDate = new Date(createdAt)

  switch (priority) {
    case 'high':
      slaDate.setHours(slaDate.getHours() + 24) // 24 hours for high
      break
    case 'medium':
      slaDate.setHours(slaDate.getHours() + 72) // 72 hours for medium
      break
    case 'low':
      slaDate.setHours(slaDate.getHours() + 168) // 7 days for low
      break
  }

  return slaDate.toISOString()
}

/**
 * Generate exception creation date relative to reference date
 * Used for creating exceptions that appear to be X days/hours old
 */
export const generateCreatedAt = (daysAgo: number, hoursAgo: number = 0): string => {
  return toISOString(getRelativeDate(-daysAgo, -hoursAgo))
}

/**
 * Get today's date at specific time (for settlement dates)
 */
export const getTodayAt = (hours: number, minutes: number = 0): Date => {
  const date = getMockReferenceDate()
  date.setHours(hours, minutes, 0, 0)
  return date
}

/**
 * Get date formatted for exception IDs (YYYYMMDD)
 */
export const getDateForID = (daysOffset: number = 0): string => {
  const date = getRelativeDate(daysOffset)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

/**
 * Format date for display (human-readable)
 */
export const formatDisplayDate = (date: Date): string => {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

/**
 * Get time remaining until SLA deadline
 * @param slaDue - ISO date string when SLA is due
 * @returns Human readable string like "in 4 hours" or "overdue by 2 days"
 */
export const getTimeToSLA = (slaDue: string): string => {
  const now = getMockReferenceDate()
  const sla = new Date(slaDue)
  const diffMs = sla.getTime() - now.getTime()

  if (diffMs < 0) {
    // Overdue
    const days = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60 * 24))
    const hours = Math.floor((Math.abs(diffMs) % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

    if (days > 0) {
      return `overdue by ${days}d ${hours}h`
    }
    return `overdue by ${hours}h`
  } else {
    // Still within SLA
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

    if (days > 0) {
      return `in ${days}d ${hours}h`
    }
    return `in ${hours}h`
  }
}

/**
 * Calculate expected PSP file arrival date based on settlement lag
 * @param transactionDate - When the transaction/credit was created
 * @param settlementLag - Number of days for settlement (T+1, T+2, etc.)
 * @param arrivalTime - Time of day file arrives (e.g., "18:00" for 6pm)
 * @returns Object with formatted date and time remaining
 */
export const calculateExpectedFileArrival = (
  transactionDate: string,
  settlementLag: number = 1,
  arrivalTime: string = '18:00'
): { date: Date; formattedDate: string; formattedTime: string; hoursRemaining: number; inHoursText: string } => {
  const txnDate = new Date(transactionDate)
  const expectedDate = new Date(txnDate)

  // Add settlement lag days
  expectedDate.setDate(expectedDate.getDate() + settlementLag)

  // Set to arrival time (e.g., 18:00 SGT)
  const [hours, minutes] = arrivalTime.split(':').map(Number)
  expectedDate.setHours(hours, minutes, 0, 0)

  // Calculate time remaining from now
  const now = getMockReferenceDate()
  const diffMs = expectedDate.getTime() - now.getTime()
  const hoursRemaining = diffMs / (1000 * 60 * 60)

  // Format date (e.g., "12 Jun 2026")
  const formattedDate = expectedDate.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })

  // Format time (e.g., "18:00 SGT")
  const formattedTime = `${arrivalTime} SGT`

  // Format "in X hours" text
  let inHoursText: string
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

  return {
    date: expectedDate,
    formattedDate,
    formattedTime,
    hoursRemaining,
    inHoursText
  }
}

/**
 * Calculate chargeback representment deadline
 * @param chargebackDate - When chargeback was received
 * @param windowDays - Number of days to respond (typically 7 for Visa)
 * @returns Object with deadline info
 */
export const calculateChargebackDeadline = (
  chargebackDate: string,
  windowDays: number = 7
): { deadline: Date; formattedDeadline: string; daysRemaining: number; statusText: string } => {
  const cbDate = new Date(chargebackDate)
  const deadline = new Date(cbDate)
  deadline.setDate(deadline.getDate() + windowDays)
  deadline.setHours(23, 59, 59, 999) // End of day

  const now = getMockReferenceDate()
  const diffMs = deadline.getTime() - now.getTime()
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  // Format deadline (e.g., "13 Jun 2026")
  const formattedDeadline = deadline.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })

  // Status text
  let statusText: string
  if (daysRemaining < 0) {
    statusText = `deadline passed ${Math.abs(daysRemaining)} days ago`
  } else if (daysRemaining === 0) {
    statusText = `deadline today`
  } else if (daysRemaining === 1) {
    statusText = `1 day remaining`
  } else {
    statusText = `${daysRemaining} days remaining`
  }

  return {
    deadline,
    formattedDeadline,
    daysRemaining,
    statusText
  }
}
