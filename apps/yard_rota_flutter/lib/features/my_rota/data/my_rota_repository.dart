import '../../../core/network/api_client.dart';
import '../../../core/network/my_rota_models.dart';
import '../../../core/network/retry_executor.dart';
import '../domain/my_rota_week_logic.dart';

class MyRotaRepository {
  MyRotaRepository({required ApiClient apiClient}) : _apiClient = apiClient;

  final ApiClient _apiClient;

  Future<List<LocationOption>> loadActiveLocations() async {
    return RetryExecutor.run(task: _apiClient.getActiveLocations);
  }

  Future<MyRotaAnchorShift?> loadAnchorShift({
    required String userId,
    required DateTime fromDate,
  }) async {
    return RetryExecutor.run(
      task: () => _apiClient.getMyRotaAnchorShift(
        userId: userId,
        fromYmd: myRotaToYmd(myRotaDateOnly(fromDate)),
      ),
    );
  }

  /// Picks saved location if still valid, else [fallbackName] or first list item.
  String resolveLocationName({
    required List<LocationOption> locations,
    String? savedName,
    String? fallbackName,
  }) {
    if (locations.isEmpty) {
      return fallbackName ?? 'Rugby';
    }
    if (savedName != null && locations.any((loc) => loc.name == savedName)) {
      return savedName;
    }
    if (fallbackName != null &&
        locations.any((loc) => loc.name == fallbackName)) {
      return fallbackName;
    }
    return locations.first.name;
  }

  static const String kShiftAll = 'all';
  static const String kShiftDay = 'day';
  static const String kShiftAfternoon = 'afternoon';
  static const String kShiftNight = 'night';

  static const Set<String> kShiftValues = {
    kShiftAll,
    kShiftDay,
    kShiftAfternoon,
    kShiftNight,
  };

  String resolveShiftTypeFilter(String? saved) {
    if (saved != null && kShiftValues.contains(saved)) {
      return saved;
    }
    return kShiftAll;
  }

  Future<MyRotaWeekData> loadWeek({
    required DateTime weekStartSaturday,
    required String locationName,
    required String shiftTypeFilter,
  }) async {
    final ymd = myRotaToYmd(weekStartSaturday);
    return RetryExecutor.run(
      task: () => _apiClient.getMyRotaWeek(
        weekStartYmd: ymd,
        locationName: locationName,
        shiftTypeFilter: shiftTypeFilter,
      ),
    );
  }

  /// Ensures every day in the week has a list entry (empty list if no data).
  Map<String, List<MyRotaSlot>> mergeWithWeekKeys(
    DateTime weekStartSaturday,
    Map<String, List<MyRotaSlot>> fromApi,
  ) {
    final keys = myRotaWeekDateYmds(weekStartSaturday);
    final out = <String, List<MyRotaSlot>>{};
    for (final k in keys) {
      out[k] = List<MyRotaSlot>.from(fromApi[k] ?? const []);
    }
    return out;
  }

  Future<void> saveAttendance({
    required String scheduledRotaId,
    MyRotaAttendanceStatus? status,
  }) async {
    await RetryExecutor.run(
      task: () => _apiClient.saveMyRotaAttendance(
        scheduledRotaId: scheduledRotaId,
        status: status,
      ),
    );
  }
}
