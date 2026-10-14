import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/assets/app_assets.dart';
import '../../../core/config/app_links.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/menu_group.dart';

/// Shared frame for every screen shown before the app opens: always dark, on
/// the hex wallpaper, with an Account-style header card.
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
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final Color? iconForeground;
  final Color? iconBackground;
  final List<Widget> children;
  final bool showLegalFooter;

  @override
  Widget build(BuildContext context) {
    return AuthTheme(
      child: _AuthLayout(
        footer: showLegalFooter ? const _LegalFooter() : null,
        children: [
          AuthHeaderCard(
            title: title,
            subtitle: subtitle,
            icon: icon,
            iconForeground: iconForeground,
            iconBackground: iconBackground,
          ),
          const SizedBox(height: AppSpacing.lg),
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

/// Forces the dark theme and draws the hex wallpaper behind [child]. The
/// wallpaper sits outside the Scaffold so it does not jump when the keyboard
/// resizes the body.
class AuthTheme extends StatelessWidget {
  const AuthTheme({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = AppTheme.dark();
    return Theme(
      data: theme,
      child: AnnotatedRegion<SystemUiOverlayStyle>(
        value:
            theme.appBarTheme.systemOverlayStyle ?? SystemUiOverlayStyle.light,
        child: Stack(
          fit: StackFit.expand,
          children: [
            const ColoredBox(color: AppPrimitives.black),
            Image.asset(
              AppAssets.homeDarkFigma559,
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
                    AppColorsScheme.dark.bgPrimary.withValues(
                      alpha: AppAuthScreen.scrimTopAlpha,
                    ),
                    AppColorsScheme.dark.bgPrimary.withValues(
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
  const _AuthLayout({required this.children, this.footer});

  final List<Widget> children;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            return SingleChildScrollView(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.lg,
                vertical: AppSpacing.lg,
              ),
              child: Center(
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    maxWidth: AppAuthScreen.contentMaxWidth,
                    minHeight: (constraints.maxHeight - AppSpacing.lg * 2)
                        .clamp(0, double.infinity),
                  ),
                  // A non-flexible column grows to minHeight, so spaceBetween
                  // centres the content and pushes the footer to the bottom.
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const SizedBox.shrink(),
                      Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: children,
                      ),
                      footer ?? const SizedBox.shrink(),
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
      child: Row(
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
                  style: textTheme.titleMedium?.copyWith(
                    color: colors.textPrimary,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: AppSpacing.xxs),
                Text(
                  subtitle,
                  style: textTheme.bodySmall?.copyWith(
                    color: colors.textSecondary,
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
      child: Row(
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
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: colors.textPrimary),
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
          textStyle: AppTypography.labelLarge,
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
      textStyle: AppTypography.labelMedium,
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
            style: AppTypography.labelMedium.copyWith(
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
