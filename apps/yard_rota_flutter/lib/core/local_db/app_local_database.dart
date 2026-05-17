import 'dart:convert';
import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../network/models.dart';

class AppLocalDatabase extends GeneratedDatabase {
  AppLocalDatabase._(super.executor);

  factory AppLocalDatabase.inMemory() {
    driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
    final database = AppLocalDatabase._(NativeDatabase.memory());
    database._initializeSchema();
    return database;
  }

  static Future<AppLocalDatabase> openDefault() async {
    final directory = await getApplicationSupportDirectory();
    final dbFile = File(p.join(directory.path, 'yard_rota_offline.db'));
    final database = AppLocalDatabase._(NativeDatabase(dbFile));
    await database._initializeSchema();
    return database;
  }

  @override
  int get schemaVersion => 1;

  @override
  Iterable<TableInfo<Table, Object?>> get allTables => const [];

  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => const [];

  @override
  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (m) async => _initializeSchema(),
    onUpgrade: (m, from, to) async => _initializeSchema(),
  );

  Future<void> _initializeSchema() async {
    await customStatement('''
      CREATE TABLE IF NOT EXISTS calendar_month_meta (
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        fetched_at INTEGER NOT NULL,
        PRIMARY KEY (year, month)
      );
    ''');

    await customStatement('''
      CREATE TABLE IF NOT EXISTS calendar_shift_local (
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        day INTEGER NOT NULL,
        title TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        location TEXT NOT NULL,
        status TEXT NOT NULL,
        PRIMARY KEY (year, month, day, start_time, end_time, location)
      );
    ''');

    await customStatement('''
      CREATE TABLE IF NOT EXISTS availability_local (
        date_ymd TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        comment TEXT,
        updated_at_local INTEGER NOT NULL,
        sync_state TEXT NOT NULL,
        remote_updated_at INTEGER,
        last_error TEXT
      );
    ''');

    await customStatement('''
      CREATE TABLE IF NOT EXISTS sync_outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity TEXT NOT NULL,
        entity_key TEXT NOT NULL,
        op_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        next_retry_at INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        idempotency_key TEXT NOT NULL UNIQUE
      );
    ''');
  }

  Future<void> clearAllUserData() async {
    await customStatement('DELETE FROM calendar_month_meta');
    await customStatement('DELETE FROM calendar_shift_local');
    await customStatement('DELETE FROM availability_local');
    await customStatement('DELETE FROM sync_outbox');
  }

  Future<CalendarMonthData?> readCalendarMonth({
    required int year,
    required int month,
  }) async {
    final metaRows = await customSelect(
      'SELECT fetched_at FROM calendar_month_meta WHERE year = ? AND month = ?',
      variables: [Variable.withInt(year), Variable.withInt(month)],
      readsFrom: const {},
    ).get();
    if (metaRows.isEmpty) {
      return null;
    }

    final fetchedAtMs = metaRows.first.read<int>('fetched_at');
    final shiftRows = await customSelect(
      '''
      SELECT day,title,start_time,end_time,location,status
      FROM calendar_shift_local
      WHERE year = ? AND month = ?
      ORDER BY day,start_time
      ''',
      variables: [Variable.withInt(year), Variable.withInt(month)],
      readsFrom: const {},
    ).get();

    final grouped = <int, List<CalendarShift>>{};
    for (final row in shiftRows) {
      final day = row.read<int>('day');
      grouped
          .putIfAbsent(day, () => <CalendarShift>[])
          .add(
            CalendarShift(
              title: row.read<String>('title'),
              startTime: row.read<String>('start_time'),
              endTime: row.read<String>('end_time'),
              location: row.read<String>('location'),
              status: row.read<String>('status'),
            ),
          );
    }

    final schedules =
        grouped.entries
            .map(
              (entry) => CalendarDaySchedule(
                date: DateTime(year, month, entry.key),
                shifts: entry.value,
              ),
            )
            .toList(growable: false)
          ..sort((a, b) => a.date.compareTo(b.date));

    return CalendarMonthData(
      year: year,
      month: month,
      scheduledDays: schedules,
      fetchedAt: DateTime.fromMillisecondsSinceEpoch(fetchedAtMs),
    );
  }

  Future<bool> hasCalendarMonth({required int year, required int month}) async {
    final rows = await customSelect(
      'SELECT 1 AS ok FROM calendar_month_meta WHERE year = ? AND month = ? LIMIT 1',
      variables: [Variable.withInt(year), Variable.withInt(month)],
      readsFrom: const {},
    ).get();
    return rows.isNotEmpty;
  }

  Future<void> writeCalendarMonth(CalendarMonthData data) async {
    await transaction(() async {
      await customStatement(
        'DELETE FROM calendar_shift_local WHERE year = ? AND month = ?',
        [data.year, data.month],
      );
      await customStatement(
        '''
        INSERT OR REPLACE INTO calendar_month_meta(year,month,fetched_at)
        VALUES(?,?,?)
        ''',
        [data.year, data.month, data.fetchedAt.millisecondsSinceEpoch],
      );

      for (final schedule in data.scheduledDays) {
        for (final shift in schedule.shifts) {
          await customStatement(
            '''
            INSERT OR REPLACE INTO calendar_shift_local(
              year,month,day,title,start_time,end_time,location,status
            ) VALUES(?,?,?,?,?,?,?,?)
            ''',
            [
              data.year,
              data.month,
              schedule.date.day,
              shift.title,
              shift.startTime,
              shift.endTime,
              shift.location,
              shift.status,
            ],
          );
        }
      }
    });
  }

  Future<Map<String, AvailabilityEntry>> readAvailabilityRange({
    required String startYmd,
    required String endYmd,
  }) async {
    final rows = await customSelect(
      '''
      SELECT date_ymd,status,comment
      FROM availability_local
      WHERE date_ymd >= ? AND date_ymd <= ?
      ORDER BY date_ymd
      ''',
      variables: [Variable.withString(startYmd), Variable.withString(endYmd)],
      readsFrom: const {},
    ).get();

    return <String, AvailabilityEntry>{
      for (final row in rows)
        row.read<String>('date_ymd'): AvailabilityEntry(
          dateYmd: row.read<String>('date_ymd'),
          status: AvailabilityStatus.fromDbValue(row.read<String>('status')),
          comment: row.readNullable<String>('comment'),
        ),
    };
  }

  Future<void> upsertAvailabilityLocal({
    required String dateYmd,
    required AvailabilityStatus status,
    String? comment,
    required String syncState,
    String? lastError,
  }) async {
    await customStatement(
      '''
      INSERT OR REPLACE INTO availability_local(
        date_ymd,status,comment,updated_at_local,sync_state,last_error
      ) VALUES(?,?,?,?,?,?)
      ''',
      [
        dateYmd,
        status.dbValue,
        comment,
        DateTime.now().millisecondsSinceEpoch,
        syncState,
        lastError,
      ],
    );
  }

  Future<void> applyRemoteAvailability(List<AvailabilityEntry> entries) async {
    await transaction(() async {
      for (final entry in entries) {
        final existing = await customSelect(
          '''
          SELECT sync_state
          FROM availability_local
          WHERE date_ymd = ?
          ''',
          variables: [Variable.withString(entry.dateYmd)],
          readsFrom: const {},
        ).getSingleOrNull();

        final syncState = existing?.read<String>('sync_state');
        if (syncState == 'pending') {
          continue;
        }

        await customStatement(
          '''
          INSERT OR REPLACE INTO availability_local(
            date_ymd,status,comment,updated_at_local,sync_state,remote_updated_at,last_error
          ) VALUES(?,?,?,?,?,?,NULL)
          ''',
          [
            entry.dateYmd,
            entry.status.dbValue,
            entry.comment,
            DateTime.now().millisecondsSinceEpoch,
            'synced',
            DateTime.now().millisecondsSinceEpoch,
          ],
        );
      }
    });
  }

  Future<void> enqueueAvailabilityUpsert({
    required SaveAvailabilityItem item,
    required String comment,
    required bool applyComment,
  }) async {
    final payload = jsonEncode({
      'dateYmd': item.dateYmd,
      'status': item.status.dbValue,
      'comment': comment,
      'applyComment': applyComment,
    });
    final createdAt = DateTime.now().millisecondsSinceEpoch;
    final idempotencyKey = 'availability:${item.dateYmd}:$createdAt';

    await customStatement(
      '''
      INSERT OR REPLACE INTO sync_outbox(
        entity,entity_key,op_type,payload_json,created_at,idempotency_key
      ) VALUES(?,?,?,?,?,?)
      ''',
      [
        'availability',
        item.dateYmd,
        'upsert',
        payload,
        createdAt,
        idempotencyKey,
      ],
    );
  }

  Future<List<OutboxRecord>> readPendingOutbox({int limit = 50}) async {
    final nowMs = DateTime.now().millisecondsSinceEpoch;
    final rows = await customSelect(
      '''
      SELECT id,entity,entity_key,op_type,payload_json,attempt_count,next_retry_at
      FROM sync_outbox
      WHERE next_retry_at <= ?
      ORDER BY created_at ASC
      LIMIT ?
      ''',
      variables: [Variable.withInt(nowMs), Variable.withInt(limit)],
      readsFrom: const {},
    ).get();

    return rows
        .map(
          (row) => OutboxRecord(
            id: row.read<int>('id'),
            entity: row.read<String>('entity'),
            entityKey: row.read<String>('entity_key'),
            opType: row.read<String>('op_type'),
            payloadJson: row.read<String>('payload_json'),
            attemptCount: row.read<int>('attempt_count'),
            nextRetryAt: row.read<int>('next_retry_at'),
          ),
        )
        .toList(growable: false);
  }

  Future<void> markOutboxSynced(int id) async {
    await customStatement('DELETE FROM sync_outbox WHERE id = ?', [id]);
  }

  Future<void> markOutboxRetry({
    required int id,
    required int attemptCount,
    required int nextRetryAt,
    required String lastError,
  }) async {
    await customStatement(
      '''
      UPDATE sync_outbox
      SET attempt_count = ?, next_retry_at = ?, last_error = ?
      WHERE id = ?
      ''',
      [attemptCount, nextRetryAt, lastError, id],
    );
  }
}

class OutboxRecord {
  const OutboxRecord({
    required this.id,
    required this.entity,
    required this.entityKey,
    required this.opType,
    required this.payloadJson,
    required this.attemptCount,
    required this.nextRetryAt,
  });

  final int id;
  final String entity;
  final String entityKey;
  final String opType;
  final String payloadJson;
  final int attemptCount;
  final int nextRetryAt;
}
