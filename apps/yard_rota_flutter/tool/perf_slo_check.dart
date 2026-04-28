import 'dart:io';

void main() {
  final policyFile = File('lib/core/network/network_policy.dart');
  final readmeFile = File('README.md');
  final checklistFile = File('docs/merge_checklist.md');

  final violations = <String>[];

  if (!policyFile.existsSync()) {
    violations.add('Missing network policy file.');
  } else {
    final content = policyFile.readAsStringSync();
    if (!content.contains('startupInteractiveSlo')) {
      violations.add('startupInteractiveSlo is not defined.');
    }
    if (!content.contains('loginToCalendarSlo')) {
      violations.add('loginToCalendarSlo is not defined.');
    }
    if (!content.contains('monthSwitchCachedSlo')) {
      violations.add('monthSwitchCachedSlo is not defined.');
    }
    if (!content.contains('maxRetryAttempts')) {
      violations.add('maxRetryAttempts is not defined.');
    }
    if (!content.contains('requestTimeout')) {
      violations.add('requestTimeout is not defined.');
    }
  }

  if (!readmeFile.existsSync()) {
    violations.add('README.md is missing.');
  } else {
    final content = readmeFile.readAsStringSync();
    if (!content.contains('## Hard Performance Rules')) {
      violations.add('README does not include Hard Performance Rules.');
    }
    if (!content.contains('## Performance SLO')) {
      violations.add('README does not include Performance SLO.');
    }
  }

  if (!checklistFile.existsSync()) {
    violations.add('docs/merge_checklist.md is missing.');
  }

  if (violations.isNotEmpty) {
    stderr.writeln('Performance SLO check failed:');
    for (final violation in violations) {
      stderr.writeln('- $violation');
    }
    exitCode = 1;
    return;
  }

  stdout.writeln('Performance SLO check passed.');
}
