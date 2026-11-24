import 'package:flutter/material.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_option_sheet.dart';

/// Bottom sheet used by profile option fields — same shell as Stats / My Rota.
/// Sentinel returned when [allowClear] is used and the user clears the value.
const kProfileOptionCleared = kAppOptionCleared;

Future<String?> showProfileOptionSheet({
  required BuildContext context,
  required String title,
  required Map<String, String> options,
  String? selectedValue,
  String? subtitle,
  bool allowClear = false,
}) {
  return showAppOptionSheet<String>(
    context: context,
    title: title,
    subtitle: subtitle,
    selected: selectedValue,
    allowClear: allowClear,
    options: options.entries.map((e) => e.key).toList(growable: false),
    labelFor: (value) => options[value] ?? value,
  );
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
        child: ConstrainedBox(
          constraints: const BoxConstraints(
            minHeight: AppComponentTokens.buttonHeightMd,
          ),
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
                color: display == null
                    ? colors.textTertiary
                    : colors.textPrimary,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Shared AlertDialog chrome for profile confirms (logout / delete).
ShapeBorder profileDialogShape(AppColorsScheme colors) => appDialogShape(colors);
