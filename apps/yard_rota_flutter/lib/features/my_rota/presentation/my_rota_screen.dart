import 'package:flutter/material.dart';

import '../../../core/network/models.dart';
import '../../../core/network/my_rota_models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/home_wallpaper.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_button.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/app_modal_actions.dart';
import '../../../core/ui/app_text_field.dart';
import '../../../core/ui/app_toast.dart';
import '../../../core/ui/nav_pill.dart';
import '../data/my_rota_preferences.dart';
import '../data/my_rota_repository.dart';
import '../domain/my_rota_week_logic.dart';

bool _myRotaSameUserId(String slotUserId, String sessionUserId) =>
    slotUserId.trim().toLowerCase() == sessionUserId.trim().toLowerCase();

class MyRotaScreen extends StatefulWidget {
  const MyRotaScreen({
    super.key,
    required this.repository,
    required this.session,
    required this.lightHomeWallpaper,
    required this.darkHomeWallpaper,
  });

  final MyRotaRepository repository;
  final UserSession session;
  final LightHomeWallpaper lightHomeWallpaper;
  final DarkHomeWallpaper darkHomeWallpaper;

  @override
  State<MyRotaScreen> createState() => _MyRotaScreenState();
}

class _MyRotaScreenState extends State<MyRotaScreen> {
  static const _monthAbbr = <String>[
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  static const _weekdayUpper = <String>[
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ];

  late DateTime _weekStartSaturday;
  List<LocationOption> _locations = const [];
  String _locationName = 'Rugby';
  String _shiftFilter = MyRotaRepository.kShiftAll;
  bool _loading = true;
  String? _error;
  Map<String, List<MyRotaSlot>> _slotsByDate = {};
  Map<String, MyRotaAttendanceStatus> _attendanceBySlotId = {};
  Map<String, String> _attendanceNoteBySlotId = {};
  String? _expandedDayYmd;
  final Map<String, GlobalKey> _fullRotaDayKeys = {};

  @override
  void initState() {
    super.initState();
    _weekStartSaturday = myRotaWeekStartSaturday(DateTime.now());
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final locs = await widget.repository.loadActiveLocations();
      final anchor = await widget.repository.loadAnchorShift(
        userId: widget.session.userId,
        fromDate: DateTime.now(),
      );
      String loc;
      String shift;

      if (anchor != null) {
        loc = anchor.location;
        shift = widget.repository.resolveShiftTypeFilter(anchor.shiftType);
        _weekStartSaturday = myRotaWeekStartSaturday(
          _parseLocalYmd(anchor.dateYmd),
        );
      } else {
        final savedLoc = await readSavedMyRotaLocationName();
        final savedShift = await readSavedMyRotaShiftType();
        loc = widget.repository.resolveLocationName(
          locations: locs,
          savedName: savedLoc,
          fallbackName: locs.isNotEmpty ? locs.first.name : null,
        );
        shift = widget.repository.resolveShiftTypeFilter(savedShift);
      }

      if (!mounted) {
        return;
      }
      setState(() {
        _locations = locs;
        _locationName = loc;
        _shiftFilter = shift;
      });
      await _fetchWeek();
    } catch (e) {
      if (!mounted) {
        return;
      }
      setState(() {
        _loading = false;
        _error = 'Failed to load. Check connection and try again.';
      });
      AppToast.error(context, _error!);
    }
  }

  GlobalKey _fullRotaDayKey(String ymd) =>
      _fullRotaDayKeys.putIfAbsent(ymd, GlobalKey.new);

  Future<void> _fetchWeek() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await widget.repository.loadWeek(
        weekStartSaturday: _weekStartSaturday,
        locationName: _locationName,
        shiftTypeFilter: _shiftFilter,
      );
      final merged = widget.repository.mergeWithWeekKeys(
        _weekStartSaturday,
        data.slotsByDateYmd,
      );
      if (!mounted) {
        return;
      }
      final weekYmds = myRotaWeekDateYmds(_weekStartSaturday);
      setState(() {
        _slotsByDate = merged;
        _attendanceBySlotId = Map<String, MyRotaAttendanceStatus>.from(
          data.attendanceBySlotId,
        );
        _attendanceNoteBySlotId = Map<String, String>.from(
          data.attendanceNoteBySlotId,
        );
        _expandedDayYmd = _resolveDefaultExpandedDay(weekYmds, merged);
        _loading = false;
      });
    } catch (e) {
      if (!mounted) {
        return;
      }
      setState(() {
        _loading = false;
        _error = 'Failed to load rota.';
      });
      AppToast.error(context, _error!);
    }
  }

  String _weekRangeLabel() {
    final end = _weekStartSaturday.add(const Duration(days: 6));
    String md(DateTime d) => '${d.day} ${_monthAbbr[d.month - 1]}';
    return '${md(_weekStartSaturday)} – ${md(end)}';
  }

  /// Same style as PWA `Week ${getWeek(weekStart)}` (Sunday-based local week).
  String _weekFilterLabel() => 'Week ${_localWeekNumber(_weekStartSaturday)}';

  static int _localWeekNumber(DateTime date) {
    final local = DateTime(date.year, date.month, date.day);
    final jan1 = DateTime(local.year, 1, 1);
    final dayOfYear = local.difference(jan1).inDays;
    final jan1SunOffset = jan1.weekday % 7; // Sun → 0
    return ((dayOfYear + jan1SunOffset) / 7).floor() + 1;
  }

  String _shiftFilterLabel() {
    return switch (_shiftFilter) {
      MyRotaRepository.kShiftDay => 'Day',
      MyRotaRepository.kShiftAfternoon => 'Afternoon',
      MyRotaRepository.kShiftNight => 'Night',
      _ => 'All',
    };
  }

  static DateTime _parseLocalYmd(String ymd) {
    final p = ymd.split('-');
    if (p.length != 3) {
      return DateTime.now();
    }
    return DateTime(int.parse(p[0]), int.parse(p[1]), int.parse(p[2]));
  }

  Future<void> _persistLocation(String name) async {
    await writeSavedMyRotaLocationName(name);
  }

  Future<void> _persistShift(String value) async {
    await writeSavedMyRotaShiftType(value);
  }

  Future<T?> _showFilterSheet<T>({required WidgetBuilder builder}) {
    final colors = context.appColors;
    return showModalBottomSheet<T>(
      context: context,
      isScrollControlled: true,
      backgroundColor: colors.bgElevated,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.xl)),
        side: BorderSide(color: colors.borderDefault),
      ),
      builder: builder,
    );
  }

  Future<void> _openWeekSheet() async {
    final picked = await _showFilterSheet<String>(
      builder: (_) => _MyRotaPickerSheet(
        title: 'Select week',
        subtitle: _weekRangeLabel(),
        options: const [
          (value: 'prev', label: 'Previous week'),
          (value: 'current', label: 'Current week'),
          (value: 'next', label: 'Next week'),
        ],
      ),
    );
    if (picked == null || !mounted) return;
    setState(() {
      if (picked == 'prev') {
        _weekStartSaturday = myRotaWeekStartSaturday(
          _weekStartSaturday.subtract(const Duration(days: 7)),
        );
      } else if (picked == 'current') {
        _weekStartSaturday = myRotaWeekStartSaturday(DateTime.now());
      } else if (picked == 'next') {
        _weekStartSaturday = _weekStartSaturday.add(const Duration(days: 7));
      }
    });
    await _fetchWeek();
  }

  Future<void> _openLocationSheet() async {
    if (_locations.isEmpty) return;
    final picked = await _showFilterSheet<String>(
      builder: (_) => _MyRotaPickerSheet(
        title: 'Select location',
        subtitle: 'Filter the rota list',
        selectedValue: _locationName,
        options: [
          for (final loc in _locations) (value: loc.name, label: loc.name),
        ],
      ),
    );
    if (picked == null || !mounted || picked == _locationName) return;
    setState(() => _locationName = picked);
    await _persistLocation(picked);
    await _fetchWeek();
  }

  Future<void> _openShiftSheet() async {
    final picked = await _showFilterSheet<String>(
      builder: (_) => _MyRotaPickerSheet(
        title: 'Select shift type',
        subtitle: 'Filter the rota list',
        selectedValue: _shiftFilter,
        options: const [
          (value: MyRotaRepository.kShiftAll, label: 'All shifts'),
          (value: MyRotaRepository.kShiftDay, label: 'Day'),
          (value: MyRotaRepository.kShiftAfternoon, label: 'Afternoon'),
          (value: MyRotaRepository.kShiftNight, label: 'Night'),
        ],
      ),
    );
    if (picked == null || !mounted || picked == _shiftFilter) return;
    setState(() => _shiftFilter = picked);
    await _persistShift(picked);
    await _fetchWeek();
  }

  Future<void> _openAttendanceSheet(MyRotaSlot slot) async {
    if (!widget.session.isAdmin) {
      return;
    }
    final choice = await showModalBottomSheet<_AttendanceChoice>(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.appColors.bgElevated,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.xl)),
      ),
      builder: (_) => _AttendanceSheet(
        slot: slot,
        currentStatus: _attendanceBySlotId[slot.id],
        currentNote: _attendanceNoteBySlotId[slot.id] ?? '',
      ),
    );
    if (choice == null || !mounted) {
      return;
    }
    try {
      await widget.repository.saveAttendance(
        scheduledRotaId: slot.id,
        status: choice.status,
        note: choice.note,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        final status = choice.status;
        if (status == null) {
          _attendanceBySlotId.remove(slot.id);
          _attendanceNoteBySlotId.remove(slot.id);
          return;
        }
        _attendanceBySlotId[slot.id] = status;
        if (choice.note.isEmpty) {
          _attendanceNoteBySlotId.remove(slot.id);
        } else {
          _attendanceNoteBySlotId[slot.id] = choice.note;
        }
      });
    } catch (_) {
      if (!mounted) {
        return;
      }
      AppToast.error(context, 'Could not save attendance.');
    }
  }

  String? _resolveDefaultExpandedDay(
    List<String> weekYmds,
    Map<String, List<MyRotaSlot>> slotsByDate,
  ) {
    final todayYmd = myRotaToYmd(myRotaDateOnly(DateTime.now()));
    if (weekYmds.contains(todayYmd)) {
      return todayYmd;
    }
    for (final ymd in weekYmds) {
      final hasUserShift = (slotsByDate[ymd] ?? const <MyRotaSlot>[]).any(
        (slot) =>
            _myRotaSameUserId(slot.userId, widget.session.userId) &&
            slot.displayNameOrNull != null,
      );
      if (hasUserShift) {
        return ymd;
      }
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final mq = MediaQuery.of(context);
    final wallpaperPath = homeBackgroundAssetPath(
      brightness: isDark ? Brightness.dark : Brightness.light,
      lightWallpaper: widget.lightHomeWallpaper,
      darkWallpaper: widget.darkHomeWallpaper,
    );

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Stack(
        fit: StackFit.expand,
        children: [
          Positioned.fill(
            child: Image.asset(
              wallpaperPath,
              fit: BoxFit.cover,
              alignment: Alignment.center,
              gaplessPlayback: true,
            ),
          ),
          Positioned.fill(
            child: Padding(
              padding: EdgeInsets.fromLTRB(
                AppSpacing.lg,
                mq.padding.top + AppSpacing.sm,
                AppSpacing.lg,
                mq.padding.bottom + AppSpacing.lg,
              ),
              child: _loading && _slotsByDate.isEmpty
                  ? const Center(child: CircularProgressIndicator())
                  : _error != null && _slotsByDate.isEmpty
                  ? _ErrorBody(message: _error!, onRetry: _bootstrap)
                  : LayoutBuilder(
                      builder: (context, _) {
                        final weekYmds = myRotaWeekDateYmds(_weekStartSaturday);
                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            _FilterBar(
                              weekLabel: _weekFilterLabel(),
                              locationLabel: _locationName,
                              shiftLabel: _shiftFilterLabel(),
                              onWeek: _openWeekSheet,
                              onLocation: _openLocationSheet,
                              onShift: _openShiftSheet,
                            ),
                            const SizedBox(height: AppSpacing.md),
                            if (_loading) ...[
                              const LinearProgressIndicator(minHeight: 2),
                              const SizedBox(height: AppSpacing.sm),
                            ],
                            Expanded(
                              child: RefreshIndicator(
                                onRefresh: _fetchWeek,
                                child: SingleChildScrollView(
                                  physics:
                                      const AlwaysScrollableScrollPhysics(),
                                  child: Padding(
                                    padding: const EdgeInsets.only(
                                      bottom: AppSpacing.lg,
                                    ),
                                    child: _FullRotaSection(
                                      weekYmds: weekYmds,
                                      slotsByDate: _slotsByDate,
                                      attendance: _attendanceBySlotId,
                                      attendanceNotes:
                                          _attendanceNoteBySlotId,
                                      sessionUserId: widget.session.userId,
                                      isAdmin: widget.session.isAdmin,
                                      onSlotAdminTap: _openAttendanceSheet,
                                      expandedDayYmd: _expandedDayYmd,
                                      dayKeys: {
                                        for (final ymd in weekYmds)
                                          ymd: _fullRotaDayKey(ymd),
                                      },
                                      onToggleDay: (ymd) {
                                        setState(() {
                                          _expandedDayYmd =
                                              _expandedDayYmd == ymd
                                              ? null
                                              : ymd;
                                        });
                                      },
                                      parseLocalYmd: _parseLocalYmd,
                                      weekdayUpper: _weekdayUpper,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        );
                      },
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AttendanceChoice {
  const _AttendanceChoice(this.status, this.note);

  /// Null means "present" (clears the mark and its reason).
  final MyRotaAttendanceStatus? status;
  final String note;
}

class _AttendanceSheet extends StatefulWidget {
  const _AttendanceSheet({
    required this.slot,
    required this.currentStatus,
    required this.currentNote,
  });

  final MyRotaSlot slot;
  final MyRotaAttendanceStatus? currentStatus;
  final String currentNote;

  @override
  State<_AttendanceSheet> createState() => _AttendanceSheetState();
}

class _AttendanceSheetState extends State<_AttendanceSheet> {
  static const _noteMaxLength = 200;

  late MyRotaAttendanceStatus? _status = widget.currentStatus;
  late final TextEditingController _note = TextEditingController(
    text: widget.currentNote,
  );

  bool get _noteRequired => _status == MyRotaAttendanceStatus.other;

  bool get _canSave =>
      _status != null && (!_noteRequired || _note.text.trim().isNotEmpty);

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final textTheme = Theme.of(context).textTheme;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                widget.slot.displayNameOrNull ?? 'Attendance',
                style: textTheme.titleMedium?.copyWith(
                  color: colors.textPrimary,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                '${widget.slot.dateYmd} · ${widget.slot.fmtTimeShort()}',
                style: textTheme.bodyMedium?.copyWith(
                  color: colors.textSecondary,
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              SegmentedButton<MyRotaAttendanceStatus>(
                segments: [
                  for (final s in MyRotaAttendanceStatus.values)
                    ButtonSegment(value: s, label: Text(s.labelEnglish)),
                ],
                selected: {?_status},
                emptySelectionAllowed: true,
                showSelectedIcon: false,
                onSelectionChanged: (selection) => setState(
                  () => _status = selection.isEmpty ? null : selection.first,
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              AppTextField(
                controller: _note,
                label: _noteRequired
                    ? 'Reason (required)'
                    : 'Reason (optional)',
                hint: 'e.g. Family emergency',
                maxLines: 2,
                maxLength: _noteMaxLength,
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: AppSpacing.md),
              Row(
                children: [
                  if (widget.currentStatus != null) ...[
                    Expanded(
                      child: AppButton(
                        label: 'Clear (Present)',
                        variant: AppButtonVariant.secondary,
                        onPressed: () => Navigator.pop(
                          context,
                          const _AttendanceChoice(null, ''),
                        ),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                  ],
                  Expanded(
                    child: AppButton(
                      label: 'Save',
                      variant: AppButtonVariant.secondary,
                      onPressed: _canSave
                          ? () => Navigator.pop(
                              context,
                              _AttendanceChoice(_status, _note.text.trim()),
                            )
                          : null,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ErrorBody extends StatelessWidget {
  const _ErrorBody({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final accent = AppAvailabilityTones.award(isDark: isDark);
    final wash = AppAvailabilityTones.awardBg(isDark: isDark);
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 400),
        child: AppCard(
          color: Color.alphaBlend(
            wash.withValues(alpha: isDark ? 0.45 : 0.7),
            colors.bgElevated,
          ),
          borderColor: accent.withValues(alpha: isDark ? 0.35 : 0.28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                message,
                textAlign: TextAlign.center,
                style: Theme.of(
                  context,
                ).textTheme.bodyLarge?.copyWith(color: colors.textSecondary),
              ),
              const SizedBox(height: AppSpacing.lg),
              AppButton(
                label: 'Retry',
                variant: AppButtonVariant.secondary,
                onPressed: onRetry,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FullRotaSection extends StatelessWidget {
  const _FullRotaSection({
    required this.weekYmds,
    required this.slotsByDate,
    required this.attendance,
    this.attendanceNotes = const {},
    required this.sessionUserId,
    required this.isAdmin,
    required this.onSlotAdminTap,
    required this.expandedDayYmd,
    required this.dayKeys,
    required this.onToggleDay,
    required this.parseLocalYmd,
    required this.weekdayUpper,
  });

  final List<String> weekYmds;
  final Map<String, List<MyRotaSlot>> slotsByDate;
  final Map<String, MyRotaAttendanceStatus> attendance;
  final Map<String, String> attendanceNotes;
  final String sessionUserId;
  final bool isAdmin;
  final void Function(MyRotaSlot slot) onSlotAdminTap;
  final String? expandedDayYmd;
  final Map<String, GlobalKey> dayKeys;
  final ValueChanged<String> onToggleDay;
  final DateTime Function(String ymd) parseLocalYmd;
  final List<String> weekdayUpper;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < weekYmds.length; i++) ...[
          if (i > 0) const SizedBox(height: AppSpacing.sm),
          Builder(
            builder: (context) {
              final ymd = weekYmds[i];
              final dayDate = parseLocalYmd(ymd);
              final slots = slotsByDate[ymd] ?? const <MyRotaSlot>[];
              final userHasShift = slots.any(
                (slot) =>
                    _myRotaSameUserId(slot.userId, sessionUserId) &&
                    slot.displayNameOrNull != null,
              );
              return _DayCard(
                key: dayKeys[ymd],
                headerWeekday: weekdayUpper[dayDate.weekday - 1],
                date: dayDate,
                dateYmd: ymd,
                slots: slots,
                attendance: attendance,
                attendanceNotes: attendanceNotes,
                sessionUserId: sessionUserId,
                isAdmin: isAdmin,
                onSlotAdminTap: onSlotAdminTap,
                expanded: expandedDayYmd == ymd,
                userHasShift: userHasShift,
                onToggle: () => onToggleDay(ymd),
              );
            },
          ),
        ],
      ],
    );
  }
}

/// Same quiet track shell as Home Calendar / Breaks / Info.
class _FilterBar extends StatelessWidget {
  const _FilterBar({
    required this.weekLabel,
    required this.locationLabel,
    required this.shiftLabel,
    required this.onWeek,
    required this.onLocation,
    required this.onShift,
  });

  final String weekLabel;
  final String locationLabel;
  final String shiftLabel;
  final VoidCallback onWeek;
  final VoidCallback onLocation;
  final VoidCallback onShift;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return Container(
      height: AppHomeTabs.segmentHeight + AppHomeTabs.trackPadding * 2,
      padding: const EdgeInsets.all(AppHomeTabs.trackPadding),
      decoration: BoxDecoration(
        color: colors.bgElevated,
        borderRadius: BorderRadius.circular(AppRadius.full),
        border: Border.all(
          color: colors.borderDefault.withValues(alpha: 0.45),
          width: AppStroke.thin,
        ),
      ),
      child: Row(
        children: [
          Expanded(child: _FilterSegment(label: weekLabel, onTap: onWeek)),
          Expanded(
            child: _FilterSegment(label: locationLabel, onTap: onLocation),
          ),
          Expanded(child: _FilterSegment(label: shiftLabel, onTap: onShift)),
        ],
      ),
    );
  }
}

class _FilterSegment extends StatelessWidget {
  const _FilterSegment({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final labelColor = bottomNavLabelColor(
      colors,
      selected: false,
      isDark: isDark,
    );

    return Material(
      type: MaterialType.transparency,
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
          child: Center(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: AppTypography.labelSmall.copyWith(
                color: labelColor,
                fontWeight: FontWeight.w400,
                fontSize: AppNavPill.bottomLabelFontSize,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// One filter sheet — elevated surface, dark text, teal selected (Home award).
class _MyRotaPickerSheet extends StatefulWidget {
  const _MyRotaPickerSheet({
    required this.title,
    required this.options,
    this.subtitle,
    this.selectedValue,
  });

  final String title;
  final String? subtitle;
  final String? selectedValue;
  final List<({String value, String label})> options;

  @override
  State<_MyRotaPickerSheet> createState() => _MyRotaPickerSheetState();
}

class _MyRotaPickerSheetState extends State<_MyRotaPickerSheet> {
  late String? _selected = widget.selectedValue;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final accent = AppAvailabilityTones.award(isDark: isDark);
    final accentWash = AppAvailabilityTones.awardBg(isDark: isDark);

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.md,
          AppSpacing.sm,
          AppSpacing.md,
          AppSpacing.md,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                margin: const EdgeInsets.only(bottom: AppSpacing.sm),
                decoration: BoxDecoration(
                  color: colors.borderDefault,
                  borderRadius: BorderRadius.circular(AppRadius.full),
                ),
              ),
            ),
            Text(
              widget.title,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w600,
                color: colors.textPrimary,
              ),
            ),
            if (widget.subtitle != null) ...[
              const SizedBox(height: AppSpacing.xxs),
              Text(
                widget.subtitle!,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: colors.textSecondary,
                  fontWeight: FontWeight.w400,
                ),
              ),
            ],
            const SizedBox(height: AppSpacing.sm),
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 320),
              child: SingleChildScrollView(
                child: Column(
                  children: [
                    for (final option in widget.options)
                      Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.xxs),
                        child: Material(
                          color: option.value == _selected
                              ? Color.alphaBlend(
                                  accentWash.withValues(alpha: 0.85),
                                  colors.bgElevated,
                                )
                              : colors.bgElevated,
                          borderRadius: BorderRadius.circular(AppRadius.md),
                          child: InkWell(
                            borderRadius: BorderRadius.circular(AppRadius.md),
                            onTap: () =>
                                setState(() => _selected = option.value),
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: AppSpacing.sm,
                                vertical: AppSpacing.sm,
                              ),
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(
                                  AppRadius.md,
                                ),
                                border: Border.all(
                                  color: option.value == _selected
                                      ? accent.withValues(alpha: 0.45)
                                      : colors.borderDefault,
                                ),
                              ),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      option.label,
                                      style: Theme.of(context)
                                          .textTheme
                                          .bodyMedium
                                          ?.copyWith(
                                            color: option.value == _selected
                                                ? accent
                                                : colors.textPrimary,
                                            fontWeight:
                                                option.value == _selected
                                                ? FontWeight.w600
                                                : FontWeight.w400,
                                          ),
                                    ),
                                  ),
                                  if (option.value == _selected)
                                    Icon(
                                      Icons.check_rounded,
                                      size: 20,
                                      color: accent,
                                    ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            AppModalActions(
              onCancel: () => Navigator.of(context).pop(),
              onConfirm: _selected == null
                  ? null
                  : () => Navigator.of(context).pop(_selected),
              confirmLabel: 'Done',
              confirmEnabled: _selected != null,
            ),
          ],
        ),
      ),
    );
  }
}

class _DayCard extends StatelessWidget {
  const _DayCard({
    super.key,
    required this.headerWeekday,
    required this.date,
    required this.dateYmd,
    required this.slots,
    required this.attendance,
    this.attendanceNotes = const {},
    required this.sessionUserId,
    required this.isAdmin,
    required this.onSlotAdminTap,
    required this.expanded,
    required this.userHasShift,
    required this.onToggle,
  });

  final String headerWeekday;
  final DateTime date;
  final String dateYmd;
  final List<MyRotaSlot> slots;
  final Map<String, MyRotaAttendanceStatus> attendance;
  final Map<String, String> attendanceNotes;
  final String sessionUserId;
  final bool isAdmin;
  final void Function(MyRotaSlot slot) onSlotAdminTap;
  final bool expanded;
  final bool userHasShift;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final today = myRotaDateOnly(DateTime.now());
    final isToday = myRotaDateOnly(date) == today;
    final presentSlots = slots
        .where((s) => s.displayNameOrNull != null && attendance[s.id] == null)
        .toList();

    final dayCount = presentSlots.where((s) => s.shiftType == 'day').length;
    final aftCount = presentSlots
        .where((s) => s.shiftType == 'afternoon')
        .length;
    final nightCount = presentSlots.where((s) => s.shiftType == 'night').length;

    final accent = AppAvailabilityTones.award(isDark: isDark);
    final accentWash = AppAvailabilityTones.awardBg(isDark: isDark);
    // Solid elevated surface + dark text (Home neutrals) — no slate/gray wash.
    final cardFill = colors.bgElevated;
    final headerFill = isToday
        ? Color.alphaBlend(
            accentWash.withValues(alpha: isDark ? 0.55 : 0.85),
            colors.bgElevated,
          )
        : colors.bgElevated;

    return AppCard(
      padding: EdgeInsets.zero,
      color: cardFill,
      borderColor: userHasShift
          ? accent.withValues(alpha: 0.55)
          : colors.borderDefault,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Material(
            color: headerFill,
            child: InkWell(
              onTap: onToggle,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.sm,
                  AppSpacing.sm,
                  AppSpacing.sm,
                  AppSpacing.sm,
                ),
                child: Column(
                  children: [
                    Text(
                      '${headerWeekday.toUpperCase()} ${_ordinalUpper(date.day)}',
                      textAlign: TextAlign.center,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        color: colors.textPrimary,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.6,
                        height: 1.1,
                      ),
                    ),
                      if (dayCount > 0 || aftCount > 0 || nightCount > 0) ...[
                        const SizedBox(height: AppSpacing.xs),
                        Wrap(
                          alignment: WrapAlignment.center,
                          spacing: AppSpacing.xxs,
                          runSpacing: AppSpacing.xxs,
                          children: [
                            if (dayCount > 0)
                              _ShiftCountChip(
                                icon: Icons.wb_sunny_outlined,
                                count: dayCount,
                                fg: AppPrimitives.amber800,
                                bg: AppPrimitives.amber50,
                                border: AppPrimitives.amber200,
                              ),
                            if (aftCount > 0)
                              _ShiftCountChip(
                                icon: Icons.cloud_outlined,
                                count: aftCount,
                                fg: AppPrimitives.violet600,
                                bg: AppPrimitives.violet50,
                                border: AppPrimitives.violet200,
                              ),
                            if (nightCount > 0)
                              _ShiftCountChip(
                                icon: Icons.nightlight_outlined,
                                count: nightCount,
                                fg: AppPrimitives.blue800,
                                bg: AppPrimitives.blue50,
                                border: AppPrimitives.blue200,
                              ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
            Divider(
              height: 1,
              thickness: AppStroke.hairline,
              color: colors.divider.withValues(alpha: 0.72),
            ),
            AnimatedSize(
              duration: AppMotion.normal,
              curve: AppMotion.ease,
              alignment: Alignment.topCenter,
              child: expanded
                  ? Padding(
                      padding: const EdgeInsets.all(AppSpacing.sm),
                      child: _DayDetailsBody(
                        slots: slots,
                        attendance: attendance,
                        attendanceNotes: attendanceNotes,
                        sessionUserId: sessionUserId,
                        isAdmin: isAdmin,
                        onSlotAdminTap: onSlotAdminTap,
                      ),
                    )
                  : const SizedBox.shrink(),
            ),
          ],
        ),
    );
  }

  static String _ordinalUpper(int day) {
    final suffix = switch (day % 100) {
      11 || 12 || 13 => 'TH',
      _ => switch (day % 10) {
        1 => 'ST',
        2 => 'ND',
        3 => 'RD',
        _ => 'TH',
      },
    };
    return '$day$suffix';
  }
}

class _ShiftCountChip extends StatelessWidget {
  const _ShiftCountChip({
    required this.icon,
    required this.count,
    required this.fg,
    required this.bg,
    required this.border,
  });

  final IconData icon;
  final int count;
  final Color fg;
  final Color bg;
  final Color border;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(AppRadius.full),
        border: Border.all(
          color: border.withValues(alpha: 0.6),
          width: AppStroke.hairline,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.xs,
          vertical: AppSpacing.xxs,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 10, color: fg),
            const SizedBox(width: 2),
            Text(
              '$count',
              style: AppTypography.caption.copyWith(
                color: fg,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DayDetailsBody extends StatelessWidget {
  const _DayDetailsBody({
    required this.slots,
    required this.attendance,
    this.attendanceNotes = const {},
    required this.sessionUserId,
    required this.isAdmin,
    required this.onSlotAdminTap,
  });

  final List<MyRotaSlot> slots;
  final Map<String, MyRotaAttendanceStatus> attendance;
  final Map<String, String> attendanceNotes;
  final String sessionUserId;
  final bool isAdmin;
  final void Function(MyRotaSlot slot) onSlotAdminTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final slotsShown = slots
        .where((slot) => slot.displayNameOrNull != null)
        .toList();
    if (slotsShown.isEmpty) {
      return DecoratedBox(
        decoration: BoxDecoration(
          color: colors.bgElevated,
          borderRadius: BorderRadius.circular(AppRadius.lg),
          border: Border.all(color: colors.borderDefault),
        ),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.sm),
          child: Text(
            'No shifts scheduled',
            textAlign: TextAlign.center,
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: colors.textPrimary),
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final key in const ['day', 'afternoon', 'night']) ...[
          _ShiftTypeSection(
            shiftKey: key,
            slots: slotsShown,
            attendance: attendance,
            attendanceNotes: attendanceNotes,
            sessionUserId: sessionUserId,
            isAdmin: isAdmin,
            onSlotAdminTap: onSlotAdminTap,
          ),
        ],
      ],
    );
  }
}

class _ShiftTypeSection extends StatelessWidget {
  const _ShiftTypeSection({
    required this.shiftKey,
    required this.slots,
    required this.attendance,
    this.attendanceNotes = const {},
    required this.sessionUserId,
    required this.isAdmin,
    required this.onSlotAdminTap,
  });

  final String shiftKey;
  final List<MyRotaSlot> slots;
  final Map<String, MyRotaAttendanceStatus> attendance;
  final Map<String, String> attendanceNotes;
  final String sessionUserId;
  final bool isAdmin;
  final void Function(MyRotaSlot slot) onSlotAdminTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final sectionSlots =
        slots.where((s) => s.shiftType == shiftKey).toList()
          ..sort((a, b) {
            final c = a.startTime.compareTo(b.startTime);
            if (c != 0) return c;
            final end = a.endTime.compareTo(b.endTime);
            if (end != 0) return end;
            return a.displayNameOrNull!.compareTo(b.displayNameOrNull!);
          });
    if (sectionSlots.isEmpty) return const SizedBox.shrink();

    final presentCount = sectionSlots
        .where((s) => attendance[s.id] == null)
        .length;
    final (title, icon) = switch (shiftKey) {
      'afternoon' => ('Afternoon shift', Icons.cloud_outlined),
      'night' => ('Night shift', Icons.nightlight_outlined),
      _ => ('Day shift', Icons.wb_sunny_outlined),
    };

    final byStart = <String, List<MyRotaSlot>>{};
    for (final s in sectionSlots) {
      byStart.putIfAbsent(s.fmtTimeShort(), () => []).add(s);
    }
    final starts = byStart.keys.toList()..sort();

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.xxs,
              0,
              AppSpacing.xxs,
              AppSpacing.xs,
            ),
            child: Row(
              children: [
                Icon(icon, size: 14, color: colors.textSecondary),
                const SizedBox(width: AppSpacing.xs),
                Expanded(
                  child: Text(
                    title.toUpperCase(),
                    style: AppTypography.caption.copyWith(
                      color: colors.textSecondary,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0.8,
                    ),
                  ),
                ),
                Text(
                  '$presentCount',
                  style: AppTypography.caption.copyWith(
                    color: colors.textTertiary,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
          DecoratedBox(
            decoration: BoxDecoration(
              color: colors.bgElevated,
              // No left/right edge strokes — those read as vertical ticks.
              border: Border(
                top: BorderSide(
                  color: colors.borderDefault,
                  width: AppStroke.hairline,
                ),
                bottom: BorderSide(
                  color: colors.borderDefault,
                  width: AppStroke.hairline,
                ),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final start in starts)
                  _TimeGroup(
                    startLabel: start,
                    slots: byStart[start]!,
                    attendance: attendance,
                    attendanceNotes: attendanceNotes,
                    sessionUserId: sessionUserId,
                    isAdmin: isAdmin,
                    onSlotAdminTap: onSlotAdminTap,
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _TimeGroup extends StatelessWidget {
  const _TimeGroup({
    required this.startLabel,
    required this.slots,
    required this.attendance,
    this.attendanceNotes = const {},
    required this.sessionUserId,
    required this.isAdmin,
    required this.onSlotAdminTap,
  });

  final String startLabel;
  final List<MyRotaSlot> slots;
  final Map<String, MyRotaAttendanceStatus> attendance;
  final Map<String, String> attendanceNotes;
  final String sessionUserId;
  final bool isAdmin;
  final void Function(MyRotaSlot slot) onSlotAdminTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final endFmt = slots.isEmpty
        ? ''
        : (slots.first.endTime.length >= 5
              ? slots.first.endTime.substring(0, 5)
              : slots.first.endTime);
    final timeRange = '$startLabel - $endFmt';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.sm,
            AppSpacing.sm,
            AppSpacing.sm,
            AppSpacing.xxs,
          ),
          child: Text(
            timeRange,
            textAlign: TextAlign.center,
            style: AppTypography.caption.copyWith(
              color: colors.textSecondary,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        Divider(
          height: 1,
          thickness: AppStroke.hairline,
          color: colors.divider.withValues(alpha: 0.72),
        ),
        for (var i = 0; i < slots.length; i++) ...[
          if (i > 0)
            Divider(
              height: 1,
              thickness: AppStroke.hairline,
              color: colors.divider.withValues(alpha: 0.55),
            ),
          _PersonRow(
            slot: slots[i],
            attendance: attendance[slots[i].id],
            note: isAdmin ? attendanceNotes[slots[i].id] : null,
            isYou: _myRotaSameUserId(slots[i].userId, sessionUserId),
            isAdmin: isAdmin,
            onTap: isAdmin ? () => onSlotAdminTap(slots[i]) : null,
          ),
        ],
      ],
    );
  }
}

class _PersonRow extends StatelessWidget {
  const _PersonRow({
    required this.slot,
    required this.attendance,
    this.note,
    required this.isYou,
    required this.isAdmin,
    this.onTap,
  });

  final MyRotaSlot slot;
  final MyRotaAttendanceStatus? attendance;
  final String? note;
  final bool isYou;
  final bool isAdmin;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final displayName = slot.displayNameOrNull;
    if (displayName == null) {
      return const SizedBox.shrink();
    }
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final accent = AppAvailabilityTones.award(isDark: isDark);
    final accentWash = AppAvailabilityTones.awardBg(isDark: isDark);

    return Material(
      color: isYou
          ? Color.alphaBlend(
              accentWash.withValues(alpha: 0.85),
              colors.bgElevated,
            )
          : colors.bgElevated,
      child: InkWell(
        onTap: onTap,
        child: DecoratedBox(
          decoration: isYou
              ? BoxDecoration(
                  border: Border(
                    left: BorderSide(color: accent, width: 2),
                  ),
                )
              : const BoxDecoration(),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.sm,
              vertical: AppSpacing.sm,
            ),
            child: Column(
              children: [
                Wrap(
                  alignment: WrapAlignment.center,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  spacing: AppSpacing.xs,
                  runSpacing: AppSpacing.xxs,
                  children: [
                    Text(
                      displayName,
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w500,
                        color: isYou ? accent : colors.textPrimary,
                      ),
                    ),
                    if (attendance != null)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.xs,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: colors.dangerBg,
                          borderRadius: BorderRadius.circular(AppRadius.full),
                          border: Border.all(color: colors.borderDefault),
                        ),
                        child: Text(
                          attendance!.labelEnglish,
                          style: AppTypography.caption.copyWith(
                            color: colors.danger,
                            fontWeight: FontWeight.w500,
                            fontSize: 10,
                          ),
                        ),
                      ),
                    if (isYou)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.xs,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: Color.alphaBlend(
                            accentWash.withValues(alpha: 0.85),
                            colors.bgElevated,
                          ),
                          borderRadius: BorderRadius.circular(AppRadius.full),
                          border: Border.all(
                            color: accent.withValues(alpha: 0.45),
                          ),
                        ),
                        child: Text(
                          'YOU',
                          style: AppTypography.caption.copyWith(
                            color: accent,
                            fontWeight: FontWeight.w700,
                            fontSize: 10,
                            letterSpacing: 0.4,
                          ),
                        ),
                      ),
                  ],
                ),
                if (isAdmin && note != null && note!.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.xxs),
                  Text(
                    note!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: AppTypography.caption.copyWith(
                      color: colors.textSecondary,
                      fontSize: 11,
                    ),
                  ),
                ],
                if (slot.task != null && slot.task!.trim().isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.xxs),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.sm,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: colors.dangerBg,
                      borderRadius: BorderRadius.circular(AppRadius.full),
                      border: Border.all(color: colors.borderDefault),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 6,
                          height: 6,
                          decoration: BoxDecoration(
                            color: colors.danger,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: AppSpacing.xs),
                        Flexible(
                          child: Text(
                            slot.task!,
                            style: Theme.of(context).textTheme.bodySmall
                                ?.copyWith(
                                  color: colors.danger,
                                  fontSize: 12,
                                ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
