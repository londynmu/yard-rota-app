import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme/app_tokens.dart';
import '../theme/theme_extensions.dart';

/// User-facing transient messages: centered **warning**-style toast over the
/// current route (non-blocking; pointer events pass through to the app).
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

  static void show(
    BuildContext context,
    String message, {
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
        return Positioned.fill(
          child: IgnorePointer(
            child: Center(
              child: ConstrainedBox(
                constraints: BoxConstraints(maxWidth: math.min(360, w - 32)),
                child: Material(
                  elevation: 8,
                  borderRadius: BorderRadius.circular(AppRadius.lg),
                  color: Colors.transparent,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: colors.warningBg,
                      borderRadius: BorderRadius.circular(AppRadius.lg),
                      border: Border.all(color: colors.warning, width: 1.5),
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
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(
                            Icons.warning_amber_rounded,
                            color: colors.warning,
                            size: 26,
                          ),
                          const SizedBox(width: AppSpacing.sm),
                          Expanded(
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
