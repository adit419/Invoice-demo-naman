# Approval Workflow & Journal Entry Preview - Complete Guide

## Overview

The Exception Workspace now includes **maker-checker approval workflows** and **journal entry previews** for all actions with financial/accounting impact. This ensures:
- ✅ **Financial controls** - No unauthorized changes to GL
- ✅ **Audit compliance** - Full trail of who approved what
- ✅ **Transparency** - Users see exact GL impact before execution
- ✅ **Risk mitigation** - Material actions require manager sign-off

---

## Architecture

### 1. **Approval Metadata** (in NBA)

Every NBA (Next Best Action) can include approval requirements:

```typescript
nba: {
  action: 'initiate_refund',
  priority: 'urgent',
  description: '...',

  approval: {
    approvalRequired: true,
    approvalReason: 'Revenue reversal exceeds SGD 10,000 threshold',
    approvalThreshold: {
      amount: 10000,
      currency: 'SGD',
      rule: 'refund'
    },
    approvalLevel: 'manager',
    approver: 'manager1',
    approverName: 'Manager Sarah Lee'
  }
}
```

### 2. **Journal Entry Preview** (in NBA)

Shows exact GL entries that will be posted:

```typescript
journalEntries: [
  {
    entryNumber: 1,
    description: 'Revenue Reversal',
    postingDate: '2026-06-07',
    documentType: 'customer_refund',
    lines: [
      {
        lineNumber: 1,
        account: '4100',
        accountName: 'Sales Revenue',
        debitCredit: 'debit',
        amount: 142000.00,
        currency: 'SGD'
      },
      {
        lineNumber: 2,
        account: '1200',
        accountName: 'Accounts Receivable',
        debitCredit: 'credit',
        amount: 142000.00,
        currency: 'SGD'
      }
    ]
  }
]
```

### 3. **Financial Impact Summary** (in NBA)

Shows high-level impact across financial statements:

```typescript
financialImpact: {
  revenueImpact: -142000.00,    // P&L - Revenue line
  cashImpact: -142050.00,       // Cash Flow Statement
  plImpact: -50.00,             // Net P&L impact
  balanceSheetImpact: -142050.00,
  affectedAccounts: ['4100', '1200', '1010', '6250'],
  affectedSubledgers: ['Revenue', 'AR', 'Bank', 'Expenses']
}
```

---

## Approval Policy Rules

Configured in `/src/cash-app-v2/config/approvalPolicy.ts`:

### **Actions Requiring Approval**

| Action | Threshold | Approval Level | Reason |
|--------|-----------|----------------|--------|
| **Refund** | > SGD 10,000 | Manager | Revenue reversal impacts P&L |
| **Write-off** | > SGD 1,000 | Manager | Creates bad debt expense |
| **Variance Acceptance** | > SGD 1,000 | Manager | Unexplained variance requires review |
| **Manual GL Posting** | Any amount | Manager | All manual entries must be verified |
| **Revenue Reversal** | > SGD 10,000 | Manager | Affects reported financials |

### **Actions NOT Requiring Approval**

| Action | Reason |
|--------|--------|
| **Auto-Match (0% variance)** | System-verified, perfect match |
| **Generate PSP Inquiry** | Communication only, no financial impact |
| **Collect Evidence** | Informational, no GL entries |
| **View Details** | Read-only action |

---

## How It Works in Each Scenario

### **Scenario 1: Order Cancelled After Capture (UO-20260606-001)**

**Situation**: Customer paid SGD 142,000 but service was cancelled.

**Action**: Initiate Refund

**Approval Required**: ✅ YES
- Amount: SGD 142,000 > threshold (SGD 10,000)
- Rule: Revenue reversal
- Approver: Manager Sarah Lee

**Journal Entries** (3 entries):

```
Entry 1: Revenue Reversal
  DR  Sales Revenue                 142,000.00
  CR  Accounts Receivable           142,000.00

Entry 2: Refund Processing
  DR  Accounts Receivable           142,000.00
  CR  Bank - OCBC SGD Account       142,000.00

Entry 3: Processing Fee
  DR  Payment Processing Expense         50.00
  CR  Bank - OCBC SGD Account            50.00
```

**Financial Impact**:
- Revenue: -SGD 142,000 (reversed)
- Cash Out: -SGD 142,050 (refund + fee)
- Net P&L: -SGD 50 (processing fee expense)

**Action Button**:
```typescript
{
  id: 'submit_for_approval',
  label: 'Submit for Approval',
  action: 'submit_refund_for_approval',
  variant: 'primary',
  requiresApproval: true,
  showJournalPreview: true  // Shows modal with journal entries
}
```

**Demo Flow**:
1. Analyst clicks "Submit for Approval"
2. Modal shows all 3 journal entries + financial impact
3. Analyst confirms and submits
4. Exception moves to `pending_approval` status
5. Manager Sarah Lee receives notification
6. Manager reviews and approves
7. System posts journal entries automatically
8. Exception closed

---

### **Scenario 2: Order Not Found - Orphan (UO-20260606-002)**

**Situation**: PSP settlement for ORD-2026-88512 (SGD 64,000) but order doesn't exist in OMS.

**Primary Action**: Generate PSP Inquiry

**Approval Required**: ❌ NO
- Communication only, no financial impact

**Alternative Action**: Write Off

**Approval Required**: ✅ YES
- Amount: SGD 64,000 > threshold (SGD 1,000)
- Rule: Write-off
- Approver: Manager Sarah Lee

**Journal Entry** (IF write-off chosen):

```
Entry 1: Write-off Unidentified PSP Settlement
  DR  Bad Debt Expense / Settlement Errors  64,000.00
  CR  PSP Settlement Clearing Account       64,000.00
```

**Financial Impact** (write-off):
- Revenue: SGD 0 (order never existed)
- Cash: SGD 0 (settlement already received)
- P&L: -SGD 64,000 (bad debt expense)

**Action Buttons**:
```typescript
[
  {
    id: 'generate_psp_inquiry',
    label: 'Generate PSP Inquiry',
    requiresApproval: false,  // No approval needed
    showJournalPreview: false
  },
  {
    id: 'write_off',
    label: 'Write Off (Requires Approval)',
    requiresApproval: true,   // Approval required
    showJournalPreview: true  // Shows journal entry
  }
]
```

---

### **Scenario 3: Order Archived - Late Settlement (UO-20260606-003)**

**Situation**: Settlement received 84 days late for archived order (SGD 38,500).

**Action**: Auto-Match to Archive

**Approval Required**: ❌ NO
- Perfect match (0% variance)
- No P&L impact (revenue already recognized in March)
- Just clearing AR and recording cash

**Journal Entry**:

```
Entry 1: Match Late Settlement to Archived Order
  DR  Bank - OCBC SGD Account               38,500.00
  CR  Accounts Receivable (Archive)         38,500.00
```

**Financial Impact**:
- Revenue: SGD 0 (already recognized in March)
- Cash In: +SGD 38,500
- P&L: SGD 0 (no impact)
- Balance Sheet: Net zero (AR cleared, Cash in)

**Action Button**:
```typescript
{
  id: 'auto_match',
  label: 'Auto-Match to Archive',
  requiresApproval: false,      // No approval needed
  showJournalPreview: true      // But still shows journal entry for transparency
}
```

**Demo Flow**:
1. Analyst clicks "Auto-Match to Archive"
2. Modal shows journal entry (for transparency)
3. Analyst confirms
4. System posts entry immediately (no approval needed)
5. Exception closed

---

## UI Components Needed

### 1. **Journal Entry Preview Modal**

```typescript
<JournalEntryPreviewModal>
  <Header>
    Action: Initiate Customer Refund
    Order: ORD-2026-88421  |  Amount: SGD 142,000
  </Header>

  <FinancialImpactSummary>
    Revenue Impact:    -SGD 142,000.00
    Cash Impact:       -SGD 142,050.00
    Net P&L Impact:    -SGD     50.00
  </FinancialImpactSummary>

  <JournalEntriesSection>
    {journalEntries.map(entry => (
      <JournalEntry>
        <EntryHeader>
          Entry {entry.entryNumber}: {entry.description}
          Date: {entry.postingDate}
        </EntryHeader>
        <LinesTable>
          {entry.lines.map(line => (
            <tr>
              <td>{line.account}</td>
              <td>{line.accountName}</td>
              <td>{line.debitCredit === 'debit' ? formatAmount(line.amount) : ''}</td>
              <td>{line.debitCredit === 'credit' ? formatAmount(line.amount) : ''}</td>
            </tr>
          ))}
        </LinesTable>
        <EntryTotals>
          Total: DR {formatAmount(entry.totalDebit)} = CR {formatAmount(entry.totalCredit)}
        </EntryTotals>
      </JournalEntry>
    ))}
  </JournalEntriesSection>

  {approvalRequired && (
    <ApprovalSection>
      <Alert type="warning">
        ⚠️ APPROVAL REQUIRED
        This action requires manager approval due to:
        • Revenue reversal > SGD 10,000
        • Direct P&L impact

        Approver: Manager Sarah Lee
      </Alert>
    </ApprovalSection>
  )}

  <ActionButtons>
    {approvalRequired ? (
      <Button variant="primary">Submit for Approval</Button>
    ) : (
      <Button variant="primary">Confirm and Execute</Button>
    )}
    <Button variant="secondary">Cancel</Button>
  </ActionButtons>
</JournalEntryPreviewModal>
```

### 2. **Approval Status Badge**

Shows current approval state:

```typescript
<ApprovalStatusBadge status={exception.approvalStatus}>
  {status === 'pending_approval' && '⏳ Pending Approval'}
  {status === 'approved' && '✅ Approved'}
  {status === 'rejected' && '❌ Rejected'}
</ApprovalStatusBadge>
```

### 3. **Approval History Timeline**

```typescript
<ApprovalTimeline>
  <Event>
    2026-06-07 10:30 - Analyst Kim submitted for approval
  </Event>
  <Event>
    2026-06-07 14:20 - Manager Sarah Lee approved
    Comment: "Verified with customer service. Refund justified."
  </Event>
  <Event>
    2026-06-07 14:21 - System posted journal entries
  </Event>
</ApprovalTimeline>
```

---

## Demo Talking Points

### **For Scenario 1 (Refund with Approval)**

> "Before the analyst can execute this SGD 142,000 refund, let me show you what happens. When they click 'Submit for Approval', they see this preview modal.
>
> Here are the exact journal entries that will be posted: three entries - revenue reversal, refund processing, and the SGD 50 fee. See how it clearly shows the financial impact: negative SGD 142,000 in revenue, negative SGD 142,050 in cash, net P&L impact of negative SGD 50.
>
> This action requires manager approval because it's a revenue reversal above the SGD 10,000 threshold. The system automatically enforces maker-checker controls - Analyst Kim submits, Manager Sarah reviews and approves. This ensures financial accuracy and audit compliance.
>
> Once approved, the system posts these entries automatically to the general ledger and subledgers. No manual data entry required."

### **For Scenario 2 (Orphan Order)**

> "This one is interesting - we have a PSP settlement for SGD 64,000 but the order doesn't exist in our system. The analyst has two options.
>
> First, they can generate an inquiry to Stripe - this doesn't require approval because it's just communication, no financial impact.
>
> But if after investigation they determine it's a PSP error and want to write it off, that DOES require approval. Look - the write-off button shows 'Requires Approval' and when clicked, displays the journal entry: DR Bad Debt Expense, CR PSP Clearing. This is a SGD 64,000 P&L hit, so it needs manager sign-off.
>
> The system knows which actions need approval and which don't - it's not all-or-nothing."

### **For Scenario 3 (Auto-Match to Archive)**

> "This one doesn't need approval - it's a perfect match with zero variance. The order was from March, already archived, and now we're receiving the late settlement.
>
> Even though it doesn't need approval, we still show the journal entry for transparency: DR Bank, CR Accounts Receivable. Notice the financial impact: no P&L impact because revenue was already recognized in March. Just clearing the AR and recording the cash.
>
> The system knows this is safe to auto-process because there's no variance, no P&L impact, just routine cash reconciliation. But the analyst can still see exactly what will happen before confirming."

---

## Benefits for Grab

### 1. **Financial Controls**
- Maker-checker separation of duties
- Material actions require approval
- Prevents unauthorized GL changes

### 2. **Audit Compliance**
- Full trail of who approved what and when
- Journal entries traceable to source exception
- Meets SOX and internal audit requirements

### 3. **Transparency**
- Users see exact GL impact before execution
- No surprises in financial statements
- Clear understanding of P&L vs balance sheet impact

### 4. **Risk Mitigation**
- Thresholds prevent small errors from escalating
- Unexplained variances flagged for review
- Revenue reversals scrutinized before execution

### 5. **Efficiency**
- Auto-matches proceed without approval delays
- Informational actions (inquiries, reports) don't block workflow
- Only material financial actions require sign-off

---

## Integration with GL/ERP System

**For Production Implementation**:

When approved, the system would:
1. Call ERP API to post journal entries
2. Update subledgers (AR, Bank, Revenue)
3. Create GL documents with reference to exception ID
4. Attach audit trail (who approved, when, why)
5. Mark exception as resolved in database
6. Generate confirmation email to analyst and approver

**Mock Implementation** (for demo):
- Journal entries shown in preview modal
- Approval status tracked in exception metadata
- No actual ERP integration
- Demonstrates the workflow and controls

---

## Files Created/Modified

### New Files:
1. `/src/cash-app-v2/config/approvalPolicy.ts` - Approval rules and thresholds
2. `/APPROVAL_WORKFLOW_GUIDE.md` - This documentation

### Modified Files:
1. `/src/cash-app-v2/types/exceptions.ts` - Added journal entry and approval types
2. `/src/cash-app-v2/data/exceptionsEnhanced.ts` - Added journal entries to 3 scenarios

### Types Added:
- `JournalEntry`
- `JournalEntryLine`
- `FinancialImpact`
- `ApprovalMetadata`
- `ApprovalThreshold`
- `NextBestActionEnhanced`

---

## Summary

✅ **Approval workflows** added to all actions with financial impact
✅ **Journal entry previews** show exact GL postings before execution
✅ **Financial impact summaries** explain P&L, cash, and balance sheet effects
✅ **Approval policy** configured with thresholds by action type
✅ **3 unmatched order scenarios** fully enhanced with approval + journal entries

**Ready for Thursday demo!** 🎯
