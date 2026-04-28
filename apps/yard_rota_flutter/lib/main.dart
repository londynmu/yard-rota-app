import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app.dart';
import 'core/local_db/app_local_database.dart';
import 'core/network/supabase_api_client.dart';
import 'core/network/supabase_config.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Supabase.initialize(
    url: SupabaseConfig.url,
    anonKey: SupabaseConfig.anonKey,
  );

  final localDb = await AppLocalDatabase.openDefault();

  runApp(
    YardRotaApp(
      apiClient: SupabaseApiClient(Supabase.instance.client),
      localDb: localDb,
    ),
  );
}
