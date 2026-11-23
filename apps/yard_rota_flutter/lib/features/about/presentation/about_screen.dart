import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../../../core/config/app_links.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/home_wallpaper.dart';
import '../../../core/theme/home_wallpaper_storage.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_card.dart';

class AboutScreen extends StatefulWidget {
  const AboutScreen({
    super.key,
    this.lightHomeWallpaper,
    this.darkHomeWallpaper,
  });

  /// Nullable so a hot reload that adds these fields cannot crash on null.
  final LightHomeWallpaper? lightHomeWallpaper;
  final DarkHomeWallpaper? darkHomeWallpaper;

  @override
  State<AboutScreen> createState() => _AboutScreenState();
}

class _AboutScreenState extends State<AboutScreen> {
  String? _version;

  LightHomeWallpaper get _lightWallpaper =>
      widget.lightHomeWallpaper ?? kDefaultLightHomeWallpaper;

  DarkHomeWallpaper get _darkWallpaper =>
      widget.darkHomeWallpaper ?? kDefaultDarkHomeWallpaper;

  @override
  void initState() {
    super.initState();
    PackageInfo.fromPlatform()
        .then((info) {
          if (mounted) {
            setState(() => _version = '${info.version} (${info.buildNumber})');
          }
        })
        .catchError((_) {});
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final wallpaperPath = homeBackgroundAssetPath(
      brightness: isDark ? Brightness.dark : Brightness.light,
      lightWallpaper: _lightWallpaper,
      darkWallpaper: _darkWallpaper,
    );

    return Stack(
      fit: StackFit.expand,
      children: [
        Positioned.fill(
          child: Image.asset(
            wallpaperPath,
            fit: BoxFit.cover,
            alignment: Alignment.center,
            gaplessPlayback: true,
          ),
        ),
        Scaffold(
          backgroundColor: Colors.transparent,
          appBar: AppBar(
            backgroundColor: Colors.transparent,
            surfaceTintColor: Colors.transparent,
            elevation: 0,
            scrolledUnderElevation: 0,
            flexibleSpace: ClipRect(
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: isDark
                          ? [
                              colors.bgPrimary.withValues(alpha: 0.0),
                              colors.bgPrimary.withValues(alpha: 0.28),
                            ]
                          : [
                              Colors.white.withValues(alpha: 0.0),
                              Colors.white.withValues(alpha: 0.42),
                            ],
                    ),
                  ),
                ),
              ),
            ),
            title: const Text('About & privacy'),
          ),
          body: SafeArea(
            top: false,
            child: ListView(
              padding: const EdgeInsets.all(AppSpacing.lg),
              children: [
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Yard Rota',
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      const SizedBox(height: AppSpacing.xs),
                      Text(
                        _version == null ? 'Version' : 'Version $_version',
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: colors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                AppCard(
                  padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
                  child: Column(
                    children: [
                      _LinkTile(
                        icon: Icons.privacy_tip_outlined,
                        title: 'Privacy Policy',
                        onTap: () =>
                            openAppLink(context, AppLinks.privacyPolicy),
                      ),
                      _LinkTile(
                        icon: Icons.description_outlined,
                        title: 'Terms of Use',
                        onTap: () => openAppLink(context, AppLinks.termsOfUse),
                      ),
                      _LinkTile(
                        icon: Icons.person_remove_outlined,
                        title: 'Account deletion',
                        onTap: () =>
                            openAppLink(context, AppLinks.accountDeletion),
                      ),
                      _LinkTile(
                        icon: Icons.mail_outline,
                        title: 'Contact support',
                        subtitle: AppLinks.supportEmail,
                        onTap: () => openAppLink(context, AppLinks.support),
                      ),
                      _LinkTile(
                        icon: Icons.article_outlined,
                        title: 'Open-source licences',
                        onTap: () => showLicensePage(
                          context: context,
                          applicationName: 'Yard Rota',
                          applicationVersion: _version,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _LinkTile extends StatelessWidget {
  const _LinkTile({
    required this.icon,
    required this.title,
    required this.onTap,
    this.subtitle,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: context.appColors.textSecondary),
      title: Text(title),
      subtitle: subtitle == null ? null : Text(subtitle!),
      trailing: const Icon(Icons.chevron_right),
      onTap: onTap,
    );
  }
}
