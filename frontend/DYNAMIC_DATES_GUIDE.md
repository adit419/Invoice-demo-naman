# Dynamic Mock Dates - Demo Guide

## The Problem You Identified

You're absolutely right - **hardcoded dates make demos look stale**. When presenting on Thursday:
- Dashboard shows "Today" but displays data from June 6-7
- Exception ages show "0d 4h" but were created days ago
- pastSLA flags are incorrect because SLA deadlines have passed
- The demo looks like old, non-functional data

## The Solution: Dynamic Date Calculation

We've implemented a **dynamic date system** that makes all mock data relative to the current date.

### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  MOCK DATA (exceptionsEnhanced.ts, mockData.ts)            │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Exception BC-20260607-001                             │ │
│  │   createdAt: '2026-06-07T08:30:00Z'  ← Stored as ISO │ │
│  │   slaDue: '2026-06-08T08:30:00Z'                     │ │
│  │   age: '0d 4h'                       ← Outdated!     │ │
│  │   pastSLA: false                     ← May be wrong  │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  EXCEPTION SERVICE (enrichException function)               │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ function enrichException(exception) {                 │ │
│  │   return {                                            │ │
│  │     ...exception,                                     │ │
│  │     age: calculateAge(exception.createdAt),           │ │
│  │     pastSLA: isPastSLA(exception.slaDue)             │ │
│  │   }                                                   │ │
│  │ }                                                     │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  RETURNED TO UI (always current)                            │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Exception BC-20260607-001                             │ │
│  │   createdAt: '2026-06-07T08:30:00Z'                  │ │
│  │   slaDue: '2026-06-08T08:30:00Z'                     │ │
│  │   age: '5d 3h'                       ← Calculated!   │ │
│  │   pastSLA: true                      ← Accurate!     │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Key Insight:** Mock data stores the dates, but the **service layer calculates** age and pastSLA on every retrieval based on the current time.

---

## For Thursday's Demo: Two Options

### OPTION 1: Live Mode (RECOMMENDED)

**Let the system update automatically based on actual current date.**

**Configuration:** Already set up! Just run the app.

**File:** `src/cash-app-v2/utils/mockDateHelpers.ts`
```typescript
export const getMockReferenceDate = (): Date => {
  // Uses actual current date
  return new Date()  // ← Already configured
}
```

**What Happens:**
- If you demo on **June 12**, all exception ages calculate from June 12
- Exception created on "June 7" will show age: "5d Xh"
- Exceptions with 24h SLA from June 7 will show pastSLA: true
- Dashboard "Today" metrics match actual current date

**Pros:**
- ✅ No configuration needed
- ✅ Data looks completely realistic
- ✅ Works for any demo date

**Cons:**
- ⚠️ Ages increase by 1 day each day you practice
- ⚠️ More exceptions become overdue over time

---

### OPTION 2: Frozen Demo Date

**Lock the demo to a specific date so data stays consistent during practice runs.**

**Configuration:** Edit `src/cash-app-v2/utils/mockDateHelpers.ts`

**Before (Live Mode):**
```typescript
export const getMockReferenceDate = (): Date => {
  return new Date()  // Live mode
}
```

**After (Frozen Mode):**
```typescript
export const getMockReferenceDate = (): Date => {
  // Frozen to Thursday June 12, 2026 at 12:00 PM
  return new Date('2026-06-12T12:00:00Z')
}
```

**What Happens:**
- All calculations use June 12, 2026 as "today"
- Exception ages stay consistent across practice runs
- Dashboard always shows same data
- Perfect for rehearsing exact talking points

**Pros:**
- ✅ Consistent data for practice
- ✅ Can rehearse exact numbers
- ✅ Screenshots won't become outdated

**Cons:**
- ⚠️ Must remember to set the frozen date
- ⚠️ If demo is on a different day, need to update

---

## What Gets Calculated Dynamically

### 1. Exception Age

**Field:** `exception.age`

**Calculation:**
```typescript
const now = getMockReferenceDate()  // Today
const created = new Date(exception.createdAt)
const diffMs = now - created

const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

return `${days}d ${hours}h`  // e.g., "2d 4h"
```

**Example:**
```
If today is June 12, 2026 10:00 AM:
  Exception created: June 10, 2026 6:00 AM
  Age: "2d 4h"

If today is June 13, 2026 10:00 AM:
  Same exception
  Age: "3d 4h"  ← Updated automatically!
```

---

### 2. Past SLA Flag

**Field:** `exception.pastSLA`

**Calculation:**
```typescript
const now = getMockReferenceDate()
const sla = new Date(exception.slaDue)
return now > sla  // true if overdue
```

**Example:**
```
Exception created: June 10, 2026 6:00 AM
Priority: high (24h SLA)
SLA Due: June 11, 2026 6:00 AM

If today is June 11, 2026 5:00 AM:
  pastSLA: false  ✅ Within SLA

If today is June 12, 2026 10:00 AM:
  pastSLA: true   ⚠️ OVERDUE by 1d 4h
```

---

### 3. Dashboard KPIs

**Fields that update:**
- `pastSLAExceptions` - Count of exceptions where now > slaDue
- "Last Updated" timestamp (if displayed)

**Static fields** (from mockDashboardKPIs):
- `openExceptions: 54` - Total count
- `exceptionAmountSGD` - Total amounts
- `coveragePct`, `touchlessRate` - These are snapshots

**Note:** Dashboard KPIs like "Open Exceptions (Current)" are labeled "(Current)" to indicate they're cumulative totals, not daily snapshots.

---

## Verification: Test Before Demo

### Quick Test

1. **Check current behavior:**
   ```bash
   npm run dev
   ```

2. **Open Exception Workspace**
   - Look at exception ages
   - Note which are marked pastSLA (red warning)

3. **Change reference date to tomorrow:**
   ```typescript
   // In mockDateHelpers.ts
   const tomorrow = new Date()
   tomorrow.setDate(tomorrow.getDate() + 1)
   return tomorrow
   ```

4. **Refresh browser**
   - All ages should increase by 1 day
   - More exceptions should be pastSLA

5. **Revert back to live mode**

---

## Demo Day Checklist

### Before the Demo (Thursday Morning)

- [ ] **Decide: Live or Frozen mode?**
  - Live: No changes needed ✅
  - Frozen: Edit `mockDateHelpers.ts` with demo date

- [ ] **Run verification:**
  ```bash
  node update-mock-dates.js
  ```
  This shows you what ages will display

- [ ] **Check exception workspace:**
  - Ages look current? ✅
  - pastSLA flags make sense? ✅
  - Dashboard "Today" metrics visible? ✅

- [ ] **Practice run:**
  - Open 2-3 enhanced exceptions
  - Verify ages display correctly
  - Check NBA recommendations show properly

### During the Demo

**Key talking points about date handling:**

1. **"This is a live system"**
   - "Notice the exception ages are relative to today"
   - "These were created 2 days ago, 5 hours ago, etc."

2. **"Real-time SLA tracking"**
   - "The red indicators show exceptions past their SLA"
   - "This one has been open for 3 days on a 24-hour SLA"

3. **"Dynamic diagnostics"**
   - "The system calculated this should auto-resolve in 9.5 hours"
   - "Based on the expected PSP file arrival time"

---

## Troubleshooting

### Issue: All exceptions show "0d 0h" age

**Cause:** Exception service not calling `enrichException()`

**Fix:**
```typescript
// In exceptions.mock.ts
async getExceptions(...): Promise<Exception[]> {
  // Make sure you're enriching!
  let enriched = allExceptions.map(enrichException)  // ← This line
  // ... rest of filtering
  return enriched
}
```

---

### Issue: Ages are way off (e.g., showing negative or huge numbers)

**Cause:** Mock data has future dates or very old dates

**Fix:** Check `createdAt` dates in mock files. They should be recent (within last week).

```typescript
// Bad:
createdAt: '2025-01-01T08:30:00Z'  // Too old

// Good:
createdAt: '2026-06-07T08:30:00Z'  // Recent date
```

---

### Issue: pastSLA seems random

**Cause:** `slaDue` doesn't match `priority` SLA window

**Fix:** Verify SLA due dates:
- High priority: createdAt + 24 hours
- Medium priority: createdAt + 72 hours
- Low priority: createdAt + 7 days

---

### Issue: Dashboard shows different date than exceptions

**Cause:** Dashboard might have its own date display

**Fix:** Make sure TopBar or Header also uses `getMockReferenceDate()` for "today" display.

---

## Advanced: Adding New Mock Exceptions

When adding new exceptions, follow this pattern:

```typescript
import { generateCreatedAt, calculateSLADue } from '../utils/mockDateHelpers'

{
  id: 'BC-20260612-999',
  type: 'unmatched_credit',
  priority: 'high',

  // Create exception "2 days ago at 10am"
  createdAt: generateCreatedAt(2, 10),

  // SLA is auto-calculated based on priority (24h for high)
  slaDue: calculateSLADue(new Date(generateCreatedAt(2, 10)), 'high'),

  // Don't set age or pastSLA - service calculates these!
  age: '2d 2h',    // ← Remove this, calculated dynamically
  pastSLA: false,  // ← Remove this, calculated dynamically
}
```

---

## Files Modified for Dynamic Dates

1. **`src/cash-app-v2/utils/mockDateHelpers.ts`** ✨ NEW
   - Reference date configuration
   - Date calculation helpers
   - Age and pastSLA calculation

2. **`src/cash-app-v2/services/mock/exceptions.mock.ts`** ✏️ UPDATED
   - Added `enrichException()` function
   - Calls enrichException before returning data
   - Calculates age and pastSLA dynamically

3. **`update-mock-dates.js`** ✨ NEW
   - Verification script
   - Shows what ages will display
   - Documentation tool

4. **`DYNAMIC_DATES_GUIDE.md`** ✨ NEW
   - This guide

---

## Summary

**Problem:** Hardcoded dates make demos look stale ❌

**Solution:** Dynamic calculation based on current date ✅

**How it works:**
1. Mock data stores `createdAt` and `slaDue` as ISO strings
2. Service layer calculates `age` and `pastSLA` on retrieval
3. Use `getMockReferenceDate()` to control "today"

**For Thursday:**
- **Live mode:** Just run the app (already configured) ✅
- **Frozen mode:** Set demo date in `mockDateHelpers.ts`

**Verification:**
```bash
node update-mock-dates.js
```

**Result:** Demo always looks current, regardless of presentation date! 🎉

---

**Questions? Check the troubleshooting section or test with different reference dates.**
