import 'package:flutter/material.dart';

import '../../../core/network/models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_modal_actions.dart';
import '../../../core/ui/app_option_sheet.dart';
import 'calendar_day_grid.dart';

/// Month grid + action panel: pick a status brush, paint days by tapping,
/// notes via long-press modal (compact preview in the action panel).
class AvailabilitySheet extends StatefulWidget {
  const AvailabilitySheet({
    super.key,
    required this.anchorDate,
    required this.availabilityByDate,
    this.loadMonth,
  });

  final DateTime anchorDate;
  final Map<String, AvailabilityEntry> availabilityByDate;

  /// Loads remote/local availability when the sheet month changes.
  final Future<Map<String, AvailabilityEntry>> Function(DateTime month)?
  loadMonth;

  @override
  State<AvailabilitySheet> createState() => _AvailabilitySheetState();
}

class _AvailabilitySheetState extends State<AvailabilitySheet> {
  late DateTime _visibleMonth;
  late AvailabilityStatus _activeStatus;
  late List<String> _selectedDates;
  late Map<String, AvailabilityStatus> _statusByDate;
  late Map<String, String> _commentsByDate;
  late Set<String> _commentEdited;
  late final DateTime _today;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _today = DateTime(now.year, now.month, now.day);
    _visibleMonth = DateTime(widget.anchorDate.year, widget.anchorDate.month);
    final clickedYmd = _toYmd(widget.anchorDate);

    _statusByDate = <String, AvailabilityStatus>{
      for (final entry in widget.availabilityByDate.entries)
        entry.key: entry.value.status,
    };
    _commentsByDate = <String, String>{
      for (final entry in widget.availabilityByDate.entries)
        if ((entry.value.comment ?? '').trim().isNotEmpty)
          entry.key: entry.value.comment!.trim(),
    };
    _commentEdited = <String>{};

    // Brush starts on the clicked day's current status; paint only on day taps.
    _selectedDates = <String>[clickedYmd];
    _activeStatus =
        _statusByDate[clickedYmd] ?? AvailabilityStatus.available;
  }

  /// Day shown in the compact note preview (single selection preferred).
  String? get _previewNoteYmd {
    if (_selectedDates.length == 1) return _selectedDates.first;
    return null;
  }

  String get _previewNoteText {
    final ymd = _previewNoteYmd;
    if (ymd == null) return '';
    return _commentsByDate[ymd]?.trim() ?? '';
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    const modalSurfaceOpacity = 0.55;
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            colors.bgPrimary.withValues(alpha: modalSurfaceOpacity),
            colors.bgSecondary.withValues(alpha: modalSurfaceOpacity),
            colors.bgPrimary.withValues(alpha: modalSurfaceOpacity),
          ],
        ),
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(color: colors.borderDefault),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.md,
                AppSpacing.sm,
                AppSpacing.md,
                AppSpacing.sm,
              ),
              physics: const ClampingScrollPhysics(),
              child: _buildMonthGrid(context),
            ),
          ),
          _buildActionPanel(context),
        ],
      ),
    );
  }

  /// Sticky action panel under the month grid — transparent like the sheet.
  Widget _buildActionPanel(BuildContext context) {
    final colors = context.appColors;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.md,
        AppSpacing.md,
        AppSpacing.md,
        AppSpacing.md + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'Set availability as',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
              color: colors.textSecondary,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              for (var i = 0; i < AvailabilityStatus.values.length; i++) ...[
                if (i > 0) const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: _buildStatusCard(
                    context,
                    AvailabilityStatus.values[i],
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          _buildNotePreview(context),
          const SizedBox(height: AppSpacing.md),
          AppModalActions(
            onCancel: () => Navigator.of(context).pop(),
            onConfirm: _selectedDates.isEmpty ? null : _save,
            confirmEnabled: _selectedDates.isNotEmpty,
          ),
        ],
      ),
    );
  }

  /// Compact note strip — edit only via long-press on a day.
  Widget _buildNotePreview(BuildContext context) {
    final colors = context.appColors;
    final ymd = _previewNoteYmd;
    final note = _previewNoteText;
    final hasNote = note.isNotEmpty;

    final String label;
    if (ymd == null) {
      label = 'Hold a day to add a note';
    } else if (hasNote) {
      final clipped = note.length > 42 ? '${note.substring(0, 42)}…' : note;
      label = clipped;
    } else {
      label = 'No note · hold day to add';
    }

    return Text(
      label,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      textAlign: TextAlign.center,
      style: Theme.of(context).textTheme.labelSmall?.copyWith(
        color: hasNote ? colors.textPrimary : colors.textSecondary,
        fontWeight: hasNote ? FontWeight.w500 : FontWeight.w400,
      ),
    );
  }

  Widget _buildStatusCard(BuildContext context, AvailabilityStatus status) {
    final colors = context.appColors;
    final selected = _activeStatus == status;
    final tone = _toneForStatus(context, status);
    final radius = BorderRadius.circular(AppRadius.sm);
    final fg = selected ? tone.text : colors.textSecondary;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: radius,
        onTap: () => setState(() {
          // Brush only — days change when painted via tap.
          _activeStatus = status;
        }),
        child: AnimatedContainer(
          duration: MediaQuery.disableAnimationsOf(context)
              ? Duration.zero
              : AppMotion.fast,
          constraints: const BoxConstraints(
            minHeight: AppNavPill.chipHeight,
          ),
          height: AppNavPill.chipHeight,
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
          decoration: BoxDecoration(
            color: selected ? tone.background : colors.bgSecondary,
            borderRadius: radius,
            border: Border.all(
              color: selected ? tone.border : colors.borderDefault,
              width: selected ? AppStroke.medium : AppStroke.thin,
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                _statusIcon(status),
                size: AppNavPill.chipIconSize,
                color: fg,
              ),
              const SizedBox(width: AppSpacing.xs),
              Flexible(
                child: Text(
                  _statusLabel(status),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    color: selected ? tone.text : colors.textPrimary,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildMonthGrid(BuildContext context) {
    final colors = context.appColors;
    final year = _visibleMonth.year;
    final month = _visibleMonth.month;
    final daysInMonth = DateUtils.getDaysInMonth(year, month);
    final leading = DateTime(year, month, 1).weekday - 1;
    final totalCells = leading + daysInMonth;
    final monthLabel = '${_monthName(month)} $year';

    return Column(
      children: [
        Row(
          children: [
            IconButton(
              onPressed: () => _shiftSheetMonth(-1),
              icon: const Icon(Icons.chevron_left),
              tooltip: 'Previous month',
            ),
            Expanded(
              child: Text(
                monthLabel,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            IconButton(
              onPressed: () => _shiftSheetMonth(1),
              icon: const Icon(Icons.chevron_right),
              tooltip: 'Next month',
            ),
          ],
        ),
        Row(
          children: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
              .map(
                (label) => Expanded(
                  child: Text(
                    label,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: colors.textSecondary,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              )
              .toList(growable: false),
        ),
        const SizedBox(height: AppSpacing.xs),
        LayoutBuilder(
          builder: (context, constraints) {
            final metrics = CalendarDayGridMetrics.forWidth(
              constraints.maxWidth,
            );
            return GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: totalCells,
              gridDelegate: metrics.delegate,
              itemBuilder: (context, index) {
                if (index < leading) return const SizedBox.shrink();
                final day = index - leading + 1;
                final date = DateTime(year, month, day);
                final ymd = _toYmd(date);
                final isPast = date.isBefore(_today);
                final status =
                    _statusByDate[ymd] ??
                    widget.availabilityByDate[ymd]?.status;
                final hasComment =
                    (_commentsByDate[ymd]?.trim().isNotEmpty ?? false);
                final tone = _toneForStatus(context, status);
                final isToday = _isSameDay(date, _today);

                // Days only wear status color — no selection ticks or blue overlays.
                final Color fill;
                final Color borderColor;
                final Color textColor;
                if (status != null) {
                  fill = tone.background;
                  borderColor = tone.border;
                  textColor = tone.text;
                } else {
                  fill = colors.bgSecondary.withValues(alpha: 0.55);
                  borderColor = isToday
                      ? colors.primary
                      : colors.borderDefault;
                  textColor = colors.textPrimary;
                }

                return Opacity(
                  opacity: isPast ? 0.4 : 1,
                  child: Material(
                    color: Colors.transparent,
                    child: InkWell(
                      borderRadius: BorderRadius.circular(AppRadius.sm),
                      onTap: isPast ? null : () => _onDateTap(ymd),
                      onLongPress: isPast
                          ? null
                          : () => _openNoteEditor(ymd),
                      child: AnimatedContainer(
                        duration: MediaQuery.disableAnimationsOf(context)
                            ? Duration.zero
                            : AppMotion.fast,
                        decoration: BoxDecoration(
                          color: fill,
                          borderRadius: BorderRadius.circular(AppRadius.sm),
                          border: Border.all(
                            color: borderColor,
                            width: isToday ? 2 : 1,
                          ),
                        ),
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            Center(
                              child: Text(
                                '$day',
                                style: Theme.of(context).textTheme.labelLarge
                                    ?.copyWith(
                                      color: textColor,
                                      fontWeight: FontWeight.w600,
                                    ),
                              ),
                            ),
                            if (hasComment)
                              const Positioned(
                                right: 2,
                                bottom: 2,
                                child: Icon(
                                  Icons.chat_bubble,
                                  size: 9,
                                  color: AppPrimitives.amber500,
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              },
            );
          },
        ),
      ],
    );
  }

  Future<void> _shiftSheetMonth(int delta) async {
    final next = DateTime(_visibleMonth.year, _visibleMonth.month + delta);
    setState(() => _visibleMonth = next);
    final loader = widget.loadMonth;
    if (loader == null) return;
    try {
      final map = await loader(next);
      if (!mounted) return;
      setState(() => _mergeAvailability(map));
    } catch (_) {
      // Keep whatever we already have for this month.
    }
  }

  void _mergeAvailability(Map<String, AvailabilityEntry> map) {
    for (final entry in map.entries) {
      _statusByDate.putIfAbsent(entry.key, () => entry.value.status);
      final comment = (entry.value.comment ?? '').trim();
      if (comment.isNotEmpty && !_commentEdited.contains(entry.key)) {
        _commentsByDate.putIfAbsent(entry.key, () => comment);
      }
    }
  }

  Future<void> _openNoteEditor(String ymd) async {
    // Do not add the day to the save set on long-press alone — cancel would
    // still leave it selected and Save would paint `_activeStatus`.
    final initial = _commentsByDate[ymd] ?? '';
    final result = await showDialog<String>(
      context: context,
      barrierDismissible: true,
      builder: (dialogContext) {
        return _AvailabilityNoteDialog(
          dateLabel: _friendlyDateLabel(_parseYmd(ymd)),
          initialComment: initial,
        );
      },
    );

    if (!mounted || result == null) return;

    setState(() {
      final trimmed = result.trim();
      _commentEdited.add(ymd);
      if (trimmed.isEmpty) {
        _commentsByDate.remove(ymd);
      } else {
        _commentsByDate[ymd] = trimmed;
      }
      // Notes save with an existing status only; unset days need a paint tap.
      final hasStatus =
          _statusByDate.containsKey(ymd) ||
          widget.availabilityByDate.containsKey(ymd);
      if (hasStatus && !_selectedDates.contains(ymd)) {
        _selectedDates = <String>[..._selectedDates, ymd];
      }
    });
  }

  /// Select a day (or re-apply active status). Never deselects on second tap.
  void _onDateTap(String ymd) {
    setState(() {
      if (!_selectedDates.contains(ymd)) {
        _selectedDates = <String>[..._selectedDates, ymd];
      }
      _statusByDate[ymd] = _activeStatus;
    });
  }

  void _save() {
    final items = _selectedDates
        .map((ymd) {
          final edited = _commentEdited.contains(ymd);
          return SaveAvailabilityItem(
            dateYmd: ymd,
            status:
                _statusByDate[ymd] ??
                widget.availabilityByDate[ymd]?.status ??
                _activeStatus,
            comment: edited ? (_commentsByDate[ymd] ?? '') : null,
            applyComment: edited,
          );
        })
        .toList(growable: false);

    // Request-level comment kept for older call sites / single-day PWA parity.
    final singleEdited = items.length == 1 && items.first.applyComment;
    Navigator.of(context).pop(
      SaveAvailabilityRequest(
        items: items,
        comment: singleEdited ? (items.first.comment ?? '') : '',
        applyComment: singleEdited,
      ),
    );
  }

  IconData _statusIcon(AvailabilityStatus status) => switch (status) {
    AvailabilityStatus.available => Icons.check_circle_outline,
    AvailabilityStatus.unavailable => Icons.block_flipped,
    AvailabilityStatus.holiday => Icons.beach_access_outlined,
  };

  String _statusLabel(AvailabilityStatus status) => switch (status) {
    AvailabilityStatus.available => 'Available',
    AvailabilityStatus.unavailable => 'Unavailable',
    AvailabilityStatus.holiday => 'Holiday',
  };

  _StatusTone _toneForStatus(BuildContext context, AvailabilityStatus? status) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return switch (status) {
      AvailabilityStatus.available => _StatusTone(
        background: AppAvailabilityTones.availableBg(colors),
        border: AppAvailabilityTones.available(colors),
        text: AppAvailabilityTones.available(colors),
      ),
      AvailabilityStatus.unavailable => _StatusTone(
        background: AppAvailabilityTones.unavailableBg(isDark: isDark),
        border: AppAvailabilityTones.unavailable(isDark: isDark),
        text: AppAvailabilityTones.unavailable(isDark: isDark),
      ),
      AvailabilityStatus.holiday => _StatusTone(
        background: AppAvailabilityTones.holidayBg(isDark: isDark),
        border: AppAvailabilityTones.holiday(isDark: isDark),
        text: AppAvailabilityTones.holiday(isDark: isDark),
      ),
      null => _StatusTone(
        background: colors.bgSecondary,
        border: colors.borderDefault,
        text: colors.textSecondary,
      ),
    };
  }

  String _friendlyDateLabel(DateTime date) {
    const weekdays = [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ];
    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    return '${weekdays[date.weekday - 1]} ${date.day} ${months[date.month - 1]}';
  }

  String _monthName(int month) {
    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    return months[month - 1];
  }

  DateTime _parseYmd(String ymd) {
    final parts = ymd.split('-');
    return DateTime(
      int.parse(parts[0]),
      int.parse(parts[1]),
      int.parse(parts[2]),
    );
  }

  String _toYmd(DateTime date) {
    final y = date.year.toString().padLeft(4, '0');
    final m = date.month.toString().padLeft(2, '0');
    final d = date.day.toString().padLeft(2, '0');
    return '$y-$m-$d';
  }

  bool _isSameDay(DateTime left, DateTime right) =>
      left.year == right.year &&
      left.month == right.month &&
      left.day == right.day;
}

class _StatusTone {
  const _StatusTone({
    required this.background,
    required this.border,
    required this.text,
  });

  final Color background;
  final Color border;
  final Color text;
}

/// Note editor — calendar palette (amber note tone), no primary blue.
class _AvailabilityNoteDialog extends StatefulWidget {
  const _AvailabilityNoteDialog({
    required this.dateLabel,
    required this.initialComment,
  });

  final String dateLabel;
  final String initialComment;

  @override
  State<_AvailabilityNoteDialog> createState() =>
      _AvailabilityNoteDialogState();
}

class _AvailabilityNoteDialogState extends State<_AvailabilityNoteDialog> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialComment);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final focus = AppAvailabilityTones.unavailable(isDark: isDark);
    final radius = BorderRadius.circular(AppRadius.md);

    return Dialog(
      backgroundColor: colors.bgElevated,
      shape: appDialogShape(colors),
      insetPadding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.md,
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Note',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w700,
                color: colors.textPrimary,
                letterSpacing: -0.2,
              ),
            ),
            const SizedBox(height: AppSpacing.xxs),
            Text(
              widget.dateLabel,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: colors.textSecondary,
                fontWeight: FontWeight.w400,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            TextField(
              controller: _controller,
              maxLines: 4,
              cursorColor: focus,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: colors.textPrimary,
                fontWeight: FontWeight.w400,
              ),
              decoration: InputDecoration(
                hintText: 'Add a comment for this day…',
                hintStyle: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: colors.textTertiary,
                  fontWeight: FontWeight.w400,
                ),
                isDense: true,
                filled: true,
                fillColor: colors.bgSecondary,
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: AppComponentTokens.inputHorizontalPadding,
                  vertical: AppComponentTokens.inputVerticalPadding,
                ),
                border: OutlineInputBorder(
                  borderRadius: radius,
                  borderSide: BorderSide(color: colors.borderDefault),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: radius,
                  borderSide: BorderSide(color: colors.borderDefault),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: radius,
                  borderSide: BorderSide(
                    color: focus,
                    width: AppStroke.medium,
                  ),
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            AppModalActions(
              onCancel: () => Navigator.of(context).pop(),
              onConfirm: () => Navigator.of(context).pop(_controller.text),
            ),
          ],
        ),
      ),
    );
  }
}
