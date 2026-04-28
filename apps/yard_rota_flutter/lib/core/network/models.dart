class UserSession {
  const UserSession({required this.userId, required this.displayName});

  final String userId;
  final String displayName;
}

class ShiftOverview {
  const ShiftOverview({
    required this.title,
    required this.window,
    required this.location,
    required this.status,
  });

  final String title;
  final String window;
  final String location;
  final String status;
}

class BreakItem {
  const BreakItem({
    required this.id,
    required this.label,
    required this.window,
    required this.isActive,
  });

  final String id;
  final String label;
  final String window;
  final bool isActive;
}

class NotificationItem {
  const NotificationItem({
    required this.id,
    required this.title,
    required this.message,
    required this.severity,
  });

  final String id;
  final String title;
  final String message;
  final String severity;
}

class CalendarShift {
  const CalendarShift({
    required this.title,
    required this.startTime,
    required this.endTime,
    required this.location,
    required this.status,
  });

  final String title;
  final String startTime;
  final String endTime;
  final String location;
  final String status;
}

class CalendarDaySchedule {
  const CalendarDaySchedule({required this.date, required this.shifts});

  final DateTime date;
  final List<CalendarShift> shifts;
}

class CalendarMonthData {
  const CalendarMonthData({
    required this.year,
    required this.month,
    required this.scheduledDays,
    required this.fetchedAt,
  });

  final int year;
  final int month;
  final List<CalendarDaySchedule> scheduledDays;
  final DateTime fetchedAt;

  CalendarDaySchedule? scheduleForDay(int day) {
    for (final schedule in scheduledDays) {
      if (schedule.date.day == day) {
        return schedule;
      }
    }
    return null;
  }
}

enum AvailabilityStatus {
  available('available'),
  unavailable('unavailable'),
  holiday('holiday');

  const AvailabilityStatus(this.dbValue);

  final String dbValue;

  static AvailabilityStatus fromDbValue(String raw) {
    return AvailabilityStatus.values.firstWhere(
      (value) => value.dbValue == raw,
      orElse: () => AvailabilityStatus.available,
    );
  }
}

class AvailabilityEntry {
  const AvailabilityEntry({
    this.id,
    required this.dateYmd,
    required this.status,
    this.comment,
  });

  final String? id;
  final String dateYmd;
  final AvailabilityStatus status;
  final String? comment;
}

class SaveAvailabilityItem {
  const SaveAvailabilityItem({required this.dateYmd, required this.status});

  final String dateYmd;
  final AvailabilityStatus status;
}

class SaveAvailabilityRequest {
  const SaveAvailabilityRequest({
    required this.items,
    required this.comment,
    required this.applyComment,
  });

  final List<SaveAvailabilityItem> items;
  final String comment;
  final bool applyComment;
}
