import 'package:shared_preferences/shared_preferences.dart';

/// Same keys as PWA `WeeklyRotaPage` localStorage intent.
const String kWeeklyRotaLocationKey = 'weekly_rota_location';
const String kWeeklyRotaShiftTypeKey = 'weekly_rota_shift_type';

Future<String?> readSavedMyRotaLocationName() async {
  final prefs = await SharedPreferences.getInstance();
  return prefs.getString(kWeeklyRotaLocationKey);
}

Future<void> writeSavedMyRotaLocationName(String name) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(kWeeklyRotaLocationKey, name);
}

Future<String?> readSavedMyRotaShiftType() async {
  final prefs = await SharedPreferences.getInstance();
  return prefs.getString(kWeeklyRotaShiftTypeKey);
}

Future<void> writeSavedMyRotaShiftType(String value) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(kWeeklyRotaShiftTypeKey, value);
}
