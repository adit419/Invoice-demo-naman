# Exception Workspace Enhancement - Implementation Plan

## Overview
Transform the basic Exception Workspace into a comprehensive exception management system with 11 exception types, intelligent diagnostics, Next Best Actions (NBA), and full audit trail.

---

## Phase 1: Data Model & Type System (Priority: CRITICAL)

### 1.1 Expand Exception Types (Currently 5 → Target 11)

**Current types:**
1. ✅ Unmatched Credit (basic)
2. ✅ Unmatched Order (basic)
3. ✅ Amount Mismatch (basic)
4. ✅ Orphan Adjustment (basic)
5. ✅ Aging Breach (basic)

**New types to add:**
6. Many-to-Many / Subset-Sum Matching
7. Duplicate Settlement
8. Late PSP Adjustment
9. Chargeback Lifecycle Event
10. Refund-Settlement Mismatch
11. Missing/Late Settlement File
12. Orphaned Reversal/Credit Note
13. Commission/Platform-Fee Netting Discrepancy

### 1.2 New Domain Type Interfaces

```typescript
// Extended Exception with Diagnostics
interface ExceptionDetail extends Exception {
  // Diagnostic results
  diagnostic: DiagnosticResult

  // NBA recommendation
  nba: NextBestAction

  // Financial breakdown
  financialBreakdown?: FinancialBreakdown

  // Related records
  relatedRecords?: RelatedRecord[]

  // Audit trail
  auditTrail: AuditEntry[]

  // Resolution
  resolution?: Resolution
}

interface DiagnosticResult {
  outcome: string // e.g., "fuzzy_match_found", "psp_file_pending"
  confidence: number // 0-100
  findings: DiagnosticFinding[]
  systemRecommendation: string
  autoAction?: string
}

interface DiagnosticFinding {
  category: string // "window_search", "fuzzy_match", "duplicate_check"
  result: "pass" | "fail" | "partial"
  detail: string
  evidence?: any
}

interface NextBestAction {
  action: string // "hold_and_retry", "propose_match", "escalate"
  priority: "auto" | "human_confirm" | "human_investigate"
  description: string
  actionButtons: ActionButton[]
  estimatedTime?: string
}

interface ActionButton {
  label: string
  action: string
  variant: "primary" | "secondary" | "danger"
  requiresInput?: boolean
  inputType?: "text" | "dropdown" | "date" | "amount"
}

interface FinancialBreakdown {
  gross: number
  pspFee: number
  mdr: number
  fxVariance: number
  rounding: number
  refundOffset: number
  promoOffset: number
  net: number
  variance: number
  varianceExplained: number
  varianceUnexplained: number
}

interface RelatedRecord {
  type: "bank_credit" | "settlement_line" | "order" | "refund" | "chargeback"
  id: string
  amount: number
  date: string
  status: string
  reference?: string
}

interface Resolution {
  code: "matched" | "written_off" | "psp_recovered" | "auto_cleared" | "duplicate" | "reclassified"
  timestamp: string
  resolvedBy: string
  resolvedByName: string
  systemRecommendation: string
  humanAction: string
  overrideReason?: string
  financialImpact: {
    amount: number
    glEntries: GLEntry[]
  }
}

interface GLEntry {
  account: string
  accountName: string
  debit: number
  credit: number
}
```

---

## Phase 2: Realistic Dataset Creation (Priority: CRITICAL)

### 2.1 Dataset Requirements

For each of the 11 exception types, create **3-5 realistic scenarios** covering different diagnostic outcomes.

**Example for Exception 1 (Unmatched Bank Credit):**

Scenario A: PSP file pending (auto-hold)
- Bank credit: SGD 142,500 (06 Jun 2026, 08:30)
- Diagnostic: PSP settlement file expected 07 Jun 2026 06:00
- NBA: Auto-hold, re-match on file arrival
- Data: `pspFileDueDate: '2026-06-07T06:00:00Z'`

Scenario B: Fuzzy match found (propose match)
- Bank credit: SGD 284,127.50
- PSP settlement: SGD 284,000
- Variance: SGD 127.50 (0.04%)
- Diagnostic: Within tolerance (0.05%)
- NBA: Propose match with variance explanation
- Data: Fee breakdown showing SGD 127.50 = FX rounding

Scenario C: Aggregate sum match (multiple credits)
- Bank credits: SGD 50,000 + SGD 42,000 + SGD 58,000 = SGD 150,000
- PSP settlement batch: SGD 150,000
- NBA: Propose multi-credit-to-one-settlement
- Data: Array of component credits

Scenario D: Known non-order credit (auto-classify)
- Bank credit: SGD 2,450
- Pattern match: "INTEREST CREDIT" in narration
- NBA: Auto-classify to GL 7210 (Bank Interest)
- Data: `knownCreditType: 'bank_interest'`

Scenario E: Duplicate deposit detected
- Bank credit: SGD 89,400 (duplicate of matched BC-001)
- NBA: Flag as duplicate, propose reversal
- Data: `originalDepositId: 'BC-001', matchDate: '2026-06-05'`

### 2.2 Mathematical Accuracy Requirements

**For Amount Mismatch exceptions:**
```
Gross Transaction Value:     SGD 100,000.00
- MDR Fee (2.5%):            SGD   2,500.00
- Tax on MDR (7% GST):       SGD     175.00
- FX Margin (0.3%):          SGD     300.00
+ Rolling Reserve Release:   SGD   1,000.00
= Expected Net:              SGD  98,025.00
Actual Bank Credit:          SGD  98,020.00
Variance:                    SGD       5.00 (within ±SGD 10 tolerance)
```

**For Subset-Sum Matching:**
```
Bank Deposit:                IDR 450,000,000

Candidate settlement lines:
Line 1: IDR 120,000,000
Line 2: IDR 180,000,000
Line 3: IDR 150,000,000
Line 4: IDR  80,000,000

Solution: Line 1 + Line 2 + Line 3 = IDR 450,000,000 ✓
```

### 2.3 Time Windows & SLA Tracking

Each exception must have:
- `createdAt`: When exception was first detected
- `slaDue`: When SLA expires based on severity
- `severity`: Critical (4h) | High (24h) | Medium (3 days) | Low (5 days)
- `escalationLevel`: 0 (unassigned) | 1 (analyst) | 2 (team lead) | 3 (controller)
- `escalationHistory`: Array of escalation events

---

## Phase 3: UI Components (Priority: HIGH)

### 3.1 Exception Detail Modal

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ Exception Detail: BC-20260606-001                      [X]  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ [HEADER SECTION]                                            │
│ Type: Unmatched Bank Credit    Priority: HIGH    Age: 2d 4h│
│ Amount: SGD 284,000    PSP: GrabPay    Status: Open         │
│                                                              │
│ [DIAGNOSTIC RESULTS]                                        │
│ ✓ Window Search: PSP file expected 07 Jun 06:00           │
│ ○ Fuzzy Match: No candidates within tolerance              │
│ ○ Aggregate Sum: No combinations found                     │
│ ✓ Duplicate Check: No duplicates detected                  │
│                                                              │
│ [NEXT BEST ACTION]  ⭐ Confidence: 94%                      │
│ → Auto-hold and re-attempt match on file arrival           │
│                                                              │
│ Expected file: GrabPay-SGD-Daily-20260607.csv              │
│ Due: 07 Jun 2026 06:00 (in 18 hours)                       │
│                                                              │
│ [ACTION BUTTONS]                                            │
│ [✓ Confirm Hold]  [⚠ Manual Override]  [↗ Escalate]       │
│                                                              │
│ [FINANCIAL BREAKDOWN] (if applicable)                       │
│ Gross: SGD 290,000                                          │
│ - PSP Fee (2.0%): SGD 5,800                                │
│ - FX Variance: SGD 200                                      │
│ = Net: SGD 284,000 ✓                                        │
│                                                              │
│ [RELATED RECORDS]                                           │
│ Bank Credit: BC-20260606-001 | SGD 284,000 | 06 Jun 08:30 │
│ Expected PSP File: GrabPay-20260607 | Due 07 Jun 06:00    │
│                                                              │
│ [AUDIT TRAIL]                                               │
│ 06 Jun 09:00 | System | Exception created                  │
│ 06 Jun 09:01 | System | Diagnostic completed               │
│ 06 Jun 09:01 | System | NBA: Hold recommended             │
│ 06 Jun 10:30 | Analyst Kim | Confirmed hold action        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Action Panel Component

Different actions for each NBA outcome:

**Hold & Retry:**
- [Confirm Hold] → Sets timer, auto-retry
- [Manual Investigation] → Assign to analyst

**Propose Match:**
- [Accept Match] → Creates link, posts GL
- [Reject Match] → Back to queue
- [Modify Match] → Opens adjustment form

**Escalate:**
- [Escalate to Team Lead] → Level 2
- [Generate PSP Inquiry] → Creates ticket

**Auto-Clear:**
- [Confirm Auto-Clear] → Applies journals
- [Review Details] → Shows breakdown

### 3.3 Financial Breakdown Component

Waterfall visualization:
```
Gross SGD 100,000 ──┐
                    ├─ MDR (2.5%) → SGD 2,500
                    ├─ GST on MDR → SGD 175
                    ├─ FX (0.3%) → SGD 300
                    └─ Net SGD 98,025 ✓
```

---

## Phase 4: Action Implementation (Priority: HIGH)

### 4.1 Action Handlers

```typescript
interface ExceptionAction {
  confirmHold(exceptionId: string, holdUntil: Date): Promise<void>
  acceptProposedMatch(exceptionId: string, matchDetails: any): Promise<void>
  rejectMatch(exceptionId: string, reason: string): Promise<void>
  escalate(exceptionId: string, level: number, notes: string): Promise<void>
  autoConfirm(exceptionId: string): Promise<void>
  manualInvestigate(exceptionId: string, assignTo: string): Promise<void>
  generatePSPInquiry(exceptionId: string, template: string): Promise<void>
  writeOff(exceptionId: string, glCode: string, reason: string): Promise<void>
  reclassify(exceptionId: string, newType: string): Promise<void>
}
```

### 4.2 State Transitions

```
open → held → matched → closed
  ↓      ↓       ↓        ↓
escalated ← ← ← ← ← ← ← ← ←
  ↓
controller_review → written_off
```

---

## Phase 5: Validation & Test Cases (Priority: CRITICAL)

### 5.1 Test Cases per Exception Type

**Exception 1: Unmatched Bank Credit**
- Test A: PSP file arrives → Auto-retry → Match succeeds
- Test B: Fuzzy match within tolerance → Accept → GL posted
- Test C: Aggregate sum correct → Confirm → Link records
- Test D: Known pattern → Auto-classify → Close
- Test E: Duplicate → Flag → Reverse entry

**Exception 3: Amount Mismatch**
- Test A: Variance fully explained by fees → Auto-clear
- Test B: Partial explanation → Split variance
- Test C: Micro-variance → Round to FX GL
- Test D: Systematic fee drift → Alert finance team

### 5.2 Mathematical Validation

For each exception with financial calculations:
- Gross - Fees - FX = Net (must balance)
- Subset-sum solutions must equal target ±tolerance
- FX rates applied correctly
- Rounding rules per currency (IDR to 100, VND to 1000)

### 5.3 Edge Cases

- Exception created Friday 5pm → SLA due Monday 9am (skip weekend)
- Multi-currency exception (charge USD, settle SGD)
- Cross-entity match (transaction in Entity A, settlement in Entity B)
- Prior period adjustment (closed accounting period)

---

## Phase 6: Audit Trail & Compliance (Priority: MEDIUM)

### 6.1 Audit Log Requirements

Every action logged:
```typescript
{
  timestamp: "2026-06-06T10:30:45Z",
  actor: "analyst1",
  actorName: "Analyst Kim",
  action: "confirm_hold",
  exceptionId: "BC-20260606-001",
  systemRecommendation: "hold_and_retry",
  humanAction: "confirm_hold",
  isOverride: false,
  overrideReason: null,
  beforeState: { status: "open", owner: null },
  afterState: { status: "held", owner: "analyst1" }
}
```

### 6.2 Override Tracking

When analyst chooses different action than NBA:
```typescript
{
  isOverride: true,
  overrideReason: "PSP confirmed file won't arrive, manual match required",
  riskLevel: "medium"
}
```

---

## Implementation Timeline (for Thursday Demo)

### Day 1 (Today - 8 hours)
- ✅ Hours 1-2: Design data model, interfaces
- ✅ Hours 3-5: Create realistic dataset (50+ exceptions across 11 types)
- ✅ Hours 6-8: Build exception detail modal

### Day 2 (Tomorrow - 8 hours)
- ✅ Hours 1-3: Implement NBA action system
- ✅ Hours 4-6: Add financial breakdown component
- ✅ Hours 7-8: Wire up actions to state management

### Day 3 (Wednesday - 6 hours)
- ✅ Hours 1-3: Create validation test suite
- ✅ Hours 4-5: Test all exception flows
- ✅ Hour 6: Demo prep & polish

---

## Success Criteria

1. **Depth of Coverage**:
   - All 11 exception types demonstrated
   - At least 2 diagnostic outcomes per type shown

2. **Mathematical Accuracy**:
   - All financial breakdowns balance
   - Subset-sum matches are correct
   - Fee calculations accurate

3. **Interactive Flow**:
   - Click exception → See diagnostic → Take action → See result
   - Audit trail updates in real-time

4. **Visual Polish**:
   - Enterprise theme consistent
   - Clear visual hierarchy
   - Responsive design

5. **Demo Story**:
   - "Here's an unmatched credit..."
   - "System ran diagnostics..."
   - "Recommends holding for PSP file..."
   - "Analyst confirms..."
   - "Exception resolves automatically when file arrives"

---

## Data Volume for Demo

- **Total exceptions**: 60-70 (up from current 47)
- **Distribution**:
  - Exception 1 (Unmatched Credit): 12 → 15
  - Exception 2 (Unmatched Order): 8 → 10
  - Exception 3 (Amount Mismatch): 19 → 20
  - Exception 4 (Subset-Sum): 0 → 5
  - Exception 5 (Duplicate): 0 → 3
  - Exception 6 (Late Adjustment): 0 → 4
  - Exception 7 (Chargeback): 0 → 6
  - Exception 8 (Refund Mismatch): 0 → 5
  - Exception 9 (Missing File): 0 → 2
  - Exception 10 (Orphaned Reversal): 3 → 4
  - Exception 11 (Commission): 0 → 3

- **Severity breakdown**:
  - Critical: 6 (10%)
  - High: 18 (30%)
  - Medium: 32 (53%)
  - Low: 4 (7%)

- **Status distribution**:
  - Open: 45
  - Held: 12
  - Escalated: 6
  - Under Investigation: 7

This shows a realistic operations scenario with active exception management.
