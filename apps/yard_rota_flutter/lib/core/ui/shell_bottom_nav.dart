import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/app_tokens.dart';
import '../theme/theme_extensions.dart';
import 'glass_bar_surface.dart';
import 'nav_pill.dart';

/// One tab in the glass bottom shell menu.
class ShellBottomNavDestination {
  const ShellBottomNavDestination({
    required this.label,
    required this.icon,
  });

  final String label;
  final IconData icon;
}

/// Frosted bottom tab bar used by Home, Transport Manager, and Admin Transport.
class ShellBottomNavBar extends StatelessWidget {
  const ShellBottomNavBar({
    super.key,
    required this.destinations,
    required this.selectedIndex,
    required this.onDestinationSelected,
  });

  final List<ShellBottomNavDestination> destinations;
  final int selectedIndex;
  final ValueChanged<int> onDestinationSelected;

  @override
  Widget build(BuildContext context) {
    assert(destinations.isNotEmpty);
    assert(selectedIndex >= 0 && selectedIndex < destinations.length);

    return GlassBarSurface(
      edge: GlassBarEdge.bottom,
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: AppComponentTokens.bottomNavHeight,
          child: Row(
            children: [
              for (var i = 0; i < destinations.length; i++)
                Expanded(
                  child: ShellBottomNavItem(
                    destination: destinations[i],
                    selected: i == selectedIndex,
                    onTap: () {
                      if (i == selectedIndex) return;
                      HapticFeedback.selectionClick();
                      onDestinationSelected(i);
                    },
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Single bottom-nav control: light icon, primary underline when selected.
class ShellBottomNavItem extends StatelessWidget {
  const ShellBottomNavItem({
    super.key,
    required this.destination,
    required this.selected,
    required this.onTap,
  });

  final ShellBottomNavDestination destination;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final iconColor = bottomNavIconColor(
      colors,
      selected: selected,
      isDark: isDark,
    );
    final labelColor = bottomNavLabelColor(
      colors,
      selected: selected,
      isDark: isDark,
    );

    // excludeSemantics: avoid TalkBack "PreCheck / PreCheck" from label + child Text.
    return Semantics(
      button: true,
      selected: selected,
      label: destination.label,
      excludeSemantics: true,
      child: InkResponse(
        onTap: onTap,
        containedInkWell: true,
        highlightShape: BoxShape.rectangle,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            SizedBox(
              width: AppNavPill.bottomPillWidth,
              height: AppNavPill.bottomPillHeight,
              child: Center(
                child: navBarIcon(
                  destination.icon,
                  size: AppNavPill.bottomIconSize,
                  color: iconColor,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppNavPill.bottomIndicatorInset,
              ),
              child: AnimatedContainer(
                duration: AppMotion.normal,
                curve: AppMotion.emphasized,
                margin: const EdgeInsets.only(top: AppSpacing.xxs),
                width: double.infinity,
                height: AppNavPill.bottomIndicatorHeight,
                decoration: BoxDecoration(
                  color: selected
                      ? colors.primary.withValues(
                          alpha: isDark
                              ? AppNavPill.bottomIndicatorAlpha
                              : AppNavPill.bottomIndicatorAlphaLight,
                        )
                      : Colors.transparent,
                  borderRadius: BorderRadius.circular(AppRadius.full),
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.xxs),
            Text(
              destination.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.labelSmall.copyWith(
                color: labelColor,
                fontWeight: selected ? FontWeight.w500 : FontWeight.w400,
                fontSize: AppNavPill.bottomLabelFontSize,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
