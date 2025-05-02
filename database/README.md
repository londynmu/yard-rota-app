# Yard Rota App Database Setup

## Supabase Setup Instructions

1. **Create a Supabase project**:
   - Go to [Supabase](https://supabase.com/) and create an account or sign in
   - Create a new project with a name of your choice
   - Note your project URL and API key (you'll need these later)

2. **Set up the database schema**:
   - Navigate to the SQL Editor in your Supabase dashboard
   - Copy and paste the contents of `schema.sql` into the SQL editor
   - Run the queries to set up your tables, indexes, and security policies

3. **Add sample data (optional)**:
   - Navigate to the SQL Editor in your Supabase dashboard
   - Create a new user via Authentication → Users
   - Copy the UUID of the newly created user
   - Edit the `seed.sql` file, replacing `your-user-id-here` with the actual UUID 
   - Run the modified seed queries to add test data

4. **Configure your application**:
   - Create a `.env` file in the root of your project with the following content:
   ```
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```
   - Replace the placeholders with your actual Supabase project URL and anonymous key

## Database Schema

### Availability Table
Stores user availability information:

- `id`: Unique identifier (UUID)
- `user_id`: References the authenticated user (UUID)
- `date`: The date for the availability record
- `status`: One of 'available', 'unavailable', or 'holiday'
- `comment`: Optional text field for additional notes
- `created_at`: Timestamp when the record was created
- `updated_at`: Timestamp when the record was last updated

## Security

The database uses Row Level Security (RLS) policies to ensure that:
- Users can only view, insert, update, and delete their own availability records
- Authentication is required for all operations on the availability table 

## Database Roles and Permissions

The database has the following roles with their respective permissions:

### Administrator Access
- User with ID `ede8d4bd-faff-48af-9145-56f24e86d0f2` has `service_role` and `is_super_admin=true`
- This provides full administrative access to the application

### System Roles
| Role Name | Super User | Inherit | Create Role | Can Login |
|-----------|------------|---------|-------------|-----------|
| authenticated | false | true | false | false |
| anon | false | true | false | false |
| service_role | false | true | false | false |
| supabase_admin | true | true | true | true |
| authenticator | false | false | false | true |
| pgbouncer | false | true | false | true |
| supabase_auth_admin | false | false | true | true |
| supabase_storage_admin | false | false | true | true |
| supabase_replication_admin | false | true | false | true |
| supabase_read_only_user | false | true | false | true |
| postgres | false | true | true | true |

These roles are critical for security management and should not be altered without careful consideration. 