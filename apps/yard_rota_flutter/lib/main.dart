import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app.dart';
import 'core/local_db/app_local_database.dart';
import 'core/network/supabase_api_client.dart';
import 'core/network/supabase_config.dart';
import 'core/platform/device_capabilities.dart';
import 'core/theme/home_wallpaper_storage.dart';
import 'core/theme/theme_mode_storage.dart';

Future<void> main() async {
  final binding = WidgetsFlutterBinding.ensureInitialized();

  final views = binding.platformDispatcher.views;
  if (views.isNotEmpty && DeviceCapabilities.isPhone(views.first)) {
    await SystemChrome.setPreferredOrientations(<DeviceOrientation>[
      DeviceOrientation.portraitUp,
    ]);
  }
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);

  await Supabase.initialize(
    url: SupabaseConfig.url,
    anonKey: SupabaseConfig.anonKey,
  );

  final localDb = await AppLocalDatabase.openDefault();
  final initialThemeMode = await readSavedThemeMode();
  final initialLightWallpaper = await readSavedLightHomeWallpaper();
  final initialDarkWallpaper = await readSavedDarkHomeWallpaper();

  runApp(
    YardRotaApp(
      apiClient: SupabaseApiClient(Supabase.instance.client),
      localDb: localDb,
      initialThemeMode: initialThemeMode,
      initialLightHomeWallpaper: initialLightWallpaper,
      initialDarkHomeWallpaper: initialDarkWallpaper,
    ),
  );
}
