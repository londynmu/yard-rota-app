import 'dart:typed_data';

enum UserRole {
  user('user', 'User'),
  admin('admin', 'Admin'),
  vmu('vmu', 'VMU'),
  transportManager('transport_manager', 'Transport manager');

  const UserRole(this.dbValue, this.label);

  final String dbValue;
  final String label;

  static UserRole fromDb(String? value) {
    return UserRole.values.firstWhere(
      (role) => role.dbValue == value,
      orElse: () => UserRole.user,
    );
  }
}

enum AccountStatus {
  pendingApproval('pending_approval', 'Pending approval'),
  approved('approved', 'Approved'),
  rejected('rejected', 'Rejected');

  const AccountStatus(this.dbValue, this.label);

  final String dbValue;
  final String label;

  static AccountStatus fromDb(String? value) {
    return AccountStatus.values.firstWhere(
      (status) => status.dbValue == value,
      orElse: () => AccountStatus.pendingApproval,
    );
  }
}

enum AuthFlowEvent { signedIn, signedOut, passwordRecovery, tokenRefreshed }

class UserSession {
  const UserSession({
    required this.userId,
    required this.displayName,
    this.email = '',
    this.role = UserRole.user,
    this.accountStatus = AccountStatus.approved,
    this.profileCompleted = true,
  });

  final String userId;
  final String displayName;
  final String email;
  final UserRole role;
  final AccountStatus accountStatus;
  final bool profileCompleted;

  String get userRole => role.dbValue;

  bool get isAdmin => role == UserRole.admin;
  bool get isVmu => role == UserRole.vmu;
  bool get isTransportManager => role == UserRole.transportManager;
  bool get isPrivileged => isAdmin || isVmu || isTransportManager;
  bool get requiresProfileCompletion => !isPrivileged && !profileCompleted;
  bool get isAwaitingApproval =>
      !isPrivileged && accountStatus == AccountStatus.pendingApproval;
  bool get isRejected =>
      !isPrivileged && accountStatus == AccountStatus.rejected;
  bool get canEnterApp =>
      isPrivileged ||
      (profileCompleted && accountStatus == AccountStatus.approved);

  UserSession copyWith({
    String? displayName,
    String? email,
    UserRole? role,
    AccountStatus? accountStatus,
    bool? profileCompleted,
  }) {
    return UserSession(
      userId: userId,
      displayName: displayName ?? this.displayName,
      email: email ?? this.email,
      role: role ?? this.role,
      accountStatus: accountStatus ?? this.accountStatus,
      profileCompleted: profileCompleted ?? this.profileCompleted,
    );
  }
}

class RegistrationResult {
  const RegistrationResult({required this.requiresEmailConfirmation});

  final bool requiresEmailConfirmation;
}

class UserProfile {
  const UserProfile({
    required this.userId,
    required this.email,
    this.firstName = '',
    this.lastName = '',
    this.shiftPreference = 'day',
    this.avatarUrl,
    this.customStartTime,
    this.preferredLocation,
    this.agencyId,
    this.role = UserRole.user,
    this.accountStatus = AccountStatus.pendingApproval,
    this.profileCompleted = false,
  });

  final String userId;
  final String email;
  final String firstName;
  final String lastName;
  final String shiftPreference;
  final String? avatarUrl;
  final String? customStartTime;
  final String? preferredLocation;
  final String? agencyId;
  final UserRole role;
  final AccountStatus accountStatus;
  final bool profileCompleted;

  String get displayName {
    final name = '$firstName $lastName'.trim();
    return name.isEmpty ? email : name;
  }

  bool get hasRequiredFields =>
      firstName.trim().isNotEmpty &&
      lastName.trim().isNotEmpty &&
      shiftPreference.trim().isNotEmpty &&
      (customStartTime?.trim().isNotEmpty ?? false) &&
      (preferredLocation?.trim().isNotEmpty ?? false) &&
      (agencyId?.trim().isNotEmpty ?? false);
}

class UpdateProfileRequest {
  const UpdateProfileRequest({
    required this.firstName,
    required this.lastName,
    required this.shiftPreference,
    required this.customStartTime,
    required this.preferredLocation,
    required this.agencyId,
    this.avatarUrl,
    this.completeProfile = false,
  });

  final String firstName;
  final String lastName;
  final String shiftPreference;
  final String customStartTime;
  final String preferredLocation;
  final String agencyId;
  final String? avatarUrl;
  final bool completeProfile;
}

class AvatarUpload {
  const AvatarUpload({
    required this.bytes,
    required this.fileExtension,
    required this.contentType,
  });

  final Uint8List bytes;
  final String fileExtension;
  final String contentType;
}

class AgencyOption {
  const AgencyOption({required this.id, required this.name});

  final String id;
  final String name;
}

class AttendanceHistoryItem {
  const AttendanceHistoryItem({
    required this.dateYmd,
    required this.status,
    this.recordedAt,
  });

  final String dateYmd;
  final String status;
  final DateTime? recordedAt;
}

class ViolationHistoryItem {
  const ViolationHistoryItem({
    required this.id,
    required this.body,
    required this.createdAt,
    this.category,
  });

  final String id;
  final String body;
  final DateTime createdAt;
  final String? category;
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
