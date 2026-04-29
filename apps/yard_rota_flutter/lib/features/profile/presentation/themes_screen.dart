import 'dart:ui';

import 'package:flutter/material.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/home_wallpaper.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_toast.dart';

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
      AppToast.show(
        context,
        'Wallpaper changed.',
        duration: _wallpaperToastDuration,
      );
    } catch (_) {
      if (!mounted) {
        return;
      }
      setState(() => _selectedLight = widget.lightHomeWallpaper);
      AppToast.show(
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
      AppToast.show(
        context,
        'Wallpaper changed.',
        duration: _wallpaperToastDuration,
      );
    } catch (_) {
      if (!mounted) {
        return;
      }
      setState(() => _selectedDark = widget.darkHomeWallpaper);
      AppToast.show(
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
    final topContentInset = mq.padding.top + kToolbarHeight;
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
        title: const Text('Themes'),
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
                _ThemesModeM3SegmentedBar(
                  selected: _selectedThemeMode,
                  onSelect: (ThemeMode mode) async {
                    setState(() => _selectedThemeMode = mode);
                    try {
                      await widget.onThemeModeChanged(mode);
                    } catch (_) {
                      if (!context.mounted) {
                        return;
                      }
                      setState(() => _selectedThemeMode = widget.themeMode);
                      AppToast.show(
                        context,
                        'Could not save theme. Try again.',
                        duration: _wallpaperToastDuration,
                      );
                    }
                  },
                ),
                const SizedBox(height: AppSpacing.xl),
                Text(
                  'Home background',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: colors.textPrimary,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  'Tap a wallpaper to apply it. Swipe the carousel to browse.',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: colors.textSecondary,
                    height: 1.3,
                  ),
                ),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  showDarkWallpapers ? 'Dark theme' : 'Light theme',
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    color: colors.textPrimary,
                    fontWeight: FontWeight.w600,
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

/// M3 baseline segmented control; dimensions from [AppM3SegmentedButton] / [AppOpacity].
class _ThemesModeM3SegmentedBar extends StatelessWidget {
  const _ThemesModeM3SegmentedBar({
    required this.selected,
    required this.onSelect,
  });

  final ThemeMode selected;
  final Future<void> Function(ThemeMode mode) onSelect;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final textStyle = Theme.of(context).textTheme.labelLarge;
    final r = AppM3SegmentedButton.slotCornerRadius;
    final tight = r * AppM3SegmentedButton.slotAdjacentCornerTightRatio;
    final mid = r * AppM3SegmentedButton.slotMiddleCornerRatio;

    Widget segment(int index, ThemeMode mode) {
      final isSelected = selected == mode;
      final (IconData icon, String label) = switch (mode) {
        ThemeMode.light => (Icons.light_mode_outlined, 'Light'),
        ThemeMode.dark => (Icons.dark_mode_outlined, 'Dark'),
        ThemeMode.system => (Icons.brightness_auto_outlined, 'System'),
      };

      BorderRadius slotRadius() {
        if (!isSelected) {
          return BorderRadius.circular(r);
        }
        if (index == 0) {
          return BorderRadius.horizontal(
            left: Radius.circular(r),
            right: Radius.circular(tight),
          );
        }
        if (index == 2) {
          return BorderRadius.horizontal(
            left: Radius.circular(tight),
            right: Radius.circular(r),
          );
        }
        return BorderRadius.circular(mid);
      }

      return Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () => onSelect(mode),
          borderRadius: slotRadius(),
          child: AnimatedContainer(
            duration: AppMotion.normal,
            curve: AppMotion.emphasized,
            decoration: BoxDecoration(
              color: isSelected ? colors.bgElevated : Colors.transparent,
              borderRadius: slotRadius(),
              border: isSelected
                  ? Border.all(
                      color: colors.borderStrong,
                      width: AppStroke.medium,
                    )
                  : null,
              boxShadow: isSelected
                  ? [
                      BoxShadow(
                        color: colors.shadow.withValues(
                          alpha: AppM3SegmentedButton.selectedShadowAlpha,
                        ),
                        blurRadius: AppM3SegmentedButton.selectedShadowBlur,
                        offset: Offset(
                          0,
                          AppM3SegmentedButton.selectedShadowOffsetY,
                        ),
                      ),
                    ]
                  : null,
            ),
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
            child: Center(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    icon,
                    size: AppM3SegmentedButton.iconSize,
                    color: isSelected
                        ? colors.textPrimary
                        : colors.textSecondary,
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Flexible(
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: textStyle?.copyWith(
                        fontWeight:
                            isSelected ? FontWeight.w700 : FontWeight.w500,
                        color: isSelected
                            ? colors.textPrimary
                            : colors.textSecondary,
                      ),
                    ),
                  ),
                  if (isSelected) ...[
                    const SizedBox(width: AppSpacing.xs),
                    Icon(
                      Icons.check,
                      size: AppM3SegmentedButton.selectionCheckIconSize,
                      color: colors.textPrimary,
                    ),
                  ],
                ],
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
          color: colors.bgPrimary.withValues(
            alpha: AppOpacity.segmentedTrackFill,
          ),
          borderRadius: BorderRadius.circular(
            AppM3SegmentedButton.trackCornerRadius,
          ),
          border: Border.all(color: colors.borderDefault),
        ),
        child: SizedBox(
          height: AppM3SegmentedButton.trackHeight,
          child: Padding(
            padding: const EdgeInsets.all(AppM3SegmentedButton.trackPadding),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(child: segment(0, ThemeMode.light)),
                VerticalDivider(
                  width: 1,
                  thickness: 1,
                  color: colors.divider,
                ),
                Expanded(child: segment(1, ThemeMode.dark)),
                VerticalDivider(
                  width: 1,
                  thickness: 1,
                  color: colors.divider,
                ),
                Expanded(child: segment(2, ThemeMode.system)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Material 3 carousel ([CarouselView]) — uncontained layout with snapping.
/// Matches the M3 Design Kit carousel patterns (see Figma M3 kit, Carousel).
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
  /// Smaller carousel tiles (fraction of viewport width); swipe only browses.
  static const double _itemWidthFraction = 0.5;

  /// Corner radius scaled down with smaller tiles (M3-style rounded card).
  static const double _m3CarouselRadius = 20;

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
      borderRadius: BorderRadius.circular(_m3CarouselRadius),
    );

    return Semantics(
      label: 'Home wallpapers',
      hint: 'Tap a wallpaper to select it. Swipe to browse.',
      child: LayoutBuilder(
        builder: (context, constraints) {
          final maxW = constraints.maxWidth;
          final itemExtent = (maxW * _itemWidthFraction).clamp(100.0, maxW);

          // `CarouselView.builder` does not wrap items with tap handling; `onTap` only
          // applies when using `children:` (see Flutter _buildCarouselItem).
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
                _WallpaperM3CarouselItem(
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

/// Inner content for one carousel slot; [CarouselView] supplies the outer [Material] / shape.
class _WallpaperM3CarouselItem extends StatelessWidget {
  const _WallpaperM3CarouselItem({
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
    final borderWidth = selected ? 2.0 : 1.0;

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
                        DecoratedBox(
                          decoration: BoxDecoration(
                            border: Border.all(
                              color: colors.primary.withValues(alpha: 0.35),
                              width: 2,
                            ),
                          ),
                        ),
                      if (selected)
                        Align(
                          alignment: Alignment.topRight,
                          child: Padding(
                            padding: const EdgeInsets.all(AppSpacing.xs),
                            child: Icon(
                              Icons.check_circle,
                              size: 26,
                              color: colors.primary,
                              shadows: const [
                                Shadow(
                                  color: Color(0x66FFFFFF),
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
