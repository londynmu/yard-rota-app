import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

const String _kThemeModeKey = 'app_theme_mode';

/// App default when nothing is saved yet (cold start / first install).
const ThemeMode kDefaultThemeMode = ThemeMode.light;

ThemeMode themeModeFromStorageValue(String? raw) {
  switch (raw) {
    case 'light':
      return ThemeMode.light;
    case 'dark':
      return ThemeMode.dark;
    case 'system':
      return ThemeMode.system;
    default:
      // null / unknown → light (avoids a dark flash before prefs exist).
      return kDefaultThemeMode;
  }
}

String storageValueForThemeMode(ThemeMode mode) {
  switch (mode) {
    case ThemeMode.light:
      return 'light';
    case ThemeMode.dark:
      return 'dark';
    case ThemeMode.system:
      return 'system';
  }
}

Future<ThemeMode> readSavedThemeMode() async {
  final prefs = await SharedPreferences.getInstance();
  return themeModeFromStorageValue(prefs.getString(_kThemeModeKey));
}

Future<void> writeSavedThemeMode(ThemeMode mode) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(_kThemeModeKey, storageValueForThemeMode(mode));
}
