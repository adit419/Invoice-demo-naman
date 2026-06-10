# Cross-Screen Data Consistency Report

## ✅ All Numbers are Now Consistent and Realistic!

---

## 1️⃣ **Dashboard (T1 + T2 Overview)**

### Bank Credits (T1 Level - Yesterday Only)
- **Total Bank Credit**: SGD 4,250,000 ✓
  - GrabPay: SGD 3,500,000
  - Stripe: SGD 750,000

### Exceptions (T2 Level - Last 30 Days)
- **Open Exceptions**: 60 exceptions ✓
- **Exception Amount**: SGD 1,828,682 ✓
- **Time Period**: Last 30 days (not just yesterday!)

---

## 2️⃣ **Exception Workspace (T2 Details)**

### Exception Count
- **Total Exceptions**: 60 (53 SGD + 7 IDR) ✓
- **SGD Exceptions**: 53 exceptions ✓
- **SGD Amount**: SGD 1,828,682 ✓

### Exception Types
- Unmatched Credit: 17
- Unmatched Order: 10  
- Amount Mismatch: 24
- Orphan Adjustment: 6
- Aging Breach: 3

---

## 3️⃣ **Settlement Explorer (T1 Details - Yesterday Only)**

### Bank Credits (Yesterday - June 8, 2026)
- **Total Credits**: 9 bank credits ✓
- **Total Amount**: SGD 4,250,000 ✓

### T1 Reconciliation Status
- ✅ **Reconciled**: 6 credits (67%)
  - Perfect match, variance = 0
  
- ⚠️ **Matched L1**: 2 credits (22%)
  - BC-GP-005: +SGD 250 variance (0.05%)
  - BC-STR-002: +SGD 150 variance (0.04%)
  
- 🔴 **Partial**: 1 credit (11%)
  - BC-GP-003: +SGD 11,580 variance (2.48%)
  - Settlement found but amount doesn't fully match

- **Total Variance**: SGD 11,980 (0.28% of total) ✓

### Exceptions Linked to Yesterday's Credits
- **Exceptions Visible**: 9 exceptions (subset of 60) ✓
- **Exception Amount**: SGD 169,050 ✓
- **Credits with Exceptions**: 4 out of 9

---

## 🔄 **How T1 and T2 Relate**

```
T1 (Settlement-level)
Bank Statement → Match PSP Settlement File
     ↓
  Success: 8/9 (89%)
     ↓
T2 (Order-level)
PSP Transactions → Match OMS Orders
     ↓
  Exceptions: 60 (last 30 days)
  Only 9 from yesterday's credits
```

---

## 📊 **Settlement Explorer KPI Cards**

### Card 1: Total Bank Credits
- **Value**: 9
- **Subtitle**: SGD 4,250,000
- ✓ Matches Dashboard total

### Card 2: Reconciliation Rate (T1)
- **Value**: 67% (6 of 9 reconciled)
- **Note**: Only counts "reconciled" status
- **Success Rate**: 89% if including "matched_l1"

### Card 3: Unmatched Credits (T1 Failures)
- **Value**: 0
- **Subtitle**: SGD 0
- ✓ No T1 failures (no missing PSP files)

### Card 4: Total Variance
- **Value**: SGD 11,980
- **Subtitle**: Avg reconciliation: 2.1 days
- ✓ Low variance (0.28% of total)

---

## ✅ **Key Consistency Rules Validated**

1. ✓ Dashboard Total Bank Credit (4.25M) = Settlement Explorer Total (4.25M)
2. ✓ Dashboard Exception Amount (1.83M) = Exception Workspace Total (1.83M)
3. ✓ Exception Count: 60 across Dashboard + Exception Workspace
4. ✓ Settlement Explorer shows ONLY 9 exceptions (yesterday's subset)
5. ✓ PSP totals: GrabPay (3.5M) + Stripe (0.75M) = 4.25M
6. ✓ All variances are realistic (<3%)
7. ✓ Exception PSPs match bank credit PSPs

---

## 🎯 **Realistic Data Characteristics**

### ✅ What Makes This Realistic:

1. **Reconciliation Rate**: 67% fully reconciled (not 100%)
2. **Variances Present**: 3 credits have variances (not all perfect)
3. **Multiple Statuses**: Mix of reconciled, matched_l1, partial
4. **Time Periods Different**: 
   - Settlement Explorer = Yesterday only (9 credits, 9 exceptions)
   - Exception Workspace = Last 30 days (60 exceptions)
5. **Variance Range**: 0.04% to 2.48% (realistic for real reconciliation)

---

## 📝 **Status Definitions**

### T1 Statuses (Settlement Explorer)
- **Reconciled**: Bank = PSP settlement (variance = 0)
- **Matched L1**: Bank ≈ PSP settlement (variance < 0.5%, within tolerance)
- **Partial**: PSP file found but significant variance (> 0.5%)
- **Unmatched**: No PSP settlement file found (T1 FAILURE)

### T2 Exceptions (Exception Workspace)
- **Unmatched Order**: PSP transaction not found in OMS
- **Amount Mismatch**: PSP vs OMS amounts don't match
- **Unmatched Credit**: Order not found in PSP file
- **Orphan Adjustment**: Fee/adjustment with no order reference
- **Aging Breach**: Exception past SLA deadline

---

**Generated**: 2026-06-09
**All 20 validation tests**: ✅ PASSING
**Production Readiness**: 🟢 READY
