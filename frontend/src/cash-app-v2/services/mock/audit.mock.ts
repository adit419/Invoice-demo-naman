/**
 * Audit Trail - Mock Service Layer
 *
 * Provides data access methods for audit entries with filtering and pagination
 */

import { getMockAuditEntries, EVENT_TYPE_META } from '../../data/auditData'
import type { AuditEntry, AuditEventType } from '../../types/domain'

// Simulate network delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// ============================================================================
// FILTERS
// ============================================================================

interface AuditFilters {
  dateFrom?: string
  dateTo?: string
  eventTypes?: AuditEventType[]
  categories?: string[]
  actors?: string[]
  search?: string
  recordId?: string
}

interface AuditStats {
  totalEntries: number
  entriesByCategory: Record<string, number>
  entriesByEventType: Record<string, number>
  entriesByActor: Record<string, number>
  uniqueActors: { id: string; name: string }[]
  dateRange: { earliest: string; latest: string }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const parseDate = (dateStr: string): Date => new Date(dateStr)

const isWithinDateRange = (timestamp: string, from?: string, to?: string): boolean => {
  const date = parseDate(timestamp)

  if (from) {
    const fromDate = parseDate(from)
    fromDate.setHours(0, 0, 0, 0)
    if (date < fromDate) return false
  }

  if (to) {
    const toDate = parseDate(to)
    toDate.setHours(23, 59, 59, 999)
    if (date > toDate) return false
  }

  return true
}

const matchesEventType = (entry: AuditEntry, eventTypes?: AuditEventType[]): boolean => {
  if (!eventTypes || eventTypes.length === 0) return true
  return eventTypes.includes(entry.eventType)
}

const matchesCategory = (entry: AuditEntry, categories?: string[]): boolean => {
  if (!categories || categories.length === 0) return true
  const meta = EVENT_TYPE_META[entry.eventType]
  return meta ? categories.includes(meta.category) : false
}

const matchesActor = (entry: AuditEntry, actors?: string[]): boolean => {
  if (!actors || actors.length === 0) return true
  return actors.includes(entry.actor)
}

const matchesSearch = (entry: AuditEntry, search?: string): boolean => {
  if (!search || search.trim() === '') return true
  const searchLower = search.toLowerCase()
  return (
    entry.eventDescription.toLowerCase().includes(searchLower) ||
    entry.actorName.toLowerCase().includes(searchLower) ||
    (entry.recordId?.toLowerCase().includes(searchLower) ?? false) ||
    entry.id.toLowerCase().includes(searchLower)
  )
}

const matchesRecordId = (entry: AuditEntry, recordId?: string): boolean => {
  if (!recordId) return true
  return entry.recordId === recordId
}

// ============================================================================
// SERVICE METHODS
// ============================================================================

export const auditService = {
  /**
   * Get audit entries with optional filters
   */
  async getAuditEntries(filters: AuditFilters = {}): Promise<AuditEntry[]> {
    await delay(300)

    const entries = getMockAuditEntries()
    let filtered = [...entries]

    // Apply date range filter
    if (filters.dateFrom || filters.dateTo) {
      filtered = filtered.filter(entry =>
        isWithinDateRange(entry.timestamp, filters.dateFrom, filters.dateTo)
      )
    }

    // Apply event type filter
    if (filters.eventTypes && filters.eventTypes.length > 0) {
      filtered = filtered.filter(entry => matchesEventType(entry, filters.eventTypes))
    }

    // Apply category filter
    if (filters.categories && filters.categories.length > 0) {
      filtered = filtered.filter(entry => matchesCategory(entry, filters.categories))
    }

    // Apply actor filter
    if (filters.actors && filters.actors.length > 0) {
      filtered = filtered.filter(entry => matchesActor(entry, filters.actors))
    }

    // Apply search filter
    if (filters.search) {
      filtered = filtered.filter(entry => matchesSearch(entry, filters.search))
    }

    // Apply record ID filter
    if (filters.recordId) {
      filtered = filtered.filter(entry => matchesRecordId(entry, filters.recordId))
    }

    return filtered
  },

  /**
   * Get audit statistics
   */
  async getAuditStats(filters: AuditFilters = {}): Promise<AuditStats> {
    await delay(200)

    const entries = await this.getAuditEntries(filters)

    // Count by category
    const entriesByCategory: Record<string, number> = {}
    const entriesByEventType: Record<string, number> = {}
    const entriesByActor: Record<string, number> = {}
    const actorMap = new Map<string, string>()

    entries.forEach(entry => {
      // By category
      const meta = EVENT_TYPE_META[entry.eventType]
      if (meta) {
        entriesByCategory[meta.category] = (entriesByCategory[meta.category] || 0) + 1
      }

      // By event type
      entriesByEventType[entry.eventType] = (entriesByEventType[entry.eventType] || 0) + 1

      // By actor
      entriesByActor[entry.actor] = (entriesByActor[entry.actor] || 0) + 1
      actorMap.set(entry.actor, entry.actorName)
    })

    // Unique actors
    const uniqueActors = Array.from(actorMap.entries()).map(([id, name]) => ({ id, name }))

    // Date range
    const timestamps = entries.map(e => new Date(e.timestamp).getTime())
    const earliest = timestamps.length > 0 ? new Date(Math.min(...timestamps)).toISOString() : ''
    const latest = timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : ''

    return {
      totalEntries: entries.length,
      entriesByCategory,
      entriesByEventType,
      entriesByActor,
      uniqueActors,
      dateRange: { earliest, latest }
    }
  },

  /**
   * Get audit entry by ID
   */
  async getAuditEntryById(id: string): Promise<AuditEntry | null> {
    await delay(150)
    const entries = getMockAuditEntries()
    return entries.find(e => e.id === id) || null
  },

  /**
   * Get audit entries for a specific record
   */
  async getAuditEntriesForRecord(recordId: string): Promise<AuditEntry[]> {
    await delay(200)
    return this.getAuditEntries({ recordId })
  },

  /**
   * Export audit entries (returns CSV string)
   */
  async exportAuditEntries(filters: AuditFilters = {}): Promise<string> {
    await delay(500)

    const entries = await this.getAuditEntries(filters)

    // Generate CSV
    const headers = [
      'ID',
      'Timestamp',
      'Actor',
      'Event Type',
      'Description',
      'Record ID',
      'Amount',
      'Currency',
      'Before State',
      'After State'
    ]

    const rows = entries.map(entry => [
      entry.id,
      entry.timestamp,
      entry.actorName,
      entry.eventType,
      `"${entry.eventDescription.replace(/"/g, '""')}"`,
      entry.recordId || '',
      entry.amount?.toString() || '',
      entry.currency || '',
      entry.beforeState || '',
      entry.afterState || ''
    ])

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n')
  }
}
