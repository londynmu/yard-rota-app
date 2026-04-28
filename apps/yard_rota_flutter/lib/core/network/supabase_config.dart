class SupabaseConfig {
  const SupabaseConfig._();

  static const String url = String.fromEnvironment(
    'SUPABASE_URL',
    defaultValue: 'https://jkjvtvwedjiupxoibpld.supabase.co',
  );

  static const String anonKey = String.fromEnvironment(
    'SUPABASE_ANON_KEY',
    defaultValue:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpranZ0dndlZGppdXB4b2licGxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU0NDI0MDMsImV4cCI6MjA2MTAxODQwM30.J15XgpiHz-oKSghqctJ8Bll0BXdbKO_rexeav1lj8Gw',
  );
}
