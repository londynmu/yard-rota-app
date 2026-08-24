import 'dart:async';

import 'package:flutter/material.dart';

import '../../features/stats/domain/stats_models.dart';
import 'models.dart';
import 'my_rota_models.dart';
import 'network_policy.dart';

/// API abstraction for shunter-focused MVP flows.
///
/// Replace `MockApiClient` with a production implementation that maps to the
/// existing backend contracts once endpoint details are finalized.
abstract class ApiClient {
  Stream<AuthFlowEvent> get authEvents;
  Future<UserSession?> restoreSession();
  Future<UserSession> login({required String email, required String password});
  Future<RegistrationResult> register({
    required String email,
    required String password,
  });
  Future<void> sendPasswordReset({required String email});
  Future<void> updatePassword({required String password});
  Future<void> signOut();
  Future<UserProfile> getProfile();
  Future<UserProfile> updateProfile({required UpdateProfileRequest request});
  Future<String> uploadAvatar({required AvatarUpload upload});
  Future<List<AgencyOption>> getActiveAgencies();
  Future<List<AttendanceHistoryItem>> getOwnAttendanceHistory();
  Future<List<ViolationHistoryItem>> getOwnViolationHistory();
  Future<CalendarMonthData> getCalendarMonth({
    required int year,
    required int month,
  });
  Future<List<AvailabilityEntry>> getAvailabilityRange({
    required String startYmd,
    required String endYmd,
  });
  Future<void> saveAvailability({required SaveAvailabilityRequest request});

  Future<List<LocationOption>> getActiveLocations();

  Future<MyRotaAnchorShift?> getMyRotaAnchorShift({
    required String userId,
    required String fromYmd,
  });

  Future<MyRotaWeekData> getMyRotaWeek({
    required String weekStartYmd,
    required String locationName,
    required String shiftTypeFilter,
  });

  /// [status] null clears attendance for the slot (admin).
  Future<void> saveMyRotaAttendance({
    required String scheduledRotaId,
    MyRotaAttendanceStatus? status,
  });

  Future<StatsRemoteSnapshot> getStatsPerformance({
    String? startYmd,
    String? endYmd,
  });
}

class MockApiClient implements ApiClient {
  UserProfile _profile = const UserProfile(
    userId: 'shunter-01',
    email: 'shunter@example.com',
    firstName: 'Shunter',
    lastName: 'One',
    shiftPreference: 'day',
    customStartTime: '07:00',
    preferredLocation: 'Rugby',
    agencyId: 'mock-agency',
    role: UserRole.admin,
    accountStatus: AccountStatus.approved,
    profileCompleted: true,
  );

  @override
  Stream<AuthFlowEvent> get authEvents => const Stream<AuthFlowEvent>.empty();

  @override
  Future<UserSession?> restoreSession() async {
    await Future<void>.delayed(const Duration(milliseconds: 350));
    return null;
  }

  @override
  Future<UserSession> login({
    required String email,
    required String password,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 260));
    if (email.isEmpty || password.isEmpty) {
      throw const UnauthorizedException('Email and password are required.');
    }
    if (password != 'yard123') {
      throw const UnauthorizedException('Invalid credentials.');
    }
    return const UserSession(
      userId: 'shunter-01',
      displayName: 'Shunter One',
      email: 'shunter@example.com',
      role: UserRole.admin,
    );
  }

  @override
  Future<RegistrationResult> register({
    required String email,
    required String password,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 180));
    if (!email.contains('@') || password.length < 8) {
      throw const UnauthorizedException('Enter a valid email and password.');
    }
    return const RegistrationResult(requiresEmailConfirmation: true);
  }

  @override
  Future<void> sendPasswordReset({required String email}) async {
    await Future<void>.delayed(const Duration(milliseconds: 100));
  }

  @override
  Future<void> updatePassword({required String password}) async {
    if (password.length < 8) {
      throw const UnauthorizedException('Password is too short.');
    }
  }

  @override
  Future<void> signOut() async {
    await Future<void>.delayed(const Duration(milliseconds: 80));
  }

  @override
  Future<UserProfile> getProfile() async => _profile;

  @override
  Future<UserProfile> updateProfile({
    required UpdateProfileRequest request,
  }) async {
    _profile = UserProfile(
      userId: _profile.userId,
      email: _profile.email,
      firstName: request.firstName,
      lastName: request.lastName,
      shiftPreference: request.shiftPreference,
      avatarUrl: request.avatarUrl ?? _profile.avatarUrl,
      customStartTime: request.customStartTime,
      preferredLocation: request.preferredLocation,
      agencyId: request.agencyId,
      role: _profile.role,
      accountStatus: request.completeProfile
          ? AccountStatus.pendingApproval
          : _profile.accountStatus,
      profileCompleted: request.completeProfile || _profile.profileCompleted,
    );
    return _profile;
  }

  @override
  Future<String> uploadAvatar({required AvatarUpload upload}) async {
    return 'https://example.com/avatar.${upload.fileExtension}';
  }

  @override
  Future<List<AgencyOption>> getActiveAgencies() async => const [
    AgencyOption(id: 'mock-agency', name: 'Direct'),
  ];

  @override
  Future<List<AttendanceHistoryItem>> getOwnAttendanceHistory() async =>
      const [];

  @override
  Future<List<ViolationHistoryItem>> getOwnViolationHistory() async => const [];

  @override
  Future<CalendarMonthData> getCalendarMonth({
    required int year,
    required int month,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 320));
    if (month < 1 || month > 12) {
      throw const TransientNetworkException('Calendar month request failed.');
    }

    final daysInMonth = DateUtils.getDaysInMonth(year, month);
    final schedules = <CalendarDaySchedule>[];

    for (var day = 1; day <= daysInMonth; day += 1) {
      if (day % 3 == 0) {
        final date = DateTime(year, month, day);
        schedules.add(
          CalendarDaySchedule(
            date: date,
            shifts: [
              CalendarShift(
                title: day.isEven ? 'Day shift' : 'Night shift',
                startTime: day.isEven ? '06:00' : '22:00',
                endTime: day.isEven ? '14:00' : '06:00',
                location: day.isEven ? 'South Yard' : 'North Yard',
                status: day % 5 == 0 ? 'Delayed' : 'On time',
              ),
            ],
          ),
        );
      }
    }

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
    await Future<void>.delayed(const Duration(milliseconds: 120));
    return const [
      AvailabilityEntry(
        id: 'mock-availability-1',
        dateYmd: '2026-04-30',
        status: AvailabilityStatus.available,
      ),
    ];
  }

  @override
  Future<void> saveAvailability({
    required SaveAvailabilityRequest request,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 160));
    if (request.items.isEmpty) {
      throw const TransientNetworkException('No availability items provided.');
    }
  }

  @override
  Future<List<LocationOption>> getActiveLocations() async {
    await Future<void>.delayed(const Duration(milliseconds: 80));
    return const [
      LocationOption(id: 'mock-1', name: 'Rugby'),
      LocationOption(id: 'mock-2', name: 'NRC'),
    ];
  }

  @override
  Future<MyRotaAnchorShift?> getMyRotaAnchorShift({
    required String userId,
    required String fromYmd,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 100));
    return null;
  }

  @override
  Future<MyRotaWeekData> getMyRotaWeek({
    required String weekStartYmd,
    required String locationName,
    required String shiftTypeFilter,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 200));
    final start = DateTime.tryParse(weekStartYmd) ?? DateTime.now();
    final ymds = List<String>.generate(7, (i) {
      final d = DateTime(
        start.year,
        start.month,
        start.day,
      ).add(Duration(days: i));
      final y = d.year.toString().padLeft(4, '0');
      final m = d.month.toString().padLeft(2, '0');
      final day = d.day.toString().padLeft(2, '0');
      return '$y-$m-$day';
    });
    final byDate = <String, List<MyRotaSlot>>{
      for (final k in ymds) k: <MyRotaSlot>[],
    };
    return MyRotaWeekData(
      slotsByDateYmd: byDate,
      attendanceBySlotId: const {},
      fetchedAt: DateTime.now(),
    );
  }

  @override
  Future<void> saveMyRotaAttendance({
    required String scheduledRotaId,
    MyRotaAttendanceStatus? status,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 100));
  }

  @override
  Future<StatsRemoteSnapshot> getStatsPerformance({
    String? startYmd,
    String? endYmd,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 120));
    return StatsRemoteSnapshot(records: const [], fetchedAt: DateTime.now());
  }
}
