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
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return FractionallySizedBox(
      heightFactor: 0.62,
      child: SafeArea(
        top: false,
        child: Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                colors.bgPrimary,
                colors.bgSecondary.withValues(alpha: 0.96),
                colors.bgPrimary,
              ],
            ),
            borderRadius: const BorderRadius.vertical(
              top: Radius.circular(AppRadius.xl),
            ),
            border: Border.all(color: colors.borderDefault),
          ),
          child: Padding(
            padding: EdgeInsets.fromLTRB(
              AppSpacing.md,
              AppSpacing.sm,
              AppSpacing.md,
              AppSpacing.md + MediaQuery.viewInsetsOf(context).bottom,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _buildTopBar(context),
                const SizedBox(height: AppSpacing.sm),
                Expanded(
                  child: SingleChildScrollView(
                    physics: const ClampingScrollPhysics(),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        _buildIntro(context),
                        const SizedBox(height: AppSpacing.md),
                        _buildStatusPicker(context),
                        const SizedBox(height: AppSpacing.md),
                        _buildDateCarousel(context),
                        _buildCarouselSwipeHint(context),
                      ],
                    ),
                  ),
                ),
                _buildActions(context),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildTopBar(BuildContext context) {
    final colors = context.appColors;
    return Center(
      child: Container(
        width: 42,
        height: 4,
        decoration: BoxDecoration(
          color: colors.borderStrong,
          borderRadius: BorderRadius.circular(AppRadius.full),
        ),
      ),
    );
  }

  Widget _buildIntro(BuildContext context) {
    final colors = context.appColors;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.sm),
      decoration: BoxDecoration(
        color: colors.bgPrimary.withValues(alpha: 0.72),
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(color: colors.borderDefault),
      ),
      child: Row(
        children: [
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              color: colors.primary.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(AppRadius.md),
            ),
            child: Icon(Icons.auto_awesome, size: 16, color: colors.primary),
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              'Choose status, then tap days in the carousel.',
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: colors.textSecondary),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDateCarousel(BuildContext context) {
    final colors = context.appColors;
    return SizedBox(
      height: 118,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: _dateOptions.length,
        separatorBuilder: (_, _) => const SizedBox(width: AppSpacing.sm),
        itemBuilder: (context, index) {
          final optionDate = _dateOptions[index];
          final ymd = _toYmd(optionDate);
          final isSelected = _selectedDates.contains(ymd);
          final storedStatus =
              _statusByDate[ymd] ?? widget.availabilityByDate[ymd]?.status;
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
              width: 98,
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.sm,
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
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 30,
                    height: 3,
                    decoration: BoxDecoration(
                      color: isSelected
                          ? tone.border
                          : colors.borderStrong.withValues(alpha: 0.55),
                      borderRadius: BorderRadius.circular(AppRadius.full),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    _weekdayLabel(optionDate),
                    style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      color: colors.textSecondary,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    '${optionDate.day}',
                    style: Theme.of(
                      context,
                    ).textTheme.titleLarge?.copyWith(color: dayTextColor),
                  ),
                  const Spacer(),
                  Text(
                    _statusLabelForDisplay(
                      _statusByDate[ymd] ??
                          widget.availabilityByDate[ymd]?.status,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      color: colors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildCarouselSwipeHint(BuildContext context) {
    final colors = context.appColors;
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.sm),
      child: Center(
        child: Semantics(
          label: 'Swipe sideways to browse more days',
          child: Text(
            '<- swipe sideways ->',
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.titleSmall?.copyWith(
              color: colors.textSecondary,
              fontWeight: FontWeight.w600,
              height: 1.25,
              letterSpacing: 0.35,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildStatusPicker(BuildContext context) {
    final colors = context.appColors;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.sm),
      decoration: BoxDecoration(
        color: colors.bgPrimary.withValues(alpha: 0.7),
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(color: colors.borderDefault),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Set availability as',
            style: Theme.of(
              context,
            ).textTheme.labelLarge?.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: AvailabilityStatus.values
                .map((status) {
                  final selected = _activeStatus == status;
                  final tone = _toneForStatus(context, status);
                  return Expanded(
                    child: Padding(
                      padding: EdgeInsets.only(
                        right: status == AvailabilityStatus.holiday
                            ? 0
                            : AppSpacing.xs,
                      ),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(AppRadius.md),
                        onTap: () {
                          setState(() {
                            _activeStatus = status;
                          });
                        },
                        child: Container(
                          height: 44,
                          decoration: BoxDecoration(
                            color: selected
                                ? tone.background
                                : colors.bgSecondary,
                            borderRadius: BorderRadius.circular(AppRadius.md),
                            border: Border.all(
                              color: selected
                                  ? tone.border
                                  : colors.borderDefault,
                            ),
                          ),
                          alignment: Alignment.center,
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                _statusIcon(status),
                                size: 14,
                                color: selected
                                    ? tone.text
                                    : colors.textSecondary,
                              ),
                              const SizedBox(width: AppSpacing.xs),
                              Text(
                                _statusLabel(status),
                                style: Theme.of(context).textTheme.labelLarge
                                    ?.copyWith(
                                      color: selected
                                          ? tone.text
                                          : colors.textPrimary,
                                    ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  );
                })
                .toList(growable: false),
          ),
        ],
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
