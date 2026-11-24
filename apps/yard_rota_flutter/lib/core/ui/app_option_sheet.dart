import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/app_tokens.dart';
import '../theme/theme_extensions.dart';
import 'app_modal_actions.dart';

/// Sentinel returned when [showAppOptionSheet] clears the selection.
const kAppOptionCleared = '__app_option_cleared__';

/// Shared bottom-sheet chrome for filter / option pickers (Home user flows).
ShapeBorder appOptionSheetShape(AppColorsScheme colors) {
  return RoundedRectangleBorder(
    borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.xl)),
    side: BorderSide(color: colors.borderDefault, width: AppStroke.thin),
  );
}

/// Caps sheet width on tablet / landscape so content is not full-bleed.
BoxConstraints appSheetConstraints(BuildContext context) {
  final width = MediaQuery.sizeOf(context).width;
  if (width >= 600) {
    return const BoxConstraints(maxWidth: 560);
  }
  return const BoxConstraints();
}

/// Shared [AlertDialog] chrome for confirms (logout, delete, reject).
ShapeBorder appDialogShape(AppColorsScheme colors) {
  return RoundedRectangleBorder(
    borderRadius: BorderRadius.circular(AppRadius.xl),
    side: BorderSide(color: colors.borderDefault, width: AppStroke.thin),
  );
}

/// Quiet pill track used by My Rota / Stats / Home segment filters.
class AppQuietFilterTrack extends StatelessWidget {
  const AppQuietFilterTrack({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return Container(
      height: AppHomeTabs.segmentHeight + AppHomeTabs.trackPadding * 2,
      padding: const EdgeInsets.all(AppHomeTabs.trackPadding),
      decoration: BoxDecoration(
        color: colors.bgPrimary.withValues(alpha: 0.28),
        borderRadius: BorderRadius.circular(AppRadius.full),
        border: Border.all(
          color: colors.borderDefault.withValues(alpha: 0.45),
          width: AppStroke.thin,
        ),
      ),
      child: child,
    );
  }
}

/// Opens a polished option picker. Returns the selected value, `null` on
/// cancel, or [kAppOptionCleared] when [allowClear] is used.
Future<T?> showAppOptionSheet<T>({
  required BuildContext context,
  required String title,
  required List<T> options,
  required String Function(T value) labelFor,
  T? selected,
  String? subtitle,
  String confirmLabel = 'Done',
  bool allowClear = false,
  /// When true, tapping an option pops immediately (no Done row).
  bool selectAndClose = false,
}) {
  final colors = context.appColors;
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    backgroundColor: colors.bgElevated,
    shape: appOptionSheetShape(colors),
    constraints: appSheetConstraints(context),
    builder: (_) => _AppOptionSheetBody<T>(
      title: title,
      subtitle: subtitle,
      options: options,
      selected: selected,
      labelFor: labelFor,
      confirmLabel: confirmLabel,
      allowClear: allowClear,
      selectAndClose: selectAndClose,
    ),
  );
}

class _AppOptionSheetBody<T> extends StatefulWidget {
  const _AppOptionSheetBody({
    required this.title,
    required this.options,
    required this.labelFor,
    this.subtitle,
    this.selected,
    this.confirmLabel = 'Done',
    this.allowClear = false,
    this.selectAndClose = false,
  });

  final String title;
  final String? subtitle;
  final List<T> options;
  final T? selected;
  final String Function(T value) labelFor;
  final String confirmLabel;
  final bool allowClear;
  final bool selectAndClose;

  @override
  State<_AppOptionSheetBody<T>> createState() => _AppOptionSheetBodyState<T>();
}

class _AppOptionSheetBodyState<T> extends State<_AppOptionSheetBody<T>> {
  late T? _selected = widget.selected;

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
            const AppSheetDragHandle(),
            Text(
              widget.title,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w700,
                color: colors.textPrimary,
                letterSpacing: -0.2,
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
              child: ListView.builder(
                shrinkWrap: true,
                itemCount: widget.options.length,
                itemBuilder: (context, index) {
                  final option = widget.options[index];
                  return Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.xxs),
                    child: AppSheetOptionTile(
                      label: widget.labelFor(option),
                      selected: option == _selected,
                      accent: accent,
                      accentWash: accentWash,
                      onTap: () {
                        HapticFeedback.selectionClick();
                        if (widget.selectAndClose) {
                          Navigator.of(context).pop(option);
                          return;
                        }
                        setState(() => _selected = option);
                      },
                    ),
                  );
                },
              ),
            ),
            if (widget.selectAndClose)
              const SizedBox(height: AppSpacing.sm)
            else ...[
              const SizedBox(height: AppSpacing.md),
              if (widget.allowClear) ...[
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    style: TextButton.styleFrom(
                      minimumSize: const Size(
                        AppComponentTokens.minTouchTarget,
                        AppComponentTokens.minTouchTarget,
                      ),
                    ),
                    onPressed: () {
                      // allowClear is only used by String pickers.
                      Navigator.of(context).pop(kAppOptionCleared as T);
                    },
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
                confirmLabel: widget.confirmLabel,
                confirmEnabled: _selected != null,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Top drag affordance for bottom sheets.
class AppSheetDragHandle extends StatelessWidget {
  const AppSheetDragHandle({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return ExcludeSemantics(
      child: Center(
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
    );
  }
}

/// One selectable row inside an option sheet.
class AppSheetOptionTile extends StatelessWidget {
  const AppSheetOptionTile({
    super.key,
    required this.label,
    required this.selected,
    required this.accent,
    required this.accentWash,
    required this.onTap,
    this.leading,
  });

  final String label;
  final bool selected;
  final Color accent;
  final Color accentWash;
  final VoidCallback onTap;
  final Widget? leading;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Semantics(
      button: true,
      selected: selected,
      label: label,
      child: Material(
        color: selected
            ? Color.alphaBlend(
                accentWash.withValues(alpha: isDark ? 0.55 : 0.85),
                colors.bgElevated,
              )
            : colors.bgElevated,
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: InkWell(
          borderRadius: BorderRadius.circular(AppRadius.md),
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(
              minHeight: AppComponentTokens.minTouchTarget,
            ),
            child: Container(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.sm,
                vertical: AppSpacing.sm,
              ),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(AppRadius.md),
                border: Border.all(
                  color: selected
                      ? accent.withValues(alpha: 0.45)
                      : colors.borderDefault,
                ),
              ),
              alignment: Alignment.centerLeft,
              child: Row(
                children: [
                  if (leading != null) ...[
                    leading!,
                    const SizedBox(width: AppSpacing.sm),
                  ],
                  Expanded(
                    child: Text(
                      label,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: selected ? accent : colors.textPrimary,
                        fontWeight:
                            selected ? FontWeight.w600 : FontWeight.w400,
                      ),
                    ),
                  ),
                  if (selected)
                    Icon(Icons.check_rounded, size: 20, color: accent),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
