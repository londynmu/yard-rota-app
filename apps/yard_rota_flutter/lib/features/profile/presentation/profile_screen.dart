import 'package:flutter/material.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/theme_extensions.dart';
import 'themes_screen.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({
    super.key,
    required this.themeMode,
    required this.onThemeModeChanged,
  });

  final ThemeMode themeMode;
  final Future<void> Function(ThemeMode mode) onThemeModeChanged;

  static const List<_ProfileTileSpec> _tiles = [
    _ProfileTileSpec(
      title: 'Themes',
      icon: Icons.palette_outlined,
      isThemes: true,
    ),
    _ProfileTileSpec(
      title: 'Notifications',
      icon: Icons.notifications_none_outlined,
    ),
    _ProfileTileSpec(title: 'Privacy', icon: Icons.lock_outline),
    _ProfileTileSpec(title: 'Help', icon: Icons.help_outline),
    _ProfileTileSpec(title: 'About', icon: Icons.info_outline),
    _ProfileTileSpec(title: 'Account', icon: Icons.person_outline),
  ];

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return Scaffold(
      backgroundColor: colors.bgPrimary,
      appBar: AppBar(title: const Text('Profile')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: GridView.builder(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: AppSpacing.md,
              crossAxisSpacing: AppSpacing.md,
              childAspectRatio: 1.05,
            ),
            itemCount: _tiles.length,
            itemBuilder: (context, index) {
              final spec = _tiles[index];
              return _ProfileGridCard(
                spec: spec,
                onTap: () => _onTileTap(context, spec),
              );
            },
          ),
        ),
      ),
    );
  }

  Future<void> _onTileTap(BuildContext context, _ProfileTileSpec spec) async {
    if (spec.isThemes) {
      await Navigator.of(context).push<void>(
        MaterialPageRoute<void>(
          builder: (context) => ThemesScreen(
            themeMode: themeMode,
            onThemeModeChanged: onThemeModeChanged,
          ),
        ),
      );
      return;
    }
    if (!context.mounted) {
      return;
    }
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text('${spec.title} is coming soon.')));
  }
}

class _ProfileTileSpec {
  const _ProfileTileSpec({
    required this.title,
    required this.icon,
    this.isThemes = false,
  });

  final String title;
  final IconData icon;
  final bool isThemes;
}

class _ProfileGridCard extends StatelessWidget {
  const _ProfileGridCard({required this.spec, required this.onTap});

  final _ProfileTileSpec spec;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return Material(
      color: colors.bgElevated,
      borderRadius: BorderRadius.circular(AppRadius.lg),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadius.lg),
            border: Border.all(color: colors.borderDefault),
          ),
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(spec.icon, size: 32, color: colors.primary),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  spec.title,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    color: colors.textPrimary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
