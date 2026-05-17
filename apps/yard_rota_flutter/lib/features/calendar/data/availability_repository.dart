import 'dart:async';
import 'dart:convert';

import '../../../core/network/api_client.dart';
import '../../../core/network/network_policy.dart';
import '../../../core/network/models.dart';
import '../../../core/local_db/app_local_database.dart';

class AvailabilityRepository {
  AvailabilityRepository({
    required ApiClient apiClient,
    required AppLocalDatabase localDb,
  }) : _apiClient = apiClient,
       _localDb = localDb;

  final ApiClient _apiClient;
  final AppLocalDatabase _localDb;
  bool _syncInProgress = false;

  Future<Map<String, AvailabilityEntry>> loadForMonth({
    required DateTime monthDate,
    DateTime? modalAnchorDate,
  }) async {
    final range = _buildRange(
      monthDate: monthDate,
      modalAnchorDate: modalAnchorDate,
    );
    final startYmd = _toYmd(range.start);
    final endYmd = _toYmd(range.end);

    // Always sync from remote for this range, then read SQLite. Returning early
    // when local was only partially filled (e.g. edge days in ±7d padding) left
    // most month cells without status until a later navigation.
    try {
      return await _refreshFromRemote(startYmd: startYmd, endYmd: endYmd);
    } catch (_) {
      return _localDb.readAvailabilityRange(startYmd: startYmd, endYmd: endYmd);
    }
  }

  Future<Map<String, AvailabilityEntry>> _refreshFromRemote({
    required String startYmd,
    required String endYmd,
  }) async {
    final entries = await _apiClient.getAvailabilityRange(
      startYmd: startYmd,
      endYmd: endYmd,
    );
    await _localDb.applyRemoteAvailability(entries);
    return _localDb.readAvailabilityRange(startYmd: startYmd, endYmd: endYmd);
  }

  Future<void> save({required SaveAvailabilityRequest request}) async {
    for (final item in request.items) {
      await _localDb.upsertAvailabilityLocal(
        dateYmd: item.dateYmd,
        status: item.status,
        comment: request.applyComment ? request.comment : null,
        syncState: 'pending',
      );
      await _localDb.enqueueAvailabilityUpsert(
        item: item,
        comment: request.comment,
        applyComment: request.applyComment,
      );
    }
    unawaited(flushOutbox());
  }

  Future<void> flushOutbox() async {
    if (_syncInProgress) {
      return;
    }

    _syncInProgress = true;
    try {
      while (true) {
        final pending = await _localDb.readPendingOutbox(limit: 25);
        if (pending.isEmpty) {
          break;
        }

        for (final record in pending) {
          if (record.entity != 'availability' || record.opType != 'upsert') {
            await _localDb.markOutboxSynced(record.id);
            continue;
          }

          final payload =
              jsonDecode(record.payloadJson) as Map<String, dynamic>;
          final dateYmd = payload['dateYmd'] as String;
          final status = AvailabilityStatus.fromDbValue(
            payload['status'] as String? ??
                AvailabilityStatus.available.dbValue,
          );
          final comment = payload['comment'] as String? ?? '';
          final applyComment = payload['applyComment'] == true;

          final saveRequest = SaveAvailabilityRequest(
            items: [SaveAvailabilityItem(dateYmd: dateYmd, status: status)],
            comment: comment,
            applyComment: applyComment,
          );

          try {
            await _apiClient.saveAvailability(request: saveRequest);
            await _localDb.upsertAvailabilityLocal(
              dateYmd: dateYmd,
              status: status,
              comment: applyComment ? comment : null,
              syncState: 'synced',
            );
            await _localDb.markOutboxSynced(record.id);
          } catch (error) {
            final nextAttempt = record.attemptCount + 1;
            final backoffMs = _computeBackoff(nextAttempt).inMilliseconds;
            final nextRetryAt =
                DateTime.now().millisecondsSinceEpoch + backoffMs;
            await _localDb.upsertAvailabilityLocal(
              dateYmd: dateYmd,
              status: status,
              comment: applyComment ? comment : null,
              syncState: 'failed',
              lastError: error.toString(),
            );
            await _localDb.markOutboxRetry(
              id: record.id,
              attemptCount: nextAttempt,
              nextRetryAt: nextRetryAt,
              lastError: error.toString(),
            );
          }
        }
      }
    } finally {
      _syncInProgress = false;
    }
  }

  Duration _computeBackoff(int attempt) {
    final multiplier = 1 << (attempt.clamp(1, 6) - 1);
    final base = NetworkPolicy.initialBackoff.inMilliseconds;
    return Duration(milliseconds: base * multiplier);
  }

  _DateRange _buildRange({
    required DateTime monthDate,
    DateTime? modalAnchorDate,
  }) {
    final monthStart = DateTime(monthDate.year, monthDate.month, 1);
    final monthEnd = DateTime(monthDate.year, monthDate.month + 1, 0);
    final gridStart = monthStart.subtract(const Duration(days: 7));
    final gridEnd = monthEnd.add(const Duration(days: 7));

    var start = gridStart;
    var end = gridEnd;

    if (modalAnchorDate != null) {
      final anchorStart = DateTime(
        modalAnchorDate.year,
        modalAnchorDate.month,
        modalAnchorDate.day,
      );
      final anchorEnd = DateTime(
        modalAnchorDate.year,
        modalAnchorDate.month + 1,
        modalAnchorDate.day,
      );
      if (anchorStart.isBefore(start)) {
        start = anchorStart;
      }
      if (anchorEnd.isAfter(end)) {
        end = anchorEnd;
      }
    }

    return _DateRange(start: start, end: end);
  }

  String _toYmd(DateTime date) {
    final y = date.year.toString().padLeft(4, '0');
    final m = date.month.toString().padLeft(2, '0');
    final d = date.day.toString().padLeft(2, '0');
    return '$y-$m-$d';
  }
}

class _DateRange {
  const _DateRange({required this.start, required this.end});

  final DateTime start;
  final DateTime end;
}
