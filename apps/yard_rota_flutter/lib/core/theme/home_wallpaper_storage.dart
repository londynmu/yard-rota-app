import 'package:shared_preferences/shared_preferences.dart';

import 'home_wallpaper.dart';

const String _kLightWallpaperKey = 'app_light_home_wallpaper';
const String _kDarkWallpaperKey = 'app_dark_home_wallpaper';

LightHomeWallpaper lightHomeWallpaperFromStorageValue(String? raw) {
  return switch (raw) {
    'ribbon_mesh' => LightHomeWallpaper.ribbonMesh,
    _ => LightHomeWallpaper.classic,
  };
}

String storageValueForLightHomeWallpaper(LightHomeWallpaper wallpaper) {
  switch (wallpaper) {
    case LightHomeWallpaper.ribbonMesh:
      return 'ribbon_mesh';
    case LightHomeWallpaper.classic:
      return 'classic';
  }
}

DarkHomeWallpaper darkHomeWallpaperFromStorageValue(String? raw) {
  return switch (raw) {
    _ => DarkHomeWallpaper.nightMesh,
  };
}

String storageValueForDarkHomeWallpaper(DarkHomeWallpaper wallpaper) {
  switch (wallpaper) {
    case DarkHomeWallpaper.nightMesh:
      return 'night_mesh';
  }
}

Future<LightHomeWallpaper> readSavedLightHomeWallpaper() async {
  final prefs = await SharedPreferences.getInstance();
  return lightHomeWallpaperFromStorageValue(prefs.getString(_kLightWallpaperKey));
}

Future<void> writeSavedLightHomeWallpaper(LightHomeWallpaper wallpaper) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(
    _kLightWallpaperKey,
    storageValueForLightHomeWallpaper(wallpaper),
  );
}

Future<DarkHomeWallpaper> readSavedDarkHomeWallpaper() async {
  final prefs = await SharedPreferences.getInstance();
  return darkHomeWallpaperFromStorageValue(prefs.getString(_kDarkWallpaperKey));
}

Future<void> writeSavedDarkHomeWallpaper(DarkHomeWallpaper wallpaper) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(
    _kDarkWallpaperKey,
    storageValueForDarkHomeWallpaper(wallpaper),
  );
}
