import 'dart:ui';

import 'package:flutter/material.dart';
import '../../../core/assets/app_assets.dart';
import '../../../core/network/models.dart';
import '../../../core/network/network_policy.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_button.dart';
import '../../../core/ui/app_card.dart';
import '../data/availability_repository.dart';
import '../data/calendar_repository.dart';
import 'availability_sheet.dart';

class CalendarScreen extends StatefulWidget {
  const CalendarScreen({
    super.key,
    required this.displayName,
    required this.calendarRepository,
    required this.availabilityRepository,
    required this.onLogout,
  });

  final String displayName;
  final CalendarRepository calendarRepository;
  final AvailabilityRepository availabilityRepository;
  final Future<void> Function() onLogout;

  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends State<CalendarScreen> {
  final GlobalKey _calendarCardKey = GlobalKey();

  late DateTime _visibleMonth;
  CalendarMonthData? _monthData;
  Map<String, AvailabilityEntry> _availabilityByDate =
      <String, AvailabilityEntry>{};
  DateTime? _selectedDay;
  bool _isLoading = true;
  bool _isRefreshing = false;
  bool _isSavingAvailability = false;
  String? _errorMessage;
  /// While availability modal is open: hide month grid so only home mesh shows.
  bool _calendarHiddenForAvailabilityModal = false;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _visibleMonth = DateTime(now.year, now.month);
    _selectedDay = DateTime(now.year, now.month, now.day);
    _loadMonth(showGlobalLoader: true);
  }

  Future<void> _loadMonth({required bool showGlobalLoader}) async {
    if (showGlobalLoader) {
      setState(() {
        _isLoading = true;
        _errorMessage = null;
      });
    } else {
      setState(() {
        _isRefreshing = true;
        _errorMessage = null;
      });
    }

    final cached = widget.calendarRepository.readCachedMonth(
      year: _visibleMonth.year,
      month: _visibleMonth.month,
    );
    if (cached != null) {
      setState(() {
        _monthData = cached;
        _selectedDay = DateTime(
          _visibleMonth.year,
          _visibleMonth.month,
          _selectedDay?.day ?? 1,
        );
        _isLoading = false;
      });
    }

    CalendarMonthData? loadedMonth;
    Map<String, AvailabilityEntry>? loadedAvailability;
    var monthFailed = false;
    var availabilityFailed = false;

    try {
      loadedMonth = await widget.calendarRepository.loadMonth(
        year: _visibleMonth.year,
        month: _visibleMonth.month,
      );
    } catch (_) {
      monthFailed = true;
    }

    try {
      loadedAvailability = await widget.availabilityRepository.loadForMonth(
        monthDate: _visibleMonth,
      );
    } catch (_) {
      availabilityFailed = true;
    }

    if (!mounted) {
      return;
    }

    if (loadedMonth != null || loadedAvailability != null) {
      setState(() {
        if (loadedMonth != null) {
          _monthData = loadedMonth;
        }
        if (loadedAvailability != null) {
          _availabilityByDate = loadedAvailability;
        }
      });
    } else if (_monthData == null) {
      setState(() {
        _errorMessage = 'Calendar could not be loaded. Please retry.';
      });
    }

    if (monthFailed && _monthData != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Calendar refresh failed. Showing cached data.'),
        ),
      );
    }
    if (availabilityFailed && _availabilityByDate.isNotEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Availability refresh failed. Showing local data.'),
        ),
      );
    }

    setState(() {
      _isLoading = false;
      _isRefreshing = false;
    });
  }

  Future<void> _shiftMonth(int delta) async {
    final switched = DateTime(_visibleMonth.year, _visibleMonth.month + delta);
    setState(() {
      _visibleMonth = DateTime(switched.year, switched.month);
      _selectedDay = DateTime(switched.year, switched.month, 1);
    });

    final stopwatch = Stopwatch()..start();
    await _loadMonth(showGlobalLoader: false);
    stopwatch.stop();

    if (mounted &&
        stopwatch.elapsed > NetworkPolicy.monthSwitchCachedSlo &&
        widget.calendarRepository.readCachedMonth(
              year: _visibleMonth.year,
              month: _visibleMonth.month,
            ) !=
            null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Month switch exceeded cache SLO target.'),
        ),
      );
    }
  }

  Future<void> _handleDayTap(DateTime date) async {
    final normalized = DateTime(date.year, date.month, date.day);
    setState(() {
      _selectedDay = normalized;
    });

    final today = DateTime.now();
    final todayStart = DateTime(today.year, today.month, today.day);
    if (normalized.isBefore(todayStart)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('You cannot set availability for dates in the past.'),
        ),
      );
      return;
    }

    try {
      final modalAvailability = await widget.availabilityRepository
          .loadForMonth(monthDate: _visibleMonth, modalAnchorDate: normalized);
      if (mounted) {
        setState(() {
          _availabilityByDate = modalAvailability;
        });
      }
    } catch (_) {
      // Keep existing map when modal prefetch fails; save flow handles errors.
    }

    if (!mounted) {
      return;
    }

    final request = await _showAvailabilityInCalendarSlot(
      anchorDate: normalized,
    );

    if (request == null || request.items.isEmpty) {
      return;
    }

    setState(() {
      _isSavingAvailability = true;
    });

    try {
      await widget.availabilityRepository.save(request: request);
      final refreshed = await widget.availabilityRepository.loadForMonth(
        monthDate: _visibleMonth,
        modalAnchorDate: normalized,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _availabilityByDate = refreshed;
      });
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Availability saved.')));
    } catch (_) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Failed to save availability. Please try again.'),
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _isSavingAvailability = false;
        });
      }
    }
  }

  Rect? _readCalendarCardRect() {
    final ctx = _calendarCardKey.currentContext;
    if (ctx == null) {
      return null;
    }
    final box = ctx.findRenderObject();
    if (box is! RenderBox || !box.hasSize) {
      return null;
    }
    final topLeft = box.localToGlobal(Offset.zero);
    return Rect.fromLTWH(
      topLeft.dx,
      topLeft.dy,
      box.size.width,
      box.size.height,
    );
  }

  Future<SaveAvailabilityRequest?> _showAvailabilityInCalendarSlot({
    required DateTime anchorDate,
  }) async {
    if (!mounted) {
      return null;
    }
    var rect = _readCalendarCardRect();
    if (rect == null) {
      await WidgetsBinding.instance.endOfFrame;
      if (!mounted) {
        return null;
      }
      rect = _readCalendarCardRect();
    }
    final availability = Map<String, AvailabilityEntry>.from(_availabilityByDate);

    // Hide calendar in the same scheduling pass as opening the route so there
    // is no extra painted frame of empty layout before the overlay appears.
    setState(() => _calendarHiddenForAvailabilityModal = true);

    try {
      if (rect == null) {
        return await showDialog<SaveAvailabilityRequest>(
          context: context,
          barrierDismissible: true,
          builder: (dialogContext) {
            return Dialog(
              insetPadding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
              backgroundColor: Colors.transparent,
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  maxHeight: MediaQuery.sizeOf(context).height * 0.85,
                  maxWidth: 420,
                ),
                child: AvailabilitySheet(
                  anchorDate: anchorDate,
                  availabilityByDate: availability,
                ),
              ),
            );
          },
        );
      }

      final slot = rect;
      return await showGeneralDialog<SaveAvailabilityRequest>(
        context: context,
        barrierDismissible: true,
        barrierLabel:
            MaterialLocalizations.of(context).modalBarrierDismissLabel,
        barrierColor: Colors.transparent,
        transitionDuration: const Duration(milliseconds: 240),
        pageBuilder: (dialogContext, animation, secondaryAnimation) {
          return Stack(
            fit: StackFit.expand,
            children: [
              GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => Navigator.of(dialogContext).pop(),
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.42),
                  ),
                ),
              ),
              Positioned(
                left: slot.left,
                top: slot.top,
                width: slot.width,
                height: slot.height,
                child: Material(
                  color: Colors.transparent,
                  elevation: 6,
                  shadowColor: Colors.black45,
                  borderRadius: BorderRadius.circular(AppRadius.lg),
                  clipBehavior: Clip.antiAlias,
                  child: AvailabilitySheet(
                    anchorDate: anchorDate,
                    availabilityByDate: availability,
                  ),
                ),
              ),
            ],
          );
        },
        transitionBuilder:
            (dialogContext, animation, secondaryAnimation, child) {
          return FadeTransition(
            opacity: CurvedAnimation(
              parent: animation,
              curve: Curves.easeInOutCubic,
            ),
            child: child,
          );
        },
      );
    } finally {
      if (mounted) {
        setState(() => _calendarHiddenForAvailabilityModal = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final mq = MediaQuery.of(context);
    final topContentInset = mq.padding.top + kToolbarHeight;

    final scaffold = Scaffold(
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
        title: const Text('Calendar'),
        actions: [
          IconButton(
            tooltip: 'Sign out',
            onPressed: widget.onLogout,
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: Stack(
        fit: StackFit.expand,
        children: [
          Positioned.fill(
            child: Image.asset(
              isDark ? AppAssets.homeDarkFigmaBg : AppAssets.homeLightFigmaBg,
              fit: BoxFit.cover,
              alignment: Alignment.center,
              gaplessPlayback: true,
            ),
          ),
          Padding(
            padding: EdgeInsets.fromLTRB(
              AppSpacing.lg,
              topContentInset,
              AppSpacing.lg,
              mq.padding.bottom + AppSpacing.lg,
            ),
            child: _buildBody(context),
          ),
        ],
      ),
    );

    return scaffold;
  }

  Widget _buildBody(BuildContext context) {
    if (_isLoading && _monthData == null) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_errorMessage != null && _monthData == null) {
      return Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: AppCard(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  _errorMessage!,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyLarge,
                ),
                const SizedBox(height: AppSpacing.md),
                AppButton(
                  label: 'Retry',
                  onPressed: () => _loadMonth(showGlobalLoader: true),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final data = _monthData!;
    if (_calendarHiddenForAvailabilityModal) {
      return const SizedBox.shrink();
    }
    return ListView(children: [_buildMonthCalendar(context, data)]);
  }

  Widget _buildMonthCalendar(BuildContext context, CalendarMonthData data) {
    final colors = context.appColors;
    final monthLabel = _monthName(data.month);
    final daysInMonth = DateUtils.getDaysInMonth(data.year, data.month);
    final firstWeekday = DateTime(data.year, data.month, 1).weekday;
    final leading = firstWeekday - 1;
    final totalCells = leading + daysInMonth;

    return KeyedSubtree(
      key: _calendarCardKey,
      child: AppCard(
        surfaceOpacity: 0.5,
        child: Column(
        children: [
          Row(
            children: [
              IconButton(
                onPressed: () => _shiftMonth(-1),
                icon: const Icon(Icons.chevron_left),
                tooltip: 'Previous month',
              ),
              Expanded(
                child: Text(
                  '$monthLabel ${data.year}',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
              if (_isRefreshing)
                const SizedBox(
                  width: AppComponentTokens.minTouchTarget,
                  height: AppComponentTokens.minTouchTarget,
                  child: Center(
                    child: SizedBox(
                      width: AppSpacing.lg,
                      height: AppSpacing.lg,
                      child: CircularProgressIndicator(
                        strokeWidth: AppStroke.thin,
                      ),
                    ),
                  ),
                )
              else
                IconButton(
                  onPressed: () => _shiftMonth(1),
                  icon: const Icon(Icons.chevron_right),
                  tooltip: 'Next month',
                ),
            ],
          ),
          if (_isSavingAvailability)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: Text(
                'Saving availability...',
                style: Theme.of(
                  context,
                ).textTheme.labelMedium?.copyWith(color: colors.textSecondary),
              ),
            ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: _weekdayLabels
                .map(
                  (label) => Expanded(
                    child: Text(
                      label,
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.labelMedium?.copyWith(
                        color: colors.textSecondary,
                      ),
                    ),
                  ),
                )
                .toList(growable: false),
          ),
          const SizedBox(height: AppSpacing.sm),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: totalCells,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 7,
              childAspectRatio: 1.0,
              crossAxisSpacing: AppSpacing.xs,
              mainAxisSpacing: AppSpacing.xs,
            ),
            itemBuilder: (context, index) {
              if (index < leading) {
                return const SizedBox.shrink();
              }

              final day = index - leading + 1;
              final date = DateTime(data.year, data.month, day);
              final selected = _isSameDay(_selectedDay, date);
              final availability = _availabilityByDate[_toYmd(date)];
              final tones = _availabilityColors(colors, availability?.status);

              return InkWell(
                borderRadius: BorderRadius.circular(AppRadius.full),
                onTap: () => _handleDayTap(date),
                child: Container(
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: selected
                        ? colors.primary
                        : (tones.background ?? colors.bgSecondary),
                    borderRadius: BorderRadius.circular(AppRadius.full),
                    border: Border.all(
                      color: selected
                          ? colors.primary
                          : (tones.border ?? colors.borderDefault),
                    ),
                  ),
                  child: Text(
                    '$day',
                    style: Theme.of(context).textTheme.labelLarge?.copyWith(
                      color: selected
                          ? colors.onPrimary
                          : (tones.text ?? colors.textPrimary),
                    ),
                  ),
                ),
              );
            },
          ),
        ],
      ),
      ),
    );
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

  String _toYmd(DateTime date) {
    final y = date.year.toString().padLeft(4, '0');
    final m = date.month.toString().padLeft(2, '0');
    final d = date.day.toString().padLeft(2, '0');
    return '$y-$m-$d';
  }

  bool _isSameDay(DateTime? left, DateTime right) {
    if (left == null) {
      return false;
    }
    return left.year == right.year &&
        left.month == right.month &&
        left.day == right.day;
  }

  _AvailabilityColors _availabilityColors(
    AppColorsScheme colors,
    AvailabilityStatus? status,
  ) {
    switch (status) {
      case AvailabilityStatus.available:
        return _AvailabilityColors(
          background: colors.successBg,
          border: colors.success,
          text: colors.success,
        );
      case AvailabilityStatus.unavailable:
        return _AvailabilityColors(
          background: colors.dangerBg,
          border: colors.danger,
          text: colors.danger,
        );
      case AvailabilityStatus.holiday:
        return _AvailabilityColors(
          background: colors.infoBg,
          border: colors.info,
          text: colors.info,
        );
      case null:
        return const _AvailabilityColors();
    }
  }
}

const _weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

class _AvailabilityColors {
  const _AvailabilityColors({this.background, this.border, this.text});

  final Color? background;
  final Color? border;
  final Color? text;
}
