// Types for weekly location rota (PWA "My Rota" parity).

class LocationOption {
  const LocationOption({required this.id, required this.name});

  final String id;
  final String name;
}

class MyRotaAnchorShift {
  const MyRotaAnchorShift({
    required this.dateYmd,
    required this.location,
    required this.shiftType,
    required this.startTime,
    required this.endTime,
  });

  final String dateYmd;
  final String location;
  final String shiftType;
  final String startTime;
  final String endTime;
}

/// DB values: `no_show`, `sick`, `late`.
enum MyRotaAttendanceStatus {
  noShow('no_show'),
  sick('sick'),
  late('late');

  const MyRotaAttendanceStatus(this.dbValue);

  final String dbValue;

  static MyRotaAttendanceStatus? fromDbValue(String? raw) {
    if (raw == null || raw.isEmpty) {
      return null;
    }
    for (final v in MyRotaAttendanceStatus.values) {
      if (v.dbValue == raw) {
        return v;
      }
    }
    return null;
  }

  String get labelEnglish {
    switch (this) {
      case MyRotaAttendanceStatus.noShow:
        return 'No show';
      case MyRotaAttendanceStatus.sick:
        return 'Sick';
      case MyRotaAttendanceStatus.late:
        return 'Late';
    }
  }
}

class MyRotaSlot {
  const MyRotaSlot({
    required this.id,
    required this.dateYmd,
    required this.shiftType,
    required this.location,
    required this.startTime,
    required this.endTime,
    required this.userId,
    this.firstName,
    this.lastName,
    this.avatarUrl,
    this.task,
  });

  final String id;
  final String dateYmd;
  final String shiftType;
  final String location;
  final String startTime;
  final String endTime;
  final String userId;
  final String? firstName;
  final String? lastName;
  final String? avatarUrl;
  final String? task;

  String? get displayNameOrNull {
    final a = (firstName ?? '').trim();
    final b = (lastName ?? '').trim();
    final joined = '$a $b'.trim();
    return joined.isEmpty ? null : joined;
  }

  String get displayName {
    final value = displayNameOrNull;
    assert(
      value != null,
      'MyRotaSlot.displayName requires a real profile name.',
    );
    return value ?? '';
  }

  String fmtTimeShort() {
    String t(String raw) {
      if (raw.length >= 5) {
        return raw.substring(0, 5);
      }
      return raw;
    }

    return t(startTime);
  }
}

class MyRotaWeekData {
  const MyRotaWeekData({
    required this.slotsByDateYmd,
    required this.attendanceBySlotId,
    required this.fetchedAt,
  });

  /// Keys `yyyy-MM-dd`; values sorted like PWA (time, name).
  final Map<String, List<MyRotaSlot>> slotsByDateYmd;

  /// Slot id → status (absence); missing entry means present.
  final Map<String, MyRotaAttendanceStatus> attendanceBySlotId;

  final DateTime fetchedAt;
}
