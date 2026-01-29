# ShiftDashboard Refactoring Plan

## Current Status
- **File:** `src/components/User/ShiftDashboard.jsx`
- **Lines:** 1,481
- **Complexity:** High - multiple views, complex logic, many useEffects

## Recommended Split

### 1. Extract Helper Functions (Easy Win)
**New file:** `src/utils/shiftHelpers.js`

Move these pure functions:
- `calculateEndTime()`
- `getNightSortValue()`
- `toMinutes()`
- `getNowMinutes()`
- `getShiftProgressFor()`
- `getMinutesLeft()`
- `getMinutesElapsed()`
- `isNowWithinShift()`
- `getMinutesUntilStart()`
- `formatDuration()`
- `getBreakProgressFor()`

**Benefit:** ~100 lines removed, functions testable

---

### 2. Extract Data Fetching Logic
**New file:** `src/hooks/useShiftData.js`

Create custom hook:
```jsx
export function useShiftData(user) {
  const [shift, setShift] = useState(null);
  const [allShifts, setAllShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // Fetch logic here
  }, [user]);
  
  return { shift, allShifts, loading };
}
```

**Benefit:** ~200 lines removed, reusable hook

---

### 3. Extract Team Schedule View
**New file:** `src/components/User/TeamScheduleView.jsx`

Move the entire team schedule rendering (lines ~830-1200):
- Location tabs
- Shift type grouping
- User list rendering
- Progress bars

**Props needed:**
- `allShifts`
- `allBreaks`
- `teamLocation`
- `setTeamLocation`
- `selectedShifts`
- `user`

**Benefit:** ~370 lines removed

---

### 4. Extract Shift Card Component
**New file:** `src/components/User/ShiftCard.jsx`

Current shift display (lines ~1208-1479):
- Shift header
- Progress bar
- Next break info
- Time remaining

**Props needed:**
- `shift`
- `isActive`
- `progress`
- `nextBreak`

**Benefit:** ~270 lines removed

---

### 5. Extract Break Schedule View
**New file:** `src/components/User/BreakScheduleView.jsx`

Breaks listing (currently mixed in team view):
- My breaks section
- Team breaks by shift
- Break time calculations

**Props needed:**
- `breakInfo`
- `user`
- `currentDate`

**Benefit:** ~200 lines removed

---

## Proposed File Structure

```
src/
├── components/
│   └── User/
│       ├── ShiftDashboard.jsx (main orchestrator ~300 lines)
│       ├── TeamScheduleView.jsx (team shifts/breaks)
│       ├── ShiftCard.jsx (individual shift display)
│       └── BreakScheduleView.jsx (breaks listing)
├── hooks/
│   ├── useShiftData.js (data fetching)
│   └── useBreakData.js (break calculations)
└── utils/
    └── shiftHelpers.js (pure functions)
```

---

## Implementation Steps

### Phase 1 (Low Risk - 1-2 hours)
1. ✅ Extract pure helper functions to `utils/shiftHelpers.js`
2. ✅ Create tests for helper functions
3. ✅ Update imports in ShiftDashboard

### Phase 2 (Medium Risk - 2-3 hours)
4. ✅ Create `useShiftData` hook
5. ✅ Create `useBreakData` hook
6. ✅ Refactor ShiftDashboard to use hooks
7. ✅ Test data fetching works correctly

### Phase 3 (Higher Risk - 3-4 hours)
8. ✅ Extract ShiftCard component
9. ✅ Extract BreakScheduleView component
10. ✅ Extract TeamScheduleView component
11. ✅ Update ShiftDashboard to orchestrate components
12. ✅ Full integration testing

---

## Testing Checklist

After each phase:
- [ ] No console errors
- [ ] Shifts display correctly
- [ ] Breaks display correctly
- [ ] Team schedule works
- [ ] Location filters work
- [ ] Shift filters work
- [ ] Progress bars animate
- [ ] Time calculations accurate
- [ ] No performance regression

---

## Rollback Plan

If issues occur:
1. Keep original `ShiftDashboard.jsx` as `ShiftDashboard.backup.jsx`
2. Test each phase separately
3. Can rollback to any phase if needed
4. Use Git branches for safety

---

## Estimated Time
- **Phase 1 (Helpers):** 1-2 hours
- **Phase 2 (Hooks):** 2-3 hours  
- **Phase 3 (Components):** 3-4 hours
- **Testing:** 1-2 hours
- **Total:** 7-11 hours

---

## Priority
- **When:** During next major refactoring sprint
- **Why:** Improves maintainability but requires careful testing
- **Risk:** Medium - touching critical component used daily
- **Benefit:** High - much easier to maintain and test

---

## Notes
- Do NOT attempt during production hotfix
- Do in separate feature branch
- Get code review before merging
- Consider pair programming for Phase 3
- Add comprehensive tests first

---

## Current Decision
**Status:** Plan created, implementation DEFERRED

**Reason:** 
- Requires 7-11 hours of focused work
- Medium risk to critical component
- Should be done in dedicated sprint
- Current focus is on quick performance wins

**Next Steps:**
- Complete other performance optimizations first
- Schedule dedicated refactoring sprint
- Set up proper test coverage before refactoring
