import 'package:flutter/material.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/home_wallpaper.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/app_toast.dart';
import '../../../core/ui/glass_bar_surface.dart';
import '../../../core/ui/menu_group.dart';
import '../../about/presentation/about_screen.dart';
import '../../admin/presentation/admin_shell_screen.dart';
import '../../home/data/stage_one_repository.dart';
import '../../induction/presentation/induction_guide_screen.dart';
import '../../stage_three/data/stage_three_repository.dart';
import '../../stage_two/data/stage_two_repository.dart';
import '../../transport/presentation/transport_dashboard_screen.dart';
import '../../vmu/presentation/vmu_shell_screen.dart';
import 'profile_screen.dart';
import 'themes_screen.dart';

/// Last bottom-menu tab: "Account" for shunters, "Admin" for admins (adds
/// management shortcuts above the personal settings).
class AccountMenuScreen extends StatelessWidget {
  const AccountMenuScreen({
    super.key,
    required this.apiClient,
    required this.session,
    required this.onLogout,
    required this.onProfileSaved,
    required this.themeMode,
    required this.onThemeModeChanged,
    required this.lightHomeWallpaper,
    required this.darkHomeWallpaper,
    required this.onLightHomeWallpaperChanged,
    required this.onDarkHomeWallpaperChanged,
    this.stageOneRepository,
    this.stageTwoRepository,
    this.stageThreeRepository,
  });

  final ApiClient apiClient;
  final UserSession session;
  final Future<void> Function() onLogout;
  final ValueChanged<UserProfile> onProfileSaved;
  final ThemeMode themeMode;
  final Future<void> Function(ThemeMode mode) onThemeModeChanged;
  final LightHomeWallpaper lightHomeWallpaper;
  final DarkHomeWallpaper darkHomeWallpaper;
  final Future<void> Function(LightHomeWallpaper wallpaper)
  onLightHomeWallpaperChanged;
  final Future<void> Function(DarkHomeWallpaper wallpaper)
  onDarkHomeWallpaperChanged;
  final StageOneRepository? stageOneRepository;
  final StageTwoRepository? stageTwoRepository;
  final StageThreeRepository? stageThreeRepository;

  void _push(BuildContext context, WidgetBuilder builder) {
    Navigator.of(context).push<void>(MaterialPageRoute<void>(builder: builder));
  }

  void _openOrWarn(BuildContext context, String title, WidgetBuilder? builder) {
    if (builder == null) {
      AppToast.show(context, '$title is unavailable. Try again later.');
      return;
    }
    _push(context, builder);
  }

  Future<void> _confirmLogout(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Log out?'),
        content: const Text('You will need to sign in again to use the app.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Log out'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await onLogout();
    }
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final topInset = mq.padding.top + AppComponentTokens.appBarHeight;
    final isAdmin = session.isAdmin;
    final stageOne = stageOneRepository;
    final stageTwo = stageTwoRepository;
    final stageThree = stageThreeRepository;

    return Scaffold(
      backgroundColor: Colors.transparent,
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        elevation: AppElevation.level0,
        scrolledUnderElevation: AppElevation.level0,
        automaticallyImplyLeading: false,
        toolbarHeight: AppComponentTokens.appBarHeight,
        flexibleSpace: const GlassBarSurface(edge: GlassBarEdge.top),
        title: Text(isAdmin ? 'Admin' : 'Account'),
      ),
      body: ListView(
        padding: EdgeInsets.fromLTRB(
          AppSpacing.lg,
          topInset + AppSpacing.sm,
          AppSpacing.lg,
          mq.padding.bottom + AppSpacing.lg,
        ),
        children: [
          _ProfileHeaderCard(session: session),
          if (isAdmin) ...[
            const MenuSectionLabel('Management'),
            MenuGroup(
              children: [
                MenuTile(
                  icon: Icons.admin_panel_settings_outlined,
                  title: 'Admin Panel',
                  subtitle: 'Users, rota, breaks and settings',
                  onTap: () => _openOrWarn(
                    context,
                    'Admin Panel',
                    stageTwo == null || stageThree == null
                        ? null
                        : (_) => AdminShellScreen(
                            repository: stageTwo,
                            stageThreeRepository: stageThree,
                            session: session,
                          ),
                  ),
                ),
                MenuTile(
                  icon: Icons.build_circle_outlined,
                  title: 'VMU',
                  subtitle: 'Defects and tug PreChecks',
                  onTap: () => _openOrWarn(
                    context,
                    'VMU',
                    stageThree == null
                        ? null
                        : (_) => VmuShellScreen(
                            repository: stageThree,
                            session: session,
                          ),
                  ),
                ),
                MenuTile(
                  icon: Icons.local_shipping_outlined,
                  title: 'Transport Dashboard',
                  subtitle: 'Shifts and absences today',
                  onTap: () => _openOrWarn(
                    context,
                    'Transport Dashboard',
                    stageTwo == null
                        ? null
                        : (_) => TransportDashboardScreen(
                            repository: stageTwo,
                            session: session,
                          ),
                  ),
                ),
              ],
            ),
          ],
          const MenuSectionLabel('Settings'),
          MenuGroup(
            children: [
              MenuTile(
                icon: Icons.person_outline,
                title: 'Profile',
                subtitle: 'Name, shift and account details',
                onTap: () => _push(
                  context,
                  (_) => ProfileScreen(
                    apiClient: apiClient,
                    session: session,
                    onProfileSaved: onProfileSaved,
                    onLogout: onLogout,
                  ),
                ),
              ),
              MenuTile(
                icon: Icons.palette_outlined,
                title: 'Themes',
                subtitle: 'Light, dark and wallpapers',
                onTap: () => _push(
                  context,
                  (_) => ThemesScreen(
                    themeMode: themeMode,
                    onThemeModeChanged: onThemeModeChanged,
                    lightHomeWallpaper: lightHomeWallpaper,
                    darkHomeWallpaper: darkHomeWallpaper,
                    onLightHomeWallpaperChanged: onLightHomeWallpaperChanged,
                    onDarkHomeWallpaperChanged: onDarkHomeWallpaperChanged,
                  ),
                ),
              ),
              if (stageOne != null)
                MenuTile(
                  icon: Icons.menu_book_outlined,
                  title: 'Shunter Guide',
                  subtitle: 'Yard induction guide',
                  onTap: () => _push(
                    context,
                    (_) => InductionGuideScreen(repository: stageOne),
                  ),
                ),
              MenuTile(
                icon: Icons.info_outline,
                title: 'About',
                subtitle: 'Version, support and privacy',
                onTap: () => _push(context, (_) => const AboutScreen()),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          MenuGroup(
            children: [
              MenuTile(
                icon: Icons.logout,
                title: 'Log out',
                subtitle: 'End this session and return to sign in',
                isDestructive: true,
                onTap: () => _confirmLogout(context),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ProfileHeaderCard extends StatelessWidget {
  const _ProfileHeaderCard({required this.session});

  final UserSession session;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final textTheme = Theme.of(context).textTheme;
    final roleLabel = switch (session.role) {
      UserRole.admin => 'Admin',
      UserRole.vmu => 'VMU',
      UserRole.transportManager => 'Transport Manager',
      UserRole.user => 'Shunter',
    };
    return AppCard(
      surfaceOpacity: AppOpacity.subtle,
      child: Row(
        children: [
          IconBadge(
            icon: Icons.person_outline,
            foreground: colors.info,
            background: colors.infoBg,
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  session.displayName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: textTheme.titleMedium?.copyWith(
                    color: colors.textPrimary,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: AppSpacing.xxs),
                Text(
                  session.email.isEmpty
                      ? roleLabel
                      : '$roleLabel · ${session.email}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
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
