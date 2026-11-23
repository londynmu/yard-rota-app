import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme/app_tokens.dart';
import '../theme/theme_extensions.dart';

/// Visual tone for [AppToast] — success (green + tick), warning (amber), error (red).
enum AppToastKind { success, warning, error }

/// User-facing transient messages: centered toast over the current route
/// (non-blocking; pointer events pass through to the app).
abstract final class AppToast {
  AppToast._();

  static const Duration defaultDuration = Duration(seconds: 3);

  static OverlayEntry? _activeEntry;
  static Timer? _hideTimer;

  /// Clears any visible toast and pending auto-dismiss timer (e.g. after tests
  /// or sign-out).
  static void dismissPending() {
    _hideTimer?.cancel();
    _hideTimer = null;
    _activeEntry?.remove();
    _activeEntry = null;
  }

  /// Green confirmation — saved / updated / completed actions.
  static void success(
    BuildContext context,
    String message, {
    Duration? duration,
  }) => show(context, message, kind: AppToastKind.success, duration: duration);

  /// Amber caution — soft warnings that are not hard failures.
  static void warning(
    BuildContext context,
    String message, {
    Duration? duration,
  }) => show(context, message, kind: AppToastKind.warning, duration: duration);

  /// Red failure — could not load / save / delete.
  static void error(
    BuildContext context,
    String message, {
    Duration? duration,
  }) => show(context, message, kind: AppToastKind.error, duration: duration);

  static void show(
    BuildContext context,
    String message, {
    AppToastKind kind = AppToastKind.warning,
    Duration? duration,
  }) {
    if (!context.mounted) {
      return;
    }
    final d = duration ?? defaultDuration;
    final overlay = Overlay.maybeOf(context, rootOverlay: true);
    if (overlay == null) {
      final messenger = ScaffoldMessenger.maybeOf(context);
      if (messenger == null) {
        return;
      }
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(message), duration: d));
      return;
    }

    dismissPending();

    late OverlayEntry entry;
    entry = OverlayEntry(
      builder: (ctx) {
        final colors = ctx.appColors;
        final w = MediaQuery.sizeOf(ctx).width;
        final (bg, border, iconColor, icon) = switch (kind) {
          AppToastKind.success => (
            colors.successBg,
            colors.success,
            colors.success,
            Icons.check_circle_rounded,
          ),
          AppToastKind.warning => (
            colors.warningBg,
            colors.warning,
            colors.warning,
            Icons.warning_amber_rounded,
          ),
          AppToastKind.error => (
            colors.dangerBg,
            colors.danger,
            colors.danger,
            Icons.error_outline_rounded,
          ),
        };
        const iconSize = 26.0;
        final maxBubble = math.min(360.0, w - 32);
        // Icon + gap + horizontal padding; text may use the rest, then wrap.
        final maxTextWidth =
            maxBubble - iconSize - AppSpacing.sm - (AppSpacing.lg * 2);

        return Positioned.fill(
          child: IgnorePointer(
            child: Center(
              child: Material(
                elevation: 8,
                borderRadius: BorderRadius.circular(AppRadius.lg),
                color: Colors.transparent,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: bg,
                    borderRadius: BorderRadius.circular(AppRadius.lg),
                    border: Border.all(color: border, width: 1.5),
                    boxShadow: [
                      BoxShadow(
                        color: colors.shadow.withValues(alpha: 0.22),
                        blurRadius: 16,
                        offset: const Offset(0, 6),
                      ),
                    ],
                  ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.lg,
                      vertical: AppSpacing.md,
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        Icon(icon, color: iconColor, size: iconSize),
                        const SizedBox(width: AppSpacing.sm),
                        ConstrainedBox(
                          constraints: BoxConstraints(maxWidth: maxTextWidth),
                          child: Text(
                            message,
                            style: AppTypography.bodyMedium.copyWith(
                              color: colors.textPrimary,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );

    _activeEntry = entry;
    overlay.insert(entry);

    _hideTimer?.cancel();
    _hideTimer = Timer(d, () {
      _hideTimer = null;
      if (_activeEntry == entry) {
        entry.remove();
        _activeEntry = null;
      }
    });
  }
}
