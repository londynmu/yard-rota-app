enum PreCheckStep { select, form, completed, duringShift, success }

enum PreCheckType {
  preShift('pre_shift'),
  duringShift('during_shift');

  const PreCheckType(this.dbValue);
  final String dbValue;
}

enum PreCheckItemStatus {
  blank(''),
  ok('ok'),
  repairNeeded('repair_needed'),
  na('na');

  const PreCheckItemStatus(this.dbValue);
  final String dbValue;

  static PreCheckItemStatus fromDbValue(String? value) {
    return PreCheckItemStatus.values.firstWhere(
      (status) => status.dbValue == (value ?? ''),
      orElse: () => PreCheckItemStatus.blank,
    );
  }
}

enum PreCheckSchemaStatus { checking, ok, mismatch, error }

class PreCheckTug {
  const PreCheckTug({
    required this.id,
    required this.tugNumber,
    this.displayName,
    this.locationId,
    this.locationName,
    this.openDefectCount = 0,
  });

  final String id;
  final String tugNumber;
  final String? displayName;
  final String? locationId;
  final String? locationName;
  final int openDefectCount;

  String get label {
    final trimmed = displayName?.trim();
    return trimmed == null || trimmed.isEmpty ? tugNumber : trimmed;
  }

  String get secondaryLabel {
    if (displayName == null || displayName == tugNumber) {
      return locationName ?? '';
    }
    return [
      tugNumber,
      locationName,
    ].where((v) => v != null && v.isNotEmpty).join(' • ');
  }
}

class PreCheckShift {
  const PreCheckShift({
    required this.dateYmd,
    required this.startTime,
    required this.endTime,
    this.location,
    this.shiftType,
  });

  final String dateYmd;
  final String startTime;
  final String endTime;
  final String? location;
  final String? shiftType;
}

class PreCheckShiftWindow {
  const PreCheckShiftWindow({required this.start, required this.end});

  final DateTime start;
  final DateTime end;
}

class PreCheckSubmissionSummary {
  const PreCheckSubmissionSummary({
    required this.id,
    required this.tugId,
    required this.tugNumber,
    this.tugDisplayName,
    required this.checkTime,
    this.queued = false,
  });

  final String id;
  final String tugId;
  final String tugNumber;
  final String? tugDisplayName;
  final DateTime checkTime;
  final bool queued;

  String get tugLabel {
    final display = tugDisplayName?.trim();
    return display == null || display.isEmpty ? tugNumber : display;
  }
}

class PreCheckItemDefinition {
  const PreCheckItemDefinition({
    required this.key,
    required this.label,
    required this.category,
    this.tooltip,
    this.allowNa = false,
  });

  final String key;
  final String label;
  final String category;
  final String? tooltip;
  final bool allowNa;
}

class PreCheckKnownDefect {
  const PreCheckKnownDefect({
    required this.id,
    required this.itemKey,
    required this.description,
    required this.reporterName,
    required this.dateLabel,
    this.imageUrls = const <String>[],
  });

  final String id;
  final String itemKey;
  final String description;
  final String reporterName;
  final String dateLabel;
  final List<String> imageUrls;
}

class PreCheckPhoto {
  const PreCheckPhoto({
    required this.id,
    required this.path,
    this.url,
    this.name,
    this.contentType = 'image/jpeg',
  });

  final String id;
  final String path;
  final String? url;
  final String? name;
  final String contentType;

  Map<String, dynamic> toJson() => <String, dynamic>{
    'id': id,
    'path': path,
    'url': url,
    'name': name,
    'contentType': contentType,
  };

  static PreCheckPhoto fromJson(Map<String, dynamic> json) {
    return PreCheckPhoto(
      id: json['id'] as String? ?? '',
      path: json['path'] as String? ?? '',
      url: json['url'] as String?,
      name: json['name'] as String?,
      contentType: json['contentType'] as String? ?? 'image/jpeg',
    );
  }
}

class PreCheckItemState {
  const PreCheckItemState({
    this.status = PreCheckItemStatus.blank,
    this.notes = '',
    this.photos = const <PreCheckPhoto>[],
    this.linkedDamageId,
  });

  final PreCheckItemStatus status;
  final String notes;
  final List<PreCheckPhoto> photos;
  final String? linkedDamageId;

  PreCheckItemState copyWith({
    PreCheckItemStatus? status,
    String? notes,
    List<PreCheckPhoto>? photos,
    String? linkedDamageId,
    bool clearLinkedDamageId = false,
  }) {
    return PreCheckItemState(
      status: status ?? this.status,
      notes: notes ?? this.notes,
      photos: photos ?? this.photos,
      linkedDamageId: clearLinkedDamageId
          ? null
          : (linkedDamageId ?? this.linkedDamageId),
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
    'status': status.dbValue,
    'notes': notes,
    'photos': photos.map((photo) => photo.toJson()).toList(),
    'linkedDamageId': linkedDamageId,
  };

  static PreCheckItemState fromJson(Map<String, dynamic> json) {
    return PreCheckItemState(
      status: PreCheckItemStatus.fromDbValue(json['status'] as String?),
      notes: json['notes'] as String? ?? '',
      photos: ((json['photos'] as List<dynamic>?) ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(PreCheckPhoto.fromJson)
          .toList(growable: false),
      linkedDamageId: json['linkedDamageId'] as String?,
    );
  }
}

class PreCheckDraft {
  const PreCheckDraft({
    required this.formSessionId,
    this.itemStates = const <String, PreCheckItemState>{},
    this.remarks = '',
    this.remarksPhotos = const <PreCheckPhoto>[],
    this.markedResolvedDamageIds = const <String>[],
  });

  final String formSessionId;
  final Map<String, PreCheckItemState> itemStates;
  final String remarks;
  final List<PreCheckPhoto> remarksPhotos;
  final List<String> markedResolvedDamageIds;

  PreCheckDraft copyWith({
    String? formSessionId,
    Map<String, PreCheckItemState>? itemStates,
    String? remarks,
    List<PreCheckPhoto>? remarksPhotos,
    List<String>? markedResolvedDamageIds,
  }) {
    return PreCheckDraft(
      formSessionId: formSessionId ?? this.formSessionId,
      itemStates: itemStates ?? this.itemStates,
      remarks: remarks ?? this.remarks,
      remarksPhotos: remarksPhotos ?? this.remarksPhotos,
      markedResolvedDamageIds:
          markedResolvedDamageIds ?? this.markedResolvedDamageIds,
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
    'formSessionId': formSessionId,
    'itemStates': itemStates.map((key, value) => MapEntry(key, value.toJson())),
    'remarks': remarks,
    'remarksPhotos': remarksPhotos.map((photo) => photo.toJson()).toList(),
    'markedResolvedDamageIds': markedResolvedDamageIds,
  };

  static PreCheckDraft fromJson(Map<String, dynamic> json) {
    final rawStates = json['itemStates'] as Map<String, dynamic>? ?? const {};
    return PreCheckDraft(
      formSessionId: json['formSessionId'] as String? ?? '',
      itemStates: rawStates.map(
        (key, value) => MapEntry(
          key,
          value is Map<String, dynamic>
              ? PreCheckItemState.fromJson(value)
              : const PreCheckItemState(),
        ),
      ),
      remarks: json['remarks'] as String? ?? '',
      remarksPhotos:
          ((json['remarksPhotos'] as List<dynamic>?) ?? const <dynamic>[])
              .whereType<Map<String, dynamic>>()
              .map(PreCheckPhoto.fromJson)
              .toList(growable: false),
      markedResolvedDamageIds:
          ((json['markedResolvedDamageIds'] as List<dynamic>?) ??
                  const <dynamic>[])
              .whereType<String>()
              .toList(growable: false),
    );
  }
}

class PreCheckValidationResult {
  const PreCheckValidationResult({
    required this.isValid,
    this.uncheckedCount = 0,
    this.missingDescriptionCount = 0,
    this.firstInvalidItemKey,
  });

  final bool isValid;
  final int uncheckedCount;
  final int missingDescriptionCount;
  final String? firstInvalidItemKey;
}

class PreCheckProgress {
  const PreCheckProgress({
    required this.total,
    required this.checked,
    required this.issueCount,
  });

  final int total;
  final int checked;
  final int issueCount;
}

class PreCheckQueueStatus {
  const PreCheckQueueStatus({
    this.total = 0,
    this.pending = 0,
    this.failed = 0,
  });

  final int total;
  final int pending;
  final int failed;
}

class PreCheckInitialData {
  const PreCheckInitialData({
    required this.userLocationId,
    required this.shiftChecks,
    required this.duringShiftDamageEnabled,
    required this.queueStatus,
  });

  final String? userLocationId;
  final List<PreCheckSubmissionSummary> shiftChecks;
  final bool duringShiftDamageEnabled;
  final PreCheckQueueStatus queueStatus;
}

PreCheckShiftWindow? getPreCheckShiftWindow(
  List<PreCheckShift> shifts, {
  DateTime? now,
}) {
  final instant = now ?? DateTime.now();
  for (final shift in shifts) {
    final start = DateTime.tryParse('${shift.dateYmd}T${shift.startTime}:00');
    final rawEnd = DateTime.tryParse('${shift.dateYmd}T${shift.endTime}:00');
    if (start == null || rawEnd == null) {
      continue;
    }
    var end = rawEnd;
    if (!end.isAfter(start)) {
      end = end.add(const Duration(days: 1));
    }
    final bufferStart = start.subtract(const Duration(hours: 1));
    if (!instant.isBefore(bufferStart) && !instant.isAfter(end)) {
      return PreCheckShiftWindow(start: start, end: end);
    }
  }
  return null;
}

PreCheckShiftWindow? getPreCheckFallbackWindow(
  List<PreCheckSubmissionSummary> checks,
) {
  if (checks.isEmpty) {
    return null;
  }
  final earliest = checks.last.checkTime;
  return PreCheckShiftWindow(
    start: earliest,
    end: earliest.add(const Duration(hours: 12)),
  );
}

List<String> stateKeysForItem(
  PreCheckItemDefinition item,
  Map<String, List<PreCheckKnownDefect>> defectsByItem,
) {
  final defects = defectsByItem[item.key] ?? const <PreCheckKnownDefect>[];
  if (defects.length <= 1) {
    return <String>[item.key];
  }
  return defects.map((defect) => '${item.key}::${defect.id}').toList();
}

PreCheckItemStatus effectiveStatusForItem({
  required PreCheckItemDefinition item,
  required PreCheckDraft draft,
  required Map<String, List<PreCheckKnownDefect>> defectsByItem,
}) {
  final defects = defectsByItem[item.key] ?? const <PreCheckKnownDefect>[];
  if (defects.isEmpty) {
    return draft.itemStates[item.key]?.status ?? PreCheckItemStatus.blank;
  }
  if (defects.length == 1) {
    final status = draft.itemStates[item.key]?.status;
    final allMarked = defects.every(
      (defect) => draft.markedResolvedDamageIds.contains(defect.id),
    );
    return status == null || status == PreCheckItemStatus.blank
        ? (allMarked ? PreCheckItemStatus.ok : PreCheckItemStatus.blank)
        : status;
  }
  final stateKeys = defects.map((defect) => '${item.key}::${defect.id}');
  final hasExistingRepair = stateKeys.any(
    (key) => draft.itemStates[key]?.status == PreCheckItemStatus.repairNeeded,
  );
  final hasNewRepair =
      draft.itemStates['${item.key}::new']?.status ==
      PreCheckItemStatus.repairNeeded;
  if (hasExistingRepair || hasNewRepair) {
    return PreCheckItemStatus.repairNeeded;
  }
  final allMarked = defects.every(
    (defect) => draft.markedResolvedDamageIds.contains(defect.id),
  );
  return allMarked ? PreCheckItemStatus.ok : PreCheckItemStatus.blank;
}

bool isPreCheckItemHandled({
  required PreCheckItemDefinition item,
  required PreCheckDraft draft,
  required Map<String, List<PreCheckKnownDefect>> defectsByItem,
}) {
  final defects = defectsByItem[item.key] ?? const <PreCheckKnownDefect>[];
  if (defects.isEmpty) {
    final status =
        draft.itemStates[item.key]?.status ?? PreCheckItemStatus.blank;
    return status != PreCheckItemStatus.blank;
  }
  if (defects.length == 1) {
    final status =
        draft.itemStates[item.key]?.status ?? PreCheckItemStatus.blank;
    if (status != PreCheckItemStatus.blank) {
      return true;
    }
    return defects.every(
      (defect) => draft.markedResolvedDamageIds.contains(defect.id),
    );
  }
  final stateKeys = defects.map((defect) => '${item.key}::${defect.id}');
  final allDefectsHandled = stateKeys.every((key) {
    final state = draft.itemStates[key];
    if (state?.status == PreCheckItemStatus.repairNeeded &&
        state?.linkedDamageId != null) {
      return true;
    }
    final defectId = key.split('::')[1];
    return draft.markedResolvedDamageIds.contains(defectId);
  });
  final newState = draft.itemStates['${item.key}::new'];
  final newDefectComplete =
      newState?.status == PreCheckItemStatus.repairNeeded &&
      newState!.notes.trim().isNotEmpty;
  return allDefectsHandled || newDefectComplete;
}

PreCheckValidationResult validatePreCheckDraft({
  required List<PreCheckItemDefinition> items,
  required PreCheckDraft draft,
  required Map<String, List<PreCheckKnownDefect>> defectsByItem,
}) {
  var unchecked = 0;
  var missingDescriptions = 0;
  String? firstInvalid;

  for (final item in items) {
    if (!isPreCheckItemHandled(
      item: item,
      draft: draft,
      defectsByItem: defectsByItem,
    )) {
      unchecked += 1;
      firstInvalid ??= item.key;
    }

    final defects = defectsByItem[item.key] ?? const <PreCheckKnownDefect>[];
    final keys = defects.length >= 2
        ? <String>[...stateKeysForItem(item, defectsByItem), '${item.key}::new']
        : stateKeysForItem(item, defectsByItem);
    for (final key in keys) {
      final state = draft.itemStates[key];
      if (state?.status != PreCheckItemStatus.repairNeeded) {
        continue;
      }
      if (state?.linkedDamageId != null) {
        continue;
      }
      if ((state?.notes.trim().isEmpty ?? true)) {
        missingDescriptions += 1;
        firstInvalid ??= item.key;
      }
    }
  }

  return PreCheckValidationResult(
    isValid: unchecked == 0 && missingDescriptions == 0,
    uncheckedCount: unchecked,
    missingDescriptionCount: missingDescriptions,
    firstInvalidItemKey: firstInvalid,
  );
}

PreCheckProgress calculatePreCheckProgress({
  required List<PreCheckItemDefinition> items,
  required PreCheckDraft draft,
  required Map<String, List<PreCheckKnownDefect>> defectsByItem,
}) {
  var checked = 0;
  var issueCount = 0;
  for (final item in items) {
    if (isPreCheckItemHandled(
      item: item,
      draft: draft,
      defectsByItem: defectsByItem,
    )) {
      checked += 1;
    }
    if (effectiveStatusForItem(
          item: item,
          draft: draft,
          defectsByItem: defectsByItem,
        ) ==
        PreCheckItemStatus.repairNeeded) {
      issueCount += 1;
    }
  }
  return PreCheckProgress(
    total: items.length,
    checked: checked,
    issueCount: issueCount,
  );
}

String preCheckDateToYmd(DateTime date) {
  final y = date.year.toString().padLeft(4, '0');
  final m = date.month.toString().padLeft(2, '0');
  final d = date.day.toString().padLeft(2, '0');
  return '$y-$m-$d';
}
