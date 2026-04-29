import 'dart:ui';

import 'package:flutter/material.dart';

import '../../../core/network/models.dart';
import '../../../core/network/my_rota_models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/home_wallpaper.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_toast.dart';
import '../data/my_rota_preferences.dart';
import '../data/my_rota_repository.dart';
import '../domain/my_rota_week_logic.dart';

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
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
    'SUNDAY',
  ];

  late DateTime _weekStartSaturday;
  List<LocationOption> _locations = const [];
  String _locationName = 'Rugby';
  String _shiftFilter = MyRotaRepository.kShiftAll;
  bool _loading = true;
  String? _error;
  Map<String, List<MyRotaSlot>> _slotsByDate = {};
  Map<String, MyRotaAttendanceStatus> _attendanceBySlotId = {};
  String? _expandedYmd;

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
      final savedLoc = await readSavedMyRotaLocationName();
      final savedShift = await readSavedMyRotaShiftType();
      final loc = widget.repository.resolveLocationName(
        locations: locs,
        savedName: savedLoc,
        fallbackName: locs.isNotEmpty ? locs.first.name : null,
      );
      final shift = widget.repository.resolveShiftTypeFilter(savedShift);
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
      AppToast.show(context, _error!);
    }
  }

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
      final keys = myRotaWeekDateYmds(_weekStartSaturday);
      final todayYmd = myRotaToYmd(myRotaDateOnly(DateTime.now()));
      setState(() {
        _slotsByDate = merged;
        _attendanceBySlotId = Map<String, MyRotaAttendanceStatus>.from(
          data.attendanceBySlotId,
        );
        _loading = false;
        _expandedYmd = keys.contains(todayYmd) ? todayYmd : keys.first;
      });
    } catch (e) {
      if (!mounted) {
        return;
      }
      setState(() {
        _loading = false;
        _error = 'Failed to load rota.';
      });
      AppToast.show(context, _error!);
    }
  }

  String _weekRangeLabel() {
    final end = _weekStartSaturday.add(const Duration(days: 6));
    String md(DateTime d) => '${d.day} ${_monthAbbr[d.month - 1]}';
    return '${md(_weekStartSaturday)} – ${md(end)}';
  }

  String _shiftFilterLabel() {
    return switch (_shiftFilter) {
      MyRotaRepository.kShiftDay => 'Day',
      MyRotaRepository.kShiftAfternoon => 'Afternoon',
      MyRotaRepository.kShiftNight => 'Night',
      _ => 'All',
    };
  }

  String _dayHeaderTitle(DateTime date) {
    final ord = _dayOrdinal(date.day);
    return '${_weekdayUpper[date.weekday - 1]} $ord';
  }

  static DateTime _parseLocalYmd(String ymd) {
    final p = ymd.split('-');
    if (p.length != 3) {
      return DateTime.now();
    }
    return DateTime(int.parse(p[0]), int.parse(p[1]), int.parse(p[2]));
  }

  String _dayOrdinal(int day) {
    if (day >= 11 && day <= 13) {
      return '${day}TH';
    }
    switch (day % 10) {
      case 1:
        return '${day}ST';
      case 2:
        return '${day}ND';
      case 3:
        return '${day}RD';
      default:
        return '${day}TH';
    }
  }

  Future<void> _persistLocation(String name) async {
    await writeSavedMyRotaLocationName(name);
  }

  Future<void> _persistShift(String value) async {
    await writeSavedMyRotaShiftType(value);
  }

  Future<void> _openWeekSheet() async {
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: context.appColors.bgElevated,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.xl)),
      ),
      builder: (ctx) {
        final colors = ctx.appColors;
        return Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Select week',
                style: Theme.of(ctx).textTheme.titleLarge?.copyWith(
                  color: colors.textPrimary,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              OutlinedButton(
                onPressed: () {
                  Navigator.pop(ctx);
                  setState(() {
                    _weekStartSaturday = myRotaWeekStartSaturday(
                      _weekStartSaturday.subtract(const Duration(days: 7)),
                    );
                  });
                  _fetchWeek();
                },
                child: const Text('Previous week'),
              ),
              const SizedBox(height: AppSpacing.sm),
              FilledButton(
                onPressed: () {
                  Navigator.pop(ctx);
                  setState(() {
                    _weekStartSaturday = myRotaWeekStartSaturday(
                      DateTime.now(),
                    );
                  });
                  _fetchWeek();
                },
                child: const Text('Current week'),
              ),
              const SizedBox(height: AppSpacing.sm),
              OutlinedButton(
                onPressed: () {
                  Navigator.pop(ctx);
                  setState(() {
                    _weekStartSaturday = _weekStartSaturday.add(
                      const Duration(days: 7),
                    );
                  });
                  _fetchWeek();
                },
                child: const Text('Next week'),
              ),
              SizedBox(
                height: MediaQuery.paddingOf(ctx).bottom + AppSpacing.sm,
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _openLocationSheet() async {
    if (_locations.isEmpty) {
      return;
    }
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: context.appColors.bgElevated,
      isScrollControlled: true,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.xl)),
      ),
      builder: (ctx) {
        final colors = ctx.appColors;
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Select location',
                  style: Theme.of(ctx).textTheme.titleLarge?.copyWith(
                    color: colors.textPrimary,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                ListView(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  children: [
                    for (final loc in _locations)
                      ListTile(
                        title: Text(
                          loc.name,
                          style: TextStyle(
                            color: loc.name == _locationName
                                ? colors.primary
                                : colors.textPrimary,
                            fontWeight: loc.name == _locationName
                                ? FontWeight.w700
                                : FontWeight.w500,
                          ),
                        ),
                        onTap: () async {
                          Navigator.pop(ctx);
                          setState(() => _locationName = loc.name);
                          await _persistLocation(loc.name);
                          _fetchWeek();
                        },
                      ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _openShiftSheet() async {
    Future<void> pick(String value) async {
      Navigator.pop(context);
      setState(() => _shiftFilter = value);
      await _persistShift(value);
      _fetchWeek();
    }

    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: context.appColors.bgElevated,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.xl)),
      ),
      builder: (ctx) {
        final colors = ctx.appColors;
        Widget row(String value, String label) {
          final sel = _shiftFilter == value;
          return ListTile(
            title: Text(
              label,
              style: TextStyle(
                color: sel ? colors.primary : colors.textPrimary,
                fontWeight: sel ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
            onTap: () => pick(value),
          );
        }

        return Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Select shift type',
                style: Theme.of(ctx).textTheme.titleLarge?.copyWith(
                  color: colors.textPrimary,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              row(MyRotaRepository.kShiftAll, 'All shifts'),
              row(MyRotaRepository.kShiftDay, 'Day'),
              row(MyRotaRepository.kShiftAfternoon, 'Afternoon'),
              row(MyRotaRepository.kShiftNight, 'Night'),
              SizedBox(height: MediaQuery.paddingOf(ctx).bottom),
            ],
          ),
        );
      },
    );
  }

  Future<void> _openAttendanceSheet(MyRotaSlot slot) async {
    if (!widget.session.isAdmin) {
      return;
    }
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: context.appColors.bgElevated,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.xl)),
      ),
      builder: (ctx) {
        final colors = ctx.appColors;
        Future<void> apply(MyRotaAttendanceStatus? status) async {
          Navigator.pop(ctx);
          try {
            await widget.repository.saveAttendance(
              scheduledRotaId: slot.id,
              status: status,
            );
            if (!mounted) {
              return;
            }
            setState(() {
              if (status == null) {
                _attendanceBySlotId.remove(slot.id);
              } else {
                _attendanceBySlotId[slot.id] = status;
              }
            });
          } catch (_) {
            if (!mounted) {
              return;
            }
            AppToast.show(context, 'Could not save attendance.');
          }
        }

        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  slot.displayName,
                  style: Theme.of(ctx).textTheme.titleMedium?.copyWith(
                    color: colors.textPrimary,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  '${slot.dateYmd} · ${slot.fmtTimeShort()}',
                  style: Theme.of(
                    ctx,
                  ).textTheme.bodyMedium?.copyWith(color: colors.textSecondary),
                ),
                const SizedBox(height: AppSpacing.lg),
                ListTile(title: const Text('Clear'), onTap: () => apply(null)),
                ListTile(
                  title: const Text('No show'),
                  onTap: () => apply(MyRotaAttendanceStatus.noShow),
                ),
                ListTile(
                  title: const Text('Sick'),
                  onTap: () => apply(MyRotaAttendanceStatus.sick),
                ),
                ListTile(
                  title: const Text('Late'),
                  onTap: () => apply(MyRotaAttendanceStatus.late),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final mq = MediaQuery.of(context);
    final topContentInset = mq.padding.top + kToolbarHeight;
    final wallpaperPath = homeBackgroundAssetPath(
      brightness: isDark ? Brightness.dark : Brightness.light,
      lightWallpaper: widget.lightHomeWallpaper,
      darkWallpaper: widget.darkHomeWallpaper,
    );

    return Scaffold(
      backgroundColor: Colors.transparent,
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        flexibleSpace: ClipRect(
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: isDark
                      ? [
                          colors.bgPrimary.withValues(alpha: 0.0),
                          colors.bgPrimary.withValues(alpha: 0.28),
                        ]
                      : [
                          Colors.white.withValues(alpha: 0.0),
                          Colors.white.withValues(alpha: 0.42),
                        ],
                ),
              ),
            ),
          ),
        ),
        title: const Text('My Rota'),
      ),
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
                topContentInset,
                AppSpacing.lg,
                mq.padding.bottom + AppSpacing.lg,
              ),
              child: _loading && _slotsByDate.isEmpty
                  ? const Center(child: CircularProgressIndicator())
                  : _error != null && _slotsByDate.isEmpty
                  ? _ErrorBody(message: _error!, onRetry: _bootstrap)
                  : LayoutBuilder(
                      builder: (context, viewportConstraints) {
                        final minH = viewportConstraints.maxHeight.isFinite
                            ? viewportConstraints.maxHeight
                            : 400.0;
                        return RefreshIndicator(
                          onRefresh: _fetchWeek,
                          child: SingleChildScrollView(
                            physics: const AlwaysScrollableScrollPhysics(),
                            child: ConstrainedBox(
                              constraints: BoxConstraints(minHeight: minH),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  _FilterBar(
                                    weekLabel: _weekRangeLabel(),
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
                                  for (final ymd in myRotaWeekDateYmds(
                                    _weekStartSaturday,
                                  ))
                                    _DayCard(
                                      headerTitle: _dayHeaderTitle(
                                        _parseLocalYmd(ymd),
                                      ),
                                      date: _parseLocalYmd(ymd),
                                      dateYmd: ymd,
                                      slots: _slotsByDate[ymd] ?? const [],
                                      attendance: _attendanceBySlotId,
                                      expanded: _expandedYmd == ymd,
                                      sessionUserId: widget.session.userId,
                                      isAdmin: widget.session.isAdmin,
                                      onHeaderTap: () {
                                        setState(() {
                                          _expandedYmd = _expandedYmd == ymd
                                              ? null
                                              : ymd;
                                        });
                                      },
                                      onSlotAdminTap: _openAttendanceSheet,
                                    ),
                                ],
                              ),
                            ),
                          ),
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

class _ErrorBody extends StatelessWidget {
  const _ErrorBody({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 400),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: colors.bgElevated.withValues(alpha: 0.92),
            borderRadius: BorderRadius.circular(AppRadius.lg),
            border: Border.all(color: colors.borderDefault),
          ),
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.xl),
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
                FilledButton(onPressed: onRetry, child: const Text('Retry')),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

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
    Widget cell(String text, VoidCallback onTap) {
      return Expanded(
        child: Material(
          color: colors.bgElevated.withValues(alpha: 0.88),
          borderRadius: BorderRadius.circular(AppRadius.md),
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(AppRadius.md),
            child: Container(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.xs,
                vertical: AppSpacing.sm,
              ),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(AppRadius.md),
                border: Border.all(color: colors.borderDefault),
              ),
              alignment: Alignment.center,
              child: Text(
                text,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  color: colors.textPrimary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        ),
      );
    }

    return Row(
      children: [
        cell(weekLabel, onWeek),
        const SizedBox(width: AppSpacing.sm),
        cell(locationLabel, onLocation),
        const SizedBox(width: AppSpacing.sm),
        cell(shiftLabel, onShift),
      ],
    );
  }
}

class _DayCard extends StatelessWidget {
  const _DayCard({
    required this.headerTitle,
    required this.date,
    required this.dateYmd,
    required this.slots,
    required this.attendance,
    required this.expanded,
    required this.sessionUserId,
    required this.isAdmin,
    required this.onHeaderTap,
    required this.onSlotAdminTap,
  });

  final String headerTitle;
  final DateTime date;
  final String dateYmd;
  final List<MyRotaSlot> slots;
  final Map<String, MyRotaAttendanceStatus> attendance;
  final bool expanded;
  final String sessionUserId;
  final bool isAdmin;
  final VoidCallback onHeaderTap;
  final void Function(MyRotaSlot slot) onSlotAdminTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final today = myRotaDateOnly(DateTime.now());
    final isToday = myRotaDateOnly(date) == today;
    final isWeekend =
        date.weekday == DateTime.saturday || date.weekday == DateTime.sunday;
    final userHasShift = slots.any((s) => s.userId == sessionUserId);

    final presentSlots = slots.where((s) {
      if (attendance[s.id] != null) {
        return false;
      }
      return s.firstName != null || s.lastName != null;
    }).toList();

    final dayCount = presentSlots.where((s) => s.shiftType == 'day').length;
    final aftCount = presentSlots
        .where((s) => s.shiftType == 'afternoon')
        .length;
    final nightCount = presentSlots.where((s) => s.shiftType == 'night').length;

    final edgeColor = isToday ? colors.primary : colors.borderDefault;
    final edgeWidth = isToday ? AppStroke.thick : AppStroke.thin;
    final cardBorder = userHasShift
        ? Border(
            left: BorderSide(
              color: colors.primary,
              width: AppStroke.thick * 2,
            ),
            top: BorderSide(color: edgeColor, width: edgeWidth),
            right: BorderSide(color: edgeColor, width: edgeWidth),
            bottom: BorderSide(color: edgeColor, width: edgeWidth),
          )
        : Border.all(color: edgeColor, width: edgeWidth);

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.bgElevated.withValues(alpha: isWeekend ? 0.86 : 0.92),
          borderRadius: BorderRadius.circular(AppRadius.lg),
          border: cardBorder,
          boxShadow: isToday
              ? [
                  BoxShadow(
                    color: colors.primary.withValues(alpha: 0.18),
                    blurRadius: AppElevation.level4,
                    offset: const Offset(0, 2),
                  ),
                ]
              : null,
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(AppRadius.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: onHeaderTap,
                  borderRadius: BorderRadius.vertical(
                    top: Radius.circular(AppRadius.lg),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(AppSpacing.md),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          headerTitle,
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.titleSmall?.copyWith(
                            color: colors.textPrimary,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.4,
                          ),
                        ),
                        if (slots.isNotEmpty) ...[
                          const SizedBox(height: AppSpacing.sm),
                          Wrap(
                            alignment: WrapAlignment.center,
                            spacing: AppSpacing.xs,
                            runSpacing: AppSpacing.xs,
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
                                  fg: AppPrimitives.amber800,
                                  bg: AppPrimitives.amber100,
                                  border: AppPrimitives.amber300,
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
              if (expanded)
                _DayDetailsBody(
                  slots: slots,
                  attendance: attendance,
                  sessionUserId: sessionUserId,
                  isAdmin: isAdmin,
                  onSlotAdminTap: onSlotAdminTap,
                ),
            ],
          ),
        ),
      ),
    );
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
        border: Border.all(color: border.withValues(alpha: 0.6)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.sm,
          vertical: AppSpacing.xs,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: fg),
            const SizedBox(width: AppSpacing.xs),
            Text(
              '$count',
              style: AppTypography.labelMedium.copyWith(color: fg),
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
    required this.sessionUserId,
    required this.isAdmin,
    required this.onSlotAdminTap,
  });

  final List<MyRotaSlot> slots;
  final Map<String, MyRotaAttendanceStatus> attendance;
  final String sessionUserId;
  final bool isAdmin;
  final void Function(MyRotaSlot slot) onSlotAdminTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final withProfile = slots
        .where((s) => s.firstName != null || s.lastName != null)
        .toList();
    if (withProfile.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Text(
          'No shifts scheduled',
          textAlign: TextAlign.center,
          style: Theme.of(
            context,
          ).textTheme.bodyMedium?.copyWith(color: colors.textSecondary),
        ),
      );
    }

    Widget section(
      String shiftKey,
      String title,
      IconData icon,
      Color headerBg,
      Color headerFg,
      Color iconColor,
    ) {
      final sectionSlots =
          withProfile.where((s) => s.shiftType == shiftKey).toList()
            ..sort((a, b) {
              final c = a.startTime.compareTo(b.startTime);
              if (c != 0) {
                return c;
              }
              return a.displayName.compareTo(b.displayName);
            });
      if (sectionSlots.isEmpty) {
        return const SizedBox.shrink();
      }
      final present = sectionSlots
          .where((s) => attendance[s.id] == null)
          .length;

      final byStart = <String, List<MyRotaSlot>>{};
      for (final s in sectionSlots) {
        final k = s.fmtTimeShort();
        byStart.putIfAbsent(k, () => []).add(s);
      }
      final starts = byStart.keys.toList()..sort();

      return Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.sm,
          0,
          AppSpacing.sm,
          AppSpacing.sm,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            DecoratedBox(
              decoration: BoxDecoration(
                color: headerBg,
                borderRadius: BorderRadius.circular(AppRadius.md),
                border: Border.all(
                  color: colors.borderDefault.withValues(alpha: 0.5),
                ),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.sm,
                  vertical: AppSpacing.sm,
                ),
                child: Row(
                  children: [
                    Icon(icon, size: 16, color: iconColor),
                    const SizedBox(width: AppSpacing.xs),
                    Expanded(
                      child: Text(
                        title,
                        style: AppTypography.labelMedium.copyWith(
                          color: headerFg,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    DecoratedBox(
                      decoration: BoxDecoration(
                        color: colors.bgElevated,
                        borderRadius: BorderRadius.circular(AppRadius.full),
                        border: Border.all(color: colors.borderDefault),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.sm,
                          vertical: AppSpacing.xxs,
                        ),
                        child: Text(
                          '$present',
                          style: AppTypography.caption.copyWith(
                            color: colors.textPrimary,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            DecoratedBox(
              decoration: BoxDecoration(
                color: colors.bgPrimary.withValues(alpha: 0.55),
                borderRadius: BorderRadius.circular(AppRadius.md),
                border: Border.all(color: colors.borderSubtle),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (var ti = 0; ti < starts.length; ti++) ...[
                    if (ti > 0)
                      Divider(height: 1, thickness: 1, color: colors.divider),
                    _TimeGroup(
                      startLabel: starts[ti],
                      slots: byStart[starts[ti]]!,
                      attendance: attendance,
                      sessionUserId: sessionUserId,
                      isAdmin: isAdmin,
                      shiftHeaderBg: headerBg,
                      onSlotAdminTap: onSlotAdminTap,
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        section(
          'day',
          'Day shift',
          Icons.wb_sunny_outlined,
          AppPrimitives.amber50,
          AppPrimitives.amber900,
          AppPrimitives.amber600,
        ),
        section(
          'afternoon',
          'Afternoon shift',
          Icons.cloud_outlined,
          AppPrimitives.amber100,
          AppPrimitives.amber900,
          AppPrimitives.amber600,
        ),
        section(
          'night',
          'Night shift',
          Icons.nightlight_outlined,
          AppPrimitives.blue50,
          AppPrimitives.blue900,
          AppPrimitives.blue600,
        ),
      ],
    );
  }
}

class _TimeGroup extends StatelessWidget {
  const _TimeGroup({
    required this.startLabel,
    required this.slots,
    required this.attendance,
    required this.sessionUserId,
    required this.isAdmin,
    required this.shiftHeaderBg,
    required this.onSlotAdminTap,
  });

  final String startLabel;
  final List<MyRotaSlot> slots;
  final Map<String, MyRotaAttendanceStatus> attendance;
  final String sessionUserId;
  final bool isAdmin;
  final Color shiftHeaderBg;
  final void Function(MyRotaSlot slot) onSlotAdminTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final endFmt = slots.isEmpty
        ? ''
        : (slots.first.endTime.length >= 5
              ? slots.first.endTime.substring(0, 5)
              : slots.first.endTime);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ColoredBox(
          color: shiftHeaderBg.withValues(alpha: 0.75),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
            child: Text(
              '$startLabel - $endFmt',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                color: colors.textPrimary,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
        for (final slot in slots)
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: isAdmin ? () => onSlotAdminTap(slot) : null,
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.sm,
                  vertical: AppSpacing.sm,
                ),
                child: _PersonRow(
                  slot: slot,
                  attendance: attendance[slot.id],
                  isYou: slot.userId == sessionUserId,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _PersonRow extends StatelessWidget {
  const _PersonRow({
    required this.slot,
    required this.attendance,
    required this.isYou,
  });

  final MyRotaSlot slot;
  final MyRotaAttendanceStatus? attendance;
  final bool isYou;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return Column(
      children: [
        Wrap(
          alignment: WrapAlignment.center,
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: AppSpacing.xs,
          children: [
            Text(
              slot.displayName,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w600,
                color: isYou ? AppPrimitives.amber900 : colors.textPrimary,
              ),
            ),
            if (attendance != null)
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.xs,
                  vertical: AppSpacing.xxs,
                ),
                decoration: BoxDecoration(
                  color: colors.dangerBg,
                  borderRadius: BorderRadius.circular(AppRadius.full),
                  border: Border.all(color: colors.borderDefault),
                ),
                child: Text(
                  attendance!.labelEnglish,
                  style: AppTypography.caption.copyWith(color: colors.danger),
                ),
              ),
            if (isYou)
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.xs,
                  vertical: AppSpacing.xxs,
                ),
                decoration: BoxDecoration(
                  color: AppPrimitives.amber50,
                  borderRadius: BorderRadius.circular(AppRadius.full),
                  border: Border.all(color: AppPrimitives.amber200),
                ),
                child: Text(
                  'You',
                  style: AppTypography.caption.copyWith(
                    color: AppPrimitives.amber800,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
          ],
        ),
        if (slot.task != null && slot.task!.trim().isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xs),
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.sm,
              vertical: AppSpacing.xs,
            ),
            decoration: BoxDecoration(
              color: colors.dangerBg,
              borderRadius: BorderRadius.circular(AppRadius.full),
              border: Border.all(color: colors.borderDefault),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 6,
                  height: 6,
                  decoration: const BoxDecoration(
                    color: AppPrimitives.red500,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: AppSpacing.xs),
                Flexible(
                  child: Text(
                    slot.task!,
                    textAlign: TextAlign.center,
                    style: Theme.of(
                      context,
                    ).textTheme.bodySmall?.copyWith(color: colors.danger),
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}
