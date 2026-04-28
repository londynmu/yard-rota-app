import 'api_client.dart';
import 'models.dart';
import 'network_policy.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class SupabaseApiClient implements ApiClient {
  SupabaseApiClient(this._client);

  final SupabaseClient _client;

  @override
  Future<UserSession?> restoreSession() async {
    final session = _client.auth.currentSession;
    final user = session?.user;
    if (user == null) {
      return null;
    }

    return UserSession(
      userId: user.id,
      displayName: _displayNameFromUser(user),
    );
  }

  @override
  Future<UserSession> login({
    required String email,
    required String password,
  }) async {
    final response = await _client.auth.signInWithPassword(
      email: email,
      password: password,
    );

    final user = response.user;
    if (user == null) {
      throw const UnauthorizedException('No user returned from auth.');
    }

    return UserSession(
      userId: user.id,
      displayName: _displayNameFromUser(user),
    );
  }

  @override
  Future<void> signOut() async {
    await _client.auth.signOut(scope: SignOutScope.global);
  }

  @override
  Future<CalendarMonthData> getCalendarMonth({
    required int year,
    required int month,
  }) async {
    final session = _client.auth.currentSession;
    final user = session?.user;
    if (user == null) {
      throw const UnauthorizedException('User session not found.');
    }

    final startDate = DateTime(year, month, 1);
    final endDate = DateTime(year, month + 1, 0);
    final fromDate = _toYmd(startDate);
    final toDate = _toYmd(endDate);

    final rows = await _client
        .from('scheduled_rota')
        .select('date,start_time,end_time,location,shift_type')
        .eq('user_id', user.id)
        .gte('date', fromDate)
        .lte('date', toDate)
        .order('date')
        .order('start_time');

    final grouped = <DateTime, List<CalendarShift>>{};
    for (final dynamic row in rows) {
      if (row is! Map<String, dynamic>) {
        continue;
      }
      final rawDate = row['date'] as String?;
      if (rawDate == null) {
        continue;
      }
      final date = DateTime.tryParse(rawDate);
      if (date == null) {
        continue;
      }

      final shiftType = (row['shift_type'] as String?) ?? 'Shift';
      final shift = CalendarShift(
        title: _capitalize(shiftType),
        startTime: (row['start_time'] as String?) ?? '--:--',
        endTime: (row['end_time'] as String?) ?? '--:--',
        location: (row['location'] as String?) ?? 'Unknown location',
        status: 'On time',
      );

      grouped.putIfAbsent(date, () => <CalendarShift>[]).add(shift);
    }

    final schedules =
        grouped.entries
            .map(
              (entry) =>
                  CalendarDaySchedule(date: entry.key, shifts: entry.value),
            )
            .toList()
          ..sort((a, b) => a.date.compareTo(b.date));

    return CalendarMonthData(
      year: year,
      month: month,
      scheduledDays: schedules,
      fetchedAt: DateTime.now(),
    );
  }

  String _toYmd(DateTime date) {
    final y = date.year.toString().padLeft(4, '0');
    final m = date.month.toString().padLeft(2, '0');
    final d = date.day.toString().padLeft(2, '0');
    return '$y-$m-$d';
  }

  String _displayNameFromUser(User user) {
    final firstName = user.userMetadata?['first_name'] as String?;
    final lastName = user.userMetadata?['last_name'] as String?;
    final fullName = [firstName, lastName]
        .where((value) => value != null && value.trim().isNotEmpty)
        .join(' ')
        .trim();
    if (fullName.isNotEmpty) {
      return fullName;
    }
    return user.email ?? 'Shunter';
  }

  String _capitalize(String value) {
    if (value.isEmpty) {
      return value;
    }
    return '${value[0].toUpperCase()}${value.substring(1)} shift';
  }
}
