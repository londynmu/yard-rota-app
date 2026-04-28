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
  late final TextEditingController _commentController;

  late AvailabilityStatus _activeStatus;
  late List<String> _selectedDates;
  late Map<String, AvailabilityStatus> _statusByDate;

  @override
  void initState() {
    super.initState();

    _dateOptions = List<DateTime>.generate(
      12,
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

    _commentController = TextEditingController(
      text: widget.availabilityByDate[clickedDateYmd]?.comment ?? '',
    );
  }

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;

    return FractionallySizedBox(
      heightFactor: 0.88,
      child: SafeArea(
        top: false,
        child: Container(
          decoration: BoxDecoration(
            color: colors.bgPrimary,
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
            child: LayoutBuilder(
              builder: (context, constraints) {
                final gridHeight = (constraints.maxHeight * 0.38).clamp(
                  180.0,
                  280.0,
                );

                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildTopBar(context),
                    const SizedBox(height: AppSpacing.sm),
                    _buildHeader(context),
                    const SizedBox(height: AppSpacing.md),
                    _buildCard(
                      context,
                      child: _buildDateGrid(context, gridHeight: gridHeight),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    _buildCard(context, child: _buildStatusSelector(context)),
                    const SizedBox(height: AppSpacing.sm),
                    _buildCard(context, child: _buildComment(context)),
                    const Spacer(),
                    _buildActions(context),
                  ],
                );
              },
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildTopBar(BuildContext context) {
    final colors = context.appColors;

    return Row(
      children: [
        Expanded(
          child: Center(
            child: Container(
              width: 42,
              height: 4,
              decoration: BoxDecoration(
                color: colors.borderStrong,
                borderRadius: BorderRadius.circular(AppRadius.full),
              ),
            ),
          ),
        ),
        IconButton(
          onPressed: () => Navigator.of(context).pop(),
          icon: const Icon(Icons.close),
          tooltip: 'Close',
        ),
      ],
    );
  }

  Widget _buildHeader(BuildContext context) {
    final colors = context.appColors;

    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Set availability',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                _formatFullDate(widget.anchorDate),
                style: Theme.of(
                  context,
                ).textTheme.bodyMedium?.copyWith(color: colors.textSecondary),
              ),
            ],
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.sm,
            vertical: AppSpacing.xs,
          ),
          decoration: BoxDecoration(
            color: colors.bgSecondary,
            borderRadius: BorderRadius.circular(AppRadius.full),
            border: Border.all(color: colors.borderDefault),
          ),
          child: Text(
            '${_selectedDates.length} selected',
            style: Theme.of(
              context,
            ).textTheme.labelMedium?.copyWith(color: colors.textSecondary),
          ),
        ),
      ],
    );
  }

  Widget _buildDateGrid(BuildContext context, {required double gridHeight}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Apply to days', style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: AppSpacing.sm),
        SizedBox(
          height: gridHeight,
          child: GridView.builder(
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _dateOptions.length,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              crossAxisSpacing: AppSpacing.sm,
              mainAxisSpacing: AppSpacing.sm,
              childAspectRatio: 2.7,
            ),
            itemBuilder: (context, index) {
              final optionDate = _dateOptions[index];
              final ymd = _toYmd(optionDate);
              final isSelected = _selectedDates.contains(ymd);
              final status =
                  _statusByDate[ymd] ?? widget.availabilityByDate[ymd]?.status;
              final tone = _toneForStatus(context, status);

              return InkWell(
                borderRadius: BorderRadius.circular(AppRadius.md),
                onTap: () => _toggleDate(ymd),
                child: Container(
                  decoration: BoxDecoration(
                    color: isSelected
                        ? tone.background
                        : tone.background.withValues(alpha: 0.50),
                    borderRadius: BorderRadius.circular(AppRadius.md),
                    border: Border.all(
                      color: isSelected
                          ? tone.border
                          : context.appColors.borderDefault,
                    ),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    '${_weekdayLabel(optionDate)} ${optionDate.day}',
                    style: Theme.of(
                      context,
                    ).textTheme.labelLarge?.copyWith(color: tone.text),
                    textAlign: TextAlign.center,
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildStatusSelector(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Status', style: Theme.of(context).textTheme.titleSmall),
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
                          : AppSpacing.sm,
                    ),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(AppRadius.md),
                      onTap: () {
                        setState(() {
                          _activeStatus = status;
                        });
                      },
                      child: Container(
                        height: 46,
                        decoration: BoxDecoration(
                          color: selected
                              ? tone.background
                              : context.appColors.bgSecondary,
                          borderRadius: BorderRadius.circular(AppRadius.md),
                          border: Border.all(
                            color: selected
                                ? tone.border
                                : context.appColors.borderDefault,
                          ),
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          _statusLabel(status),
                          style: Theme.of(context).textTheme.labelLarge
                              ?.copyWith(
                                color: selected
                                    ? tone.text
                                    : context.appColors.textPrimary,
                              ),
                        ),
                      ),
                    ),
                  ),
                );
              })
              .toList(growable: false),
        ),
      ],
    );
  }

  Widget _buildComment(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Comment', style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: AppSpacing.xs),
        TextField(
          controller: _commentController,
          maxLines: 2,
          enabled: _selectedDates.length == 1,
          decoration: InputDecoration(
            labelText: 'Comment (optional)',
            hintText: _selectedDates.length == 1
                ? 'Add short note'
                : 'Select one day to edit comment',
          ),
        ),
      ],
    );
  }

  Widget _buildActions(BuildContext context) {
    return Row(
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
    );
  }

  Widget _buildCard(BuildContext context, {required Widget child}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.sm),
      decoration: BoxDecoration(
        color: context.appColors.bgPrimary,
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(color: context.appColors.borderDefault),
      ),
      child: child,
    );
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
      SaveAvailabilityRequest(
        items: items,
        comment: _selectedDates.length == 1
            ? _commentController.text.trim()
            : '',
        applyComment: _selectedDates.length == 1,
      ),
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

  String _weekdayLabel(DateTime date) {
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return labels[date.weekday - 1];
  }

  String _dayMonthLabel(DateTime date) {
    final day = date.day.toString().padLeft(2, '0');
    final month = date.month.toString().padLeft(2, '0');
    return '$day/$month';
  }

  String _formatFullDate(DateTime date) {
    return '${_weekdayLabel(date)}, ${_dayMonthLabel(date)}/${date.year}';
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
