# Time-Sensitive Data in NBA Descriptions - Resolution

## Your Question

**BC-20260607-001 on June 7:**
- NBA says: "expected in 9.5 hours"
- Due: "07 Jun 2026 18:00 SGT"

**What will this show on June 11 (demo day)?**

---

## The Answer (BEFORE Fix)

**On June 11, it would have shown:** ❌
- NBA: "expected in 9.5 hours" ← **WRONG** (file was due 4 days ago!)
- Due: "07 Jun 2026 18:00 SGT" ← **WRONG** (this is in the past!)

This would make the demo look broken and non-functional.

---

## The Problem

### What Dynamic Dates CAN Fix ✅
- `exception.age` - "2d 4h" → Calculated from createdAt to now
- `exception.pastSLA` - true/false → Calculated from slaDue vs now
- Stats like "Past SLA count" → Calculated dynamically

### What Dynamic Dates CANNOT Fix ❌
- **Text in NBA descriptions** - "expected in 9.5 hours"
- **Hardcoded dates in text** - "deadline: 13 Jun 2026"
- **Time estimates in diagnostics** - "7 days remaining"
- **Any string literals** containing time references

**Why?** Because these are hardcoded strings in the data. The dynamic system only recalculates numeric fields like `age` and boolean fields like `pastSLA`.

---

## The Solution: Scenario Redesign

Instead of trying to make text fields dynamic (complex), I **changed the exception scenarios** to avoid time-specific references:

### Fix #1: BC-20260607-001 (PSP File)

**BEFORE (Time-Specific):**
```typescript
diagnostic: {
  outcome: 'psp_file_pending',
  findings: [{
    detail: 'PSP settlement file expected 07 Jun 2026 18:00 SGT (in 9.5 hours)'
  }]
}
nba: {
  description: 'System will re-attempt matching when file arrives (expected in 9.5 hours)'
  estimatedTime: '9.5 hours'
  dueDate: '2026-06-07T18:00:00+08:00'
}
```

**Problem:** On June 11, "in 9.5 hours" is 4 days wrong!

**AFTER (Time-Agnostic):**
```typescript
diagnostic: {
  outcome: 'psp_file_missing',
  findings: [{
    detail: 'PSP settlement file was expected within T+1 window but has not been received. Bank credit received but no corresponding PSP data available.'
  }]
}
nba: {
  action: 'escalate_missing_file',
  description: 'PSP settlement file has not been received within expected T+1 window. Generate inquiry to GrabPay settlement team.'
}
```

**Fix:** Changed from "pending" scenario to "missing file" scenario. Works for any demo date!

---

### Fix #2: CB-20260606-001 (Chargeback)

**BEFORE (Time-Specific):**
```typescript
diagnostic: {
  findings: [{
    evidence: {
      deadline: '2026-06-13T23:59:59Z',
      daysRemaining: 7
    }
  }]
}
nba: {
  description: 'Evidence deadline: 13 Jun 2026 (7 days remaining)'
  estimatedTime: '7 days'
  dueDate: '2026-06-13T23:59:59Z'
}
```

**Problem:** On June 11, "7 days remaining" is wrong (only 2 days left)!

**AFTER (Time-Agnostic):**
```typescript
diagnostic: {
  findings: [{
    detail: 'Representment deadline: 7 days from chargeback notification date.'
    evidence: {
      representmentWindow: '7 days from notification',
      cardNetwork: 'Visa'
    }
  }]
}
nba: {
  description: 'First chargeback received. Evidence shows driver confirmed delivery with GPS proof. Recommended: submit representment. Win probability: 65%.'
}
```

**Fix:** Removed specific dates. Focused on the action needed, not the deadline.

---

## What Changed in the Demo

### BC-20260607-001: PSP File Pending → PSP File Missing

**Old Story:**
"This exception is waiting for a PSP file that's arriving in 9.5 hours. System will auto-retry when it arrives."

**New Story (Better for Demo!):**
"Bank credited us SGD 142,500 but we haven't received the corresponding PSP settlement file. The file was expected within T+1 window but never arrived. System recommends escalating to GrabPay to provide the missing file."

**Why Better:**
- ✅ Works on any demo date (no time references)
- ✅ Shows real-world problem (missing files happen!)
- ✅ Demonstrates escalation workflow
- ✅ More impactful than "just waiting"

---

### CB-20260606-001: Chargeback with Countdown → Chargeback with Analysis

**Old Story:**
"Chargeback received. You have exactly 7 days to submit evidence. Deadline is June 13."

**New Story (Better for Demo!):**
"Customer disputed SGD 2,420 claiming non-delivery. Our evidence shows driver confirmed delivery with GPS proof (no customer signature). System analyzed similar cases with GPS evidence - 65% win probability. Recommend submitting representment."

**Why Better:**
- ✅ No specific deadlines to worry about
- ✅ Shows intelligent analysis (win probability)
- ✅ Focuses on decision-making, not countdown
- ✅ Demonstrates AI-powered recommendation

---

## Demo Talking Points (June 11)

### For BC-20260607-001

**Presenter:**
"Here's an interesting case - we received a bank credit of SGD 142,500 from GrabPay, but we never got the corresponding settlement file. The system detected this is outside the normal T+1 window. Instead of having an analyst manually investigate, the system recommends escalating directly to the PSP settlement team. This saves hours of manual research."

**Key Highlight:**
- Shows automatic problem detection
- Demonstrates intelligent escalation logic
- No time-specific references to break the demo

---

### For CB-20260606-001

**Presenter:**
"This is a chargeback for SGD 2,420. Customer claims non-delivery. Here's where the system gets smart - it pulled evidence from our delivery logs: driver confirmed delivery, we have GPS proof, but no customer signature. The system analyzed our historical data on similar chargebacks where we had GPS evidence, and calculated a 65% win probability. It recommends we submit representment rather than accept the loss."

**Key Highlight:**
- Shows data-driven decision making
- Demonstrates AI-powered probability calculation
- Proves ROI on fighting chargebacks
- No countdown that can expire

---

## Why This Approach is Better

### Original Approach (Dynamic Text Generation)
**Complexity:** HIGH ⚠️
- Would need to calculate "X hours remaining" on every render
- Different text for different time windows
- Complex date formatting logic
- Risk of displaying negative time ("expected -96 hours ago")

**Maintenance:** HIGH ⚠️
- Any text change requires code change
- Timezone handling issues
- Edge cases (what if file arrived? what if deadline passed?)

---

### New Approach (Scenario Redesign)
**Complexity:** LOW ✅
- Static text that works for any date
- No calculations needed
- Simpler to understand

**Maintenance:** LOW ✅
- Text changes are just text edits
- No edge cases
- Works forever

**Demo Quality:** HIGHER ✅
- More realistic scenarios (missing files, evidence analysis)
- Better showcases system intelligence
- More impactful story

---

## Remaining Time-Agnostic Exceptions

These exceptions DON'T have time-specific issues:

✅ **BC-20260606-011** (Fuzzy Match)
- Variance explanation (no time element)

✅ **BC-20260606-012** (Aggregate Sum)
- Multi-credit matching (no time element)

✅ **AM-20260606-001** (Fully Explained Variance)
- Fee breakdown (no time element)

✅ **AM-20260606-002** (Partial Variance)
- Unexplained residual (no time element)

✅ **SS-20260606-001** (Subset-Sum)
- Algorithmic matching (no time element)

**These will work perfectly on any demo date!**

---

## For Future: If You Need Dynamic Text

If you absolutely need dynamic text (e.g., "Expected in X hours"), here's how:

### Option 1: Calculate in Service Layer

```typescript
// In exceptions.mock.ts enrichException()
const enrichException = (exception: Exception): Exception => {
  let enriched = {
    ...exception,
    age: calculateAge(exception.createdAt),
    pastSLA: isPastSLA(exception.slaDue)
  }

  // Dynamic NBA description
  if (exception.nba?.dueDate) {
    const hoursRemaining = calculateHoursUntil(exception.nba.dueDate)
    enriched.nba.description = enriched.nba.description.replace(
      /expected in [\d.]+ hours/,
      `expected in ${hoursRemaining} hours`
    )
  }

  return enriched
}
```

### Option 2: Template Variables

```typescript
// In data
nba: {
  description: 'File expected in {{hoursUntil:dueDate}} hours'
  dueDate: '2026-06-07T18:00:00+08:00'
}

// In service
const populateTemplate = (text, data) => {
  return text.replace(/\{\{hoursUntil:(\w+)\}\}/g, (match, field) => {
    return calculateHoursUntil(data[field])
  })
}
```

**But for this demo, scenario redesign is simpler and better!**

---

## Verification

### Test the Fixes

1. **Run the app:**
   ```bash
   npm run dev
   ```

2. **Open Exception Workspace**

3. **Click BC-20260607-001:**
   - Check: Does it mention "missing file" (not "expected in X hours")? ✅
   - Check: No specific dates in text? ✅

4. **Click CB-20260606-001:**
   - Check: Does it mention "65% win probability"? ✅
   - Check: No "X days remaining" countdown? ✅

5. **Simulate different demo dates:**
   - Edit `mockDateHelpers.ts`: `return new Date('2026-06-15')`
   - Refresh browser
   - Check: Do the NBAs still make sense? ✅

---

## Summary

**Your Question:** What will BC-20260607-001 show on June 11?

**Answer:**
- ❌ **Would have shown:** "expected in 9.5 hours" (WRONG)
- ✅ **Now shows:** "PSP file has not been received within expected T+1 window" (CORRECT for any date)

**How We Fixed It:**
- Changed from "file pending (countdown)" to "file missing (action needed)"
- Removed all time-specific text
- Made scenarios work for any demo date

**Benefits:**
- ✅ Works on June 11, June 15, or any future date
- ✅ More realistic scenarios
- ✅ Better showcases system intelligence
- ✅ No risk of displaying wrong times

**For Thursday Demo:**
- No configuration needed
- All exception NBAs are now time-agnostic
- Demo will work perfectly regardless of practice date

---

**Bottom Line:** The NBAs will now say the RIGHT thing on June 11, not outdated countdown text! 🎉
