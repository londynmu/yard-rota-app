import 'api_client.dart';
import 'models.dart';
import 'my_rota_models.dart';
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

    return _buildUserSession(user);
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

    return _buildUserSession(user);
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

  Future<UserSession> _buildUserSession(User user) async {
    final role = await _fetchProfileRole(user.id);
    return UserSession(
      userId: user.id,
      displayName: _displayNameFromUser(user),
      userRole: role,
    );
  }

  Future<String?> _fetchProfileRole(String userId) async {
    try {
      final data = await _client
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .maybeSingle();
      if (data is! Map<String, dynamic>) {
        return null;
      }
      return data['role'] as String?;
    } on PostgrestException {
      return null;
    } catch (_) {
      return null;
    }
  }

  @override
  Future<List<LocationOption>> getActiveLocations() async {
    try {
      final rows = await _client
          .from('locations')
          .select('id, name')
          .eq('is_active', true)
          .order('name');
      final list = <LocationOption>[];
      for (final dynamic row in rows) {
        if (row is! Map<String, dynamic>) {
          continue;
        }
        final id = row['id']?.toString();
        final name = row['name'] as String?;
        if (id == null || name == null || name.isEmpty) {
          continue;
        }
        list.add(LocationOption(id: id, name: name));
      }
      if (list.isNotEmpty) {
        return list;
      }
    } on PostgrestException catch (error) {
      throw TransientNetworkException(error.message);
    } catch (error) {
      throw TransientNetworkException(error.toString());
    }
    return const [
      LocationOption(id: '1', name: 'Rugby'),
      LocationOption(id: '2', name: 'NRC'),
      LocationOption(id: '3', name: 'Nuneaton'),
    ];
  }

  @override
  Future<MyRotaWeekData> getMyRotaWeek({
    required String weekStartYmd,
    required String locationName,
    required String shiftTypeFilter,
  }) async {
    final startParts = weekStartYmd.split('-');
    if (startParts.length != 3) {
      throw const TransientNetworkException('Invalid week start date.');
    }
    final ws = DateTime(
      int.parse(startParts[0]),
      int.parse(startParts[1]),
      int.parse(startParts[2]),
    );
    final end = ws.add(const Duration(days: 6));
    final startStr = _toYmd(ws);
    final endStr = _toYmd(end);

    late final List<dynamic> rotaRows;
    try {
      var query = _client
          .from('scheduled_rota')
          .select(
            'id,date,shift_type,location,start_time,end_time,user_id,task',
          )
          .gte('date', startStr)
          .lte('date', endStr)
          .eq('location', locationName);
      if (shiftTypeFilter != 'all') {
        query = query.eq('shift_type', shiftTypeFilter);
      }
      rotaRows = await query;
    } on PostgrestException catch (error) {
      throw TransientNetworkException(error.message);
    } catch (error) {
      throw TransientNetworkException(error.toString());
    }

    final rawSlots = <Map<String, dynamic>>[];
    for (final dynamic row in rotaRows) {
      if (row is Map<String, dynamic>) {
        rawSlots.add(row);
      }
    }

    final userIds = rawSlots
        .map((r) => r['user_id'] as String?)
        .whereType<String>()
        .toSet()
        .toList();

    final profilesMap = <String, Map<String, String>>{};
    if (userIds.isNotEmpty) {
      try {
        final profRows = await _client
            .from('profiles')
            .select('id, first_name, last_name')
            .inFilter('id', userIds);
        for (final dynamic row in profRows) {
          if (row is! Map<String, dynamic>) {
            continue;
          }
          final id = row['id'] as String?;
          if (id == null) {
            continue;
          }
          profilesMap[id] = {
            'first_name': (row['first_name'] as String?) ?? '',
            'last_name': (row['last_name'] as String?) ?? '',
          };
        }
      } on PostgrestException catch (error) {
        throw TransientNetworkException(error.message);
      } catch (error) {
        throw TransientNetworkException(error.toString());
      }
    }

    final seenKeys = <String>{};
    final uniqueSlots = <MyRotaSlot>[];

    for (final row in rawSlots) {
      final id = row['id']?.toString();
      final dateYmd = row['date'] as String?;
      final userId = row['user_id'] as String?;
      if (id == null || dateYmd == null) {
        continue;
      }
      final key =
          '${userId ?? ''}-$dateYmd-${row['start_time']}-${row['end_time']}';
      if (seenKeys.contains(key)) {
        continue;
      }
      seenKeys.add(key);
      final prof = userId != null ? profilesMap[userId] : null;
      uniqueSlots.add(
        MyRotaSlot(
          id: id,
          dateYmd: dateYmd,
          shiftType: (row['shift_type'] as String?) ?? 'day',
          location: (row['location'] as String?) ?? locationName,
          startTime: (row['start_time'] as String?) ?? '',
          endTime: (row['end_time'] as String?) ?? '',
          userId: userId ?? '',
          firstName: prof?['first_name'],
          lastName: prof?['last_name'],
          task: row['task'] as String?,
        ),
      );
    }

    uniqueSlots.sort((a, b) {
      final c1 = a.startTime.compareTo(b.startTime);
      if (c1 != 0) {
        return c1;
      }
      final c2 = a.endTime.compareTo(b.endTime);
      if (c2 != 0) {
        return c2;
      }
      return a.displayName.compareTo(b.displayName);
    });

    final grouped = <String, List<MyRotaSlot>>{};
    for (final slot in uniqueSlots) {
      grouped.putIfAbsent(slot.dateYmd, () => <MyRotaSlot>[]).add(slot);
    }

    final attendanceBySlotId = <String, MyRotaAttendanceStatus>{};
    if (uniqueSlots.isNotEmpty) {
      final slotIds = uniqueSlots.map((s) => s.id).toList();
      try {
        final attRows = await _client
            .from('attendance')
            .select('scheduled_rota_id, status')
            .inFilter('scheduled_rota_id', slotIds);
        for (final dynamic row in attRows) {
          if (row is! Map<String, dynamic>) {
            continue;
          }
          final sid = row['scheduled_rota_id']?.toString();
          final st = row['status'] as String?;
          final parsed = MyRotaAttendanceStatus.fromDbValue(st);
          if (sid != null && parsed != null) {
            attendanceBySlotId[sid] = parsed;
          }
        }
      } on PostgrestException catch (error) {
        throw TransientNetworkException(error.message);
      } catch (error) {
        throw TransientNetworkException(error.toString());
      }
    }

    return MyRotaWeekData(
      slotsByDateYmd: grouped,
      attendanceBySlotId: attendanceBySlotId,
      fetchedAt: DateTime.now(),
    );
  }

  @override
  Future<void> saveMyRotaAttendance({
    required String scheduledRotaId,
    MyRotaAttendanceStatus? status,
  }) async {
    final userId = _currentUserId();
    try {
      if (status == null) {
        await _client
            .from('attendance')
            .delete()
            .eq('scheduled_rota_id', scheduledRotaId);
        return;
      }
      await _client.from('attendance').upsert(<String, dynamic>{
        'scheduled_rota_id': scheduledRotaId,
        'status': status.dbValue,
        'recorded_by': userId,
      }, onConflict: 'scheduled_rota_id');
    } on PostgrestException catch (error) {
      throw TransientNetworkException(error.message);
    } catch (error) {
      throw TransientNetworkException(error.toString());
    }
  }
}
