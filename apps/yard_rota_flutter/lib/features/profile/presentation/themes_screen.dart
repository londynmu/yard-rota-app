import 'package:flutter/material.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/home_wallpaper.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/app_toast.dart';
import '../../../core/ui/glass_bar_surface.dart';
import 'account_layout.dart';

/// Theme mode (light / dark / system) and per-theme home backgrounds.
class ThemesScreen extends StatefulWidget {
  const ThemesScreen({
    super.key,
    required this.themeMode,
    required this.onThemeModeChanged,
    required this.lightHomeWallpaper,
    required this.darkHomeWallpaper,
    required this.onLightHomeWallpaperChanged,
    required this.onDarkHomeWallpaperChanged,
  });

  final ThemeMode themeMode;
  final Future<void> Function(ThemeMode mode) onThemeModeChanged;
  final LightHomeWallpaper lightHomeWallpaper;
  final DarkHomeWallpaper darkHomeWallpaper;
  final Future<void> Function(LightHomeWallpaper wallpaper)
  onLightHomeWallpaperChanged;
  final Future<void> Function(DarkHomeWallpaper wallpaper)
  onDarkHomeWallpaperChanged;

  static const List<LightHomeWallpaper> _lightOptions =
      LightHomeWallpaper.values;

  static const List<DarkHomeWallpaper> _darkOptions = DarkHomeWallpaper.values;

  @override
  State<ThemesScreen> createState() => _ThemesScreenState();
}

class _ThemesScreenState extends State<ThemesScreen> {
  late ThemeMode _selectedThemeMode;
  late LightHomeWallpaper _selectedLight;
  late DarkHomeWallpaper _selectedDark;

  static const Duration _wallpaperToastDuration = Duration(seconds: 2);

  @override
  void initState() {
    super.initState();
    _selectedThemeMode = widget.themeMode;
    _selectedLight = widget.lightHomeWallpaper;
    _selectedDark = widget.darkHomeWallpaper;
  }

  @override
  void didUpdateWidget(ThemesScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.themeMode != oldWidget.themeMode) {
      setState(() => _selectedThemeMode = widget.themeMode);
    }
    if (widget.lightHomeWallpaper != oldWidget.lightHomeWallpaper) {
      setState(() => _selectedLight = widget.lightHomeWallpaper);
    }
    if (widget.darkHomeWallpaper != oldWidget.darkHomeWallpaper) {
      setState(() => _selectedDark = widget.darkHomeWallpaper);
    }
  }

  Future<void> _onLightWallpaperTap(LightHomeWallpaper value) async {
    if (_selectedLight == value) {
      return;
    }
    setState(() => _selectedLight = value);
    try {
      await widget.onLightHomeWallpaperChanged(value);
      if (!mounted) {
        return;
      }
      AppToast.success(
        context,
        'Wallpaper changed.',
        duration: _wallpaperToastDuration,
      );
    } catch (_) {
      if (!mounted) {
        return;
      }
      setState(() => _selectedLight = widget.lightHomeWallpaper);
      AppToast.error(
        context,
        'Could not save wallpaper. Try again.',
        duration: _wallpaperToastDuration,
      );
    }
  }

  Future<void> _onDarkWallpaperTap(DarkHomeWallpaper value) async {
    if (_selectedDark == value) {
      return;
    }
    setState(() => _selectedDark = value);
    try {
      await widget.onDarkHomeWallpaperChanged(value);
      if (!mounted) {
        return;
      }
      AppToast.success(
        context,
        'Wallpaper changed.',
        duration: _wallpaperToastDuration,
      );
    } catch (_) {
      if (!mounted) {
        return;
      }
      setState(() => _selectedDark = widget.darkHomeWallpaper);
      AppToast.error(
        context,
        'Could not save wallpaper. Try again.',
        duration: _wallpaperToastDuration,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final showDarkWallpapers = isDark;
    final mq = MediaQuery.of(context);
    final topContentInset =
        mq.padding.top + AppComponentTokens.appBarHeight + AppSpacing.md;
    final wallpaperPath = homeBackgroundAssetPath(
      brightness: isDark ? Brightness.dark : Brightness.light,
      lightWallpaper: _selectedLight,
      darkWallpaper: _selectedDark,
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
          'Themes',
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
              key: ValueKey<String>(wallpaperPath),
              fit: BoxFit.cover,
              alignment: Alignment.center,
              gaplessPlayback: true,
            ),
          ),
          Padding(
            padding: EdgeInsets.fromLTRB(
              AppSpacing.lg,
              topContentInset,
              AppSpacing.lg,
              mq.padding.bottom + AppSpacing.lg,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                AppCard(
                  surfaceOpacity: AppOpacity.subtle,
                  padding: const EdgeInsets.all(AppSpacing.md),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'Appearance',
                        style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                          color: colors.textPrimary,
                        ),
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      _ThemesModeSegmentedBar(
                        selected: _selectedThemeMode,
                        onSelect: (ThemeMode mode) async {
                          setState(() => _selectedThemeMode = mode);
                          try {
                            await widget.onThemeModeChanged(mode);
                          } catch (_) {
                            if (!context.mounted) {
                              return;
                            }
                            setState(
                              () => _selectedThemeMode = widget.themeMode,
                            );
                            AppToast.error(
                              context,
                              'Could not save theme. Try again.',
                              duration: _wallpaperToastDuration,
                            );
                          }
                        },
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                AppCard(
                  surfaceOpacity: AppOpacity.subtle,
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.md,
                    AppSpacing.md,
                    AppSpacing.md,
                    AppSpacing.sm,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'Home background',
                        style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                          color: colors.textPrimary,
                        ),
                      ),
                      const SizedBox(height: AppSpacing.xs),
                      Text(
                        'Tap a wallpaper to apply it. Swipe to browse.',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: colors.textSecondary,
                          height: 1.3,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.sm),
                Expanded(
                  child: showDarkWallpapers
                      ? _HomeWallpaperCarousel<DarkHomeWallpaper>(
                          key: const ValueKey('wallpaper_dark'),
                          options: ThemesScreen._darkOptions,
                          selected: _selectedDark,
                          assetPath: (w) => w.assetPath,
                          label: (w) => w.displayLabel,
                          onCommitSelection: _onDarkWallpaperTap,
                        )
                      : _HomeWallpaperCarousel<LightHomeWallpaper>(
                          key: const ValueKey('wallpaper_light'),
                          options: ThemesScreen._lightOptions,
                          selected: _selectedLight,
                          assetPath: (w) => w.assetPath,
                          label: (w) => w.displayLabel,
                          onCommitSelection: _onLightWallpaperTap,
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

/// Slim pill theme-mode selector (Light / Dark / System).
class _ThemesModeSegmentedBar extends StatelessWidget {
  const _ThemesModeSegmentedBar({
    required this.selected,
    required this.onSelect,
  });

  final ThemeMode selected;
  final Future<void> Function(ThemeMode mode) onSelect;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;

    Widget segment(ThemeMode mode) {
      final isSelected = selected == mode;
      final (IconData icon, String label) = switch (mode) {
        ThemeMode.light => (Icons.light_mode_outlined, 'Light'),
        ThemeMode.dark => (Icons.dark_mode_outlined, 'Dark'),
        ThemeMode.system => (Icons.brightness_auto_outlined, 'System'),
      };

      return Expanded(
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            customBorder: const StadiumBorder(),
            onTap: () => onSelect(mode),
            child: AnimatedContainer(
              duration: AppMotion.fast,
              curve: AppMotion.emphasized,
              decoration: BoxDecoration(
                color: isSelected
                    ? colors.bgElevated.withValues(alpha: 0.92)
                    : Colors.transparent,
                borderRadius: BorderRadius.circular(AppRadius.full),
              ),
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
              child: Center(
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      icon,
                      size: AppHomeTabs.segmentIconSize,
                      color: isSelected
                          ? colors.textPrimary
                          : colors.textSecondary,
                    ),
                    const SizedBox(width: AppSpacing.xxs),
                    Flexible(
                      child: Text(
                        label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.labelMedium
                            ?.copyWith(
                              fontWeight: isSelected
                                  ? FontWeight.w600
                                  : FontWeight.w500,
                              color: isSelected
                                  ? colors.textPrimary
                                  : colors.textSecondary,
                            ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    }

    return Semantics(
      label: 'Theme appearance',
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.bgPrimary.withValues(alpha: 0.28),
          borderRadius: BorderRadius.circular(AppRadius.full),
          border: Border.all(
            color: colors.borderDefault.withValues(alpha: 0.45),
            width: AppStroke.thin,
          ),
        ),
        child: SizedBox(
          height: AppHomeTabs.segmentHeight,
          child: Padding(
            padding: const EdgeInsets.all(AppHomeTabs.trackPadding),
            child: Row(
              children: [
                segment(ThemeMode.light),
                segment(ThemeMode.dark),
                segment(ThemeMode.system),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Material 3 carousel — uncontained layout with snapping.
class _HomeWallpaperCarousel<T> extends StatefulWidget {
  const _HomeWallpaperCarousel({
    super.key,
    required this.options,
    required this.selected,
    required this.assetPath,
    required this.label,
    required this.onCommitSelection,
  });

  final List<T> options;
  final T selected;
  final String Function(T) assetPath;
  final String Function(T) label;
  final Future<void> Function(T value) onCommitSelection;

  @override
  State<_HomeWallpaperCarousel<T>> createState() =>
      _HomeWallpaperCarouselState<T>();
}

class _HomeWallpaperCarouselState<T> extends State<_HomeWallpaperCarousel<T>> {
  static const double _itemWidthFraction = 0.5;

  late final CarouselController _carouselController;

  int _indexOfSelected() {
    final i = widget.options.indexOf(widget.selected);
    if (i < 0) {
      return 0;
    }
    return i;
  }

  @override
  void initState() {
    super.initState();
    _carouselController = CarouselController(initialItem: _indexOfSelected());
  }

  @override
  void didUpdateWidget(covariant _HomeWallpaperCarousel<T> oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.selected != oldWidget.selected) {
      final next = _indexOfSelected();
      WidgetsBinding.instance.addPostFrameCallback((_) async {
        if (!mounted) {
          return;
        }
        if (_carouselController.hasClients) {
          // Instant jump — honors Reduce Motion / disabled animations.
          await _carouselController.animateToItem(
            next,
            duration: Duration.zero,
            curve: Curves.linear,
          );
        }
      });
    }
  }

  @override
  void dispose() {
    _carouselController.dispose();
    super.dispose();
  }

  void _onWallpaperTapped(int i) {
    widget.onCommitSelection(widget.options[i]);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final m3Shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(AppRadius.lg),
    );

    return Semantics(
      label: 'Home wallpapers',
      hint: 'Tap a wallpaper to select it. Swipe to browse.',
      child: LayoutBuilder(
        builder: (context, constraints) {
          final maxW = constraints.maxWidth;
          // Wide: grid of wallpapers instead of a stretched carousel.
          if (accountIsWideLayout(context) && maxW >= 520) {
            return GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: widget.options.length,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                mainAxisSpacing: AppSpacing.sm,
                crossAxisSpacing: AppSpacing.sm,
                childAspectRatio: 0.85,
              ),
              itemBuilder: (context, i) {
                return Material(
                  color: Colors.transparent,
                  child: InkWell(
                    onTap: () => _onWallpaperTapped(i),
                    borderRadius: BorderRadius.circular(AppRadius.lg),
                    child: _WallpaperCarouselItem(
                      assetPath: widget.assetPath(widget.options[i]),
                      label: widget.label(widget.options[i]),
                      selected: widget.options[i] == widget.selected,
                    ),
                  ),
                );
              },
            );
          }

          final itemExtent = (maxW * _itemWidthFraction).clamp(100.0, maxW);

          return CarouselView(
            controller: _carouselController,
            itemExtent: itemExtent,
            itemSnapping: true,
            shape: m3Shape,
            backgroundColor: colors.bgElevated,
            elevation: AppElevation.level1,
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.xs,
              vertical: AppSpacing.sm,
            ),
            onTap: _onWallpaperTapped,
            children: <Widget>[
              for (int i = 0; i < widget.options.length; i++)
                _WallpaperCarouselItem(
                  assetPath: widget.assetPath(widget.options[i]),
                  label: widget.label(widget.options[i]),
                  selected: widget.options[i] == widget.selected,
                ),
            ],
          );
        },
      ),
    );
  }
}

class _WallpaperCarouselItem extends StatelessWidget {
  const _WallpaperCarouselItem({
    required this.assetPath,
    required this.label,
    required this.selected,
  });

  final String assetPath;
  final String label;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final borderColor = selected ? colors.primary : colors.borderDefault;
    final borderWidth = selected ? AppStroke.medium : AppStroke.thin;

    return Semantics(
      label: '$label home background',
      selected: selected,
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xs),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(AppRadius.md),
                  border: Border.all(color: borderColor, width: borderWidth),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(AppRadius.md - 1),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      Image.asset(
                        assetPath,
                        fit: BoxFit.cover,
                        gaplessPlayback: true,
                      ),
                      if (selected)
                        Align(
                          alignment: Alignment.topRight,
                          child: Padding(
                            padding: const EdgeInsets.all(AppSpacing.xs),
                            child: Icon(
                              Icons.check_circle,
                              size: 22,
                              color: colors.primary,
                              shadows: const [
                                Shadow(
                                  color: AppPrimitives.white40,
                                  blurRadius: 4,
                                ),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              label,
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.labelLarge?.copyWith(
                color: selected ? colors.primary : colors.textPrimary,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
