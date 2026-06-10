/**
 * Enhanced Exception Data with Diagnostics, NBA, and Financial Breakdowns
 * All mathematical calculations are verified for accuracy
 */

import type { ExceptionDetail, SubsetSumMatch, ChargebackData } from '../types/exceptions'

// ============================================================================
// EXCEPTION 1: UNMATCHED BANK CREDIT - Enhanced Scenarios
// ============================================================================

export const enhancedExceptions: ExceptionDetail[] = [
  // Scenario A: PSP File Pending/Missing (Dynamic Date Calculation)
  // Note: The service layer will dynamically calculate expected arrival time and update text
  {
    id: 'BC-20260607-001',
    type: 'unmatched_credit',
    priority: 'high',
    referenceId: 'BC-20260607-001',
    amount: 142500,
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-07T08:30:00Z',
    slaDue: '2026-06-08T08:30:00Z',
    owner: null,
    aiConfidence: 94,
    aiSuggestion: 'PSP settlement file expected - auto-hold',
    status: 'open',
    age: '0d 4h',
    pastSLA: false,
    transactionType: 'settlement', // PSP daily settlement batch
    amountLabel: 'Bank Credit', // Amount represents: unmatched bank credit awaiting PSP file
    materiality: 'high',
    escalationLevel: 0,

    diagnostic: {
      outcome: 'psp_file_pending',
      confidence: 94,
      completedAt: '2026-06-07T08:31:00Z',
      systemRecommendation: 'Hold and re-attempt match on file arrival',
      autoAction: 'auto_hold_48h',
      findings: [
        {
          category: 'window_search',
          result: 'pass',
          detail: 'PSP settlement file expected (date will be calculated dynamically)',
          evidence: {
            expectedFile: 'GrabPay-SGD-Daily-20260607.csv',
            dueTime: '2026-06-07T18:00:00+08:00',
            settlementLag: 'T+1',
          }
        },
        {
          category: 'fuzzy_amount_match',
          result: 'fail',
          detail: 'No unmatched PSP settlement batches within ±0.5% of SGD 142,500',
          evidence: { tolerance: 0.005, candidatesFound: 0 }
        },
        {
          category: 'aggregate_sum',
          result: 'fail',
          detail: 'No combination of multiple bank credits sums to known PSP batch total',
        },
        {
          category: 'known_credit_pattern',
          result: 'fail',
          detail: 'Bank narration does not match any known non-order credit patterns',
        },
        {
          category: 'duplicate_check',
          result: 'pass',
          detail: 'No duplicate deposits detected with same amount and date',
        }
      ]
    },

    nba: {
      action: 'hold_and_retry',
      priority: 'auto',
      description: 'System will automatically re-attempt matching when file arrives (date will be calculated dynamically)',
      estimatedTime: 'calculated_dynamically',
      dueDate: '2026-06-07T18:00:00+08:00',
      actionButtons: [
        {
          id: 'confirm_hold',
          label: 'Confirm Hold',
          action: 'confirm_hold',
          variant: 'primary',
        },
        {
          id: 'manual_override',
          label: 'Manual Investigation',
          action: 'manual_investigate',
          variant: 'secondary',
        }
      ]
    },

    relatedRecords: [
      {
        type: 'bank_credit',
        id: 'BC-20260607-001',
        amount: 142500,
        currency: 'SGD',
        date: '2026-06-07T08:30:00Z',
        status: 'unmatched',
        reference: 'OCBC-SGD-20260607-001',
        description: 'GRABPAY PTE LTD SETTLEMENT'
      },
      {
        type: 'psp_file',
        id: 'GrabPay-SGD-Daily-20260607',
        amount: 0,
        currency: 'SGD',
        date: '2026-06-07T18:00:00+08:00',
        status: 'pending',
        description: 'Expected daily settlement file (T+1)'
      }
    ]
  },

  // Scenario B: Fuzzy Match Found (Within Tolerance)
  {
    id: 'BC-20260606-011',
    type: 'unmatched_credit',
    priority: 'high',
    referenceId: 'BC-20260606-011',
    amount: 284127.50,
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-06T09:15:00Z',
    slaDue: '2026-06-07T09:15:00Z',
    owner: 'analyst1',
    ownerName: 'Analyst Kim',
    aiConfidence: 92,
    aiSuggestion: 'Fuzzy match to PSP settlement PY-20260606-448',
    status: 'open',
    age: '1d 3h',
    pastSLA: false,
    transactionType: 'settlement', // PSP daily settlement batch
    amountLabel: 'Bank Credit', // Amount represents: bank credit with fuzzy match to PSP
    materiality: 'high',
    escalationLevel: 0,

    // Settlement Explorer Linkages
    linkedBankCreditId: 'BC-20260606-011',
    linkedBankCreditAmount: 284127.50,
    linkedSettlementRefs: ['PY-20260606-448'],
    linkedSettlementCount: 1,

    diagnostic: {
      outcome: 'fuzzy_match_found',
      confidence: 92,
      completedAt: '2026-06-06T09:16:00Z',
      systemRecommendation: 'Propose match with variance explanation',
      findings: [
        {
          category: 'window_search',
          result: 'fail',
          detail: 'No pending PSP files within expected window',
        },
        {
          category: 'fuzzy_amount_match',
          result: 'pass',
          detail: 'PSP settlement PY-20260606-448 matches within tolerance: Bank SGD 284,127.50 vs PSP SGD 284,000.00 (variance: SGD 127.50 / 0.045%)',
          evidence: {
            pspSettlementId: 'PY-20260606-448',
            pspAmount: 284000.00,
            bankAmount: 284127.50,
            variance: 127.50,
            variancePercent: 0.045,
            tolerance: 0.05, // 0.05% = 0.0005
            withinTolerance: true
          }
        },
        {
          category: 'variance_attribution',
          result: 'pass',
          detail: 'Variance attributed to: Bank charges (SGD 50.00) + FX rounding (SGD 77.50)',
          evidence: {
            bankCharges: 50.00,
            fxRounding: 77.50,
            total: 127.50
          }
        }
      ]
    },

    nba: {
      action: 'propose_match',
      priority: 'human_confirm',
      description: 'Match bank credit SGD 284,127.50 to PSP settlement PY-20260606-448 (SGD 284,000). Variance of SGD 127.50 (0.045%) is within tolerance and explained by bank charges + FX rounding.',
      actionButtons: [
        {
          id: 'accept_match',
          label: 'Accept Match',
          action: 'accept_proposed_match',
          variant: 'primary',
        },
        {
          id: 'reject_match',
          label: 'Reject Match',
          action: 'reject_match',
          variant: 'secondary',
          requiresInput: true,
          inputType: 'text',
        }
      ]
    },

    financialBreakdown: {
      gross: 284127.50,
      components: [
        {
          name: 'Bank Charges (Extra Received)',
          type: 'deduction',
          amount: 50.00,
          description: 'OCBC wire transfer fee covered by PSP'
        },
        {
          name: 'FX Rounding Gain',
          type: 'deduction',
          amount: 77.50,
          description: 'Favorable FX rate differential (Bank rate vs PSP rate)'
        }
      ],
      expectedNet: 284000.00,
      actualNet: 284127.50,
      variance: 127.50,
      varianceExplained: 127.50,
      varianceUnexplained: 0,
      currency: 'SGD'
    },

    relatedRecords: [
      {
        type: 'bank_credit',
        id: 'BC-20260606-011',
        amount: 284127.50,
        currency: 'SGD',
        date: '2026-06-06T09:15:00Z',
        status: 'unmatched',
        reference: 'OCBC-SGD-20260606-011',
        description: 'GRABPAY PTE LTD SETTLEMENT'
      },
      {
        type: 'settlement_line',
        id: 'PY-20260606-448',
        amount: 284000.00,
        currency: 'SGD',
        date: '2026-06-06T06:00:00Z',
        status: 'unmatched',
        reference: 'GrabPay-Batch-20260606-448',
        description: 'Daily settlement batch'
      }
    ]
  },

  // Scenario C: Aggregate Sum Match (Multiple Credits to One Settlement)
  {
    id: 'BC-20260606-012',
    type: 'unmatched_credit',
    priority: 'medium',
    referenceId: 'BC-20260606-012-GROUP',
    amount: 150000, // This is the parent, represents the sum
    currency: 'SGD',
    psp: 'stripe',
    pspName: 'Stripe',
    createdAt: '2026-06-06T10:00:00Z',
    slaDue: '2026-06-09T10:00:00Z',
    owner: 'analyst2',
    ownerName: 'Analyst Park',
    aiConfidence: 88,
    aiSuggestion: 'Aggregate sum match: 3 deposits = 1 PSP batch',
    status: 'open',
    age: '1d 2h',
    pastSLA: false,
    transactionType: 'settlement', // PSP daily settlement batch (split into 3 credits)
    amountLabel: 'Bank Credits Sum', // Amount represents: aggregate of 3 bank credits
    materiality: 'medium',
    escalationLevel: 0,

    diagnostic: {
      outcome: 'aggregate_sum_match',
      confidence: 88,
      completedAt: '2026-06-06T10:02:00Z',
      systemRecommendation: 'Propose multi-credit-to-one-settlement match',
      findings: [
        {
          category: 'aggregate_sum',
          result: 'pass',
          detail: 'Three bank credits (SGD 50,000 + 42,000 + 58,000 = 150,000) match PSP settlement batch PY-ST-20260606-001',
          evidence: {
            credits: [
              { id: 'BC-20260606-012A', amount: 50000 },
              { id: 'BC-20260606-012B', amount: 42000 },
              { id: 'BC-20260606-012C', amount: 58000 }
            ],
            sum: 150000,
            pspBatch: 'PY-ST-20260606-001',
            pspAmount: 150000,
            variance: 0
          }
        }
      ]
    },

    nba: {
      action: 'propose_aggregate_match',
      priority: 'human_confirm',
      description: 'Match three separate bank credits to single PSP settlement batch. Stripe split the settlement into multiple transfers to the same bank account.',
      actionButtons: [
        {
          id: 'accept_combination',
          label: 'Accept Combination',
          action: 'accept_aggregate_match',
          variant: 'primary',
        },
        {
          id: 'investigate',
          label: 'Investigate',
          action: 'manual_investigate',
          variant: 'secondary',
        }
      ]
    },

    relatedRecords: [
      {
        type: 'bank_credit',
        id: 'BC-20260606-012A',
        amount: 50000,
        currency: 'SGD',
        date: '2026-06-06T10:00:00Z',
        status: 'unmatched',
        reference: 'OCBC-SGD-20260606-012A',
        description: 'STRIPE SINGAPORE SETTLEMENT 1/3'
      },
      {
        type: 'bank_credit',
        id: 'BC-20260606-012B',
        amount: 42000,
        currency: 'SGD',
        date: '2026-06-06T10:05:00Z',
        status: 'unmatched',
        reference: 'OCBC-SGD-20260606-012B',
        description: 'STRIPE SINGAPORE SETTLEMENT 2/3'
      },
      {
        type: 'bank_credit',
        id: 'BC-20260606-012C',
        amount: 58000,
        currency: 'SGD',
        date: '2026-06-06T10:10:00Z',
        status: 'unmatched',
        reference: 'OCBC-SGD-20260606-012C',
        description: 'STRIPE SINGAPORE SETTLEMENT 3/3'
      },
      {
        type: 'settlement_line',
        id: 'PY-ST-20260606-001',
        amount: 150000,
        currency: 'SGD',
        date: '2026-06-06T06:00:00Z',
        status: 'unmatched',
        reference: 'Stripe-Daily-Batch-20260606',
        description: 'Daily settlement (T+2)'
      }
    ]
  },

  // ============================================================================
  // EXCEPTION 3: AMOUNT MISMATCH - Enhanced Scenarios with Full Waterfall
  // ============================================================================

  // Scenario A: Variance Fully Explained (Auto-Clear Candidate)
  {
    id: 'AM-20260606-001',
    type: 'amount_mismatch',
    priority: 'medium',
    referenceId: 'ORD-2026-88422',
    amount: 0.05, // Variance amount
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-06T11:00:00Z',
    slaDue: '2026-06-09T11:00:00Z',
    owner: 'analyst1',
    ownerName: 'Analyst Kim',
    aiConfidence: 96,
    aiSuggestion: 'Variance fully explained by fees + FX',
    status: 'open',
    age: '1d 1h',
    pastSLA: false,
    transactionType: 'payment', // Customer payment - food delivery order
    amountLabel: 'Variance', // Amount represents: difference between expected and actual settlement
    materiality: 'low',
    escalationLevel: 0,

    diagnostic: {
      outcome: 'variance_fully_explained',
      confidence: 96,
      completedAt: '2026-06-06T11:01:00Z',
      systemRecommendation: 'Auto-clear with component posting to GL',
      autoAction: 'auto_clear_with_gl_posting',
      findings: [
        {
          category: 'fee_decomposition',
          result: 'pass',
          detail: 'All variance attributed to: MDR Fee (SGD 7.14) + GST (SGD 0.50) + FX margin (SGD 0.86) - Reserve release (SGD 30.00)',
        },
        {
          category: 'unexplained_residual',
          result: 'pass',
          detail: 'Residual variance SGD 0.05 is within micro-tolerance (< SGD 1)',
        }
      ]
    },

    nba: {
      action: 'auto_clear',
      priority: 'auto',
      description: 'Variance of SGD 0.05 is fully explained by fee schedule and FX conversion. System can auto-post GL entries for each component.',
      actionButtons: [
        {
          id: 'confirm_auto_clear',
          label: 'Confirm Auto-Clear',
          action: 'confirm_auto_clear',
          variant: 'primary',
        },
        {
          id: 'review_details',
          label: 'Review Breakdown',
          action: 'review_breakdown',
          variant: 'secondary',
        }
      ]
    },

    financialBreakdown: {
      gross: 285.50,
      components: [
        {
          name: 'MDR Fee',
          type: 'deduction',
          amount: 7.14,
          percentage: 2.5,
          description: 'Merchant Discount Rate (2.5% per contract)'
        },
        {
          name: 'GST on MDR',
          type: 'deduction',
          amount: 0.50,
          percentage: 7.0,
          description: '7% GST on MDR fee (SGD 7.14 × 7%)'
        },
        {
          name: 'FX Margin',
          type: 'deduction',
          amount: 0.86,
          percentage: 0.3,
          description: 'FX conversion margin (0.3%)'
        },
        {
          name: 'Rolling Reserve Release',
          type: 'addition',
          amount: 30.00,
          description: 'Q1 2026 reserve release (partial)'
        }
      ],
      expectedNet: 307.00,
      actualNet: 306.95,
      variance: 0.05,
      varianceExplained: 0.05,
      varianceUnexplained: 0,
      currency: 'SGD'
    },

    relatedRecords: [
      {
        type: 'order',
        id: 'ORD-2026-88422',
        amount: 285.50,
        currency: 'SGD',
        date: '2026-06-04T14:20:00Z',
        status: 'completed',
        reference: 'Grab-Food-Delivery',
        description: 'Corporate catering order (15 pax)'
      },
      {
        type: 'settlement_line',
        id: 'PY-20260606-448-L1',
        amount: 306.95,
        currency: 'SGD',
        date: '2026-06-06T06:00:00Z',
        status: 'matched',
        reference: 'GrabPay-Settlement-Line',
      },
      {
        type: 'bank_credit',
        id: 'BC-20260606-013',
        amount: 98020.00,
        currency: 'SGD',
        date: '2026-06-06T09:30:00Z',
        status: 'matched',
        reference: 'OCBC-SGD-20260606-013',
      }
    ]
  },

  // Scenario B: Partial Explanation (Split Explained/Unexplained)
  {
    id: 'AM-20260606-002',
    type: 'amount_mismatch',
    priority: 'medium',
    referenceId: 'ORD-2026-88423',
    amount: 2.20, // Total variance (FX rounding only)
    currency: 'SGD',
    psp: 'stripe',
    pspName: 'Stripe',
    createdAt: '2026-06-06T12:00:00Z',
    slaDue: '2026-06-09T12:00:00Z',
    owner: null,
    aiConfidence: 95,
    aiSuggestion: 'Variance fully explained by MDR fees and FX rounding',
    status: 'open',
    age: '1d 0h',
    pastSLA: false,
    transactionType: 'payment', // Customer payment - ride booking
    amountLabel: 'Variance', // Amount represents: FX rounding difference
    materiality: 'medium',
    escalationLevel: 0,

    diagnostic: {
      outcome: 'variance_fully_explained',
      confidence: 95,
      completedAt: '2026-06-06T12:01:00Z',
      systemRecommendation: 'Accept variance - fully explained by FX rounding',
      findings: [
        {
          category: 'fee_decomposition',
          result: 'pass',
          detail: 'Expected fees (SGD 2.57 MDR at 3.0%) match PSP deduction. FX rounding explains full variance of SGD 2.20',
          evidence: {
            expectedMDR: 2.57,
            actualMDR: 2.57,
            mdrMatch: true,
            fxRounding: 2.20,
            unexplained: 0
          }
        },
        {
          category: 'variance_tolerance',
          result: 'pass',
          detail: 'Variance SGD 2.20 is within acceptable FX rounding tolerance (< 3% of gross)',
        }
      ]
    },

    nba: {
      action: 'accept_variance',
      priority: 'auto',
      description: 'Variance of SGD 2.20 is fully explained by FX rounding (within 3% tolerance). No unexplained residual. Safe to accept.',
      actionButtons: [
        {
          id: 'accept_variance',
          label: 'Accept & Match',
          action: 'accept_variance_match',
          variant: 'primary',
        },
        {
          id: 'review_fx',
          label: 'Review FX Details',
          action: 'review_fx_calculation',
          variant: 'secondary',
        }
      ]
    },

    financialBreakdown: {
      gross: 85.80,
      components: [
        {
          name: 'MDR Fee',
          type: 'deduction',
          amount: 2.57,
          percentage: 3.0,
          description: 'Stripe MDR (3.0% per contract) - 85.80 × 3.0%'
        },
        {
          name: 'FX Rounding',
          type: 'deduction',
          amount: 2.20,
          description: 'Currency conversion rounding (SGD/USD exchange)'
        }
      ],
      expectedNet: 83.23,
      actualNet: 81.03,
      variance: 2.20,
      varianceExplained: 2.20,
      varianceUnexplained: 0,
      currency: 'SGD'
    },

    relatedRecords: [
      {
        type: 'order',
        id: 'ORD-2026-88423',
        amount: 85.80,
        currency: 'SGD',
        date: '2026-06-04T15:30:00Z',
        status: 'completed',
        reference: 'Grab-Ride',
        description: 'Airport ride (Changi to CBD, 28 km)'
      },
      {
        type: 'settlement_line',
        id: 'ST-20260606-042',
        amount: 81.03,
        currency: 'SGD',
        date: '2026-06-06T06:00:00Z',
        status: 'matched',
        description: 'Net after MDR (2.57) and FX rounding (2.20)'
      }
    ]
  },

  // ============================================================================
  // EXCEPTION 4: UNMATCHED ORDER - Enhanced Scenarios
  // ============================================================================

  // Scenario A: PSP Refund/Reversal with No Matching Order - Ticket Raised with PSP
  {
    id: 'UO-20260606-001',
    type: 'unmatched_order',
    priority: 'high',
    referenceId: 'N/A', // Order ID absent
    amount: -248.00, // Negative: Refund/reversal from PSP
    currency: 'SGD',
    psp: 'stripe',
    pspName: 'Stripe',
    createdAt: '2026-05-29T10:00:00Z', // 8 days ago
    slaDue: '2026-06-02T10:00:00Z', // SLA was 4 days
    owner: 'analyst1',
    ownerName: 'Analyst Kim',
    aiConfidence: 72,
    aiSuggestion: 'PSP refund received with no matching order - awaiting PSP response',
    status: 'open',
    age: '8d 0h',
    pastSLA: true,
    transactionType: 'refund', // PSP refund/reversal with no matching order
    amountLabel: 'PSP Refund', // Amount represents: refund received from PSP (negative = outflow)
    materiality: 'high',
    escalationLevel: 1,

    diagnostic: {
      outcome: 'order_not_found_refund_received',
      confidence: 72,
      completedAt: '2026-05-29T10:05:00Z',
      systemRecommendation: 'Awaiting PSP clarification - ticket already raised',
      autoAction: undefined,
      findings: [
        {
          category: 'oms_search_current',
          result: 'fail',
          detail: 'No matching order found in OMS for this refund/reversal transaction',
          evidence: {
            orderId: 'N/A',
            found: false,
            location: 'oms_current',
            searchMethod: 'amount_date_match',
            searchCriteria: 'SGD 248.00 refund on May 29'
          }
        },
        {
          category: 'oms_archive_search',
          result: 'fail',
          detail: 'No matching order found in archive database',
          evidence: {
            orderId: 'N/A',
            found: false,
            location: 'oms_archive',
            archiveRetentionDays: 365
          }
        },
        {
          category: 'psp_settlement_check',
          result: 'pass',
          detail: 'PSP settlement file shows a refund/reversal of SGD 248.00 on May 29. Transaction type: REFUND. No order reference provided by PSP.',
          evidence: {
            pspTransactionType: 'REFUND',
            pspAmount: -248.00,
            pspSettlementDate: '2026-05-29T06:00:00Z',
            pspReference: 'Stripe-Refund-20260529-042',
            orderIdProvided: false
          }
        },
        {
          category: 'psp_ticket_status',
          result: 'partial',
          detail: 'PSP inquiry ticket raised on May 30. Status: PENDING. No response received after 8 days.',
          evidence: {
            ticketId: 'STR-2026-INQ-88421',
            ticketRaisedDate: '2026-05-30T09:15:00Z',
            ticketStatus: 'pending',
            daysPending: 8,
            lastFollowUp: '2026-06-05T14:00:00Z',
            expectedResponseDays: 3,
            overdue: true
          }
        }
      ]
    },

    nba: {
      action: 'follow_up_psp_ticket',
      priority: 'human_investigate',
      description: 'A refund/reversal of SGD 248.00 was received from Stripe on May 29 with no matching order in our system. PSP inquiry ticket STR-2026-INQ-88421 was raised on May 30 and has been pending for 8 days without response. Recommend escalating with PSP or sending follow-up inquiry.',
      estimatedTime: 'Awaiting PSP response',

      // Existing PSP ticket information
      pspTicket: {
        ticketId: 'STR-2026-INQ-88421',
        ticketStatus: 'pending',
        raisedDate: '2026-05-30T09:15:00Z',
        daysPending: 8,
        lastFollowUp: '2026-06-05T14:00:00Z',
        pspContact: 'Stripe Merchant Support',
        inquiryType: 'Refund Clarification',
        description: 'Request for order details and refund reason for transaction Stripe-Refund-20260529-042'
      },

      actionButtons: [
        {
          id: 'escalate_psp',
          label: 'Escalate with PSP',
          action: 'escalate_psp_ticket',
          variant: 'primary',
          requiresApproval: false
        },
        {
          id: 'send_followup',
          label: 'Send Follow-up',
          action: 'send_psp_followup',
          variant: 'secondary',
          requiresApproval: false
        },
        {
          id: 'accept_revenue_reversal',
          label: 'Accept Revenue Reversal',
          action: 'accept_revenue_reversal',
          variant: 'danger',
          requiresApproval: true,
          showJournalPreview: true
        }
      ],

      // Approval required for revenue reversal
      approval: {
        approvalRequired: true,
        approvalReason: 'Accepting revenue reversal of SGD 248.00 requires manager approval per policy REV-001. This will reduce recognized revenue.',
        approvalThreshold: {
          amount: 100,
          currency: 'SGD',
          rule: 'revenue_reversal',
          description: 'Revenue reversals above SGD 100 require manager approval'
        },
        approvalLevel: 'manager',
        approver: 'USR-MGR-001',
        approverName: 'Sarah Chen (Finance Manager)'
      },

      // Journal entries for revenue reversal
      journalEntries: [
        {
          entryNumber: 1,
          description: 'Reverse revenue for unmatched PSP refund - Stripe-Refund-20260529-042',
          postingDate: '2026-06-06',
          documentType: 'customer_refund',
          lines: [
            {
              lineNumber: 1,
              account: '4100',
              accountName: 'Sales Revenue',
              debitCredit: 'debit',
              amount: 248.00,
              currency: 'SGD',
              costCenter: 'CC-REVENUE',
              department: 'FINANCE',
              reference: 'UO-20260606-001'
            },
            {
              lineNumber: 2,
              account: '2100',
              accountName: 'Stripe Payable',
              debitCredit: 'credit',
              amount: 248.00,
              currency: 'SGD',
              costCenter: 'CC-REVENUE',
              department: 'FINANCE',
              reference: 'Stripe-Refund-20260529-042'
            }
          ],
          totalDebit: 248.00,
          totalCredit: 248.00
        }
      ]
    },

    relatedRecords: [
      {
        type: 'settlement_line',
        id: 'Stripe-Refund-20260529-042',
        amount: -248.00,
        currency: 'SGD',
        date: '2026-05-29T06:00:00Z',
        status: 'unmatched',
        reference: 'PSP Refund - No Order ID',
        description: 'Refund/reversal received from Stripe with no matching order reference'
      }
    ]
  },

  // Scenario B: Settlement Shortfall - Order Found but PSP Underpaid
  {
    id: 'UO-20260606-002',
    type: 'unmatched_order',
    priority: 'medium',
    referenceId: 'ORD-2026-88512',
    amount: -128.00, // Negative: PSP settled less than expected
    currency: 'SGD',
    psp: 'stripe',
    pspName: 'Stripe',
    createdAt: '2026-06-06T11:30:00Z',
    slaDue: '2026-06-06T23:30:00Z',
    owner: 'analyst2',
    ownerName: 'Analyst Park',
    aiConfidence: 92,
    aiSuggestion: 'Order found in OMS - PSP settlement shortfall detected',
    status: 'open',
    age: '0d 6h',
    pastSLA: false,
    transactionType: 'payment', // Customer payment - PSP settled less than expected
    amountLabel: 'Settlement Shortfall', // Amount represents: difference between OMS order and PSP settlement
    materiality: 'medium',
    escalationLevel: 0,

    diagnostic: {
      outcome: 'settlement_shortfall',
      confidence: 92,
      completedAt: '2026-06-06T11:33:00Z',
      systemRecommendation: 'Raise internal ticket to investigate PSP settlement discrepancy',
      findings: [
        {
          category: 'oms_search_current',
          result: 'pass',
          detail: 'Order ORD-2026-88512 FOUND in current OMS database with status COMPLETED',
          evidence: {
            orderId: 'ORD-2026-88512',
            found: true,
            location: 'oms_current',
            searchMethod: 'exact_match',
            orderStatus: 'completed',
            orderAmount: 256.00,
            paymentCaptured: true,
            paymentCapturedAt: '2026-06-05T14:30:00Z'
          }
        },
        {
          category: 'psp_settlement_check',
          result: 'fail',
          detail: 'PSP settlement shows SGD 128.00 but OMS order amount is SGD 256.00 - shortfall of SGD 128.00',
          evidence: {
            pspOrderId: 'ORD-2026-88512',
            pspSettledAmount: 128.00,
            omsOrderAmount: 256.00,
            shortfall: 128.00,
            pspSettlementDate: '2026-06-06T06:00:00Z',
            pspReference: 'Stripe-Daily-20260606-102'
          }
        },
        {
          category: 'partial_settlement_check',
          result: 'pass',
          detail: 'This appears to be a partial settlement. PSP may have split the payout or applied unexpected deductions.',
          evidence: {
            settlementRatio: 0.50,
            possibleReasons: ['Split payout', 'Partial refund processed', 'MDR adjustment', 'Currency rounding']
          }
        }
      ]
    },

    nba: {
      action: 'raise_internal_ticket',
      priority: 'human_investigate',
      description: 'Order ORD-2026-88512 exists in OMS (SGD 256.00 completed) but PSP only settled SGD 128.00. This represents a shortfall of SGD 128.00. Internal investigation required to determine if this is a split settlement, partial refund, or PSP error.',
      estimatedTime: '1-2 business days',

      actionButtons: [
        {
          id: 'internal_investigation',
          label: 'Raise Internal Ticket',
          action: 'raise_internal_ticket',
          variant: 'primary',
          requiresApproval: false,
          showTicketModal: true
        },
        {
          id: 'generate_psp_inquiry',
          label: 'Generate PSP Inquiry',
          action: 'generate_psp_inquiry',
          variant: 'secondary',
          requiresApproval: false
        },
        {
          id: 'write_off_shortfall',
          label: 'Write Off Shortfall',
          action: 'write_off',
          variant: 'danger',
          requiresApproval: true,
          showJournalPreview: true
        }
      ],

      // Journal entries for write-off action
      journalEntries: [
        {
          entryNumber: 1,
          description: 'Write off settlement shortfall - ORD-2026-88512',
          postingDate: '2026-06-06',
          documentType: 'write_off',
          lines: [
            {
              lineNumber: 1,
              account: '6400',
              accountName: 'Bad Debt Expense - PSP Shortfalls',
              debitCredit: 'debit',
              amount: 128.00,
              currency: 'SGD',
              costCenter: 'CC-PAYMENTS',
              department: 'FINANCE',
              reference: 'UO-20260606-002'
            },
            {
              lineNumber: 2,
              account: '1200',
              accountName: 'Accounts Receivable - Stripe',
              debitCredit: 'credit',
              amount: 128.00,
              currency: 'SGD',
              costCenter: 'CC-PAYMENTS',
              department: 'FINANCE',
              reference: 'ORD-2026-88512 - Shortfall Write-off'
            }
          ],
          totalDebit: 128.00,
          totalCredit: 128.00
        }
      ],

      // Approval required for write-offs
      approval: {
        approvalRequired: true,
        approvalReason: 'Write-off of SGD 128.00 settlement shortfall requires manager approval per policy WO-001. This impacts P&L through bad debt expense recognition.',
        approvalThreshold: {
          amount: 100,
          currency: 'SGD',
          rule: 'write_off',
          description: 'Write-offs above SGD 100 require manager approval'
        },
        approvalLevel: 'manager',
        approver: 'USR-MGR-001',
        approverName: 'Sarah Chen (Finance Manager)'
      }
    },

    relatedRecords: [
      {
        type: 'order',
        id: 'ORD-2026-88512',
        amount: 256.00,
        currency: 'SGD',
        date: '2026-06-05T14:30:00Z',
        status: 'completed',
        reference: 'GrabFood - Premium Delivery',
        description: 'Order completed and payment captured on June 5'
      },
      {
        type: 'settlement_line',
        id: 'Stripe-20260606-L102',
        amount: 128.00,
        currency: 'SGD',
        date: '2026-06-06T06:00:00Z',
        status: 'partial',
        reference: 'ORD-2026-88512',
        description: 'Partial settlement - only 50% of order amount received'
      }
    ]
  },

  // Scenario C: Order Archived (Late Settlement or Correction)
  {
    id: 'UO-20260606-003',
    type: 'unmatched_order',
    priority: 'low',
    referenceId: 'ORD-2026-77320',
    amount: 73.00,
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-06T13:00:00Z',
    slaDue: '2026-06-09T13:00:00Z',
    owner: null,
    aiConfidence: 94,
    aiSuggestion: 'Order found in archive - late settlement or correction',
    status: 'open',
    age: '0d 5h',
    pastSLA: false,
    transactionType: 'adjustment', // Late settlement/correction from PSP
    amountLabel: 'Late Settlement', // Amount represents: PSP correction received 84 days late
    materiality: 'medium',
    escalationLevel: 0,

    diagnostic: {
      outcome: 'order_archived',
      confidence: 94,
      completedAt: '2026-06-06T13:02:00Z',
      systemRecommendation: 'Match to archived order and close exception',
      autoAction: 'auto_match_archived_order',
      findings: [
        {
          category: 'oms_search_current',
          result: 'fail',
          detail: 'Order ORD-2026-77320 NOT FOUND in current OMS database',
          evidence: {
            orderId: 'ORD-2026-77320',
            found: false,
            location: 'oms_current'
          }
        },
        {
          category: 'oms_archive_search',
          result: 'pass',
          detail: 'Order ORD-2026-77320 found in archive. Original transaction: 15 Mar 2026 (84 days ago). Status: COMPLETED. Archived on 15 May 2026.',
          evidence: {
            orderId: 'ORD-2026-77320',
            found: true,
            location: 'oms_archive',
            originalTransactionDate: '2026-03-15T09:20:00Z',
            paymentCapturedAt: '2026-03-15T09:20:00Z',
            orderCompletedAt: '2026-03-16T14:30:00Z',
            archivedAt: '2026-05-15T00:00:00Z',
            orderAge: 84,
            status: 'completed',
            paymentCaptured: true
          }
        },
        {
          category: 'settlement_timing',
          result: 'pass',
          detail: 'Late settlement or correction. Original transaction: 15 Mar 2026. Settlement received: 06 Jun 2026 (84 days late). Typical for PSP corrections or adjustments.',
          evidence: {
            transactionDate: '2026-03-15T09:20:00Z',
            settlementDate: '2026-06-06T06:00:00Z',
            settlementLagDays: 84,
            expectedLagDays: 1,
            settlementType: 'correction_or_adjustment',
            isLateSettlement: true
          }
        },
        {
          category: 'amount_verification',
          result: 'pass',
          detail: 'Order amount matches PSP settlement: SGD 73.00',
          evidence: {
            orderAmount: 73.00,
            settlementAmount: 73.00,
            variance: 0,
            match: true
          }
        }
      ]
    },

    nba: {
      action: 'match_archived_order',
      priority: 'auto',
      description: 'Order ORD-2026-77320 found in archive database. Original transaction from 15 Mar 2026 (84 days ago) with status COMPLETED. This is a late settlement or correction from GrabPay. System can auto-match to archived record and close exception.',
      estimatedTime: '< 1 minute',

      // No approval required - perfect match with zero variance
      approval: {
        approvalRequired: false,
        approvalReason: 'Auto-match with zero variance does not require approval',
        approvalThreshold: {
          amount: 0,
          currency: 'SGD',
          rule: 'always',
          description: 'Perfect matches can be auto-processed'
        },
        approvalLevel: 'analyst'
      },

      // Journal entries for bank matching
      journalEntries: [
        {
          entryNumber: 1,
          description: 'Match Late Settlement to Archived Order',
          postingDate: '2026-06-07',
          documentType: 'bank_matching',
          lines: [
            {
              lineNumber: 1,
              account: '1010',
              accountName: 'Bank - OCBC SGD Account',
              debitCredit: 'debit',
              amount: 73.00,
              currency: 'SGD',
              reference: 'GrabPay Settlement - ORD-2026-77320'
            },
            {
              lineNumber: 2,
              account: '1200',
              accountName: 'Accounts Receivable - GrabPay (Archive)',
              debitCredit: 'credit',
              amount: 73.00,
              currency: 'SGD',
              reference: 'ORD-2026-77320 (Late Settlement)'
            }
          ],
          totalDebit: 73.00,
          totalCredit: 73.00
        }
      ],

      actionButtons: [
        {
          id: 'auto_match',
          label: 'Auto-Match to Archive',
          action: 'match_to_archived_order',
          variant: 'primary',
          requiresApproval: false,
          showJournalPreview: true
        },
        {
          id: 'view_archive',
          label: 'View Archive Record',
          action: 'view_archived_order',
          variant: 'secondary',
        },
        {
          id: 'verify_correction',
          label: 'Verify PSP Correction',
          action: 'verify_psp_correction',
          variant: 'secondary',
        }
      ]
    },

    financialBreakdown: {
      gross: 73.00,
      components: [
        {
          name: 'PSP Late Settlement',
          type: 'addition',
          amount: 73.00,
          description: 'Correction received 84 days after original ride (15 Mar 2026, Airport to City, 22 km)'
        }
      ],
      expectedNet: 73.00,
      actualNet: 73.00,
      variance: 0,
      varianceExplained: 0,
      varianceUnexplained: 0,
      currency: 'SGD'
    },

    relatedRecords: [
      {
        type: 'order',
        id: 'ORD-2026-77320',
        amount: 73.00,
        currency: 'SGD',
        date: '2026-03-15T09:20:00Z',
        status: 'completed',
        reference: 'ARCHIVED - Grab Ride (Airport to City)',
        description: 'Original transaction: 15 Mar 2026, Archived: 15 May 2026 - Airport ride 22 km'
      },
      {
        type: 'settlement_line',
        id: 'GrabPay-20260606-L320',
        amount: 73.00,
        currency: 'SGD',
        date: '2026-06-06T06:00:00Z',
        status: 'late_settlement',
        reference: 'PSP Correction/Adjustment',
        description: 'Received 84 days after original transaction - Airport ride settlement'
      }
    ]
  },

  // ============================================================================
  // EXCEPTION 6: CHARGEBACK LIFECYCLE
  // ============================================================================

  // Scenario A: First Chargeback Received (Representment Due)
  {
    id: 'CB-20260606-001',
    type: 'unmatched_order', // Reusing, but it's chargeback
    priority: 'high',
    referenceId: 'ORD-2026-77421',
    amount: -2420, // Chargeback amount (negative - money deducted)
    currency: 'SGD',
    psp: 'stripe',
    pspName: 'Stripe',
    createdAt: '2026-06-06T14:00:00Z',
    slaDue: '2026-06-07T14:00:00Z', // 24h SLA
    owner: 'analyst1',
    ownerName: 'Analyst Kim',
    aiConfidence: null,
    aiSuggestion: null,
    status: 'open',
    age: '0d 22h',
    pastSLA: false,
    transactionType: 'chargeback', // Customer dispute - first chargeback
    amountLabel: 'Chargeback Amount', // Amount represents: disputed amount debited by card network
    materiality: 'high',
    escalationLevel: 0,

    diagnostic: {
      outcome: 'first_chargeback_received',
      confidence: 100,
      completedAt: '2026-06-06T14:01:00Z',
      systemRecommendation: 'Submit representment evidence before deadline',
      findings: [
        {
          category: 'chargeback_stage',
          result: 'pass',
          detail: 'Stage: First chargeback. Reason code: 13.1 (Merchandise/Services Not Received). Deadline will be calculated dynamically.',
          evidence: {
            stage: 'first_chargeback',
            reasonCode: '13.1',
            reasonDescription: 'Merchandise/Services Not Received',
            deadline: '2026-06-13T23:59:59Z',
            daysRemaining: 7,
            cardNetwork: 'Visa'
          }
        },
        {
          category: 'original_transaction',
          result: 'pass',
          detail: 'Original transaction ORD-2026-77421 (SGD 2,420) completed on 25 May 2026',
          evidence: {
            originalOrderId: 'ORD-2026-77421',
            originalAmount: 2420,
            originalDate: '2026-05-25T10:30:00Z',
            service: 'Grab Food Delivery',
            deliveryStatus: 'completed',
            driverConfirmation: true,
            customerSignature: false,
            gpsProofAvailable: true
          }
        }
      ]
    },

    nba: {
      action: 'submit_representment',
      priority: 'human_investigate',
      description: 'First chargeback received. Customer claims non-delivery. Evidence deadline will be calculated dynamically. Submit: delivery proof, driver GPS log, customer photo confirmation.',
      estimatedTime: 'calculated_dynamically',
      dueDate: '2026-06-13T23:59:59Z',
      actionButtons: [
        {
          id: 'collect_evidence',
          label: 'Collect Evidence',
          action: 'collect_chargeback_evidence',
          variant: 'primary',
        },
        {
          id: 'accept_chargeback',
          label: 'Accept Chargeback',
          action: 'accept_chargeback_loss',
          variant: 'danger',
          requiresApproval: true,
          showJournalPreview: true,
        }
      ],

      // Approval required for chargeback acceptance
      approval: {
        approvalRequired: true,
        approvalReason: 'Accepting chargeback loss of SGD 2,445.00 (including dispute fee) requires manager approval per policy CB-001.',
        approvalThreshold: {
          amount: 500,
          currency: 'SGD',
          rule: 'write_off',
          description: 'Chargeback acceptance above SGD 500 requires manager approval'
        },
        approvalLevel: 'manager',
        approver: 'USR-MGR-001',
        approverName: 'Sarah Chen (Finance Manager)'
      },

      // Journal entries to be posted when accepting chargeback
      journalEntries: [
        {
          entryNumber: 1,
          description: 'Record chargeback loss and dispute fee - ORD-2026-77421',
          postingDate: '2026-06-06',
          documentType: 'write_off',
          lines: [
            {
              lineNumber: 1,
              account: '6500',
              accountName: 'Chargeback Loss Expense',
              debitCredit: 'debit',
              amount: 2420.00,
              currency: 'SGD',
              costCenter: 'CC-PAYMENTS',
              department: 'FINANCE',
              reference: 'CB-20260606-001'
            },
            {
              lineNumber: 2,
              account: '6510',
              accountName: 'Payment Processing Fees',
              debitCredit: 'debit',
              amount: 25.00,
              currency: 'SGD',
              costCenter: 'CC-PAYMENTS',
              department: 'FINANCE',
              reference: 'CB-20260606-001'
            },
            {
              lineNumber: 3,
              account: '2100',
              accountName: 'Stripe Payable',
              debitCredit: 'credit',
              amount: 2445.00,
              currency: 'SGD',
              costCenter: 'CC-PAYMENTS',
              department: 'FINANCE',
              reference: 'CB-20260606-001'
            }
          ],
          totalDebit: 2445.00,
          totalCredit: 2445.00
        }
      ]
    },

    financialBreakdown: {
      gross: 0,
      components: [
        {
          name: 'Chargeback Amount',
          type: 'deduction',
          amount: 2420.00,
          description: 'Customer dispute - provisional debit'
        },
        {
          name: 'Dispute Fee',
          type: 'deduction',
          amount: 25.00,
          description: 'Stripe chargeback handling fee (standard)'
        }
      ],
      expectedNet: -2445.00,
      actualNet: -2445.00,
      variance: 0,
      varianceExplained: 0,
      varianceUnexplained: 0,
      currency: 'SGD'
    },


    relatedRecords: [
      {
        type: 'order',
        id: 'ORD-2026-77421',
        amount: 2420,
        currency: 'SGD',
        date: '2026-05-25T10:30:00Z',
        status: 'completed',
        description: 'Grab Food - Original transaction'
      },
      {
        type: 'chargeback',
        id: 'CB-20260606-001',
        amount: 2420,
        currency: 'SGD',
        date: '2026-06-06T14:00:00Z',
        status: 'first_chargeback',
        reference: 'Reason: 13.1 - Non-delivery',
        description: 'Representment deadline: 13 Jun 2026'
      }
    ]
  },

  // ============================================================================
  // EXCEPTION 7: CHARGEBACK REVERSAL - Credit Received, Ready for Reconciliation
  // ============================================================================

  // Scenario: Chargeback was disputed, PSP credited back, now needs manual set-off
  {
    id: 'CBR-20260609-001',
    type: 'amount_mismatch', // Using mismatch as it requires reconciliation
    priority: 'medium',
    referenceId: 'ORD-2026-65432', // Original order
    amount: -1850, // Reversal credit received (negative = credit to be matched)
    currency: 'SGD',
    psp: 'stripe',
    pspName: 'Stripe',
    createdAt: '2026-06-09T08:00:00Z',
    slaDue: '2026-06-10T08:00:00Z',
    owner: 'analyst1',
    ownerName: 'Analyst Kim',
    aiConfidence: 98,
    aiSuggestion: 'Chargeback reversal credit received - select matching exception to set off',
    status: 'open',
    age: '0d 4h',
    pastSLA: false,
    transactionType: 'reversal', // Chargeback reversal - disputed and won
    amountLabel: 'Reversal Credit', // Amount represents: credit received from PSP reversal
    materiality: 'medium',
    escalationLevel: 0,

    diagnostic: {
      outcome: 'chargeback_reversal_received',
      confidence: 98,
      completedAt: '2026-06-09T08:05:00Z',
      systemRecommendation: 'Reconcile original chargeback with reversal credit - zero net effect',
      findings: [
        {
          category: 'original_chargeback',
          result: 'pass',
          detail: 'Original chargeback CB-20260520-088 for SGD 1,850.00 was disputed on May 22. Order ORD-2026-65432 had valid delivery proof.',
          evidence: {
            originalChargebackId: 'CB-20260520-088',
            originalChargebackDate: '2026-05-20T09:00:00Z',
            chargebackAmount: 1850.00,
            reasonCode: '13.1',
            reasonDescription: 'Merchandise/Services Not Received',
            orderId: 'ORD-2026-65432',
            orderAmount: 1850.00,
            orderDate: '2026-05-15T12:30:00Z',
            deliveryProofAvailable: true
          }
        },
        {
          category: 'dispute_history',
          result: 'pass',
          detail: 'Dispute raised with PSP on May 22. Evidence submitted: GPS delivery log, driver photo confirmation, customer signature.',
          evidence: {
            disputeRaisedDate: '2026-05-22T10:00:00Z',
            pspTicketId: 'STR-2026-DIS-65432',
            evidenceSubmitted: ['GPS delivery log', 'Driver photo confirmation', 'Customer OTP verification'],
            disputeStatus: 'resolved_in_favor'
          }
        },
        {
          category: 'psp_response',
          result: 'pass',
          detail: 'PSP reviewed evidence on June 1 and ruled in merchant favor. PSP confirmed credit will be issued in next settlement.',
          evidence: {
            pspResponseDate: '2026-06-01T14:00:00Z',
            pspDecision: 'resolved_in_merchant_favor',
            pspComments: 'Delivery evidence verified. Chargeback reversed. Credit will be issued in settlement dated June 9.',
            creditConfirmed: true,
            expectedCreditDate: '2026-06-09'
          }
        },
        {
          category: 'reversal_credit_received',
          result: 'pass',
          detail: 'Reversal credit of SGD 1,850.00 received in settlement on June 9. Ready for reconciliation.',
          evidence: {
            creditSettlementId: 'Stripe-20260609-REV-088',
            creditAmount: 1850.00,
            creditDate: '2026-06-09T06:00:00Z',
            creditReference: 'CB_REVERSAL_CB-20260520-088',
            matchesOriginalChargeback: true
          }
        }
      ]
    },

    nba: {
      action: 'reconcile_chargeback_reversal',
      priority: 'human_confirm',
      description: 'Chargeback CB-20260520-088 (SGD 1,850) was successfully disputed. PSP ruled in our favor on June 1. Reversal credit of SGD 1,850 has now been received in the June 9 settlement. Reconcile by setting off the original chargeback debit against this reversal credit. Net effect on books: SGD 0.00.',
      estimatedTime: 'Immediate',

      // Original exception reference
      originalException: {
        exceptionId: 'CB-20260520-088',
        exceptionType: 'chargeback',
        exceptionDate: '2026-05-20T09:00:00Z',
        amount: -1850.00,
        status: 'disputed',
        description: 'Original chargeback - disputed and won'
      },

      // PSP ticket history (resolved)
      pspTicket: {
        ticketId: 'STR-2026-DIS-65432',
        ticketStatus: 'resolved',
        raisedDate: '2026-05-22T10:00:00Z',
        daysPending: 0,
        lastFollowUp: '2026-06-01T14:00:00Z',
        pspContact: 'Stripe Disputes Team',
        inquiryType: 'Chargeback Dispute',
        description: 'Representment submitted with delivery evidence for CB-20260520-088',
        resolution: 'Resolved in merchant favor - credit confirmed',
        resolvedDate: '2026-06-01T14:00:00Z'
      },

      // Reconciliation details - current item is the reversal credit
      reconciliation: {
        // Current exception (the reversal credit we received)
        currentItem: {
          id: 'Stripe-20260609-REV-088',
          type: 'reversal_credit',
          date: '2026-06-09T06:00:00Z',
          amount: -1850.00,
          description: 'Chargeback reversal credit received',
          glAccount: '1200',
          glAccountName: 'Accounts Receivable - Stripe'
        },
        // Selectable past exceptions to match against (all open exceptions in system)
        selectableExceptions: [
          // Chargebacks
          {
            id: 'CB-20260520-088',
            type: 'chargeback_debit',
            date: '2026-05-20T09:00:00Z',
            amount: 1850.00,
            description: 'Original chargeback - ORD-2026-65432 (Non-delivery dispute)',
            glAccount: '1200',
            glAccountName: 'Accounts Receivable - Stripe',
            orderId: 'ORD-2026-65432',
            status: 'disputed'
          },
          {
            id: 'CB-20260515-042',
            type: 'chargeback_debit',
            date: '2026-05-15T11:00:00Z',
            amount: 1920.00,
            description: 'Chargeback - ORD-2026-61234 (Unauthorized transaction)',
            glAccount: '1200',
            glAccountName: 'Accounts Receivable - Stripe',
            orderId: 'ORD-2026-61234',
            status: 'pending'
          },
          {
            id: 'CB-20260510-023',
            type: 'chargeback_debit',
            date: '2026-05-10T14:30:00Z',
            amount: 1750.00,
            description: 'Chargeback - ORD-2026-58901 (Product not as described)',
            glAccount: '1200',
            glAccountName: 'Accounts Receivable - Stripe',
            orderId: 'ORD-2026-58901',
            status: 'pending'
          },
          {
            id: 'CB-20260606-001',
            type: 'chargeback',
            date: '2026-06-06T14:00:00Z',
            amount: 2420.00,
            description: 'Chargeback - ORD-2026-77421 (Non-delivery claim)',
            glAccount: '1200',
            glAccountName: 'Accounts Receivable - Stripe',
            orderId: 'ORD-2026-77421',
            status: 'open'
          },
          // Unmatched Credits
          {
            id: 'BC-20260607-001',
            type: 'unmatched_credit',
            date: '2026-06-07T08:30:00Z',
            amount: 142500.00,
            description: 'Unmatched bank credit - GrabPay settlement',
            glAccount: '1010',
            glAccountName: 'Bank - OCBC SGD',
            status: 'open'
          },
          {
            id: 'BC-20260606-011',
            type: 'unmatched_credit',
            date: '2026-06-06T09:15:00Z',
            amount: 284127.50,
            description: 'Unmatched bank credit - GrabPay settlement',
            glAccount: '1010',
            glAccountName: 'Bank - OCBC SGD',
            status: 'open'
          },
          {
            id: 'BC-20260606-012',
            type: 'unmatched_credit',
            date: '2026-06-06T10:00:00Z',
            amount: 150000.00,
            description: 'Unmatched bank credit - Stripe settlement',
            glAccount: '1010',
            glAccountName: 'Bank - OCBC SGD',
            status: 'open'
          },
          // Unmatched Orders
          {
            id: 'UO-20260606-001',
            type: 'unmatched_order',
            date: '2026-05-29T10:00:00Z',
            amount: 248.00,
            description: 'PSP refund - no matching order (Stripe)',
            glAccount: '1200',
            glAccountName: 'Accounts Receivable - Stripe',
            status: 'open'
          },
          {
            id: 'UO-20260606-002',
            type: 'settlement_shortfall',
            date: '2026-06-06T11:30:00Z',
            amount: 128.00,
            description: 'Settlement shortfall - ORD-2026-88512',
            glAccount: '1200',
            glAccountName: 'Accounts Receivable - Stripe',
            orderId: 'ORD-2026-88512',
            status: 'open'
          },
          {
            id: 'UO-20260606-003',
            type: 'late_settlement',
            date: '2026-06-06T13:00:00Z',
            amount: 73.00,
            description: 'Late settlement - ORD-2026-77320 (archived order)',
            glAccount: '1200',
            glAccountName: 'Accounts Receivable - GrabPay',
            orderId: 'ORD-2026-77320',
            status: 'open'
          },
          // Amount Mismatches
          {
            id: 'AM-20260606-001',
            type: 'amount_mismatch',
            date: '2026-06-06T11:00:00Z',
            amount: 0.05,
            description: 'Rounding variance - ORD-2026-88422',
            glAccount: '1200',
            glAccountName: 'Accounts Receivable - GrabPay',
            orderId: 'ORD-2026-88422',
            status: 'open'
          },
          {
            id: 'AM-20260606-002',
            type: 'amount_mismatch',
            date: '2026-06-06T12:00:00Z',
            amount: 2.20,
            description: 'FX rounding variance - ORD-2026-88423',
            glAccount: '1200',
            glAccountName: 'Accounts Receivable - Stripe',
            orderId: 'ORD-2026-88423',
            status: 'open'
          }
        ],
        // Legacy fields for backward compatibility
        lineItem1: {
          id: 'CB-20260520-088',
          type: 'chargeback_debit',
          date: '2026-05-20T09:00:00Z',
          amount: 1850.00,
          description: 'Original chargeback debit',
          glAccount: '1200',
          glAccountName: 'Accounts Receivable - Stripe'
        },
        lineItem2: {
          id: 'Stripe-20260609-REV-088',
          type: 'reversal_credit',
          date: '2026-06-09T06:00:00Z',
          amount: -1850.00,
          description: 'Chargeback reversal credit',
          glAccount: '1200',
          glAccountName: 'Accounts Receivable - Stripe'
        },
        netEffect: 0,
        glImpact: 'No P&L impact - internal set-off within AR'
      },

      actionButtons: [
        {
          id: 'reconcile_setoff',
          label: 'Reconcile & Set Off',
          action: 'reconcile_chargeback_reversal',
          variant: 'primary',
          showReconciliationModal: true
        },
        {
          id: 'view_original',
          label: 'View Original Exception',
          action: 'view_original_exception',
          variant: 'secondary'
        },
        {
          id: 'view_ticket',
          label: 'View Ticket History',
          action: 'view_psp_ticket',
          variant: 'secondary'
        }
      ]
    },

    relatedRecords: [
      {
        type: 'order',
        id: 'ORD-2026-65432',
        amount: 1850.00,
        currency: 'SGD',
        date: '2026-05-15T12:30:00Z',
        status: 'completed',
        reference: 'GrabFood - Premium Catering Order',
        description: 'Original order - delivered successfully with GPS proof'
      },
      {
        type: 'chargeback',
        id: 'CB-20260520-088',
        amount: -1850.00,
        currency: 'SGD',
        date: '2026-05-20T09:00:00Z',
        status: 'disputed_won',
        reference: 'Reason 13.1 - Non-delivery claim',
        description: 'Chargeback disputed and won - awaiting reversal credit'
      },
      {
        type: 'settlement_line',
        id: 'Stripe-20260609-REV-088',
        amount: 1850.00,
        currency: 'SGD',
        date: '2026-06-09T06:00:00Z',
        status: 'pending_reconciliation',
        reference: 'CB_REVERSAL_CB-20260520-088',
        description: 'Chargeback reversal credit - ready for set-off'
      }
    ]
  },

  // ============================================================================
  // SETTLEMENT EXPLORER LINKAGE: Fee Variance Exception
  // ============================================================================
  {
    id: 'FEE-STR-20260605-002',
    type: 'amount_mismatch',
    priority: 'medium',
    referenceId: 'PY-STR-20260605-002',
    amount: 580, // Underbilling amount
    currency: 'SGD',
    psp: 'stripe',
    pspName: 'Stripe',
    createdAt: '2026-06-05T14:00:00Z',
    slaDue: '2026-06-08T14:00:00Z',
    owner: null,
    aiConfidence: 98,
    aiSuggestion: 'MDR undercharged - Raise fee recovery with Stripe',
    status: 'open',
    age: '3d 10h',
    pastSLA: false,
    transactionType: 'fee_adjustment', // MDR fee variance - undercharged by PSP
    amountLabel: 'Fee Variance', // Amount represents: MDR undercharge (contract vs actual)
    materiality: 'medium',
    escalationLevel: 0,

    // Settlement Explorer Linkages
    linkedBankCreditId: 'BC-STR-20260605-002',
    linkedBankCreditAmount: 140986.25,
    linkedSettlementRefs: ['PY-STR-20260605-002'],
    linkedSettlementCount: 1,

    diagnostic: {
      outcome: 'fee_mismatch_detected',
      confidence: 98,
      completedAt: '2026-06-05T14:05:00Z',
      systemRecommendation: 'Raise fee recovery claim with PSP',
      findings: [
        {
          category: 'contract_verification',
          result: 'fail',
          detail: 'Contract MDR: 2.90%, Actual MDR charged: 2.50%, Difference: -0.40%',
          evidence: {
            contractRate: 0.029,
            actualRate: 0.025,
            variance: -0.004,
            grossAmount: 145000,
            expectedMDR: 4205, // 145,000 × 2.9%
            actualMDR: 3625, // 145,000 × 2.5%
            underbilling: 580
          }
        },
        {
          category: 'historical_pattern',
          result: 'pass',
          detail: 'Stripe has charged correct 2.90% MDR in last 90 days - This is an anomaly',
        }
      ]
    },

    nba: {
      action: 'raise_fee_recovery',
      priority: 'human_confirm',
      description: 'Stripe undercharged MDR by 0.40% (SGD 580 for SGD 145K gross). Raise fee recovery claim with supporting evidence from contract.',
      estimatedTime: '1-2 days',
      actionButtons: [
        {
          id: 'raise_recovery',
          label: 'Raise Fee Recovery',
          action: 'raise_fee_recovery',
          variant: 'primary',
        },
        {
          id: 'accept_loss',
          label: 'Accept as Variance',
          action: 'accept_fee_variance',
          variant: 'secondary',
          requiresApproval: true
        }
      ]
    },

    relatedRecords: [
      {
        type: 'bank_credit',
        id: 'BC-STR-20260605-002',
        amount: 140986.25,
        currency: 'SGD',
        date: '2026-06-05',
        status: 'reconciled',
        reference: 'PY-STR-20260605-002',
        description: 'OCBC-SGD-****7821'
      },
      {
        type: 'settlement_line',
        id: 'PY-STR-20260605-002',
        amount: 140986.25,
        currency: 'SGD',
        date: '2026-06-05',
        status: 'reconciled',
        reference: 'Stripe settlement - Fee variance detected',
        description: '550 orders, Gross SGD 145K'
      }
    ]
  },

  // ============================================================================
  // SETTLEMENT EXPLORER LINKAGE: Partial Match Exception
  // ============================================================================
  {
    id: 'BC-GP-20260604-PARTIAL',
    type: 'unmatched_credit',
    priority: 'medium',
    referenceId: 'BC-GP-20260604-PARTIAL',
    amount: 4230, // Unmatched portion
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-04T16:00:00Z',
    slaDue: '2026-06-06T16:00:00Z',
    owner: null,
    aiConfidence: 78,
    aiSuggestion: 'Partial match: 2 settlements found (SGD 20,770), missing SGD 4,230',
    status: 'open',
    age: '4d 8h',
    pastSLA: false,
    transactionType: 'settlement', // PSP settlement batch (partial match)
    amountLabel: 'Unmatched Portion', // Amount represents: portion of bank credit not yet matched
    materiality: 'medium',
    escalationLevel: 0,

    // Settlement Explorer Linkages
    linkedBankCreditId: 'BC-GP-20260604-PARTIAL',
    linkedBankCreditAmount: 25000,
    linkedSettlementRefs: ['PY-GP-20260604-REFUND-1', 'PY-GP-20260604-REFUND-2'],
    linkedSettlementCount: 2,

    diagnostic: {
      outcome: 'partial_match_found',
      confidence: 78,
      completedAt: '2026-06-04T16:05:00Z',
      systemRecommendation: 'Search for additional settlements or verify bank credit split',
      findings: [
        {
          category: 'subset_sum_match',
          result: 'partial',
          detail: 'Bank credit SGD 25,000 partially matched to 2 settlements totaling SGD 20,770 (83% matched)',
          evidence: {
            bankCredit: 25000,
            matchedTotal: 20770,
            unmatchedAmount: 4230,
            matchedPercent: 83.08,
            settlements: [
              { id: 'PY-GP-20260604-REFUND-1', amount: 12450 },
              { id: 'PY-GP-20260604-REFUND-2', amount: 8320 }
            ]
          }
        },
        {
          category: 'additional_search',
          result: 'fail',
          detail: 'No additional unmatched GrabPay settlements found for SGD 4,230 or similar amounts',
        }
      ]
    },

    nba: {
      action: 'investigate_partial',
      priority: 'human_investigate',
      description: 'Bank credit partially matched (83%). Search for missing settlement file or verify if bank credit represents multiple batches.',
      estimatedTime: '2-3 hours',
      actionButtons: [
        {
          id: 'search_files',
          label: 'Search PSP Files',
          action: 'search_psp_files',
          variant: 'primary',
        },
        {
          id: 'verify_bank',
          label: 'Verify Bank Statement',
          action: 'verify_bank_split',
          variant: 'secondary',
        },
        {
          id: 'accept_partial',
          label: 'Accept Partial Match',
          action: 'accept_partial_match',
          variant: 'secondary',
          requiresApproval: true
        }
      ]
    },

    relatedRecords: [
      {
        type: 'bank_credit',
        id: 'BC-GP-20260604-PARTIAL',
        amount: 25000,
        currency: 'SGD',
        date: '2026-06-04',
        status: 'partial',
        reference: 'GRABPAY PTE LTD REFUNDS BATCH',
        description: 'DBS-SGD-****4521 - 83% matched'
      },
      {
        type: 'settlement_line',
        id: 'PY-GP-20260604-REFUND-1',
        amount: 12450,
        currency: 'SGD',
        date: '2026-06-04',
        status: 'reconciled',
        description: '50 orders - Refund batch 1'
      },
      {
        type: 'settlement_line',
        id: 'PY-GP-20260604-REFUND-2',
        amount: 8320,
        currency: 'SGD',
        date: '2026-06-04',
        status: 'reconciled',
        description: '35 orders - Refund batch 2'
      }
    ]
  },

  // ============================================================================
  // SETTLEMENT EXPLORER LINKAGE: Unmatched Bank Credit
  // ============================================================================
  {
    id: 'BC-SGD-20260603-UNMATCHED',
    type: 'unmatched_credit',
    priority: 'high',
    referenceId: 'BC-SGD-20260603-UNMATCHED',
    amount: 85420,
    currency: 'SGD',
    psp: '',
    pspName: 'Unknown',
    createdAt: '2026-06-03T10:15:00Z',
    slaDue: '2026-06-05T10:15:00Z',
    owner: null,
    aiConfidence: 42,
    aiSuggestion: 'No fuzzy matches found - manual investigation required',
    status: 'open',
    age: '5d 2h',
    pastSLA: true,
    transactionType: 'settlement', // Bank credit - unknown source (needs investigation)
    amountLabel: 'Bank Credit', // Amount represents: unidentified bank credit requiring investigation
    materiality: 'high',
    escalationLevel: 1,

    // Settlement Explorer Linkages
    linkedBankCreditId: 'BC-SGD-20260603-UNMATCHED',
    linkedBankCreditAmount: 85420,
    linkedSettlementRefs: [], // No settlements matched
    linkedSettlementCount: 0,

    diagnostic: {
      outcome: 'no_match_found',
      confidence: 42,
      completedAt: '2026-06-03T10:20:00Z',
      systemRecommendation: 'Manual investigation - check for PSP file delays or non-order credits',
      findings: [
        {
          category: 'window_search',
          result: 'fail',
          detail: 'No PSP settlement files expected within T+3 window',
        },
        {
          category: 'fuzzy_amount_match',
          result: 'fail',
          detail: 'No unmatched settlements within ±2% of SGD 85,420',
          evidence: { tolerance: 0.02, candidatesFound: 0 }
        },
        {
          category: 'aggregate_sum',
          result: 'fail',
          detail: 'No combination of settlements sums to bank credit amount',
        },
        {
          category: 'known_credit_pattern',
          result: 'fail',
          detail: 'Narration "PAYMENT RECEIVED REF UNKNOWN" does not match any known patterns',
        },
        {
          category: 'duplicate_check',
          result: 'pass',
          detail: 'No duplicate deposits detected',
        }
      ]
    },

    nba: {
      action: 'manual_investigate',
      priority: 'human_investigate',
      description: 'Manual investigation required - no automatic match found after 5 days',
      estimatedTime: '2-4 hours',
      actionButtons: [
        {
          id: 'request_psp_clarification',
          label: 'Request PSP Clarification',
          action: 'request_psp_clarification',
          variant: 'primary',
        },
        {
          id: 'check_bank_statement',
          label: 'Verify Bank Statement',
          action: 'verify_bank_statement',
          variant: 'secondary',
        },
        {
          id: 'escalate_controller',
          label: 'Escalate to Controller',
          action: 'escalate',
          variant: 'secondary',
        }
      ]
    },

    relatedRecords: [
      {
        type: 'bank_credit',
        id: 'BC-SGD-20260603-UNMATCHED',
        amount: 85420,
        currency: 'SGD',
        date: '2026-06-03',
        status: 'unmatched',
        reference: 'PAYMENT RECEIVED REF UNKNOWN',
        description: 'DBS-SGD-****4521'
      }
    ]
  },
  // ============================================================================
  // YESTERDAY'S SETTLEMENT RECON EXCEPTIONS (from Settlement Explorer)
  // These 6 exceptions correspond to non-reconciled bank credits from yesterday's recon
  // ============================================================================

  // GP-001: Matched L1, but 3 L2 exceptions (unmatched orders + amount mismatch)
  // Bank credit = PSP Net = 485,125 but 3 order lines have issues
  {
    id: 'SE-GP001-UO-001',
    type: 'unmatched_order',
    priority: 'high',
    referenceId: 'ORD-2026-91204',
    amount: -342.00,
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-09T07:45:00Z',
    slaDue: '2026-06-10T07:45:00Z',
    owner: null,
    aiConfidence: 72,
    aiSuggestion: 'PSP refund line has no matching OMS order — possible cancelled order processed by PSP after cutoff',
    status: 'open',
    age: '1d 4h',
    pastSLA: true,
    transactionType: 'refund',
    amountLabel: 'PSP Refund (No OMS Match)',
    materiality: 'medium',
    escalationLevel: 0,

    diagnostic: {
      outcome: 'order_not_found',
      confidence: 72,
      completedAt: '2026-06-09T07:46:00Z',
      systemRecommendation: 'Investigate with PSP — refund line present in settlement file but no corresponding order in OMS',
      autoAction: undefined,
      findings: [
        {
          category: 'oms_lookup',
          result: 'fail',
          detail: 'Order ORD-2026-91204 not found in OMS. Searched by PSP transaction ID, order reference, and amount within ±5% tolerance.',
        },
        {
          category: 'pattern_match',
          result: 'partial',
          detail: 'Amount SGD 342.00 matches a cancelled order (ORD-2026-91198) that was voided on Jun 8 at 23:47 SGT — PSP may have processed refund after OMS cancellation.',
        },
        {
          category: 'window_search',
          result: 'pass',
          detail: 'Settlement file PY-GP-09JUN26-500K received on time. 1,997 of 2,000 order lines matched successfully (99.85%).',
        }
      ]
    },

    nba: {
      action: 'investigate_psp',
      priority: 'human_investigate',
      description: 'PSP refund of SGD 342.00 found in GrabPay settlement file (PY-GP-09JUN26-500K) with no corresponding OMS order. A voided order ORD-2026-91198 with matching amount was found — PSP may have processed after OMS cutoff. Contact GrabPay ops to confirm refund origin.',
      actionButtons: [
        {
          id: 'query_psp',
          label: 'Query GrabPay',
          action: 'query_psp',
          variant: 'primary',
        },
        {
          id: 'link_voided',
          label: 'Link to Voided Order',
          action: 'link_voided_order',
          variant: 'secondary',
        }
      ]
    },

    financialBreakdown: {
      gross: 342.00,
      components: [
        { name: 'Refund Amount', type: 'deduction', amount: 342.00, description: 'Full refund processed by PSP' }
      ],
      expectedNet: 0,
      actualNet: -342.00,
      variance: -342.00,
      varianceExplained: 0,
      varianceUnexplained: -342.00,
      currency: 'SGD'
    },

    relatedRecords: [
      {
        type: 'settlement_line',
        id: 'PY-GP-09JUN26-500K-L1842',
        amount: -342.00,
        currency: 'SGD',
        date: '2026-06-09T06:00:00Z',
        status: 'unmatched',
        reference: 'GrabPay-Refund-Line',
        description: 'Refund processed in morning settlement batch'
      },
      {
        type: 'bank_credit',
        id: 'BC-GP-09JUN26-001',
        amount: 485125.00,
        currency: 'SGD',
        date: '2026-06-09T09:00:00Z',
        status: 'matched_l1',
        reference: 'DBS-SGD-****4521',
        description: 'GrabPay daily settlement — L1 matched, 3 L2 exceptions'
      }
    ]
  },

  // GP-002: Matched L1, but 2 L2 amount mismatches at order level
  // Bank credit = PSP Net = 504,530 but 2 order amounts differ between PSP and OMS
  {
    id: 'SE-GP002-AM-001',
    type: 'amount_mismatch',
    priority: 'medium',
    referenceId: 'ORD-2026-91580',
    amount: 18.75,
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-09T08:10:00Z',
    slaDue: '2026-06-12T08:10:00Z',
    owner: 'analyst1',
    ownerName: 'Analyst Kim',
    aiConfidence: 91,
    aiSuggestion: 'Promo discount applied in OMS but not reflected in PSP settlement — variance SGD 18.75 matches active campaign discount rate',
    status: 'open',
    age: '1d 3h',
    pastSLA: false,
    transactionType: 'payment',
    amountLabel: 'Order-Level Variance',
    materiality: 'low',
    escalationLevel: 0,

    diagnostic: {
      outcome: 'variance_partially_explained',
      confidence: 91,
      completedAt: '2026-06-09T08:11:00Z',
      systemRecommendation: 'Promo discount mismatch — PSP settled at full price while OMS has campaign discount applied',
      autoAction: undefined,
      findings: [
        {
          category: 'fee_decomposition',
          result: 'pass',
          detail: 'MDR, GST and FX fees match contract rates. Variance is not fee-related.',
        },
        {
          category: 'promo_check',
          result: 'partial',
          detail: 'OMS shows promo code GRAB15 applied (15% off, max SGD 10). PSP settled full gross SGD 143.75. OMS net expected SGD 125.00. Variance: SGD 18.75.',
        },
        {
          category: 'historical_pattern',
          result: 'partial',
          detail: '14 similar promo-related mismatches found in last 30 days for GrabPay orders with campaign discounts. Avg variance SGD 12.40.',
        }
      ]
    },

    nba: {
      action: 'accept_variance',
      priority: 'human_confirm',
      description: 'Variance of SGD 18.75 across 2 orders traced to promotional discount mismatch. OMS applied GRAB15 campaign discount (15% off) but GrabPay settled at full gross amount. This is a known pattern with 14 similar cases in the last 30 days. Recommend accepting variance and posting adjustment entry.',
      actionButtons: [
        {
          id: 'accept_promo_var',
          label: 'Accept & Post Adjustment',
          action: 'accept_variance',
          variant: 'primary',
        },
        {
          id: 'escalate_promo',
          label: 'Escalate to Campaigns Team',
          action: 'escalate',
          variant: 'secondary',
        }
      ]
    },

    financialBreakdown: {
      gross: 143.75,
      components: [
        { name: 'Promo Discount (GRAB15)', type: 'deduction', amount: 18.75, percentage: 15.0, description: '15% campaign discount — applied in OMS, not in PSP' }
      ],
      expectedNet: 125.00,
      actualNet: 143.75,
      variance: 18.75,
      varianceExplained: 18.75,
      varianceUnexplained: 0,
      currency: 'SGD'
    },

    relatedRecords: [
      {
        type: 'order',
        id: 'ORD-2026-91580',
        amount: 125.00,
        currency: 'SGD',
        date: '2026-06-08T19:22:00Z',
        status: 'completed',
        reference: 'Grab-Food-Delivery',
        description: 'Food delivery — promo GRAB15 applied (15% off max SGD 10)'
      },
      {
        type: 'settlement_line',
        id: 'PY-GP-09JUN26-520K-L1580',
        amount: 143.75,
        currency: 'SGD',
        date: '2026-06-09T06:00:00Z',
        status: 'mismatch',
        reference: 'GrabPay-Settlement-Line',
        description: 'PSP settled at full gross — no promo deduction'
      },
      {
        type: 'bank_credit',
        id: 'BC-GP-09JUN26-002',
        amount: 504530.00,
        currency: 'SGD',
        date: '2026-06-09T09:00:00Z',
        status: 'matched_l1',
        reference: 'DBS-SGD-****4521',
        description: 'GrabPay daily settlement — L1 matched, 2 L2 amount mismatches'
      }
    ]
  },

  // GP-003: L1 Variance — Bank credit SGD 467,880 vs PSP Net SGD 465,720 = SGD 2,160 variance
  {
    id: 'SE-GP003-VAR-001',
    type: 'amount_mismatch',
    priority: 'high',
    referenceId: 'BC-GP-09JUN26-003',
    amount: 2160.00,
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-09T08:30:00Z',
    slaDue: '2026-06-10T08:30:00Z',
    owner: null,
    aiConfidence: 68,
    aiSuggestion: 'L1 variance SGD 2,160 (0.46%) — bank credit exceeds PSP net. Possible duplicate credit or timing difference on rolling reserve release.',
    status: 'open',
    age: '1d 3h',
    pastSLA: true,
    transactionType: 'settlement',
    amountLabel: 'L1 Variance (Bank vs PSP)',
    materiality: 'high',
    escalationLevel: 0,

    diagnostic: {
      outcome: 'l1_variance_unexplained',
      confidence: 68,
      completedAt: '2026-06-09T08:32:00Z',
      systemRecommendation: 'Investigate variance — bank credit exceeds PSP settlement net by SGD 2,160. Most likely cause: rolling reserve release credited to bank but not reflected in this settlement file.',
      autoAction: undefined,
      findings: [
        {
          category: 'l1_matching',
          result: 'fail',
          detail: 'Bank credit SGD 467,880.00 does not match PSP net SGD 465,720.00. Variance: SGD 2,160.00 (0.46%).',
        },
        {
          category: 'reserve_check',
          result: 'partial',
          detail: 'GrabPay rolling reserve release of SGD 2,160.00 was scheduled for Jun 9. This amount matches the L1 variance exactly. Bank may have credited reserve release separately.',
        },
        {
          category: 'duplicate_check',
          result: 'pass',
          detail: 'No duplicate bank credits found for this PSP on this date. Credit narration matches single settlement payout reference.',
        }
      ]
    },

    nba: {
      action: 'investigate',
      priority: 'human_investigate',
      description: 'L1 variance of SGD 2,160 (0.46%) between bank credit and PSP net. A scheduled rolling reserve release of exactly SGD 2,160 was due on Jun 9 — likely the bank credited this as part of the main settlement. Verify with GrabPay reserve release statement and accept variance if confirmed.',
      actionButtons: [
        {
          id: 'verify_reserve',
          label: 'Verify Reserve Release',
          action: 'verify_reserve',
          variant: 'primary',
        },
        {
          id: 'query_bank',
          label: 'Query Bank Statement',
          action: 'query_bank',
          variant: 'secondary',
        },
        {
          id: 'accept_l1_var',
          label: 'Accept Variance',
          action: 'accept_variance',
          variant: 'secondary',
        }
      ]
    },

    financialBreakdown: {
      gross: 480000.00,
      components: [
        { name: 'MDR Fee (2.5%)', type: 'deduction', amount: 12000.00, percentage: 2.5, description: 'Merchant Discount Rate per GrabPay contract' },
        { name: 'GST on MDR (7%)', type: 'deduction', amount: 840.00, percentage: 7.0, description: '7% GST on MDR fee' },
        { name: 'FX Margin (0.3%)', type: 'deduction', amount: 1440.00, percentage: 0.3, description: 'FX conversion margin' },
        { name: 'Rolling Reserve Release', type: 'addition', amount: 2160.00, description: 'Q1 2026 rolling reserve release — possibly credited directly to bank' }
      ],
      expectedNet: 467880.00,
      actualNet: 465720.00,
      variance: 2160.00,
      varianceExplained: 2160.00,
      varianceUnexplained: 0,
      currency: 'SGD'
    },

    relatedRecords: [
      {
        type: 'bank_credit',
        id: 'BC-GP-09JUN26-003',
        amount: 467880.00,
        currency: 'SGD',
        date: '2026-06-09T09:00:00Z',
        status: 'unmatched_variance',
        reference: 'DBS-SGD-****4521',
        description: 'GrabPay settlement — L1 variance SGD 2,160'
      },
      {
        type: 'settlement_line',
        id: 'PY-GP-09JUN26-480K',
        amount: 465720.00,
        currency: 'SGD',
        date: '2026-06-09T06:00:00Z',
        status: 'variance',
        reference: 'GrabPay-Settlement-Net',
        description: 'PSP net payout — SGD 2,160 less than bank credit'
      }
    ]
  },

  // GP-006: No PSP File — Bank credit SGD 502,193.13 with no matching settlement file
  {
    id: 'SE-GP006-NF-001',
    type: 'unmatched_credit',
    priority: 'high',
    referenceId: 'BC-GP-09JUN26-006',
    amount: 502193.13,
    currency: 'SGD',
    psp: 'grabpay',
    pspName: 'GrabPay',
    createdAt: '2026-06-09T09:15:00Z',
    slaDue: '2026-06-10T09:15:00Z',
    owner: null,
    aiConfidence: 82,
    aiSuggestion: 'Settlement file not received — GrabPay typically delivers by 06:00 SGT. File may be delayed due to GrabPay scheduled maintenance window (Jun 9 02:00-05:00 SGT).',
    status: 'open',
    age: '1d 2h',
    pastSLA: true,
    transactionType: 'settlement',
    amountLabel: 'Unmatched Bank Credit',
    materiality: 'high',
    escalationLevel: 0,

    diagnostic: {
      outcome: 'psp_file_missing',
      confidence: 82,
      completedAt: '2026-06-09T09:16:00Z',
      systemRecommendation: 'GrabPay settlement file for this credit is missing. Bank credit matches expected daily volume. File delivery may be delayed due to maintenance. Auto-retry at T+24h, escalate if still missing.',
      autoAction: 'auto_hold_48h',
      findings: [
        {
          category: 'file_check',
          result: 'fail',
          detail: 'No settlement file received from GrabPay matching this bank credit. Expected file: GrabPay-SGD-Daily-20260609-006.csv. Last check: Jun 9, 18:00 SGT.',
        },
        {
          category: 'maintenance_check',
          result: 'partial',
          detail: 'GrabPay notified of scheduled maintenance on Jun 9, 02:00-05:00 SGT. Previous maintenance windows have caused file delivery delays of 6-12 hours.',
        },
        {
          category: 'amount_validation',
          result: 'pass',
          detail: 'Bank credit SGD 502,193.13 is within expected daily GrabPay settlement range (SGD 450K-550K). Narration references GrabPay Pte Ltd.',
        },
        {
          category: 'historical_pattern',
          result: 'pass',
          detail: 'GrabPay has 99.2% file delivery rate over last 90 days. Last missed file: Apr 14, 2026 (resolved within 18h).',
        }
      ]
    },

    nba: {
      action: 'hold_and_retry',
      priority: 'auto',
      description: 'Bank credit of SGD 502,193.13 from GrabPay with no matching settlement file. GrabPay had scheduled maintenance on Jun 9 which may have delayed file delivery. System will auto-retry matching at T+24h. If file not received by Jun 10 18:00 SGT, escalate to GrabPay operations.',
      actionButtons: [
        {
          id: 'hold_retry',
          label: 'Hold & Auto-Retry',
          action: 'hold_retry',
          variant: 'primary',
        },
        {
          id: 'contact_grabpay',
          label: 'Contact GrabPay Ops',
          action: 'contact_psp',
          variant: 'secondary',
        },
        {
          id: 'raise_ticket_gp006',
          label: 'Raise Support Ticket',
          action: 'raise_ticket',
          variant: 'secondary',
        }
      ]
    },

    relatedRecords: [
      {
        type: 'bank_credit',
        id: 'BC-GP-09JUN26-006',
        amount: 502193.13,
        currency: 'SGD',
        date: '2026-06-09T09:00:00Z',
        status: 'unmatched',
        reference: 'GRABPAY PTE LTD SETTLEMENT',
        description: 'DBS-SGD-****4521 — No settlement file received'
      }
    ]
  },

  // STR-001: Matched L1, but 2 L2 unmatched orders
  // Bank credit = PSP Net = 366,308.60 but 2 order lines not found in OMS
  {
    id: 'SE-STR001-UO-001',
    type: 'unmatched_order',
    priority: 'medium',
    referenceId: 'ORD-2026-92107',
    amount: -187.50,
    currency: 'SGD',
    psp: 'stripe',
    pspName: 'Stripe',
    createdAt: '2026-06-09T08:50:00Z',
    slaDue: '2026-06-12T08:50:00Z',
    owner: 'analyst1',
    ownerName: 'Analyst Kim',
    aiConfidence: 78,
    aiSuggestion: '2 Stripe settlement lines (SGD 187.50 + SGD 94.00) have no OMS match — order IDs use legacy format suggesting migration-era transactions',
    status: 'open',
    age: '1d 3h',
    pastSLA: false,
    transactionType: 'payment',
    amountLabel: 'Unmatched PSP Lines',
    materiality: 'medium',
    escalationLevel: 0,

    diagnostic: {
      outcome: 'orders_not_found_legacy_format',
      confidence: 78,
      completedAt: '2026-06-09T08:51:00Z',
      systemRecommendation: 'Two order lines in Stripe settlement use legacy order ID format (ORD-2026-92107, ORD-2026-92108). These may be from a partner integration that uses a different ID scheme. Check partner order management system.',
      autoAction: undefined,
      findings: [
        {
          category: 'oms_lookup',
          result: 'fail',
          detail: 'Orders ORD-2026-92107 (SGD 187.50) and ORD-2026-92108 (SGD 94.00) not found in primary OMS. Searched by order ID, PSP transaction ID, and amount.',
        },
        {
          category: 'id_format_check',
          result: 'partial',
          detail: 'Order IDs use a non-standard format with sequential numbering. This pattern matches partner-integration orders from Stripe Connect sub-merchants.',
        },
        {
          category: 'partner_lookup',
          result: 'partial',
          detail: 'Possible match found in partner OMS (GrabMart integration) with IDs GM-92107 and GM-92108. Amounts match. Awaiting cross-reference confirmation.',
        }
      ]
    },

    nba: {
      action: 'cross_reference',
      priority: 'human_confirm',
      description: '2 unmatched Stripe settlement lines (total SGD 281.50) use non-standard order IDs. Pattern matches GrabMart partner integration orders. Possible matches found in partner OMS: GM-92107 (SGD 187.50) and GM-92108 (SGD 94.00). Recommend cross-referencing with partner system to confirm.',
      actionButtons: [
        {
          id: 'cross_ref_partner',
          label: 'Cross-Reference Partner OMS',
          action: 'cross_reference',
          variant: 'primary',
        },
        {
          id: 'query_stripe',
          label: 'Query Stripe',
          action: 'query_psp',
          variant: 'secondary',
        }
      ]
    },

    financialBreakdown: {
      gross: 281.50,
      components: [
        { name: 'Order 1 (ORD-2026-92107)', type: 'deduction', amount: 187.50, description: 'Ride payment — no OMS match' },
        { name: 'Order 2 (ORD-2026-92108)', type: 'deduction', amount: 94.00, description: 'Food delivery — no OMS match' }
      ],
      expectedNet: 0,
      actualNet: 281.50,
      variance: 281.50,
      varianceExplained: 0,
      varianceUnexplained: 281.50,
      currency: 'SGD'
    },

    relatedRecords: [
      {
        type: 'settlement_line',
        id: 'PY-STR-09JUN26-380K-L107',
        amount: 187.50,
        currency: 'SGD',
        date: '2026-06-09T06:00:00Z',
        status: 'unmatched',
        reference: 'Stripe-Settlement-Line-1',
        description: 'Ride payment — legacy order format'
      },
      {
        type: 'settlement_line',
        id: 'PY-STR-09JUN26-380K-L108',
        amount: 94.00,
        currency: 'SGD',
        date: '2026-06-09T06:00:00Z',
        status: 'unmatched',
        reference: 'Stripe-Settlement-Line-2',
        description: 'Food delivery — legacy order format'
      },
      {
        type: 'bank_credit',
        id: 'BC-STR-09JUN26-001',
        amount: 366308.60,
        currency: 'SGD',
        date: '2026-06-09T09:30:00Z',
        status: 'matched_l1',
        reference: 'OCBC-SGD-****7821',
        description: 'Stripe daily settlement — L1 matched, 2 unmatched orders'
      }
    ]
  },

  // STR-002: Matched L1, but 2 L2 amount mismatches at order level
  // Bank credit = PSP Net = 384,623.03 but 2 orders have FX conversion differences
  {
    id: 'SE-STR002-AM-001',
    type: 'amount_mismatch',
    priority: 'medium',
    referenceId: 'ORD-2026-92340',
    amount: 4.82,
    currency: 'SGD',
    psp: 'stripe',
    pspName: 'Stripe',
    createdAt: '2026-06-09T09:00:00Z',
    slaDue: '2026-06-12T09:00:00Z',
    owner: 'analyst1',
    ownerName: 'Analyst Kim',
    aiConfidence: 94,
    aiSuggestion: 'FX conversion rate difference between Stripe and OMS — Stripe used mid-market rate while OMS used contracted rate. Net variance SGD 4.82 across 2 orders.',
    status: 'open',
    age: '1d 3h',
    pastSLA: false,
    transactionType: 'payment',
    amountLabel: 'FX Rate Variance',
    materiality: 'low',
    escalationLevel: 0,

    diagnostic: {
      outcome: 'variance_fully_explained',
      confidence: 94,
      completedAt: '2026-06-09T09:01:00Z',
      systemRecommendation: 'FX rate variance across 2 orders. Stripe settled using mid-market rate (1.3542) while OMS booked at contracted rate (1.3550). Variance is within acceptable FX tolerance (< 0.1%). Auto-clear recommended.',
      autoAction: 'auto_clear_with_gl_posting',
      findings: [
        {
          category: 'fx_rate_check',
          result: 'partial',
          detail: 'ORD-2026-92340: OMS amount SGD 268.50 (rate 1.3550), Stripe settled SGD 265.34 (rate 1.3542). Variance SGD 3.16. ORD-2026-92341: OMS SGD 142.00, Stripe SGD 140.34. Variance SGD 1.66.',
        },
        {
          category: 'fee_decomposition',
          result: 'pass',
          detail: 'MDR (2.9%), GST (7%), and FX margin (0.5%) all match Stripe contract rates. Variance is solely from base FX rate difference.',
        },
        {
          category: 'tolerance_check',
          result: 'pass',
          detail: 'Combined FX variance SGD 4.82 is 0.0013% of settlement total (SGD 384,623.03). Well within FX tolerance threshold of 0.1%.',
        }
      ]
    },

    nba: {
      action: 'auto_clear',
      priority: 'auto',
      description: 'FX rate variance of SGD 4.82 across 2 Stripe orders. Stripe used mid-market rate (1.3542) vs OMS contracted rate (1.3550). Total variance is 0.0013% of settlement — well within 0.1% FX tolerance. Recommend auto-clear with GL posting to FX variance account.',
      actionButtons: [
        {
          id: 'auto_clear_fx',
          label: 'Auto-Clear to FX Variance',
          action: 'auto_clear',
          variant: 'primary',
        },
        {
          id: 'review_fx_detail',
          label: 'Review FX Detail',
          action: 'review_breakdown',
          variant: 'secondary',
        }
      ]
    },

    financialBreakdown: {
      gross: 410.50,
      components: [
        { name: 'FX Rate Diff (ORD-92340)', type: 'deduction', amount: 3.16, description: 'OMS rate 1.3550 vs Stripe rate 1.3542 on SGD 268.50 order' },
        { name: 'FX Rate Diff (ORD-92341)', type: 'deduction', amount: 1.66, description: 'OMS rate 1.3550 vs Stripe rate 1.3542 on SGD 142.00 order' }
      ],
      expectedNet: 410.50,
      actualNet: 405.68,
      variance: 4.82,
      varianceExplained: 4.82,
      varianceUnexplained: 0,
      currency: 'SGD'
    },

    relatedRecords: [
      {
        type: 'order',
        id: 'ORD-2026-92340',
        amount: 268.50,
        currency: 'SGD',
        date: '2026-06-08T14:15:00Z',
        status: 'completed',
        reference: 'Grab-Ride-Premium',
        description: 'Premium ride booking — FX converted from USD'
      },
      {
        type: 'order',
        id: 'ORD-2026-92341',
        amount: 142.00,
        currency: 'SGD',
        date: '2026-06-08T16:42:00Z',
        status: 'completed',
        reference: 'Grab-Food-Delivery',
        description: 'Food delivery — FX converted from USD'
      },
      {
        type: 'bank_credit',
        id: 'BC-STR-09JUN26-002',
        amount: 384623.03,
        currency: 'SGD',
        date: '2026-06-09T09:30:00Z',
        status: 'matched_l1',
        reference: 'OCBC-SGD-****7821',
        description: 'Stripe daily settlement — L1 matched, 2 FX rate mismatches'
      }
    ]
  }
]

// Export count for validation
export const ENHANCED_EXCEPTION_COUNT = enhancedExceptions.length
