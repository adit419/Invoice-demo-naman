/**
 * Support Tickets - Mock Service Layer
 */

import { getMockTickets, getMockTicketComments } from '../../data/ticketsData'
import type { Ticket, TicketComment, TicketStats, TicketStatus, TicketCategory, TicketPriority } from '../../types/domain'

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// ============================================================================
// IN-MEMORY STORE FOR DYNAMICALLY CREATED TICKETS
// ============================================================================

// Store for dynamically created tickets (persists during session)
let dynamicTickets: Ticket[] = []
let dynamicComments: TicketComment[] = []
let ticketCounter = 100 // Start from 100 to avoid ID conflicts

// Event listeners for ticket updates
type TicketListener = (tickets: Ticket[]) => void
const ticketListeners: Set<TicketListener> = new Set()

export const subscribeToTickets = (listener: TicketListener): (() => void) => {
  ticketListeners.add(listener)
  return () => ticketListeners.delete(listener)
}

const notifyListeners = () => {
  const allTickets = [...getMockTickets(), ...dynamicTickets]
  ticketListeners.forEach(listener => listener(allTickets))
}

// ============================================================================
// FILTERS
// ============================================================================

interface TicketFilters {
  status?: TicketStatus[]
  priority?: TicketPriority[]
  category?: TicketCategory[]
  pspId?: string[]
  assignee?: string[]
  slaBreach?: boolean
  search?: string
}

// ============================================================================
// SERVICE
// ============================================================================

export const ticketsService = {
  /**
   * Get tickets with optional filters
   */
  async getTickets(filters: TicketFilters = {}): Promise<Ticket[]> {
    await delay(200)

    // Combine mock tickets with dynamically created tickets
    let tickets = [...dynamicTickets, ...getMockTickets()]

    if (filters.status && filters.status.length > 0) {
      tickets = tickets.filter(t => filters.status!.includes(t.status))
    }

    if (filters.priority && filters.priority.length > 0) {
      tickets = tickets.filter(t => filters.priority!.includes(t.priority))
    }

    if (filters.category && filters.category.length > 0) {
      tickets = tickets.filter(t => filters.category!.includes(t.category))
    }

    if (filters.pspId && filters.pspId.length > 0) {
      tickets = tickets.filter(t => filters.pspId!.includes(t.pspId))
    }

    if (filters.assignee && filters.assignee.length > 0) {
      tickets = tickets.filter(t => filters.assignee!.includes(t.assignee))
    }

    if (filters.slaBreach !== undefined) {
      tickets = tickets.filter(t => t.slaBreach === filters.slaBreach)
    }

    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      tickets = tickets.filter(t =>
        t.subject.toLowerCase().includes(searchLower) ||
        t.description.toLowerCase().includes(searchLower) ||
        t.id.toLowerCase().includes(searchLower) ||
        t.pspName.toLowerCase().includes(searchLower)
      )
    }

    return tickets
  },

  /**
   * Get ticket by ID
   */
  async getTicketById(id: string): Promise<Ticket | null> {
    await delay(150)
    // Check dynamic tickets first
    const dynamicTicket = dynamicTickets.find(t => t.id === id)
    if (dynamicTicket) return dynamicTicket
    // Then check mock tickets
    const tickets = getMockTickets()
    return tickets.find(t => t.id === id) || null
  },

  /**
   * Get ticket statistics
   */
  async getTicketStats(): Promise<TicketStats> {
    await delay(200)

    // Combine mock tickets with dynamically created tickets
    const tickets = [...dynamicTickets, ...getMockTickets()]

    const byPsp: Record<string, number> = {}
    const byCategory: Record<string, number> = {}

    tickets.forEach(t => {
      byPsp[t.pspId] = (byPsp[t.pspId] || 0) + 1
      byCategory[t.category] = (byCategory[t.category] || 0) + 1
    })

    const openStatuses: TicketStatus[] = ['open', 'in_progress', 'pending_psp', 'escalated']
    const openTickets = tickets.filter(t => openStatuses.includes(t.status))

    return {
      total: tickets.length,
      open: tickets.filter(t => t.status === 'open').length,
      inProgress: tickets.filter(t => t.status === 'in_progress').length,
      pendingPsp: tickets.filter(t => t.status === 'pending_psp').length,
      escalated: tickets.filter(t => t.status === 'escalated').length,
      slaBreach: tickets.filter(t => t.slaBreach).length,
      avgResolutionTime: '2.4 days',
      byPsp,
      byCategory,
    }
  },

  /**
   * Get comments for a ticket
   */
  async getTicketComments(ticketId: string): Promise<TicketComment[]> {
    await delay(150)
    // Combine dynamic comments with mock comments
    const dynComments = dynamicComments.filter(c => c.ticketId === ticketId)
    const mockComments = getMockTicketComments(ticketId)
    return [...dynComments, ...mockComments]
  },

  /**
   * Get open tickets (convenience method)
   */
  async getOpenTickets(): Promise<Ticket[]> {
    return this.getTickets({
      status: ['open', 'in_progress', 'pending_psp', 'escalated']
    })
  },

  /**
   * Get SLA breached tickets
   */
  async getSlaBreachedTickets(): Promise<Ticket[]> {
    return this.getTickets({ slaBreach: true })
  },

  /**
   * Create a new ticket
   */
  async createTicket(data: {
    subject: string
    description: string
    category: TicketCategory
    priority: TicketPriority
    pspId: string
    pspName: string
    relatedRecordId?: string
    relatedRecordType?: 'settlement' | 'exception' | 'bank_credit' | 'je_batch'
    amount?: number
    currency?: string
  }): Promise<Ticket> {
    await delay(500)

    ticketCounter++
    const now = new Date()
    const dueDate = new Date(now)

    // Set due date based on priority
    switch (data.priority) {
      case 'critical':
        dueDate.setDate(dueDate.getDate() + 1) // 24 hours
        break
      case 'high':
        dueDate.setDate(dueDate.getDate() + 3) // 3 days
        break
      case 'medium':
        dueDate.setDate(dueDate.getDate() + 5) // 5 days
        break
      case 'low':
        dueDate.setDate(dueDate.getDate() + 7) // 7 days
        break
    }

    const newTicket: Ticket = {
      id: `TKT-2026-${String(ticketCounter).padStart(4, '0')}`,
      subject: data.subject,
      description: data.description,
      category: data.category,
      status: 'open',
      priority: data.priority,
      pspId: data.pspId,
      pspName: data.pspName,
      relatedRecordId: data.relatedRecordId,
      relatedRecordType: data.relatedRecordType,
      assignee: 'USR-001',
      assigneeName: 'Sarah Chen',
      reporter: 'USR-001',
      reporterName: 'Sarah Chen (You)',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      dueDate: dueDate.toISOString(),
      slaBreach: false,
      amount: data.amount,
      currency: data.currency,
      responseCount: 0,
      tags: ['new', 'user-created'],
    }

    // Add initial comment
    const initialComment: TicketComment = {
      id: `CMT-DYN-${Date.now()}`,
      ticketId: newTicket.id,
      author: 'USR-001',
      authorName: 'Sarah Chen (You)',
      authorType: 'internal',
      content: data.description,
      timestamp: now.toISOString(),
      isInternal: false,
    }

    dynamicTickets.unshift(newTicket) // Add to beginning
    dynamicComments.push(initialComment)

    // Notify listeners
    notifyListeners()

    return newTicket
  },

  /**
   * Get all dynamically created tickets
   */
  getDynamicTickets(): Ticket[] {
    return [...dynamicTickets]
  },

  /**
   * Clear dynamic tickets (for testing)
   */
  clearDynamicTickets(): void {
    dynamicTickets = []
    dynamicComments = []
    notifyListeners()
  },
}
