import 'dart:async';

typedef MetricRecorder = void Function(String name, Duration duration);

class PerfMetrics {
  const PerfMetrics._();

  static MetricRecorder? recorder;

  static Future<T> track<T>(
    String metricName,
    Future<T> Function() task,
  ) async {
    final stopwatch = Stopwatch()..start();
    try {
      return await task();
    } finally {
      stopwatch.stop();
      recorder?.call(metricName, stopwatch.elapsed);
    }
  }
}
