/**
 * Approval Policy Configuration
 *
 * Defines thresholds and rules for when financial actions require manager approval.
 * This ensures proper financial controls and audit compliance.
 */

export interface ApprovalPolicyRule {
  action: string
  requiresApproval: (amount: number, currency: string) => boolean
  threshold: number
  currency: string
  approvalLevel: 'analyst' | 'manager' | 'controller' | 'cfo'
  reason: string
  description: string
}

/**
 * Global approval policy
 * Used to determine if an action requires approval based on amount and type
 */
export const approvalPolicy: Record<string, ApprovalPolicyRule> = {
  // Customer refunds - always require approval above threshold
  refund: {
    action: 'refund',
    requiresApproval: (amount: number, currency: string) => {
      if (currency === 'SGD') return amount > 10000
      if (currency === 'MYR') return amount > 30000
      if (currency === 'IDR') return amount > 150000000
      return true // Unknown currency - require approval
    },
    threshold: 10000,
    currency: 'SGD',
    approvalLevel: 'manager',
    reason: 'Revenue reversal above threshold has direct P&L impact',
    description: 'Refunds reverse recognized revenue and require manager verification'
  },

  // Write-offs - impact P&L, require approval for any material amount
  write_off: {
    action: 'write_off',
    requiresApproval: (amount: number, currency: string) => {
      if (currency === 'SGD') return amount > 1000
      if (currency === 'MYR') return amount > 3000
      if (currency === 'IDR') return amount > 15000000
      return true
    },
    threshold: 1000,
    currency: 'SGD',
    approvalLevel: 'manager',
    reason: 'Write-offs create bad debt expense and affect P&L',
    description: 'Any write-off requires approval due to financial statement impact'
  },

  // Variance acceptance - depends on both absolute amount and percentage
  variance_acceptance: {
    action: 'variance_acceptance',
    requiresApproval: (amount: number, currency: string) => {
      if (currency === 'SGD') return amount > 1000
      if (currency === 'MYR') return amount > 3000
      if (currency === 'IDR') return amount > 15000000
      return true
    },
    threshold: 1000,
    currency: 'SGD',
    approvalLevel: 'manager',
    reason: 'Unexplained variance requires investigation and approval',
    description: 'Variances above threshold or without full explanation need approval'
  },

  // Manual GL posting - always require approval (affects accounting)
  manual_gl_posting: {
    action: 'manual_gl_posting',
    requiresApproval: () => true, // Always requires approval
    threshold: 0,
    currency: 'SGD',
    approvalLevel: 'manager',
    reason: 'Manual accounting entries must be verified before posting',
    description: 'All manual GL entries require approval to ensure accuracy'
  },

  // Revenue reversal - similar to refund
  revenue_reversal: {
    action: 'revenue_reversal',
    requiresApproval: (amount: number, currency: string) => {
      if (currency === 'SGD') return amount > 10000
      if (currency === 'MYR') return amount > 30000
      if (currency === 'IDR') return amount > 150000000
      return true
    },
    threshold: 10000,
    currency: 'SGD',
    approvalLevel: 'manager',
    reason: 'Revenue reversals affect reported financials',
    description: 'Reversing recognized revenue requires manager approval'
  },

  // Auto-match - no approval needed for perfect matches
  auto_match: {
    action: 'auto_match',
    requiresApproval: () => false, // Never requires approval if 100% match
    threshold: Infinity,
    currency: 'SGD',
    approvalLevel: 'analyst',
    reason: 'Perfect match with zero variance',
    description: 'System-verified matches with no variance can be auto-processed'
  },

  // Chargeback representment - no approval for collecting evidence
  collect_evidence: {
    action: 'collect_evidence',
    requiresApproval: () => false,
    threshold: Infinity,
    currency: 'SGD',
    approvalLevel: 'analyst',
    reason: 'Informational action only',
    description: 'Collecting evidence does not require approval'
  },

  // PSP inquiry generation - no approval needed (just communication)
  generate_psp_inquiry: {
    action: 'generate_psp_inquiry',
    requiresApproval: () => false,
    threshold: Infinity,
    currency: 'SGD',
    approvalLevel: 'analyst',
    reason: 'Communication action only, no financial impact',
    description: 'Generating inquiries to PSP does not require approval'
  }
}

/**
 * Check if an action requires approval
 */
export const requiresApproval = (
  action: string,
  amount: number,
  currency: string
): boolean => {
  const rule = approvalPolicy[action]
  if (!rule) {
    // Unknown action - require approval to be safe
    console.warn(`Unknown action type: ${action}. Defaulting to require approval.`)
    return true
  }
  return rule.requiresApproval(amount, currency)
}

/**
 * Get approval metadata for an action
 */
export const getApprovalMetadata = (
  action: string,
  amount: number,
  currency: string
) => {
  const rule = approvalPolicy[action]
  if (!rule) {
    return {
      approvalRequired: true,
      approvalReason: 'Unknown action type - approval required by default',
      approvalLevel: 'manager' as const,
      threshold: 0,
      currency: 'SGD'
    }
  }

  return {
    approvalRequired: rule.requiresApproval(amount, currency),
    approvalReason: rule.reason,
    approvalLevel: rule.approvalLevel,
    threshold: rule.threshold,
    currency: rule.currency,
    description: rule.description
  }
}

/**
 * Approval workflow states
 */
export enum ApprovalStatus {
  DRAFT = 'draft',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  WITHDRAWN = 'withdrawn'
}

/**
 * Get approver based on level
 */
export const getApproverForLevel = (level: 'analyst' | 'manager' | 'controller' | 'cfo') => {
  const approvers = {
    analyst: null, // No approval needed
    manager: {
      userId: 'manager1',
      name: 'Manager Sarah Lee',
      email: 'sarah.lee@grab.com',
      role: 'Finance Manager'
    },
    controller: {
      userId: 'controller1',
      name: 'Controller James Tan',
      email: 'james.tan@grab.com',
      role: 'Financial Controller'
    },
    cfo: {
      userId: 'cfo1',
      name: 'CFO Michael Chen',
      email: 'michael.chen@grab.com',
      role: 'Chief Financial Officer'
    }
  }

  return approvers[level]
}
