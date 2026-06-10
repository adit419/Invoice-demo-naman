# T1 and T2 Reconciliation Scenarios

## 📚 Complete Scenario Coverage in Settlement Explorer

---

## ✅ **Scenario 1: Perfect Match (T1 ✓ + T2 ✓)**

### Example: BC-GP-08JUN26-004
```
T1 (Settlement-level):
Bank: SGD 497,109 = PSP: SGD 497,109 ✓ MATCH
Status: ✅ Reconciled
Variance: 0

T2 (Order-level):
All 2,100 orders matched perfectly ✓
Exceptions: 0
```

**What this means**:
- Money is correct ✓
- All paperwork matches ✓
- No action needed ✓
- Perfect scenario!

---

## ⚠️ **Scenario 2: T1 ✓ but T2 has Exceptions**

### Example: BC-GP-08JUN26-001
```
T1 (Settlement-level):
Bank: SGD 487,350 = PSP: SGD 487,350 ✓ MATCH
Status: ✅ Reconciled
Variance: 0

T2 (Order-level):
2,000 orders total
├─ 1,997 matched ✓
└─ 3 exceptions ✗
    ├─ Order-001: Amount mismatch (OMS: 100, PSP: 98)
    ├─ Order-502: Amount mismatch (OMS: 50, PSP: 52)
    └─ Order-890: Amount mismatch (OMS: 85, PSP: 85.50)
```

**What this means**:
- Money is correct ✓ (cash flow reconciled)
- Settlement total matches ✓
- But 3 individual orders need investigation ⚠️

**Why can T1 pass while T2 has exceptions?**
Because T1 compares Bank vs PSP (same data source on both sides)
While T2 compares OMS vs PSP (different data sources)

**Common causes**:
- Customer changed order after payment authorization
- Tips/fees added at PSP level
- Currency conversion differences
- Promotional discounts applied differently
- Offsetting errors (errors cancelled out in total)

**Action Required**:
- Finance: Can post to GL ✓
- Operations: Investigate the 3 orders
- May need refunds or additional charges

---

## ⚠️ **Scenario 3: Matched with Small Variance (T1 ~ Match)**

### Example: BC-GP-08JUN26-005
```
T1 (Settlement-level):
Bank: SGD 477,615.00
PSP:  SGD 477,365.00
Variance: SGD 250 (0.05%) ⚠️

Status: ⚠️ Matched L1 (within tolerance)
```

**What this means**:
- Small variance within acceptable range (< 0.5%)
- Likely due to:
  - Rounding differences
  - FX conversion precision
  - Bank fees
  - Timing differences

**Action Required**:
- Auto-approve if within tolerance threshold
- Post variance to "Reconciliation Variance" GL account
- No manual investigation needed for such small amounts

---

## 🔴 **Scenario 4: Partial Match (T1 Variance > Tolerance)**

### Example: BC-GP-08JUN26-003
```
T1 (Settlement-level):
Bank: SGD 467,880.00
PSP:  SGD 456,300.00
Variance: SGD 11,580 (2.48%) 🔴

Status: 🔴 Partial
```

**What this means**:
- Bank credit received ✓
- PSP file found ✓
- But amounts don't match (variance > tolerance)
- Variance too large to auto-approve

**Common causes**:
- Multiple settlements batched incorrectly
- Some orders excluded from settlement
- Reserve holdback calculation error
- Fee miscalculation

**Action Required**:
- Find the missing SGD 11,580
- Review PSP settlement file in detail
- Check if another settlement is pending
- May need to adjust or create manual journal entry

---

## 🔴 **Scenario 5: T1 FAILURE - Unmatched Credit**

### Example: BC-GP-08JUN26-006
```
T1 (Settlement-level):
Bank: SGD 491,280.13 received ✓
PSP:  ??? NO FILE FOUND ✗

Status: 🔴 UNMATCHED (T1 FAILURE)
Variance: SGD 491,280.13 (100%)
Confidence: 0%
```

**What this means**:
- ⚠️ CRITICAL: Money received but can't find PSP settlement file!
- Can't match to any PSP settlement
- Can't perform T2 (no PSP file to compare against OMS)
- **High-priority investigation required**

**Common causes**:
1. **PSP file delayed/missing**:
   - PSP hasn't sent the settlement file yet
   - File sent to wrong email/SFTP folder
   - File corrupted or rejected by system

2. **Wrong PSP mapping**:
   - Bank narration says "GrabPay" but might be different PSP
   - PSP changed their remittance naming convention
   - New PSP sub-entity not configured

3. **Manual transfer**:
   - PSP sent ad-hoc payment (refund, chargeback recovery)
   - Reserve release not documented
   - Fee recovery or bonus payment

4. **Bank error**:
   - Wrong reference in bank statement
   - Duplicate credit
   - Credit from different date/entity

**Action Required** (HIGH PRIORITY):
1. **Contact PSP immediately**:
   - Request settlement file for this amount
   - Verify payment reference
   - Check if payment was intentional

2. **Check file repositories**:
   - Search SFTP folders for missing file
   - Check email attachments
   - Review file ingestion logs

3. **Cross-check with Finance**:
   - Was this an expected payment?
   - Any manual arrangements with PSP?
   - Check reserves/holdbacks schedule

4. **Temporary GL posting**:
   - Post to "Unidentified Credits" suspense account
   - Cannot recognize revenue until matched
   - Risk: Audit finding if not resolved

**This is the MOST CRITICAL scenario** - represents lost audit trail!

---

## 📊 **Settlement Explorer Distribution (Current)**

| Status | Count | % | Amount (SGD) | Severity |
|--------|-------|---|--------------|----------|
| ✅ Reconciled | 5 | 56% | 2,488,453 | ✅ Good |
| ⚠️ Matched L1 | 2 | 22% | 861,829 | ⚠️ Minor |
| 🔴 Partial | 1 | 11% | 467,880 | 🔴 Review |
| 🔴 Unmatched | 1 | 11% | 491,280 | 🔴 URGENT |
| **Total** | **9** | **100%** | **4,250,000** | |

---

## 🎯 **Key Takeaways**

### T1 (Settlement-level) focuses on:
- **CASH**: Did the money arrive?
- **PSP FILE**: Can we find the settlement file?
- **Question**: Bank amount vs PSP settlement amount

### T2 (Order-level) focuses on:
- **DETAILS**: Do individual orders match?
- **REVENUE**: Can we recognize the revenue?
- **Question**: PSP transactions vs OMS orders

### Important:
- ✅ T1 can pass while T2 has exceptions (very common!)
- 🔴 T1 can fail (unmatched) making T2 impossible (critical!)
- ⚠️ Both levels need monitoring and resolution

---

**Generated**: 2026-06-09
**Scenarios Covered**: All 5 T1/T2 combinations ✓
