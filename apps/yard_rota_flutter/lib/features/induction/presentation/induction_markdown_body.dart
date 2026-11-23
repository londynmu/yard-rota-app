import 'package:flutter/material.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/theme_extensions.dart';
import '../data/induction_markdown.dart';

/// Renders induction guide markdown: images, lists, and soft `::color-*` accents.
class InductionMarkdownBody extends StatelessWidget {
  const InductionMarkdownBody({
    super.key,
    required this.markdown,
    this.textStyle,
  });

  final String markdown;
  final TextStyle? textStyle;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final baseStyle =
        textStyle ??
        Theme.of(context).textTheme.bodyMedium?.copyWith(
          color: colors.textPrimary,
          fontWeight: FontWeight.w400,
          height: 1.45,
        );
    final blocks = parseInductionMarkdown(markdown);
    if (blocks.isEmpty) {
      return const SizedBox.shrink();
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < blocks.length; i++) ...[
          if (i > 0) const SizedBox(height: AppSpacing.sm),
          _buildBlock(context, blocks[i], baseStyle, isDark, colors),
        ],
      ],
    );
  }

  Widget _buildBlock(
    BuildContext context,
    InductionBlock block,
    TextStyle? baseStyle,
    bool isDark,
    AppColorsScheme colors,
  ) {
    return switch (block) {
      InductionParagraphBlock(:final spans) => Text.rich(
        TextSpan(children: _toTextSpans(spans, baseStyle, isDark)),
        textAlign: TextAlign.start,
      ),
      InductionListBlock(:final items) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var i = 0; i < items.length; i++) ...[
            if (i > 0) const SizedBox(height: AppSpacing.xs),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('•  ', style: baseStyle),
                Expanded(
                  child: Text.rich(
                    TextSpan(
                      children: _toTextSpans(items[i], baseStyle, isDark),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
      InductionImageBlock(:final alt, :final url) => _GuideNetworkImage(
        url: url,
        alt: alt,
        isDark: isDark,
        colors: colors,
      ),
      InductionRuleBlock() => Divider(
        height: AppSpacing.lg,
        thickness: AppStroke.hairline,
        color: colors.borderDefault,
      ),
    };
  }

  List<InlineSpan> _toTextSpans(
    List<InductionInlineSpan> spans,
    TextStyle? base,
    bool isDark,
  ) {
    final out = <InlineSpan>[];
    for (final span in spans) {
      out.addAll(_spanToInline(span, base, isDark));
    }
    return out;
  }

  List<InlineSpan> _spanToInline(
    InductionInlineSpan span,
    TextStyle? base,
    bool isDark,
  ) {
    switch (span.kind) {
      case InductionInlineKind.text:
        if (span.text.isEmpty) return const <InlineSpan>[];
        return [TextSpan(text: span.text, style: base)];
      case InductionInlineKind.bold:
      case InductionInlineKind.italic:
      case InductionInlineKind.boldItalic:
        final styled = (base ?? const TextStyle()).copyWith(
          fontWeight:
              span.kind == InductionInlineKind.italic
                  ? base?.fontWeight
                  : FontWeight.w600,
          fontStyle:
              span.kind == InductionInlineKind.bold
                  ? base?.fontStyle
                  : FontStyle.italic,
        );
        if (span.hasChildren) {
          return [
            TextSpan(
              style: styled,
              children: _toTextSpans(span.children, styled, isDark),
            ),
          ];
        }
        return [TextSpan(text: span.text, style: styled)];
      case InductionInlineKind.color:
        final accent =
            AppGuideProseTones.resolve(span.colorToken ?? '', isDark: isDark);
        final colored = (base ?? const TextStyle()).copyWith(
          color: accent ?? base?.color,
          fontWeight: FontWeight.w600,
        );
        if (span.hasChildren) {
          return [
            TextSpan(
              style: colored,
              children: _toTextSpans(span.children, colored, isDark),
            ),
          ];
        }
        return [TextSpan(text: span.text, style: colored)];
    }
  }
}

class _GuideNetworkImage extends StatelessWidget {
  const _GuideNetworkImage({
    required this.url,
    required this.alt,
    required this.isDark,
    required this.colors,
  });

  final String url;
  final String alt;
  final bool isDark;
  final AppColorsScheme colors;

  @override
  Widget build(BuildContext context) {
    if (url.isEmpty || !(url.startsWith('https://') || url.startsWith('http://'))) {
      return const SizedBox.shrink();
    }

    return ClipRRect(
      borderRadius: BorderRadius.circular(AppRadius.md),
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border.all(
            color: colors.borderSubtle,
            width: AppStroke.hairline,
          ),
          borderRadius: BorderRadius.circular(AppRadius.md),
        ),
        child: Image.network(
          url,
          fit: BoxFit.contain,
          width: double.infinity,
          filterQuality: FilterQuality.medium,
          loadingBuilder: (context, child, progress) {
            if (progress == null) return child;
            return SizedBox(
              height: 160,
              child: Center(
                child: SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: colors.textTertiary,
                  ),
                ),
              ),
            );
          },
          errorBuilder: (_, _, _) => Container(
            height: 120,
            alignment: Alignment.center,
            color: isDark
                ? colors.bgTertiary.withValues(alpha: 0.5)
                : colors.bgSecondary,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.broken_image_outlined,
                  color: colors.textTertiary,
                ),
                if (alt.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    alt,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: colors.textSecondary,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
