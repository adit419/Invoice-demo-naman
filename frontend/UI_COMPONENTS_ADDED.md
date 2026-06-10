# UI Components Added - Journal Entries & Approval Workflow

## What Was Added

We've added **complete UI components** to display journal entries, approval requirements, and financial impact in the Exception Workspace. Now when you view an unmatched order exception, you'll see all the financial details!

---

## Components Created/Modified

### 1. **NEW: JournalEntryPreviewModal** ✨
**File:** `/src/cash-app-v2/components/modals/JournalEntryPreviewModal.tsx`

**Purpose:** Shows a detailed preview modal when user clicks action buttons that have financial impact (like "Submit for Approval").

**Features:**
- ✅ Financial Impact Summary (Revenue, Cash, P&L, Subledgers)
- ✅ Complete journal entries with DR/CR columns
- ✅ Account codes and names
- ✅ Balanced entry verification (DR = CR)
- ✅ Approval requirements warning
- ✅ Approver details (Manager Sarah Lee)
- ✅ Threshold information

**When it appears:**
- When user clicks any button with `showJournalPreview: true`
- For UO-20260606-001: "Submit for Approval" button
- For UO-20260606-002: "Write Off (Requires Approval)" button
- For UO-20260606-003: "Auto-Match to Archive" button

**Visual Design:**
```
┌─────────────────────────────────────────────────────┐
│ Journal Entry Preview                               │
│ Action: Initiate Refund • UO-20260606-001         │
├─────────────────────────────────────────────────────┤
│ 📊 Financial Impact Summary                         │
│ ┌──────────────┬──────────────┬──────────────┐    │
│ │ Revenue      │ Cash         │ Net P&L      │    │
│ │ -142,000 SGD │ -142,050 SGD │ -50 SGD      │    │
│ └──────────────┴──────────────┴──────────────┘    │
├─────────────────────────────────────────────────────┤
│ 📑 Entry 1: Revenue Reversal                       │
│ ┌─────────┬───────────────────┬─────┬────────┐   │
│ │ Account │ Name              │ DR  │ CR     │   │
│ ├─────────┼───────────────────┼─────┼────────┤   │
│ │ 4100    │ Sales Revenue     │142K │        │   │
│ │ 1200    │ AR - GrabPay      │     │ 142K   │   │
│ └─────────┴───────────────────┴─────┴────────┘   │
│ ✓ Entry is balanced (DR = CR)                     │
│                                                     │
│ (+ 2 more entries)                                 │
├─────────────────────────────────────────────────────┤
│ ⚠️ APPROVAL REQUIRED                               │
│ Revenue reversal exceeds SGD 10,000 threshold      │
│ Approver: Manager Sarah Lee                        │
├─────────────────────────────────────────────────────┤
│ [Cancel]  [Submit for Approval]                    │
└─────────────────────────────────────────────────────┘
```

---

### 2. **UPDATED: ExceptionDetailModal** ✏️
**File:** `/src/cash-app-v2/components/modals/ExceptionDetailModal.tsx`

**New Sections Added:**

#### A. Financial Impact Summary
Shows high-level financial statement impact:
- Revenue Impact (P&L)
- Cash Impact (Cash Flow)
- Net P&L Impact
- Affected Subledgers (Revenue, AR, Bank, Expenses)

**When shown:** If `nba.financialImpact` exists

#### B. Approval Requirements
Shows approval warning if action requires manager sign-off:
- Approval reason
- Threshold (SGD 10,000 for refunds)
- Approver name (Manager Sarah Lee)

**When shown:** If `nba.approval.approvalRequired === true`

#### C. Journal Entries (Summary)
Shows collapsed view of journal entries:
- Entry number and description
- Total DR and CR amounts
- First 2 GL lines per entry
- "Click action button to view full details" prompt

**When shown:** If `nba.journalEntries` exists

**Visual Updates:**
```
Exception Detail Modal
├── Summary (Type, Priority, Amount, Age)
├── Diagnostic Results
├── Next Best Action
│   └── Action Buttons (now with 🔒 for approval-required)
├── 📊 Financial Impact Summary    ← NEW
├── 🔒 Approval Requirements         ← NEW
├── 📑 Journal Entries (Summary)     ← NEW
├── Financial Breakdown (existing)
├── Related Records (existing)
└── Audit Trail (existing)
```

---

## How It Works

### Flow 1: Action Requires Approval (Refund Example)

```
User clicks "Submit for Approval" button
              ↓
System checks: button.showJournalPreview === true?
              ↓ YES
Show JournalEntryPreviewModal
  - Display 3 journal entries with all GL lines
  - Show financial impact (-SGD 142K revenue, -SGD 50 P&L)
  - Show approval warning (Manager Sarah Lee)
              ↓
User clicks "Submit for Approval" in modal
              ↓
Execute action: onAction('submit_refund_for_approval', exceptionId)
              ↓
Show success message: "Submitted for approval"
```

### Flow 2: Action Does NOT Require Approval (Auto-Match Example)

```
User clicks "Auto-Match to Archive" button
              ↓
System checks: button.showJournalPreview === true?
              ↓ YES (but approval not required)
Show JournalEntryPreviewModal
  - Display 1 journal entry (Bank DR / AR CR)
  - Show financial impact (No P&L impact)
  - NO approval warning (perfect match)
              ↓
User clicks "Confirm & Execute" in modal
              ↓
Execute action immediately
              ↓
Show success message: "Exception resolved"
```

### Flow 3: No Journal Preview (PSP Inquiry Example)

```
User clicks "Generate PSP Inquiry" button
              ↓
System checks: button.showJournalPreview === true?
              ↓ NO
Execute action immediately: onAction('generate_psp_inquiry', exceptionId)
              ↓
Show success message: "PSP inquiry generated"
```

---

## Data Flow

### 1. Backend Data (Already Exists)

```typescript
// In exceptionsEnhanced.ts
{
  id: 'UO-20260606-001',
  nba: {
    action: 'initiate_refund',

    // Approval metadata
    approval: {
      approvalRequired: true,
      approvalReason: 'Revenue reversal exceeds SGD 10,000 threshold',
      approvalThreshold: { amount: 10000, currency: 'SGD' },
      approverName: 'Manager Sarah Lee'
    },

    // Journal entries
    journalEntries: [
      {
        entryNumber: 1,
        description: 'Revenue Reversal',
        lines: [
          { account: '4100', accountName: 'Sales Revenue', debitCredit: 'debit', amount: 142000 },
          { account: '1200', accountName: 'AR', debitCredit: 'credit', amount: 142000 }
        ]
      }
      // ... more entries
    ],

    // Financial impact
    financialImpact: {
      revenueImpact: -142000,
      cashImpact: -142050,
      plImpact: -50,
      affectedSubledgers: ['Revenue', 'AR', 'Bank']
    },

    // Action buttons
    actionButtons: [
      {
        id: 'submit_for_approval',
        label: 'Submit for Approval',
        action: 'submit_refund_for_approval',
        variant: 'primary',
        requiresApproval: true,        // Used for visual indicator
        showJournalPreview: true       // Triggers modal
      }
    ]
  }
}
```

### 2. Frontend Rendering

```typescript
// ExceptionDetailModal.tsx

// Cast NBA to enhanced version
const nbaEnhanced = exception.nba as NextBestActionEnhanced | undefined

// Render new sections
{nbaEnhanced?.financialImpact && <FinancialImpactSection />}
{nbaEnhanced?.approval?.approvalRequired && <ApprovalSection />}
{nbaEnhanced?.journalEntries && <JournalEntriesSection />}

// Handle button clicks
const handleActionClick = (action, showPreview, buttonLabel) => {
  if (showPreview) {
    setSelectedAction({ action, buttonLabel })
    setShowJournalPreview(true)
  } else {
    onAction(action, exceptionId)
  }
}
```

---

## Visual Indicators

### Action Buttons

**Before (all buttons looked the same):**
```
[Submit for Approval]  [Contact Customer]  [View Order]
```

**After (approval-required buttons have lock icon):**
```
[Submit for Approval 🔒]  [Contact Customer]  [View Order]
```

### Financial Impact

**Color coding:**
- 🔴 **Red (Negative)**: Revenue decrease, Cash out, P&L expense
- 🟢 **Green (Positive)**: Revenue increase, Cash in, P&L income
- ⚪ **Gray (Zero)**: No impact

**Icons:**
- ↓ (TrendingDown): Negative impact
- ↑ (TrendingUp): Positive impact

---

## Which Exceptions Show Journal Entries?

### **Enhanced Exceptions (10 total):**

| Exception ID | Type | Journal Entries? | Approval? |
|-------------|------|------------------|-----------|
| BC-20260607-001 | Unmatched Credit | No | No |
| BC-20260606-011 | Unmatched Credit | No | No |
| BC-20260606-012 | Unmatched Credit | No | No |
| AM-20260606-001 | Amount Mismatch | No | No |
| AM-20260606-002 | Amount Mismatch | No | No |
| SS-20260606-001 | Subset-Sum | No | No |
| **UO-20260606-001** | **Unmatched Order** | **✅ 3 entries** | **✅ Yes** |
| **UO-20260606-002** | **Unmatched Order** | **✅ 1 entry** | **✅ Yes (write-off)** |
| **UO-20260606-003** | **Unmatched Order** | **✅ 1 entry** | **❌ No** |
| CB-20260606-001 | Chargeback | No | No |

**Only the 3 new unmatched order scenarios** have journal entries and approval workflows!

---

## Testing the UI

### Test Scenario 1: UO-20260606-001 (Refund with Approval)

1. Navigate to Exception Workspace
2. Filter by Type: "Unmatched Order"
3. Click on **UO-20260606-001** (SGD 142,000)
4. **In the detail modal, you should see:**
   - 📊 **Financial Impact Summary** section (Revenue: -142K, Cash: -142K, P&L: -50)
   - 🔒 **Approval Requirements** section (Threshold: SGD 10K, Approver: Manager Sarah Lee)
   - 📑 **Journal Entries** section (3 entries, collapsed view)
5. Click **"Submit for Approval 🔒"** button
6. **Preview modal should appear** showing:
   - Complete 3 journal entries with all DR/CR lines
   - Financial impact summary
   - Approval warning
7. Click **"Submit for Approval"** in modal
8. Should show success message

### Test Scenario 2: UO-20260606-003 (Auto-Match, No Approval)

1. Click on **UO-20260606-003** (SGD 38,500)
2. **In the detail modal, you should see:**
   - 📊 **Financial Impact Summary** (Revenue: 0, Cash: +38.5K, P&L: 0)
   - **NO Approval Requirements** section (approval not required)
   - 📑 **Journal Entries** section (1 entry)
3. Click **"Auto-Match to Archive"** button
4. **Preview modal should appear** showing:
   - 1 journal entry (Bank DR / AR CR)
   - No approval warning
   - Button says "Confirm & Execute" (not "Submit for Approval")
5. Click **"Confirm & Execute"**
6. Should execute immediately

---

## Troubleshooting

### Issue: "I don't see journal entries in the modal"

**Possible causes:**
1. You're viewing a different exception (only UO-20260606-001/002/003 have journal entries)
2. Component hasn't re-rendered after adding data
3. Type casting issue

**Solution:**
```typescript
// Check in console
console.log('Exception:', exception)
console.log('NBA Enhanced:', exception.nba)
console.log('Journal Entries:', exception.nba?.journalEntries)
```

### Issue: "Preview modal doesn't show when clicking button"

**Check:**
1. Button has `showJournalPreview: true` in the data
2. `handleActionClick` is being called
3. `showJournalPreview` state is updating

**Debug:**
```typescript
const handleActionClick = (action, buttonId, showPreview, buttonLabel) => {
  console.log('Button clicked:', { action, showPreview, buttonLabel })
  if (showPreview) {
    console.log('Should show preview modal')
    setShowJournalPreview(true)
  }
}
```

### Issue: "Action executes immediately without showing preview"

**Cause:** `button.showJournalPreview` is `false` or `undefined`

**Fix:** Update the button in `exceptionsEnhanced.ts`:
```typescript
actionButtons: [
  {
    id: 'submit_for_approval',
    label: 'Submit for Approval',
    action: 'submit_refund_for_approval',
    variant: 'primary',
    requiresApproval: true,
    showJournalPreview: true  // ← Make sure this is true
  }
]
```

---

## Summary

✅ **JournalEntryPreviewModal** component created - shows full journal entries before execution
✅ **ExceptionDetailModal** updated - displays financial impact, approval requirements, and journal entries
✅ **Action button handler** updated - shows preview modal when `showJournalPreview: true`
✅ **Visual indicators** added - 🔒 for approval-required buttons
✅ **3 unmatched order scenarios** now show complete financial details

**All UI components are ready for your Thursday demo!** 🎯
