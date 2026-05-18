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
      AppToast.show(context, _error!);
    }
  }

  GlobalKey _fullRotaDayKey(String ymd) =>
      _fullRotaDayKeys.putIfAbsent(ymd, GlobalKey.new);

  void _openFullRotaDay(String ymd) {
    setState(() {
      _expandedDayYmd = ymd;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }
      final keyContext = _fullRotaDayKeys[ymd]?.currentContext;
      if (keyContext == null) {
        return;
      }
      Scrollable.ensureVisible(
        keyContext,
        duration: AppMotion.normal,
        curve: AppMotion.emphasized,
        alignment: 0.18,
      );
    });
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
      final weekYmds = myRotaWeekDateYmds(_weekStartSaturday);
      setState(() {
        _slotsByDate = merged;
        _attendanceBySlotId = Map<String, MyRotaAttendanceStatus>.from(
          data.attendanceBySlotId,
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
                                ? FontWeight.w600
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
                fontWeight: sel ? FontWeight.w600 : FontWeight.w500,
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
                  slot.displayNameOrNull ?? 'Attendance',
                  style: Theme.of(ctx).textTheme.titleMedium?.copyWith(
                    color: colors.textPrimary,
                    fontWeight: FontWeight.w600,
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

  List<_MyRotaUserShift> _userSlotsForWeek(List<String> weekYmds) {
    final out = <_MyRotaUserShift>[];
    for (final ymd in weekYmds) {
      final date = _parseLocalYmd(ymd);
      for (final slot in _slotsByDate[ymd] ?? const <MyRotaSlot>[]) {
        if (_myRotaSameUserId(slot.userId, widget.session.userId) &&
            slot.displayNameOrNull != null) {
          out.add(_MyRotaUserShift(date: date, slot: slot));
        }
      }
    }
    out.sort((a, b) {
      final dateCompare = a.date.compareTo(b.date);
      if (dateCompare != 0) {
        return dateCompare;
      }
      final startCompare = a.slot.startTime.compareTo(b.slot.startTime);
      if (startCompare != 0) {
        return startCompare;
      }
      return a.slot.endTime.compareTo(b.slot.endTime);
    });
    return out;
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
                      builder: (context, _) {
                        final weekYmds = myRotaWeekDateYmds(_weekStartSaturday);
                        final userSlots = _userSlotsForWeek(weekYmds);
                        return Column(
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
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.stretch,
                                      children: [
                                        _YourShiftsSection(
                                          shifts: userSlots,
                                          attendance: _attendanceBySlotId,
                                          onDayTap: _openFullRotaDay,
                                        ),
                                        const SizedBox(height: AppSpacing.lg),
                                        _FullRotaSection(
                                          weekYmds: weekYmds,
                                          slotsByDate: _slotsByDate,
                                          attendance: _attendanceBySlotId,
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
                                          dayOrdinal: _dayOrdinal,
                                          weekdayUpper: _weekdayUpper,
                                        ),
                                      ],
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

class _MyRotaUserShift {
  const _MyRotaUserShift({required this.date, required this.slot});

  final DateTime date;
  final MyRotaSlot slot;
}

class _MyRotaUserShiftDay {
  const _MyRotaUserShiftDay({required this.date, required this.shifts});

  final DateTime date;
  final List<_MyRotaUserShift> shifts;
}

String _myRotaShortTime(String raw) {
  if (raw.length >= 5) {
    return raw.substring(0, 5);
  }
  return raw;
}

String _myRotaShiftLabel(String shiftType) {
  return switch (shiftType) {
    'day' => 'Day',
    'afternoon' => 'Afternoon',
    'night' => 'Night',
    _ => 'Shift',
  };
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              color: colors.textPrimary,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _YourShiftsSection extends StatelessWidget {
  const _YourShiftsSection({
    required this.shifts,
    required this.attendance,
    required this.onDayTap,
  });

  final List<_MyRotaUserShift> shifts;
  final Map<String, MyRotaAttendanceStatus> attendance;
  final ValueChanged<String> onDayTap;

  List<_MyRotaUserShiftDay> _groupByDay() {
    final grouped = <String, List<_MyRotaUserShift>>{};
    for (final shift in shifts) {
      final ymd = myRotaToYmd(myRotaDateOnly(shift.date));
      grouped.putIfAbsent(ymd, () => <_MyRotaUserShift>[]).add(shift);
    }
    final keys = grouped.keys.toList()..sort();
    return [
      for (final key in keys)
        _MyRotaUserShiftDay(
          date: grouped[key]!.first.date,
          shifts: grouped[key]!
            ..sort((a, b) => a.slot.startTime.compareTo(b.slot.startTime)),
        ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final shiftDays = _groupByDay();
    if (shiftDays.isEmpty) {
      return _YourShiftsCardShell(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            0,
            AppSpacing.lg,
            0,
          ),
          child: Text(
            'No shifts for you this week',
            textAlign: TextAlign.center,
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: colors.textSecondary),
          ),
        ),
      );
    }
    return _YourShiftDayList(
      days: shiftDays,
      attendance: attendance,
      onDayTap: onDayTap,
    );
  }
}

class _YourShiftsCardShell extends StatelessWidget {
  const _YourShiftsCardShell({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return ClipRRect(
      borderRadius: BorderRadius.circular(AppRadius.lg),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.bgElevated.withValues(alpha: 0.9),
          borderRadius: BorderRadius.circular(AppRadius.lg),
          border: Border.all(color: colors.borderDefault),
          boxShadow: [
            BoxShadow(
              color: colors.shadow.withValues(alpha: 0.12),
              blurRadius: AppElevation.level4,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(
                AppSpacing.lg,
                AppSpacing.lg,
                AppSpacing.lg,
                AppSpacing.sm,
              ),
              child: _SectionHeader(title: 'Your shifts this week'),
            ),
            child,
            const SizedBox(height: AppSpacing.lg),
          ],
        ),
      ),
    );
  }
}

class _YourShiftDayList extends StatelessWidget {
  const _YourShiftDayList({
    required this.days,
    required this.attendance,
    required this.onDayTap,
  });

  final List<_MyRotaUserShiftDay> days;
  final Map<String, MyRotaAttendanceStatus> attendance;
  final ValueChanged<String> onDayTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return _YourShiftsCardShell(
      child: Column(
        children: [
          for (var i = 0; i < days.length; i++) ...[
            if (i > 0)
              Divider(
                height: 1,
                thickness: AppStroke.hairline,
                color: colors.divider.withValues(alpha: 0.72),
              ),
            _YourShiftDayRow(
              day: days[i],
              attendance: attendance,
              onTap: () => onDayTap(myRotaToYmd(myRotaDateOnly(days[i].date))),
            ),
          ],
        ],
      ),
    );
  }
}

class _YourShiftDayRow extends StatelessWidget {
  const _YourShiftDayRow({
    required this.day,
    required this.attendance,
    required this.onTap,
  });

  final _MyRotaUserShiftDay day;
  final Map<String, MyRotaAttendanceStatus> attendance;
  final VoidCallback onTap;

  static const _weekdayShort = <String>[
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat',
    'Sun',
  ];

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final today = myRotaDateOnly(DateTime.now());
    final dateOnly = myRotaDateOnly(day.date);
    final isToday = dateOnly == today;
    final dayLabel = '${_weekdayShort[day.date.weekday - 1]} ${day.date.day}';
    final shiftSummary = day.shifts
        .map((shift) {
          final slot = shift.slot;
          return '${_myRotaShiftLabel(slot.shiftType)} ${_myRotaShortTime(slot.startTime)}-${_myRotaShortTime(slot.endTime)}';
        })
        .join(', ');
    final locations = {
      for (final shift in day.shifts) shift.slot.location.trim(),
    }.where((location) => location.isNotEmpty).toList();
    final locationSummary = locations.join(', ');
    final hasTask = day.shifts.any((shift) {
      final task = shift.slot.task?.trim();
      return task != null && task.isNotEmpty;
    });
    final flaggedAttendance = day.shifts
        .map((shift) => attendance[shift.slot.id])
        .whereType<MyRotaAttendanceStatus>()
        .toList();

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: AppSpacing.sm,
          ),
          child: Row(
            children: [
              SizedBox(
                width: 62,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.sm,
                    vertical: AppSpacing.xxs,
                  ),
                  decoration: BoxDecoration(
                    color: isToday ? colors.infoBg : colors.bgSecondary,
                    borderRadius: BorderRadius.circular(AppRadius.full),
                    border: Border.all(color: colors.borderDefault),
                  ),
                  child: Text(
                    isToday ? 'Today' : dayLabel,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: AppTypography.caption.copyWith(
                      color: isToday ? colors.info : colors.textSecondary,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        locationSummary.isEmpty
                            ? shiftSummary
                            : '$shiftSummary · $locationSummary',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.bodyMedium.copyWith(
                          color: colors.textPrimary,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    if (hasTask) ...[
                      const SizedBox(width: AppSpacing.xs),
                      Container(
                        width: 7,
                        height: 7,
                        decoration: const BoxDecoration(
                          color: AppPrimitives.red500,
                          shape: BoxShape.circle,
                        ),
                      ),
                    ],
                    if (flaggedAttendance.isNotEmpty) ...[
                      const SizedBox(width: AppSpacing.xs),
                      Text(
                        flaggedAttendance.first.labelEnglish,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.caption.copyWith(
                          color: colors.danger,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ],
                ),
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
    required this.sessionUserId,
    required this.isAdmin,
    required this.onSlotAdminTap,
    required this.expandedDayYmd,
    required this.dayKeys,
    required this.onToggleDay,
    required this.parseLocalYmd,
    required this.dayOrdinal,
    required this.weekdayUpper,
  });

  final List<String> weekYmds;
  final Map<String, List<MyRotaSlot>> slotsByDate;
  final Map<String, MyRotaAttendanceStatus> attendance;
  final String sessionUserId;
  final bool isAdmin;
  final void Function(MyRotaSlot slot) onSlotAdminTap;
  final String? expandedDayYmd;
  final Map<String, GlobalKey> dayKeys;
  final ValueChanged<String> onToggleDay;
  final DateTime Function(String ymd) parseLocalYmd;
  final String Function(int day) dayOrdinal;
  final List<String> weekdayUpper;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return _FullRotaCardShell(
      child: Column(
        children: [
          for (var i = 0; i < weekYmds.length; i++) ...[
            if (i > 0)
              Divider(
                height: 1,
                thickness: AppStroke.hairline,
                color: colors.divider.withValues(alpha: 0.72),
              ),
            Builder(
              builder: (context) {
                final ymd = weekYmds[i];
                final dayDate = parseLocalYmd(ymd);
                return _DayCard(
                  key: dayKeys[ymd],
                  headerWeekday: weekdayUpper[dayDate.weekday - 1],
                  headerOrdinal: dayOrdinal(dayDate.day),
                  date: dayDate,
                  dateYmd: ymd,
                  slots: slotsByDate[ymd] ?? const [],
                  attendance: attendance,
                  sessionUserId: sessionUserId,
                  isAdmin: isAdmin,
                  onSlotAdminTap: onSlotAdminTap,
                  expanded: expandedDayYmd == ymd,
                  onToggle: () => onToggleDay(ymd),
                );
              },
            ),
          ],
        ],
      ),
    );
  }
}

class _FullRotaCardShell extends StatelessWidget {
  const _FullRotaCardShell({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return ClipRRect(
      borderRadius: BorderRadius.circular(AppRadius.lg),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.bgElevated.withValues(alpha: 0.9),
          borderRadius: BorderRadius.circular(AppRadius.lg),
          border: Border.all(color: colors.borderDefault),
          boxShadow: [
            BoxShadow(
              color: colors.shadow.withValues(alpha: 0.12),
              blurRadius: AppElevation.level4,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(
                AppSpacing.lg,
                AppSpacing.lg,
                AppSpacing.lg,
                AppSpacing.sm,
              ),
              child: _SectionHeader(title: 'Full rota'),
            ),
            child,
            const SizedBox(height: AppSpacing.lg),
          ],
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
          color: colors.bgElevated.withValues(alpha: 0.82),
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
                border: Border.all(
                  color: colors.borderDefault.withValues(alpha: 0.72),
                ),
              ),
              alignment: Alignment.center,
              child: Text(
                text,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  color: colors.textPrimary,
                  fontWeight: FontWeight.w500,
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
    super.key,
    required this.headerWeekday,
    required this.headerOrdinal,
    required this.date,
    required this.dateYmd,
    required this.slots,
    required this.attendance,
    required this.sessionUserId,
    required this.isAdmin,
    required this.onSlotAdminTap,
    required this.expanded,
    required this.onToggle,
  });

  final String headerWeekday;
  final String headerOrdinal;
  final DateTime date;
  final String dateYmd;
  final List<MyRotaSlot> slots;
  final Map<String, MyRotaAttendanceStatus> attendance;
  final String sessionUserId;
  final bool isAdmin;
  final void Function(MyRotaSlot slot) onSlotAdminTap;
  final bool expanded;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final today = myRotaDateOnly(DateTime.now());
    final isToday = myRotaDateOnly(date) == today;
    final presentSlots = slots.where((s) => attendance[s.id] == null).toList();

    final dayCount = presentSlots.where((s) => s.shiftType == 'day').length;
    final aftCount = presentSlots
        .where((s) => s.shiftType == 'afternoon')
        .length;
    final nightCount = presentSlots.where((s) => s.shiftType == 'night').length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Padding(
          padding: const EdgeInsets.all(AppMyRotaListSpacing.dayCardHeaderAll),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onToggle,
              borderRadius: BorderRadius.circular(AppRadius.lg),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.only(
                          left: AppMyRotaListSpacing.dayCardHeaderTextLeadInset,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '$headerWeekday $headerOrdinal',
                              textAlign: TextAlign.left,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: Theme.of(context).textTheme.titleSmall
                                  ?.copyWith(
                                    color: colors.textPrimary,
                                    fontWeight: FontWeight.w600,
                                    letterSpacing: 0.32,
                                  ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    if (isToday) ...[
                      _DayStatusChip(
                        label: 'Today',
                        fg: colors.info,
                        bg: colors.infoBg,
                        border: colors.borderDefault,
                      ),
                      const SizedBox(width: AppSpacing.sm),
                    ],
                    Padding(
                      padding: const EdgeInsets.only(
                        right: AppMyRotaListSpacing.dayCardHeaderTextLeadInset,
                      ),
                      child: Align(
                        alignment: Alignment.topRight,
                        child: Wrap(
                          alignment: WrapAlignment.end,
                          spacing: AppMyRotaListSpacing.chipWrapSpacing,
                          runSpacing: AppMyRotaListSpacing.chipWrapRunSpacing,
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
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
        AnimatedSize(
          duration: AppMotion.normal,
          curve: AppMotion.ease,
          alignment: Alignment.topCenter,
          child: expanded
              ? _DayDetailsBody(
                  slots: slots,
                  attendance: attendance,
                  sessionUserId: sessionUserId,
                  isAdmin: isAdmin,
                  onSlotAdminTap: onSlotAdminTap,
                )
              : const SizedBox.shrink(),
        ),
      ],
    );
  }
}

class _DayStatusChip extends StatelessWidget {
  const _DayStatusChip({
    required this.label,
    required this.fg,
    required this.bg,
    required this.border,
  });

  final String label;
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
          color: border.withValues(alpha: 0.72),
          width: AppStroke.hairline,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.xs,
          vertical: AppSpacing.xxs,
        ),
        child: Text(
          label,
          style: AppTypography.caption.copyWith(
            color: fg,
            fontWeight: FontWeight.w700,
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
        border: Border.all(
          color: border.withValues(alpha: 0.46),
          width: AppStroke.hairline,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.sm,
          vertical: AppSpacing.xxs,
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
    final slotsShown = slots
        .where((slot) => slot.displayNameOrNull != null)
        .toList();
    if (slotsShown.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(AppMyRotaListSpacing.emptyStateInset),
        child: Text(
          'No shifts scheduled',
          textAlign: TextAlign.center,
          style: Theme.of(
            context,
          ).textTheme.bodyMedium?.copyWith(color: colors.textSecondary),
        ),
      );
    }

    Widget section(String shiftKey) {
      final sectionSlots =
          slotsShown.where((s) => s.shiftType == shiftKey).toList()
            ..sort((a, b) {
              final c = a.startTime.compareTo(b.startTime);
              if (c != 0) {
                return c;
              }
              return a.displayNameOrNull!.compareTo(b.displayNameOrNull!);
            });
      if (sectionSlots.isEmpty) {
        return const SizedBox.shrink();
      }

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
          AppMyRotaListSpacing.sectionBottom,
        ),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: colors.bgPrimary.withValues(alpha: 0.42),
            borderRadius: BorderRadius.circular(AppRadius.md),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (var ti = 0; ti < starts.length; ti++) ...[
                if (ti > 0)
                  Divider(
                    height: 1,
                    thickness: AppStroke.hairline,
                    color: colors.divider.withValues(alpha: 0.72),
                  ),
                _TimeGroup(
                  startLabel: starts[ti],
                  slots: byStart[starts[ti]]!,
                  attendance: attendance,
                  sessionUserId: sessionUserId,
                  isAdmin: isAdmin,
                  onSlotAdminTap: onSlotAdminTap,
                ),
              ],
            ],
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [section('day'), section('afternoon'), section('night')],
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
    required this.onSlotAdminTap,
  });

  final String startLabel;
  final List<MyRotaSlot> slots;
  final Map<String, MyRotaAttendanceStatus> attendance;
  final String sessionUserId;
  final bool isAdmin;
  final void Function(MyRotaSlot slot) onSlotAdminTap;

  @override
  Widget build(BuildContext context) {
    final endFmt = slots.isEmpty
        ? ''
        : (slots.first.endTime.length >= 5
              ? slots.first.endTime.substring(0, 5)
              : slots.first.endTime);
    final timeRange = '$startLabel–$endFmt';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < slots.length; i++)
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: isAdmin ? () => onSlotAdminTap(slots[i]) : null,
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppMyRotaListSpacing.slotRowHorizontal,
                  vertical: AppMyRotaListSpacing.slotRowVertical,
                ),
                child: _PersonRow(
                  slot: slots[i],
                  attendance: attendance[slots[i].id],
                  isYou: _myRotaSameUserId(slots[i].userId, sessionUserId),
                  timeRange: timeRange,
                  showTimeColumn: i == 0,
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
    required this.timeRange,
    required this.showTimeColumn,
  });

  final MyRotaSlot slot;
  final MyRotaAttendanceStatus? attendance;
  final bool isYou;
  final String timeRange;
  final bool showTimeColumn;

  @override
  Widget build(BuildContext context) {
    final displayName = slot.displayNameOrNull;
    if (displayName == null) {
      return const SizedBox.shrink();
    }
    final colors = context.appColors;
    final nameStyle = Theme.of(context).textTheme.bodyMedium?.copyWith(
      fontWeight: FontWeight.w500,
      color: colors.textPrimary,
    );
    final nameLabel = isYou
        ? ConstrainedBox(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.sizeOf(context).width * 0.42,
            ),
            child: Container(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.xs,
                vertical: AppSpacing.xxs,
              ),
              decoration: BoxDecoration(
                color: AppPrimitives.amber50,
                borderRadius: BorderRadius.circular(AppRadius.full),
                border: Border.all(
                  color: AppPrimitives.amber200.withValues(alpha: 0.72),
                  width: AppStroke.hairline,
                ),
              ),
              child: Text(
                displayName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.right,
                style: AppTypography.caption.copyWith(
                  color: AppPrimitives.amber800,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          )
        : Text(displayName, textAlign: TextAlign.right, style: nameStyle);

    final timeBlock = showTimeColumn
        ? Row(
            children: [
              Icon(
                Icons.schedule_outlined,
                size: AppMyRotaListSpacing.timeInlineIconSize,
                color: colors.textSecondary,
              ),
              const SizedBox(width: AppSpacing.xs),
              Expanded(
                child: Text(
                  timeRange,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.labelMedium.copyWith(
                    color: colors.textPrimary,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ],
          )
        : null;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: AppMyRotaListSpacing.timeColumnFixedWidth,
          child: timeBlock ?? const SizedBox.shrink(),
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            mainAxisSize: MainAxisSize.min,
            children: [
              Wrap(
                alignment: WrapAlignment.end,
                crossAxisAlignment: WrapCrossAlignment.center,
                spacing: AppSpacing.xs,
                runSpacing: AppSpacing.xxs,
                children: [
                  nameLabel,
                  if (attendance != null)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.xs,
                        vertical: AppSpacing.xxs,
                      ),
                      decoration: BoxDecoration(
                        color: colors.dangerBg,
                        borderRadius: BorderRadius.circular(AppRadius.full),
                        border: Border.all(
                          color: colors.borderDefault.withValues(alpha: 0.72),
                        ),
                      ),
                      child: Text(
                        attendance!.labelEnglish,
                        style: AppTypography.caption.copyWith(
                          color: colors.danger,
                        ),
                      ),
                    ),
                ],
              ),
              if (slot.task != null && slot.task!.trim().isNotEmpty) ...[
                const SizedBox(height: AppMyRotaListSpacing.personTaskGap),
                Align(
                  alignment: Alignment.centerRight,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.sm,
                      vertical: AppSpacing.xs,
                    ),
                    decoration: BoxDecoration(
                      color: colors.dangerBg,
                      borderRadius: BorderRadius.circular(AppRadius.full),
                      border: Border.all(
                        color: colors.borderDefault.withValues(alpha: 0.72),
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
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
                            textAlign: TextAlign.right,
                            style: Theme.of(context).textTheme.bodySmall
                                ?.copyWith(color: colors.danger),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}
