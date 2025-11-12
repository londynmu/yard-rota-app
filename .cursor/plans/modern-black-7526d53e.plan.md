<!-- 7526d53e-dabd-4bf8-861a-cf35b4193565 f9e1c720-37fe-4eb5-a49f-832be9343693 -->
# Aktualizacja Pozostałych Komponentów - Plan Szczegółowy

## Status: 55 plików wymaga aktualizacji

### ✅ Ukończone (Faza 0)

- ThemeContext.jsx + ThemeProvider
- ThemeToggle.jsx
- tailwind.config.js
- index.css
- HomePage.jsx (header, navigation, menu)
- LoginForm.jsx
- Auth.jsx (container)
- Modal.jsx

## Fazy Implementacji

### Faza 1: Auth Components (9 plików) - PRIORYTET 1

**1. RegisterForm.jsx**

- Match LoginForm: white inputs, black buttons
- Error messages: `bg-red-50 dark:bg-red-900/20`
- Success: `bg-green-50 dark:bg-green-900/20`

**2. ForgotPasswordForm.jsx**

- Copy LoginForm button/input styles
- Update background colors

**3. UpdatePasswordForm.jsx**

- Match form input styles
- Black submit button

**4-7. Remaining Auth files**

- ConfirmationMessage.jsx
- ProfileCompletion.jsx  
- ProfileRequiredCheck.jsx
- Profile.jsx
- ResetPassword.jsx (page)

**Wspólne zmiany Auth:**

```
bg-gradient → bg-cream dark:bg-gray-900
backdrop-blur-xl bg-black/60 → bg-white dark:bg-gray-800
border-white/30 → border-gray-200 dark:border-gray-700
text-white → text-charcoal dark:text-white
```

### Faza 2: Critical Pages (3 pliki) - PRIORYTET 1

**1. ProfilePage.jsx** (WAŻNE!)

Line 724: `bg-gradient-to-br from-black via-blue-900 to-green-500`

→ `bg-offwhite dark:bg-gray-900`

Line 726: `backdrop-blur-xl bg-black/60`

→ `bg-white dark:bg-gray-800`

Update wszystkie:

- Form inputs → white/gray standard
- Buttons → black primary style
- Borders → gray-200/gray-700
- Messages → bg-blue-50/bg-yellow-50

**2. AdminPage.jsx** (WAŻNE!)

Line 191: Background gradient → `bg-offwhite dark:bg-gray-900`

Line 192: Container → `bg-white dark:bg-gray-800`

Line 193-211: Tabs → Modern underline style

**3. CalendarPage.jsx**

- Background → offwhite/gray-900
- Calendar grid → white cards
- Keep availability colors (lighter shades)

### Faza 3: Other Pages (5 plików) - PRIORYTET 2

**1. WeeklyRotaPage.jsx**

- Update gradient backgrounds
- White cards for shifts
- Modern table styling

**2. RotaPlannerPage.jsx**

Line 103: Background → offwhite/gray-900

Line 104: Container → white/gray-800

**3-5. Remaining pages:**

- BrakesPage.jsx
- UserApprovalPage.jsx
- WaitingForApprovalPage.jsx

### Faza 4: Admin Components - Modals (8 plików) - PRIORYTET 2

All modals follow Modal.jsx style:

- UserEditForm.jsx
- AvailabilityEditModal.jsx
- Rota/AddSlotModal.jsx
- Rota/EditSlotModal.jsx
- Rota/TemplateModal.jsx
- Rota/UserNoteModal.jsx
- Rota/AssignModal.jsx
- Rota/TimePicker.jsx

**Standard modal updates:**

```
bg-gradient-to-b from-gray-800 to-gray-900 
→ bg-white dark:bg-gray-800

border-white/10 → border-gray-200 dark:border-gray-700
```

### Faza 5: Admin Components - Managers (8 plików) - PRIORYTET 2

**1. UserList.jsx**

- Table: `bg-white dark:bg-gray-800`
- Rows: `even:bg-gray-50 dark:even:bg-gray-750`
- Hover: `hover:bg-gray-100`

**2. RotaManager.jsx + SlotCard.jsx**

- Slot cards → white with gray borders
- Remove gradients
- Clean action buttons

**3-8. Config Managers:**

- SettingsManager.jsx
- AvailabilityManager.jsx
- AgencyManager.jsx (już częściowo done)
- LocationManager.jsx (już częściowo done)
- AgencyConfigManager.jsx
- LocationConfigManager.jsx
- BreaksConfigManager.jsx
- BrakesManager.jsx

### Faza 6: User Components (3 pliki) - PRIORYTET 3

**1. ShiftDashboard.jsx**

Line 412+: Update gradient backgrounds

- Container → white/gray-800
- Tabs → underline style
- Cards → subtle gray backgrounds

**2. TodaysShiftInfo.jsx**

Line 498: `bg-gradient-to-r` → keep accent color but use as border/accent bar

- Main card → white/gray-800
- Accent bar top → keep shift colors
- Text → charcoal/white

**3. MyBreakInfo.jsx**

- Similar to TodaysShiftInfo
- Clean card design

### Faza 7: Calendar Components (3 pliki) - PRIORYTET 3

**1. CalendarGrid.jsx**

- Grid cells → white/gray-800
- Borders → gray-200/gray-700
- Today → border-2 border-black
- Hover → bg-gray-50

**2. CalendarHeader.jsx**

- Clean navigation buttons
- Month selector styling

**3. AvailabilityDialog.jsx**

- Match Modal.jsx style
- Form inputs standard

### Faza 8: UI Components (5 plików) - PRIORYTET 3

**1. Toast.jsx**

```
Success: bg-white border-l-4 border-green-500
Error: bg-white border-l-4 border-red-500
Info: bg-white border-l-4 border-blue-500
Text: text-charcoal dark:text-white
```

**2. Notification.jsx**

- Similar to Toast
- Dropdown style

**3. Tooltip.jsx**

```
bg-black dark:bg-white
text-white dark:text-black
rounded-lg shadow-lg
```

**4. ConfirmDialog.jsx**

- Match Modal.jsx
- Danger button: `bg-red-500`

**5. NotificationBell.jsx**

- Badge: `bg-red-500` (keep)
- Dropdown → match user dropdown

### Faza 9: Pozostałe (3 pliki) - PRIORYTET 4

**1. App.jsx**

- Check if any styling needed
- Usually just routing

**2. UserProfile.jsx**

- Update if has styling

**3. LoginStats.jsx**

- Charts/stats styling
- Clean cards

## Standardy Kodowania

### Color Classes to Replace

```
USUŃ:
- bg-gradient-to-*
- backdrop-blur-*
- bg-black/60, bg-white/10
- border-white/30, border-white/20
- text-white/80, text-white/70
- from-black, via-blue-900, to-green-500
- from-blue-900/50, to-purple-900/50

ZAMIEŃ NA:
- bg-offwhite dark:bg-gray-900 (pages)
- bg-white dark:bg-gray-800 (cards)
- border-gray-200 dark:border-gray-700
- text-charcoal dark:text-white
- text-gray-600 dark:text-gray-400 (secondary)
```

### Button Pattern

```jsx
// Primary
bg-black dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 
text-white dark:text-black rounded-lg px-4 py-2 font-medium

// Secondary  
bg-transparent hover:bg-gray-100 dark:hover:bg-gray-700
border-2 border-black dark:border-white rounded-lg px-4 py-2

// Danger
bg-red-500 hover:bg-red-600 text-white rounded-lg px-4 py-2
```

### Input Pattern

```jsx
bg-white dark:bg-gray-700 
border border-gray-300 dark:border-gray-600 
rounded-lg px-3 py-2
text-charcoal dark:text-white
focus:border-black dark:focus:border-white 
focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20
```

### Card Pattern

```jsx
bg-white dark:bg-gray-800 
border border-gray-200 dark:border-gray-700 
rounded-lg shadow-sm p-4
```

## Testowanie

Po każdej fazie:

1. `npm run build` - sprawdź czy build działa
2. Sprawdź light mode
3. Sprawdź dark mode  
4. Test funkcjonalności
5. Check console errors

## Bezpieczeństwo

- NIE ZMIENIAJ: logic, state, props, funkcji, API calls
- ZMIENIAJ TYLKO: className, style CSS
- ZACHOWAJ: Wszystkie onClick, onChange, eventy
- TEST: Po każdej większej zmianie