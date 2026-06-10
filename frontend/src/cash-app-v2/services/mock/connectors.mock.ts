/**
 * Connector Studio - Mock Service Layer
 * Provides data access methods for connectors and execution runs
 */

import { mockConnectors, mockExecutionRuns } from '../../data/connectorsData'
import type { ConnectorConfig, ExecutionRun, ConnectorType, ConnectorStatus } from '../../types/domain'

// Simulate network delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// ============================================================================
// FILTERS
// ============================================================================

interface ConnectorFilters {
  type?: ConnectorType
  status?: ConnectorStatus
  search?: string
}

interface ExecutionRunFilters {
  connectorId?: string
  status?: string
  dateFrom?: string
  dateTo?: string
}

// ============================================================================
// SERVICE METHODS
// ============================================================================

export const connectorsService = {
  /**
   * Get all connectors with optional filters
   */
  async getConnectors(filters: ConnectorFilters = {}): Promise<ConnectorConfig[]> {
    await delay(300)

    let filtered = [...mockConnectors]

    // Apply type filter
    if (filters.type) {
      filtered = filtered.filter(c => c.type === filters.type)
    }

    // Apply status filter
    if (filters.status) {
      filtered = filtered.filter(c => c.status === filters.status)
    }

    // Apply search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      filtered = filtered.filter(c =>
        c.name.toLowerCase().includes(searchLower) ||
        c.description.toLowerCase().includes(searchLower) ||
        c.subType.toLowerCase().includes(searchLower)
      )
    }

    // Sort by type only, preserve original order within type
    filtered.sort((a, b) => {
      const typeOrder = { bank: 1, psp: 2, internal: 3, erp: 4 }
      return typeOrder[a.type] - typeOrder[b.type]
    })

    return filtered
  },

  /**
   * Get connector by ID
   */
  async getConnectorById(connectorId: string): Promise<ConnectorConfig | null> {
    await delay(200)

    const connector = mockConnectors.find(c => c.id === connectorId)
    return connector || null
  },

  /**
   * Get execution runs for a connector
   */
  async getExecutionRuns(filters: ExecutionRunFilters = {}): Promise<ExecutionRun[]> {
    await delay(300)

    let filtered = [...mockExecutionRuns]

    // Apply connector filter
    if (filters.connectorId) {
      filtered = filtered.filter(r => r.connectorId === filters.connectorId)
    }

    // Apply status filter
    if (filters.status) {
      filtered = filtered.filter(r => r.status === filters.status)
    }

    // Apply date range filter
    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom)
      filtered = filtered.filter(r => new Date(r.startTime) >= fromDate)
    }

    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo)
      filtered = filtered.filter(r => new Date(r.startTime) <= toDate)
    }

    // Sort by start time descending (most recent first)
    filtered.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())

    return filtered
  },

  /**
   * Get execution run by ID
   */
  async getExecutionRunById(runId: string): Promise<ExecutionRun | null> {
    await delay(200)

    const run = mockExecutionRuns.find(r => r.id === runId)
    return run || null
  },

  /**
   * Get connector statistics
   */
  async getConnectorStats() {
    await delay(200)

    const stats = {
      totalConnectors: mockConnectors.length,
      activeConnectors: mockConnectors.filter(c => c.status === 'active').length,
      inactiveConnectors: mockConnectors.filter(c => c.status === 'inactive').length,
      errorConnectors: mockConnectors.filter(c => c.status === 'error').length,
      byType: {
        bank: mockConnectors.filter(c => c.type === 'bank').length,
        psp: mockConnectors.filter(c => c.type === 'psp').length,
        internal: mockConnectors.filter(c => c.type === 'internal').length,
        erp: mockConnectors.filter(c => c.type === 'erp').length,
      },
      avgSuccessRate: mockConnectors
        .filter(c => c.successRate !== undefined)
        .reduce((sum, c) => sum + (c.successRate || 0), 0) / mockConnectors.filter(c => c.successRate).length,
    }

    return stats
  },

  /**
   * Test connection for a connector
   */
  async testConnection(connectorId: string): Promise<{ success: boolean; message: string; responseTime?: number }> {
    await delay(1000 + Math.random() * 2000) // Simulate variable response time

    const connector = mockConnectors.find(c => c.id === connectorId)
    if (!connector) {
      return { success: false, message: 'Connector not found' }
    }

    // Simulate success/failure based on connector status
    if (connector.status === 'error') {
      return {
        success: false,
        message: 'Connection failed: Host unreachable',
      }
    }

    const responseTime = 150 + Math.floor(Math.random() * 500)
    return {
      success: true,
      message: 'Connection successful',
      responseTime,
    }
  },

  /**
   * Manually trigger a connector run
   */
  async triggerRun(connectorId: string, userId: string, userName: string): Promise<ExecutionRun> {
    await delay(500)

    const connector = mockConnectors.find(c => c.id === connectorId)
    if (!connector) {
      throw new Error('Connector not found')
    }

    // Create a new run
    const now = new Date().toISOString()
    const newRun: ExecutionRun = {
      id: `RUN-${Date.now()}`,
      connectorId: connector.id,
      connectorName: connector.name,
      status: 'running',
      startTime: now,
      trigger: {
        type: 'manual',
        userId,
        userName,
      },
      stats: {
        totalRecords: 0,
        successfulRecords: 0,
        failedRecords: 0,
        skippedRecords: 0,
        dataVolumeMB: 0,
      },
    }

    return newRun
  },

  /**
   * Get recent runs summary (for connector list cards)
   */
  async getRecentRunsSummary() {
    await delay(200)

    const summary: Record<string, { lastRun: string; status: string; duration: number }> = {}

    mockConnectors.forEach(connector => {
      const connectorRuns = mockExecutionRuns.filter(r => r.connectorId === connector.id)
      if (connectorRuns.length > 0) {
        const lastRun = connectorRuns.sort((a, b) =>
          new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
        )[0]

        summary[connector.id] = {
          lastRun: lastRun.startTime,
          status: lastRun.status,
          duration: lastRun.duration || 0,
        }
      }
    })

    return summary
  },
}
