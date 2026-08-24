import 'package:shared_preferences/shared_preferences.dart';

import '../domain/break_models.dart';

const _locationKey = 'stage_one_breaks_location';
const _dayKey = 'stage_one_breaks_day';
const _afternoonKey = 'stage_one_breaks_afternoon';
const _nightKey = 'stage_one_breaks_night';

Future<BreakFilters> readBreakFilters() async {
  final prefs = await SharedPreferences.getInstance();
  return BreakFilters(
    location: prefs.getString(_locationKey),
    day: prefs.getBool(_dayKey) ?? true,
    afternoon: prefs.getBool(_afternoonKey) ?? true,
    night: prefs.getBool(_nightKey) ?? true,
  );
}

Future<void> writeBreakFilters(BreakFilters filters) async {
  final prefs = await SharedPreferences.getInstance();
  final location = filters.location?.trim();
  if (location == null || location.isEmpty) {
    await prefs.remove(_locationKey);
  } else {
    await prefs.setString(_locationKey, location);
  }
  await Future.wait(<Future<bool>>[
    prefs.setBool(_dayKey, filters.day),
    prefs.setBool(_afternoonKey, filters.afternoon),
    prefs.setBool(_nightKey, filters.night),
  ]);
}
