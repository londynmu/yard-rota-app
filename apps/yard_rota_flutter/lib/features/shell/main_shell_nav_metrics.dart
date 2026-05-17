import '../../core/theme/app_tokens.dart';

/// Minimum tap height inside each bottom-nav item (`_MainShellNavItem`).
const double kMainShellNavItemMinHeight = 60;

/// Floating nav strip above the home indicator: top padding + row + bottom
/// padding of `_MainShellBottomNav`, excluding [MediaQuery.viewPadding.bottom].
const double kMainShellFloatingNavVisualHeight =
    AppSpacing.sm + kMainShellNavItemMinHeight + AppSpacing.sm;

/// Extra room so content does not tuck under the nav with larger text / taps.
const double kMainShellFloatingNavLayoutSlop = 8;

/// Added to [MediaQuery.padding.bottom] for shell tab content (calendar, etc.).
const double kMainShellContentExtraBottomInset =
    kMainShellFloatingNavVisualHeight + kMainShellFloatingNavLayoutSlop;
