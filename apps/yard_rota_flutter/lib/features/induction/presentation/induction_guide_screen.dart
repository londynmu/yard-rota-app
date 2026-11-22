import 'dart:ui';

import 'package:flutter/material.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/home_wallpaper.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_toast.dart';
import '../../home/data/stage_one_repository.dart';
import 'induction_markdown_body.dart';

/// Yard induction guide — newspaper-style article over the home wallpaper,
/// using the same calendar / breaks / info visual language.
class InductionGuideScreen extends StatefulWidget {
  const InductionGuideScreen({
    super.key,
    required this.repository,
    required this.lightHomeWallpaper,
    required this.darkHomeWallpaper,
  });

  final StageOneRepository repository;
  final LightHomeWallpaper lightHomeWallpaper;
  final DarkHomeWallpaper darkHomeWallpaper;

  @override
  State<InductionGuideScreen> createState() => _InductionGuideScreenState();
}

class _InductionGuideScreenState extends State<InductionGuideScreen> {
  List<InductionSection>? _sections;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final sections = await widget.repository.loadInductionSections();
      if (mounted) setState(() => _sections = sections);
    } catch (_) {
      if (!mounted) return;
      setState(() => _sections = const <InductionSection>[]);
      AppToast.error(context, 'The guide could not be loaded. Please retry.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final mq = MediaQuery.of(context);
    final topContentInset = mq.padding.top + kToolbarHeight;
    final wallpaperPath = homeBackgroundAssetPath(
      brightness: isDark ? Brightness.dark : Brightness.light,
      lightWallpaper: widget.lightHomeWallpaper,
      darkWallpaper: widget.darkHomeWallpaper,
    );
    final accent = AppAvailabilityTones.holiday(isDark: isDark);
    final sections = _sections;

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
        title: const Text('Shunter Guide'),
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
          Positioned.fill(
            child: Padding(
              padding: EdgeInsets.fromLTRB(
                AppSpacing.lg,
                topContentInset,
                AppSpacing.lg,
                mq.padding.bottom + AppSpacing.lg,
              ),
              child: sections == null
                  ? const Center(child: CircularProgressIndicator())
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        children: [
                          _Masthead(
                            accent: accent,
                            subtitle:
                                'Key safety rules and daily yard procedures for shunters.',
                          ),
                          const SizedBox(height: AppSpacing.lg),
                          if (sections.isEmpty)
                            _EmptyCopy(colors: colors)
                          else
                            for (var i = 0; i < sections.length; i++) ...[
                              if (i > 0) ...[
                                const SizedBox(height: AppSpacing.md),
                                Divider(
                                  height: 1,
                                  thickness: AppStroke.hairline,
                                  color: accent.withValues(
                                    alpha: isDark ? 0.35 : 0.28,
                                  ),
                                ),
                                const SizedBox(height: AppSpacing.md),
                              ],
                              _ArticleSection(
                                section: sections[i],
                                accent: accent,
                              ),
                            ],
                          const SizedBox(height: AppSpacing.xl),
                        ],
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Newspaper masthead — title band, not a stretched card.
class _Masthead extends StatelessWidget {
  const _Masthead({required this.accent, required this.subtitle});

  final Color accent;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final titleFg = Color.alphaBlend(
      accent.withValues(alpha: isDark ? 0.45 : 0.35),
      colors.textPrimary,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'SHUNTER GUIDE',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w600,
            letterSpacing: 1.4,
            color: titleFg,
            height: 1.2,
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        Divider(
          height: 1,
          thickness: AppStroke.medium,
          color: accent.withValues(alpha: isDark ? 0.45 : 0.35),
        ),
        const SizedBox(height: AppSpacing.xxs),
        Divider(
          height: 1,
          thickness: AppStroke.hairline,
          color: accent.withValues(alpha: isDark ? 0.28 : 0.22),
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          subtitle,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: colors.textSecondary,
            fontWeight: FontWeight.w400,
            height: 1.4,
          ),
        ),
      ],
    );
  }
}

class _EmptyCopy extends StatelessWidget {
  const _EmptyCopy({required this.colors});

  final AppColorsScheme colors;

  @override
  Widget build(BuildContext context) {
    return Text(
      'Content is being prepared. Check back soon.',
      textAlign: TextAlign.center,
      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
        color: colors.textSecondary,
        fontWeight: FontWeight.w400,
      ),
    );
  }
}

/// One article section — headline + body, no full-bleed card stretch.
class _ArticleSection extends StatelessWidget {
  const _ArticleSection({
    required this.section,
    required this.accent,
  });

  final InductionSection section;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final titleFg = Color.alphaBlend(
      accent.withValues(alpha: isDark ? 0.4 : 0.3),
      colors.textPrimary,
    );
    // Soft paper wash so wallpaper shows through — not opaque AppCard slabs.
    final paper = Color.alphaBlend(
      colors.bgElevated.withValues(alpha: isDark ? 0.55 : 0.72),
      Colors.transparent,
    );

    return DecoratedBox(
      decoration: BoxDecoration(
        color: paper,
        borderRadius: BorderRadius.circular(AppRadius.sm),
        border: Border.all(
          color: accent.withValues(alpha: isDark ? 0.22 : 0.16),
          width: AppStroke.hairline,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.md,
          AppSpacing.sm,
          AppSpacing.md,
          AppSpacing.md,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              section.title,
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w600,
                color: titleFg,
                height: 1.25,
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            Container(
              height: AppStroke.hairline,
              color: accent.withValues(alpha: isDark ? 0.28 : 0.2),
            ),
            const SizedBox(height: AppSpacing.sm),
            InductionMarkdownBody(
              markdown: section.body,
              textStyle: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: colors.textPrimary,
                fontWeight: FontWeight.w400,
                height: 1.45,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
