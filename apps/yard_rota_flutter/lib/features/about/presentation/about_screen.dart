import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../../../core/config/app_links.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/home_wallpaper.dart';
import '../../../core/theme/home_wallpaper_storage.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/glass_bar_surface.dart';
import '../../../core/ui/menu_group.dart';

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
    final mq = MediaQuery.of(context);
    final topInset =
        mq.padding.top + AppComponentTokens.appBarHeight + AppSpacing.md;
    final wallpaperPath = homeBackgroundAssetPath(
      brightness: isDark ? Brightness.dark : Brightness.light,
      lightWallpaper: _lightWallpaper,
      darkWallpaper: _darkWallpaper,
    );

    return Scaffold(
      backgroundColor: Colors.transparent,
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        elevation: AppElevation.level0,
        scrolledUnderElevation: AppElevation.level0,
        toolbarHeight: AppComponentTokens.appBarHeight,
        flexibleSpace: const GlassBarSurface(edge: GlassBarEdge.top),
        title: Text(
          'About & privacy',
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w700,
            color: colors.textPrimary,
            letterSpacing: -0.3,
          ),
        ),
      ),
      body: Stack(
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
          ListView(
            padding: EdgeInsets.fromLTRB(
              AppSpacing.lg,
              topInset,
              AppSpacing.lg,
              mq.padding.bottom + AppSpacing.lg,
            ),
            children: [
              AppCard(
                surfaceOpacity: AppOpacity.subtle,
                padding: const EdgeInsets.all(AppSpacing.md),
                child: Row(
                  children: [
                    const IconBadge(icon: Icons.info_outline),
                    const SizedBox(width: AppSpacing.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Yard Rota',
                            style: Theme.of(context).textTheme.titleLarge
                                ?.copyWith(
                                  fontWeight: FontWeight.w700,
                                  color: colors.textPrimary,
                                  letterSpacing: -0.3,
                                ),
                          ),
                          const SizedBox(height: AppSpacing.xxs),
                          Text(
                            _version == null
                                ? 'Loading version…'
                                : 'Version $_version',
                            style: Theme.of(context).textTheme.bodySmall
                                ?.copyWith(color: colors.textSecondary),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              MenuGroup(
                children: [
                  MenuTile(
                    icon: Icons.privacy_tip_outlined,
                    title: 'Privacy Policy',
                    subtitle: 'How we handle your data',
                    onTap: () =>
                        openAppLink(context, AppLinks.privacyPolicy),
                  ),
                  MenuTile(
                    icon: Icons.description_outlined,
                    title: 'Terms of Use',
                    subtitle: 'Rules for using Yard Rota',
                    onTap: () => openAppLink(context, AppLinks.termsOfUse),
                  ),
                  MenuTile(
                    icon: Icons.person_remove_outlined,
                    title: 'Account deletion',
                    subtitle: 'How to remove your account',
                    onTap: () =>
                        openAppLink(context, AppLinks.accountDeletion),
                  ),
                  MenuTile(
                    icon: Icons.mail_outline,
                    title: 'Contact support',
                    subtitle: AppLinks.supportEmail,
                    onTap: () => openAppLink(context, AppLinks.support),
                  ),
                  MenuTile(
                    icon: Icons.article_outlined,
                    title: 'Open-source licences',
                    subtitle: 'Libraries used in this app',
                    onTap: () => showLicensePage(
                      context: context,
                      applicationName: 'Yard Rota',
                      applicationVersion: _version,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}
