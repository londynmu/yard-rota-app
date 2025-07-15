# Yard Rota App

## Overview
Mobile-friendly application for managing employee shift schedules, designed with simplicity and efficiency in mind.

## Key Features
- Employee shift scheduling and management
- Location and agency management
- Admin notification system
- CSV and PDF schedule exports
- Weekly schedule view with shift breakdown
- Employee break management with user-based permissions
- Self-assignment to available shifts by employees
- Secure break management (users can only manage their own breaks)

## Administrative Tools

### Logout All Users Script

This script allows you to log out all users from the Yard Rota app by terminating their Supabase sessions. Useful when implementing authentication changes, profile requirements, or other features requiring re-login.

#### Prerequisites

- Node.js 14+ 
- Supabase Service Role key

#### Available Versions

Two versions are available:
1. **logout-all-users.js** - ES Modules version (for Node.js 14+)
2. **logout-all-users-commonjs.js** - CommonJS version (compatible with all Node.js versions)

#### Setup Instructions

1. **Create a .env file** in the same directory as the script with your Supabase key:
   ```
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
   ```
   
   You can find the key in the Supabase dashboard: Project Settings > API > Project API keys

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run the script** using one of these methods:

   **Option 1: Using npm scripts**
   ```bash
   # CommonJS version (recommended)
   npm run logout
   
   # Or choose a specific version
   npm run logout-cjs    # CommonJS version
   npm run logout-esm    # ES Modules version
   ```
   
   **Option 2: Direct execution**
   ```bash
   # ES Modules version
   node logout-all-users.js
   
   # CommonJS version
   node logout-all-users-commonjs.js
   ```

#### Script Functionality

1. Connects to your Supabase instance using the service role key
2. Retrieves all users from the Supabase auth system
3. Terminates all sessions for each user
4. Provides a summary of successful and failed logout attempts

#### Security Notes

The service role key has administrator privileges and should be protected. Never commit the `.env` file to version control.

#### Troubleshooting

If you encounter errors:
- Verify the SUPABASE_SERVICE_ROLE_KEY in your `.env` file
- Ensure you have appropriate Supabase permissions
- Check your Node.js version (should be 14+)
- If syntax errors occur, try the CommonJS version
- Ignore linter errors regarding 'require' or 'process'

## Recent Changes

### January 2025
- **Fixed time format display in custom break slots (2025-01-13):** Fixed the inconsistent time format display in custom break slots. Previously, custom slots showed time with seconds (20:00:00 - 21:00) while standard slots showed clean format (20:00 - 21:00). Added time formatting function to ensure all slots display time consistently in HH:MM format without seconds.
  - Modified files: `src/components/Admin/Brakes/BrakesManager.jsx`
- **Fixed custom slot creation error in Breaks (2025-01-13):** Fixed the "null value in column 'id' violates not-null constraint" error when creating custom break slots. The issue was caused by trying to upsert records where some had IDs and others didn't. Split the operation into separate insert (for new slots) and update (for existing slots) operations to handle the database constraints properly.
  - Modified files: `src/components/Admin/Brakes/BrakesManager.jsx`
- **Auto-navigate to today's date in Rota Planner page (2025-01-13):** Implemented automatic navigation to today's date when entering the Rota Planner page. The system checks if it's a new visit to the rota planner page (first time or different day) and automatically sets the date selector to today's date. This saves time by eliminating the need to manually change the date to today when planning shifts for the current day.
  - Modified files: `src/components/Admin/Rota/RotaManager.jsx`
- **Auto-navigate to today's date in Breaks page (2025-01-13):** Implemented automatic navigation to today's date when entering the Breaks page. The system checks if it's a new visit to the breaks page (first time or different day) and automatically sets the date selector to today's date. This saves time by eliminating the need to manually change the date to today when planning breaks for the current day.
  - Modified files: `src/components/Admin/Brakes/BrakesManager.jsx`

### May 2024
- **Added User Day Notes System (2024-05-28):** Implemented a new feature allowing users to leave notes about specific days (like early departure requests) that managers will see when assigning shifts. This helps prevent overlooking important availability information during scheduling. The system includes:
  - User profile section for adding/managing day notes
  - Confirmation modal that appears when attempting to assign a user who has a note for that day
  - Backend storage and management of user notes with appropriate security controls
  - New files: `src/components/Admin/Rota/UserNoteModal.jsx`, `supabase/migrations/20250528120000_create_user_day_notes.sql`
  - Modified files: `src/components/Admin/Rota/AssignModal.jsx`, `src/pages/UserProfile.jsx`
- **Added Templates functionality in Rota Planner (2024-05-28):** Implemented a template system in Rota Planner allowing administrators to save the current day's slot configuration as a named template and apply it to other days. This speeds up schedule creation by reusing common patterns instead of recreating them manually each time. Templates are stored in the database and accessible via a dedicated modal with both "Save Current Layout" and "Apply Template" tabs.
  - New files: `src/components/Admin/Rota/TemplateModal.jsx`, `supabase/migrations/20250510112711_create_rota_templates.sql`
  - Modified files: `src/components/Admin/Rota/RotaManager.jsx`
- **New centralized notification system (2024-05-09):** Implemented `ToastContext` and `Toast.jsx` component providing modern, animated notifications displayed in the center of the screen with background blur effect. Messages disappear after 2 seconds and are globally available throughout the application (injected in `main.jsx`).
  - New files: `src/components/ui/ToastContext.jsx`, `src/components/ui/Toast.jsx`
  - Modified files: `tailwind.config.js` (added `fade-scale` animation), `src/main.jsx`, `src/components/Admin/Rota/RotaManager.jsx`
- **AssignModal – Other Locations tab (2024-05-09):** Added new tab displaying all employees from other locations (including unavailable ones). Updated filtering logic and mobile/desktop view.
  - Modified files: `src/components/Admin/Rota/AssignModal.jsx`
- **Assign Task – automatic field reset (2024-05-09):** After assigning an employee, the "Assign Task" field is automatically cleared and the suggestion list closed.
  - Modified files: `src/components/Admin/Rota/AssignModal.jsx`
- **Export & Send Weekly Schedule split into 4-step wizard (2024-05-09):** Redesigned `ExportRota.jsx` component – now users progress through sequential steps: (1) week selection and data retrieval, (2) CSV/PDF file download, (3) agency selection, (4) email message editing and sending. Added progress bar and Back/Next buttons. The file generation logic and mailto: opening remained unchanged.
- **Improved file download interface in Export & Send (2024-05-09):** Replaced browser's default download mechanism with a custom file download modal in `ExportRota.jsx`. Instead of automatic CSV/PDF downloads, users now see a stylized modal consistent with the rest of the application with a file download button.
- **Improved PDF download interface in My Rota (2024-05-09):** Replaced browser's default confirmation (confirm) after PDF download in My Rota view with a custom application-style modal. The new modal shows the downloaded file name, date range, and offers buttons to close or share via WhatsApp.
- **Unified PDF format in My Rota (2024-05-09):** Optimized the generated PDF format in My Rota view according to company standards. The PDF displays data in a clear table with employee names in rows and weekdays in columns. Changes include: simple time format (HH:MM-HH:MM), centered text in cells, task names under hours, headers with day names and dates, alternating row coloring, and page numbering footer.
- **Changed time display format to 24h (2024-05-09):** Modified time display format throughout the application from 12-hour (AM/PM) to 24-hour. The change covered TodaysShiftInfo and ShiftDashboard components, ensuring consistent time display format across the application.
  - Modified files: `src/components/User/TodaysShiftInfo.jsx`, `src/components/User/ShiftDashboard.jsx`
- **Improved night shift handling (2024-05-09):** Rebuilt time calculation logic in TodaysShiftInfo and ShiftDashboard components to correctly handle night shifts crossing midnight. Modified `isShiftNow`, `getShiftProgress`, and `getTimeRemaining` functions to properly calculate progress and remaining time for night shifts. Progress bar and "ACTIVE" status now work correctly for all shift types.
  - Modified files: `src/components/User/TodaysShiftInfo.jsx`, `src/components/User/ShiftDashboard.jsx`
- **Improved sharing modal in My Rota (2024-05-09):** Replaced native `confirm` dialog with a custom sharing format selection modal (text or PDF) in `My Rota` view on mobile devices. The new modal is visually consistent with the rest of the application.
  - Modified files: `src/pages/WeeklyRotaPage.jsx`
- **Improved date selection in schedule export (2024-05-09):** In "Export & Send Weekly Schedule" modal, default date is now set to the nearest Saturday. Additionally, only Saturdays can be selected in the calendar; other days are grayed out and inactive. Replaced standard `input[type="date"]` with `react-datepicker` component.
  - Modified files: `src/components/Admin/ExportRota.jsx`
- **Added calendar icon to DatePicker in export (2024-05-09):** In `ExportRota.jsx` component, added a visible calendar icon to the date selection field (`react-datepicker`), placed inside the field on the right side.
  - Modified files: `src/components/Admin/ExportRota.jsx`
- **Extended export modal and improved calendar (2024-05-09):** Increased export schedule modal size and improved calendar display to be fully visible. Calendar icon was changed to white for better visibility on dark background. Added CSS styles ensuring proper calendar display and clearly marking only Saturdays as available for selection.
  - Modified files: `src/components/Admin/ExportRota.jsx`

### June 2024
- **Added today's shift information widget (2024-06-20):** Implemented "Today's Shift" widget on the home page, showing detailed information about the user's shift scheduled for today. The widget displays start and end times, location, shift type, and status (active/inactive). For active shifts, it shows time remaining until completion and information about upcoming or ongoing breaks. The component automatically refreshes every 15 minutes and is fully responsive.
  - New files: `src/components/User/TodaysShiftInfo.jsx`
  - Modified files: `src/pages/CalendarPage.jsx`, `tailwind.config.js`
- **Added PDF sharing via WhatsApp (2024-06-17):** Added ability to generate and share schedule in PDF format via WhatsApp. The PDF contains an organized and formatted schedule in landscape orientation, divided by days and shift types. This feature allows recipients to more easily read and print schedules. Added two sharing buttons (text and PDF) on desktop and one button with options on mobile devices.
  - Modified files: `src/pages/WeeklyRotaPage.jsx`
- **Improved shift type filters in My Rota view (2024-06-16):** Modified shift type filter layout (day/afternoon/night) in My Rota view. Filters were moved to the same line as date navigation and location selection, improving interface ergonomics and allowing faster switching between different views.
  - Modified files: `src/pages/WeeklyRotaPage.jsx`
- **Added filtering by shift types (2024-06-16):** Added new tabs for filtering shifts by type (day/afternoon/night) in My Rota view on computers. This enables easy browsing of only selected shift types. User's choice is saved between sessions.
  - Modified files: `src/pages/WeeklyRotaPage.jsx`
- **Improved employee assignment view (2024-06-16):** Modified AssignModal interface to separate employees by shift preferences. Employees preferring the currently assigned shift are shown by default in the "Available" tab, and employees preferring other shifts are available in the new "Other Shifts" tab. This change facilitates assigning employees according to their preferences while maintaining the ability to assign any available employee.
  - Modified files: `src/components/Admin/Rota/AssignModal.jsx`
- **Removed Available Shifts functionality (2024-06-15):** Removed Available Shifts page and all related components. Self-assignment to shifts functionality has been temporarily disabled.
  - Modified files: `src/pages/AvailableShiftsPage.jsx` (removed), `src/components/HomePage.jsx` (removed navigation and routing)
- **Fixed self-assignment to available shifts (2024-06-14):** Corrected logic in `AvailableShiftsPage.jsx` in `handleClaimShift` function. Previously, the query for available records for employee assignment could return empty results, even if there were free slots marked as "available". The change verifies the main slot record status (if still `available`) first, then finds any matching record (date, location, time) with `user_id` set to `null`. This specific found record is then updated with the employee ID, and its status changed to `null` (as the slot is now occupied).
  - Modified files: `src/pages/AvailableShiftsPage.jsx`
- **Fixed slot "availability" status persistence (2024-06-14):** Corrected slot availability toggling logic in `RotaManager.jsx`. When a slot is marked as unavailable, all related records in the database (`scheduled_rota`) are updated (status to `null`). This ensures that status changes are properly reflected after page refresh. Previously, only one record was updated, which with slot grouping logic could lead to restoring "available" status if other related records still had that status.
  - Modified files: `src/components/Admin/Rota/RotaManager.jsx`
- **Improved slot availability toggling (2024-06-14):** Enhanced slot availability toggling handling in `SlotCard.jsx` component. Added loading state (`isTogglingAvailability`) to prevent multiple clicks and visually signal the operation. Removed optimistic local state updates; the component now waits for backend confirmation (through `RotaManager.jsx`) before reflecting status change, ensuring UI consistency with server data.
  - Modified files: `src/components/Admin/Rota/SlotCard.jsx`, `src/components/Admin/Rota/RotaManager.jsx`
- **Added self-assignment to shifts (2024-06-13):** Implemented system allowing employees to self-assign to available shifts. Administrators can mark shifts as available for self-selection. Employees only see shifts that don't conflict with their existing schedule.
- **Multi-level sorting in Rota view (2024-06-12):** Enhanced sorting functionality in weekly view. Implemented three-level sorting system: 1) by start time, 2) by end time, 3) alphabetically by employee name.
- **Added Rugby/NRC tabs (2024-06-12):** Added separate tabs for Rugby and NRC locations on My Rota page. The system filters shifts by location, and the user's choice is saved between sessions.
- **Improved employee suggestions by end time (2024-06-11):** Enhanced employee suggestion logic, prioritizing people whose preferred end time matches the slot end time.
- **Fixed notification dropdown positioning (2024-06-11):** Improved notification dropdown interface.
- **Enhanced location management (2024-06-11):** Enriched interface with icon buttons and deletion functionality.
- **Added icons for mobile view (2024-06-11):** Replaced text buttons with intuitive icons.
- **Improved agency management interface (2024-06-11):** Enhanced interface with modern dialog windows and notifications.
- **Added agency deletion (2024-06-11):** Added ability to permanently delete agencies in the "Agencies" tab.
- **Added Locations tab (2024-06-11):** Created new "Locations" tab in the administrative panel.
- **Added Agencies tab (2024-06-11):** Created new "Agencies" tab in the administrative panel.
- **Added Breaks Config tab (2024-06-11):** Created new "Breaks Config" tab in the administrative panel.

## Break Management Security System

### Overview
The break management system has been enhanced with comprehensive security policies to prevent users from interfering with each other's breaks while maintaining full administrative control.

### Security Features

#### User Permissions
- **Own Breaks Only**: Regular users can only create, edit, and delete their own breaks
- **View All Breaks**: All users can view everyone's breaks for coordination and planning
- **Admin Override**: Administrators have full access to manage all breaks and system settings

#### Database Security (RLS Policies)
- **SELECT Policy**: All authenticated users can view all breaks
- **INSERT Policy**: Users can only insert breaks for themselves (admins can insert for anyone)
- **UPDATE Policy**: Users can only update their own breaks (admins can update any)
- **DELETE Policy**: Users can only delete their own breaks (admins can delete any)
- **Slot Management**: Only admins can create/modify custom slots and capacity settings

#### Frontend Security
- **Conditional UI**: Remove/edit buttons only appear for user's own breaks
- **Permission Checks**: All break operations validate user permissions before execution
- **Admin Controls**: Save, edit, and custom slot features restricted to admin users
- **Toast Notifications**: Clear feedback when permission is denied

#### Homepage Integration
- **No Shift Display**: Users not scheduled for today can still see team breaks
- **Shift-based Filtering**: Break display adapts to user's shift preference
- **Real-time Updates**: Break information refreshes automatically
- **Enhanced Loading States**: Clear feedback when loading breaks or when no breaks are scheduled
- **Improved Navigation**: Added "View Breaks" button for easier access to break management

### Implementation Details

#### Files Modified
- `supabase_breaks_security_policies.sql`: Database RLS policies
- `src/components/Admin/Brakes/BrakesManager.jsx`: Frontend permission checks
- `src/components/User/TodaysShiftInfo.jsx`: Homepage break display with enhanced UX

#### Database Policies Created
1. `Everyone can view all breaks` - SELECT for all authenticated users
2. `Users can insert their own breaks` - INSERT with user_id validation
3. `Users can update their own breaks` - UPDATE with user_id validation  
4. `Users can delete their own breaks` - DELETE with user_id validation
5. `Admins can manage break slot definitions` - Admin-only slot management

#### Recent Updates (2025-01-17)
- **Enhanced break visibility**: Improved display of team breaks on homepage for users without shifts
- **Better user feedback**: Added loading, error, and no-data states for break information
- **Improved debugging**: Added console logging to help troubleshoot break data issues
- **UI enhancements**: Added "View Breaks" button on homepage for easier navigation

This system ensures that employees can coordinate their breaks while preventing malicious interference, maintaining both security and usability.
- **Fixed slot sorting in Rota Planner (2024-06-11):** Corrected slot display order.