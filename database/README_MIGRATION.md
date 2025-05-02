# Applying the slot_configurations Migration

This migration adds a `slot_configurations` table to the database to support persistently saving brake slot capacity settings.

## Migration Steps

1. Log in to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Create a new query
4. Copy the contents of `slot_configurations_migration.sql` into the editor
5. Run the query

## What This Migration Does

The migration creates:

1. A new `slot_configurations` table with these columns:
   - `id` - The slot ID (matching the frontend format)
   - `shift_type` - The shift type (day, afternoon, night)
   - `break_type` - The break type (break1, break2, night, custom, etc.)
   - `start_time` - The start time of the slot (HH:MM format)
   - `duration` - The duration in minutes
   - `capacity` - The slot capacity (default: 2)
   - `created_at` - Timestamp when created
   - `updated_at` - Timestamp when updated

2. An index for faster lookups by shift type

3. Row Level Security (RLS) policies to:
   - Allow all authenticated users to view slot configurations
   - Allow only admin users to modify slot configurations

## Troubleshooting

If you encounter any errors when running the migration:

1. Check for syntax errors in the SQL script
2. Ensure the `update_modified_column()` function exists before creating the trigger
3. Verify that the admin role policy is correctly configured for your specific setup

If the `admin_role` check in the policy doesn't match your current role system, modify it before running the migration.

# Applying the add_profile_extended_fields Migration

This migration adds new fields to the `profiles` table to support better slot assignment in Rota Planner.

## Migration Steps

1. Log in to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Create a new query
4. Copy the contents of `add_profile_extended_fields.sql` into the editor
5. Run the query

## What This Migration Does

The migration adds these fields to the `profiles` table:

1. `custom_start_time` (time, nullable) - Preferred start time for shifts
2. `custom_end_time` (time, nullable) - Preferred end time for shifts
3. `preferred_location` (text, nullable) - Location preference (e.g., "Main Hub", "NRC", "Both")
4. `max_daily_hours` (integer, nullable) - Maximum daily work hours (e.g., 8, 10, 12)
5. `unavailable_days` (text[], nullable) - Days when unavailable (e.g., ['Sunday', 'Saturday'])
6. `notes_for_admin` (text, nullable) - Additional notes for administrators

It also refreshes the RLS policies to ensure they work with the new fields.

## Troubleshooting

If you encounter any errors when running the migration:

1. Check if any of the columns already exist in the table
2. Verify that the user running the migration has the necessary permissions
3. Ensure the table name is correct in your environment 