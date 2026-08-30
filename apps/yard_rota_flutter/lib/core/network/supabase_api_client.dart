import 'api_client.dart';
import 'models.dart';
import 'my_rota_models.dart';
import 'network_policy.dart';
import '../../features/my_rota/domain/my_rota_week_logic.dart';
import '../../features/stats/domain/stats_models.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class SupabaseApiClient implements ApiClient {
  SupabaseApiClient(this._client);

  final SupabaseClient _client;

  @override
  Stream<AuthFlowEvent> get authEvents {
    return _client.auth.onAuthStateChange.map((event) {
      return switch (event.event) {
        AuthChangeEvent.passwordRecovery => AuthFlowEvent.passwordRecovery,
        AuthChangeEvent.signedIn => AuthFlowEvent.signedIn,
        AuthChangeEvent.signedOut => AuthFlowEvent.signedOut,
        _ => AuthFlowEvent.tokenRefreshed,
      };
    });
  }

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
  Future<RegistrationResult> register({
    required String email,
    required String password,
  }) async {
    try {
      final response = await _client.auth.signUp(
        email: email,
        password: password,
        emailRedirectTo: 'yardrota://auth-confirmation',
      );
      return RegistrationResult(
        requiresEmailConfirmation: response.session == null,
      );
    } on AuthException catch (error) {
      throw UnauthorizedException(error.message);
    } catch (error) {
      throw TransientNetworkException(error.toString());
    }
  }

  @override
  Future<void> sendPasswordReset({required String email}) async {
    try {
      await _client.auth.resetPasswordForEmail(
        email,
        redirectTo: 'yardrota://reset-password',
      );
    } on AuthException catch (error) {
      throw UnauthorizedException(error.message);
    } catch (error) {
      throw TransientNetworkException(error.toString());
    }
  }

  @override
  Future<void> updatePassword({required String password}) async {
    try {
      await _client.auth.updateUser(UserAttributes(password: password));
    } on AuthException catch (error) {
      throw UnauthorizedException(error.message);
    } catch (error) {
      throw TransientNetworkException(error.toString());
    }
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
  Future<UserProfile> getProfile() async {
    final user = _client.auth.currentUser;
    if (user == null) {
      throw const UnauthorizedException('User session not found.');
    }
    final row = await _fetchProfileRow(user.id);
    return _profileFromRow(user, row);
  }

  @override
  Future<UserProfile> updateProfile({
    required UpdateProfileRequest request,
  }) async {
    final userId = _currentUserId();
    final payload = <String, dynamic>{
      'id': userId,
      'first_name': request.firstName.trim(),
      'last_name': request.lastName.trim(),
      'shift_preference': request.shiftPreference,
      'custom_start_time': request.customStartTime,
      'preferred_location': request.preferredLocation,
      'agency_id': request.agencyId,
      'updated_at': DateTime.now().toUtc().toIso8601String(),
    };
    if (request.avatarUrl != null) {
      payload['avatar_url'] = request.avatarUrl;
    }
    if (request.completeProfile) {
      payload['profile_completed'] = true;
      payload['account_status'] = AccountStatus.pendingApproval.dbValue;
    }
    try {
      await _client.from('profiles').upsert(payload);
      return getProfile();
    } on PostgrestException catch (error) {
      throw TransientNetworkException(error.message);
    } catch (error) {
      throw TransientNetworkException(error.toString());
    }
  }

  @override
  Future<String> uploadAvatar({required AvatarUpload upload}) async {
    final userId = _currentUserId();
    // Flat key: DHL Storage RLS requires name LIKE '{uid}-%'
    final path =
        '$userId-${DateTime.now().millisecondsSinceEpoch}.${upload.fileExtension}';
    try {
      await _client.storage
          .from('avatars')
          .uploadBinary(
            path,
            upload.bytes,
            fileOptions: FileOptions(contentType: upload.contentType),
          );
      return _client.storage.from('avatars').getPublicUrl(path);
    } on StorageException catch (error) {
      throw TransientNetworkException(error.message);
    } catch (error) {
      throw TransientNetworkException(error.toString());
    }
  }

  @override
  Future<List<AgencyOption>> getActiveAgencies() async {
    try {
      final rows = await _client
          .from('agencies')
          .select('id,name')
          .eq('is_active', true)
          .order('name');
      return rows
          .whereType<Map<String, dynamic>>()
          .map(
            (row) => AgencyOption(
              id: row['id'].toString(),
              name: (row['name'] as String?) ?? '',
            ),
          )
          .where((agency) => agency.name.isNotEmpty)
          .toList(growable: false);
    } on PostgrestException catch (error) {
      throw TransientNetworkException(error.message);
    } catch (error) {
      throw TransientNetworkException(error.toString());
    }
  }

  @override
  Future<List<AttendanceHistoryItem>> getOwnAttendanceHistory() async {
    final userId = _currentUserId();
    try {
      final rotaRows = await _client
          .from('scheduled_rota')
          .select('id,date')
          .eq('user_id', userId);
      final dates = <String, String>{};
      for (final row in rotaRows) {
        final id = row['id']?.toString();
        final date = row['date'] as String?;
        if (id != null && date != null) {
          dates[id] = date;
        }
      }
      if (dates.isEmpty) {
        return const [];
      }
      final rows = await _client
          .from('attendance')
          .select('scheduled_rota_id,status,recorded_at')
          .inFilter('scheduled_rota_id', dates.keys.toList())
          .order('recorded_at', ascending: false);
      return rows
          .whereType<Map<String, dynamic>>()
          .map(
            (row) => AttendanceHistoryItem(
              dateYmd: dates[row['scheduled_rota_id']?.toString()] ?? '',
              status: (row['status'] as String?) ?? '',
              recordedAt: DateTime.tryParse(
                (row['recorded_at'] as String?) ?? '',
              ),
            ),
          )
          .where((item) => item.dateYmd.isNotEmpty)
          .toList(growable: false);
    } on PostgrestException catch (error) {
      throw TransientNetworkException(error.message);
    } catch (error) {
      throw TransientNetworkException(error.toString());
    }
  }

  @override
  Future<List<ViolationHistoryItem>> getOwnViolationHistory() async {
    final userId = _currentUserId();
    try {
      final rows = await _client
          .from('shunter_violations')
          .select('id,body,category,created_at')
          .eq('user_id', userId)
          .order('created_at', ascending: false);
      return rows
          .whereType<Map<String, dynamic>>()
          .map(
            (row) => ViolationHistoryItem(
              id: row['id'].toString(),
              body: (row['body'] as String?) ?? '',
              category: row['category'] as String?,
              createdAt:
                  DateTime.tryParse((row['created_at'] as String?) ?? '') ??
                  DateTime.fromMillisecondsSinceEpoch(0),
            ),
          )
          .where((item) => item.body.isNotEmpty)
          .toList(growable: false);
    } on PostgrestException catch (error) {
      throw TransientNetworkException(error.message);
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
    final profile = _profileFromRow(user, await _fetchProfileRow(user.id));
    final isPrivileged = profile.role != UserRole.user;
    return UserSession(
      userId: user.id,
      displayName: profile.displayName,
      email: user.email ?? '',
      role: profile.role,
      accountStatus: isPrivileged
          ? AccountStatus.approved
          : profile.accountStatus,
      profileCompleted: isPrivileged || profile.profileCompleted,
    );
  }

  Future<Map<String, dynamic>?> _fetchProfileRow(String userId) async {
    try {
      final data = await _client
          .from('profiles')
          .select(
            'first_name,last_name,avatar_url,shift_preference,custom_start_time,preferred_location,agency_id,role,account_status,profile_completed',
          )
          .eq('id', userId)
          .maybeSingle();
      if (data is! Map<String, dynamic>) {
        return null;
      }
      return data;
    } on PostgrestException catch (error) {
      throw TransientNetworkException(error.message);
    } catch (error) {
      throw TransientNetworkException(error.toString());
    }
  }

  UserProfile _profileFromRow(User user, Map<String, dynamic>? row) {
    if (row == null) {
      return UserProfile(userId: user.id, email: user.email ?? '');
    }
    final role = UserRole.fromDb(row['role'] as String?);
    return UserProfile(
      userId: user.id,
      email: user.email ?? '',
      firstName: (row['first_name'] as String?) ?? '',
      lastName: (row['last_name'] as String?) ?? '',
      avatarUrl: row['avatar_url'] as String?,
      shiftPreference: (row['shift_preference'] as String?) ?? 'day',
      customStartTime: _timeText(row['custom_start_time']),
      preferredLocation: row['preferred_location'] as String?,
      agencyId: row['agency_id']?.toString(),
      role: role,
      accountStatus: role == UserRole.user
          ? AccountStatus.fromDb(row['account_status'] as String?)
          : AccountStatus.approved,
      profileCompleted:
          role != UserRole.user || row['profile_completed'] == true,
    );
  }

  String? _timeText(dynamic value) {
    final raw = value?.toString();
    if (raw == null || raw.isEmpty) {
      return null;
    }
    return raw.length >= 5 ? raw.substring(0, 5) : raw;
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
    // No hardcoded fallback: hub names are matched verbatim against the rota, so
    // a stale name silently returns an empty schedule.
    return const [];
  }

  @override
  Future<MyRotaAnchorShift?> getMyRotaAnchorShift({
    required String userId,
    required String fromYmd,
  }) async {
    final trimmedUserId = userId.trim();
    if (trimmedUserId.isEmpty) {
      return null;
    }

    try {
      final now = DateTime.now();
      final windowStart = myRotaDateOnly(now).subtract(const Duration(days: 1));
      final windowEnd = myRotaDateOnly(now).add(const Duration(days: 14));
      final rows = await _client
          .from('scheduled_rota')
          .select('date,location,shift_type,start_time,end_time')
          .eq('user_id', trimmedUserId)
          .gte('date', _toYmd(windowStart))
          .lte('date', _toYmd(windowEnd))
          .order('date')
          .order('start_time');

      if (rows.isEmpty) {
        return null;
      }

      final shifts = <MyRotaAnchorShift>[];
      for (final row in rows) {
        final dateYmd = row['date'] as String?;
        final location = row['location'] as String?;
        final shiftType = row['shift_type'] as String?;
        if (dateYmd == null ||
            dateYmd.trim().isEmpty ||
            location == null ||
            location.trim().isEmpty ||
            shiftType == null ||
            shiftType.trim().isEmpty) {
          continue;
        }

        shifts.add(
          MyRotaAnchorShift(
            dateYmd: dateYmd,
            location: location,
            shiftType: shiftType,
            startTime: (row['start_time'] as String?) ?? '',
            endTime: (row['end_time'] as String?) ?? '',
          ),
        );
      }

      return pickMyRotaAnchorShift(shifts: shifts, now: now);
    } on PostgrestException catch (error) {
      throw TransientNetworkException(error.message);
    } catch (error) {
      throw TransientNetworkException(error.toString());
    }
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
        .map((r) => (r['user_id'] as String?)?.trim())
        .whereType<String>()
        .where((id) => id.isNotEmpty)
        .toSet()
        .toList();

    final profilesMap = <String, Map<String, String>>{};
    if (userIds.isNotEmpty) {
      try {
        final profRows = await _client
            .from('profiles')
            .select('id, first_name, last_name, avatar_url')
            .inFilter('id', userIds);
        for (final dynamic row in profRows) {
          if (row is! Map<String, dynamic>) {
            continue;
          }
          final id = (row['id'] as String?)?.trim();
          if (id == null || id.isEmpty) {
            continue;
          }
          profilesMap[id] = {
            'first_name': ((row['first_name'] as String?) ?? '').trim(),
            'last_name': ((row['last_name'] as String?) ?? '').trim(),
            'avatar_url': ((row['avatar_url'] as String?) ?? '').trim(),
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
      final userId = (row['user_id'] as String?)?.trim();
      if (id == null || dateYmd == null || userId == null || userId.isEmpty) {
        continue;
      }
      final prof = profilesMap[userId];
      if (prof == null) {
        continue;
      }
      final firstName = (prof['first_name'] ?? '').trim();
      final lastName = (prof['last_name'] ?? '').trim();
      if (firstName.isEmpty && lastName.isEmpty) {
        continue;
      }
      final key = '$userId-$dateYmd-${row['start_time']}-${row['end_time']}';
      if (seenKeys.contains(key)) {
        continue;
      }
      seenKeys.add(key);
      uniqueSlots.add(
        MyRotaSlot(
          id: id,
          dateYmd: dateYmd,
          shiftType: (row['shift_type'] as String?) ?? 'day',
          location: (row['location'] as String?) ?? locationName,
          startTime: (row['start_time'] as String?) ?? '',
          endTime: (row['end_time'] as String?) ?? '',
          userId: userId,
          firstName: firstName,
          lastName: lastName,
          avatarUrl: (prof['avatar_url'] ?? '').trim().isEmpty
              ? null
              : prof['avatar_url'],
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
      return a.displayNameOrNull!.compareTo(b.displayNameOrNull!);
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

  @override
  Future<StatsRemoteSnapshot> getStatsPerformance({
    String? startYmd,
    String? endYmd,
  }) async {
    final currentUserId = _currentUserId();
    final fetchedAt = DateTime.now();
    final currentProfile = await _fetchStatsProfile(currentUserId, fetchedAt);
    final rows = <dynamic>[];
    const batchSize = 1000;
    var from = 0;

    try {
      while (true) {
        var query = _client.from('shunter_performance').select('''
          user_id,
          report_date,
          number_of_moves,
          avg_time_to_collect,
          avg_time_to_travel,
          number_of_full_locations,
          profiles:user_id (
            id,
            first_name,
            last_name,
            yard_system_id,
            shift_preference,
            is_active
          )
        ''');
        if (startYmd != null) {
          query = query.gte('report_date', startYmd);
        }
        if (endYmd != null) {
          query = query.lte('report_date', endYmd);
        }
        final batch = await query
            .order('report_date', ascending: true)
            .range(from, from + batchSize - 1);
        rows.addAll(batch);
        if (batch.length < batchSize) {
          break;
        }
        from += batchSize;
      }
    } on PostgrestException catch (error) {
      throw TransientNetworkException(error.message);
    } catch (error) {
      throw TransientNetworkException(error.toString());
    }

    final records = <StatsPerformanceRecord>[];
    for (final dynamic row in rows) {
      if (row is! Map<String, dynamic>) {
        continue;
      }
      final userId = (row['user_id'] as String?)?.trim();
      final reportDate = row['report_date'] as String?;
      if (userId == null ||
          userId.isEmpty ||
          reportDate == null ||
          reportDate.isEmpty) {
        continue;
      }
      records.add(
        StatsPerformanceRecord(
          userId: userId,
          reportDateYmd: reportDate,
          numberOfMoves: (row['number_of_moves'] as num?)?.round() ?? 0,
          avgTimeToCollect: (row['avg_time_to_collect'] as String?) ?? '0:00',
          avgTimeToTravel: (row['avg_time_to_travel'] as String?) ?? '0:00',
          numberOfFullLocations:
              (row['number_of_full_locations'] as num?)?.round() ?? 0,
          profile: _statsProfileFromRow(row['profiles'], fetchedAt),
          fetchedAt: fetchedAt,
        ),
      );
    }

    return StatsRemoteSnapshot(
      records: records,
      currentProfile: currentProfile,
      fetchedAt: fetchedAt,
    );
  }

  Future<StatsProfileSnapshot?> _fetchStatsProfile(
    String userId,
    DateTime fetchedAt,
  ) async {
    try {
      final row = await _client
          .from('profiles')
          .select(
            'id, first_name, last_name, yard_system_id, shift_preference, is_active',
          )
          .eq('id', userId)
          .maybeSingle();
      return _statsProfileFromRow(row, fetchedAt);
    } on PostgrestException catch (error) {
      throw TransientNetworkException(error.message);
    } catch (error) {
      throw TransientNetworkException(error.toString());
    }
  }

  StatsProfileSnapshot? _statsProfileFromRow(dynamic row, DateTime fetchedAt) {
    if (row is! Map<String, dynamic>) {
      return null;
    }
    final id = (row['id'] as String?)?.trim();
    if (id == null || id.isEmpty) {
      return null;
    }
    return StatsProfileSnapshot(
      userId: id,
      firstName: row['first_name'] as String?,
      lastName: row['last_name'] as String?,
      yardSystemId: row['yard_system_id'] as String?,
      shiftPreference: row['shift_preference'] as String?,
      isActive: row['is_active'] != false,
      fetchedAt: fetchedAt,
    );
  }
}
