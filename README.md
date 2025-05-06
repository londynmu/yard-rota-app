# Yard Rota App - Logout All Users Script

This script allows you to log out all users from the Yard Rota application by terminating their Supabase sessions. This is useful when you need to make changes to authentication, profile requirements, or other features that require users to sign in again.

## Prerequisites

- Node.js 14+ installed
- Supabase Service Role Key (from your Supabase dashboard)

## Script Versions

Two versions of the script are provided:

1. **logout-all-users.js** - ES Modules version (for Node.js 14+)
2. **logout-all-users-commonjs.js** - CommonJS version (compatible with all Node.js versions)

Choose the version that's compatible with your Node.js setup.

## Setup Instructions

1. **Create a .env file** in the same directory as the script with your Supabase service role key:
   ```
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
   ```
   
   You can find this key in the Supabase dashboard under Project Settings > API > Project API keys

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run the script** using one of these methods:

   **Option 1: Using npm scripts**
   ```bash
   # Run the CommonJS version (recommended)
   npm run logout
   
   # Or explicitly choose a version
   npm run logout-cjs    # CommonJS version
   npm run logout-esm    # ES Modules version
   ```
   
   **Option 2: Running directly**
   ```bash
   # For ES Modules version
   node logout-all-users.js
   
   # For CommonJS version
   node logout-all-users-commonjs.js
   ```

## What the Script Does

1. Connects to your Supabase instance using the service role key
2. Fetches all users from your Supabase auth system
3. Terminates all sessions for each user individually
4. Provides a summary of successful and failed logout attempts

## Note About Process Timing

After running this script, all user sessions will be terminated. This is exactly what you need before implementing changes to fields that must be required during profile completion. Once users log back in, they will be prompted to complete their profiles with the new required fields.

## Security Warning

The service role key has admin privileges and should be kept secure. Never commit your `.env` file to version control.

## Troubleshooting

If you encounter errors:

- Make sure your `.env` file contains the correct SUPABASE_SERVICE_ROLE_KEY
- Check that you have the necessary permissions in Supabase
- Verify your Node.js version (should be 14+)
- If you get syntax errors, try using the CommonJS version of the script
- Ignore linter errors about 'require' or 'process' not being defined if using the script directly in Node.js

## Recent Changes (YYYY-MM-DD)

- **Reorganize Export Format by Location (2024-05-16):** Modified the CSV and PDF export functionality to organize data by location first, then by agency, then by staff. This provides clearer separation for each location and helps agency managers more easily identify which staff members are working at specific locations. The change affects both the `generateCSV` and `generatePDF` functions in the `ExportRota.jsx` component.
- **Improve Duplicate Slot Error Messages (2024-05-15):** Enhanced the error display in the Add Slot modal to show validation errors directly in the modal instead of in the background. Added helpful guidance when attempting to create duplicate slots, with specific tips on how to edit existing slots instead of creating duplicates.
- **Prevent Duplicate Slots (2024-05-15):** Added validation in the Add Slot functionality to prevent creating duplicate slots with the same location, shift type, start time and end time on the same day. The system now performs a direct database check before adding a new slot and displays an error message suggesting to edit the existing slot to adjust capacity instead of creating a duplicate.
- **Location Tabs in Rota Planner (2024-05-14):** Zastąpiono dropdown wyboru lokalizacji w RotaPlanner systemem zakładek (tabów). Każda aktywna lokalizacja ma teraz własną zakładkę, a strona pokazuje sloty tylko dla wybranej lokalizacji. System jest połączony z funkcją zarządzania lokalizacjami - nieaktywne lokalizacje są automatycznie ukrywane w zakładkach i formularzach dodawania/edycji slotów. W przypadku gdy lokalizacja staje się nieaktywna, aplikacja automatycznie wyświetla komunikat ostrzegawczy i wymaga wyboru aktywnej lokalizacji przy edycji slotów.
- **Remove Preferences Tab from Settings (2024-05-14):** Removed the Preferences tab from the Settings panel in the Admin Dashboard. Modified the SettingsManager.jsx component to remove the Preferences button from the navigation tabs and its corresponding content section. Also removed related state variables (theme and defaultView).
- **Remove Export Tab from Admin Dashboard (2024-05-14):** Removed the Export tab from the Admin Dashboard navigation. Modified the tab array in AdminPage.jsx and removed the corresponding tab content rendering. Also removed the unused ExportRota import.
- **Improve Email Format (2024-05-14):** Updated the email draft format in the Export schedule feature to match a standardized template. The email now has the subject "Weekly Shunters Schedule: [date range]" and a consistent body text with proper signature format.
- **Fix Email Sending Functionality (2024-05-14):** Fixed email sending functionality in the Export schedule feature. Instead of using Supabase functions (which were causing errors), the app now downloads both CSV and PDF files, then opens the user's default email client with a prepopulated draft containing the appropriate recipients, subject, and message body. Users can then manually attach the downloaded files to complete the email.
- **Fix PDF Generation Error (2024-05-14):** Fixed "W.autoTable is not a function" error when generating PDFs in mobile view. Updated jsPDF and jspdf-autotable import and initialization to improve compatibility. Changed from `import { jsPDF } from 'jspdf'` to `import jsPDF from 'jspdf'` and directly imported the autoTable plugin with `import autoTable from 'jspdf-autotable'`. Modified the autoTable function call to use the plugin directly rather than as a method on the doc object.
- **Fix Page Numbering in PDF (2024-05-14):** Fixed incorrect page numbering in generated PDFs. Pages now correctly show "Page X of Y" instead of "Page X of X".
- **Admin Notification System Fixes:** Fixed issues with the notification system that could cause blank screens. Improved error handling and made components more resilient to database variations. Added fallbacks for database column changes to ensure compatibility with different schema versions.
- **Admin Notification System:** Added a comprehensive notification system for administrators, featuring a notification bell in the header that displays counts of pending user approvals and notifications. The system includes a dropdown with details and links to the approval page. Real-time updates are provided through Supabase subscriptions.
- **Improved Shift Headers Visibility:** Enhanced the visibility of "DAY SHIFT", "AFTERNOON SHIFT", and "NIGHT SHIFT" headers in day cards by adding color-coding (yellow for day shifts, orange for afternoon shifts, blue for night shifts), background colors, and better spacing for improved readability on both desktop and mobile views.
- **Mobile/Week Header Update:** Nagłówek tygodnia w `WeeklyRotaPage.jsx` pokazuje teraz 'Week XX' (np. 'Week 18') bez dwukropka, zamiast zakresu dat. Dotyczy zarówno mobile, jak i desktop. Poprawia czytelność i zgodność z wymaganiami.
- **Mobile Day Card Collapse:** Implemented collapsible day cards for mobile view (`<md` breakpoint) in `WeeklyRotaPage.jsx`. Added state (`expandedDayMobile`), click handlers, and conditional rendering (`hidden md:block`, `block md:hidden`) to toggle `DayDetails`. Desktop view remains always expanded.
- **Style Shift Headers:** Changed the color of the "DAY SHIFT", "AFTERNOON SHIFT", "NIGHT SHIFT" headers within each day card (`h4` in `DayDetails` component, `src/pages/WeeklyRotaPage.jsx`) from blue to gray (`text-gray-400`, `border-gray-600`) for better visual separation of shift types.
- **Hide Unknown Users:** Added a filter in the `DayDetails` component (`src/pages/WeeklyRotaPage.jsx`) to hide scheduled shifts where the associated user profile (`slot.profiles`) could not be found (likely deleted users). This removes "Unknown User" entries from the rota view.
- **Improve Desktop Layout:** Removed the collapsible day view in `src/pages/WeeklyRotaPage.jsx`. All day cards are now always expanded on desktop. Added internal scrolling (`max-h` and `overflow-y-auto`) to the `DayDetails` component, allowing users to scroll through long lists of shifts within individual day cards without expanding the card's height indefinitely.
- **Fix Day Details Height:** Removed the fixed `max-h-[1000px]` limit on the collapsible day details container in `src/pages/WeeklyRotaPage.jsx`. Replaced it with `max-h-none` when expanded to allow the container to grow dynamically and display all scheduled shifts, even for days with many entries.
- **Highlight Current User Shifts:** Added visual distinction for the logged-in user's shifts in the `DayDetails` component (`src/pages/WeeklyRotaPage.jsx`). User's shifts now have a yellow background/border, and their name is highlighted with a 'You' tag.
- **Format Shift Times:** Updated the `DayDetails` component in `src/pages/WeeklyRotaPage.jsx` to display shift start and end times in HH:MM format (seconds removed).
- **Fix Rota Loading Error (Attempt 3 - Manual Join):** Refactored `fetchFullRota` in `src/pages/WeeklyRotaPage.jsx` to perform two separate Supabase queries (one for rota, one for profiles) and join the data manually in the frontend. This bypasses the persistent foreign key relationship error.
- **Fix Rota Loading Error (Attempt 2):** Modified the Supabase query again in `src/pages/WeeklyRotaPage.jsx` (`fetchFullRota` function). Changed the `select` statement syntax to `profiles!user_id(...)`.
- **Fix Rota Loading Error (Attempt 1):** Modified the Supabase query in `src/pages/WeeklyRotaPage.jsx` (`fetchFullRota` function). Changed the `select` statement from `profiles(...)` to `profiles:user_id(...)`.
- **Next Steps:** Verify the UI fixes.
- **Nowy wygląd nagłówka tygodnia:** Nagłówek tygodnia oraz strzałki nawigacji są teraz w jednej, zaokrąglonej ramce (`rounded-full`) z jednolitym tłem. Strzałki są integralną częścią ramki, całość wygląda nowocześnie i jest responsywna na mobile.
- **Optymalizacja widoku desktop:** Zmodyfikowano układ widoku tygodniowego w `src/pages/WeeklyRotaPage.jsx`, aby lepiej wykorzystać pełną szerokość ekranu komputera. Usunięto ograniczenia szerokości, dostosowano siatkę i zmniejszono marginesy. Zoptymalizowano również karty dni, aby lepiej wyświetlały się na pełnej szerokości.
- **Naprawa błędu 400 (get_pending_users):** Usunięto wywołanie nieistniejącej funkcji RPC `get_pending_users` w `src/pages/UserApprovalPage.jsx`. Dane pending users pobierane są bezpośrednio z tabeli `profiles`, co eliminuje błąd 400 i biały ekran podczas ładowania.
- **Aktualizacja tytułu aplikacji:** Zmieniono tytuł strony z "Shunters.net" na "My Rota" w `index.html` oraz w statycznym nagłówku w `src/components/HomePage.jsx`. To eliminuje wyświetlanie starej nazwy podczas przeładowania strony.