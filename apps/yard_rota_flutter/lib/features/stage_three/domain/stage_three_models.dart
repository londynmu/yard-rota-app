import 'dart:convert';

enum RepairStatus {
  open('open', 'Open'),
  reported('reported', 'Reported'),
  awaitingParts('awaiting_parts', 'Awaiting Parts'),
  inProgress('in_progress', 'In Progress'),
  resolved('resolved', 'Resolved');

  const RepairStatus(this.dbValue, this.label);
  final String dbValue;
  final String label;

  static RepairStatus fromDb(Object? value) => values.firstWhere(
    (status) => status.dbValue == value,
    orElse: () => RepairStatus.open,
  );
}

class TugRecord {
  const TugRecord({
    required this.id,
    required this.number,
    required this.status,
    this.displayName,
    this.locationId,
    this.locationName,
    this.qrToken,
  });
  final String id;
  final String number;
  final String status;
  final String? displayName;
  final String? locationId;
  final String? locationName;
  final String? qrToken;
  String get label =>
      displayName?.trim().isNotEmpty == true ? displayName! : number;
}

class TugTablet {
  const TugTablet({
    required this.id,
    required this.tugId,
    required this.serialNumber,
    this.tugLabel,
  });
  final String id;
  final String tugId;
  final String serialNumber;
  final String? tugLabel;
}

class DefectRecord {
  const DefectRecord({
    required this.id,
    required this.submissionId,
    required this.tugId,
    required this.tugLabel,
    required this.tugNumber,
    required this.description,
    required this.status,
    required this.createdAt,
    required this.reporterName,
    this.defectNumber,
    this.reportedToTerbergAt,
    this.vmuNotes,
    this.resolvedAt,
    this.resolvedBy,
    this.resolvedByName,
    this.itemLabel,
    this.imageUrls = const [],
  });
  final String id;
  final String submissionId;
  final String tugId;
  final String tugLabel;
  final String tugNumber;
  final String description;
  final RepairStatus status;
  final DateTime createdAt;
  final String reporterName;
  final String? defectNumber;
  final DateTime? reportedToTerbergAt;
  final String? vmuNotes;
  final DateTime? resolvedAt;
  final String? resolvedBy;
  final String? resolvedByName;
  final String? itemLabel;
  final List<String> imageUrls;

  bool matches({String tug = '', String status = '', String search = ''}) {
    if (tug.isNotEmpty && tugId != tug) return false;
    if (status.isNotEmpty && this.status.dbValue != status) return false;
    final query = search.trim().toLowerCase();
    if (query.isEmpty) return true;
    return [
      description,
      defectNumber,
      tugLabel,
      tugNumber,
      vmuNotes,
      itemLabel,
    ].whereType<String>().any((value) => value.toLowerCase().contains(query));
  }
}

class DefectActivity {
  const DefectActivity({
    required this.id,
    required this.type,
    required this.createdAt,
    required this.actorName,
    this.fieldName,
    this.oldValue,
    this.newValue,
  });
  final String id;
  final String type;
  final DateTime createdAt;
  final String actorName;
  final String? fieldName;
  final String? oldValue;
  final String? newValue;
}

class PreCheckItemRecord {
  const PreCheckItemRecord({
    required this.id,
    required this.name,
    required this.category,
    required this.status,
    this.notes,
  });
  final String id;
  final String name;
  final String category;
  final String status;
  final String? notes;
}

class PreCheckSubmissionRecord {
  const PreCheckSubmissionRecord({
    required this.id,
    required this.tugId,
    required this.tugLabel,
    required this.tugNumber,
    required this.userName,
    required this.checkType,
    required this.checkDate,
    required this.checkTime,
    required this.items,
    required this.defects,
    this.locationName,
    this.remarks,
  });
  final String id;
  final String tugId;
  final String tugLabel;
  final String tugNumber;
  final String userName;
  final String checkType;
  final String checkDate;
  final DateTime checkTime;
  final String? locationName;
  final String? remarks;
  final List<PreCheckItemRecord> items;
  final List<DefectRecord> defects;
  bool get hasOpenFaults =>
      defects.any((item) => item.status != RepairStatus.resolved);
}

class CheckItemDefinition {
  const CheckItemDefinition({
    required this.id,
    required this.key,
    required this.label,
    required this.category,
    required this.sortOrder,
    required this.isActive,
    required this.allowNa,
    this.tooltip,
  });
  final String id;
  final String key;
  final String label;
  final String category;
  final int sortOrder;
  final bool isActive;
  final bool allowNa;
  final String? tooltip;
}

class PerformanceRow {
  const PerformanceRow({
    required this.yardSystemId,
    required this.fullName,
    required this.moves,
    required this.averageCollect,
    required this.averageTravel,
    required this.shiftCount,
    this.userId,
  });
  final String yardSystemId;
  final String fullName;
  final int moves;
  final double averageCollect;
  final double averageTravel;
  final int shiftCount;
  final String? userId;
  bool get matched => userId != null;
}

class CsvPerformanceParser {
  const CsvPerformanceParser._();

  static List<PerformanceRow> parse(String csv) {
    final lines = const LineSplitter()
        .convert(csv)
        .where((line) => line.trim().isNotEmpty)
        .toList();
    if (lines.length < 2) return const [];
    final headers = _split(lines.first).map(_normalise).toList();
    int index(List<String> names) {
      for (final name in names) {
        final value = headers.indexOf(name);
        if (value >= 0) return value;
      }
      return -1;
    }

    final idIndex = index(['yardsystemid', 'yardid', 'employeeid', 'id']);
    final nameIndex = index(['fullname', 'name', 'shunter']);
    final movesIndex = index(['numberofmoves', 'moves', 'totalmoves']);
    final collectIndex = index([
      'avgtimetocollect',
      'averagecollect',
      'avgcollect',
    ]);
    final travelIndex = index([
      'avgtimetotravel',
      'averagetravel',
      'avgtravel',
    ]);
    if (idIndex < 0 || movesIndex < 0) {
      throw const FormatException(
        'CSV must include Yard ID and Moves columns.',
      );
    }
    final aggregate = <String, List<dynamic>>{};
    for (final line in lines.skip(1)) {
      final fields = _split(line);
      if (fields.length <= idIndex) continue;
      final id = fields[idIndex].trim().toUpperCase();
      if (id.isEmpty) continue;
      final moves = int.tryParse(_field(fields, movesIndex)) ?? 0;
      final collect = double.tryParse(_field(fields, collectIndex)) ?? 0;
      final travel = double.tryParse(_field(fields, travelIndex)) ?? 0;
      final current = aggregate.putIfAbsent(
        id,
        () => <dynamic>[_field(fields, nameIndex), 0, 0.0, 0.0, 0],
      );
      current[1] = (current[1] as int) + moves;
      current[2] = (current[2] as double) + collect;
      current[3] = (current[3] as double) + travel;
      current[4] = (current[4] as int) + 1;
    }
    return aggregate.entries
        .map(
          (entry) => PerformanceRow(
            yardSystemId: entry.key,
            fullName: entry.value[0] as String,
            moves: entry.value[1] as int,
            averageCollect:
                (entry.value[2] as double) / (entry.value[4] as int),
            averageTravel: (entry.value[3] as double) / (entry.value[4] as int),
            shiftCount: entry.value[4] as int,
          ),
        )
        .toList();
  }

  static String _normalise(String value) =>
      value.toLowerCase().replaceAll(RegExp('[^a-z0-9]'), '');
  static String _field(List<String> fields, int index) =>
      index >= 0 && index < fields.length ? fields[index].trim() : '';
  static List<String> _split(String line) {
    final result = <String>[];
    final buffer = StringBuffer();
    var quoted = false;
    for (var i = 0; i < line.length; i++) {
      final char = line[i];
      if (char == '"') {
        if (quoted && i + 1 < line.length && line[i + 1] == '"') {
          buffer.write('"');
          i++;
        } else {
          quoted = !quoted;
        }
      } else if (char == ',' && !quoted) {
        result.add(buffer.toString());
        buffer.clear();
      } else {
        buffer.write(char);
      }
    }
    result.add(buffer.toString());
    return result;
  }
}

int parseConfirmationCount(Object? value) {
  final parsed = int.tryParse(value?.toString() ?? '');
  return (parsed ?? 1).clamp(1, 99);
}

int parseMaximumConsecutiveDays(Object? value) {
  final parsed = int.tryParse(value?.toString() ?? '');
  return (parsed ?? 6).clamp(1, 13);
}
