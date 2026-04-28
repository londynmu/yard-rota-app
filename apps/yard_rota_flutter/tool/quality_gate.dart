import 'dart:io';

final _projectRoot = Directory.current.path;

void main() {
  final libDir = Directory('lib');
  if (!libDir.existsSync()) {
    stderr.writeln('Run this script from apps/yard_rota_flutter.');
    exitCode = 1;
    return;
  }

  final violations = <String>[];
  final requiredFiles = <String>[
    'lib/core/network/network_policy.dart',
    'tool/perf_slo_check.dart',
    'docs/merge_checklist.md',
    'docs/sql_compatibility_checklist.md',
    'docs/supabase_migration_inventory.md',
    'docs/CHANGE_AUDIT.md',
    'docs/DB_IMPACT.md',
    'docs/ROLLBACK_PLAYBOOK.md',
  ];

  for (final path in requiredFiles) {
    if (!File(path).existsSync()) {
      violations.add('$path: required quality/performance file is missing');
    }
  }

  for (final entity in libDir.listSync(recursive: true)) {
    if (entity is! File || !entity.path.endsWith('.dart')) {
      continue;
    }

    final normalizedPath = entity.path.replaceAll('\\', '/');
    final relativePath = normalizedPath.replaceFirst('$_projectRoot/', '');

    final content = entity.readAsStringSync();

    final allowHardcodedColor =
        relativePath.startsWith('lib/core/theme/app_tokens.dart') ||
        relativePath.startsWith('lib/core/theme/app_theme.dart') ||
        relativePath.startsWith('lib/core/theme/theme_extensions.dart');

    if (!allowHardcodedColor && content.contains('Color(0x')) {
      violations.add('$relativePath: contains forbidden Color(0x...) usage');
    }

    if (RegExp(r'[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]').hasMatch(content)) {
      violations.add(
        '$relativePath: contains Polish characters in UI/code strings',
      );
    }
  }

  if (violations.isNotEmpty) {
    stderr.writeln('Quality gate failed:');
    for (final line in violations) {
      stderr.writeln('- $line');
    }
    exitCode = 1;
    return;
  }

  stdout.writeln('Quality gate passed.');
}
