import 'package:flutter_test/flutter_test.dart';
import 'package:yard_rota_flutter/features/induction/data/induction_markdown.dart';

void main() {
  group('parseInductionMarkdown', () {
    test('extracts public guide images as network blocks', () {
      const raw = '''
Canteen intro.

![Site Facilities](https://example.supabase.co/storage/v1/object/public/induction-guide-images/a.jpeg)

More text.
''';
      final blocks = parseInductionMarkdown(raw);
      expect(blocks, hasLength(3));
      expect(blocks[0], isA<InductionParagraphBlock>());
      final image = blocks[1] as InductionImageBlock;
      expect(image.alt, 'Site Facilities');
      expect(
        image.url,
        'https://example.supabase.co/storage/v1/object/public/induction-guide-images/a.jpeg',
      );
      expect(blocks[2], isA<InductionParagraphBlock>());
    });

    test('parses lists and horizontal rules', () {
      const raw = '''
* tyre condition
* working lights

---

After the rule.
''';
      final blocks = parseInductionMarkdown(raw);
      expect(blocks[0], isA<InductionListBlock>());
      expect((blocks[0] as InductionListBlock).items, hasLength(2));
      expect(blocks[1], isA<InductionRuleBlock>());
      expect(blocks[2], isA<InductionParagraphBlock>());
    });
  });

  group('parseInductionInline', () {
    test('parses soft color tokens used in the guide', () {
      const raw =
          'Only *standard ::color-warning[yellow] diesel* and ::color-danger[red diesel]. '
          '::color-success[Green] is safe.';
      final spans = parseInductionInline(raw);
      final flat = _flatten(spans);
      expect(flat.where((s) => s.kind == InductionInlineKind.color), hasLength(3));
      expect(
        flat
            .where((s) => s.colorToken == 'success')
            .map((s) => s.text)
            .toList(),
        ['Green'],
      );
      expect(
        flat
            .where((s) => s.colorToken == 'danger')
            .map((s) => s.text)
            .toList(),
        ['red diesel'],
      );
      expect(
        flat
            .where((s) => s.colorToken == 'warning')
            .map((s) => s.text)
            .toList(),
        ['yellow'],
      );
    });

    test('parses bold and italic', () {
      final spans = parseInductionInline('**refuelled** and ***enough*** fuel');
      expect(spans[0].kind, InductionInlineKind.bold);
      expect(spans[0].text, 'refuelled');
      expect(spans[2].kind, InductionInlineKind.boldItalic);
      expect(spans[2].text, 'enough');
    });
  });
}

List<InductionInlineSpan> _flatten(List<InductionInlineSpan> spans) {
  final out = <InductionInlineSpan>[];
  for (final span in spans) {
    out.add(span);
    if (span.hasChildren) {
      out.addAll(_flatten(span.children));
    }
  }
  return out;
}
