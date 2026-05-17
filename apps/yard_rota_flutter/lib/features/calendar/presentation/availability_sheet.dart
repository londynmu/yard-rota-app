import 'package:flutter/material.dart';

import '../../../core/network/models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_button.dart';

class AvailabilitySheet extends StatefulWidget {
  const AvailabilitySheet({
    super.key,
    required this.anchorDate,
    required this.availabilityByDate,
  });

  final DateTime anchorDate;
  final Map<String, AvailabilityEntry> availabilityByDate;

  @override
  State<AvailabilitySheet> createState() => _AvailabilitySheetState();
}

class _AvailabilitySheetState extends State<AvailabilitySheet> {
  late final List<DateTime> _dateOptions;

  late AvailabilityStatus _activeStatus;
  late List<String> _selectedDates;
  late Map<String, AvailabilityStatus> _statusByDate;

  final ScrollController _dayCarouselController = ScrollController();
  bool _dayCarouselArrowsDismissed = false;

  @override
  void initState() {
    super.initState();

    final anchorStart = DateTime(
      widget.anchorDate.year,
      widget.anchorDate.month,
      widget.anchorDate.day,
    );
    final anchorEnd = DateTime(
      widget.anchorDate.year,
      widget.anchorDate.month + 1,
      widget.anchorDate.day,
    );
    final daysInWindow = anchorEnd.difference(anchorStart).inDays + 1;

    _dateOptions = List<DateTime>.generate(
      daysInWindow,
      (index) => DateTime(
        widget.anchorDate.year,
        widget.anchorDate.month,
        widget.anchorDate.day + index,
      ),
    );

    final clickedDateYmd = _toYmd(widget.anchorDate);
    final seededStatuses = <String, AvailabilityStatus>{};
    for (final option in _dateOptions) {
      final ymd = _toYmd(option);
      final existing = widget.availabilityByDate[ymd];
      if (existing != null) {
        seededStatuses[ymd] = existing.status;
      }
    }

    _selectedDates = <String>[clickedDateYmd];
    _statusByDate = seededStatuses;
    _activeStatus =
        seededStatuses[clickedDateYmd] ?? AvailabilityStatus.available;
  }

  @override
  void dispose() {
    _dayCarouselController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    const modalSurfaceOpacity = 0.5;
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
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          AppSpacing.md,
          AppSpacing.sm,
          AppSpacing.md,
          AppSpacing.sm + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: LayoutBuilder(
                builder: (context, constraints) {
                  return SingleChildScrollView(
                    physics: const ClampingScrollPhysics(),
                    child: ConstrainedBox(
                      constraints: BoxConstraints(
                        minHeight: constraints.maxHeight,
                      ),
                      // Slightly below geometric centre: optical balance with the
                      // action bar and header weight reads more centred.
                      child: Align(
                        alignment: const Alignment(0, 0.95),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            _buildStatusPicker(context),
                            const SizedBox(height: AppSpacing.md),
                            _buildDateCarousel(context),
                            const SizedBox(height: AppSpacing.md),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
            _buildActions(context),
          ],
        ),
      ),
    );
  }

  Widget _buildDateCarousel(BuildContext context) {
    final colors = context.appColors;
    const carouselHeight = 132.0;
    const dayCardWidth = 104.0;
    const gutter = 22.0;

    Widget sideArrow({required bool isLeft}) {
      return Align(
        alignment: isLeft ? Alignment.centerLeft : Alignment.centerRight,
        child: IgnorePointer(
          child: SizedBox(
            width: gutter,
            height: carouselHeight,
            child: Center(
              child: Icon(
                isLeft ? Icons.chevron_left : Icons.chevron_right,
                size: 28,
                color: colors.primary.withValues(alpha: 0.55),
              ),
            ),
          ),
        ),
      );
    }

    return SizedBox(
      height: carouselHeight,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final n = _dateOptions.length;
          final totalContentWidth =
              n * dayCardWidth + (n > 0 ? (n - 1) * AppSpacing.sm : 0);
          final scrollable = totalContentWidth > constraints.maxWidth + 0.5;
          final showArrows = scrollable && !_dayCarouselArrowsDismissed;

          return Stack(
            clipBehavior: Clip.hardEdge,
            children: [
              NotificationListener<ScrollNotification>(
                onNotification: (ScrollNotification n) {
                  if (_dayCarouselArrowsDismissed || !scrollable) {
                    return false;
                  }
                  if (!n.metrics.hasPixels) {
                    return false;
                  }
                  if (n is ScrollUpdateNotification &&
                      (n.scrollDelta?.abs() ?? 0) > 0) {
                    setState(() => _dayCarouselArrowsDismissed = true);
                  }
                  return false;
                },
                child: ListView.separated(
                  controller: _dayCarouselController,
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: gutter),
                  itemCount: n,
                  separatorBuilder: (_, _) =>
                      const SizedBox(width: AppSpacing.sm),
                  itemBuilder: (context, index) {
                    final optionDate = _dateOptions[index];
                    final ymd = _toYmd(optionDate);
                    final isSelected = _selectedDates.contains(ymd);
                    final storedStatus =
                        _statusByDate[ymd] ??
                        widget.availabilityByDate[ymd]?.status;
                    final tone = _toneForStatus(context, storedStatus);
                    final hasSavedStatus = storedStatus != null;
                    final cardColor = isSelected
                        ? tone.background
                        : hasSavedStatus
                        ? tone.background.withValues(alpha: 0.55)
                        : colors.bgPrimary.withValues(alpha: 0.65);
                    final borderColor = isSelected
                        ? tone.border
                        : hasSavedStatus
                        ? tone.border.withValues(alpha: 0.70)
                        : colors.borderDefault;
                    final dayTextColor = (isSelected || hasSavedStatus)
                        ? tone.text
                        : colors.textPrimary;

                    return InkWell(
                      borderRadius: BorderRadius.circular(AppRadius.lg),
                      onTap: () => _toggleDate(ymd),
                      child: AnimatedContainer(
                        duration: AppMotion.normal,
                        width: dayCardWidth,
                        height: carouselHeight,
                        padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.xs,
                          vertical: AppSpacing.sm,
                        ),
                        decoration: BoxDecoration(
                          color: cardColor,
                          borderRadius: BorderRadius.circular(AppRadius.lg),
                          border: Border.all(color: borderColor),
                          boxShadow: [
                            BoxShadow(
                              color: colors.shadow.withValues(
                                alpha: isSelected ? 0.16 : 0.08,
                              ),
                              blurRadius: isSelected ? 12 : 8,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.center,
                          children: [
                            Text(
                              _weekdayLabel(optionDate),
                              textAlign: TextAlign.center,
                              style: Theme.of(context).textTheme.labelMedium
                                  ?.copyWith(
                                    color: (isSelected || hasSavedStatus)
                                        ? dayTextColor.withValues(alpha: 0.82)
                                        : colors.textSecondary,
                                    fontWeight: FontWeight.w600,
                                    letterSpacing: 0.3,
                                  ),
                            ),
                            const SizedBox(height: AppSpacing.xs),
                            Text(
                              _ordinalDay(optionDate.day),
                              textAlign: TextAlign.center,
                              style: Theme.of(context).textTheme.titleLarge
                                  ?.copyWith(
                                    color: dayTextColor,
                                    fontWeight: FontWeight.w700,
                                    height: 1.05,
                                  ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              _monthShortLabel(optionDate),
                              textAlign: TextAlign.center,
                              style: Theme.of(context).textTheme.labelSmall
                                  ?.copyWith(
                                    color: (isSelected || hasSavedStatus)
                                        ? dayTextColor.withValues(alpha: 0.78)
                                        : colors.textSecondary,
                                    fontWeight: FontWeight.w600,
                                    letterSpacing: 0.4,
                                  ),
                            ),
                            const SizedBox(height: AppSpacing.sm),
                            Text(
                              _statusLabelForDisplay(
                                _statusByDate[ymd] ??
                                    widget.availabilityByDate[ymd]?.status,
                              ),
                              textAlign: TextAlign.center,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: Theme.of(context).textTheme.labelSmall
                                  ?.copyWith(
                                    color: colors.textSecondary,
                                    fontWeight: FontWeight.w500,
                                  ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),
              if (showArrows) sideArrow(isLeft: true),
              if (showArrows) sideArrow(isLeft: false),
            ],
          );
        },
      ),
    );
  }

  Widget _buildStatusPicker(BuildContext context) {
    final colors = context.appColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Text(
          'Set availability as',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
            color: colors.textSecondary,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.center,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var i = 0; i < AvailabilityStatus.values.length; i++) ...[
                if (i > 0) const SizedBox(width: AppSpacing.xs),
                _buildFloatingStatusPill(context, AvailabilityStatus.values[i]),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildFloatingStatusPill(
    BuildContext context,
    AvailabilityStatus status,
  ) {
    final colors = context.appColors;
    final selected = _activeStatus == status;
    final tone = _toneForStatus(context, status);
    final radius = BorderRadius.circular(AppRadius.sm);

    return Material(
      color: Colors.transparent,
      elevation: 0,
      child: InkWell(
        borderRadius: radius,
        onTap: () => setState(() => _activeStatus = status),
        child: Ink(
          decoration: BoxDecoration(
            color: selected ? tone.background : colors.bgSecondary,
            borderRadius: radius,
            border: Border.all(
              color: selected ? tone.border : colors.borderDefault,
              width: 1,
            ),
            boxShadow: [
              BoxShadow(
                color: colors.shadow.withValues(alpha: selected ? 0.18 : 0.12),
                blurRadius: selected ? 6 : 4,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 36),
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.sm,
                vertical: AppSpacing.xs,
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    _statusIcon(status),
                    size: 14,
                    color: selected ? tone.text : colors.textSecondary,
                  ),
                  const SizedBox(width: AppSpacing.xs),
                  Text(
                    _statusLabel(status),
                    style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      color: selected ? tone.text : colors.textPrimary,
                      fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
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

  Widget _buildActions(BuildContext context) {
    final colors = context.appColors;
    return Container(
      padding: const EdgeInsets.only(top: AppSpacing.sm),
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: colors.borderSubtle)),
      ),
      child: Row(
        children: [
          Expanded(
            child: SizedBox(
              height: AppComponentTokens.buttonHeightMd,
              child: AppButton(
                label: 'Cancel',
                variant: AppButtonVariant.secondary,
                onPressed: () => Navigator.of(context).pop(),
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: SizedBox(
              height: AppComponentTokens.buttonHeightMd,
              child: AppButton(
                label: 'Save',
                variant: AppButtonVariant.secondary,
                onPressed: _selectedDates.isEmpty ? null : _save,
              ),
            ),
          ),
        ],
      ),
    );
  }

  IconData _statusIcon(AvailabilityStatus status) {
    switch (status) {
      case AvailabilityStatus.available:
        return Icons.check_circle_outline;
      case AvailabilityStatus.unavailable:
        return Icons.remove_circle_outline;
      case AvailabilityStatus.holiday:
        return Icons.beach_access_outlined;
    }
  }

  void _toggleDate(String ymd) {
    final isSelected = _selectedDates.contains(ymd);
    final existingStatus =
        _statusByDate[ymd] ?? widget.availabilityByDate[ymd]?.status;

    if (!isSelected) {
      setState(() {
        _selectedDates = <String>[..._selectedDates, ymd];
        _statusByDate[ymd] = _activeStatus;
      });
      return;
    }

    if (existingStatus != _activeStatus) {
      setState(() {
        _statusByDate[ymd] = _activeStatus;
      });
      return;
    }

    if (_selectedDates.length == 1) {
      return;
    }

    setState(() {
      _selectedDates = _selectedDates.where((date) => date != ymd).toList();
    });
  }

  void _save() {
    final items = _selectedDates
        .map(
          (ymd) => SaveAvailabilityItem(
            dateYmd: ymd,
            status:
                _statusByDate[ymd] ??
                widget.availabilityByDate[ymd]?.status ??
                _activeStatus,
          ),
        )
        .toList(growable: false);

    Navigator.of(context).pop(
      SaveAvailabilityRequest(items: items, comment: '', applyComment: false),
    );
  }

  _StatusTone _toneForStatus(BuildContext context, AvailabilityStatus? status) {
    final colors = context.appColors;

    switch (status) {
      case AvailabilityStatus.available:
        return _StatusTone(
          background: colors.successBg,
          border: colors.success,
          text: colors.success,
        );
      case AvailabilityStatus.unavailable:
        return _StatusTone(
          background: colors.dangerBg,
          border: colors.danger,
          text: colors.danger,
        );
      case AvailabilityStatus.holiday:
        return _StatusTone(
          background: colors.infoBg,
          border: colors.info,
          text: colors.info,
        );
      case null:
        return _StatusTone(
          background: colors.bgSecondary,
          border: colors.borderDefault,
          text: colors.textSecondary,
        );
    }
  }

  String _statusLabel(AvailabilityStatus status) {
    switch (status) {
      case AvailabilityStatus.available:
        return 'Available';
      case AvailabilityStatus.unavailable:
        return 'Unavailable';
      case AvailabilityStatus.holiday:
        return 'Holiday';
    }
  }

  String _statusLabelForDisplay(AvailabilityStatus? status) {
    if (status == null) {
      return 'Not set';
    }
    return _statusLabel(status);
  }

  String _weekdayLabel(DateTime date) {
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return labels[date.weekday - 1];
  }

  String _ordinalDay(int day) {
    if (day >= 11 && day <= 13) {
      return '${day}th';
    }
    switch (day % 10) {
      case 1:
        return '${day}st';
      case 2:
        return '${day}nd';
      case 3:
        return '${day}rd';
      default:
        return '${day}th';
    }
  }

  String _monthShortLabel(DateTime date) {
    const months = [
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
    return months[date.month - 1];
  }

  String _toYmd(DateTime date) {
    final y = date.year.toString().padLeft(4, '0');
    final m = date.month.toString().padLeft(2, '0');
    final d = date.day.toString().padLeft(2, '0');
    return '$y-$m-$d';
  }
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
