import '../../../core/network/models.dart';

String stageTwoYmd(DateTime date) =>
    '${date.year.toString().padLeft(4, '0')}-'
    '${date.month.toString().padLeft(2, '0')}-'
    '${date.day.toString().padLeft(2, '0')}';

DateTime stageTwoWeekStart(DateTime date) {
  final day = DateTime(date.year, date.month, date.day);
  return day.subtract(Duration(days: (day.weekday + 1) % 7));
}

class StaffProfile {
  const StaffProfile({
    required this.id,
    required this.firstName,
    required this.lastName,
    this.email = '',
    this.yardSystemId,
    this.agencyId,
    this.agencyName,
    this.shift = 'day',
    this.preferredLocation,
    this.customStartTime,
    this.role = UserRole.user,
    this.isActive = true,
    this.accountStatus = AccountStatus.approved,
    this.lastLogin,
    this.createdAt,
  });

  final String id;
  final String firstName;
  final String lastName;
  final String email;
  final String? yardSystemId;
  final String? agencyId;
  final String? agencyName;
  final String shift;
  final String? preferredLocation;
  final String? customStartTime;
  final UserRole role;
  final bool isActive;
  final AccountStatus accountStatus;
  final DateTime? lastLogin;
  final DateTime? createdAt;

  String get displayName {
    final value = '$firstName $lastName'.trim();
    return value.isEmpty ? (email.isEmpty ? 'Unknown user' : email) : value;
  }
}

class AdminProfileUpdate {
  const AdminProfileUpdate({
    required this.firstName,
    required this.lastName,
    required this.shift,
    required this.role,
    required this.isActive,
    this.yardSystemId,
    this.agencyId,
    this.preferredLocation,
    this.customStartTime,
  });

  final String firstName;
  final String lastName;
  final String shift;
  final UserRole role;
  final bool isActive;
  final String? yardSystemId;
  final String? agencyId;
  final String? preferredLocation;
  final String? customStartTime;
}

class ManagerRotaEntry {
  const ManagerRotaEntry({
    required this.id,
    required this.dateYmd,
    required this.shift,
    required this.location,
    required this.userId,
    required this.name,
    this.attendance,
  });

  final String id;
  final String dateYmd;
  final String shift;
  final String location;
  final String userId;
  final String name;
  final String? attendance;
}

class ManagerDaySummary {
  const ManagerDaySummary(this.entries);
  final List<ManagerRotaEntry> entries;

  int headcount(String shift) => entries
      .where((item) => item.shift == shift && item.attendance == null)
      .length;

  int absences(String status, {String? shift}) => entries
      .where(
        (item) =>
            item.attendance == status && (shift == null || item.shift == shift),
      )
      .length;

  List<ManagerRotaEntry> staff(String shift) =>
      entries.where((item) => item.shift == shift).toList(growable: false);
}

class AdminAvailability {
  const AdminAvailability({
    required this.userId,
    required this.dateYmd,
    required this.status,
    this.comment,
    this.id,
  });

  final String? id;
  final String userId;
  final String dateYmd;
  final AvailabilityStatus status;
  final String? comment;
}

class RotaSlot {
  const RotaSlot({
    required this.id,
    required this.dateYmd,
    required this.shift,
    required this.location,
    required this.startTime,
    required this.endTime,
    required this.capacity,
    this.status,
    this.assignments = const <RotaAssignment>[],
  });

  final String id;
  final String dateYmd;
  final String shift;
  final String location;
  final String startTime;
  final String endTime;
  final int capacity;
  final String? status;
  final List<RotaAssignment> assignments;

  String get identity => '$dateYmd|$shift|$location|$startTime|$endTime';
}

class RotaAssignment {
  const RotaAssignment({
    required this.rowId,
    required this.userId,
    required this.name,
    this.task,
  });

  final String rowId;
  final String userId;
  final String name;
  final String? task;
}

class RotaSlotDraft {
  const RotaSlotDraft({
    required this.dateYmd,
    required this.shift,
    required this.location,
    required this.startTime,
    required this.endTime,
    required this.capacity,
    this.status,
  });

  final String dateYmd;
  final String shift;
  final String location;
  final String startTime;
  final String endTime;
  final int capacity;
  final String? status;
}

class RotaTemplate {
  const RotaTemplate({
    required this.id,
    required this.name,
    required this.slots,
  });

  final String id;
  final String name;
  final List<Map<String, dynamic>> slots;
}

class BreakSlot {
  const BreakSlot({
    required this.id,
    required this.dateYmd,
    required this.shift,
    required this.location,
    required this.startTime,
    required this.durationMinutes,
    required this.breakType,
    required this.capacity,
    this.standardSlotId,
    this.assignments = const <BreakAssignment>[],
  });

  final String id;
  final String dateYmd;
  final String shift;
  final String location;
  final String startTime;
  final int durationMinutes;
  final String breakType;
  final int capacity;
  final String? standardSlotId;
  final List<BreakAssignment> assignments;

  String get identity =>
      '$dateYmd|$shift|$location|$startTime|$durationMinutes|$breakType';
}

class BreakAssignment {
  const BreakAssignment({
    required this.rowId,
    required this.userId,
    required this.name,
    this.attendance,
  });

  final String rowId;
  final String userId;
  final String name;
  final String? attendance;
}

class BreakSlotDraft {
  const BreakSlotDraft({
    required this.dateYmd,
    required this.shift,
    required this.location,
    required this.startTime,
    required this.durationMinutes,
    required this.breakType,
    required this.capacity,
  });

  final String dateYmd;
  final String shift;
  final String location;
  final String startTime;
  final int durationMinutes;
  final String breakType;
  final int capacity;
}

bool wouldExceedMaxConsecutiveDays({
  required Iterable<String> workedDates,
  required String candidateYmd,
  int maximum = 6,
}) {
  final dates = workedDates.map(DateTime.parse).toSet()
    ..add(DateTime.parse(candidateYmd));
  if (dates.isEmpty) return false;
  final ordered = dates.toList()..sort();
  var streak = 1;
  for (var i = 1; i < ordered.length; i++) {
    if (ordered[i].difference(ordered[i - 1]).inDays == 1) {
      streak++;
      if (streak > maximum) return true;
    } else {
      streak = 1;
    }
  }
  return false;
}
