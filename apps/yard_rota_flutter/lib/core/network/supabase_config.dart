class SupabaseConfig {
  const SupabaseConfig._();

  // Prefer --dart-define. Hardcoded defaults kept until store builds always
  // pass SUPABASE_URL / SUPABASE_ANON_KEY.
  // TODO(#3 Wave D): remove defaultValue after Netlify/store env is confirmed;
  // do not rotate anon key in this PR.
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
