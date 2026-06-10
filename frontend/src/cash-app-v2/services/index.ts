/**
 * Service Layer Exports
 *
 * This file exports the active service implementation based on configuration.
 * For demo, we always use mock services.
 */

import { USE_MOCK_DATA } from '../config/env'

// Dashboard Service
export { dashboardService } from './mock/dashboard.mock'

// Exception Service
export { exceptionsService } from './mock/exceptions.mock'

// Settlement Service
export { settlementsService } from './mock/settlements.mock'

// Connector Service
export { connectorsService } from './mock/connectors.mock'

// Audit Service
export { auditService } from './mock/audit.mock'

// Tickets Service
export { ticketsService } from './mock/tickets.mock'

// Export other services as they are created:
// export { reversalsService } from USE_MOCK_DATA ? './mock/reversals.mock' : './api/reversals.api'
// export { reportsService } from USE_MOCK_DATA ? './mock/reports.mock' : './api/reports.api'
