import 'dart:async';

import '../../features/stats/domain/stats_models.dart';
import 'models.dart';
import 'my_rota_models.dart';

/// API abstraction for shunter-focused flows. Production: `SupabaseApiClient`.
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

  /// Re-authenticates with [password], permanently deletes the signed-in
  /// user's account and signs out locally.
  Future<void> deleteAccount({required String password});
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
  /// Empty or null [note] removes the stored reason.
  Future<void> saveMyRotaAttendance({
    required String scheduledRotaId,
    MyRotaAttendanceStatus? status,
    String? note,
  });

  Future<StatsRemoteSnapshot> getStatsPerformance({
    String? startYmd,
    String? endYmd,
  });
}
