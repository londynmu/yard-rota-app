import 'package:shared_preferences/shared_preferences.dart';

import 'home_wallpaper.dart';

const String _kLightWallpaperKey = 'app_light_home_wallpaper';
const String _kDarkWallpaperKey = 'app_dark_home_wallpaper';

LightHomeWallpaper lightHomeWallpaperFromStorageValue(String? raw) {
  return switch (raw) {
    'ribbon_mesh' => LightHomeWallpaper.ribbonMesh,
    'perforated_mesh' => LightHomeWallpaper.perforatedMesh,
    'ribbed_flow' => LightHomeWallpaper.ribbedFlow,
    'contour_mesh' => LightHomeWallpaper.contourMesh,
    'layered_waves' => LightHomeWallpaper.layeredWaves,
    'classic' => LightHomeWallpaper.classic,
    null => LightHomeWallpaper.classic,
    _ => LightHomeWallpaper.classic,
  };
}

String storageValueForLightHomeWallpaper(LightHomeWallpaper wallpaper) {
  switch (wallpaper) {
    case LightHomeWallpaper.classic:
      return 'classic';
    case LightHomeWallpaper.ribbonMesh:
      return 'ribbon_mesh';
    case LightHomeWallpaper.perforatedMesh:
      return 'perforated_mesh';
    case LightHomeWallpaper.ribbedFlow:
      return 'ribbed_flow';
    case LightHomeWallpaper.contourMesh:
      return 'contour_mesh';
    case LightHomeWallpaper.layeredWaves:
      return 'layered_waves';
  }
}

DarkHomeWallpaper darkHomeWallpaperFromStorageValue(String? raw) {
  return switch (raw) {
    'glow_hex' => DarkHomeWallpaper.glowHexTerrain,
    'dimpled_metal' => DarkHomeWallpaper.dimpledMetal,
    'velvet_waves' => DarkHomeWallpaper.velvetWaves,
    'ridged_depth' => DarkHomeWallpaper.ridgedDepth,
    'night_mesh' => DarkHomeWallpaper.nightMesh,
    null => DarkHomeWallpaper.nightMesh,
    _ => DarkHomeWallpaper.nightMesh,
  };
}

String storageValueForDarkHomeWallpaper(DarkHomeWallpaper wallpaper) {
  switch (wallpaper) {
    case DarkHomeWallpaper.nightMesh:
      return 'night_mesh';
    case DarkHomeWallpaper.glowHexTerrain:
      return 'glow_hex';
    case DarkHomeWallpaper.dimpledMetal:
      return 'dimpled_metal';
    case DarkHomeWallpaper.velvetWaves:
      return 'velvet_waves';
    case DarkHomeWallpaper.ridgedDepth:
      return 'ridged_depth';
  }
}

Future<LightHomeWallpaper> readSavedLightHomeWallpaper() async {
  final prefs = await SharedPreferences.getInstance();
  return lightHomeWallpaperFromStorageValue(
    prefs.getString(_kLightWallpaperKey),
  );
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
