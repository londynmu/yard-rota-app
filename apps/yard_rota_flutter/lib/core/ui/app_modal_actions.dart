import 'package:flutter/material.dart';

import '../theme/app_tokens.dart';
import '../theme/theme_extensions.dart';
import 'app_button.dart';

/// Neutral Cancel / confirm pair for sheets and custom dialogs.
///
/// Both sides use [AppButtonVariant.secondary] (outlined) — no filled
/// primary / accent colours, so every modal matches the calendar sheet.
class AppModalActions extends StatelessWidget {
  const AppModalActions({
    super.key,
    required this.onCancel,
    required this.onConfirm,
    this.cancelLabel = 'Cancel',
    this.confirmLabel = 'Save',
    this.confirmEnabled = true,
  });

  final VoidCallback onCancel;
  final VoidCallback? onConfirm;
  final String cancelLabel;
  final String confirmLabel;
  final bool confirmEnabled;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: SizedBox(
            height: AppComponentTokens.buttonHeightMd,
            child: AppButton(
              label: cancelLabel,
              variant: AppButtonVariant.secondary,
              onPressed: onCancel,
            ),
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: SizedBox(
            height: AppComponentTokens.buttonHeightMd,
            child: AppButton(
              label: confirmLabel,
              variant: AppButtonVariant.secondary,
              onPressed: confirmEnabled ? onConfirm : null,
            ),
          ),
        ),
      ],
    );
  }
}

/// Neutral [AlertDialog] actions — same weight for Cancel and confirm,
/// no filled primary / accent buttons.
List<Widget> appDialogActions({
  required BuildContext context,
  required VoidCallback onCancel,
  required VoidCallback? onConfirm,
  String cancelLabel = 'Cancel',
  String confirmLabel = 'Save',
}) {
  final colors = context.appColors;
  final style = TextButton.styleFrom(
    foregroundColor: colors.textPrimary,
    disabledForegroundColor: colors.textTertiary,
    textStyle: AppTypography.labelLarge.copyWith(fontWeight: FontWeight.w500),
  );
  return [
    TextButton(
      style: style,
      onPressed: onCancel,
      child: Text(cancelLabel),
    ),
    TextButton(
      style: style,
      onPressed: onConfirm,
      child: Text(confirmLabel),
    ),
  ];
}
