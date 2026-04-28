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
    late final AuthResponse response;
    try {
      response = await _client.auth.signInWithPassword(
        email: email,
        password: password,
      );
    } on AuthException catch (error) {
      throw UnauthorizedException(error.message);
    } catch (error) {
      throw TransientNetworkException(error.toString());
    }

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
    try {
      await _client.auth.signOut(scope: SignOutScope.global);
    } on AuthException catch (error) {
      throw UnauthorizedException(error.message);
    } catch (error) {
      throw TransientNetworkException(error.toString());
    }
  }

  @override
  Future<CalendarMonthData> getCalendarMonth({
    required int year,
    required int month,
  }) async {
    final userId = _currentUserId();

    final startDate = DateTime(year, month, 1);
    final endDate = DateTime(year, month + 1, 0);
    final fromDate = _toYmd(startDate);
    final toDate = _toYmd(endDate);

    late final List<dynamic> rows;
    try {
      rows = await _client
          .from('scheduled_rota')
          .select('date,start_time,end_time,location,shift_type')
          .eq('user_id', userId)
          .gte('date', fromDate)
          .lte('date', toDate)
          .order('date')
          .order('start_time');
    } on PostgrestException catch (error) {
      throw TransientNetworkException(error.message);
    } catch (error) {
      throw TransientNetworkException(error.toString());
    }

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

  @override
  Future<List<AvailabilityEntry>> getAvailabilityRange({
    required String startYmd,
    required String endYmd,
  }) async {
    final userId = _currentUserId();

    late final List<dynamic> rows;
    try {
      rows = await _client
          .from('availability')
          .select('id,date,status,comment')
          .eq('user_id', userId)
          .gte('date', startYmd)
          .lte('date', endYmd)
          .order('date');
    } on PostgrestException catch (error) {
      throw TransientNetworkException(error.message);
    } catch (error) {
      throw TransientNetworkException(error.toString());
    }

    return rows
        .whereType<Map<String, dynamic>>()
        .map((row) {
          return AvailabilityEntry(
            id: row['id'] as String?,
            dateYmd: (row['date'] as String?) ?? '',
            status: AvailabilityStatus.fromDbValue(
              (row['status'] as String?) ??
                  AvailabilityStatus.available.dbValue,
            ),
            comment: row['comment'] as String?,
          );
        })
        .where((entry) => entry.dateYmd.isNotEmpty)
        .toList(growable: false);
  }

  @override
  Future<void> saveAvailability({
    required SaveAvailabilityRequest request,
  }) async {
    if (request.items.isEmpty) {
      return;
    }

    final userId = _currentUserId();
    final dates = request.items.map((item) => item.dateYmd).toSet().toList()
      ..sort();
    final startYmd = dates.first;
    final endYmd = dates.last;

    final existing = await getAvailabilityRange(
      startYmd: startYmd,
      endYmd: endYmd,
    );
    final byDate = <String, AvailabilityEntry>{
      for (final item in existing) item.dateYmd: item,
    };

    for (final item in request.items) {
      final payload = <String, dynamic>{'status': item.status.dbValue};
      if (request.applyComment && request.items.length == 1) {
        payload['comment'] = request.comment.trim();
      }

      final current = byDate[item.dateYmd];
      try {
        if (current?.id != null) {
          await _client
              .from('availability')
              .update(payload)
              .eq('id', current!.id!);
        } else {
          await _client.from('availability').insert({
            'user_id': userId,
            'date': item.dateYmd,
            ...payload,
          });
        }
      } on PostgrestException catch (error) {
        throw TransientNetworkException(error.message);
      } catch (error) {
        throw TransientNetworkException(error.toString());
      }
    }
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

  String _currentUserId() {
    final user = _client.auth.currentSession?.user;
    if (user == null) {
      throw const UnauthorizedException('User session not found.');
    }
    return user.id;
  }
}
