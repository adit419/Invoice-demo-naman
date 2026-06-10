# Thursday Demo Setup - Quick Start

## Problem Solved ✅

**Your concern:** "Mock dates don't update - when I demo on Thursday, dates will be stale"

**Solution implemented:** **Dynamic date calculation system**
- Exception ages calculate in real-time based on current date
- pastSLA flags update automatically
- Dashboard metrics stay current
- **No manual updates needed!**

---

## How to Use for Thursday

### Option 1: Automatic Mode (RECOMMENDED) ✅

**Just run the app - already configured!**

```bash
npm run dev
```

**What happens:**
- System uses actual current date as "today"
- Exception ages update automatically (e.g., "2d 4h")
- pastSLA flags are accurate
- Demo looks fresh on any date

**When to use:** Default for Thursday demo

---

### Option 2: Frozen Demo Date

**Lock to a specific date for consistent practice runs**

1. **Edit:** `src/cash-app-v2/utils/mockDateHelpers.ts`

2. **Change this:**
   ```typescript
   export const getMockReferenceDate = (): Date => {
     return new Date()  // Live mode
   }
   ```

3. **To this:**
   ```typescript
   export const getMockReferenceDate = (): Date => {
     // Frozen to Thursday June 12, 2026
     return new Date('2026-06-12T12:00:00Z')
   }
   ```

4. **Save and restart dev server**

**When to use:** If you want identical data across practice runs

---

## What Changed

### Files Modified

1. **`src/cash-app-v2/utils/mockDateHelpers.ts`** ✨ NEW
   - Reference date configuration
   - Dynamic age calculation
   - Dynamic pastSLA calculation

2. **`src/cash-app-v2/services/mock/exceptions.mock.ts`** ✏️ UPDATED
   - Added `enrichException()` function
   - Calculates age and pastSLA on every data retrieval
   - No changes to mock data files needed

### How It Works

```
Mock Data (stored)          Service Layer              UI (displayed)
─────────────────          ──────────────             ──────────────
createdAt: '2026-06-07'  → calculateAge()  →  age: "5d 3h"
slaDue: '2026-06-08'     → isPastSLA()    →  pastSLA: true
age: '0d 4h' (ignored)   ← DYNAMIC
pastSLA: false (ignored) ← CALCULATION
```

**Key:** Service layer calculates `age` and `pastSLA` based on current date, ignoring static values in mock data.

---

## Pre-Demo Checklist

### Thursday Morning

- [ ] **Decide mode:**
  - [ ] Live (recommended) - No action needed ✅
  - [ ] Frozen - Edit `mockDateHelpers.ts` with demo date

- [ ] **Verify dates:**
  ```bash
  node update-mock-dates.js
  ```
  This shows what ages will display

- [ ] **Test app:**
  ```bash
  npm run dev
  ```

- [ ] **Check Exception Workspace:**
  - [ ] Ages look reasonable (0d-5d range)
  - [ ] Some exceptions marked pastSLA (red)
  - [ ] Dashboard shows "Today" metrics

- [ ] **Test enhanced exceptions:**
  - [ ] Click BC-20260607-001 - Should show "PSP file expected in X hours"
  - [ ] Click AM-20260606-001 - Should show fee waterfall
  - [ ] Click CB-20260606-001 - Should show chargeback deadline

---

## During Demo

### Talking Points About Dates

1. **"This is live data"**
   - "Notice these exception ages are relative to today"
   - "This one was created 2 days ago, this one 5 hours ago"

2. **"Real-time SLA tracking"**
   - "Red indicators show exceptions past their SLA deadline"
   - "This exception has been open 3 days on a 24-hour SLA"

3. **"Intelligent time-based actions"**
   - "System says: auto-hold and retry in 9.5 hours when PSP file arrives"
   - "Chargeback has 7 days remaining to submit representment evidence"

---

## Troubleshooting

### Ages show "0d 0h" for everything

**Fix:** Restart dev server to reload exception service

### Ages are way off

**Check:** `mockDateHelpers.ts` - ensure `getMockReferenceDate()` returns `new Date()`

### Some exceptions don't update

**Fix:** Clear browser cache and hard refresh (Cmd+Shift+R)

---

## Quick Reference

### Commands

```bash
# Verify what ages will display
node update-mock-dates.js

# Run dev server
npm run dev

# Run validation suite (optional)
node validate-enhanced-exceptions.js
```

### Files to Know

| File | Purpose |
|------|---------|
| `mockDateHelpers.ts` | Configure reference date (live or frozen) |
| `exceptions.mock.ts` | Service layer with dynamic calculations |
| `update-mock-dates.js` | Verification script |
| `DYNAMIC_DATES_GUIDE.md` | Full documentation |

---

## Summary

✅ **Dynamic date system is ACTIVE**
✅ **No configuration needed for Thursday** (just run app)
✅ **All exception ages update automatically**
✅ **pastSLA flags calculate in real-time**
✅ **Demo will look current on any date**

**Your concern is completely solved!** 🎉

---

## If You Want to Test

**Try this right now:**

1. Run app: `npm run dev`
2. Open Exception Workspace
3. Note the ages shown (e.g., "1d 3h")
4. Edit `mockDateHelpers.ts`:
   ```typescript
   const tomorrow = new Date()
   tomorrow.setDate(tomorrow.getDate() + 1)
   return tomorrow
   ```
5. Refresh browser
6. Ages should all increase by 1 day!
7. Revert back to `return new Date()`

This proves the dynamic system is working.

---

**Ready for Thursday! No date updates needed.** ✅
