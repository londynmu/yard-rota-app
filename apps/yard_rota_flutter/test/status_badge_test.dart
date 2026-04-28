import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:yard_rota_flutter/core/theme/app_theme.dart';
import 'package:yard_rota_flutter/core/theme/theme_extensions.dart';
import 'package:yard_rota_flutter/core/ui/status_badge.dart';

void main() {
  testWidgets('uses semantic warning colors from theme extension', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: const Scaffold(
          body: StatusBadge(label: 'WARNING', variant: BadgeVariant.warning),
        ),
      ),
    );

    final context = tester.element(find.byType(StatusBadge));
    final colors = context.appColors;

    final container = tester.widget<Container>(find.byType(Container).first);
    final decoration = container.decoration! as BoxDecoration;

    expect(decoration.color, colors.warningBg);
  });
}
