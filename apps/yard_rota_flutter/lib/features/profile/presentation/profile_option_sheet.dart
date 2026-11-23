import 'package:flutter/material.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_modal_actions.dart';

/// Bottom sheet used by profile option fields — same shell as Stats / My Rota.
/// Sentinel returned when [allowClear] is used and the user clears the value.
const kProfileOptionCleared = '__profile_option_cleared__';

Future<String?> showProfileOptionSheet({
  required BuildContext context,
  required String title,
  required Map<String, String> options,
  String? selectedValue,
  String? subtitle,
  bool allowClear = false,
}) {
  final colors = context.appColors;
  final entries = options.entries
      .map((e) => (value: e.key, label: e.value))
      .toList(growable: false);
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    backgroundColor: colors.bgElevated,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.xl)),
      side: BorderSide(color: colors.borderDefault),
    ),
    builder: (_) => _ProfileOptionSheet(
      title: title,
      subtitle: subtitle,
      selectedValue: selectedValue,
      options: entries,
      allowClear: allowClear,
    ),
  );
}

class _ProfileOptionSheet extends StatefulWidget {
  const _ProfileOptionSheet({
    required this.title,
    required this.options,
    this.subtitle,
    this.selectedValue,
    this.allowClear = false,
  });

  final String title;
  final String? subtitle;
  final String? selectedValue;
  final List<({String value, String label})> options;
  final bool allowClear;

  @override
  State<_ProfileOptionSheet> createState() => _ProfileOptionSheetState();
}

class _ProfileOptionSheetState extends State<_ProfileOptionSheet> {
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
            if (widget.allowClear) ...[
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(
                  onPressed: () =>
                      Navigator.of(context).pop(kProfileOptionCleared),
                  child: const Text('Clear'),
                ),
              ),
              const SizedBox(height: AppSpacing.xs),
            ],
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

/// Tappable field that opens [showProfileOptionSheet] — replaces Material dropdowns.
class ProfileOptionField extends StatelessWidget {
  const ProfileOptionField({
    super.key,
    required this.label,
    required this.value,
    required this.items,
    required this.onChanged,
    this.placeholder = 'Select',
    this.allowClear = false,
  });

  final String label;
  final String? value;
  final Map<String, String> items;
  final ValueChanged<String?> onChanged;
  final String placeholder;
  final bool allowClear;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final display = value == null ? null : items[value];
    return Material(
      color: colors.bgSecondary,
      borderRadius: BorderRadius.circular(AppRadius.md),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadius.md),
        onTap: items.isEmpty
            ? null
            : () async {
                final picked = await showProfileOptionSheet(
                  context: context,
                  title: label,
                  options: items,
                  selectedValue: value,
                  allowClear: allowClear,
                );
                if (picked == null) return;
                if (picked == kProfileOptionCleared) {
                  onChanged(null);
                  return;
                }
                onChanged(picked);
              },
        child: InputDecorator(
          isEmpty: display == null,
          decoration: InputDecoration(
            labelText: label,
            filled: false,
            suffixIcon: Icon(
              Icons.expand_more_rounded,
              color: colors.textTertiary,
            ),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppRadius.md),
              borderSide: BorderSide(color: colors.borderDefault),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppRadius.md),
              borderSide: BorderSide(color: colors.borderDefault),
            ),
          ),
          child: Text(
            display ?? placeholder,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: display == null ? colors.textTertiary : colors.textPrimary,
            ),
          ),
        ),
      ),
    );
  }
}

/// Shared AlertDialog chrome for profile confirms (logout / delete).
ShapeBorder profileDialogShape(AppColorsScheme colors) {
  return RoundedRectangleBorder(
    borderRadius: BorderRadius.circular(AppRadius.xl),
    side: BorderSide(color: colors.borderDefault, width: AppStroke.thin),
  );
}
