import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/theme/app_tokens.dart';
import '../../core/theme/theme_extensions.dart';
import '../calendar/data/availability_repository.dart';
import '../calendar/data/calendar_repository.dart';
import '../calendar/presentation/calendar_screen.dart';
import '../profile/presentation/profile_screen.dart';

/// Vertical space taken by the floating tab row (excluding system safe bottom).
/// Must match [_MainShellBottomNav] inner layout.
const double kMainShellNavRowExtent =
    AppSpacing.sm + _kMainShellNavTapHeight + AppSpacing.sm;

/// Min vertical extent of one nav pill (blur + icon + label + padding).
const double _kMainShellNavTapHeight = 60;

/// Root shell after sign-in: bottom navigation (Home, Profile). Transparent
/// bar; rounded frosted blur behind each tab control.
class MainShell extends StatefulWidget {
  const MainShell({
    super.key,
    required this.displayName,
    required this.calendarRepository,
    required this.availabilityRepository,
    required this.onLogout,
    required this.themeMode,
    required this.onThemeModeChanged,
  });

  final String displayName;
  final CalendarRepository calendarRepository;
  final AvailabilityRepository availabilityRepository;
  final Future<void> Function() onLogout;
  final ThemeMode themeMode;
  final Future<void> Function(ThemeMode mode) onThemeModeChanged;

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final overlay = isDark
        ? const SystemUiOverlayStyle(
            statusBarColor: Colors.transparent,
            statusBarBrightness: Brightness.dark,
            statusBarIconBrightness: Brightness.light,
            systemNavigationBarColor: Colors.transparent,
            systemNavigationBarIconBrightness: Brightness.light,
            systemNavigationBarDividerColor: Colors.transparent,
          )
        : const SystemUiOverlayStyle(
            statusBarColor: Colors.transparent,
            // iOS: light status bar surface → dark clock / icons.
            statusBarBrightness: Brightness.light,
            statusBarIconBrightness: Brightness.dark,
            systemNavigationBarColor: Colors.transparent,
            systemNavigationBarIconBrightness: Brightness.dark,
            systemNavigationBarDividerColor: Colors.transparent,
          );

    final mq = MediaQuery.of(context);
    final paddedBody = MediaQuery(
      data: mq.copyWith(
        padding: mq.padding.copyWith(
          bottom: mq.padding.bottom + kMainShellNavRowExtent,
        ),
      ),
      child: IndexedStack(
        index: _index,
        children: [
          CalendarScreen(
            displayName: widget.displayName,
            calendarRepository: widget.calendarRepository,
            availabilityRepository: widget.availabilityRepository,
            onLogout: widget.onLogout,
          ),
          ProfileScreen(
            themeMode: widget.themeMode,
            onThemeModeChanged: widget.onThemeModeChanged,
          ),
        ],
      ),
    );

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: overlay,
      child: Scaffold(
        extendBody: true,
        body: paddedBody,
        bottomNavigationBar: _MainShellBottomNav(
          selectedIndex: _index,
          onDestinationSelected: (i) => setState(() => _index = i),
        ),
      ),
    );
  }
}

class _MainShellBottomNav extends StatelessWidget {
  const _MainShellBottomNav({
    required this.selectedIndex,
    required this.onDestinationSelected,
  });

  final int selectedIndex;
  final ValueChanged<int> onDestinationSelected;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final mq = MediaQuery.of(context);
    final safeBottom = mq.padding.bottom;

    return ColoredBox(
      color: Colors.transparent,
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          AppSpacing.lg,
          AppSpacing.sm,
          AppSpacing.lg,
          AppSpacing.sm + safeBottom,
        ),
        child: Row(
          children: [
            Expanded(
              child: Stack(
                alignment: Alignment.center,
                children: [
                  const Positioned.fill(
                    child: IgnorePointer(child: SizedBox.expand()),
                  ),
                  _MainShellNavItem(
                    selected: selectedIndex == 0,
                    label: 'Home',
                    icon: Icons.home_outlined,
                    selectedIcon: Icons.home,
                    isDark: isDark,
                    colors: colors,
                    onTap: () => onDestinationSelected(0),
                  ),
                ],
              ),
            ),
            SizedBox(width: AppSpacing.md),
            Expanded(
              child: Stack(
                alignment: Alignment.center,
                children: [
                  const Positioned.fill(
                    child: IgnorePointer(child: SizedBox.expand()),
                  ),
                  _MainShellNavItem(
                    selected: selectedIndex == 1,
                    label: 'Profile',
                    icon: Icons.person_outline,
                    selectedIcon: Icons.person,
                    isDark: isDark,
                    colors: colors,
                    onTap: () => onDestinationSelected(1),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MainShellNavItem extends StatelessWidget {
  const _MainShellNavItem({
    required this.selected,
    required this.label,
    required this.icon,
    required this.selectedIcon,
    required this.isDark,
    required this.colors,
    required this.onTap,
  });

  final bool selected;
  final String label;
  final IconData icon;
  final IconData selectedIcon;
  final bool isDark;
  final AppColorsScheme colors;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    // High-contrast on mesh: main text when idle, primary when selected.
    final idleColor = colors.textPrimary;
    final iconColor = selected ? colors.primary : idleColor;
    final labelColor = selected ? colors.primary : idleColor;
    final pillRadius = BorderRadius.circular(AppRadius.xl);
    final frostTint = colors.bgElevated.withValues(
      alpha: isDark ? 0.26 : 0.4,
    );

    return Semantics(
      button: true,
      selected: selected,
      label: label,
      child: ClipRRect(
        borderRadius: pillRadius,
        child: Stack(
          alignment: Alignment.center,
          children: [
            Positioned.fill(
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    borderRadius: pillRadius,
                    color: frostTint,
                  ),
                ),
              ),
            ),
            Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: onTap,
                borderRadius: pillRadius,
                splashColor: colors.primary.withValues(alpha: 0.12),
                highlightColor: colors.primary.withValues(alpha: 0.06),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(
                    minWidth: 88,
                    minHeight: _kMainShellNavTapHeight,
                  ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.lg,
                      vertical: AppSpacing.sm,
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          selected ? selectedIcon : icon,
                          size: 24,
                          color: iconColor,
                        ),
                        const SizedBox(height: AppSpacing.xs),
                        Text(
                          label,
                          style: AppTypography.labelMedium.copyWith(
                            color: labelColor,
                            fontWeight: selected
                                ? FontWeight.w700
                                : FontWeight.w600,
                            letterSpacing: 0.1,
                          ),
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
    );
  }
}
