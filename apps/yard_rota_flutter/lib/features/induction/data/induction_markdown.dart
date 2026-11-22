// Lightweight induction-guide markdown (same subset as the web guide).
// Supports paragraphs, lists, rules, images, emphasis, and ::color-* tokens.

enum InductionInlineKind { text, bold, italic, boldItalic, color }

class InductionInlineSpan {
  const InductionInlineSpan({
    required this.kind,
    required this.text,
    this.colorToken,
    this.children = const <InductionInlineSpan>[],
  });

  final InductionInlineKind kind;
  final String text;
  final String? colorToken;
  final List<InductionInlineSpan> children;

  bool get hasChildren => children.isNotEmpty;
}

sealed class InductionBlock {
  const InductionBlock();
}

class InductionParagraphBlock extends InductionBlock {
  const InductionParagraphBlock(this.spans);
  final List<InductionInlineSpan> spans;
}

class InductionListBlock extends InductionBlock {
  const InductionListBlock(this.items);
  final List<List<InductionInlineSpan>> items;
}

class InductionImageBlock extends InductionBlock {
  const InductionImageBlock({required this.alt, required this.url});
  final String alt;
  final String url;
}

class InductionRuleBlock extends InductionBlock {
  const InductionRuleBlock();
}

final _imagePattern = RegExp(r'!\[([^\]]*)\]\(([^)\s]+)\)');
final _colorPattern = RegExp(r'::color-(info|warning|danger|success)\[([^\]]*)\]');
final _listItemPattern = RegExp(r'^\s*[-*]\s+(.*)$');
final _rulePattern = RegExp(r'^\s*-{3,}\s*$');

/// Parse guide markdown into ordered display blocks.
List<InductionBlock> parseInductionMarkdown(String raw) {
  final normalized = raw.replaceAll('\r\n', '\n').trim();
  if (normalized.isEmpty) return const <InductionBlock>[];

  final blocks = <InductionBlock>[];
  final lines = normalized.split('\n');
  var index = 0;

  while (index < lines.length) {
    final line = lines[index];
    final trimmed = line.trim();

    if (trimmed.isEmpty) {
      index += 1;
      continue;
    }

    final imageMatch = _imagePattern.firstMatch(trimmed);
    if (imageMatch != null &&
        trimmed.replaceFirst(imageMatch.group(0)!, '').trim().isEmpty) {
      blocks.add(
        InductionImageBlock(
          alt: imageMatch.group(1) ?? '',
          url: imageMatch.group(2) ?? '',
        ),
      );
      index += 1;
      continue;
    }

    if (_rulePattern.hasMatch(trimmed)) {
      blocks.add(const InductionRuleBlock());
      index += 1;
      continue;
    }

    final listMatch = _listItemPattern.firstMatch(line);
    if (listMatch != null) {
      final items = <List<InductionInlineSpan>>[];
      while (index < lines.length) {
        final itemMatch = _listItemPattern.firstMatch(lines[index]);
        if (itemMatch == null) break;
        items.add(parseInductionInline(itemMatch.group(1) ?? ''));
        index += 1;
      }
      blocks.add(InductionListBlock(items));
      continue;
    }

    final paragraphLines = <String>[];
    while (index < lines.length) {
      final current = lines[index];
      final currentTrimmed = current.trim();
      if (currentTrimmed.isEmpty) break;
      if (_rulePattern.hasMatch(currentTrimmed)) break;
      if (_listItemPattern.hasMatch(current)) break;
      final soloImage = _imagePattern.firstMatch(currentTrimmed);
      if (soloImage != null &&
          currentTrimmed.replaceFirst(soloImage.group(0)!, '').trim().isEmpty) {
        break;
      }
      paragraphLines.add(current);
      index += 1;
    }
    if (paragraphLines.isNotEmpty) {
      blocks.add(
        InductionParagraphBlock(
          parseInductionInline(paragraphLines.join(' ').trim()),
        ),
      );
    }
  }

  return blocks;
}

/// Parse inline markdown + color tokens into a span tree.
List<InductionInlineSpan> parseInductionInline(String raw) {
  if (raw.isEmpty) return const <InductionInlineSpan>[];
  return _parseInline(raw, allowEmphasis: true);
}

List<InductionInlineSpan> _parseInline(
  String raw, {
  required bool allowEmphasis,
}) {
  if (raw.isEmpty) return const <InductionInlineSpan>[];

  final spans = <InductionInlineSpan>[];
  var cursor = 0;

  while (cursor < raw.length) {
    final nextColor = _colorPattern.firstMatch(raw.substring(cursor));
    final colorStart =
        nextColor == null ? -1 : cursor + nextColor.start;

    int emphasisStart = -1;
    String? emphasisMarker;
    if (allowEmphasis) {
      final triple = raw.indexOf('***', cursor);
      final bold = raw.indexOf('**', cursor);
      final italic = _nextSingleAsterisk(raw, cursor);

      final candidates = <(int, String)>[
        if (triple >= 0) (triple, '***'),
        if (bold >= 0 && (triple < 0 || bold < triple || bold > triple + 2))
          (bold, '**'),
        if (italic >= 0) (italic, '*'),
      ]..sort((a, b) => a.$1.compareTo(b.$1));

      if (candidates.isNotEmpty) {
        emphasisStart = candidates.first.$1;
        emphasisMarker = candidates.first.$2;
      }
    }

    final nextSpecial = _minPositive(colorStart, emphasisStart);
    if (nextSpecial < 0) {
      spans.add(
        InductionInlineSpan(
          kind: InductionInlineKind.text,
          text: raw.substring(cursor),
        ),
      );
      break;
    }

    if (nextSpecial > cursor) {
      spans.add(
        InductionInlineSpan(
          kind: InductionInlineKind.text,
          text: raw.substring(cursor, nextSpecial),
        ),
      );
    }

    if (colorStart == nextSpecial && nextColor != null) {
      final token = nextColor.group(1)!;
      final content = nextColor.group(2) ?? '';
      spans.add(
        InductionInlineSpan(
          kind: InductionInlineKind.color,
          text: content,
          colorToken: token,
          children: _parseInline(content, allowEmphasis: true),
        ),
      );
      cursor = colorStart + nextColor.group(0)!.length;
      continue;
    }

    final marker = emphasisMarker!;
    final close = raw.indexOf(marker, nextSpecial + marker.length);
    if (close < 0) {
      spans.add(
        InductionInlineSpan(
          kind: InductionInlineKind.text,
          text: raw.substring(nextSpecial, nextSpecial + marker.length),
        ),
      );
      cursor = nextSpecial + marker.length;
      continue;
    }

    final inner = raw.substring(nextSpecial + marker.length, close);
    final kind = switch (marker) {
      '***' => InductionInlineKind.boldItalic,
      '**' => InductionInlineKind.bold,
      _ => InductionInlineKind.italic,
    };
    spans.add(
      InductionInlineSpan(
        kind: kind,
        text: inner,
        children: _parseInline(inner, allowEmphasis: marker != '*'),
      ),
    );
    cursor = close + marker.length;
  }

  return spans;
}

int _nextSingleAsterisk(String raw, int from) {
  var i = from;
  while (i < raw.length) {
    if (raw[i] != '*') {
      i += 1;
      continue;
    }
    final run = _asteriskRunLength(raw, i);
    if (run == 1) return i;
    i += run;
  }
  return -1;
}

int _asteriskRunLength(String raw, int start) {
  var end = start;
  while (end < raw.length && raw[end] == '*') {
    end += 1;
  }
  return end - start;
}

int _minPositive(int a, int b) {
  if (a < 0) return b;
  if (b < 0) return a;
  return a < b ? a : b;
}
