#!/usr/bin/env bash
set -euo pipefail

dart format --output=none --set-exit-if-changed .
flutter analyze
flutter test
flutter test integration_test -d flutter-tester
dart run tool/perf_slo_check.dart
dart run tool/quality_gate.dart
