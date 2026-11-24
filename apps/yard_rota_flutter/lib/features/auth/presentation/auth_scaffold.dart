import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/config/app_links.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/home_wallpaper.dart';
import '../../../core/theme/home_wallpaper_storage.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/menu_group.dart';

/// Shared frame for every screen shown before the app opens: light theme on
/// the default ribbed-flow wallpaper, with an Account-style header card.
class AuthScaffold extends StatelessWidget {
  const AuthScaffold({
    super.key,
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.children,
    this.iconForeground,
    this.iconBackground,
    this.showLegalFooter = false,
    this.alignToTop = false,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final Color? iconForeground;
  final Color? iconBackground;
  final List<Widget> children;
  final bool showLegalFooter;

  /// When true, content starts at the top (long forms). Short screens stay
  /// vertically centred for a calmer first impression.
  final bool alignToTop;

  @override
  Widget build(BuildContext context) {
    return AuthTheme(
      child: _AuthLayout(
        alignToTop: alignToTop,
        footer: showLegalFooter ? const _LegalFooter() : null,
        children: [
          AuthHeaderCard(
            title: title,
            subtitle: subtitle,
            icon: icon,
            iconForeground: iconForeground,
            iconBackground: iconBackground,
          ),
          const SizedBox(height: AppSpacing.md),
          ...children,
        ],
      ),
    );
  }
}

/// Startup spinner on the same background, so there is no flash before the
/// login screen appears.
class AuthLoadingScreen extends StatelessWidget {
  const AuthLoadingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const AuthTheme(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: Center(child: CircularProgressIndicator()),
      ),
    );
  }
}

/// Light theme + default ribbed-flow wallpaper behind [child].
/// Wallpaper sits outside the Scaffold so it does not jump when the keyboard
/// resizes the body. Matches the app-wide cold-start defaults.
class AuthTheme extends StatelessWidget {
  const AuthTheme({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = AppTheme.light();
    final colors = AppColorsScheme.light;
    final wallpaperPath = kDefaultLightHomeWallpaper.assetPath;
    return Theme(
      data: theme,
      child: AnnotatedRegion<SystemUiOverlayStyle>(
        value:
            theme.appBarTheme.systemOverlayStyle ?? SystemUiOverlayStyle.dark,
        child: Stack(
          fit: StackFit.expand,
          children: [
            ColoredBox(color: colors.bgPrimary),
            Image.asset(
              wallpaperPath,
              fit: BoxFit.cover,
              gaplessPlayback: true,
              excludeFromSemantics: true,
            ),
            DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    colors.bgPrimary.withValues(
                      alpha: AppAuthScreen.scrimTopAlpha,
                    ),
                    colors.bgPrimary.withValues(
                      alpha: AppAuthScreen.scrimBottomAlpha,
                    ),
                  ],
                ),
              ),
            ),
            child,
          ],
        ),
      ),
    );
  }
}

class _AuthLayout extends StatelessWidget {
  const _AuthLayout({
    required this.children,
    required this.alignToTop,
    this.footer,
  });

  final List<Widget> children;
  final bool alignToTop;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    final keyboardInset = MediaQuery.viewInsetsOf(context).bottom;
    return Scaffold(
      backgroundColor: Colors.transparent,
      resizeToAvoidBottomInset: true,
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final minHeight = (constraints.maxHeight -
                    AppSpacing.lg * 2 -
                    keyboardInset)
                .clamp(0.0, double.infinity);
            return SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(
                AppSpacing.lg,
                AppSpacing.lg,
                AppSpacing.lg,
                AppSpacing.lg + keyboardInset,
              ),
              child: Center(
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    maxWidth: AppAuthScreen.contentMaxWidth,
                    minHeight: minHeight,
                  ),
                  child: Column(
                    mainAxisAlignment: alignToTop
                        ? MainAxisAlignment.start
                        : MainAxisAlignment.spaceBetween,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (!alignToTop) const SizedBox.shrink(),
                      Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: children,
                      ),
                      if (footer != null)
                        footer!
                      else if (!alignToTop)
                        const SizedBox.shrink(),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class AuthHeaderCard extends StatelessWidget {
  const AuthHeaderCard({
    super.key,
    required this.title,
    required this.subtitle,
    required this.icon,
    this.iconForeground,
    this.iconBackground,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final Color? iconForeground;
  final Color? iconBackground;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final textTheme = Theme.of(context).textTheme;
    return AppCard(
      surfaceOpacity: AppOpacity.subtle,
      borderColor: colors.borderSubtle,
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          IconBadge(
            icon: icon,
            foreground: iconForeground,
            background: iconBackground,
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: textTheme.titleLarge?.copyWith(
                    color: colors.textPrimary,
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.3,
                    height: 1.2,
                  ),
                ),
                const SizedBox(height: AppSpacing.xxs),
                Text(
                  subtitle,
                  style: textTheme.bodySmall?.copyWith(
                    color: colors.textSecondary,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Inline message card (for example an expired email link).
class AuthNoticeCard extends StatelessWidget {
  const AuthNoticeCard({super.key, required this.message, this.icon});

  final String message;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return AppCard(
      surfaceOpacity: AppOpacity.subtle,
      borderColor: colors.borderSubtle,
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          IconBadge(
            icon: icon ?? Icons.info_outline,
            foreground: colors.warning,
            background: colors.warningBg,
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Text(
              message,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: colors.textPrimary,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Small right-aligned text action under a card ("Forgot password?").
class AuthTextAction extends StatelessWidget {
  const AuthTextAction({
    super.key,
    required this.label,
    required this.onPressed,
    this.alignment = Alignment.centerRight,
  });

  final String label;
  final VoidCallback? onPressed;
  final Alignment alignment;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return Align(
      alignment: alignment,
      child: TextButton(
        onPressed: onPressed,
        style: TextButton.styleFrom(
          foregroundColor: colors.primary,
          minimumSize: const Size(0, AppComponentTokens.minTouchTarget),
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
          textStyle: Theme.of(context).textTheme.labelLarge?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
        child: Text(label),
      ),
    );
  }
}

class _LegalFooter extends StatelessWidget {
  const _LegalFooter();

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final style = TextButton.styleFrom(
      foregroundColor: colors.textSecondary,
      minimumSize: const Size(0, AppComponentTokens.minTouchTarget),
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
      textStyle: Theme.of(context).textTheme.labelMedium,
    );
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.xl),
      child: Wrap(
        alignment: WrapAlignment.center,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          TextButton(
            style: style,
            onPressed: () => openAppLink(context, AppLinks.privacyPolicy),
            child: const Text('Privacy Policy'),
          ),
          Text(
            '·',
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
              color: colors.textTertiary,
            ),
          ),
          TextButton(
            style: style,
            onPressed: () => openAppLink(context, AppLinks.termsOfUse),
            child: const Text('Terms of Use'),
          ),
        ],
      ),
    );
  }
}
