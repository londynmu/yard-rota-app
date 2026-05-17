import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

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
  late final PageController _dayPageController = PageController();
  int _dayPageIndex = 0;

  @override
  void initState() {
    super.initState();
    _weekStartSaturday = myRotaWeekStartSaturday(DateTime.now());
    _bootstrap();
  }

  @override
  void dispose() {
    _dayPageController.dispose();
    super.dispose();
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
      String? targetYmd;

      if (anchor != null) {
        loc = anchor.location;
        shift = widget.repository.resolveShiftTypeFilter(anchor.shiftType);
        targetYmd = anchor.dateYmd;
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
      await _fetchWeek(targetYmd: targetYmd);
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

  Future<void> _fetchWeek({String? targetYmd}) async {
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
      final effectiveTargetYmd = targetYmd != null && keys.contains(targetYmd)
          ? targetYmd
          : todayYmd;
      final targetIndex = keys.contains(effectiveTargetYmd)
          ? keys.indexOf(effectiveTargetYmd)
          : 0;
      setState(() {
        _slotsByDate = merged;
        _attendanceBySlotId = Map<String, MyRotaAttendanceStatus>.from(
          data.attendanceBySlotId,
        );
        _loading = false;
        _dayPageIndex = targetIndex;
      });
      SchedulerBinding.instance.addPostFrameCallback((_) {
        if (!mounted) {
          return;
        }
        if (_dayPageController.hasClients) {
          _dayPageController.jumpToPage(targetIndex);
        }
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
                            _MyRotaDayStrip(
                              weekYmds: weekYmds,
                              selectedIndex: _dayPageIndex,
                              slotsByDate: _slotsByDate,
                              sessionUserId: widget.session.userId,
                              onSelectDay: (i) {
                                _dayPageController.animateToPage(
                                  i,
                                  duration: AppMotion.normal,
                                  curve: AppMotion.ease,
                                );
                              },
                            ),
                            const SizedBox(height: AppSpacing.sm),
                            Expanded(
                              child: PageView.builder(
                                controller: _dayPageController,
                                onPageChanged: (i) {
                                  setState(() => _dayPageIndex = i);
                                },
                                itemCount: weekYmds.length,
                                itemBuilder: (context, i) {
                                  final ymd = weekYmds[i];
                                  final dayDate = _parseLocalYmd(ymd);
                                  return RefreshIndicator(
                                    onRefresh: _fetchWeek,
                                    child: SingleChildScrollView(
                                      physics:
                                          const AlwaysScrollableScrollPhysics(),
                                      child: Padding(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: AppM3Carousel
                                              .pageCardHorizontalPadding,
                                        ),
                                        child: _DayCard(
                                          headerWeekday:
                                              _weekdayUpper[dayDate.weekday -
                                                  1],
                                          headerOrdinal: _dayOrdinal(
                                            dayDate.day,
                                          ),
                                          date: dayDate,
                                          dateYmd: ymd,
                                          slots: _slotsByDate[ymd] ?? const [],
                                          attendance: _attendanceBySlotId,
                                          sessionUserId: widget.session.userId,
                                          isAdmin: widget.session.isAdmin,
                                          onSlotAdminTap: _openAttendanceSheet,
                                        ),
                                      ),
                                    ),
                                  );
                                },
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

/// M3 Segmented button track + slots (Figma Material 3 Design Kit — Community).
class _MyRotaDayStrip extends StatelessWidget {
  const _MyRotaDayStrip({
    required this.weekYmds,
    required this.selectedIndex,
    required this.slotsByDate,
    required this.sessionUserId,
    required this.onSelectDay,
  });

  static const _abbr = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

  final List<String> weekYmds;
  final int selectedIndex;
  final Map<String, List<MyRotaSlot>> slotsByDate;
  final String sessionUserId;
  final ValueChanged<int> onSelectDay;

  static DateTime _parseYmd(String ymd) {
    final p = ymd.split('-');
    if (p.length != 3) {
      return DateTime.now();
    }
    return DateTime(int.parse(p[0]), int.parse(p[1]), int.parse(p[2]));
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final today = myRotaDateOnly(DateTime.now());
    final innerH =
        AppM3SegmentedButton.trackHeight -
        2 * AppM3SegmentedButton.trackPadding;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.bgElevated.withValues(
          alpha: AppOpacity.segmentedTrackFill,
        ),
        borderRadius: BorderRadius.circular(
          AppM3SegmentedButton.trackCornerRadius,
        ),
        border: Border.all(color: colors.borderDefault),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppM3SegmentedButton.trackPadding),
        child: SizedBox(
          height: innerH,
          child: Row(
            children: [
              for (var i = 0; i < weekYmds.length; i++)
                Expanded(
                  child: _MyRotaDayStripSegment(
                    abbr: _abbr[i],
                    dayNumber: _parseYmd(weekYmds[i]).day,
                    selected: i == selectedIndex,
                    isToday: myRotaDateOnly(_parseYmd(weekYmds[i])) == today,
                    userHasShift: (slotsByDate[weekYmds[i]] ?? const []).any(
                      (s) => _myRotaSameUserId(s.userId, sessionUserId),
                    ),
                    onTap: () => onSelectDay(i),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MyRotaDayStripSegment extends StatelessWidget {
  const _MyRotaDayStripSegment({
    required this.abbr,
    required this.dayNumber,
    required this.selected,
    required this.isToday,
    required this.userHasShift,
    required this.onTap,
  });

  final String abbr;
  final int dayNumber;
  final bool selected;
  final bool isToday;
  final bool userHasShift;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final labelStyle = Theme.of(context).textTheme.labelSmall?.copyWith(
      color: selected ? colors.primary : colors.textSecondary,
      fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
      fontSize: 10,
      height: 1.1,
    );
    final numStyle = Theme.of(context).textTheme.labelMedium?.copyWith(
      color: selected ? colors.primary : colors.textPrimary,
      fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
      fontSize: 12,
      height: 1.1,
    );

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 1),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(
            AppM3SegmentedButton.slotCornerRadius,
          ),
          child: AnimatedContainer(
            duration: AppMotion.fast,
            curve: AppMotion.ease,
            decoration: BoxDecoration(
              color: selected
                  ? colors.bgElevated.withValues(alpha: 0.98)
                  : Colors.transparent,
              borderRadius: BorderRadius.circular(
                AppM3SegmentedButton.slotCornerRadius,
              ),
              border: Border.all(
                color: selected
                    ? colors.primary.withValues(alpha: 0.58)
                    : colors.borderSubtle,
                width: selected ? AppStroke.thin : AppStroke.hairline,
              ),
              boxShadow: selected
                  ? [
                      BoxShadow(
                        color: colors.shadow.withValues(
                          alpha: AppM3SegmentedButton.selectedShadowAlpha,
                        ),
                        blurRadius: AppM3SegmentedButton.selectedShadowBlur,
                        offset: Offset(
                          0,
                          AppM3SegmentedButton.selectedShadowOffsetY,
                        ),
                      ),
                    ]
                  : null,
            ),
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.xxs),
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(abbr, maxLines: 1, style: labelStyle),
                  Text('$dayNumber', maxLines: 1, style: numStyle),
                  if (isToday || userHasShift)
                    Padding(
                      padding: const EdgeInsets.only(top: AppSpacing.xxs),
                      child: Container(
                        width: 4,
                        height: 4,
                        decoration: BoxDecoration(
                          color: isToday
                              ? colors.primary.withValues(alpha: 0.86)
                              : colors.primary.withValues(alpha: 0.42),
                          shape: BoxShape.circle,
                        ),
                      ),
                    ),
                ],
              ),
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
    required this.headerWeekday,
    required this.headerOrdinal,
    required this.date,
    required this.dateYmd,
    required this.slots,
    required this.attendance,
    required this.sessionUserId,
    required this.isAdmin,
    required this.onSlotAdminTap,
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

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final today = myRotaDateOnly(DateTime.now());
    final isToday = myRotaDateOnly(date) == today;
    final isWeekend =
        date.weekday == DateTime.saturday || date.weekday == DateTime.sunday;
    final userHasShift = slots.any(
      (s) => _myRotaSameUserId(s.userId, sessionUserId),
    );

    final presentSlots = slots.where((s) => attendance[s.id] == null).toList();

    final dayCount = presentSlots.where((s) => s.shiftType == 'day').length;
    final aftCount = presentSlots
        .where((s) => s.shiftType == 'afternoon')
        .length;
    final nightCount = presentSlots.where((s) => s.shiftType == 'night').length;

    final edgeColor = isToday
        ? colors.primary.withValues(alpha: 0.62)
        : colors.borderDefault;
    final edgeWidth = isToday ? AppStroke.medium : AppStroke.thin;
    final cardBorder = Border.all(
      color: userHasShift ? colors.primary.withValues(alpha: 0.56) : edgeColor,
      width: userHasShift ? AppStroke.medium : edgeWidth,
    );

    final pageRadius = BorderRadius.circular(AppM3Carousel.pageCardRadius);

    return Padding(
      padding: const EdgeInsets.only(
        bottom: AppMyRotaListSpacing.dayCardBottom,
      ),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.bgElevated.withValues(alpha: isWeekend ? 0.84 : 0.9),
          borderRadius: pageRadius,
          border: cardBorder,
          boxShadow: isToday
              ? [
                  BoxShadow(
                    color: colors.primary.withValues(alpha: 0.1),
                    blurRadius: AppElevation.level3,
                    offset: const Offset(0, 1),
                  ),
                ]
              : null,
        ),
        child: ClipRRect(
          borderRadius: pageRadius,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.all(
                  AppMyRotaListSpacing.dayCardHeaderAll,
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.only(
                          left: AppMyRotaListSpacing.dayCardHeaderTextLeadInset,
                        ),
                        child: Text(
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
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Wrap(
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
                      ],
                    ),
                  ],
                ),
              ),
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
            border: Border.all(
              color: colors.borderSubtle.withValues(alpha: 0.72),
              width: AppStroke.hairline,
            ),
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
      fontWeight: isYou ? FontWeight.w600 : FontWeight.w500,
      color: isYou ? AppPrimitives.amber900 : colors.textPrimary,
    );

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
                  Text(
                    displayName,
                    textAlign: TextAlign.right,
                    style: nameStyle,
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
                  if (isYou)
                    Container(
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
                        'You',
                        style: AppTypography.caption.copyWith(
                          color: AppPrimitives.amber800,
                          fontWeight: FontWeight.w600,
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
