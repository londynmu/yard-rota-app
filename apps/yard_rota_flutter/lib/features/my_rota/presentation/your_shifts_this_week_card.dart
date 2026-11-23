import 'package:flutter/material.dart';

import '../../../core/network/models.dart';
import '../../../core/network/my_rota_models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_card.dart';
import '../data/my_rota_preferences.dart';
import '../data/my_rota_repository.dart';
import '../domain/my_rota_week_logic.dart';

/// "Your shifts this week" — compact day/location/time rows inside an AppCard.
/// Sorting: date ascending, then start time (unchanged).
class YourShiftsThisWeekCard extends StatefulWidget {
  const YourShiftsThisWeekCard({
    super.key,
    required this.repository,
    required this.session,
    this.onOpenMyRota,
  });

  final MyRotaRepository repository;
  final UserSession session;
  final VoidCallback? onOpenMyRota;

  @override
  State<YourShiftsThisWeekCard> createState() => _YourShiftsThisWeekCardState();
}

class _YourShiftsThisWeekCardState extends State<YourShiftsThisWeekCard> {
  bool _loading = true;
  List<_UserShiftDay> _days = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final weekStart = myRotaWeekStartSaturday(DateTime.now());
      final locs = await widget.repository.loadActiveLocations();
      final anchor = await widget.repository.loadAnchorShift(
        userId: widget.session.userId,
        fromDate: DateTime.now(),
      );
      final savedLoc = await readSavedMyRotaLocationName();
      final savedShift = await readSavedMyRotaShiftType();
      final location = anchor != null
          ? anchor.location
          : widget.repository.resolveLocationName(
              locations: locs,
              savedName: savedLoc,
              fallbackName: locs.isNotEmpty ? locs.first.name : null,
            );
      final shiftFilter = anchor != null
          ? widget.repository.resolveShiftTypeFilter(anchor.shiftType)
          : widget.repository.resolveShiftTypeFilter(savedShift);
      final data = await widget.repository.loadWeek(
        weekStartSaturday: weekStart,
        locationName: location,
        shiftTypeFilter: shiftFilter,
      );
      final merged = widget.repository.mergeWithWeekKeys(
        weekStart,
        data.slotsByDateYmd,
      );
      final days = _groupUserShifts(
        weekYmds: myRotaWeekDateYmds(weekStart),
        slotsByDate: merged,
        userId: widget.session.userId,
      );
      if (!mounted) return;
      setState(() {
        _days = days;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _days = const [];
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;

    return AppCard(
      padding: EdgeInsets.zero,
      surfaceOpacity: AppOpacity.homeCard,
      borderColor: colors.borderDefault,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: widget.onOpenMyRota,
              borderRadius: BorderRadius.circular(AppRadius.md),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.md,
                  AppSpacing.sm,
                  AppSpacing.md,
                  AppSpacing.sm,
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Your shifts this week',
                        style:
                            Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                          color: colors.textPrimary,
                        ),
                      ),
                    ),
                    if (widget.onOpenMyRota != null)
                      Icon(
                        Icons.chevron_right_rounded,
                        size: 22,
                        color: colors.textTertiary,
                      ),
                  ],
                ),
              ),
            ),
          ),
          Divider(
            height: 1,
            thickness: AppStroke.hairline,
            color: colors.divider,
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
            child: _loading
                // Static placeholder (no ticker) so widget tests using
                // pumpAndSettle are not blocked by an indeterminate spinner.
                ? Padding(
                    padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
                    child: Text(
                      'Loading…',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: colors.textSecondary,
                        fontWeight: FontWeight.w400,
                      ),
                    ),
                  )
                : _days.isEmpty
                ? Padding(
                    padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
                    child: Text(
                      'No shifts for you this week',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: colors.textSecondary,
                        fontWeight: FontWeight.w400,
                      ),
                    ),
                  )
                : Column(
                    children: [
                      for (final day in _days)
                        _ShiftListRow(
                          day: day,
                          onTap: widget.onOpenMyRota,
                        ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _ShiftListRow extends StatelessWidget {
  const _ShiftListRow({required this.day, this.onTap});

  final _UserShiftDay day;
  final VoidCallback? onTap;

  static const _weekdayFull = <String>[
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ];

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final firstShift = day.shifts.first.slot;
    final weekday = _weekdayFull[day.date.weekday - 1];
    final location = firstShift.location.trim();
    final timeText =
        '${_shortTime(firstShift.startTime)} – ${_shortTime(firstShift.endTime)}';

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.sm),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
          child: Row(
            children: [
              Expanded(
                flex: 3,
                child: Text(
                  '$weekday ${day.date.day}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: colors.textPrimary,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                flex: 2,
                child: Text(
                  location.isEmpty ? '—' : location,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: colors.textSecondary,
                    fontWeight: FontWeight.w400,
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Text(
                timeText,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.right,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: colors.textPrimary,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _shortTime(String raw) =>
      raw.length >= 5 ? raw.substring(0, 5) : raw;
}

class _UserShift {
  const _UserShift({required this.date, required this.slot});
  final DateTime date;
  final MyRotaSlot slot;
}

class _UserShiftDay {
  const _UserShiftDay({required this.date, required this.shifts});
  final DateTime date;
  final List<_UserShift> shifts;
}

List<_UserShiftDay> _groupUserShifts({
  required List<String> weekYmds,
  required Map<String, List<MyRotaSlot>> slotsByDate,
  required String userId,
}) {
  final shifts = <_UserShift>[];
  for (final ymd in weekYmds) {
    final date = DateTime.tryParse(ymd);
    if (date == null) continue;
    for (final slot in slotsByDate[ymd] ?? const <MyRotaSlot>[]) {
      if (slot.userId.trim().toLowerCase() != userId.trim().toLowerCase()) {
        continue;
      }
      if (slot.displayNameOrNull == null) continue;
      shifts.add(_UserShift(date: date, slot: slot));
    }
  }
  shifts.sort((a, b) {
    final byDate = a.date.compareTo(b.date);
    if (byDate != 0) return byDate;
    return a.slot.startTime.compareTo(b.slot.startTime);
  });

  final grouped = <String, List<_UserShift>>{};
  for (final shift in shifts) {
    final ymd = myRotaToYmd(myRotaDateOnly(shift.date));
    grouped.putIfAbsent(ymd, () => <_UserShift>[]).add(shift);
  }
  final keys = grouped.keys.toList()..sort();
  return [
    for (final key in keys)
      _UserShiftDay(date: grouped[key]!.first.date, shifts: grouped[key]!),
  ];
}
